import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    // Integration tests share one MySQL/Redis; run files one at a time.
    fileParallelism: false,
  },
});
