// Fake Steam responses, shaped like the real ones, so tests never need the internet.

export const MY_STEAM_ID = "76561197960287930";
export const FRIEND_STEAM_ID = "76561198000000001";
export const PRIVATE_STEAM_ID = "76561198000000002";

export const ownedGames = {
  response: {
    game_count: 4,
    games: [
      { appid: 620, name: "Portal 2", playtime_forever: 1250, playtime_2weeks: 0, rtime_last_played: 1700000000 },
      { appid: 413150, name: "Stardew Valley", playtime_forever: 6005, playtime_2weeks: 125, rtime_last_played: 1759500000 },
      { appid: 1145360, name: "Hades", playtime_forever: 90, rtime_last_played: 1735689600 },
      { appid: 105600, name: "Terraria", playtime_forever: 0, rtime_last_played: 0 },
    ],
  },
};

export const recentlyPlayed = {
  response: {
    total_count: 2,
    games: [
      { appid: 1145360, name: "Hades", playtime_2weeks: 30, playtime_forever: 90 },
      { appid: 413150, name: "Stardew Valley", playtime_2weeks: 125, playtime_forever: 6005 },
    ],
  },
};

// What Steam sends when a profile's game details are private.
export const privateGames = { response: {} };

export const playerSummaries: Record<string, unknown> = {
  [MY_STEAM_ID]: {
    steamid: MY_STEAM_ID,
    personaname: "Rabscuttle",
    profileurl: "https://steamcommunity.com/id/rabscuttle/",
    communityvisibilitystate: 3,
  },
  [PRIVATE_STEAM_ID]: {
    steamid: PRIVATE_STEAM_ID,
    personaname: "Hidden Player",
    profileurl: `https://steamcommunity.com/profiles/${PRIVATE_STEAM_ID}/`,
    communityvisibilitystate: 1,
  },
};

export const vanityNames: Record<string, string> = {
  rabscuttle: MY_STEAM_ID,
  friendlyfriend: FRIEND_STEAM_ID,
};

export const portal2Details = {
  "620": {
    success: true,
    data: {
      type: "game",
      name: "Portal 2",
      steam_appid: 620,
      is_free: false,
      short_description: "The &quot;Perpetual Testing Initiative&quot; has been expanded.",
      genres: [{ id: "1", description: "Action" }, { id: "25", description: "Adventure" }],
      categories: [{ id: 2, description: "Single-player" }, { id: 9, description: "Co-op" }],
      release_date: { coming_soon: false, date: "18 Apr, 2011" },
      price_overview: {
        currency: "USD",
        initial: 999,
        final: 199,
        discount_percent: 80,
        initial_formatted: "$9.99",
        final_formatted: "$1.99",
      },
    },
  },
};
