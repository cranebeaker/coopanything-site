# Co-op Haven: notes for Claude

Co-op Haven lists every co-op mod for single-player games, with a Co-op % per mod and community
votes. It's a fork of Recomp Haven (rikuwru, MIT); internal names still say "recomps"
(`data/recomps.js`, `window.RECOMPS`, `console` = project kind), on purpose, to keep the diff small.

## Ground rules

- **HARD RULE: never dox the owner.** No public URL, subdomain, account, commit or file may contain or
  lead to the owner's real name, email or Windows username (the exact strings are in the owner's
  private `~/.claude/CLAUDE.md`, never in this repo). Publish only as cranebeaker / Co-op Anything.
  Keep `workers_dev` false until the Cloudflare account's workers.dev subdomain is a neutral name,
  and check the deploy target and `_site/` for personal info before every deploy.
- **The data comes from Co-op Anything.** Edit `../coop-anything/data/directory.yaml` (its
  schema is in `data/SCHEMA.md` there), then run `python tools/import_coop.py`. Never hand-edit
  `data/recomps.js`; site-only calls go in `data/overrides.json`.
- **S tier is the owner's call.** Suggest it, don't set it.
- **Public text:** no em dashes, no personal info, no "not yet proven" style wording.
- **Ask before committing, pushing or deploying.** `npm run deploy` publishes to the live Worker.
- Don't break vote ids: an id is the slug of game + project. Renaming either in the directory
  orphans that mod's votes (move them in D1 if a rename is needed).

## Pieces

- `tools/import_coop.py`: directory -> data, tiers, Co-op % estimate, features, Co-op Anything
  flag (from the hub README's project lists) and write-up links (from `coop-anything/games/`).
- `tools/refresh_stats.py` (GitHub stats, `GITHUB_TOKEN` helps), `tools/fetch_covers_coop.py`
  (box art), `tools/build_pages.py` (builds `_site/`; `COOP_SITE` sets the public address).
- `worker/index.js` + `migrations/`: the Worker serving `_site/` and the `/api/*` vote API on D1.
- `index.html`, `app.js`, `game.js`, `styles.css`, `data/tables.js`: the site.

On Windows set `PYTHONIOENCODING=utf-8` before running the Python tools.

```bash
npm run import && npm run build   # data, then site
npm run dev                       # local Worker + local D1 at http://localhost:8787
```
