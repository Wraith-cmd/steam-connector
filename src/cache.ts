// A tiny in-memory cache with an expiry time.
//
// Serverless functions are recycled from time to time, so this cache is
// "best effort": it saves repeat calls while an instance is warm, which is
// enough to stop us hammering Steam's store API during one conversation.

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private entries = new Map<string, Entry<T>>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(ttlMs: number, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Keep memory bounded: drop the oldest entry when full.
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}
