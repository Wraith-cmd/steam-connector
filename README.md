# Steam Connector for Claude

Let Claude look at your Steam library (your games, how long you've played them, and what you've played recently) so it can recommend what to play next.

This is a small **remote MCP server**. MCP (Model Context Protocol) is the standard way to give Claude new tools. You deploy your own copy to Vercel for free, paste its URL into claude.ai as a **custom connector**, and Claude can then read your Steam data when you ask it to.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FWraith-cmd%2Fsteam-connector&env=STEAM_API_KEY,STEAM_ID,MCP_SECRET&envDescription=Your%20Steam%20Web%20API%20key%2C%20your%2017-digit%20SteamID64%2C%20and%20a%20long%20random%20secret%20for%20your%20connector%20URL%20%28generate%20one%20with%3A%20openssl%20rand%20-hex%2032%29&envLink=https%3A%2F%2Fgithub.com%2FWraith-cmd%2Fsteam-connector%23step-by-step-setup&project-name=steam-connector&repository-name=steam-connector)

## What Claude can do with it

| Tool | What it returns |
| --- | --- |
| `get_owned_games` | Every game you own: name, appid, total hours, hours in the last 2 weeks, and last played date, sorted by most played. Also counts games you've never played. |
| `get_recently_played` | Games you've played in the last 2 weeks, with hours. |
| `get_game_details` | A game's genres, categories (Single-player, Co-op, …), short description, release date, and current price. |
| `get_player_summary` | A profile's display name and URL, and whether the profile and its game details are public. |

Every tool takes an optional **profile**, so you can also ask about a friend's public profile. The profile can be:

- a SteamID64: `76561197960287930`
- a profile link: `https://steamcommunity.com/profiles/76561197960287930`
- a custom profile link: `https://steamcommunity.com/id/gabelogannewell`
- just the custom name: `gabelogannewell`

If you don't give a profile, your own (`STEAM_ID`) is used.

All tools are read-only. Nothing can change your Steam account.

## How it works

```
 claude.ai  ──HTTPS──▶  https://your-app.vercel.app/mcp/<your secret>  ──▶  Steam Web API
                         (your Vercel deployment)                     └─▶  Steam Store API
```

The secret in the URL acts as a password. Anyone calling the URL without the right secret gets a plain **404 Not Found**, as if nothing were there.

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
- **Windows (PowerShell):** run `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })`
- **Password manager:** generate a 40+ character password with **letters and numbers only**.

It must be at least 16 characters, or the server refuses every request. This is your `MCP_SECRET`.

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

**Quick check:** open the URL in your browser.

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
- "Is my Steam profile set up correctly for this connector?"

---

## Optional settings

| Variable | What it does | Default |
| --- | --- | --- |
| `STEAM_COUNTRY` | Two-letter country code for store prices, for example `gb`, `de`, `ca`. | `us` |

To add one, open your Vercel project → **Settings → Environment Variables**, add it, and then **redeploy**. Environment variable changes only apply to new deployments.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Browser or Claude gets **404 Not Found** | Check the domain and secret. The URL must be exactly `https://<domain>/mcp/<secret>`, with no extra slash or spaces. `MCP_SECRET` must be at least 16 characters. If you changed `MCP_SECRET`, redeploy (Vercel → **Deployments** → ⋯ → **Redeploy**). |
| Claude can't connect, or shows a sign-in or registration error | Make sure you used the production domain, not a preview URL. Leave the OAuth fields blank. Check that the browser test in step 6 shows "Method not allowed". |
| "game details are private" | Redo [step 3](#3-make-your-game-details-public) and wait a few minutes. Ask Claude to run `get_player_summary` to check. |
| Every game shows 0 hours | Uncheck "Always keep my total playtime private" in your Steam privacy settings. |
| "Steam rejected the API key" | The key is wrong or was revoked. Get a new one at <https://steamcommunity.com/dev/apikey>, update `STEAM_API_KEY` in Vercel, and redeploy. |
| "rate limiting us" | Steam limits how often the store can be queried (roughly 200 lookups per 5 minutes). Wait a minute and try again. |
| A game you own is missing | A few special apps (some tools, test builds, and free games you've never launched) aren't returned by Steam's API. |

## Security notes

- **Your connector URL is a password.** Anyone with it can use your API key to read public Steam data. Don't share it or post it publicly.
- **To change it,** set a new `MCP_SECRET` in Vercel, redeploy, and update the URL in claude.ai.
- The API key and secret are read from environment variables and are never included in tool output or error messages. The code doesn't log them either.
- Vercel's own request logs, visible only to you in your dashboard, record request paths. Because the secret is part of the path, it appears there.
- Secrets live only in Vercel's environment variables. `.env` files are ignored by git, and `.env.example` contains placeholders only.

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
src/server.ts     The four tools
src/steam.ts      All calls to Steam, plus friendly errors and the store cache
src/profile.ts    Turns "profile" input (ID, link, or name) into a SteamID64
src/secret.ts     The URL secret check
src/errors.ts     Friendly errors and secret redaction
src/format.ts     Minutes → hours, timestamps → dates
src/cache.ts      A tiny in-memory cache (store details are cached for 1 hour)
test/             Tests, with a fake Steam so they run offline
vercel.json       Routes /mcp/<secret> to the function
```

Built with [`mcp-handler`](https://github.com/vercel/mcp-handler) and the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## License

[MIT](LICENSE). Not affiliated with Valve or Steam.
