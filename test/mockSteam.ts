// A pretend Steam server. Tests call `mockSteam()` to replace the global `fetch`
// so every request to Steam is answered from test/fixtures.ts instead of the internet.

import { vi } from "vitest";
import * as fx from "./fixtures.js";

export const TEST_API_KEY = "TESTKEY0123456789ABCDEF0123456789";

type Options = {
  /** Make every Steam request fail with this HTTP status. */
  failWithStatus?: number;
  /** Make every Steam request fail as if the network were down. */
  networkDown?: boolean;
  /** Make only requests to these paths fail with HTTP 500. */
  failPaths?: string[];
};

export function mockSteam(options: Options = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
    if (options.networkDown) throw new TypeError(`fetch failed for ${String(input)}`);
    if (options.failWithStatus) return new Response("error", { status: options.failWithStatus });

    const url = new URL(String(input));
    const params = url.searchParams;
    if (options.failPaths?.includes(url.pathname)) return new Response("error", { status: 500 });
    const json = (body: unknown) => Response.json(body);

    // Like real Steam, every Web API method we use needs the key except the store item lookup.
    const keyless = url.pathname === "/IStoreBrowseService/GetItems/v1/";
    if (url.hostname === "api.steampowered.com" && !keyless && params.get("key") !== TEST_API_KEY) {
      return new Response("<html>Forbidden</html>", { status: 403 });
    }

    switch (url.pathname) {
      case "/ISteamUser/ResolveVanityURL/v1/": {
        const steamid = fx.vanityNames[params.get("vanityurl") ?? ""];
        return json({ response: steamid ? { success: 1, steamid } : { success: 42, message: "No match" } });
      }
      case "/IPlayerService/GetOwnedGames/v1/": {
        const steamid = params.get("steamid");
        if (steamid === fx.PRIVATE_STEAM_ID) return json(fx.privateGames);
        if (steamid === fx.MESSY_STEAM_ID) return json(fx.messyOwnedGames);
        return json(steamid === fx.FRIEND_STEAM_ID ? fx.friendOwnedGames : fx.ownedGames);
      }
      case "/IStoreBrowseService/GetItems/v1/": {
        if (params.has("key")) return new Response("this endpoint should not get the key", { status: 400 });
        const input = JSON.parse(params.get("input_json") ?? "{}") as { ids?: { appid: number }[] };
        const items = (input.ids ?? [])
          .filter(({ appid }) => appid in fx.storeTypes)
          .map(({ appid }) => ({ appid, type: fx.storeTypes[appid], success: 1 }));
        return json({ response: { store_items: items } });
      }
      case "/IPlayerService/GetRecentlyPlayedGames/v1/": {
        const steamid = params.get("steamid");
        if (steamid === fx.PRIVATE_STEAM_ID) return json(fx.privateGames);
        return json(steamid === fx.MESSY_STEAM_ID ? fx.messyRecentlyPlayed : fx.recentlyPlayed);
      }
      case "/ISteamUser/GetPlayerSummaries/v2/": {
        const player = fx.playerSummaries[params.get("steamids") ?? ""];
        return json({ response: { players: player ? [player] : [] } });
      }
      case "/api/appdetails": {
        const appid = params.get("appids") ?? "";
        if (appid === "620") return json(fx.portal2Details);
        if (appid === "262060") return json(fx.darkestDungeonDetails);
        if (appid === "440") return json(fx.tf2Details);
        if (appid === "346110") return json(fx.arkDetails);
        return json({ [appid]: fx.moreAppDetails[appid] ?? { success: false } });
      }
      case "/IWishlistService/GetWishlist/v1/":
        return json(params.get("steamid") === fx.MY_STEAM_ID ? fx.wishlist : { response: {} });
      case "/ISteamUserStats/GetPlayerAchievements/v1/": {
        // Real Steam explains these errors in the body of a 403 / 400 response.
        if (params.get("steamid") === fx.PRIVATE_STEAM_ID) {
          return Response.json({ playerstats: { error: "Profile is not public", success: false } }, { status: 403 });
        }
        const appid = params.get("appid");
        if (appid === "620") return json(fx.portal2Achievements);
        if (appid === "413150") return json(fx.stardewAchievements);
        return Response.json({ playerstats: { error: "Requested app has no stats", success: false } }, { status: 400 });
      }
      case "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/":
        return json(params.get("gameid") === "620" ? fx.portal2GlobalPercentages : { achievementpercentages: { achievements: [] } });
      case "/appreviews/620":
        return json(fx.portal2Reviews);
      case "/saleaction/ajaxgetdeckappcompatibilityreport": {
        const appid = params.get("nAppID") ?? "";
        return json(fx.deckReports[appid] ?? { success: 1, results: { appid: Number(appid), resolved_category: 0 } });
      }
      default:
        return new Response("not found", { status: 404 });
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
