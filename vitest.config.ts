import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@rai/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
  },
});
