package launcher

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

const (
	ModeDev     = "dev"
	ModeArchive = "archive"
)

// These vars are overridden at link time via GoReleaser ldflags -X so each
// platform binary carries its own real identity. Keeping them as vars (not
// consts) is required for -X injection.
var (
	assetSchemaVersion = "1"
	launcherVersion    = "0.0.0"
	gitCommit          = ""
	buildDate          = ""
)

type Options struct {
	Args           []string
	WorkDir        string
	ExecutablePath string
	Stdin          io.Reader
	Stdout         io.Writer
	Stderr         io.Writer
	Runner         Runner
}

type Runner interface {
	Run(context.Context, CommandSpec) (int, error)
}

type CommandSpec struct {
	Path   string
	Args   []string
	Dir    string
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
}

type ResolveInput struct {
	WorkDir        string
	ExecutablePath string
}

type EngineResolution struct {
	Mode       string         `json:"mode"`
	EnginePath string         `json:"enginePath"`
	Metadata   *AssetMetadata `json:"metadata,omitempty"`
}

type AssetMetadata struct {
	LauncherVersion      string `json:"launcherVersion"`
	EnginePackageVersion string `json:"enginePackageVersion"`
	AssetSchemaVersion   string `json:"assetSchemaVersion"`
	RuntimeKind          string `json:"runtimeKind"`
	Platform             string `json:"platform"`
	GitCommit            string `json:"gitCommit,omitempty"`
	BuildDate            string `json:"buildDate,omitempty"`
}

type execRunner struct{}

func Run(ctx context.Context, opts Options) int {
	stdout := opts.Stdout
	if stdout == nil {
		stdout = os.Stdout
	}
	stderr := opts.Stderr
	if stderr == nil {
		stderr = os.Stderr
	}
	stdin := opts.Stdin
	if stdin == nil {
		stdin = os.Stdin
	}
	workDir := opts.WorkDir
	if workDir == "" {
		if cwd, err := os.Getwd(); err == nil {
			workDir = cwd
		}
	}

	resolution, err := ResolveEngine(ResolveInput{WorkDir: workDir, ExecutablePath: opts.ExecutablePath})
	if err != nil {
		fmt.Fprintf(stderr, "rai launcher: %v\n", err)
		return 1
	}

	if len(opts.Args) > 0 && opts.Args[0] == "version" {
		return writeVersion(stdout, resolution)
	}

	runner := opts.Runner
	if runner == nil {
		runner = execRunner{}
	}
	code, err := runner.Run(ctx, CommandSpec{
		Path:   "node",
		Args:   append([]string{resolution.EnginePath}, opts.Args...),
		Dir:    workDir,
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
	})
	if err != nil {
		fmt.Fprintf(stderr, "rai launcher: %v\n", err)
		return 1
	}
	return code
}

func ResolveEngine(input ResolveInput) (EngineResolution, error) {
	workDir := input.WorkDir
	if workDir == "" {
		var err error
		workDir, err = os.Getwd()
		if err != nil {
			return EngineResolution{}, err
		}
	}
	if root, enginePath, ok := findDevEngine(workDir); ok {
		_ = root
		return EngineResolution{Mode: ModeDev, EnginePath: enginePath}, nil
	}

	exePath := input.ExecutablePath
	if exePath == "" {
		if resolved, err := os.Executable(); err == nil {
			exePath = resolved
		}
	}
	if exePath != "" {
		// Resolve symlinks so archive-mode resolution works when the binary is
		// reached through a symlink (e.g. Homebrew links bin/rai -> libexec/rai).
		// Without this, filepath.Dir would point at the symlink's directory
		// (bin/) instead of the real payload location (libexec/), and the
		// sibling lib/rai/** engine would not be found.
		if real, err := filepath.EvalSymlinks(exePath); err == nil {
			exePath = real
		}
		return resolveArchive(filepath.Dir(exePath))
	}

	return EngineResolution{}, fmt.Errorf("engine not found: expected packages/cli/dist/index.js from %s", workDir)
}

func (execRunner) Run(ctx context.Context, spec CommandSpec) (int, error) {
	cmd := exec.CommandContext(ctx, spec.Path, spec.Args...)
	cmd.Dir = spec.Dir
	cmd.Stdin = spec.Stdin
	cmd.Stdout = spec.Stdout
	cmd.Stderr = spec.Stderr

	if err := cmd.Start(); err != nil {
		return 1, err
	}
	forwardSignals(cmd)
	err := cmd.Wait()
	if err == nil {
		return 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), nil
	}
	return 1, err
}

func findDevEngine(start string) (string, string, bool) {
	current, err := filepath.Abs(start)
	if err != nil {
		return "", "", false
	}
	for {
		engine := filepath.Join(current, "packages", "cli", "dist", "index.js")
		if fileExists(engine) {
			return current, engine, true
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", "", false
		}
		current = parent
	}
}

func resolveArchive(root string) (EngineResolution, error) {
	engine := filepath.Join(root, "lib", "rai", "engine", "packages", "cli", "dist", "index.js")
	if !fileExists(engine) {
		return EngineResolution{}, fmt.Errorf("engine not found: expected packages/cli/dist/index.js or %s", engine)
	}
	metadataPath := filepath.Join(root, "lib", "rai", "metadata.json")
	metadata, err := readMetadata(metadataPath)
	if err != nil {
		return EngineResolution{}, err
	}
	nodeModulesDir := filepath.Join(root, "lib", "rai", "engine", "node_modules")
	if err := validateMetadata(metadata, nodeModulesDir); err != nil {
		return EngineResolution{}, err
	}
	return EngineResolution{Mode: ModeArchive, EnginePath: engine, Metadata: &metadata}, nil
}

func readMetadata(path string) (AssetMetadata, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return AssetMetadata{}, fmt.Errorf("metadata.json unavailable at %s: %w", path, err)
	}
	var metadata AssetMetadata
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return AssetMetadata{}, fmt.Errorf("metadata.json invalid: %w", err)
	}
	return metadata, nil
}

// validateMetadata checks asset compatibility before spawning Node. It accepts
// nodeModulesDir, the path to the node_modules/ tree co-located with the
// engine bundle. When nodeModulesDir exists, validateMetadata runs the arch
// guard (see below). When it is absent or does not exist as a directory, the
// guard is skipped (S1-era archives without per-arch natives are still valid).
func validateMetadata(metadata AssetMetadata, nodeModulesDir string) error {
	if metadata.AssetSchemaVersion != assetSchemaVersion {
		return fmt.Errorf("asset schema mismatch: launcher supports %s, assets declare %s", assetSchemaVersion, metadata.AssetSchemaVersion)
	}
	// Static metadata.Platform equality check intentionally removed.
	//
	// Why: GoReleaser OSS cannot template archive file CONTENTS (Pro-only
	// feature), so a single metadata.json written by the prepare hook on the
	// build host (linux/amd64) was copied verbatim into all 6 platform archives.
	// The check `metadata.Platform == runtime.GOOS+"/"+runtime.GOARCH` then
	// rejected every non-linux/amd64 install with "platform mismatch".
	//
	// The check was self-defeating: the archive binary IS compiled for the target
	// arch — a wrong-arch binary cannot exec at all (SIGKILL / exec format error),
	// so it never reaches this code. The check compared metadata (static, written
	// on build host) against runtime (always the running platform) — it could
	// never catch a real mismatch while being the sole failure source for all
	// foreign-arch installs.
	//
	// Do not restore THIS form (static-metadata equality). The arch guard below
	// replaces it: it derives the native arch from the bundled sqlite-vec-<os>-<arch>
	// directory name (present only in S2+ archives) and compares it against the
	// binary's own build target (runtime.GOOS/runtime.GOARCH, set by the Go
	// toolchain — correct because GoReleaser cross-compiles one binary per arch).
	if metadata.EnginePackageVersion == "" || metadata.LauncherVersion == "" {
		return fmt.Errorf("metadata missing launcherVersion or enginePackageVersion")
	}
	return validateArchGuard(nodeModulesDir)
}

// goArchToNpmArch maps a Go GOARCH token to the npm arch token used by
// sqlite-vec directory names (e.g. amd64 → x64). arm64 is identical in
// both namespaces and needs no mapping.
//
// sqlite-vec uses <os>-x64 / <os>-arm64 (npm tokens), not <os>-amd64 (Go token).
// GoReleaser cross-compiles one binary per arch, so runtime.GOARCH is always the
// correct build target — but it must be normalised before comparing against the
// npm-named directory in the archive.
func goArchToNpmArch(goarch string) string {
	if goarch == "amd64" {
		return "x64"
	}
	return goarch
}

// validateArchGuard detects the bundled native arch from the sqlite-vec-<os>-<arch>
// directory inside nodeModulesDir and compares it against the binary's own build
// target (runtime.GOOS / runtime.GOARCH, set by the Go toolchain at compile time —
// correct because GoReleaser cross-compiles one binary per arch).
//
// The dir names use npm tokens (x64, arm64) so runtime.GOARCH is normalised via
// goArchToNpmArch before comparing.
//
// The guard is skipped when nodeModulesDir does not exist, making it backwards-
// compatible with S1-era archives that carry no per-arch native tree.
//
// MUST NOT use metadata.json Platform field — that field is written by the build
// host and may mismatch for valid installs (see removed check above).
func validateArchGuard(nodeModulesDir string) error {
	return validateArchGuardFor(nodeModulesDir, runtime.GOOS, runtime.GOARCH)
}

// validateArchGuardFor is the testable core of validateArchGuard; it accepts
// explicit binaryOS and binaryGOARCH so tests can simulate any build target
// without recompiling.
func validateArchGuardFor(nodeModulesDir, binaryOS, binaryGOARCH string) error {
	info, err := os.Stat(nodeModulesDir)
	if err != nil || !info.IsDir() {
		// node_modules absent — no per-arch natives bundled; skip guard.
		return nil
	}

	entries, err := os.ReadDir(nodeModulesDir)
	if err != nil {
		return fmt.Errorf("arch guard: cannot read node_modules: %w", err)
	}

	// Normalise the binary's Go arch token to the npm arch token that
	// sqlite-vec uses in its package (and directory) names.
	binaryNpmArch := goArchToNpmArch(binaryGOARCH)

	const prefix = "sqlite-vec-"
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		// name is "sqlite-vec-<os>-<npmArch>", e.g. "sqlite-vec-darwin-x64"
		rest := name[len(prefix):]
		// Split on last "-" to separate os from npm arch token.
		idx := strings.LastIndex(rest, "-")
		if idx < 0 {
			continue
		}
		detectedOS := rest[:idx]
		detectedNpmArch := rest[idx+1:]
		if detectedOS != binaryOS || detectedNpmArch != binaryNpmArch {
			return fmt.Errorf(
				"arch mismatch: binary is %s/%s but bundled natives are for %s/%s — reinstall the correct platform archive",
				binaryOS, binaryGOARCH, detectedOS, detectedNpmArch,
			)
		}
		// Matching native dir found — guard passes.
		return nil
	}

	// No sqlite-vec-* dir found — no per-arch native marker present; skip guard.
	return nil
}

func writeVersion(stdout io.Writer, resolution EngineResolution) int {
	engineVersion := "dev"
	if resolution.Metadata != nil {
		engineVersion = resolution.Metadata.EnginePackageVersion
	}
	payload := map[string]any{
		"launcherVersion":      launcherVersion,
		"enginePackageVersion": engineVersion,
		"mode":                 resolution.Mode,
		"runtimeKind":          "system-node",
		"platform":             runtime.GOOS + "/" + runtime.GOARCH,
	}
	if gitCommit != "" {
		payload["gitCommit"] = gitCommit
	}
	if buildDate != "" {
		payload["buildDate"] = buildDate
	}
	if resolution.Metadata != nil {
		payload["assetSchemaVersion"] = resolution.Metadata.AssetSchemaVersion
		payload["runtimeKind"] = resolution.Metadata.RuntimeKind
	}
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return 1
	}
	_, _ = stdout.Write(append(encoded, '\n'))
	return 0
}

func forwardSignals(cmd *exec.Cmd) {
	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		defer signal.Stop(sigCh)
		for sig := range sigCh {
			if cmd.Process == nil {
				return
			}
			_ = cmd.Process.Signal(sig)
		}
	}()
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func IsSupportedCommand(command string) bool {
	command = strings.TrimSpace(command)
	return command == "install" || command == "doctor" || command == "analyze" || command == "mcp" || command == "version"
}
