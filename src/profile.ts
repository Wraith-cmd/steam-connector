// Works out which Steam account a tool call is about.
//
// Accepted inputs:
//   - nothing                                   -> the STEAM_ID setting
//   - 76561197960287930                         -> a SteamID64 (17 digits, starts with 7656119)
//   - https://steamcommunity.com/profiles/7656… -> the SteamID64 in the link
//   - https://steamcommunity.com/id/gabelogannewell -> custom name, looked up with Steam
//   - gabelogannewell                           -> custom name, looked up with Steam

import { FriendlyError } from "./errors.js";
import { resolveVanityUrl } from "./steam.js";

const STEAM_ID_64 = /^7656119\d{10}$/;
const VANITY_NAME = /^[A-Za-z0-9_-]{2,32}$/;

const FORMATS_HELP =
  "Try a 17-digit SteamID64 (like 76561197960287930), a profile link " +
  "(steamcommunity.com/profiles/… or steamcommunity.com/id/…), or a custom profile name.";

export type ParsedProfile = { kind: "steamId"; steamId: string } | { kind: "vanity"; name: string };

/** Work out what kind of profile input this is, without calling Steam. */
export function parseProfileInput(input: string): ParsedProfile {
  const text = input.trim();

  if (STEAM_ID_64.test(text)) return { kind: "steamId", steamId: text };

  // A steamcommunity.com link (with or without https://)
  if (/steamcommunity\.com/i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      throw new FriendlyError(`"${text}" doesn't look like a valid Steam profile link. ${FORMATS_HELP}`);
    }
    if (!/^(www\.)?steamcommunity\.com$/i.test(url.hostname)) {
      throw new FriendlyError(`"${text}" isn't a steamcommunity.com profile link. ${FORMATS_HELP}`);
    }
    const [section, value] = url.pathname.split("/").filter(Boolean);
    if (section === "profiles" && value && STEAM_ID_64.test(value)) {
      return { kind: "steamId", steamId: value };
    }
    if (section === "id" && value && VANITY_NAME.test(value)) {
      return { kind: "vanity", name: value };
    }
    throw new FriendlyError(`Couldn't find a profile in the link "${text}". ${FORMATS_HELP}`);
  }

  // Anything else that looks like a link isn't supported.
  if (/[/:]/.test(text)) {
    throw new FriendlyError(`"${text}" isn't a Steam profile. ${FORMATS_HELP}`);
  }

  // Otherwise treat it as a custom profile name.
  if (VANITY_NAME.test(text)) return { kind: "vanity", name: text };

  throw new FriendlyError(`"${text}" isn't a valid Steam profile. ${FORMATS_HELP}`);
}

/** Turn any accepted profile input into a SteamID64, looking up custom names with Steam. */
export async function resolveProfile(input: string | undefined): Promise<string> {
  if (!input || !input.trim()) return getDefaultSteamId();

  const parsed = parseProfileInput(input);
  if (parsed.kind === "steamId") return parsed.steamId;

  const steamId = await resolveVanityUrl(parsed.name);
  if (!steamId) {
    throw new FriendlyError(`No Steam profile uses the custom name "${parsed.name}". ${FORMATS_HELP}`);
  }
  return steamId;
}

function getDefaultSteamId(): string {
  const steamId = process.env.STEAM_ID?.trim();
  if (!steamId) {
    throw new FriendlyError(
      "No profile was given and this server has no STEAM_ID setting. Pass a profile, " +
        "or ask the server owner to set STEAM_ID in Vercel.",
    );
  }
  if (!STEAM_ID_64.test(steamId)) {
    throw new FriendlyError(
      "This server's STEAM_ID setting isn't a valid SteamID64 (17 digits starting with 7656119). " +
        "The server owner should fix it in Vercel.",
    );
  }
  return steamId;
}
