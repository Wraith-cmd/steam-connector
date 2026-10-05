import { describe, expect, it } from "vitest";
import { handheldVerdict } from "../src/handheld.js";
import { mapLimited } from "../src/http.js";
import { type AppDetails, controllerSupport, describeDeckNote, requirementsToText } from "../src/store.js";

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

describe("controllerSupport", () => {
  const details = (extra: Partial<AppDetails>): AppDetails => ({ name: "Test", steam_appid: 1, ...extra });

  it("uses Steam's controller_support field when present", () => {
    expect(controllerSupport(details({ controller_support: "full" }))).toBe("full");
    expect(controllerSupport(details({ controller_support: "partial" }))).toBe("partial");
  });

  it("falls back to the store categories", () => {
    expect(controllerSupport(details({ categories: [{ description: "Full controller support" }] }))).toBe("full");
    expect(controllerSupport(details({ categories: [{ description: "Partial Controller Support" }] }))).toBe("partial");
    expect(controllerSupport(details({ categories: [{ description: "Single-player" }] }))).toBe("none");
    expect(controllerSupport(details({}))).toBe("none");
  });
});

describe("requirementsToText", () => {
  it("turns Steam's requirements HTML into one line of plain text", () => {
    expect(
      requirementsToText(
        '<strong>Minimum:</strong><br><ul class="bb_ul"><li>Requires a 64-bit processor and operating system<br></li>' +
          "<li><strong>OS:</strong> Windows 10<br></li><li><strong>Storage:</strong> 20 GB available space</li></ul>",
      ),
    ).toBe("Requires a 64-bit processor and operating system; OS: Windows 10; Storage: 20 GB available space");
    expect(requirementsToText(undefined)).toBeNull();
    expect(requirementsToText("<strong>Minimum:</strong><br>")).toBeNull();
  });
});
