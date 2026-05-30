import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROUTE_EXT = /\.(js|jsx|ts|tsx)$/;
const NEXT_CONFIG = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"];

export type NextVariant = "app-router" | "pages-router" | "mixed-router";

export interface NextDetectionSignals {
  packageJson: boolean;
  nextConfig: boolean;
  appRouter: boolean;
  pagesRouter: boolean;
  appRouteFiles: string[];
  pagesRouteFiles: string[];
}

export interface NextDetection {
  adapterId: "next";
  rootDir: string;
  variant: NextVariant;
  signals: NextDetectionSignals;
}

export function detectNext(rootDir: string): NextDetection | null {
  const appRouteFiles = routeFiles(join(rootDir, "app"), isAppRouteFile);
  const pagesRouteFiles = routeFiles(join(rootDir, "pages"), isPagesRouteFile);
  const signals: NextDetectionSignals = {
    packageJson: hasNextDependency(rootDir),
    nextConfig: NEXT_CONFIG.some((file) => existsSync(join(rootDir, file))),
    appRouter: appRouteFiles.length > 0,
    pagesRouter: pagesRouteFiles.length > 0,
    appRouteFiles,
    pagesRouteFiles,
  };

  if (!signals.appRouter && !signals.pagesRouter) return null;
  return {
    adapterId: "next",
    rootDir,
    variant: variantFor(signals),
    signals,
  };
}

function variantFor(signals: NextDetectionSignals): NextVariant {
  if (signals.appRouter && signals.pagesRouter) return "mixed-router";
  return signals.appRouter ? "app-router" : "pages-router";
}

function hasNextDependency(rootDir: string): boolean {
  const file = join(rootDir, "package.json");
  if (!existsSync(file)) return false;
  const pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((key) => {
    const deps = pkg[key];
    return !!deps && typeof deps === "object" && "next" in deps;
  });
}

function routeFiles(rootDir: string, include: (relativeFile: string) => boolean): string[] {
  if (!existsSync(rootDir)) return [];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        const rel = normalizePath(relative(rootDir, full));
        if (include(rel)) files.push(rel);
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

function isAppRouteFile(file: string): boolean {
  const base = file.split("/").at(-1) ?? "";
  return /^(page|layout)\.(js|jsx|ts|tsx)$/.test(base);
}

function isPagesRouteFile(file: string): boolean {
  if (!ROUTE_EXT.test(file)) return false;
  if (file.startsWith("api/")) return false;
  const base = file.split("/").at(-1) ?? "";
  return !base.startsWith("_");
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}
