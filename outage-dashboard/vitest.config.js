import { defineConfig } from "vitest/config";

// The logic modules and test files use CommonJS (require / module.exports) so
// they also load over file:// in the browser. Enabling globals lets the test
// files use describe/it/expect without importing the Vitest API (which cannot
// be pulled in via require from a CommonJS module).
export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.js"],
    // Give jsdom a concrete (non-opaque) origin and install an in-memory
    // localStorage polyfill (the bundled jsdom does not provide one) so tests
    // can exercise the localStorage-backed PSAP status store.
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    setupFiles: ["tests/setup.js"],
  },
});
