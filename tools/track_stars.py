#!/usr/bin/env python3
"""Count the GitHub stars each recomp gained in the last 7 days.

Sets "starsWeek" on every entry whose repo is on github.com. GitHub records
when each star was given, so this reads the newest stars first and stops at
the first one older than a week. The site's "Trending this week" row and
Trending sort use it.

Run it after refresh_stats.py: it starts from the star count that sets.
Entries that aren't on GitHub, or whose request fails, keep their last value.

It also adds each night's star totals to data/stars-history.json (the last
two weeks). GitHub only lists stars with their dates to signed-in requests,
so without a token, or if GitHub refuses, the weekly count comes from that
history instead: today's total minus the one closest to a week ago.

Standard library only. Set GITHUB_TOKEN: a full run needs about one request
per repo, a few more for the busiest ones.

    python tools/track_stars.py --dry-run --limit 10
    python tools/track_stars.py
"""
import argparse
import datetime as dt
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh_stats import DATA, REPO_RE, FetchError, GitHub, dump, load  # noqa: E402

WINDOW_DAYS = 7
PER_PAGE = 100
MAX_PAGES = 10  # 1,000 new stars in a week is plenty to rank first
KEEP_DAYS = 14


def load_history(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def dump_history(history):
    """One project per line, so each night's commit diffs cleanly."""
    rows = [f'  {json.dumps(k)}: {json.dumps(v, sort_keys=True)}' for k, v in sorted(history.items())]
    return '{\n' + ',\n'.join(rows) + '\n}\n'


def from_history(points, today):
    """Stars gained since the saved total closest to a week ago, or None without one."""
    week_ago = (today - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    older = sorted(d for d in points if d < today.isoformat())
    if not older:
        return None
    start = min(older, key=lambda d: abs(dt.date.fromisoformat(d) - dt.date.fromisoformat(week_ago)))
    return max(0, points[today.isoformat()] - points[start])


def gained(gh, owner, name, total, since):
    """Stars given since `since` (ISO timestamp), or None if the repo is gone.

    Stargazers come oldest first, so this walks back from the last page.
    """
    page, count = math.ceil(total / PER_PAGE), 0
    for _ in range(MAX_PAGES):
        if page < 1:
            break
        stars = gh.get(f'/repos/{owner}/{name}/stargazers?per_page={PER_PAGE}&page={page}')
        if stars is None:
            return None
        recent = [s for s in stars if (s.get('starred_at') or '') >= since]
        count += len(recent)
        if stars and len(recent) < len(stars):
            break
        page -= 1  # every star on this page is recent (or the count ran ahead of the list)
    return count


def main():
    ap = argparse.ArgumentParser(description='Count the GitHub stars each recomp gained in the last 7 days.')
    ap.add_argument('--dry-run', action='store_true', help='print what would change and write nothing')
    ap.add_argument('--limit', type=int, metavar='N', help='only check the first N GitHub repos')
    ap.add_argument('--data', default=DATA, help='data file (default: data/recomps.js)')
    ap.add_argument('--summary', metavar='FILE', help='append a Markdown report here (e.g. $GITHUB_STEP_SUMMARY)')
    args = ap.parse_args()
    sys.stdout.reconfigure(errors='replace')

    text, head, meta, entries = load(args.data)
    today = dt.datetime.now(dt.timezone.utc).date()
    history_path = os.path.join(os.path.dirname(os.path.abspath(args.data)), 'stars-history.json')
    history = load_history(history_path)
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    for e in entries:
        points = {d: n for d, n in history.get(e['id'], {}).items() if d >= cutoff}
        if e.get('stars') is not None:
            points[today.isoformat()] = e['stars']
        if points:
            history[e['id']] = points
    history = {k: v for k, v in history.items() if k in {e['id'] for e in entries}}
    token = os.environ.get('GITHUB_TOKEN', '').strip()
    gh = GitHub(token)
    gh.headers['Accept'] = 'application/vnd.github.star+json'  # adds starred_at to each star
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=WINDOW_DAYS)).strftime('%Y-%m-%dT%H:%M:%SZ')

    targets = [(e, REPO_RE.fullmatch(e['repo'] or '')) for e in entries]
    targets = [(e, m) for e, m in targets if m]
    if args.limit is not None:
        targets = targets[:args.limit]
    print(f'Counting stars since {since} for {len(targets)} GitHub repos'
          f' ({"with GITHUB_TOKEN" if token else "no GITHUB_TOKEN: 60 requests an hour"}).')

    errors, use_api = 0, True
    for entry, m in targets:
        owner, name = m.groups()
        if not entry.get('stars'):
            entry['starsWeek'] = 0
            continue
        n = None
        if use_api:
            try:
                n = gained(gh, owner, name, entry['stars'], since)
                if n is None:
                    print(f'  {entry["id"]}: not found (404)')
                    continue
            except FetchError as err:
                if 'HTTP 401' in str(err):
                    use_api = False
                    print('  GitHub wants a signed-in request to list stars by date; '
                          'using data/stars-history.json instead.')
                else:
                    errors += 1
                    print(f'  {entry["id"]}: {err}')
                    continue
        if n is None:
            n = from_history(history.get(entry['id'], {}), today)
            if n is None:
                continue
        entry['starsWeek'] = n

    if targets and errors == len(targets):
        sys.exit('Every request failed; nothing written.')

    top = sorted((e for e in entries if e.get('starsWeek')), key=lambda e: -e['starsWeek'])[:10]
    print(f'\n{gh.calls} API requests, {errors} errors. Most stars this week:')
    print('\n'.join(f'  +{e["starsWeek"]:<5} {e["title"]} ({e["project"]})' for e in top) or '  none')

    new_text = dump(head, meta, entries)
    if args.dry_run:
        print('\nDry run: nothing written.')
    else:
        with open(history_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump_history(history))
        if new_text != text:
            tmp = args.data + '.tmp'
            with open(tmp, 'w', encoding='utf-8', newline='') as f:
                f.write(new_text)
            os.replace(tmp, args.data)
            print(f'\nWrote {os.path.relpath(args.data)} and {os.path.relpath(history_path)}.')
        else:
            print(f'\nNo changes to the data; wrote {os.path.relpath(history_path)}.')

    if args.summary:
        md = ['## Trending this week', '']
        md += [f'- +{e["starsWeek"]} **{e["title"]}** ({e["project"]})' for e in top] or ['No new stars.']
        with open(args.summary, 'a', encoding='utf-8') as f:
            f.write('\n'.join(md) + '\n')


if __name__ == '__main__':
    main()
