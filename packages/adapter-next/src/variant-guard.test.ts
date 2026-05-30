import { expect, test } from "vitest";
import { guardNextVariant } from "./variant-guard.js";
import type { NextDetection } from "./detect.js";

const detection: NextDetection = {
  adapterId: "next",
  rootDir: ".",
  variant: "pages-router",
  signals: {
    packageJson: true,
    nextConfig: false,
    appRouter: false,
    pagesRouter: true,
    appRouteFiles: [],
    pagesRouteFiles: ["index.tsx"],
  },
};

test("guardNextVariant allows supported variants", () => {
  expect(guardNextVariant({ detection, analyzerId: "next/route-coupling", supportedVariants: ["pages-router"] })).toEqual({ status: "ok" });
});

test("guardNextVariant returns variant-mismatch diagnostic for unsupported variants", () => {
  const result = guardNextVariant({ detection, analyzerId: "next/client-boundary-bloat", supportedVariants: ["app-router"] });

  expect(result).toEqual({
    status: "skipped",
    diagnostic: {
      kind: "variant-mismatch",
      adapterId: "next",
      analyzerId: "next/client-boundary-bloat",
      detectedVariant: "pages-router",
      supportedVariants: ["app-router"],
      rootDir: ".",
      message: "next/client-boundary-bloat supports app-router, detected pages-router",
    },
  });
});

test("guardNextVariant treats mixed-router as explicit unsupported variant", () => {
  const mixed = { ...detection, variant: "mixed-router" as const };
  const result = guardNextVariant({ detection: mixed, analyzerId: "next/client-boundary-bloat", supportedVariants: ["app-router"] });

  expect(result.status).toBe("skipped");
  expect(result.status === "skipped" ? result.diagnostic.detectedVariant : "").toBe("mixed-router");
});
