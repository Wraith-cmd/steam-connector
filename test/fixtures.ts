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

// ---------- Fixtures for the newer tools ----------

export const friendOwnedGames = {
  response: {
    game_count: 3,
    games: [
      { appid: 620, name: "Portal 2", playtime_forever: 600 },
      { appid: 105600, name: "Terraria", playtime_forever: 3000 },
      { appid: 730, name: "Counter-Strike 2", playtime_forever: 9000 },
    ],
  },
};

// Extra store pages, so handheld and wishlist checks have more than one game to look at.
export const moreAppDetails: Record<string, unknown> = {
  "413150": {
    success: true,
    data: {
      type: "game",
      name: "Stardew Valley",
      steam_appid: 413150,
      is_free: false,
      controller_support: "full",
      platforms: { windows: true, mac: true, linux: true },
      price_overview: { initial: 1499, final: 1499, discount_percent: 0, initial_formatted: "", final_formatted: "$14.99" },
    },
  },
  "1145360": {
    success: true,
    data: {
      type: "game",
      name: "Hades",
      steam_appid: 1145360,
      is_free: false,
      controller_support: "full",
      platforms: { windows: true, mac: true, linux: false },
      price_overview: { initial: 2499, final: 1249, discount_percent: 50, initial_formatted: "$24.99", final_formatted: "$12.49" },
    },
  },
  "105600": {
    success: true,
    data: {
      type: "game",
      name: "Terraria",
      steam_appid: 105600,
      is_free: false,
      platforms: { windows: true, mac: true, linux: true },
      price_overview: { initial: 999, final: 999, discount_percent: 0, initial_formatted: "", final_formatted: "$9.99" },
    },
  },
};

// Shaped like store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport
export const deckReports: Record<string, unknown> = {
  "620": {
    success: 1,
    results: {
      appid: 620,
      resolved_category: 3,
      resolved_items: [
        { display_type: 4, loc_token: "#SteamDeckVerified_TestResult_DefaultControllerConfigFullyFunctional" },
        { display_type: 4, loc_token: "#SteamDeckVerified_TestResult_InterfaceTextIsLegible" },
      ],
    },
  },
  "413150": { success: 1, results: { appid: 413150, resolved_category: 2, resolved_items: [] } },
  "1145360": { success: 1, results: { appid: 1145360, resolved_category: 1, resolved_items: [] } },
};

export const wishlist = {
  response: {
    items: [
      { appid: 1145360, priority: 2, date_added: 1735689600 },
      { appid: 413150, priority: 1, date_added: 1704067200 },
      { appid: 999999999, priority: 3, date_added: 1735689600 },
    ],
  },
};

// Shaped like ISteamUserStats/GetPlayerAchievements/v1
export const portal2Achievements = {
  playerstats: {
    steamID: MY_STEAM_ID,
    gameName: "Portal 2",
    success: true,
    achievements: [
      { apiname: "ACH_WAKE_UP", achieved: 1, unlocktime: 1700000000, name: "Wake Up Call", description: "Survive the manual override." },
      { apiname: "ACH_RARE", achieved: 0, unlocktime: 0, name: "Rare One", description: "Hard to get." },
      { apiname: "ACH_COMMON", achieved: 0, unlocktime: 0, name: "Common One", description: "" },
    ],
  },
};

export const stardewAchievements = {
  playerstats: {
    gameName: "Stardew Valley",
    success: true,
    achievements: [
      { apiname: "A", achieved: 1, name: "Greenhorn", description: "Earn 15,000g" },
      { apiname: "B", achieved: 1, name: "Cowpoke", description: "Earn 50,000g" },
    ],
  },
};

// Some games send percentages as strings, so mix both here.
export const portal2GlobalPercentages = {
  achievementpercentages: {
    achievements: [
      { name: "ACH_WAKE_UP", percent: 95.1 },
      { name: "ACH_COMMON", percent: "60.25" },
      { name: "ACH_RARE", percent: 2.04 },
    ],
  },
};

export const portal2Reviews = {
  success: 1,
  query_summary: { num_reviews: 0, review_score: 9, review_score_desc: "Overwhelmingly Positive", total_positive: 980, total_negative: 20, total_reviews: 1000 },
  reviews: [],
};

// ---------- A messy library, modelled on real Steam data ----------

export const MESSY_STEAM_ID = "76561198000000003";

export const messyOwnedGames = {
  response: {
    game_count: 14,
    games: [
      { appid: 4000, name: "Garry's Mod", playtime_forever: 64488, rtime_last_played: 1768089600 },
      // Old games where Steam sends a junk timestamp (about a day after 1970).
      { appid: 1250, name: "Killing Floor", playtime_forever: 1488, rtime_last_played: 86400 },
      // Opened briefly: 2 minutes rounds to 0.0 hours.
      { appid: 218680, name: "Scribblenauts Unlimited", playtime_forever: 2, rtime_last_played: 1540339200 },
      // Opened (has a real date) but Steam recorded 0 minutes.
      { appid: 1237950, name: "STAR WARS™ Battlefront™ II", playtime_forever: 0, rtime_last_played: 1780790400 },
      // Never played.
      { appid: 1237970, name: "Titanfall® 2", playtime_forever: 0, rtime_last_played: 0 },
      // Messy names.
      { appid: 403120, name: "THE GAME OF LIFE ", playtime_forever: 102, rtime_last_played: 1576281600 },
      { appid: 1449850, name: "Yu-Gi-Oh!  Master Duel", playtime_forever: 348, rtime_last_played: 1674172800 },
      // Software: Soundpad is type 6 in the store, EVGA is type 13 (tool),
      // and Wallpaper Engine is missing from the store lookup (caught by the fallback list).
      { appid: 629520, name: "Soundpad", playtime_forever: 18444, rtime_last_played: 1765756800 },
      { appid: 268850, name: "EVGA Precision X1", playtime_forever: 78, rtime_last_played: 1711497600 },
      { appid: 431960, name: "Wallpaper Engine", playtime_forever: 9762, rtime_last_played: 1788739200 },
      // Playtests: two recognised by name, one only by its store type (12 = beta).
      { appid: 2076040, name: "THE FINALS PLAYTEST", playtime_forever: 936, rtime_last_played: 1698796800 },
      { appid: 1829770, name: "MultiVersus – Technical Test", playtime_forever: 1002, rtime_last_played: 1653350400 },
      { appid: 3000001, name: "Project Nightfall", playtime_forever: 60, rtime_last_played: 1700000000 },
      // Not a playtest, even though the name starts with "Play".
      { appid: 1721470, name: "Poppy Playtime", playtime_forever: 36, rtime_last_played: 1677888000 },
    ],
  },
};

export const messyRecentlyPlayed = {
  response: {
    total_count: 2,
    games: [
      { appid: 2076040, name: "THE FINALS PLAYTEST", playtime_2weeks: 2, playtime_forever: 936 },
      { appid: 403120, name: "THE GAME OF LIFE ", playtime_2weeks: 0, playtime_forever: 102 },
    ],
  },
};

// What IStoreBrowseService/GetItems reports as each app's type (6 software, 12 beta, 13 tool, 0 game).
// Apps missing here are left out of the response, as Steam does for apps without a store entry.
export const storeTypes: Record<number, number> = {
  4000: 0,
  1250: 0,
  218680: 0,
  1237950: 0,
  1237970: 0,
  403120: 0,
  1449850: 0,
  629520: 6,
  268850: 13,
  2076040: 12,
  1829770: 0,
  3000001: 12,
  1721470: 0,
  620: 0,
  413150: 0,
  1145360: 0,
  105600: 0,
};
