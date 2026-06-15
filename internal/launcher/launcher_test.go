package launcher

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

type recordingRunner struct {
	exitCode int
	stdout   string
	stderr   string
	calls    []CommandSpec
}

func (r *recordingRunner) Run(_ context.Context, spec CommandSpec) (int, error) {
	r.calls = append(r.calls, spec)
	_, _ = spec.Stdout.Write([]byte(r.stdout))
	_, _ = spec.Stderr.Write([]byte(r.stderr))
	return r.exitCode, nil
}

func TestDelegatesSupportedCommandsWithUnchangedArgs(t *testing.T) {
	root := buildDevEngine(t)
	for _, tt := range []struct {
		name string
		args []string
	}{
		{name: "install", args: []string{"install", "--dry-run", "--platform", "opencode", "."}},
		{name: "doctor", args: []string{"doctor", ".", "--json"}},
		{name: "analyze", args: []string{"analyze", "fixtures/duplication/buttons"}},
		{name: "mcp", args: []string{"mcp", "."}},
		{name: "unknown command", args: []string{"frobnicate"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			runner := &recordingRunner{}
			code := Run(context.Background(), Options{Args: tt.args, WorkDir: root, Stdout: &bytes.Buffer{}, Stderr: &bytes.Buffer{}, Runner: runner})
			if code != 0 {
				t.Fatalf("exit = %d, want 0", code)
			}
			if len(runner.calls) != 1 {
				t.Fatalf("calls = %d, want 1", len(runner.calls))
			}
			call := runner.calls[0]
			if call.Path != "node" {
				t.Fatalf("path = %q, want node", call.Path)
			}
			want := append([]string{filepath.Join(root, "packages", "cli", "dist", "index.js")}, tt.args...)
			if !reflect.DeepEqual(call.Args, want) {
				t.Fatalf("args = %#v, want %#v", call.Args, want)
			}
		})
	}
}

func TestStdioPassthroughAndExitPropagation(t *testing.T) {
	root := buildDevEngine(t)
	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	runner := &recordingRunner{exitCode: 7, stdout: `{"jsonrpc":"2.0"}` + "\n", stderr: "engine warning\n"}

	code := Run(context.Background(), Options{Args: []string{"mcp", "."}, WorkDir: root, Stdout: stdout, Stderr: stderr, Runner: runner})

	if code != 7 {
		t.Fatalf("exit = %d, want 7", code)
	}
	if got := stdout.String(); got != runner.stdout {
		t.Fatalf("stdout = %q, want child stdout only %q", got, runner.stdout)
	}
	if got := stderr.String(); got != runner.stderr {
		t.Fatalf("stderr = %q, want child stderr only %q", got, runner.stderr)
	}
}

func TestLauncherDiagnosticsUseStderrOnlyBeforeChildExecution(t *testing.T) {
	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	runner := &recordingRunner{}

	code := Run(context.Background(), Options{Args: []string{"doctor", "."}, WorkDir: t.TempDir(), Stdout: stdout, Stderr: stderr, Runner: runner})

	if code != 1 {
		t.Fatalf("exit = %d, want 1", code)
	}
	if stdout.Len() != 0 {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	if !strings.Contains(stderr.String(), "packages/cli/dist/index.js") {
		t.Fatalf("stderr = %q, want missing engine diagnostic", stderr.String())
	}
	if len(runner.calls) != 0 {
		t.Fatalf("child executed %d times, want 0", len(runner.calls))
	}
}

func TestResolvesDevAndArchiveEnginePaths(t *testing.T) {
	devRoot := buildDevEngine(t)
	dev, err := ResolveEngine(ResolveInput{WorkDir: filepath.Join(devRoot, "nested")})
	if err != nil {
		t.Fatalf("dev resolve error: %v", err)
	}
	if dev.Mode != ModeDev || dev.EnginePath != filepath.Join(devRoot, "packages", "cli", "dist", "index.js") {
		t.Fatalf("dev resolve = %#v", dev)
	}

	archiveRoot := buildArchiveEngine(t, validMetadata())
	archive, err := ResolveEngine(ResolveInput{WorkDir: t.TempDir(), ExecutablePath: filepath.Join(archiveRoot, binName())})
	if err != nil {
		t.Fatalf("archive resolve error: %v", err)
	}
	if archive.Mode != ModeArchive || archive.EnginePath != filepath.Join(archiveRoot, "lib", "rai", "engine", "packages", "cli", "dist", "index.js") {
		t.Fatalf("archive resolve = %#v", archive)
	}
}

// Homebrew installs the archive into libexec/ and symlinks bin/rai ->
// libexec/rai. The launcher must resolve the symlink to find the engine
// payload sibling to the REAL binary, not sibling to the symlink.
func TestResolvesArchiveEngineThroughSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires privilege on Windows; Homebrew layout is POSIX-only")
	}
	archiveRoot := buildArchiveEngine(t, validMetadata())
	realBin := filepath.Join(archiveRoot, binName())
	mustWrite(t, realBin, "")

	binDir := t.TempDir()
	link := filepath.Join(binDir, binName())
	if err := os.Symlink(realBin, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	resolved, err := ResolveEngine(ResolveInput{WorkDir: t.TempDir(), ExecutablePath: link})
	if err != nil {
		t.Fatalf("symlinked archive resolve error: %v", err)
	}
	// Canonicalize the expected root too: on macOS t.TempDir() lives under
	// /var/folders which is itself a symlink to /private/var, and the launcher
	// resolves the binary through EvalSymlinks, so both sides must be canonical.
	canonRoot, err := filepath.EvalSymlinks(archiveRoot)
	if err != nil {
		t.Fatalf("evalsymlinks archiveRoot: %v", err)
	}
	wantEngine := filepath.Join(canonRoot, "lib", "rai", "engine", "packages", "cli", "dist", "index.js")
	if resolved.Mode != ModeArchive || resolved.EnginePath != wantEngine {
		t.Fatalf("symlinked archive resolve = %#v, want engine %s", resolved, wantEngine)
	}
}

func TestArchiveMetadataMissingAndMismatchFailBeforeExecution(t *testing.T) {
	for _, tt := range []struct {
		name     string
		metadata string
		want     string
	}{
		{name: "missing", metadata: "", want: "metadata.json"},
		{name: "schema mismatch", metadata: strings.ReplaceAll(validMetadata(), `"assetSchemaVersion":"1"`, `"assetSchemaVersion":"2"`), want: "asset schema"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			archiveRoot := buildArchiveEngine(t, tt.metadata)
			stdout := &bytes.Buffer{}
			stderr := &bytes.Buffer{}
			runner := &recordingRunner{}

			code := Run(context.Background(), Options{Args: []string{"doctor", "."}, WorkDir: t.TempDir(), ExecutablePath: filepath.Join(archiveRoot, binName()), Stdout: stdout, Stderr: stderr, Runner: runner})

			if code != 1 {
				t.Fatalf("exit = %d, want 1", code)
			}
			if stdout.Len() != 0 {
				t.Fatalf("stdout = %q, want empty", stdout.String())
			}
			if !strings.Contains(stderr.String(), tt.want) {
				t.Fatalf("stderr = %q, want %q", stderr.String(), tt.want)
			}
			if len(runner.calls) != 0 {
				t.Fatalf("child executed %d times, want 0", len(runner.calls))
			}
		})
	}
}

// Platform field in metadata is no longer validated. A foreign-platform
// metadata.json (e.g. linux/amd64 metadata inside a darwin/arm64 archive, which
// happened in v0.2.1 because GoReleaser OSS cannot template archive file
// contents) must no longer block installation. The binary itself IS compiled for
// the correct arch; a wrong-arch binary fails exec before reaching this code.
func TestPlatformMismatchInMetadataNoLongerBlocksResolution(t *testing.T) {
	foreignPlatformMetadata := strings.ReplaceAll(validMetadata(), runtime.GOOS+"/"+runtime.GOARCH, "plan9/wasm")
	archiveRoot := buildArchiveEngine(t, foreignPlatformMetadata)
	runner := &recordingRunner{}

	code := Run(context.Background(), Options{
		Args:           []string{"doctor", "."},
		WorkDir:        t.TempDir(),
		ExecutablePath: filepath.Join(archiveRoot, binName()),
		Stdout:         &bytes.Buffer{},
		Stderr:         &bytes.Buffer{},
		Runner:         runner,
	})

	// Resolution must succeed (engine found, metadata valid); the runner records
	// one call because the engine is executed.
	if code != 0 {
		t.Fatalf("exit = %d, want 0 (platform mismatch must no longer be an error)", code)
	}
	if len(runner.calls) != 1 {
		t.Fatalf("child executed %d times, want 1", len(runner.calls))
	}
}

func TestVersionReportsCoherentMetadataWithoutStartingEngine(t *testing.T) {
	root := buildArchiveEngine(t, validMetadata())
	stdout := &bytes.Buffer{}
	runner := &recordingRunner{}

	code := Run(context.Background(), Options{Args: []string{"version"}, WorkDir: t.TempDir(), ExecutablePath: filepath.Join(root, binName()), Stdout: stdout, Stderr: &bytes.Buffer{}, Runner: runner})

	if code != 0 {
		t.Fatalf("exit = %d, want 0", code)
	}
	if !strings.Contains(stdout.String(), `"mode": "archive"`) || !strings.Contains(stdout.String(), `"enginePackageVersion": "0.0.0"`) {
		t.Fatalf("version output = %s", stdout.String())
	}
	if len(runner.calls) != 0 {
		t.Fatalf("child executed %d times, want 0", len(runner.calls))
	}
}

// goArchToNpm maps a Go GOARCH token to the npm arch token used by sqlite-vec
// and oxc package names (e.g. amd64 → x64). arm64 needs no mapping.
func goArchToNpm(goarch string) string {
	if goarch == "amd64" {
		return "x64"
	}
	return goarch
}

// TestArchGuard verifies that the arch guard in validateArchGuard correctly
// accepts matching native arch (using the real npm token, e.g. x64 for amd64),
// rejects mismatched native arch, and skips the check when node_modules/ is absent.
//
// The sqlite-vec packages published on npm use <os>-x64 / <os>-arm64 (npm tokens),
// NOT <os>-amd64 (Go token). The guard must normalise before comparing.
func TestArchGuard(t *testing.T) {
	hostGOOS := runtime.GOOS
	hostGOARCH := runtime.GOARCH
	hostNpmArch := goArchToNpm(hostGOARCH)

	// Foreign combo: guaranteed different from the host.
	foreignGOOS := "linux"
	foreignNpmArch := "x64"
	if hostGOOS == "linux" && hostGOARCH == "amd64" {
		foreignGOOS = "darwin"
		foreignNpmArch = "arm64"
	} else if hostGOOS == "linux" && hostGOARCH == "arm64" {
		foreignGOOS = "darwin"
		foreignNpmArch = "x64"
	}

	for _, tt := range []struct {
		name          string
		nmSetup       func(t *testing.T, nmDir string) // populates node_modules/ for this case
		wantErrSubstr string                            // empty means expect nil error
	}{
		{
			// The dir name uses the REAL npm arch token (x64 for amd64), not the
			// Go token (amd64). This exercises the guard's token normalisation.
			name: "host arch matches bundled native — guard passes",
			nmSetup: func(t *testing.T, nmDir string) {
				t.Helper()
				dirName := "sqlite-vec-" + hostGOOS + "-" + hostNpmArch
				if err := os.MkdirAll(filepath.Join(nmDir, dirName), 0o755); err != nil {
					t.Fatal(err)
				}
			},
			wantErrSubstr: "",
		},
		{
			name: "foreign arch native present — guard rejects",
			nmSetup: func(t *testing.T, nmDir string) {
				t.Helper()
				dirName := "sqlite-vec-" + foreignGOOS + "-" + foreignNpmArch
				if err := os.MkdirAll(filepath.Join(nmDir, dirName), 0o755); err != nil {
					t.Fatal(err)
				}
			},
			wantErrSubstr: "arch mismatch",
		},
		{
			name:          "node_modules absent — guard skipped",
			nmSetup:       nil, // no node_modules dir created
			wantErrSubstr: "",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			archiveRoot := t.TempDir()
			engineDir := filepath.Join(archiveRoot, "lib", "rai", "engine", "packages", "cli", "dist")
			if err := os.MkdirAll(engineDir, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(engineDir, "index.js"), []byte(""), 0o644); err != nil {
				t.Fatal(err)
			}
			nmDir := filepath.Join(archiveRoot, "lib", "rai", "engine", "node_modules")
			if tt.nmSetup != nil {
				if err := os.MkdirAll(nmDir, 0o755); err != nil {
					t.Fatal(err)
				}
				tt.nmSetup(t, nmDir)
			}
			meta := AssetMetadata{
				LauncherVersion:      "0.0.0",
				EnginePackageVersion: "0.0.0",
				AssetSchemaVersion:   "1",
				RuntimeKind:          "system-node",
				Platform:             hostGOOS + "/" + hostGOARCH,
			}
			err := validateMetadata(meta, nmDir)
			if tt.wantErrSubstr == "" {
				if err != nil {
					t.Fatalf("expected nil error, got: %v", err)
				}
			} else {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstr)
				}
				if !strings.Contains(err.Error(), tt.wantErrSubstr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErrSubstr)
				}
			}
		})
	}

	// Explicit amd64-host simulation: uses validateArchGuardFor so the test
	// covers the npm-token boundary (amd64→x64) on ANY host, including arm64.
	t.Run("simulation: amd64 binary accepts sqlite-vec-darwin-x64", func(t *testing.T) {
		nmDir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(nmDir, "sqlite-vec-darwin-x64"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := validateArchGuardFor(nmDir, "darwin", "amd64"); err != nil {
			t.Fatalf("expected guard to pass for amd64 binary with sqlite-vec-darwin-x64, got: %v", err)
		}
	})

	t.Run("simulation: amd64 binary rejects sqlite-vec-darwin-arm64", func(t *testing.T) {
		nmDir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(nmDir, "sqlite-vec-darwin-arm64"), 0o755); err != nil {
			t.Fatal(err)
		}
		err := validateArchGuardFor(nmDir, "darwin", "amd64")
		if err == nil {
			t.Fatal("expected arch mismatch error, got nil")
		}
		if !strings.Contains(err.Error(), "arch mismatch") {
			t.Fatalf("error %q does not contain 'arch mismatch'", err.Error())
		}
	})

	t.Run("simulation: arm64 binary rejects sqlite-vec-darwin-x64", func(t *testing.T) {
		nmDir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(nmDir, "sqlite-vec-darwin-x64"), 0o755); err != nil {
			t.Fatal(err)
		}
		err := validateArchGuardFor(nmDir, "darwin", "arm64")
		if err == nil {
			t.Fatal("expected arch mismatch error, got nil")
		}
		if !strings.Contains(err.Error(), "arch mismatch") {
			t.Fatalf("error %q does not contain 'arch mismatch'", err.Error())
		}
	})

	t.Run("simulation: arm64 binary accepts sqlite-vec-darwin-arm64", func(t *testing.T) {
		nmDir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(nmDir, "sqlite-vec-darwin-arm64"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := validateArchGuardFor(nmDir, "darwin", "arm64"); err != nil {
			t.Fatalf("expected guard to pass for arm64 binary with sqlite-vec-darwin-arm64, got: %v", err)
		}
	})
}

func buildDevEngine(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "packages", "cli", "dist", "index.js"), "")
	mustWrite(t, filepath.Join(root, "packages", "cli", "package.json"), `{"version":"0.0.0"}`)
	if err := os.MkdirAll(filepath.Join(root, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

func buildArchiveEngine(t *testing.T, metadata string) string {
	t.Helper()
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "lib", "rai", "engine", "packages", "cli", "dist", "index.js"), "")
	if metadata != "" {
		mustWrite(t, filepath.Join(root, "lib", "rai", "metadata.json"), metadata)
	}
	return root
}

func validMetadata() string {
	return `{"launcherVersion":"0.0.0","enginePackageVersion":"0.0.0","assetSchemaVersion":"1","runtimeKind":"system-node","platform":"` + runtime.GOOS + `/` + runtime.GOARCH + `"}`
}

func mustWrite(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func binName() string {
	if runtime.GOOS == "windows" {
		return "rai.exe"
	}
	return "rai"
}
