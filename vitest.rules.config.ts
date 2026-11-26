import path from "node:path";
import { defineConfig } from "vitest/config";

// Security-rules, data-layer and sync tests run in Node against the Firebase emulators:
//   npm run test:emulators
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: { "import.meta.env.VITE_USE_EMULATORS": JSON.stringify("true") },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 40_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
