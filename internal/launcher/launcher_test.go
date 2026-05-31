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

func TestArchiveMetadataMissingAndMismatchFailBeforeExecution(t *testing.T) {
	for _, tt := range []struct {
		name     string
		metadata string
		want     string
	}{
		{name: "missing", metadata: "", want: "metadata.json"},
		{name: "schema mismatch", metadata: strings.ReplaceAll(validMetadata(), `"assetSchemaVersion":"1"`, `"assetSchemaVersion":"2"`), want: "asset schema"},
		{name: "platform mismatch", metadata: strings.ReplaceAll(validMetadata(), runtime.GOOS+"/"+runtime.GOARCH, "plan9/wasm"), want: "platform"},
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
