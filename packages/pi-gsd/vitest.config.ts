import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["extensions/**/*.test.ts"],
  },
});
