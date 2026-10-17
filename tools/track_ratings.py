#!/usr/bin/env python3
"""Average visitors' ratings into "userScore" and "userScoreCount".

People rate and discuss a project in its thread on the game's page: giscus keeps each thread as
a GitHub Discussion in this repo, titled with the project's id, in the category named in GISCUS
(tools/build_pages.py). A rating is a top-level comment with a score out of 10 in it, like
"Score: 8/10". Each GitHub account's latest scored comment counts; replies, comments without a
score, and comments hidden on GitHub (minimized) don't. So to remove a score, hide the comment.

Entries with no ratings lose both fields. It's off until GISCUS is filled in. Needs a token that
can read the repo's discussions: the workflow's GITHUB_TOKEN with "discussions: read".

    python tools/track_ratings.py --dry-run
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_pages import COMMENTS_ON, GISCUS  # noqa: E402
from refresh_stats import DATA, dump, load  # noqa: E402

SCORE = re.compile(r'(?<![\d.])(10|[1-9])\s*/\s*10(?![\d.])')


def graphql(token, query, **variables):
    req = urllib.request.Request('https://api.github.com/graphql', method='POST',
                                 data=json.dumps({'query': query, 'variables': variables}).encode(),
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
                                          'User-Agent': 'recomphaven-track-ratings'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    if data.get('errors'):
        raise RuntimeError('; '.join(e.get('message', '?') for e in data['errors']))
    return data['data']


CATEGORIES = '''query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { discussionCategories(first: 50) { nodes { id name } } } }'''

DISCUSSIONS = '''query($owner: String!, $name: String!, $category: ID!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 50, after: $after, categoryId: $category) {
      pageInfo { hasNextPage endCursor }
      nodes { title comments(last: 100) { nodes { author { login } body isMinimized createdAt } } }
    }
  }
}'''


def ratings(token):
    """{project id: [score, ...]}, one latest score per GitHub account."""
    owner, name = GISCUS['repo'].split('/')
    cats = graphql(token, CATEGORIES, owner=owner, name=name)['repository']['discussionCategories']['nodes']
    category = next((c['id'] for c in cats if c['name'] == GISCUS['category']), None)
    if not category:
        raise RuntimeError(f'no discussion category named "{GISCUS["category"]}"')
    out, after = {}, None
    while True:
        page = graphql(token, DISCUSSIONS, owner=owner, name=name, category=category, after=after)
        block = page['repository']['discussions']
        for d in block['nodes']:
            latest = {}
            for c in d['comments']['nodes']:
                m = SCORE.search(c['body'] or '')
                who = (c.get('author') or {}).get('login')
                if not m or not who or c['isMinimized']:
                    continue
                if who not in latest or c['createdAt'] > latest[who][0]:
                    latest[who] = (c['createdAt'], int(m[1]))
            if latest:
                out[d['title'].strip()] = [score for _, score in latest.values()]
        if not block['pageInfo']['hasNextPage']:
            return out
        after = block['pageInfo']['endCursor']


def main():
    ap = argparse.ArgumentParser(description='Average visitors\' ratings into userScore and userScoreCount.')
    ap.add_argument('--dry-run', action='store_true', help='print what would change and write nothing')
    ap.add_argument('--summary', metavar='FILE', help='append a Markdown report here (e.g. $GITHUB_STEP_SUMMARY)')
    args = ap.parse_args()
    sys.stdout.reconfigure(errors='replace')

    def report(md):
        if args.summary:
            with open(args.summary, 'a', encoding='utf-8') as f:
                f.write('## User scores\n\n' + md + '\n')

    token = os.environ.get('GITHUB_TOKEN', '').strip()
    if not COMMENTS_ON or not token:
        why = 'fill in category_id in GISCUS (tools/build_pages.py)' if not COMMENTS_ON else 'set GITHUB_TOKEN'
        print(f'Ratings are off: {why}.')
        report(f'Off: {why}.')
        return
    try:
        scores = ratings(token)
    except (urllib.error.URLError, RuntimeError) as err:
        print(f'Could not read the ratings: {err}. Keeping the last scores.')
        report(f'Could not read the ratings: {err}. Kept the last scores.')
        return

    text, head, meta, entries = load(DATA)
    ids = {e['id'] for e in entries}
    for e in entries:
        got = scores.get(e['id'])
        if got:
            e['userScore'] = round(sum(got) / len(got), 1)
            e['userScoreCount'] = len(got)
        else:
            e.pop('userScore', None)
            e.pop('userScoreCount', None)
    rated = sorted((e for e in entries if e.get('userScore') is not None), key=lambda e: (-e['userScore'], e['title']))
    print(f'{sum(len(v) for v in scores.values())} ratings across {len(rated)} projects.')
    for e in rated[:15]:
        print(f'  {e["userScore"]:>4}  ({e["userScoreCount"]})  {e["title"]} ({e.get("project") or e["id"]})')
    unknown = sorted(set(scores) - ids)
    if unknown:
        print('  Threads for ids that aren\'t in the data:', ', '.join(unknown))
    report('\n'.join(f'- {e["userScore"]} ({e["userScoreCount"]}) **{e["title"]}** ({e.get("project") or e["id"]})'
                     for e in rated) or 'No ratings yet.')

    new_text = dump(head, meta, entries)
    if args.dry_run:
        print('Dry run: nothing written.')
    elif new_text != text:
        with open(DATA, 'w', encoding='utf-8', newline='') as f:
            f.write(new_text)
        print(f'Wrote {os.path.relpath(DATA)}.')
    else:
        print('No changes.')


if __name__ == '__main__':
    main()
