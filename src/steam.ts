// Calls to the Steam Web API (api.steampowered.com), which needs STEAM_API_KEY.
// Store calls (prices, reviews, Steam Deck ratings) live in store.ts.

import { FriendlyError } from "./errors.js";
import { cleanText } from "./format.js";
import { fetchJson } from "./http.js";

const WEB_API = "https://api.steampowered.com";

// ---------- Shapes of the Steam data we use (Steam sends more, we ignore it) ----------

export type OwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number; // minutes
  playtime_2weeks?: number; // minutes
  rtime_last_played?: number; // Unix timestamp
};

export type RecentGame = {
  appid: number;
  name?: string;
  playtime_2weeks?: number; // minutes
  playtime_forever?: number; // minutes
};

export type PlayerSummary = {
  steamid: string;
  personaname: string;
  profileurl: string;
  communityvisibilitystate: number; // 3 means public, anything else is private
};

export type WishlistItem = {
  appid: number;
  priority?: number; // the order the player ranked it in
  date_added?: number; // Unix timestamp
};

export type PlayerAchievement = {
  apiname: string;
  achieved: number; // 1 = unlocked, 0 = locked
  unlocktime?: number; // Unix timestamp
  name?: string;
  description?: string;
};

// ---------- Low-level helpers ----------

function getApiKey(): string {
  // Trim: a key pasted into Vercel with a trailing space or line break would otherwise be rejected.
  const key = process.env.STEAM_API_KEY?.trim();
  if (!key) {
    throw new FriendlyError(
      "This server is missing its STEAM_API_KEY setting. The owner needs to add it in Vercel " +
        "(Project → Settings → Environment Variables) and redeploy.",
    );
  }
  return key;
}

/** Call a Steam Web API method, e.g. steamApi("IPlayerService/GetOwnedGames/v1", { steamid }). */
async function steamApi(method: string, params: Record<string, string>, readBodyOn: number[] = []): Promise<unknown> {
  const query = new URLSearchParams({ key: getApiKey(), format: "json", ...params });
  return fetchJson(`${WEB_API}/${method}/?${query}`, "Web API", readBodyOn);
}

// ---------- Public functions used by the tools ----------

/** Turn a custom profile name (steamcommunity.com/id/<name>) into a SteamID64, or null if not found. */
export async function resolveVanityUrl(name: string): Promise<string | null> {
  const data = (await steamApi("ISteamUser/ResolveVanityURL/v1", { vanityurl: name })) as {
    response?: { success?: number; steamid?: string };
  };
  // success: 1 means found. 42 means "no match".
  if (data.response?.success === 1 && data.response.steamid) return data.response.steamid;
  return null;
}

/**
 * Every game the player owns. Returns null when the player's game details are private
 * (Steam answers with an empty object instead of an error in that case).
 */
export async function getOwnedGames(steamId: string, includeAppInfo = true): Promise<OwnedGame[] | null> {
  const data = (await steamApi("IPlayerService/GetOwnedGames/v1", {
    steamid: steamId,
    include_appinfo: includeAppInfo ? "1" : "0",
    include_played_free_games: "1",
    skip_unvetted_apps: "0", // Without this, some games are missing from the list.
  })) as { response?: { game_count?: number; games?: OwnedGame[] } };

  if (data.response?.game_count === undefined) return null;
  return data.response.games ?? [];
}

/** Games played in the last two weeks. Returns null when game details are private. */
export async function getRecentlyPlayedGames(steamId: string): Promise<RecentGame[] | null> {
  const data = (await steamApi("IPlayerService/GetRecentlyPlayedGames/v1", { steamid: steamId })) as {
    response?: { total_count?: number; games?: RecentGame[] };
  };

  if (data.response?.total_count === undefined) return null;
  return data.response.games ?? [];
}

/** Basic profile info. Returns null when no account has that SteamID64. */
export async function getPlayerSummary(steamId: string): Promise<PlayerSummary | null> {
  const data = (await steamApi("ISteamUser/GetPlayerSummaries/v2", { steamids: steamId })) as {
    response?: { players?: PlayerSummary[] };
  };
  return data.response?.players?.[0] ?? null;
}

/**
 * The games on a player's wishlist (appids only; prices come from the store).
 * Steam returns an empty result both for an empty wishlist and a private one.
 */
export async function getWishlist(steamId: string): Promise<WishlistItem[]> {
  const data = (await steamApi("IWishlistService/GetWishlist/v1", { steamid: steamId })) as {
    response?: { items?: WishlistItem[] };
  };
  return data.response?.items ?? [];
}

export type AchievementResult =
  | { kind: "ok"; gameName: string; achievements: PlayerAchievement[] }
  | { kind: "no_achievements" }
  | { kind: "private" };

/** A player's achievements in one game, with names and descriptions in English. */
export async function getPlayerAchievements(steamId: string, appid: number): Promise<AchievementResult> {
  // Steam explains problems ("Profile is not public", "Requested app has no stats")
  // in the body of a 400 or 403 response, so read those bodies instead of failing.
  const data = (await steamApi(
    "ISteamUserStats/GetPlayerAchievements/v1",
    { steamid: steamId, appid: String(appid), l: "english" },
    [400, 403],
  )) as { playerstats?: { success?: boolean; error?: string; gameName?: string; achievements?: PlayerAchievement[] } };

  const stats = data.playerstats;
  if (stats?.success) {
    if (!stats.achievements?.length) return { kind: "no_achievements" };
    return { kind: "ok", gameName: stats.gameName ?? `App ${appid}`, achievements: stats.achievements };
  }
  const error = stats?.error ?? "";
  if (/not public/i.test(error)) return { kind: "private" };
  if (/no stats|no achievements/i.test(error)) return { kind: "no_achievements" };
  throw new FriendlyError(
    `Steam couldn't load achievements for appid ${appid}` + (error ? ` ("${cleanText(error, 100)}").` : ".") +
      " Check that the player owns this game.",
  );
}

/**
 * What percent of all players have unlocked each achievement, keyed by the
 * achievement's API name. Returns an empty map if Steam has no data.
 */
export async function getGlobalAchievementPercentages(appid: number): Promise<Map<string, number>> {
  const data = (await steamApi("ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2", {
    gameid: String(appid),
  })) as { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } };

  const percentages = new Map<string, number>();
  for (const achievement of data.achievementpercentages?.achievements ?? []) {
    // Some games send the percent as a string, e.g. "12.5".
    const percent = Number(achievement.percent);
    if (Number.isFinite(percent)) percentages.set(achievement.name, percent);
  }
  return percentages;
}

/**
 * Each app's store type (6 = software, 12 = beta/playtest, 13 = tool; 0 = game),
 * looked up in batches of 100 with IStoreBrowseService/GetItems. This endpoint
 * doesn't need the API key, so we don't send it. Apps Steam has no store entry
 * for are simply missing from the result.
 */
export async function getStoreItemTypes(appids: number[]): Promise<Map<number, number>> {
  const types = new Map<number, number>();
  for (let start = 0; start < appids.length; start += 100) {
    const batch = appids.slice(start, start + 100);
    const input = {
      ids: batch.map((appid) => ({ appid })),
      context: { language: "english", country_code: "US", steam_realm: 1 },
      data_request: {},
    };
    const query = new URLSearchParams({ input_json: JSON.stringify(input) });
    const data = (await fetchJson(`${WEB_API}/IStoreBrowseService/GetItems/v1/?${query}`, "Web API")) as {
      response?: { store_items?: { appid?: number; type?: number }[] };
    };
    for (const item of data.response?.store_items ?? []) {
      if (typeof item.appid === "number" && typeof item.type === "number") types.set(item.appid, item.type);
    }
  }
  return types;
}
