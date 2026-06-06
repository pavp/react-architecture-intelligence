import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectConfig, ProjectConfigError, PROJECT_CONFIG_FILENAME } from "./project-config.js";
import { resolveConfig } from "@rai/core";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-cfg-test-"));
  dirs.push(dir);
  return dir;
}

test("absent rai.config.json returns empty object {}", () => {
  const dir = makeTmp();
  const result = loadProjectConfig(dir);
  expect(result).toEqual({});
});

test("PROJECT_CONFIG_FILENAME constant is 'rai.config.json'", () => {
  expect(PROJECT_CONFIG_FILENAME).toBe("rai.config.json");
});

test("valid partial config is parsed and returned", () => {
  const dir = makeTmp();
  writeFileSync(join(dir, "rai.config.json"), JSON.stringify({ shared: { minInstances: 5 } }));
  const result = loadProjectConfig(dir);
  expect(result).toEqual({ shared: { minInstances: 5 } });
});

test("valid partial config integrates with resolveConfig", () => {
  const dir = makeTmp();
  writeFileSync(join(dir, "rai.config.json"), JSON.stringify({ shared: { minInstances: 7 } }));
  const cfg = resolveConfig(loadProjectConfig(dir));
  expect(cfg.shared.minInstances).toBe(7);
  // Other defaults preserved
  expect(cfg.shared.minCosine).toBe(0.75);
});

test("BC-1a: absent config → resolveConfig(loadProjectConfig(dir)) deep-equals resolveConfig({})", () => {
  const dir = makeTmp();
  const withLoader = resolveConfig(loadProjectConfig(dir));
  const withoutLoader = resolveConfig({});
  expect(withLoader).toEqual(withoutLoader);
});

test("malformed JSON throws ProjectConfigError (not raw SyntaxError)", () => {
  const dir = makeTmp();
  writeFileSync(join(dir, "rai.config.json"), "{ this is not json }");
  expect(() => loadProjectConfig(dir)).toThrowError(ProjectConfigError);
});

test("ProjectConfigError message names the filename", () => {
  const dir = makeTmp();
  writeFileSync(join(dir, "rai.config.json"), "{ bad json");
  try {
    loadProjectConfig(dir);
    expect.fail("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(ProjectConfigError);
    expect((e as ProjectConfigError).message).toContain("rai.config.json");
  }
});

test("ProjectConfigError is not a raw stack trace", () => {
  const dir = makeTmp();
  writeFileSync(join(dir, "rai.config.json"), "null");
  // null parses as valid JSON but invalid config shape → should throw
  expect(() => loadProjectConfig(dir)).toThrowError(ProjectConfigError);
});
