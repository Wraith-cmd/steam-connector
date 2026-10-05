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
};

export function mockSteam(options: Options = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
    if (options.networkDown) throw new TypeError(`fetch failed for ${String(input)}`);
    if (options.failWithStatus) return new Response("error", { status: options.failWithStatus });

    const url = new URL(String(input));
    const params = url.searchParams;
    const json = (body: unknown) => Response.json(body);

    if (url.hostname === "api.steampowered.com" && params.get("key") !== TEST_API_KEY) {
      return new Response("<html>Forbidden</html>", { status: 403 });
    }

    switch (url.pathname) {
      case "/ISteamUser/ResolveVanityURL/v1/": {
        const steamid = fx.vanityNames[params.get("vanityurl") ?? ""];
        return json({ response: steamid ? { success: 1, steamid } : { success: 42, message: "No match" } });
      }
      case "/IPlayerService/GetOwnedGames/v1/":
        return json(params.get("steamid") === fx.PRIVATE_STEAM_ID ? fx.privateGames : fx.ownedGames);
      case "/IPlayerService/GetRecentlyPlayedGames/v1/":
        return json(params.get("steamid") === fx.PRIVATE_STEAM_ID ? fx.privateGames : fx.recentlyPlayed);
      case "/ISteamUser/GetPlayerSummaries/v2/": {
        const player = fx.playerSummaries[params.get("steamids") ?? ""];
        return json({ response: { players: player ? [player] : [] } });
      }
      case "/api/appdetails": {
        const appid = params.get("appids") ?? "";
        return json(appid === "620" ? fx.portal2Details : { [appid]: { success: false } });
      }
      default:
        return new Response("not found", { status: 404 });
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
