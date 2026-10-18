# Security

Found a way to break or misuse Recomp Haven? Thank you for looking. Please report it privately first, so it can be fixed before it's public.

## How to report

Use GitHub's private reporting: open the repo's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/rikuwru/recomphaven/security/advisories/new)). Only you and the maintainer see the report.

Please include what the problem is, where (a page address or a file), how to reproduce it, and what someone could do with it. Please don't post security problems in a public issue, on Reddit or in Discord.

## What's covered

- The site at recomphaven.com: the pages, `app.js`, `game.js`, and the pages and images `tools/build_pages.py` builds.
- The GitHub Actions workflows and the tools in `tools/` they run.
- The newsletter and update-alert Worker, `newsletter/worker.js`, and the sign-up forms that talk to it. It stores email addresses and the projects each one follows, nothing else, and deletes an address once it unsubscribes from everything.

## Not covered

- The recomps, decomps and ports listed on the site. They're separate projects: report problems in them to their own repositories.
- The services the site uses: GitHub and GitHub Pages, Cloudflare, Resend, GoatCounter, giscus and YouTube. Report problems in them to those companies.
- Floods of traffic or denial of service, and scanner output without a real problem behind it. GitHub Pages doesn't let a site set its own HTTP headers, for instance, so a missing header alone isn't something that can be fixed here.

## What to expect

Recomp Haven is a personal project, so fixes are best effort. You'll get a reply within a few days, a fix as soon as one is ready, and, if you'd like, credit in the site's Thanks section once it's fixed.
