// Everything that talks to Steam lives in this file.
//
// Steam has two APIs we use:
//   - The Web API (api.steampowered.com), which needs STEAM_API_KEY
//   - The store API (store.steampowered.com), which is public and rate limited

import { TtlCache } from "./cache.js";
import { FriendlyError } from "./errors.js";

const WEB_API = "https://api.steampowered.com";
const STORE_API = "https://store.steampowered.com/api";
const TIMEOUT_MS = 10_000;

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

export type AppDetails = {
  type?: string;
  name: string;
  steam_appid: number;
  is_free?: boolean;
  short_description?: string;
  genres?: { description: string }[];
  categories?: { description: string }[];
  release_date?: { coming_soon: boolean; date: string };
  price_overview?: { final_formatted: string; initial_formatted: string; discount_percent: number };
};

// ---------- Low-level helpers ----------

function getApiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    throw new FriendlyError(
      "This server is missing its STEAM_API_KEY setting. The owner needs to add it in Vercel " +
        "(Project → Settings → Environment Variables) and redeploy.",
    );
  }
  return key;
}

/** Two-letter country code for store prices, e.g. "us" or "gb". Defaults to "us". */
function getCountry(): string {
  const country = process.env.STEAM_COUNTRY?.trim().toLowerCase();
  return country && /^[a-z]{2}$/.test(country) ? country : "us";
}

/** Fetch a URL and parse JSON, turning every kind of failure into a FriendlyError. */
async function fetchJson(url: string, service: "Web API" | "store"): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // Note: we never include `url` in messages because it contains the API key.
    throw new FriendlyError(`Couldn't reach the Steam ${service} (it may be down or slow). Please try again shortly.`);
  }

  if (response.status === 429) {
    throw new FriendlyError(`The Steam ${service} is rate limiting us. Please wait a minute and try again.`);
  }
  if ((response.status === 401 || response.status === 403) && service === "Web API") {
    throw new FriendlyError(
      "Steam rejected the API key. The server's STEAM_API_KEY is probably wrong or was revoked. " +
        "Get a new key at https://steamcommunity.com/dev/apikey and update it in Vercel.",
    );
  }
  if (response.status >= 500) {
    throw new FriendlyError(`The Steam ${service} is having problems right now (HTTP ${response.status}). Please try again later.`);
  }
  if (!response.ok) {
    throw new FriendlyError(`The Steam ${service} returned an unexpected error (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch {
    throw new FriendlyError(`The Steam ${service} sent back a response we couldn't read. Please try again shortly.`);
  }
}

/** Call a Steam Web API method, e.g. steamApi("IPlayerService/GetOwnedGames/v1", { steamid }). */
async function steamApi(method: string, params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams({ key: getApiKey(), format: "json", ...params });
  return fetchJson(`${WEB_API}/${method}/?${query}`, "Web API");
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

// Store responses rarely change, so cache them for an hour.
// We also cache "not found" (null) so repeated bad appids don't hit Steam.
const appDetailsCache = new TtlCache<AppDetails | null>(60 * 60 * 1000);

/** Store page details for a game. Returns null when no store page exists for the appid. */
export async function getAppDetails(appid: number): Promise<AppDetails | null> {
  const country = getCountry();
  const cacheKey = `${appid}:${country}`;
  const cached = appDetailsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const query = new URLSearchParams({ appids: String(appid), cc: country, l: "english" });
  const data = (await fetchJson(`${STORE_API}/appdetails?${query}`, "store")) as Record<
    string,
    { success?: boolean; data?: AppDetails } | null
  > | null;

  // The store answers with plain `null` when it is rate limiting us.
  if (data === null) {
    throw new FriendlyError("The Steam store is rate limiting us. Please wait a minute and try again.");
  }

  const entry = data[String(appid)];
  const details = entry?.success && entry.data ? entry.data : null;
  appDetailsCache.set(cacheKey, details);
  return details;
}

/** Only used by tests, so each test starts with an empty cache. */
export function clearAppDetailsCache(): void {
  appDetailsCache.clear();
}
