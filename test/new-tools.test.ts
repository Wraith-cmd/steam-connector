// End-to-end tests for the handheld, achievement, wishlist and shared-games tools, with Steam mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../api/mcp.js";
import { clearStoreCaches } from "../src/store.js";
import { FRIEND_STEAM_ID, MY_STEAM_ID, PRIVATE_STEAM_ID } from "./fixtures.js";
import { mockSteam, TEST_API_KEY } from "./mockSteam.js";

const SECRET = "test-secret-0123456789abcdef-0123456789";

beforeEach(() => {
  vi.stubEnv("MCP_SECRET", SECRET);
  vi.stubEnv("STEAM_API_KEY", TEST_API_KEY);
  vi.stubEnv("STEAM_ID", MY_STEAM_ID);
  clearStoreCaches();
});

/** Call a tool and return { isError, text, data } where data is the parsed JSON output. */
async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await handleRequest(
    new Request(`https://app.vercel.app/mcp/${SECRET}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  const body = await response.text();
  const json = body.trimStart().startsWith("{") ? body : body.match(/^data: (.*)$/m)?.[1];
  const reply = JSON.parse(json ?? "null");
  if (reply.error) return { isError: true, text: String(reply.error.message), data: undefined };
  const text: string = reply.result.content[0].text;
  const isError = reply.result.isError === true;
  return { isError, text, data: isError ? undefined : JSON.parse(text) };
}

describe("check_handheld_compatibility", () => {
  it("rates each game for handheld PCs like the ROG Ally", async () => {
    mockSteam();
    const { data } = await callTool("check_handheld_compatibility", { appids: [620, 413150, 1145360, 105600] });
    const byName = Object.fromEntries(data.games.map((game: { name: string }) => [game.name, game]));

    expect(byName["Portal 2"]).toMatchObject({
      handheld_rating: "Great",
      steam_deck_rating: "Verified",
      controller_support: "none",
      steam_deck_notes: ["Default controller config fully functional", "Interface text is legible"],
    });
    expect(byName["Stardew Valley"]).toMatchObject({ handheld_rating: "Good", steam_deck_rating: "Playable" });
    // Unsupported on Deck, but full controller support on Windows: fine on a ROG Ally.
    expect(byName["Hades"]).toMatchObject({
      handheld_rating: "Likely fine on Windows handhelds",
      steam_deck_rating: "Unsupported",
    });
    expect(byName["Terraria"]).toMatchObject({ handheld_rating: "Unknown", steam_deck_rating: "Unknown" });
  });

  it("keeps going when one appid has no store page", async () => {
    mockSteam();
    const { data } = await callTool("check_handheld_compatibility", { appids: [620, 999999999] });
    expect(data.games[0].name).toBe("Portal 2");
    expect(data.games[1]).toEqual({ appid: 999999999, error: "No Steam store page for this appid." });
  });

  it("falls back on controller support if the Steam Deck rating can't be fetched", async () => {
    mockSteam({ failPaths: ["/saleaction/ajaxgetdeckappcompatibilityreport"] });
    const { data } = await callTool("check_handheld_compatibility", { appids: [1145360] });
    expect(data.games[0]).toMatchObject({
      name: "Hades",
      handheld_rating: "Good",
      steam_deck_rating: "Unknown",
      steam_deck_notes: ["Steam Deck rating unavailable right now"],
    });
  });

  it("refuses more than 10 appids", async () => {
    mockSteam();
    const result = await callTool("check_handheld_compatibility", { appids: Array.from({ length: 11 }, (_, i) => i + 1) });
    expect(result.isError).toBe(true);
  });
});

describe("get_achievement_progress", () => {
  it("shows progress with locked achievements easiest first", async () => {
    mockSteam();
    const { data } = await callTool("get_achievement_progress", { appid: 620 });
    expect(data).toMatchObject({
      steam_id: MY_STEAM_ID,
      game: "Portal 2",
      unlocked: 1,
      total: 3,
      percent_complete: 33.3,
      is_100_percent: false,
    });
    expect(data.locked_achievements_easiest_first).toEqual([
      { name: "Common One", description: "(hidden achievement)", percent_of_players_who_have_it: 60.3 },
      { name: "Rare One", description: "Hard to get.", percent_of_players_who_have_it: 2 },
    ]);
  });

  it("recognises a 100% game", async () => {
    mockSteam();
    const { data } = await callTool("get_achievement_progress", { appid: 413150 });
    expect(data).toMatchObject({ unlocked: 2, total: 2, percent_complete: 100, is_100_percent: true });
    expect(data.locked_achievements_easiest_first).toEqual([]);
  });

  it("explains a game with no achievements", async () => {
    mockSteam();
    const result = await callTool("get_achievement_progress", { appid: 105600 });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/has no Steam achievements/);
  });

  it("explains a private profile instead of blaming the API key", async () => {
    mockSteam();
    const result = await callTool("get_achievement_progress", { appid: 620, profile: PRIVATE_STEAM_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/game details are private/);
  });
});

describe("get_wishlist", () => {
  it("lists wishlist games top-ranked first with prices", async () => {
    mockSteam();
    const { data } = await callTool("get_wishlist");
    expect(data.wishlist_count).toBe(3);
    expect(data.on_sale_count).toBe(1);
    expect(data.games).toEqual([
      { name: "Stardew Valley", appid: 413150, price: "$14.99", on_sale: false, discount_percent: 0, added_to_wishlist: "2024-01-01" },
      { name: "Hades", appid: 1145360, price: "$12.49 (50% off, normally $24.99)", on_sale: true, discount_percent: 50, added_to_wishlist: "2025-01-01" },
      { name: "App 999999999", appid: 999999999, price: "Not on the store", on_sale: false, discount_percent: 0, added_to_wishlist: "2025-01-01" },
    ]);
  });

  it("can show only games on sale, and says when it didn't check everything", async () => {
    mockSteam();
    const { data } = await callTool("get_wishlist", { on_sale_only: true, limit: 2 });
    expect(data.games.map((game: { name: string }) => game.name)).toEqual(["Hades"]);
    expect(data.checked).toBe(2);
    expect(data.note).toMatch(/top 2 of 3/);
  });

  it("handles an empty or private wishlist", async () => {
    mockSteam();
    const { data } = await callTool("get_wishlist", { profile: FRIEND_STEAM_ID });
    expect(data.wishlist_count).toBe(0);
    expect(data.note).toMatch(/empty, or the profile's game details are private/);
  });
});

describe("get_shared_games", () => {
  it("finds games both players own, sorted by combined hours", async () => {
    mockSteam();
    const { data } = await callTool("get_shared_games", { friend_profile: "friendlyfriend" });
    expect(data).toMatchObject({ your_steam_id: MY_STEAM_ID, friend_steam_id: FRIEND_STEAM_ID, shared_count: 2 });
    expect(data.games).toEqual([
      { name: "Terraria", appid: 105600, your_hours: 0, friend_hours: 50 },
      { name: "Portal 2", appid: 620, your_hours: 20.8, friend_hours: 10 },
    ]);
  });

  it("explains when the friend's game details are private", async () => {
    mockSteam();
    const result = await callTool("get_shared_games", { friend_profile: PRIVATE_STEAM_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/friend's game details are private/);
  });

  it("rejects comparing a profile with itself", async () => {
    mockSteam();
    const result = await callTool("get_shared_games", { friend_profile: MY_STEAM_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/same Steam profile/);
  });
});
