// Tests requested by a live audit of a real library: number formatting, totals,
// limits, profile errors, playtest counts, timezones, caching and rate limiting.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../api/mcp.js";
import { minutesToHours, preciseHours, unixToDate } from "../src/format.js";
import { allowRequest, MAX_REQUESTS_PER_MINUTE } from "../src/ratelimit.js";
import { messyOwnedGames, MESSY_STEAM_ID, PRIVATE_STEAM_ID } from "./fixtures.js";
import { mockSteam, TEST_API_KEY } from "./mockSteam.js";

const SECRET = "test-secret-0123456789abcdef-0123456789";

beforeEach(() => {
  vi.stubEnv("MCP_SECRET", SECRET);
  vi.stubEnv("STEAM_API_KEY", TEST_API_KEY);
  vi.stubEnv("STEAM_ID", MESSY_STEAM_ID);
});

function rpc(body: unknown) {
  return handleRequest(
    new Request(`https://app.vercel.app/mcp/${SECRET}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify(body),
    }),
  );
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const text = await response.text();
  const json = text.trimStart().startsWith("{") ? text : text.match(/^data: (.*)$/m)?.[1];
  const result = JSON.parse(json ?? "null").result;
  return { isError: result.isError === true, text: result.content[0].text as string };
}

describe("minutes to hours", () => {
  it.each([
    [0, 0],
    [1, 0.02], // under 0.1 h keeps two decimals so it doesn't look unplayed
    [2, 0.03],
    [3, 0.1], // exactly 0.05 h; rounds half up to 0.1 using whole-number math (3 / 6 = 0.5)
    [6, 0.1],
    [9, 0.2], // 0.15 h, also exact: 9 / 6 = 1.5 rounds up
  ])("%i minutes -> %d hours", (minutes, hours) => {
    expect(preciseHours(minutes)).toBe(hours);
  });
});

describe("get_owned_games totals and limits", () => {
  it("computes total_hours from raw minutes, not from rounded per-game hours", async () => {
    mockSteam();
    const data = JSON.parse((await callTool("get_owned_games")).text);
    const softwareIds = new Set([629520, 268850, 431960]);
    const rawMinutes = messyOwnedGames.response.games
      .filter((game) => !softwareIds.has(game.appid))
      .reduce((sum, game) => sum + game.playtime_forever, 0);
    expect(data.total_hours).toBe(Math.round(rawMinutes / 6) / 10);
    expect(data.total_hours).toBe(minutesToHours(rawMinutes));
  });

  it("limit only changes what's shown; counts stay library-wide", async () => {
    mockSteam();
    const full = JSON.parse((await callTool("get_owned_games")).text);
    const limited = JSON.parse((await callTool("get_owned_games", { limit: 10 })).text);
    expect(limited.showing).toBe(10);
    expect(limited.games).toHaveLength(10);
    expect(limited.game_count).toBe(full.game_count);
    expect(limited.never_played_count).toBe(full.never_played_count);
    expect(limited.playtest_count).toBe(full.playtest_count);
    expect(limited.total_hours).toBe(full.total_hours);
  });
});

describe("profile errors are clear", () => {
  it("private profile", async () => {
    mockSteam();
    const result = await callTool("get_owned_games", { profile: PRIVATE_STEAM_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/game details are private/);
  });

  it("invalid profile name", async () => {
    mockSteam();
    const result = await callTool("get_owned_games", { profile: "not a real name!" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/isn't a valid Steam profile/);
  });

  it("unknown /id/ vanity URL", async () => {
    mockSteam();
    const result = await callTool("get_owned_games", { profile: "https://steamcommunity.com/id/nobodyhasthisname" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/No Steam profile uses the custom name "nobodyhasthisname"/);
  });

  it("known /id/ vanity URL works", async () => {
    mockSteam();
    const result = await callTool("get_owned_games", { profile: "https://steamcommunity.com/id/rabscuttle/" });
    expect(result.isError).toBe(false);
  });
});

describe("timezone for dates", () => {
  // 2025-01-01 03:00 UTC is still the evening of Dec 31 in Mountain Time.
  const lateEvening = Date.UTC(2025, 0, 1, 3, 0) / 1000;

  it("uses UTC by default", () => {
    expect(unixToDate(lateEvening)).toBe("2025-01-01");
  });

  it("uses STEAM_TIMEZONE when set", () => {
    vi.stubEnv("STEAM_TIMEZONE", "America/Denver");
    expect(unixToDate(lateEvening)).toBe("2024-12-31");
  });

  it("falls back to UTC for an unknown timezone", () => {
    vi.stubEnv("STEAM_TIMEZONE", "Mars/Olympus_Mons");
    expect(unixToDate(lateEvening)).toBe("2025-01-01");
  });
});

describe("short-term caching", () => {
  it("asks Steam for the owned games list once for repeat calls", async () => {
    const fetchMock = mockSteam();
    await callTool("get_owned_games");
    await callTool("get_owned_games", { limit: 3 });
    const ownedCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("GetOwnedGames"));
    expect(ownedCalls).toHaveLength(1);
  });

  it("never caches errors", async () => {
    mockSteam({ failWithStatus: 503 });
    expect((await callTool("get_owned_games")).isError).toBe(true);
    mockSteam();
    expect((await callTool("get_owned_games")).isError).toBe(false);
  });
});

describe("rate limiting", () => {
  it(`allows ${MAX_REQUESTS_PER_MINUTE} requests per minute, then refuses until the window passes`, () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i++) expect(allowRequest(start + i)).toBe(true);
    expect(allowRequest(start + 500)).toBe(false);
    expect(allowRequest(start + 60_001)).toBe(true);
  });

  it("answers 429 once the limit is reached", async () => {
    mockSteam();
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i++) allowRequest();
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
