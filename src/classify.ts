// Tells games apart from software (Soundpad, Wallpaper Engine, …) and from
// playtests (THE FINALS PLAYTEST, MultiVersus – Technical Test, …).
//
// Steam's owned-games list doesn't say what kind of app each entry is, so we ask
// the store in batches (getStoreItemTypes) and remember the answers for a day.
// If that lookup fails, a short list of well-known software keeps things working.

import { TtlCache } from "./cache.js";
import { getStoreItemTypes } from "./steam.js";

const STORE_TYPE_SOFTWARE = 6;
const STORE_TYPE_BETA = 12;
const STORE_TYPE_TOOL = 13;

/**
 * Fallback for when the store lookup fails: well-known Steam apps that are
 * software, not games. Only add appids you've verified, since a wrong one would
 * hide a real game by default.
 */
export const KNOWN_SOFTWARE_APPIDS = new Set([
  629520, // Soundpad
  431960, // Wallpaper Engine
  1812620, // DSX (DualSense controller tool)
  268850, // EVGA Precision X1
  325180, // AppGameKit Classic
  266310, // GameGuru Classic
  250820, // SteamVR
]);

// "Playtest", "Technical Test", "Tech Test", "Unstable", "Open/Closed/Public Beta" as whole words.
// (Won't match "Poppy Playtime".)
const PLAYTEST_NAME = /\b(play ?test|tech(nical)? test|unstable|(open|closed|public) beta)\b/i;

// Store types never change, so a day is plenty. Big enough for large libraries.
const typeCache = new TtlCache<number | null>(24 * 60 * 60 * 1000, 20_000);

export type AppKinds = {
  isSoftware(appid: number): boolean;
  isPlaytest(appid: number, name: string): boolean;
  /** False when the store lookup failed and only the fallback list was used. */
  complete: boolean;
};

/** Look up (or recall from cache) what kind of app each appid is. Never throws. */
export async function classifyApps(appids: number[]): Promise<AppKinds> {
  const missing = appids.filter((appid) => typeCache.get(String(appid)) === undefined);
  let complete = true;
  if (missing.length > 0) {
    try {
      const types = await getStoreItemTypes(missing);
      // Remember "no store entry" too (null), so we don't ask again.
      for (const appid of missing) typeCache.set(String(appid), types.get(appid) ?? null);
    } catch {
      complete = false; // Fall back to the known-software list below.
    }
  }

  const typeOf = (appid: number) => typeCache.get(String(appid)) ?? null;
  return {
    isSoftware: (appid) =>
      KNOWN_SOFTWARE_APPIDS.has(appid) || typeOf(appid) === STORE_TYPE_SOFTWARE || typeOf(appid) === STORE_TYPE_TOOL,
    isPlaytest: (appid, name) => PLAYTEST_NAME.test(name) || typeOf(appid) === STORE_TYPE_BETA,
    complete,
  };
}

/** Only used by tests, so each test starts with an empty cache. */
export function clearClassifyCache(): void {
  typeCache.clear();
}
