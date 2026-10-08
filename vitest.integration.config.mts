import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Integration tests against an ISOLATED Supabase (local `supabase start`).
 * Never point these at production: tests/integration/env.ts refuses any
 * non-local URL.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/integration/env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
