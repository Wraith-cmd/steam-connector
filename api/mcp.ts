// The Vercel Function that claude.ai talks to.
//
// Public URL: https://<your-app>.vercel.app/mcp/<MCP_SECRET>
// (vercel.json rewrites that to this file.)
//
// Any request without the right secret gets a plain 404, so the endpoint
// looks like it doesn't exist to anyone who doesn't know the URL.

import { createMcpHandler } from "mcp-handler";
import { describeRejection, getSecretFromRequest, isValidSecret } from "../src/secret.js";
import { registerTools } from "../src/tools.js";

const mcpHandler = createMcpHandler(registerTools, {
  serverInfo: { name: "steam-connector", version: "1.0.0" },
  instructions:
    "Tools for reading a Steam library: owned games with playtime, recently played games, store details " +
    "with reviews, handheld (ROG Ally / Steam Deck) compatibility, achievement progress, wishlist prices, " +
    "games shared with a friend, and profile privacy status. Use them to recommend what to play next.",
  verboseLogs: false, // Verbose logs could include request details; keep them off.
});

export async function handleRequest(request: Request): Promise<Response> {
  // Trim so a stray space or line break pasted into Vercel's settings doesn't lock you out.
  const expected = process.env.MCP_SECRET?.trim();
  const provided = getSecretFromRequest(request);

  if (!isValidSecret(provided, expected)) {
    // Tell the server owner why (in Vercel's logs) without revealing anything to callers.
    console.warn(`Refused request with 404: ${describeRejection(provided, expected)}`);
    return new Response("Not Found", { status: 404 });
  }
  return mcpHandler(request);
}

export default { fetch: handleRequest };
