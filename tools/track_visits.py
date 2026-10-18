#!/usr/bin/env python3
"""Count how many people looked at each recomp in the last 3 days, for Trending.

The site sends GoatCounter a "recomp/<id>" event when someone opens a
project's details, opens a game page that has a single project, or follows a
project's repository, website or release-notes link. GoatCounter counts each
visitor once per event, so the numbers are close to people, not clicks. This
reads the last WINDOW_DAYS days of them through GoatCounter's API and sets
"visitsWeek" on every entry (named when the window was a week). The site's Trending row and sort rank by it.

It's off until both of these are set (README: "Counting visits"):
  GOATCOUNTER in tools/build_pages.py  the site code, as in recomphaven.goatcounter.com
  GOATCOUNTER_TOKEN                    a GoatCounter API key that can read statistics

If the API fails, the data keeps last night's numbers and the script still
exits 0, so it never holds up the rest of the nightly refresh.

    python tools/track_visits.py --dry-run
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_pages import GOATCOUNTER  # noqa: E402
from refresh_stats import DATA, dump, load  # noqa: E402

PREFIX = 'recomp/'
WINDOW_DAYS = 3  # short, so Trending moves from day to day
PAGE_SIZE = 100  # the API's maximum
MAX_PAGES = 20


class APIError(Exception):
    pass


def get(code, token, params):
    url = f'https://{code}.goatcounter.com/api/v0/stats/hits?' + urllib.parse.urlencode(params, doseq=True)
    for attempt in range(4):
        req = urllib.request.Request(url, headers={
            'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
            'User-Agent': 'recomphaven-track-visits'})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < 3:
                time.sleep(float(err.headers.get('X-Rate-Limit-Reset') or 2) + 0.5)
                continue
            hint = {401: ' (check GOATCOUNTER_TOKEN)', 403: ' (the API key needs permission to read statistics)'}
            raise APIError(f'HTTP {err.code}{hint.get(err.code, "")}') from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if attempt == 3:
                raise APIError(str(getattr(err, 'reason', err))) from None
            time.sleep(5)


def visitors(code, token):
    """Visitors per "recomp/<id>" event over the last WINDOW_DAYS days, by id."""
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    params = {'start': (now - dt.timedelta(days=WINDOW_DAYS)).strftime('%Y-%m-%dT%H:%M:%SZ'),
              'end': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'limit': PAGE_SIZE}
    seen, counts = set(), {}
    for _ in range(MAX_PAGES):
        data = get(code, token, {**params, 'exclude_paths': sorted(seen)})
        fresh = [h for h in data.get('hits') or [] if h.get('path_id') not in seen]
        for h in fresh:
            seen.add(h.get('path_id'))
            path = (h.get('path') or '').lstrip('/')
            if h.get('event') and path.startswith(PREFIX):
                counts[path[len(PREFIX):]] = counts.get(path[len(PREFIX):], 0) + (h.get('count') or 0)
        if not data.get('more') or not fresh:
            break
        time.sleep(0.3)  # 4 requests a second at most
    return counts


def main():
    ap = argparse.ArgumentParser(description=f'Count visitors per recomp over the last {WINDOW_DAYS} days (GoatCounter).')
    ap.add_argument('--dry-run', action='store_true', help='print what would change and write nothing')
    ap.add_argument('--data', default=DATA, help='data file (default: data/recomps.js)')
    ap.add_argument('--summary', metavar='FILE', help='append a Markdown report here (e.g. $GITHUB_STEP_SUMMARY)')
    args = ap.parse_args()
    sys.stdout.reconfigure(errors='replace')

    token = os.environ.get('GOATCOUNTER_TOKEN', '').strip()
    if not GOATCOUNTER or not token:
        missing = ' and '.join(x for x, ok in (('GOATCOUNTER in tools/build_pages.py', GOATCOUNTER),
                                                ('GOATCOUNTER_TOKEN', token)) if not ok)
        print(f'Visit counting is off: set {missing}. Trending uses GitHub stars meanwhile.')
        if args.summary:
            with open(args.summary, 'a', encoding='utf-8') as f:
                f.write(f'## Visits, last {WINDOW_DAYS} days\n\nOff: set {missing}. Trending uses GitHub stars meanwhile.\n')
        return

    text, head, meta, entries = load(args.data)
    try:
        counts = visitors(GOATCOUNTER, token)
    except APIError as err:
        print(f'GoatCounter API: {err}. Keeping the last counts.')
        if args.summary:
            with open(args.summary, 'a', encoding='utf-8') as f:
                f.write(f'## Visits, last {WINDOW_DAYS} days\n\nGoatCounter API: {err}. Kept the last counts.\n')
        return

    known = {e['id'] for e in entries}
    for e in entries:
        e['visitsWeek'] = counts.get(e['id'], 0)
    unknown = sorted(set(counts) - known)
    top = sorted((e for e in entries if e['visitsWeek']), key=lambda e: -e['visitsWeek'])[:10]
    print(f'{sum(counts.values())} project visits in the last {WINDOW_DAYS} days across {len(counts)} projects. Most visited:')
    print('\n'.join(f'  {e["visitsWeek"]:<6} {e["title"]} ({e.get("project") or e["id"]})' for e in top) or '  none yet')
    if unknown:
        print(f'  Ignored events for ids no longer in the data: {", ".join(unknown)}')

    new_text = dump(head, meta, entries)
    if args.dry_run:
        print('Dry run: nothing written.')
    elif new_text != text:
        tmp = args.data + '.tmp'
        with open(tmp, 'w', encoding='utf-8', newline='') as f:
            f.write(new_text)
        os.replace(tmp, args.data)
        print(f'Wrote {os.path.relpath(args.data)}.')
    else:
        print('No changes.')

    if args.summary:
        md = [f'## Visits, last {WINDOW_DAYS} days', '']
        md += [f'- {e["visitsWeek"]} **{e["title"]}** ({e.get("project") or e["id"]})' for e in top] or ['No visits counted yet.']
        with open(args.summary, 'a', encoding='utf-8') as f:
            f.write('\n'.join(md) + '\n')


if __name__ == '__main__':
    main()
