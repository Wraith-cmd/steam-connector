// The MCP tools Claude can call. Each tool:
//   1. works out which Steam account to use (resolveProfile)
//   2. asks Steam for data (steam.ts for your account, store.ts for the store)
//   3. returns a tidy JSON summary, or a friendly error message

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FriendlyError, toToolError } from "./errors.js";
import { type AppKinds, classifyApps } from "./classify.js";
import {
  cleanText,
  decodeEntities,
  gameName,
  isBrieflyPlayed,
  lastPlayedLabel,
  minutesToHours,
  preciseHours,
  unixToDate,
} from "./format.js";
import { DECK_LABELS, handheldVerdict } from "./handheld.js";
import { mapLimited } from "./http.js";
import { resolveProfile } from "./profile.js";
import {
  type OwnedGame,
  getGlobalAchievementPercentages,
  getOwnedGames,
  getPlayerAchievements,
  getPlayerSummary,
  getRecentlyPlayedGames,
  getWishlist,
} from "./steam.js";
import {
  type AppDetails,
  controllerSupport,
  type DeckRating,
  getAppDetails,
  getDeckRating,
  getReviewSummary,
  pcRequirements,
} from "./store.js";

const appidInput = z.coerce.number().int().positive();

const profileInput = z
  .string()
  .max(200)
  .optional()
  .describe(
    "Optional Steam profile: a SteamID64, a steamcommunity.com/profiles/… or /id/… link, " +
      "or a custom profile name. Leave empty for the server owner's own profile.",
  );

// These tools only read data, never change anything.
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

const PRIVATE_GAMES_MESSAGE =
  "This Steam profile's game details are private, so Steam won't share its games. " +
  "To fix it: on Steam, open your profile → Edit Profile → Privacy Settings, and set both " +
  '"My profile" and "Game details" to Public. Changes can take a few minutes to show up.';

/** Wrap data as an MCP tool result. */
function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_owned_games",
    {
      title: "Get owned games",
      description:
        "List every game in a Steam library with total hours, hours in the last 2 weeks, and the last played " +
        "date, sorted by total hours (most played first). Also reports how many games have never been played. " +
        "Hours are numbers; briefly_played: true marks games opened for only a few minutes. " +
        'last_played is a date, "unknown" (played, but Steam has no date), or "never". Software such as ' +
        "Soundpad or Wallpaper Engine is left out unless include_software is true; software_count always says " +
        "how many software apps the library has. Playtests are marked is_playtest. " +
        "Use this to understand someone's taste and backlog before recommending what to play.",
      inputSchema: z.object({
        profile: profileInput,
        limit: z
          .number()
          .int()
          .min(1)
          .max(10000)
          .optional()
          .describe("Optional: only return the top N games by total hours. Leave empty for all games."),
        include_software: z
          .boolean()
          .optional()
          .describe("Include software and tools (like Soundpad or Wallpaper Engine) as well as games. Default false."),
      }),
      annotations: readOnly,
    },
    async ({ profile, limit, include_software }) => {
      try {
        const steamId = await resolveProfile(profile);
        const games = await getOwnedGames(steamId);
        if (games === null) throw new FriendlyError(PRIVATE_GAMES_MESSAGE);

        const kinds = await classifyApps(games.map((game) => game.appid));
        const visible = include_software ? games : games.filter((game) => !kinds.isSoftware(game.appid));

        const list = [...visible]
          .sort(
            (a, b) =>
              (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0) ||
              gameName(a.name, a.appid).localeCompare(gameName(b.name, b.appid)),
          )
          .map((game) => describeGame(game, kinds));

        // Totals count only what's shown, so software doesn't inflate them.
        const totalMinutes = visible.reduce((sum, game) => sum + (game.playtime_forever ?? 0), 0);
        const shown = limit ? list.slice(0, limit) : list;

        return jsonResult({
          steam_id: steamId,
          game_count: visible.length,
          never_played_count: list.filter((game) => game.last_played === "never").length,
          total_hours: minutesToHours(totalMinutes),
          software_count: games.filter((game) => kinds.isSoftware(game.appid)).length,
          software_included: include_software === true,
          ...(!kinds.complete && {
            note: "Steam's app-type lookup failed, so only well-known software was detected.",
          }),
          showing: shown.length,
          games: shown,
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_recently_played",
    {
      title: "Get recently played games",
      description:
        "List the games played in the last 2 weeks, with hours played in that period and total hours. " +
        "Use this to see what someone is into right now.",
      inputSchema: z.object({ profile: profileInput }),
      annotations: readOnly,
    },
    async ({ profile }) => {
      try {
        const steamId = await resolveProfile(profile);
        const games = await getRecentlyPlayedGames(steamId);
        if (games === null) throw new FriendlyError(PRIVATE_GAMES_MESSAGE);

        const kinds = await classifyApps(games.map((game) => game.appid));
        const list = [...games]
          .sort((a, b) => (b.playtime_2weeks ?? 0) - (a.playtime_2weeks ?? 0))
          .map((game) => {
            const name = gameName(game.name, game.appid);
            return {
              name,
              appid: game.appid,
              hours_last_2_weeks: preciseHours(game.playtime_2weeks),
              hours_total: preciseHours(game.playtime_forever),
              // Every game here was played in the last 2 weeks, so it was opened even if Steam recorded 0 minutes.
              ...(isBrieflyPlayed(game.playtime_forever, true) && { briefly_played: true as const }),
              ...appFlags(game.appid, name, kinds),
            };
          });
        const minutes2Weeks = games.reduce((sum, game) => sum + (game.playtime_2weeks ?? 0), 0);

        return jsonResult({
          steam_id: steamId,
          game_count: list.length,
          hours_last_2_weeks: minutesToHours(minutes2Weeks),
          games: list,
          ...(list.length === 0 && { note: "No games played in the last 2 weeks." }),
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_game_details",
    {
      title: "Get game details",
      description:
        "Look up a game's Steam store page by appid: genres, categories (like Single-player or Co-op), " +
        "short description, release date, current price, user review score, controller support, " +
        "Steam Deck rating with Valve's test notes, and minimum and recommended PC requirements. " +
        "Get appids from get_owned_games or get_recently_played.",
      inputSchema: z.object({
        appid: appidInput.describe("The game's Steam appid, for example 620 for Portal 2."),
      }),
      annotations: readOnly,
    },
    async ({ appid }) => {
      try {
        const details = await getAppDetails(appid);
        if (!details) {
          throw new FriendlyError(
            `No Steam store page was found for appid ${appid}. Double-check the number; ` +
              "some games have been removed from the store, and some appids belong to tools or DLC.",
          );
        }

        // Reviews and the Deck rating are a bonus: if a lookup fails, still return the rest.
        const [reviews, deck] = await Promise.all([getReviewSummary(appid).catch(() => undefined), deckRatingOrUnknown(appid)]);

        return jsonResult({
          appid: details.steam_appid,
          name: gameName(details.name, details.steam_appid),
          type: details.type,
          short_description: cleanText(decodeEntities(details.short_description ?? "")),
          genres: details.genres?.map((genre) => genre.description) ?? [],
          categories: details.categories?.map((category) => category.description) ?? [],
          release_date: cleanText(details.release_date?.date, 40) || "unknown",
          coming_soon: details.release_date?.coming_soon ?? false,
          price: describePrice(details),
          reviews: reviews === undefined ? "unavailable right now" : (reviews ?? "no reviews yet"),
          controller_support: controllerSupport(details),
          steam_deck: { rating: DECK_LABELS[deck.category], notes: deck.notes },
          pc_requirements: pcRequirements(details),
          store_url: `https://store.steampowered.com/app/${details.steam_appid}/`,
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_player_summary",
    {
      title: "Get player summary",
      description:
        "Get a Steam profile's display name and profile URL, and check whether the profile and its game details " +
        "are public. Use this to troubleshoot when other tools say a profile is private.",
      inputSchema: z.object({ profile: profileInput }),
      annotations: readOnly,
    },
    async ({ profile }) => {
      try {
        const steamId = await resolveProfile(profile);
        const player = await getPlayerSummary(steamId);
        if (!player) {
          throw new FriendlyError(`No Steam account exists with the SteamID64 ${steamId}.`);
        }

        const profilePublic = player.communityvisibilitystate === 3;
        // Steam doesn't report the "Game details" setting directly, so we test it:
        // asking for the game list only works when game details are public.
        const gameDetailsPublic = profilePublic && (await getOwnedGames(steamId, false)) !== null;

        return jsonResult({
          steam_id: steamId,
          display_name: cleanText(player.personaname, 64),
          profile_url: player.profileurl,
          profile_public: profilePublic,
          game_details_public: gameDetailsPublic,
          ...(!gameDetailsPublic && { how_to_fix: PRIVATE_GAMES_MESSAGE }),
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "check_handheld_compatibility",
    {
      title: "Check handheld compatibility",
      description:
        "Check how well games play on a handheld gaming PC such as the ROG Ally, Legion Go, MSI Claw, or Steam Deck. " +
        "Combines Valve's Steam Deck rating with the game's controller support, and explains the verdict. " +
        "Checks up to 10 appids per call; get appids from get_owned_games first to check a library.",
      inputSchema: z.object({
        appids: z.array(appidInput).min(1).max(10).describe("Up to 10 Steam appids to check."),
      }),
      annotations: readOnly,
    },
    async ({ appids }) => {
      try {
        const games = await mapLimited([...new Set(appids)], 5, async (appid) => {
          const details = await getAppDetails(appid);
          if (!details) return { appid, error: "No Steam store page for this appid." };

          // If the Deck rating can't be fetched, judge on controller support alone.
          const deck = await deckRatingOrUnknown(appid);
          const controller = controllerSupport(details);
          const verdict = handheldVerdict(deck, controller, details.platforms?.windows ?? true);
          return {
            appid,
            name: gameName(details.name, appid),
            handheld_rating: verdict.rating,
            explanation: verdict.explanation,
            steam_deck_rating: DECK_LABELS[deck.category],
            controller_support: controller,
            steam_deck_notes: deck.notes,
          };
        });
        return jsonResult({ games });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_achievement_progress",
    {
      title: "Get achievement progress",
      description:
        "Show how close a player is to 100% achievements in one game: unlocked vs total, and the locked " +
        "achievements sorted easiest first (by how many players worldwide have them). " +
        "Use it to plan a 100% run or to find games that are nearly complete.",
      inputSchema: z.object({
        appid: appidInput.describe("The game's Steam appid."),
        profile: profileInput,
      }),
      annotations: readOnly,
    },
    async ({ appid, profile }) => {
      try {
        const steamId = await resolveProfile(profile);
        const result = await getPlayerAchievements(steamId, appid);
        if (result.kind === "private") throw new FriendlyError(PRIVATE_GAMES_MESSAGE);
        if (result.kind === "no_achievements") {
          throw new FriendlyError(`This game (appid ${appid}) has no Steam achievements to track.`);
        }

        // Rarity is a bonus: without it, locked achievements just keep Steam's order.
        const rarity = await getGlobalAchievementPercentages(appid).catch(() => new Map<string, number>());
        const total = result.achievements.length;
        const unlocked = result.achievements.filter((achievement) => achievement.achieved === 1).length;
        const locked = result.achievements
          .filter((achievement) => achievement.achieved !== 1)
          .map((achievement) => ({
            name: cleanText(achievement.name, 100) || cleanText(achievement.apiname, 100),
            description: cleanText(achievement.description) || "(hidden achievement)",
            percent_of_players_who_have_it: rarity.has(achievement.apiname)
              ? Math.round(rarity.get(achievement.apiname)! * 10) / 10
              : null,
          }))
          .sort((a, b) => (b.percent_of_players_who_have_it ?? -1) - (a.percent_of_players_who_have_it ?? -1));

        return jsonResult({
          steam_id: steamId,
          appid,
          game: gameName(result.gameName, appid),
          unlocked,
          total,
          // Round down so 99.96% never shows as 100%.
          percent_complete: Math.floor((unlocked / total) * 1000) / 10,
          is_100_percent: unlocked === total,
          locked_achievements_easiest_first: locked.slice(0, 25),
          ...(locked.length > 25 && { note: `Showing the 25 easiest of ${locked.length} locked achievements.` }),
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_wishlist",
    {
      title: "Get wishlist",
      description:
        "List the games on a Steam wishlist (top-ranked first) with current prices and discounts. " +
        "Use on_sale_only to find wishlist games that are on sale right now.",
      inputSchema: z.object({
        profile: profileInput,
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("How many wishlist games to price-check, top-ranked first. Default 20, max 50."),
        on_sale_only: z.boolean().optional().describe("Only return games that are currently discounted."),
      }),
      annotations: readOnly,
    },
    async ({ profile, limit, on_sale_only }) => {
      try {
        const steamId = await resolveProfile(profile);
        const items = await getWishlist(steamId);
        if (items.length === 0) {
          return jsonResult({
            steam_id: steamId,
            wishlist_count: 0,
            games: [],
            note: "The wishlist is empty, or the profile's game details are private.",
          });
        }

        const ranked = [...items].sort(
          (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || (a.date_added ?? 0) - (b.date_added ?? 0),
        );
        const checked = ranked.slice(0, limit ?? 20);
        const games = await mapLimited(checked, 5, async (item) => {
          const details = await getAppDetails(item.appid);
          const discount = details?.price_overview?.discount_percent ?? 0;
          return {
            name: gameName(details?.name, item.appid),
            appid: item.appid,
            price: details ? describePrice(details) : "Not on the store",
            on_sale: discount > 0,
            discount_percent: discount,
            added_to_wishlist: unixToDate(item.date_added),
          };
        });

        return jsonResult({
          steam_id: steamId,
          wishlist_count: items.length,
          checked: checked.length,
          on_sale_count: games.filter((game) => game.on_sale).length,
          games: on_sale_only ? games.filter((game) => game.on_sale) : games,
          ...(items.length > checked.length && {
            note: `Only the top ${checked.length} of ${items.length} wishlist games were price-checked. Raise limit (max 50) to check more.`,
          }),
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_shared_games",
    {
      title: "Get shared games",
      description:
        "Find games that two players both own, with each player's hours, sorted by combined hours. " +
        "Great for picking something to play together; then use get_game_details to check which " +
        "shared games support co-op or online multiplayer.",
      inputSchema: z.object({
        friend_profile: z
          .string()
          .min(1)
          .max(200)
          .describe("The friend's Steam profile: a SteamID64, a steamcommunity.com profile link, or a custom profile name."),
        profile: profileInput,
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Optional: only return the top N shared games. Default 50."),
      }),
      annotations: readOnly,
    },
    async ({ friend_profile, profile, limit }) => {
      try {
        const [yourId, friendId] = await Promise.all([resolveProfile(profile), resolveProfile(friend_profile)]);
        if (yourId === friendId) throw new FriendlyError("Those are the same Steam profile. Pick a different friend.");

        const [yourGames, friendGames] = await Promise.all([getOwnedGames(yourId), getOwnedGames(friendId)]);
        if (yourGames === null) throw new FriendlyError(PRIVATE_GAMES_MESSAGE);
        if (friendGames === null) {
          throw new FriendlyError(
            "Your friend's game details are private, so Steam won't share their games. They need to set " +
              '"My profile" and "Game details" to Public in their Steam privacy settings.',
          );
        }

        const friendCopies = new Map(friendGames.map((game) => [game.appid, game]));
        const pairs = yourGames
          .filter((game) => friendCopies.has(game.appid))
          .map((game) => ({ yours: game, theirs: friendCopies.get(game.appid)!, name: gameName(game.name, game.appid) }));
        const minutes = (game: OwnedGame) => game.playtime_forever ?? 0;
        pairs.sort(
          (a, b) =>
            minutes(b.yours) + minutes(b.theirs) - (minutes(a.yours) + minutes(a.theirs)) || a.name.localeCompare(b.name),
        );

        const kinds = await classifyApps(pairs.map((pair) => pair.yours.appid));
        const shared = pairs.map(({ yours, theirs, name }) => ({
          name,
          appid: yours.appid,
          your_hours: preciseHours(yours.playtime_forever),
          friend_hours: preciseHours(theirs.playtime_forever),
          ...appFlags(yours.appid, name, kinds),
        }));
        const shown = shared.slice(0, limit ?? 50);

        return jsonResult({
          your_steam_id: yourId,
          friend_steam_id: friendId,
          your_game_count: yourGames.length,
          friend_game_count: friendGames.length,
          shared_count: shared.length,
          showing: shown.length,
          games: shown,
        });
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}

/** One owned game as returned by get_owned_games. */
function describeGame(game: OwnedGame, kinds: AppKinds) {
  const name = gameName(game.name, game.appid);
  const lastPlayed = lastPlayedLabel(game.playtime_forever, game.rtime_last_played);
  return {
    name,
    appid: game.appid,
    hours_total: preciseHours(game.playtime_forever),
    hours_last_2_weeks: preciseHours(game.playtime_2weeks),
    last_played: lastPlayed,
    ...(isBrieflyPlayed(game.playtime_forever, lastPlayed !== "never") && { briefly_played: true as const }),
    ...appFlags(game.appid, name, kinds),
  };
}

/** The Steam Deck rating, or "Unknown" if it can't be fetched (it comes from an unofficial endpoint). */
function deckRatingOrUnknown(appid: number): Promise<DeckRating> {
  return getDeckRating(appid).catch(() => ({ category: 0 as const, notes: ["Steam Deck rating unavailable right now"] }));
}

/** `is_software` / `is_playtest` flags, included only when true to keep output short. */
function appFlags(appid: number, name: string, kinds: AppKinds) {
  return {
    ...(kinds.isSoftware(appid) && { is_software: true as const }),
    ...(kinds.isPlaytest(appid, name) && { is_playtest: true as const }),
  };
}

/** Turn Steam's price info into one readable string, e.g. "$9.99 (50% off, normally $19.99)". */
function describePrice(details: AppDetails): string {
  if (details.is_free) return "Free";
  const price = details.price_overview;
  if (!price) return details.release_date?.coming_soon ? "Not yet priced" : "Not available for purchase";
  if (price.discount_percent > 0) {
    return `${price.final_formatted} (${price.discount_percent}% off, normally ${price.initial_formatted})`;
  }
  return price.final_formatted;
}
