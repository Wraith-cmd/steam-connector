import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Undo vi.stubEnv / vi.stubGlobal after every test so tests can't affect each other.
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
