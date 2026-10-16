# RecompHaven

A tracker for every game recompilation, released and in progress. Sort and filter by console, genre, quality tier, stage, toolchain, features and activity.

It's a static site with no build step: `index.html`, `styles.css`, `app.js` and the data in `data/recomps.js`.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8765
```

Then visit http://localhost:8765.

## Deploy

There's nothing to build, so any static host works.

On GitHub Pages, set **Settings → Pages → Source** to **GitHub Actions**. `.github/workflows/deploy-pages.yml` then publishes the site on every push to `main` and after each nightly data refresh. Don't use "Deploy from a branch": the refresh job's commits wouldn't trigger a rebuild. Add your custom domain on the same settings page.

Cloudflare Pages, Netlify and Vercel can connect to the repo instead and deploy on every push, the nightly refresh included.

## Edit the list

Every project is one object in `data/recomps.js`. The comment at the top of that file documents each field. To add a recomp, copy an existing entry, give it a unique `id`, and fill in what you know. Fields you don't know can be `null`.

Quality tiers:

| Tier | Name | Meaning |
|---|---|---|
| S | Definitive | Complete and polished, with enhancements past the original |
| A | Complete | Playable start to finish in a stable release |
| B | Playable | Playable builds with known bugs or missing features |
| C | Rough | Boots and partly plays in tagged pre-release builds |
| D | Experimental | Early research, no public build, or not playable yet |

Stages are `released`, `beta`, `development` and `abandoned`. The site works out activity (Active, Quiet, Stalled) from the `updated` date on its own.

To add a console, genre or feature, update the matching table at the top of `app.js` (`CONSOLES`, `FEATURES`). Genres and toolchains are read from the data.

## Keeping the data fresh

Stars, last push and latest release come from GitHub. To refresh them:

```bash
python tools/refresh_stats.py --dry-run
```

`--dry-run` prints what would change and writes nothing. Drop it to update `data/recomps.js`, or add `--limit 10` to check only the first ten repos.

Without a token GitHub allows 60 requests an hour, and a full run needs about 370, so the script waits out the limit and takes hours. Set `GITHUB_TOKEN` to a personal access token (no scopes needed for public repos) and it finishes in a few minutes.

The workflow in `.github/workflows/refresh-data.yml` runs the script every night, or on demand from the Actions tab, and commits `data/recomps.js` when it changed. It only runs once the site is in a GitHub repository, and it uses the built-in token, so there's nothing to set up. On GitHub Pages, the deploy workflow publishes each refresh.

Genres, stages and quality tiers stay manual, and the script never touches them. When GitHub hints that a stage is out of date (an archived repo, a stable 1.0 release, no push in a year), it lists the entry under "Suggested review", which also appears in the workflow's job summary. Moved repos and 404s are listed too, and nothing is deleted.

## Sources and license

The base data (project names, statuses, repositories, descriptions and GitHub stats) comes from [Recompendium](https://github.com/nio03/unricopie), used under the MIT License. Its notice is in `data/LICENSE-recompendium.txt` and must stay with the data. Genres, stages, quality tiers and the entries added by hand since are RecompHaven's own. The first snapshot is from 16 October 2026.

RecompHaven links to projects and hosts no game files. Every recomp needs your own legally obtained copy of the game.
