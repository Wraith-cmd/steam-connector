// Calls to the public Steam store (store.steampowered.com): game details,
// review scores, and Steam Deck ratings. No API key needed, but the store is
// rate limited (roughly 200 requests per 5 minutes), so everything is cached.

import { TtlCache } from "./cache.js";
import { FriendlyError } from "./errors.js";
import { cleanText, decodeEntities } from "./format.js";
import { fetchJson } from "./http.js";

const STORE = "https://store.steampowered.com";
const ONE_HOUR = 60 * 60 * 1000;

export type AppDetails = {
  type?: string;
  name: string;
  steam_appid: number;
  is_free?: boolean;
  short_description?: string;
  controller_support?: "full" | "partial"; // often missing even when categories list support; see controllerSupport()
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  genres?: { description: string }[];
  categories?: { description: string }[];
  release_date?: { coming_soon: boolean; date: string };
  price_overview?: { final_formatted: string; initial_formatted: string; discount_percent: number };
  // HTML snippets. Steam sends an empty list instead of an object when a game has none.
  pc_requirements?: { minimum?: string; recommended?: string } | unknown[];
};

export type ReviewSummary = {
  summary: string; // e.g. "Very Positive"
  percent_positive: number | null;
  total_reviews: number;
};

/** Steam Deck rating: 3 = Verified, 2 = Playable, 1 = Unsupported, 0 = Unknown. */
export type DeckRating = {
  category: 0 | 1 | 2 | 3;
  notes: string[]; // Valve's test results, e.g. "Default controller config fully functional"
};

/** Two-letter country code for store prices, e.g. "us" or "gb". Defaults to "us". */
function getCountry(): string {
  const country = process.env.STEAM_COUNTRY?.trim().toLowerCase();
  return country && /^[a-z]{2}$/.test(country) ? country : "us";
}

// We also cache "not found" (null) so repeated bad appids don't hit Steam.
const appDetailsCache = new TtlCache<AppDetails | null>(ONE_HOUR);
const reviewCache = new TtlCache<ReviewSummary | null>(ONE_HOUR);
const deckCache = new TtlCache<DeckRating>(ONE_HOUR);

/** Store page details for a game. Returns null when no store page exists for the appid. */
export async function getAppDetails(appid: number): Promise<AppDetails | null> {
  const country = getCountry();
  const cacheKey = `${appid}:${country}`;
  const cached = appDetailsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const query = new URLSearchParams({ appids: String(appid), cc: country, l: "english" });
  const data = (await fetchJson(`${STORE}/api/appdetails?${query}`, "store")) as Record<
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

/** Overall user review score, e.g. "Very Positive" (92% of 48,000 reviews). Null if Steam has none. */
export async function getReviewSummary(appid: number): Promise<ReviewSummary | null> {
  const cached = reviewCache.get(String(appid));
  if (cached !== undefined) return cached;

  const query = new URLSearchParams({ json: "1", language: "all", purchase_type: "all", num_per_page: "0" });
  const data = (await fetchJson(`${STORE}/appreviews/${appid}?${query}`, "store")) as {
    success?: number;
    query_summary?: { review_score_desc?: string; total_positive?: number; total_reviews?: number };
  } | null;

  const summary = data?.query_summary;
  let result: ReviewSummary | null = null;
  if (data?.success === 1 && summary && summary.total_reviews) {
    result = {
      summary: summary.review_score_desc ?? "Unknown",
      percent_positive: summary.total_positive !== undefined
        ? Math.round((summary.total_positive / summary.total_reviews) * 100)
        : null,
      total_reviews: summary.total_reviews,
    };
  }
  reviewCache.set(String(appid), result);
  return result;
}

/** Valve's Steam Deck rating for a game, with the notes from their testing. */
export async function getDeckRating(appid: number): Promise<DeckRating> {
  const cached = deckCache.get(String(appid));
  if (cached !== undefined) return cached;

  // Not an official API, but it is what the Steam store page itself uses.
  const query = new URLSearchParams({ nAppID: String(appid), l: "english" });
  const data = (await fetchJson(`${STORE}/saleaction/ajaxgetdeckappcompatibilityreport?${query}`, "store")) as {
    results?: { resolved_category?: number; resolved_items?: { loc_token?: string }[] };
  } | null;

  const category = data?.results?.resolved_category;
  const rating: DeckRating = {
    category: category === 1 || category === 2 || category === 3 ? category : 0,
    notes: (data?.results?.resolved_items ?? [])
      .map((item) => describeDeckNote(item.loc_token))
      .filter((note): note is string => note !== null),
  };
  deckCache.set(String(appid), rating);
  return rating;
}

/**
 * Turn Valve's internal note names into plain English, e.g.
 * "#SteamDeckVerified_TestResult_DefaultControllerConfigFullyFunctional"
 *   -> "Default controller config fully functional"
 */
export function describeDeckNote(token: string | undefined): string | null {
  if (!token) return null;
  const name = token.split("_").pop() ?? "";
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
}

export type ControllerSupport = "full" | "partial" | "none";

/**
 * How well a game supports controllers. Steam's controller_support field is often
 * missing (especially for partial support), so fall back to the store categories
 * "Full controller support" and "Partial Controller Support".
 */
export function controllerSupport(details: AppDetails): ControllerSupport {
  if (details.controller_support === "full" || details.controller_support === "partial") {
    return details.controller_support;
  }
  const categories = (details.categories ?? []).map((category) => category.description.toLowerCase());
  if (categories.includes("full controller support")) return "full";
  if (categories.includes("partial controller support")) return "partial";
  return "none";
}

/**
 * Minimum and recommended PC requirements as plain text, e.g.
 * "OS: Windows 10; Processor: Intel Core i5; Memory: 8 GB RAM". Null when Steam lists none.
 */
export function pcRequirements(details: AppDetails): { minimum: string | null; recommended: string | null } {
  const requirements = Array.isArray(details.pc_requirements) ? {} : (details.pc_requirements ?? {});
  return {
    minimum: requirementsToText(requirements.minimum),
    recommended: requirementsToText(requirements.recommended),
  };
}

/** Turn Steam's requirements HTML into one line of plain text. */
export function requirementsToText(html: string | undefined): string | null {
  if (!html) return null;
  const lines = decodeEntities(
    html
      .replace(/<br\s*\/?>|<\/li>|<\/p>|<\/ul>/gi, "\n") // line breaks and list items become new lines
      .replace(/<[^>]*>/g, ""), // drop every other tag
  )
    .split("\n")
    .map((line) => cleanText(line).replace(/^(minimum|recommended):\s*/i, ""))
    .filter((line) => line !== "");
  // Requirements can be long, so allow more than the usual text limit.
  return lines.length ? cleanText(lines.join("; "), 800) : null;
}

/** Only used by tests, so each test starts with empty caches. */
export function clearStoreCaches(): void {
  appDetailsCache.clear();
  reviewCache.clear();
  deckCache.clear();
}
