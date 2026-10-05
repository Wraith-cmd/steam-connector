// Tests for how library data is cleaned up: dates, short sessions, names,
// software filtering and playtest flags. Steam is mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../api/mcp.js";
import { clearClassifyCache } from "../src/classify.js";
import { cleanText, gameName, isBrieflyPlayed, lastPlayedLabel, preciseHours, unixToDate } from "../src/format.js";
import { clearStoreCaches } from "../src/store.js";
import { MESSY_STEAM_ID, MY_STEAM_ID } from "./fixtures.js";
import { mockSteam, TEST_API_KEY } from "./mockSteam.js";

const SECRET = "test-secret-0123456789abcdef-0123456789";

beforeEach(() => {
  vi.stubEnv("MCP_SECRET", SECRET);
  vi.stubEnv("STEAM_API_KEY", TEST_API_KEY);
  vi.stubEnv("STEAM_ID", MESSY_STEAM_ID);
  clearStoreCaches();
  clearClassifyCache();
  mockSteam();
});

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
  return JSON.parse(reply.result.content[0].text);
}

type Game = {
  name: string;
  appid: number;
  hours_total: number;
  last_played: string;
  briefly_played?: true;
  is_software?: true;
  is_playtest?: true;
};
const byName = (games: Game[]) => Object.fromEntries(games.map((game) => [game.name, game]));

describe("format helpers", () => {
  it("treats missing, zero and pre-2004 timestamps as no date", () => {
    expect(unixToDate(0)).toBeNull();
    expect(unixToDate(86400)).toBeNull(); // 1970-01-02
    expect(unixToDate(1072915199)).toBeNull(); // 2003-12-31
    expect(unixToDate(1072915200)).toBe("2004-01-01");
  });

  it('labels last played as a date, "unknown" or "never"', () => {
    expect(lastPlayedLabel(100, 1735689600)).toBe("2025-01-01");
    expect(lastPlayedLabel(1488, 86400)).toBe("unknown"); // played, junk date
    expect(lastPlayedLabel(500, 0)).toBe("unknown"); // played, no date
    expect(lastPlayedLabel(0, 0)).toBe("never");
    expect(lastPlayedLabel(undefined, undefined)).toBe("never");
  });

  it("keeps hours numeric, with two decimals for brief sessions", () => {
    expect(preciseHours(90)).toBe(1.5);
    expect(preciseHours(3)).toBe(0.1);
    expect(preciseHours(2)).toBe(0.03);
    expect(preciseHours(1)).toBe(0.02);
    expect(preciseHours(0)).toBe(0);
    expect(preciseHours(undefined)).toBe(0);
  });

  it("marks games opened for only a few minutes as briefly played", () => {
    expect(isBrieflyPlayed(2)).toBe(true);
    expect(isBrieflyPlayed(0, true)).toBe(true); // 0 minutes recorded, but it has a last-played date
    expect(isBrieflyPlayed(0)).toBe(false); // never played
    expect(isBrieflyPlayed(3)).toBe(false); // 0.1 hours is shown as-is
    expect(isBrieflyPlayed(600)).toBe(false);
  });

  it("trims and collapses whitespace and removes invisible characters", () => {
    expect(cleanText("THE GAME OF LIFE ")).toBe("THE GAME OF LIFE");
    expect(cleanText("Yu-Gi-Oh!  Master Duel")).toBe("Yu-Gi-Oh! Master Duel");
    expect(cleanText("Line\nbreak\tand\u0007bell")).toBe("Line break andbell");
    expect(cleanText("zero\u200Bwidth \u202Eflipped")).toBe("zerowidth flipped");
    expect(cleanText("hidden\u{E0049}\u{E0047}tag")).toBe("hiddentag");
    expect(gameName("   ", 42)).toBe("App 42");
  });

  it("caps the length of text that comes from other people", () => {
    expect(gameName("x".repeat(500), 1)).toHaveLength(100);
    expect(gameName("x".repeat(500), 1).endsWith("…")).toBe(true);
    expect(cleanText("y".repeat(1000))).toHaveLength(300);
  });
});

describe("get_owned_games data quality", () => {
  it("leaves software out by default and keeps totals to games only", async () => {
    const data = await callTool("get_owned_games");
    const names = data.games.map((game: Game) => game.name);

    expect(names).not.toContain("Soundpad"); // store type 6 (software)
    expect(names).not.toContain("EVGA Precision X1"); // store type 13 (tool)
    expect(names).not.toContain("Wallpaper Engine"); // not in the store lookup, caught by the fallback list
    expect(data.software_count).toBe(3);
    expect(data.software_included).toBe(false);
    expect(data.game_count).toBe(11);
    // 64488+1488+2+0+0+102+348+936+1002+60+36 = 68,462 minutes = 1141.0 hours (without software)
    expect(data.total_hours).toBe(1141);
    expect(data.note).toBeUndefined();
  });

  it("includes software, flagged, when include_software is true", async () => {
    const data = await callTool("get_owned_games", { include_software: true });
    const games = byName(data.games);
    expect(data.game_count).toBe(14);
    expect(data.software_count).toBe(3); // same field, same value, whichever way you ask
    expect(data.software_included).toBe(true);
    expect(games["Soundpad"].is_software).toBe(true);
    expect(games["Wallpaper Engine"].is_software).toBe(true);
    expect(games["Garry's Mod"].is_software).toBeUndefined();
  });

  it('shows "unknown" for junk dates, "never" for unplayed, and flags brief sessions', async () => {
    const data = await callTool("get_owned_games");
    const games = byName(data.games);
    expect(games["Killing Floor"]).toMatchObject({ hours_total: 24.8, last_played: "unknown" });
    expect(games["Scribblenauts Unlimited"]).toMatchObject({
      hours_total: 0.03,
      last_played: "2018-10-24",
      briefly_played: true,
    });
    expect(games["STAR WARS™ Battlefront™ II"]).toMatchObject({
      hours_total: 0,
      last_played: "2026-06-07",
      briefly_played: true,
    });
    expect(games["Titanfall® 2"]).toEqual(expect.objectContaining({ hours_total: 0, last_played: "never" }));
    expect(games["Titanfall® 2"].briefly_played).toBeUndefined();
    expect(games["Garry's Mod"].briefly_played).toBeUndefined();
  });

  it("always returns numbers for hours", async () => {
    const data = await callTool("get_owned_games", { include_software: true });
    for (const game of data.games) {
      expect(typeof game.hours_total).toBe("number");
      expect(typeof game.hours_last_2_weeks).toBe("number");
    }
  });

  it("only counts truly unplayed games as never played", async () => {
    const data = await callTool("get_owned_games");
    expect(data.never_played_count).toBe(1); // Titanfall 2; Battlefront II was opened
  });

  it("cleans up names", async () => {
    const names = (await callTool("get_owned_games")).games.map((game: Game) => game.name);
    expect(names).toContain("THE GAME OF LIFE");
    expect(names).toContain("Yu-Gi-Oh! Master Duel");
  });

  it("flags playtests by name or store type, without hiding them", async () => {
    const games = byName((await callTool("get_owned_games")).games);
    expect(games["THE FINALS PLAYTEST"].is_playtest).toBe(true);
    expect(games["MultiVersus – Technical Test"].is_playtest).toBe(true);
    expect(games["Project Nightfall"].is_playtest).toBe(true); // store type 12 only
    expect(games["Poppy Playtime"].is_playtest).toBeUndefined();
    expect(games["Garry's Mod"].is_playtest).toBeUndefined();
  });

  it("still sorts by exact minutes, so brief sessions rank above never-played games", async () => {
    const names = (await callTool("get_owned_games")).games.map((game: Game) => game.name);
    expect(names[0]).toBe("Garry's Mod");
    expect(names.indexOf("Scribblenauts Unlimited")).toBeLessThan(names.indexOf("Titanfall® 2"));
  });

  it("falls back to the known-software list if the store lookup fails", async () => {
    mockSteam({ failPaths: ["/IStoreBrowseService/GetItems/v1/"] });
    const data = await callTool("get_owned_games");
    const names = data.games.map((game: Game) => game.name);
    expect(names).not.toContain("Soundpad");
    expect(names).not.toContain("Wallpaper Engine");
    expect(names).toContain("Garry's Mod");
    expect(data.note).toMatch(/only well-known software was detected/);
  });

  it("looks up app types in one batch and caches them", async () => {
    const fetchMock = mockSteam();
    await callTool("get_owned_games");
    await callTool("get_owned_games");
    const typeLookups = fetchMock.mock.calls.filter(([url]) => String(url).includes("IStoreBrowseService/GetItems"));
    expect(typeLookups).toHaveLength(1);
    expect(String(typeLookups[0][0])).not.toContain("key="); // the lookup doesn't need the API key
  });

  it("keeps the old inputs working", async () => {
    mockSteam();
    vi.stubEnv("STEAM_ID", MY_STEAM_ID);
    const data = await callTool("get_owned_games", { limit: 2 });
    expect(data.showing).toBe(2);
  });
});

describe("get_recently_played data quality", () => {
  it("uses numeric hours, clean names and playtest flags", async () => {
    const data = await callTool("get_recently_played");
    expect(data.games).toEqual([
      { name: "THE FINALS PLAYTEST", appid: 2076040, hours_last_2_weeks: 0.03, hours_total: 15.6, is_playtest: true },
      { name: "THE GAME OF LIFE", appid: 403120, hours_last_2_weeks: 0, hours_total: 1.7 },
    ]);
    expect(data.hours_last_2_weeks).toBe(0);
  });
});
