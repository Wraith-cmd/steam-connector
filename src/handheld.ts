// Decides how well a game suits a handheld PC: ROG Ally, Legion Go, MSI Claw,
// or Steam Deck. It combines two signals from the Steam store:
//   1. Valve's Steam Deck rating (Verified / Playable / Unsupported / Unknown)
//   2. The developer's controller support listing (full / partial / none)
//
// Steam Deck runs Linux (SteamOS), while most other handhelds run Windows. Many
// games are "Unsupported" on Deck only because of Linux or anti-cheat issues, and
// run fine on a Windows handheld, so the verdict treats that case separately.

import type { DeckRating } from "./store.js";

export type ControllerSupport = "full" | "partial" | "none";

export type HandheldVerdict = {
  rating: "Great" | "Good" | "Playable with tweaks" | "Likely fine on Windows handhelds" | "Not handheld friendly" | "Unknown";
  explanation: string;
};

export const DECK_LABELS = ["Unknown", "Unsupported", "Playable", "Verified"] as const;

export function handheldVerdict(deck: DeckRating, controller: ControllerSupport, onWindows: boolean): HandheldVerdict {
  const fullController = controller === "full";

  if (deck.category === 3) {
    return {
      rating: "Great",
      explanation: "Steam Deck Verified: works with built-in controls and is readable on a small screen.",
    };
  }
  if (deck.category === 2) {
    return fullController
      ? {
          rating: "Good",
          explanation:
            "Steam Deck Playable with full controller support. Might need small tweaks (small text, a launcher, or a setting).",
        }
      : {
          rating: "Playable with tweaks",
          explanation: "Steam Deck Playable: may need the touchscreen, a custom control layout, or squinting at small text.",
        };
  }
  if (deck.category === 1) {
    return fullController && onWindows
      ? {
          rating: "Likely fine on Windows handhelds",
          explanation:
            "Unsupported on Steam Deck (often because of Linux or anti-cheat), but it has full controller support, " +
            "so it usually works on a Windows handheld like the ROG Ally.",
        }
      : {
          rating: "Not handheld friendly",
          explanation: "Unsupported on Steam Deck and no full controller support listed. Expect to need a mouse and keyboard.",
        };
  }
  // Not rated by Valve yet: fall back on controller support.
  if (fullController) {
    return { rating: "Good", explanation: "Not rated for Steam Deck yet, but it lists full controller support." };
  }
  if (controller === "partial") {
    return {
      rating: "Playable with tweaks",
      explanation: "Not rated for Steam Deck yet. Partial controller support, so some menus may need the touchscreen.",
    };
  }
  return {
    rating: "Unknown",
    explanation: "Not rated for Steam Deck and no controller support listed. It may need a mouse and keyboard.",
  };
}
