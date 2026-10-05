// Error handling: friendly messages for Claude, and making sure secrets never leak.

/**
 * An error whose message is safe and helpful to show to the user as-is.
 * Anything that is NOT a FriendlyError gets replaced with a generic message.
 */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendlyError";
  }
}

/** Remove the Steam API key and MCP secret from any text before it is shown or logged. */
export function redactSecrets(text: string): string {
  let safe = text;
  // Trim to match how the values are actually used (a pasted value may carry spaces or a line break).
  for (const secret of [process.env.STEAM_API_KEY?.trim(), process.env.MCP_SECRET?.trim()]) {
    // Skip very short values: replacing e.g. "k" everywhere would mangle the message.
    // (Real Steam keys are 32 characters, and MCP_SECRET must be at least 32.)
    if (secret && secret.length >= 8) safe = safe.split(secret).join("[redacted]");
  }
  // Belt and braces: also hide anything that looks like "key=..." in a URL.
  return safe.replace(/([?&]key=)[^&\s"']+/gi, "$1[redacted]");
}

/** Turn any error into an MCP tool result that Claude can read and explain to the user. */
export function toToolError(error: unknown) {
  let message: string;
  if (error instanceof FriendlyError) {
    message = error.message;
  } else {
    // Unexpected problem: log the details for the server owner, show a generic message.
    console.error("Unexpected error:", redactSecrets(String(error)));
    message = "Something unexpected went wrong while talking to Steam. Please try again in a minute.";
  }
  return {
    content: [{ type: "text" as const, text: redactSecrets(message) }],
    isError: true,
  };
}
