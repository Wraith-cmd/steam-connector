// Runs before every test file: start each test with empty caches and a fresh
// rate limit, so one test's Steam answers can't leak into the next.

import { beforeEach } from "vitest";
import { clearClassifyCache } from "../src/classify.js";
import { resetRateLimit } from "../src/ratelimit.js";
import { clearWebApiCache } from "../src/steam.js";
import { clearStoreCaches } from "../src/store.js";

beforeEach(() => {
  clearWebApiCache();
  clearStoreCaches();
  clearClassifyCache();
  resetRateLimit();
});
