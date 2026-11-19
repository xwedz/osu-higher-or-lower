# osu! Higher or Lower

Guess whether the next osu! player's stat (play count, accuracy or play time) is higher or lower.

**Play online: <https://osuhigherlower.xwedz.dev>**

- Client: React + Vite + Tailwind (`client/`)
- Server: Cloudflare Worker + Hono (`src/`), with Cloudflare D1 (SQLite) as the database
- The client and the API are served by the same Worker on the same origin

## Local development

```bash
npm install
npm --prefix client install

# 1. Secrets: copy .dev.vars.example → .dev.vars (for the Worker) and env.example → .env (for the fetch scripts)
# 2. Create the local database and fetch player data
npm run db:migrate
npm run fetch:players
npm run fetch:famous

# 3. In two terminals
npm run dev      # Worker + local D1, http://localhost:3000
npm run client   # Vite client, http://localhost:5173 (/api is proxied to 3000)
```

osu! login needs an OAuth application: create one in the OAuth section of your
[osu! account settings](https://osu.ppy.sh/home/account/edit),
and add `http://localhost:3000/api/auth/callback` to its Callback URLs.

## Managing player data

| Command | What it does |
|---|---|
| `npm run fetch:players` | Fetches the top 1000 of the global ranking into the **local** database |
| `npm run fetch:famous` | Fetches the players listed in `scripts/famousPlayers.json` (the Famous pool) |
| Append ` -- --remote` to either | Writes to the **live** database instead |

- To add a famous player, add their osu! user id and a one-line note to `scripts/famousPlayers.json`, then run `fetch:famous`.
- Players removed from the list are **not** removed from the database automatically.
- The live Worker caches the player list for 10 minutes, so new data can take up to 10 minutes to show up.
- Top 100 / Top 1000 use the ranks from the last fetch; re-run `fetch:players` now and then to keep them accurate.

## Deploying to Cloudflare (free plan)

First deployment:

```bash
npx wrangler login                              # log in to Cloudflare in the browser
npx wrangler d1 create osu-higher-lower         # create the live database; put the printed database_id in wrangler.jsonc
npm run db:migrate:remote                       # create the tables

npx wrangler secret put OSU_CLIENT_ID
npx wrangler secret put OSU_CLIENT_SECRET
npx wrangler secret put ROUND_TOKEN_SECRET      # use a new random string, not the one from your local setup

npm run deploy                                  # build the client and deploy the Worker; prints the site URLs
npm run fetch:players -- --remote               # write player data into the live database
npm run fetch:famous -- --remote
```

After deploying, add `https://<your-domain>/api/auth/callback` to the Callback URLs of your osu! OAuth application.

`wrangler.jsonc` contains this site's custom domain (`routes`) and `CANONICAL_ORIGIN`, which redirects
pages on the old `workers.dev` URL to it. If you fork the project, change both to your own domain,
or remove them to serve the site from `workers.dev` only.

After that, updating the site only takes `npm run deploy`.

## Updating the famous players list

1. Edit `scripts/famousPlayers.json` (add an id and a note).
2. Run `npm run fetch:famous -- --remote` to write it to the live database (run it again without `--remote` to see it locally too).
3. It takes effect within 10 minutes (the Worker caches the player list for 10 minutes).

To remove a player from the Famous pool (the script never removes anyone):

```bash
npx wrangler d1 execute osu-higher-lower --remote --command "UPDATE Player SET isSpecial = 0, note = NULL WHERE osuUserId = 123456"
```

## Free plan limits

- Worker: 100,000 requests per day; 10 ms of CPU per request. Every request goes through the Worker so the old URL can be redirected, which means static files count too.
- D1: 5 million rows read and 100,000 rows written per day. Each guess writes one row (replay protection), so roughly 100,000 guesses per day at most.
- Once a limit is reached the API returns errors until the next day (reset at 00:00 UTC). Workers Paid (US$5/month) removes these limits if needed.

## Abuse protection

- Each IP may make at most 100 API requests per minute (`ratelimits` in `wrangler.jsonc`); beyond that it gets a 429.
  This limit is loose and counted per Cloudflare data center: it stops a single source from hammering the API,
  but blocked requests still count toward the 100,000 daily requests.
- To truly protect the quota, add a Cloudflare WAF rate limiting rule on the custom domain, which blocks
  requests before they reach the Worker (the free plan includes one rule). This isn't set up yet.

## Notes

- Local D1 data is stored per `database_id`. If you change the `database_id` in `wrangler.jsonc`,
  the local database starts out empty, and you need to re-run `npm run db:migrate`, `npm run fetch:players` and `npm run fetch:famous`.

## Project layout

```
src/            Worker (Hono): API, login, signed tokens
migrations/     D1 schema (managed by wrangler)
scripts/        scripts that fetch player data
client/         React client
wrangler.jsonc  Cloudflare configuration
```

## License

The code in this project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
In short: you may use, modify and distribute it, including commercially; but if you distribute a modified version,
or run a modified version as a website that other people use over a network, you must publish its complete source
under the same AGPL-3.0 license.

Player data and avatars come from the official [osu!](https://osu.ppy.sh/) API and belong to osu! / ppy; they are not
covered by this license, and their use is subject to the osu! API terms of use. This project is not affiliated with osu! or ppy.
