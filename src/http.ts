// Shared helper for calling Steam: fetch a URL and parse JSON, turning every
// kind of failure into a FriendlyError that Claude can explain to the user.

import { FriendlyError } from "./errors.js";

const TIMEOUT_MS = 10_000;

export type SteamService = "Web API" | "store";

/**
 * Fetch a URL and parse its JSON.
 *
 * `readBodyOn` lists HTTP error statuses whose JSON body should be returned
 * instead of thrown. Some Steam methods (like achievements) explain errors such
 * as "Profile is not public" in the body of a 400/403 response.
 */
export async function fetchJson(url: string, service: SteamService, readBodyOn: number[] = []): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Web API URLs carry the API key, so never follow a redirect to somewhere else.
      redirect: service === "Web API" ? "error" : "follow",
    });
  } catch {
    // Note: we never include `url` in messages because it contains the API key.
    throw new FriendlyError(`Couldn't reach the Steam ${service} (it may be down or slow). Please try again shortly.`);
  }

  if (readBodyOn.includes(response.status)) {
    try {
      return await response.json();
    } catch {
      // Not JSON, so it isn't the explanation we hoped for: fall through to the normal handling.
    }
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

/**
 * Like `Promise.all(items.map(fn))`, but runs at most `limit` calls at a time,
 * so checking 50 games doesn't fire 50 requests at Steam in the same instant.
 */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
