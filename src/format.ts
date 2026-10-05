// Small helpers for turning Steam's raw numbers and text into friendly values.

/**
 * Steam reports playtime in minutes. Convert to hours, rounded to one decimal.
 * Examples: 90 -> 1.5, 125 -> 2.1, 0 or missing -> 0
 */
export function minutesToHours(minutes: number | undefined): number {
  if (!minutes || minutes < 0) return 0;
  // Dividing by 6 and then by 10 is the same as dividing by 60, but rounding
  // in between gives us exactly one decimal place without floating point noise.
  return Math.round(minutes / 6) / 10;
}

/**
 * Hours as a number. Under 0.1 hours, keep two decimals so a brief session
 * doesn't look like 0: 2 minutes -> 0.03, 90 minutes -> 1.5, 0 minutes -> 0.
 */
export function preciseHours(minutes: number | undefined): number {
  const hours = minutesToHours(minutes);
  if (hours > 0 || !minutes || minutes <= 0) return hours;
  return Math.max(0.01, Math.round((minutes / 60) * 100) / 100);
}

/**
 * True when a game was opened but played for less than ~3 minutes in total
 * (it would round to 0.0 hours). `wasOpened` covers games with 0 recorded
 * minutes but a real last-played date.
 */
export function isBrieflyPlayed(minutes: number | undefined, wasOpened = false): boolean {
  return minutesToHours(minutes) === 0 && ((minutes ?? 0) > 0 || wasOpened);
}

// Steam launched in September 2003. Older timestamps are junk: some old games
// report a value a few hours after 1970 instead of a real date.
const FIRST_VALID_TIMESTAMP = Date.UTC(2004, 0, 1) / 1000;

/**
 * Steam reports dates as Unix timestamps (seconds since 1970).
 * Convert to a "YYYY-MM-DD" string, or null if the timestamp is missing or junk.
 */
export function unixToDate(seconds: number | undefined): string | null {
  if (!seconds || seconds < FIRST_VALID_TIMESTAMP) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * The "last played" label for a game:
 *   - a "YYYY-MM-DD" date when Steam has a real one
 *   - "unknown" when it was played but Steam has no usable date (common for old games)
 *   - "never" when there is no playtime and no date at all
 */
export function lastPlayedLabel(playtimeMinutes: number | undefined, lastPlayed: number | undefined): string {
  const date = unixToDate(lastPlayed);
  if (date) return date;
  return (playtimeMinutes ?? 0) > 0 || (lastPlayed ?? 0) > 0 ? "unknown" : "never";
}

/**
 * Clean text that comes from Steam (game names, display names, descriptions):
 * remove invisible characters, collapse runs of whitespace, trim, and cap the length.
 *   "Yu-Gi-Oh!  Master Duel " -> "Yu-Gi-Oh! Master Duel"
 */
export function cleanText(text: string | undefined, maxLength = 300): string {
  const cleaned = (text ?? "")
    // Control characters, zero-width and text-direction marks, and invisible Unicode "tag"
    // characters (U+E0000–E007F), which can be used to hide instructions in names.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  // Cap the length: this text comes from strangers, and nobody needs a 5,000-character "name".
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/** A game's display name, cleaned, falling back to "App <id>" when Steam has none. */
export function gameName(name: string | undefined, appid: number): string {
  return cleanText(name, 100) || `App ${appid}`;
}

/**
 * Store text sometimes contains HTML entities like &quot; or &#169;. Decode the common ones.
 * Run cleanText afterwards: a numeric entity could decode to an invisible character.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}
