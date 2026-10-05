// The connector URL contains a secret (https://your-app.vercel.app/mcp/<MCP_SECRET>).
// claude.ai custom connectors can't send custom headers, so the URL is the password.

import { createHash, timingSafeEqual } from "node:crypto";

/** Secrets shorter than this are rejected: they would be too easy to guess. */
export const MIN_SECRET_LENGTH = 32;

// Letters, numbers, "-" and "_" only, so the secret survives being put in a URL unchanged.
const SECRET_CHARACTERS = /^[A-Za-z0-9_-]+$/;

// Example values printed in this repo's docs. Anyone could find them, so never accept them.
const PUBLISHED_EXAMPLES = new Set([
  "replace-me-with-a-long-random-string",
  "3f9c1e7a0b5d4c2e8f6a9b1c3d5e7f9a0b2c4d6e8f0a1b3c5d7e9f1a3b5c7d9",
]);

/** Why MCP_SECRET can't be used, or null if it's fine. Never includes the secret itself. */
export function secretSettingProblem(expected: string | undefined): string | null {
  if (!expected) return "MCP_SECRET is not set in Vercel. Add it, then redeploy.";
  if (expected.length < MIN_SECRET_LENGTH) {
    return `MCP_SECRET is only ${expected.length} characters; it must be at least ${MIN_SECRET_LENGTH}.`;
  }
  if (!SECRET_CHARACTERS.test(expected)) {
    return 'MCP_SECRET may only contain letters, numbers, "-" and "_". Generate one with: openssl rand -hex 32';
  }
  if (PUBLISHED_EXAMPLES.has(expected)) {
    return "MCP_SECRET is still the example value from the docs. Generate your own with: openssl rand -hex 32";
  }
  return null;
}

/**
 * Find the secret in the request. Vercel rewrites /mcp/<secret> to
 * /api/mcp?secret=<secret> (see vercel.json), so we check both places.
 */
export function getSecretFromRequest(request: Request): string | undefined {
  const url = new URL(request.url);
  const fromPath = url.pathname.match(/^\/mcp\/([^/]+)\/?$/)?.[1];
  const raw = fromPath ?? url.searchParams.get("secret") ?? undefined;
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return undefined; // Malformed percent-encoding: treat as no secret.
  }
}

/**
 * Compare the secret from the URL with MCP_SECRET in a way that takes the same
 * time whether the guess is close or not (so timing can't leak the secret).
 */
export function isValidSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (secretSettingProblem(expected) !== null) return false;
  if (!provided) return false;
  // Hashing both values gives equal-length buffers, which timingSafeEqual requires.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected!).digest();
  return timingSafeEqual(a, b);
}

/**
 * Explain (for the server owner's logs) why a request was refused. Only lengths are
 * included, never the secrets themselves, so it is safe to log.
 */
export function describeRejection(provided: string | undefined, expected: string | undefined): string {
  const settingProblem = secretSettingProblem(expected);
  if (settingProblem) return settingProblem;
  if (!provided) return "the URL has no secret. The connector URL must end in /mcp/<MCP_SECRET>.";
  return (
    `the secret in the URL doesn't match MCP_SECRET ` +
    `(URL secret: ${provided.length} characters, MCP_SECRET: ${expected!.length} characters).`
  );
}
