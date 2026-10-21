# CoOp:Anything

**Live at [coopanything.app](https://coopanything.app)**

Every co-op mod for single-player games, and how much of each game you can play together.
Search any game, filter by what's synced (story, enemies, world), compare the mods for one
game side by side, and vote on the ones you've played.

The list comes from the [Co-op Anything directory](https://github.com/cranebeaker/coop-anything/blob/main/DIRECTORY.md).
The site is built on [Recomp Haven](https://github.com/rikuwru/recomphaven) by rikuwru (MIT License).

## How it fits together

- `tools/import_coop.py` turns `coop-anything/data/directory.yaml` into `data/recomps.js`
  (stage, quality tier, Co-op % estimate, feature tags, "Made with Co-op Anything" flag and
  write-up links). Ids are stable, so votes and stats survive a re-import.
- `tools/refresh_stats.py` adds GitHub stars, last push and latest release.
  `tools/fetch_covers_coop.py` adds box art (Steam, then Wikipedia).
- `tools/build_pages.py` builds the site into `_site/`: the list, one page per game (several
  mods for one game get compared side by side), share images, releases page, RSS and sitemap.
- `worker/index.js` is a Cloudflare Worker that serves `_site/` and runs the community API on
  D1: `GET /api/stats`, `POST /api/vote` (Co-op %, rating, how the session went) and
  `POST /api/hit` (visits for Trending). No accounts, no cookies; one vote per person per mod.

## Co-op % and tiers

Co-op % starts as an estimate: 60% from the project's status, 40% from what the directory
confirms is shared (seeing each other, story, enemies, world, items). Once three or more
players vote on a mod, their average replaces it.

| Tier | Meaning |
|---|---|
| S | Picked by hand in `data/overrides.json`: the whole game, together, polished |
| A | Playable, with story co-op or automated tests, or a stable official co-op mode |
| B | Playable with gaps, or partial with story sync |
| C | Alpha, or partial without the story |
| D | Prototype, research build or abandoned |
| X | Wanted: no co-op project found yet |

## Run it locally

```
npm install
python -m pip install pyyaml pillow
npm run import     # refresh data from ../coop-anything
npm run dev        # builds, sets up a local D1 database, serves http://localhost:8787
```

## Hosting on Cloudflare (free)

The site runs as one Worker on a free Cloudflare account, at
`https://coop.<your-subdomain>.workers.dev` ("coop" is the Worker's name in `wrangler.jsonc`;
the subdomain is picked once per Cloudflare account).

1. Make a Cloudflare account for this project, open **Workers & Pages** once and pick your
   workers.dev subdomain.
2. Log this folder in to that account, without touching any other Cloudflare login on the PC:
   ```
   npx wrangler auth create coophaven
   npx wrangler auth activate coophaven .
   ```
   The first opens the browser to sign in. The second binds this folder to that login
   (Wrangler's auth profiles: `npx wrangler auth list` shows them).
3. Create the vote database and publish:
   ```
   npm run setup
   npm run deploy
   ```
4. If your address isn't `https://coop.coophaven.workers.dev`, set it for the build so link
   previews, the feed and the sitemap point to the right place: `COOP_SITE=https://... npm run deploy`,
   or change the default at the top of `tools/build_pages.py`.

## Editing the list

Edit the Co-op Anything directory (`data/directory.yaml` in that repo), then run
`npm run import` here. Site-only calls (S tier, a hand-picked recommendation, a featured
playthrough video) go in `data/overrides.json`, keyed by id:

```json
{ "deus-ex-hx-hxfix-hxcoop-deus-ex-coop": { "quality": "S", "pick": true } }
```

## License

MIT (see LICENSE). Box art belongs to each game's publisher. The fonts in `tools/fonts/` are
under the SIL Open Font License.

## Contributing

Pull requests are welcome: fixes, new features, translations (see `i18n.js` for Russian) and design tweaks.

- **Adding or correcting a mod?** That data lives in the [Co-op Anything directory](https://github.com/cranebeaker/coop-anything)
  (`data/directory.yaml`). Send it there, or use **Submit a mod** on the site.
- **Running it locally:** `npm install`, then `npm run dev` (builds the site and runs the Worker with a local database at
  http://localhost:8787). Tests for the API: `node tools/test_editor_api.mjs` and `node tools/test_listing_api.mjs`
  against a local `wrangler dev` (see the comments at the top of each file).
- **Mod devs** can edit their own listing on the site (Dev login, with Discord) or with `/listing` in their topic on the
  [Co-op Anything Discord](https://discord.gg/EXGB49R82t).
- Keep text plain and honest: no personal info, no em dashes, and only claim what a source shows.
