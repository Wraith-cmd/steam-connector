// Small helpers for turning Steam's raw numbers into friendly values.

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
 * Steam reports dates as Unix timestamps (seconds since 1970).
 * Convert to a "YYYY-MM-DD" string, or null if the game was never played.
 */
export function unixToDate(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
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
