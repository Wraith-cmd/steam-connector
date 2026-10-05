// The four MCP tools Claude can call. Each tool:
//   1. works out which Steam account to use (resolveProfile)
//   2. asks Steam for data (steam.ts)
//   3. returns a tidy JSON summary, or a friendly error message

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FriendlyError, toToolError } from "./errors.js";
import { decodeEntities, minutesToHours, unixToDate } from "./format.js";
import { resolveProfile } from "./profile.js";
import { type AppDetails, getAppDetails, getOwnedGames, getPlayerSummary, getRecentlyPlayedGames } from "./steam.js";

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
      }),
      annotations: readOnly,
    },
    async ({ profile, limit }) => {
      try {
        const steamId = await resolveProfile(profile);
        const games = await getOwnedGames(steamId);
        if (games === null) throw new FriendlyError(PRIVATE_GAMES_MESSAGE);

        const list = games
          .map((game) => ({
            name: game.name ?? `App ${game.appid}`,
            appid: game.appid,
            hours_total: minutesToHours(game.playtime_forever),
            hours_last_2_weeks: minutesToHours(game.playtime_2weeks),
            last_played: unixToDate(game.rtime_last_played) ?? "never",
          }))
          .sort((a, b) => b.hours_total - a.hours_total || a.name.localeCompare(b.name));

        const totalMinutes = games.reduce((sum, game) => sum + (game.playtime_forever ?? 0), 0);
        const shown = limit ? list.slice(0, limit) : list;

        return jsonResult({
          steam_id: steamId,
          game_count: games.length,
          never_played_count: games.filter((game) => !game.playtime_forever).length,
          total_hours: minutesToHours(totalMinutes),
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

        const list = games
          .map((game) => ({
            name: game.name ?? `App ${game.appid}`,
            appid: game.appid,
            hours_last_2_weeks: minutesToHours(game.playtime_2weeks),
            hours_total: minutesToHours(game.playtime_forever),
          }))
          .sort((a, b) => b.hours_last_2_weeks - a.hours_last_2_weeks);

        return jsonResult({
          steam_id: steamId,
          game_count: list.length,
          hours_last_2_weeks: Math.round(list.reduce((sum, game) => sum + game.hours_last_2_weeks, 0) * 10) / 10,
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
        "short description, release date, and current price. Get appids from get_owned_games or get_recently_played.",
      inputSchema: z.object({
        appid: z.coerce.number().int().positive().describe("The game's Steam appid, for example 620 for Portal 2."),
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

        return jsonResult({
          appid: details.steam_appid,
          name: details.name,
          type: details.type,
          short_description: decodeEntities(details.short_description ?? ""),
          genres: details.genres?.map((genre) => genre.description) ?? [],
          categories: details.categories?.map((category) => category.description) ?? [],
          release_date: details.release_date?.date || "unknown",
          coming_soon: details.release_date?.coming_soon ?? false,
          price: describePrice(details),
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
          display_name: player.personaname,
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
