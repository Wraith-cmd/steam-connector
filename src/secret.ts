// The connector URL contains a secret (https://your-app.vercel.app/mcp/<MCP_SECRET>).
// claude.ai custom connectors can't send custom headers, so the URL is the password.

import { createHash, timingSafeEqual } from "node:crypto";

/** Secrets shorter than this are rejected: they would be too easy to guess. */
export const MIN_SECRET_LENGTH = 16;

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
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;
  if (!provided) return false;
  // Hashing both values gives equal-length buffers, which timingSafeEqual requires.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Explain (for the server owner's logs) why a request was refused. Only lengths are
 * included, never the secrets themselves, so it is safe to log.
 */
export function describeRejection(provided: string | undefined, expected: string | undefined): string {
  if (!expected) return "MCP_SECRET is not set in Vercel. Add it, then redeploy.";
  if (expected.length < MIN_SECRET_LENGTH) {
    return `MCP_SECRET is only ${expected.length} characters; it must be at least ${MIN_SECRET_LENGTH}.`;
  }
  if (!provided) return "the URL has no secret. The connector URL must end in /mcp/<MCP_SECRET>.";
  return (
    `the secret in the URL doesn't match MCP_SECRET ` +
    `(URL secret: ${provided.length} characters, MCP_SECRET: ${expected.length} characters).`
  );
}
