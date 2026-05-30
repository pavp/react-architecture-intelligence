import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { detectNext } from "./detect.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rai-next-detect-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  return dir;
}

test("detectNext returns app-router for app route files", () => {
  const dir = repo();
  mkdirSync(join(dir, "app", "dashboard"), { recursive: true });
  writeFileSync(join(dir, "app", "dashboard", "page.tsx"), "export default function Page() { return <main />; }\n");

  const result = detectNext(dir);

  expect(result?.variant).toBe("app-router");
  expect(result?.signals.appRouteFiles).toEqual(["dashboard/page.tsx"]);
  expect(result?.signals.packageJson).toBe(true);
});

test("detectNext returns pages-router and excludes API/meta files", () => {
  const dir = repo();
  mkdirSync(join(dir, "pages", "api"), { recursive: true });
  writeFileSync(join(dir, "pages", "index.tsx"), "export default function Home() { return <main />; }\n");
  writeFileSync(join(dir, "pages", "_app.tsx"), "export default function App() { return null; }\n");
  writeFileSync(join(dir, "pages", "api", "users.ts"), "export function GET() {}\n");

  const result = detectNext(dir);

  expect(result?.variant).toBe("pages-router");
  expect(result?.signals.pagesRouteFiles).toEqual(["index.tsx"]);
});

test("detectNext returns mixed-router when app and pages routers coexist", () => {
  const dir = repo();
  mkdirSync(join(dir, "app"), { recursive: true });
  mkdirSync(join(dir, "pages"), { recursive: true });
  writeFileSync(join(dir, "app", "layout.tsx"), "export default function Layout({ children }) { return children; }\n");
  writeFileSync(join(dir, "pages", "about.tsx"), "export default function About() { return <main />; }\n");

  expect(detectNext(dir)?.variant).toBe("mixed-router");
});

test("detectNext returns null for non-Next repos", () => {
  const dir = mkdtempSync(join(tmpdir(), "rai-next-none-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0" } }));

  expect(detectNext(dir)).toBeNull();
});
