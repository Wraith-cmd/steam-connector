// End-to-end tests: send real MCP requests to the Vercel function, with Steam mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../api/mcp.js";
import { clearStoreCaches } from "../src/store.js";
import { MY_STEAM_ID, PRIVATE_STEAM_ID } from "./fixtures.js";
import { mockSteam, TEST_API_KEY } from "./mockSteam.js";

const SECRET = "test-secret-0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("MCP_SECRET", SECRET);
  vi.stubEnv("STEAM_API_KEY", TEST_API_KEY);
  vi.stubEnv("STEAM_ID", MY_STEAM_ID);
  clearStoreCaches();
});

/** Send one JSON-RPC request to the MCP endpoint and return the parsed reply. */
async function rpc(method: string, params: unknown) {
  const response = await handleRequest(
    new Request(`https://app.vercel.app/mcp/${SECRET}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  // Replies may come back as plain JSON or as a server-sent event ("data: {...}").
  const json = text.trimStart().startsWith("{") ? text : text.match(/^data: (.*)$/m)?.[1];
  return JSON.parse(json ?? "null");
}

/** Call a tool and return { isError, text, data } where data is the parsed JSON output. */
async function callTool(name: string, args: Record<string, unknown> = {}) {
  const reply = await rpc("tools/call", { name, arguments: args });
  const text: string = reply.result.content[0].text;
  const isError = reply.result.isError === true;
  return { isError, text, data: isError ? undefined : JSON.parse(text) };
}

describe("tools/list", () => {
  it("lists all the tools", async () => {
    const reply = await rpc("tools/list", {});
    const names = reply.result.tools.map((tool: { name: string }) => tool.name);
    expect(names.sort()).toEqual([
      "check_handheld_compatibility",
      "get_achievement_progress",
      "get_game_details",
      "get_owned_games",
      "get_player_summary",
      "get_recently_played",
      "get_shared_games",
      "get_wishlist",
    ]);
  });
});

describe("get_owned_games", () => {
  it("returns games sorted by total hours with playtime in hours", async () => {
    const fetchMock = mockSteam();
    const { data } = await callTool("get_owned_games");

    expect(data.steam_id).toBe(MY_STEAM_ID);
    expect(data.game_count).toBe(4);
    expect(data.never_played_count).toBe(1);
    expect(data.total_hours).toBe(122.4); // 7345 minutes
    expect(data.games.map((game: { name: string }) => game.name)).toEqual([
      "Stardew Valley",
      "Portal 2",
      "Hades",
      "Terraria",
    ]);
    expect(data.games[0]).toEqual({
      name: "Stardew Valley",
      appid: 413150,
      hours_total: 100.1,
      hours_last_2_weeks: 2.1,
      last_played: "2025-10-03",
    });
    expect(data.games[3].last_played).toBe("never");

    // It asked Steam for app names, played free games, and profile-limited games.
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("include_appinfo")).toBe("1");
    expect(url.searchParams.get("include_played_free_games")).toBe("1");
    expect(url.searchParams.get("skip_unvetted_apps")).toBe("0");
  });

  it("respects the optional limit", async () => {
    mockSteam();
    const { data } = await callTool("get_owned_games", { limit: 2 });
    expect(data.showing).toBe(2);
    expect(data.game_count).toBe(4);
    expect(data.games).toHaveLength(2);
  });

  it("explains how to fix a private profile", async () => {
    mockSteam();
    const result = await callTool("get_owned_games", { profile: PRIVATE_STEAM_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/game details are private/);
    expect(result.text).toMatch(/Privacy Settings/);
  });

  it("explains a bad profile input", async () => {
    mockSteam();
    const result = await callTool("get_owned_games", { profile: "https://example.com/not-steam" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/isn't a steamcommunity.com profile link|isn't a Steam profile/);
  });
});

describe("get_recently_played", () => {
  it("returns recent games sorted by hours in the last 2 weeks", async () => {
    mockSteam();
    const { data } = await callTool("get_recently_played", { profile: "rabscuttle" });
    expect(data.steam_id).toBe(MY_STEAM_ID);
    expect(data.hours_last_2_weeks).toBe(2.6);
    expect(data.games).toEqual([
      { name: "Stardew Valley", appid: 413150, hours_last_2_weeks: 2.1, hours_total: 100.1 },
      { name: "Hades", appid: 1145360, hours_last_2_weeks: 0.5, hours_total: 1.5 },
    ]);
  });

  it("explains how to fix a private profile", async () => {
    mockSteam();
    const result = await callTool("get_recently_played", { profile: PRIVATE_STEAM_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/game details are private/);
  });
});

describe("get_game_details", () => {
  it("returns genres, categories, description, release date and price", async () => {
    mockSteam();
    const { data } = await callTool("get_game_details", { appid: 620 });
    expect(data).toEqual({
      appid: 620,
      name: "Portal 2",
      type: "game",
      short_description: 'The "Perpetual Testing Initiative" has been expanded.',
      genres: ["Action", "Adventure"],
      categories: ["Single-player", "Co-op"],
      release_date: "18 Apr, 2011",
      coming_soon: false,
      price: "$1.99 (80% off, normally $9.99)",
      reviews: { summary: "Overwhelmingly Positive", percent_positive: 98, total_reviews: 1000 },
      controller_support: "none listed",
      store_url: "https://store.steampowered.com/app/620/",
    });
  });

  it("accepts the appid as a string", async () => {
    mockSteam();
    const { data } = await callTool("get_game_details", { appid: "620" });
    expect(data.name).toBe("Portal 2");
  });

  it("caches store responses so repeat lookups don't hit Steam", async () => {
    const fetchMock = mockSteam();
    await callTool("get_game_details", { appid: 620 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // store page + reviews
    await callTool("get_game_details", { appid: 620 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // both served from the cache
  });

  it("still returns details when the review lookup fails", async () => {
    mockSteam();
    const { data } = await callTool("get_game_details", { appid: 413150 }); // no review fixture -> 404
    expect(data.name).toBe("Stardew Valley");
    expect(data.reviews).toBe("unavailable right now");
    expect(data.controller_support).toBe("full");
  });

  it("explains an appid with no store page", async () => {
    mockSteam();
    const result = await callTool("get_game_details", { appid: 999999999 });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/No Steam store page was found for appid 999999999/);
  });

  it("rejects an appid that isn't a positive number", async () => {
    mockSteam();
    const reply = await rpc("tools/call", { name: "get_game_details", arguments: { appid: -5 } });
    // The SDK reports invalid input either as a tool error or a JSON-RPC error.
    expect(reply.error ?? reply.result.isError).toBeTruthy();
  });
});

describe("get_player_summary", () => {
  it("reports a public profile with public game details", async () => {
    mockSteam();
    const { data } = await callTool("get_player_summary");
    expect(data).toEqual({
      steam_id: MY_STEAM_ID,
      display_name: "Rabscuttle",
      profile_url: "https://steamcommunity.com/id/rabscuttle/",
      profile_public: true,
      game_details_public: true,
    });
  });

  it("reports a private profile and how to fix it", async () => {
    mockSteam();
    const { data } = await callTool("get_player_summary", { profile: PRIVATE_STEAM_ID });
    expect(data.profile_public).toBe(false);
    expect(data.game_details_public).toBe(false);
    expect(data.how_to_fix).toMatch(/Privacy Settings/);
  });

  it("explains when no account has that SteamID64", async () => {
    mockSteam();
    const result = await callTool("get_player_summary", { profile: "76561198999999999" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/No Steam account exists/);
  });
});

describe("Steam failures", () => {
  it("explains a rejected API key without revealing it", async () => {
    vi.stubEnv("STEAM_API_KEY", "WRONGKEY0000000000000000000000000");
    mockSteam();
    const result = await callTool("get_owned_games");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Steam rejected the API key/);
    expect(result.text).not.toContain("WRONGKEY");
  });

  it.each([
    [429, /rate limiting/],
    [500, /having problems right now/],
    [503, /having problems right now/],
    [400, /unexpected error \(HTTP 400\)/],
  ])("explains HTTP %i", async (status, message) => {
    mockSteam({ failWithStatus: status });
    const result = await callTool("get_recently_played");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(message);
  });

  it("explains when Steam can't be reached, without leaking the key or secret", async () => {
    mockSteam({ networkDown: true });
    const logged: string[] = [];
    const spies = (["log", "warn", "error", "info"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.join(" "))),
    );

    for (const tool of ["get_owned_games", "get_recently_played", "get_player_summary"]) {
      const result = await callTool(tool);
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/Couldn't reach the Steam Web API/);
      expect(result.text).not.toContain(TEST_API_KEY);
      expect(result.text).not.toContain(SECRET);
    }
    const store = await callTool("get_game_details", { appid: 620 });
    expect(store.text).toMatch(/Couldn't reach the Steam store/);

    expect(logged.join("\n")).not.toContain(TEST_API_KEY);
    expect(logged.join("\n")).not.toContain(SECRET);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("explains a missing STEAM_API_KEY", async () => {
    vi.stubEnv("STEAM_API_KEY", "");
    mockSteam();
    const result = await callTool("get_owned_games");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/missing its STEAM_API_KEY/);
  });
});
