// Guards against "Trojan Source" style tricks: invisible or text-direction characters
// in source files can make code look different from what it actually does.
// Write such characters as escapes like \u202E instead.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

describe("source hygiene", () => {
  it("has no invisible or text-direction characters in tracked files", () => {
    const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
    const offenders = files.filter((file) => {
      try {
        return INVISIBLE.test(readFileSync(file, "utf8"));
      } catch {
        return false; // e.g. a file deleted in the working tree
      }
    });
    expect(offenders).toEqual([]);
  });
});
