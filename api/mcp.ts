// The Vercel Function that claude.ai talks to.
//
// Public URL: https://<your-app>.vercel.app/mcp/<MCP_SECRET>
// (vercel.json rewrites that to this file.)
//
// Any request without the right secret gets a plain 404, so the endpoint
// looks like it doesn't exist to anyone who doesn't know the URL.

import { createMcpHandler } from "mcp-handler";
import { getSecretFromRequest, isValidSecret, MIN_SECRET_LENGTH } from "../src/secret.js";
import { registerTools } from "../src/server.js";

const mcpHandler = createMcpHandler(registerTools, {
  serverInfo: { name: "steam-connector", version: "1.0.0" },
  instructions:
    "Tools for reading a Steam library: owned games with playtime, recently played games, " +
    "store details for a game, and profile privacy status. Use them to recommend what to play next.",
  verboseLogs: false, // Verbose logs could include request details; keep them off.
});

export async function handleRequest(request: Request): Promise<Response> {
  const expected = process.env.MCP_SECRET;
  if (!expected || expected.length < MIN_SECRET_LENGTH) {
    // Tell the server owner (in Vercel's logs) without revealing anything to callers.
    console.warn(`MCP_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters; refusing all requests.`);
  }

  if (!isValidSecret(getSecretFromRequest(request), expected)) {
    return new Response("Not Found", { status: 404 });
  }
  return mcpHandler(request);
}

export default { fetch: handleRequest };
