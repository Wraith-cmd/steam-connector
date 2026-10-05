// A simple limit on how many requests the server handles per minute.
//
// It only counts requests that already had the right secret, and it lives in the
// memory of one server instance, so it's a safety net rather than a hard guarantee.
// For a strict limit, add a rate-limiting rule in Vercel (Project → Firewall).

const WINDOW_MS = 60_000;
export const MAX_REQUESTS_PER_MINUTE = 120;

let recent: number[] = [];

/** Record a request and say whether it's allowed (false once the limit is reached). */
export function allowRequest(now = Date.now()): boolean {
  recent = recent.filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) return false;
  recent.push(now);
  return true;
}

/** Only used by tests. */
export function resetRateLimit(): void {
  recent = [];
}
