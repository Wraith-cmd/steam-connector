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
 * Hours for display. A game that was opened but played for under ~3 minutes
 * would round to 0, which looks like it was never launched, so show "<0.1".
 *   formatHours(90) -> 1.5
 *   formatHours(2) -> "<0.1"
 *   formatHours(0, true) -> "<0.1"   (no minutes recorded, but it has a last-played date)
 *   formatHours(0) -> 0
 */
export function formatHours(minutes: number | undefined, wasOpened = false): number | "<0.1" {
  const hours = minutesToHours(minutes);
  if (hours > 0) return hours;
  return (minutes ?? 0) > 0 || wasOpened ? "<0.1" : 0;
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
 * remove invisible characters, collapse runs of whitespace, and trim. "Yu-Gi-Oh!  Master Duel " -> "Yu-Gi-Oh! Master Duel"
 */
export function cleanText(text: string | undefined): string {
  return (text ?? "")
    // Control characters, zero-width and text-direction marks, and invisible Unicode "tag"
    // characters (U+E0000–E007F), which can be used to hide instructions in names.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A game's display name, cleaned, falling back to "App <id>" when Steam has none. */
export function gameName(name: string | undefined, appid: number): string {
  return cleanText(name) || `App ${appid}`;
}

/** Store descriptions sometimes contain HTML entities like &quot;. Decode the common ones. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
