import { describe, expect, it, vi } from "vitest";
import { FriendlyError } from "../src/errors.js";
import { parseProfileInput, resolveProfile } from "../src/profile.js";
import { FRIEND_STEAM_ID, MY_STEAM_ID } from "./fixtures.js";
import { mockSteam, TEST_API_KEY } from "./mockSteam.js";

describe("parseProfileInput", () => {
  it.each([
    ["76561197960287930", { kind: "steamId", steamId: "76561197960287930" }],
    ["  76561197960287930  ", { kind: "steamId", steamId: "76561197960287930" }],
    ["https://steamcommunity.com/profiles/76561197960287930", { kind: "steamId", steamId: "76561197960287930" }],
    ["https://steamcommunity.com/profiles/76561197960287930/", { kind: "steamId", steamId: "76561197960287930" }],
    ["steamcommunity.com/profiles/76561197960287930", { kind: "steamId", steamId: "76561197960287930" }],
    ["http://www.steamcommunity.com/profiles/76561197960287930/games", { kind: "steamId", steamId: "76561197960287930" }],
    ["https://steamcommunity.com/id/gabelogannewell", { kind: "vanity", name: "gabelogannewell" }],
    ["https://steamcommunity.com/id/gabelogannewell/?l=english", { kind: "vanity", name: "gabelogannewell" }],
    ["gabelogannewell", { kind: "vanity", name: "gabelogannewell" }],
    ["cool_name-99", { kind: "vanity", name: "cool_name-99" }],
    ["12345", { kind: "vanity", name: "12345" }], // numbers that aren't SteamID64s may be custom names
  ])("understands %s", (input, expected) => {
    expect(parseProfileInput(input)).toEqual(expected);
  });

  it.each([
    "https://steamcommunity.com/profiles/12345", // not a real SteamID64
    "https://steamcommunity.com/groups/somegroup", // a group, not a profile
    "https://steamcommunity.com/",
    "https://steamcommunity.com.evil.example/id/someone", // look-alike domain
    "https://example.com/id/someone",
    "has spaces in it",
    "emoji🎮name",
    "x",
    "a".repeat(40),
  ])("rejects %s with a friendly error", (input) => {
    expect(() => parseProfileInput(input)).toThrow(FriendlyError);
  });
});

describe("resolveProfile", () => {
  it("uses STEAM_ID when no profile is given", async () => {
    vi.stubEnv("STEAM_ID", MY_STEAM_ID);
    expect(await resolveProfile(undefined)).toBe(MY_STEAM_ID);
    expect(await resolveProfile("   ")).toBe(MY_STEAM_ID);
  });

  it("explains when STEAM_ID is missing or invalid", async () => {
    vi.stubEnv("STEAM_ID", "");
    await expect(resolveProfile(undefined)).rejects.toThrow(/no STEAM_ID setting/);
    vi.stubEnv("STEAM_ID", "not-an-id");
    await expect(resolveProfile(undefined)).rejects.toThrow(/isn't a valid SteamID64/);
  });

  it("returns a SteamID64 directly without calling Steam", async () => {
    const fetchMock = mockSteam();
    expect(await resolveProfile(FRIEND_STEAM_ID)).toBe(FRIEND_STEAM_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks up custom names and /id/ links with ResolveVanityURL", async () => {
    vi.stubEnv("STEAM_API_KEY", TEST_API_KEY);
    mockSteam();
    expect(await resolveProfile("friendlyfriend")).toBe(FRIEND_STEAM_ID);
    expect(await resolveProfile("https://steamcommunity.com/id/rabscuttle/")).toBe(MY_STEAM_ID);
  });

  it("gives a friendly error when the custom name doesn't exist", async () => {
    vi.stubEnv("STEAM_API_KEY", TEST_API_KEY);
    mockSteam();
    await expect(resolveProfile("nobodyhasthisname")).rejects.toThrow(/No Steam profile uses the custom name/);
  });
});
