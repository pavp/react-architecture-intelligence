import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@rai/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@rai/adapter-next": new URL("./packages/adapter-next/src/index.ts", import.meta.url).pathname,
      "@rai/adapter-react": new URL("./packages/adapter-react/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
  },
});
