# Steam Connector for Claude

Let Claude look at your Steam library (your games, how long you've played them, and what you've played recently) so it can recommend what to play next.

This is a small **remote MCP server**. MCP (Model Context Protocol) is the standard way to give Claude new tools. You deploy your own copy to Vercel for free, paste its URL into claude.ai as a **custom connector**, and Claude can then read your Steam data when you ask it to.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FWraith-cmd%2Fsteam-connector&env=STEAM_API_KEY,STEAM_ID,MCP_SECRET&envDescription=Your%20Steam%20Web%20API%20key%2C%20your%2017-digit%20SteamID64%2C%20and%20a%20long%20random%20secret%20for%20your%20connector%20URL%20%28generate%20one%20with%3A%20openssl%20rand%20-hex%2032%29&envLink=https%3A%2F%2Fgithub.com%2FWraith-cmd%2Fsteam-connector%23step-by-step-setup&project-name=steam-connector&repository-name=steam-connector)

## What Claude can do with it

| Tool | What it returns |
| --- | --- |
| `get_owned_games` | Every game you own: name, appid, total hours, hours in the last 2 weeks, and last played date, sorted by most played. Also counts games you've never played. Software like Soundpad or Wallpaper Engine is left out unless you ask for it (`include_software`), and playtests are marked `is_playtest`. |
| `get_recently_played` | Games you've played in the last 2 weeks, with hours. |
| `get_game_details` | A game's genres, categories (Single-player, Co-op, …), short description, release date, current price, user review score, controller support (full / partial / none), Steam Deck rating with Valve's test notes, and minimum and recommended PC requirements as plain text. |
| `check_handheld_compatibility` | How well games play on a handheld PC like the **ROG Ally**, Legion Go, MSI Claw, or Steam Deck. Combines Valve's Steam Deck rating with controller support (up to 10 games at a time). |
| `get_achievement_progress` | How close you are to **100% achievements** in a game, with the locked achievements sorted easiest first. |
| `get_wishlist` | Your wishlist, top-ranked first, with current prices and which games are **on sale**. |
| `get_shared_games` | Games you and a friend both own, with both players' hours. Handy for picking a co-op game. |
| `get_player_summary` | A profile's display name and URL, and whether the profile and its game details are public. |

Every tool that reads a player's data takes an optional **profile**, so you can also ask about a friend's public profile. The profile can be:

- a SteamID64: `76561197960287930`
- a profile link: `https://steamcommunity.com/profiles/76561197960287930`
- a custom profile link: `https://steamcommunity.com/id/gabelogannewell`
- just the custom name: `gabelogannewell`

If you don't give a profile, your own (`STEAM_ID`) is used.

### Reading the numbers

- **Hours** are always numbers, rounded to one decimal (two decimals under 0.1, so 2 minutes shows as `0.03`). `briefly_played: true` marks games that were opened for only a few minutes, including ones where Steam recorded 0 minutes but has a last-played date.
- **Last played** is a `YYYY-MM-DD` date, `"unknown"` (you played it, but Steam has no date, which is common for older games), or `"never"`. Dates are in UTC unless you set `STEAM_TIMEZONE` (see [Optional settings](#optional-settings)), so a late-evening session in the Americas can otherwise show up as the next day.
- **Software and tools** (Soundpad, Wallpaper Engine, GPU utilities, game-making kits) are hidden from `get_owned_games` by default so they don't skew your totals. `software_count` always says how many software apps your library has, `software_included` says whether they're in the list and totals, and `include_software: true` brings them back, marked `is_software`. Detection uses Steam's own app types, looked up in batches of 100 and remembered for a day.
- **Playtests** (like "THE FINALS PLAYTEST" or "MultiVersus – Technical Test") are kept but marked `is_playtest: true` and counted in `playtest_count`. An unplayed playtest isn't real backlog, so it doesn't count toward `never_played_count`.
- **Editions and duplicates:** Steam lists some games more than once (GTA V Legacy and Enhanced, Metro Exodus and its Enhanced Edition, a game's separate multiplayer entry, or a game plus its playtest). They're kept as separate entries, so keep this in mind when reading recommendations.

#### `get_owned_games` field reference

| Field | Meaning |
| --- | --- |
| `game_count` | Entries in the list (games only, unless `include_software` is true). `limit` doesn't change it. |
| `total_hours` | Total playtime of those entries, calculated from Steam's raw minutes and then rounded to one decimal. |
| `never_played_count` | Entries with no playtime and no last-played date, not counting playtests. |
| `playtest_count` | Entries marked `is_playtest`. |
| `software_count` | Software and tools in the library, whether or not they're included. |
| `software_included` | `true` when software is in the list and the totals (`include_software: true`). |
| `showing` | How many entries are in `games` (smaller than `game_count` when `limit` is set). |
| `games[].hours_total`, `hours_last_2_weeks` | Hours as numbers; two decimals under 0.1 hours. |
| `games[].last_played` | `YYYY-MM-DD`, `"unknown"` or `"never"`. |
| `games[].briefly_played` | Only present (as `true`) when the game was opened for just a few minutes. |
| `games[].is_playtest`, `games[].is_software` | Only present (as `true`) for playtests and software. |

All tools are read-only. Nothing can change your Steam account.

## How it works

```
 claude.ai  ──HTTPS──▶  https://your-app.vercel.app/mcp/<your secret>  ──▶  Steam Web API
                         (your Vercel deployment)                     └─▶  Steam Store API
```

The secret in the URL acts as a password. Anyone calling the URL without the right secret gets a plain **404 Not Found** and no data.

---

## Step-by-step setup

You'll need:

- A **Steam account**. It must not be a "limited" account: Steam only gives API keys to accounts that have spent at least $5.
- A free **GitHub** account and a free **Vercel** account. You can sign up for Vercel using GitHub.
- A **claude.ai** plan that supports custom connectors.

Plan on about 15 minutes.

### 1. Get a Steam Web API key

1. Go to <https://steamcommunity.com/dev/apikey> and sign in.
2. For **Domain Name**, type anything, for example `steam-connector`. It isn't checked.
3. Agree to the terms and click **Register**. Steam may ask you to confirm in the Steam Mobile app.
4. Copy the **Key**, a 32-character string of letters and numbers. This is your `STEAM_API_KEY`.

> Keep this key private. Don't paste it into chats, screenshots, or GitHub.

### 2. Find your SteamID64

Your SteamID64 is a 17-digit number that starts with `7656119`. Either of these works:

- **From the Steam store:** go to <https://store.steampowered.com/account/>. It's shown under your account name as **Steam ID**.
- **From your profile link:** if your profile URL looks like `steamcommunity.com/profiles/76561198…`, the number is your SteamID64. If it looks like `steamcommunity.com/id/yourname`, paste that link into a lookup site such as <https://steamid.io> and copy the **steamID64** value.

This is your `STEAM_ID`.

### 3. Make your game details public

Steam only shares your games and playtime if your privacy settings allow it.

1. In Steam, click your name → **Profile** → **Edit Profile** → **Privacy Settings**.
   You can also go to <https://steamcommunity.com/my/edit/settings>.
2. Set **My profile** to **Public**.
3. Set **Game details** to **Public**.
4. Make sure **"Always keep my total playtime private"** is **unchecked**. Otherwise all playtimes show as 0.

Changes can take a few minutes to reach the API.

### 4. Make a secret for your connector URL

The secret becomes part of your connector URL, so it needs to be long, random, and use only letters and numbers. Use one of these:

- **Mac or Linux:** run `openssl rand -hex 32` in a terminal.
- **Windows (PowerShell):** run `$b = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })`
- **Password manager:** generate a 40+ character password with **letters and numbers only**.

Don't use the example values from this README or `.env.example`; the server refuses them because anyone can read them.

It must be at least 32 characters, using only letters, numbers, `-` and `_`, or the server refuses every request. This is your `MCP_SECRET`.

### 5. Deploy to Vercel

1. Click the **Deploy with Vercel** button at the top of this page.
2. Sign in, choose where to create the GitHub repository, and continue.
3. Vercel asks for three environment variables. Paste in:
   - `STEAM_API_KEY`: from step 1
   - `STEAM_ID`: from step 2
   - `MCP_SECRET`: from step 4
4. Click **Deploy** and wait about a minute.
5. When it finishes, open the project dashboard. Your app's address is listed under **Domains**, for example `steam-connector-abc123.vercel.app`.

### 6. Build your connector URL

Your connector URL is:

```
https://<your-domain>/mcp/<your MCP_SECRET>
```

For example:

```
https://steam-connector-abc123.vercel.app/mcp/3f9c1e7a0b5d4c2e8f6a9b1c3d5e7f9a0b2c4d6e8f0a1b3c5d7e9f1a3b5c7d9
```

**Quick check:** open the URL in a **private/incognito** browser tab, so the secret isn't saved in your browsing history.

- **A short error mentioning "Method not allowed"** means it's working. Browsers send the wrong kind of request, but the secret was accepted.
- **"404 Not Found"** means the domain or secret is wrong. See [Troubleshooting](#troubleshooting).

> Use the **production** domain listed under **Domains**, not a preview URL from an individual deployment. Preview URLs are behind Vercel's login, and claude.ai can't get past it.

### 7. Add it to Claude

1. In claude.ai, go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. Give it a name, for example **Steam**.
4. Paste your connector URL from step 6.
5. Leave the OAuth fields under **Advanced settings** empty.
6. Click **Add**.
7. In a chat, open the tools menu and make sure the Steam connector is turned on.

That's it. Try one of the prompts below.

---

## Example prompts

- "Look at my Steam library and recommend something to play tonight. I have about 2 hours and want something relaxing."
- "What have I been playing the last two weeks? Based on that, what in my backlog would I probably enjoy next?"
- "Find games I own but have never played, check their genres, and pick the three I'm most likely to love."
- "I bounce off long RPGs. Which of my unplayed games are short and good for quick sessions?"
- "Compare my library with my friend's profile `steamcommunity.com/id/theirname` and suggest a co-op game we both own."
- "Which of my 20 most-played games will run great on my ROG Ally?"
- "How close am I to 100% in Hades? Which missing achievements are easiest?"
- "Is anything on my wishlist on sale right now? Is it worth buying, based on its reviews?"
- "Is my Steam profile set up correctly for this connector?"

---

## Optional settings

| Variable | What it does | Default |
| --- | --- | --- |
| `STEAM_COUNTRY` | Two-letter country code for store prices, for example `gb`, `de`, `ca`. | `us` |
| `STEAM_TIMEZONE` | Timezone for "last played" dates, as an [IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) like `America/Denver` (Mountain Time) or `Europe/London`. | `UTC` |

To add one, open your Vercel project → **Settings → Environment Variables**, add it, and then **redeploy**. Environment variable changes only apply to new deployments.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Browser or Claude gets **404 Not Found** | Check the domain and secret. The URL must be exactly `https://<domain>/mcp/<secret>`, with no extra slash or spaces. `MCP_SECRET` must be at least 32 characters (letters, numbers, `-`, `_`) and not an example value. Vercel → **Logs** shows a line starting `Refused request with 404:` that names the exact reason. If you changed `MCP_SECRET`, redeploy (Vercel → **Deployments** → ⋯ → **Redeploy**). |
| Claude can't connect, or shows a sign-in or registration error | Make sure you used the production domain, not a preview URL. Leave the OAuth fields blank. Check that the browser test in step 6 shows "Method not allowed". |
| "game details are private" | Redo [step 3](#3-make-your-game-details-public) and wait a few minutes. Ask Claude to run `get_player_summary` to check. |
| Every game shows 0 hours | Uncheck "Always keep my total playtime private" in your Steam privacy settings. |
| "Steam rejected the API key" | The key is wrong or was revoked. Get a new one at <https://steamcommunity.com/dev/apikey>, update `STEAM_API_KEY` in Vercel, and redeploy. |
| "rate limiting us" | Steam limits how often the store can be queried (roughly 200 lookups per 5 minutes). Wait a minute and try again. |
| A game you own is missing | A few special apps (some tools, test builds, and free games you've never launched) aren't returned by Steam's API. |

## Security notes

- **Your connector URL is a password.** Anyone with it can use your API key through your server, and may be able to read your own library even if your profile is private (Steam can share an account's own data with that account's key). Don't share it, and blur it in screenshots.
- **To change it,** set a new `MCP_SECRET` in Vercel, redeploy, and update the URL in claude.ai. Do this right away if the URL ever leaks.
- **Guard your Steam API key.** Scammers who get someone's API key can watch and interfere with their Steam trade offers. If you think yours leaked, revoke it at <https://steamcommunity.com/dev/apikey> and set a new one in Vercel.
- **Mark both values as Sensitive in Vercel** (Settings → Environment Variables → edit → Sensitive), so they can't be viewed again in the dashboard.
- The API key and secret are read from environment variables and are never included in tool output or error messages. The code doesn't log them either; refused requests log only the reason and lengths.
- Vercel's own request logs, visible only to people on your Vercel team, record request paths. Because the secret is part of the path, it appears there.
- Secrets live only in Vercel's environment variables. `.env` files are ignored by git and by Vercel uploads (`.vercelignore`), and `.env.example` contains placeholders only.
- **Limits:** each request can run for at most 60 seconds, batched requests are refused, and only `public/robots.txt` is served as a static file. Each server instance also handles at most 120 requests a minute, and Steam answers are cached briefly (2 minutes for your library, 1 hour for store pages), so repeat questions don't hit Steam again. For a strict limit, add a rate-limiting rule under your Vercel project's **Firewall**.
- **Text from other people:** game names, descriptions, achievement text and display names are written by Steam users and developers. The server strips invisible characters, caps their length, and tells Claude to treat them as data, not instructions.

## Run it locally (optional)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run check        # type check + tests (no internet or Steam key needed: Steam is mocked)
```

To run the real server on your computer (`vercel dev` asks you to log in to Vercel the first time):

```bash
cp .env.example .env    # then fill in real values (.env is git-ignored)
npx vercel dev          # serves http://localhost:3000/mcp/<your MCP_SECRET>
```

You can explore the tools with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (`npx @modelcontextprotocol/inspector`). Connect it to the local URL above using the "Streamable HTTP" transport.

## Project layout

```
api/mcp.ts        The Vercel Function: checks the secret, then runs the MCP server
src/tools.ts      The tools Claude can call
src/steam.ts      Calls to the Steam Web API (your library, wishlist, achievements)
src/store.ts      Calls to the Steam store (details, reviews, Steam Deck ratings), cached
src/handheld.ts   Decides how well a game suits a handheld PC like the ROG Ally
src/classify.ts   Tells games apart from software and playtests
src/http.ts       Fetches from Steam and turns failures into friendly errors
src/ratelimit.ts  A simple requests-per-minute limit
src/profile.ts    Turns "profile" input (ID, link, or name) into a SteamID64
src/secret.ts     The URL secret check
src/errors.ts     Friendly errors and secret redaction
src/format.ts     Minutes → hours, timestamps → dates, tidy names
src/cache.ts      A tiny in-memory cache (store lookups are cached for 1 hour)
test/             Tests, with a fake Steam so they run offline
vercel.json       Routes /mcp/<secret> to the function and pins the "Other" preset
```

Built with [`mcp-handler`](https://github.com/vercel/mcp-handler) and the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## License

[MIT](LICENSE). Not affiliated with Valve or Steam.
