import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Undo vi.stubEnv / vi.stubGlobal after every test so tests can't affect each other.
    unstubEnvs: true,
    unstubGlobals: true,
    // Clear caches and the rate limit before every test.
    setupFiles: ["test/setup.ts"],
  },
});
