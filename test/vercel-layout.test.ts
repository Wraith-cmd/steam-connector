// Guards against a deploy-breaking mistake: Vercel's backend presets treat any file
// named app, index, server or main (at the top level or in src/) as the whole app's
// entrypoint. If one exists, every request goes there instead of api/mcp.ts and
// crashes with "Invalid export found in module". Keep those names free.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NAMES = ["app", "index", "server", "main"];
const DIRS = ["", "src/"];
const EXTENSIONS = ["js", "cjs", "mjs", "ts", "cts", "mts"];

describe("Vercel project layout", () => {
  it("has no file Vercel would mistake for a backend entrypoint", () => {
    const found = DIRS.flatMap((dir) =>
      NAMES.flatMap((name) => EXTENSIONS.map((ext) => `${dir}${name}.${ext}`)),
    ).filter((path) => existsSync(path));
    expect(found).toEqual([]);
  });

  it('pins the "Other" framework preset in vercel.json', () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.framework).toBeNull();
  });
});
