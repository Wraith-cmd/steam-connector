import { describe, expect, it } from "vitest";
import { decodeEntities, minutesToHours, unixToDate } from "../src/format.js";

describe("minutesToHours", () => {
  it.each([
    [0, 0],
    [1, 0], // 0.0167 hours rounds to 0
    [3, 0.1], // 0.05 rounds up
    [59, 1],
    [60, 1],
    [90, 1.5],
    [125, 2.1],
    [6005, 100.1],
    [123456, 2057.6],
  ])("%i minutes is %d hours", (minutes, hours) => {
    expect(minutesToHours(minutes)).toBe(hours);
  });

  it("treats missing or negative values as 0", () => {
    expect(minutesToHours(undefined)).toBe(0);
    expect(minutesToHours(-30)).toBe(0);
  });
});

describe("unixToDate", () => {
  it("formats a Unix timestamp as YYYY-MM-DD", () => {
    expect(unixToDate(1735689600)).toBe("2025-01-01");
  });

  it("returns null for games that were never played", () => {
    expect(unixToDate(0)).toBeNull();
    expect(unixToDate(undefined)).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("decodes common HTML entities", () => {
    expect(decodeEntities("&quot;Hi&quot; &amp; it&#39;s &lt;3&gt;")).toBe(`"Hi" & it's <3>`);
  });
});
