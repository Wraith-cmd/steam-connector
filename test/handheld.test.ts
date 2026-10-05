import { describe, expect, it } from "vitest";
import { handheldVerdict } from "../src/handheld.js";
import { mapLimited } from "../src/http.js";
import { describeDeckNote } from "../src/store.js";

const deck = (category: 0 | 1 | 2 | 3) => ({ category, notes: [] });

describe("handheldVerdict", () => {
  it.each([
    [3, "none", true, "Great"],
    [2, "full", true, "Good"],
    [2, "partial", true, "Playable with tweaks"],
    [1, "full", true, "Likely fine on Windows handhelds"],
    [1, "full", false, "Not handheld friendly"],
    [1, "none", true, "Not handheld friendly"],
    [0, "full", true, "Good"],
    [0, "partial", true, "Playable with tweaks"],
    [0, "none", true, "Unknown"],
  ] as const)("Deck %i + %s controller (Windows: %s) -> %s", (category, controller, onWindows, rating) => {
    expect(handheldVerdict(deck(category), controller, onWindows).rating).toBe(rating);
  });
});

describe("describeDeckNote", () => {
  it("turns Valve's note names into plain English", () => {
    expect(describeDeckNote("#SteamDeckVerified_TestResult_DefaultControllerConfigFullyFunctional")).toBe(
      "Default controller config fully functional",
    );
    expect(describeDeckNote(undefined)).toBeNull();
  });
});

describe("mapLimited", () => {
  it("keeps results in order and never runs more than the limit at once", async () => {
    let running = 0;
    let maxRunning = 0;
    const results = await mapLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return n * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maxRunning).toBe(3);
  });
});
