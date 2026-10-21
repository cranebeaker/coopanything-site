#!/usr/bin/env python3
"""Build data/recomps.js from the Co-op Anything directory (data/directory.yaml).

Co-op Anything (https://github.com/cranebeaker/coop-anything) is the source of truth: one
entry per co-op project for one game, plus "gap" entries for games nobody has made co-op yet.
This script maps each entry onto the site's data format and works out:

- stage: playable / official -> released, partial -> beta, alpha / prototype -> development,
  abandoned -> abandoned, gap -> wanted
- quality tier (A to D, X for a gap); S is only ever set by hand in data/overrides.json
- coopPct: an estimate of how much of the game you can play together, from the status and
  from what the entry confirms is shared (story, enemies, world, items, other players).
  Community votes on the site replace it once enough people have voted.
- features: the co-op chips (story, enemies, shared world, easy join, open source, ...)

Ids are stable (game + project), so re-running keeps the GitHub stats, covers and votes. Fields
that other tools fill in (stars, versions, covers, platforms, star counts) are carried over from
the current data/recomps.js.

    python tools/import_coop.py                          # reads ../coop-anything/data/directory.yaml
    python tools/import_coop.py --src path/to/directory.yaml
    python tools/import_coop.py --src https://raw.githubusercontent.com/cranebeaker/coop-anything/main/data/directory.yaml
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.request

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh_stats import DATA, ROOT, dump, load  # noqa: E402

DEFAULT_SRC = os.path.join(os.path.dirname(ROOT), 'coop-anything', 'data', 'directory.yaml')
RAW_SRC = 'https://raw.githubusercontent.com/cranebeaker/coop-anything/main/data/directory.yaml'
OVERRIDES = os.path.join(ROOT, 'data', 'overrides.json')
HUB_URL = 'https://github.com/cranebeaker/coop-anything'
HUB_RAW = 'https://raw.githubusercontent.com/cranebeaker/coop-anything/main/'

# Filled in by other tools; kept across imports.
CARRY = ['stars', 'starsWeek', 'version', 'versionDate', 'started', 'updated', 'cover', 'coverFrom',
         'platforms', 'platformsFrom', 'platformsTag', 'visitsWeek', 'repoMoved']

STAGE = {'playable': 'released', 'official': 'released', 'partial': 'beta', 'alpha': 'development',
         'prototype': 'development', 'abandoned': 'abandoned', 'none': 'wanted'}
NETWORK = {'steam-relay': 'Steam (no port forwarding)', 'hosted-relay': 'Hosted relay', 'direct-ip': 'Direct IP',
           'dedicated-server': 'Dedicated server', 'lan': 'LAN or split-screen', 'vpn-needed': 'VPN needed'}
QA = {'none': 'Not checked', 'community-reports': 'Player reports', 'automated': 'Automated tests',
      'verified-playthrough': 'Verified playthrough'}
# How far along the status says it is, before looking at what's shared.
STATUS_PCT = {'official': 90, 'playable': 85, 'partial': 60, 'alpha': 35, 'prototype': 15, 'abandoned': 30, 'none': 0}
SCOPE_KEYS = ['players_visible', 'story', 'enemies', 'world_state', 'items']
SCOPE_PCT = {'yes': 100, 'shared': 100, 'per-player': 100, 'partial': 50, 'no': 0}


def slug(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"['.]", '', s)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def norm(v):
    """YAML turns yes/no into booleans; give them back as words."""
    if v is True:
        return 'yes'
    if v is False:
        return 'no'
    v = str(v if v is not None else 'unknown').strip().lower()
    return v or 'unknown'


def read_src(src):
    if src.startswith('http'):
        with urllib.request.urlopen(src, timeout=60) as r:
            return yaml.safe_load(r.read().decode('utf-8'))
    with open(src, encoding='utf-8') as f:
        return yaml.safe_load(f)


def month_date(s):
    """"2026-08" -> "2026-08-01"; a bare year or "unknown" -> None."""
    m = re.fullmatch(r'(\d{4})-(\d{2})(?:-(\d{2}))?', str(s or ''))
    return f'{m[1]}-{m[2]}-{m[3] or "01"}' if m else None


def coop_pct(status, scope):
    base = STATUS_PCT.get(status, 0)
    known = [SCOPE_PCT[v] for v in scope.values() if v in SCOPE_PCT]
    if status == 'none':
        return 0
    if not known:
        return base
    return round(0.6 * base + 0.4 * sum(known) / len(known))


def tier(status, scope, qa):
    if status == 'none':
        return 'X'
    if status in ('official', 'playable'):
        return 'A' if scope['story'] == 'yes' or qa in ('automated', 'verified-playthrough') else 'B'
    if status == 'partial':
        return 'B' if scope['story'] in ('yes', 'partial') else 'C'
    if status == 'alpha':
        return 'C'
    return 'D'


def team_of(url):
    m = re.match(r'https?://(?:www\.)?(?:github\.com|gitlab\.com|codeberg\.org)/([^/]+)', url or '')
    return m[1] if m else None


def is_repo(url):
    return bool(re.match(r'https?://(?:www\.)?(?:github\.com|gitlab\.com|codeberg\.org)/[^/]+/[^/]+/?$', url or ''))


def fold(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"['.]", '', s).replace('&', ' and ').replace('+', ' and ')
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', s).split())


def read_hub(src):
    """From the Co-op Anything repo next to the directory: the projects its README lists as made
    with it ("Games being made co-op right now" and "From the community"), and its per-game
    write-ups (games/<slug>/README.md) keyed by the folded game name in their heading."""
    readme, writeups = '', {}
    if src.startswith('http'):
        try:
            with urllib.request.urlopen(HUB_RAW + 'README.md', timeout=60) as r:
                readme = r.read().decode('utf-8')
        except OSError:
            pass
    else:
        hub = os.path.dirname(os.path.dirname(os.path.abspath(src)))
        path = os.path.join(hub, 'README.md')
        if os.path.exists(path):
            readme = open(path, encoding='utf-8').read()
        games = os.path.join(hub, 'games')
        for slug_ in sorted(os.listdir(games)) if os.path.isdir(games) else []:
            md = os.path.join(games, slug_, 'README.md')
            if os.path.exists(md):
                head = open(md, encoding='utf-8').readline().lstrip('# ').strip()
                name = re.sub(r'\s*\([^)]*\)', '', head)
                writeups[fold(name)] = f'{HUB_URL}/tree/main/games/{slug_}'
    # The README's own projects table (it was renamed from "Games being made co-op right now").
    m = re.search(r'(?:Games being made co-op right now|Games so far)(.*?)\n## ', readme, re.S)
    links = re.findall(r'\]\(([^)\s]+)\)', m[1]) if m else []
    made = [u if u.startswith('http') else f'{HUB_URL}/tree/main/{u.strip("/")}' for u in links]
    return [u.rstrip('/') for u in made], writeups


def made_with_hub(url, made):
    url = (url or '').rstrip('/')
    if not url:
        return False
    if 'github.com/cranebeaker/' in url:
        return True
    return any(url == u or u.startswith(url + '/') or url.startswith(u + '/') for u in made)


def writeup_for(title, writeups):
    """The write-up whose heading names this game, alone or first in a list ("X and Y")."""
    t = fold(re.sub(r'\s*\((?!\d{4}\))[^)]*\)\s*$', '', title))
    return next((u for name, u in writeups.items() if t and (t == name or name.startswith(t + ' and '))), None)


def convert(e):
    status = norm(e.get('status'))
    kind = norm(e.get('kind'))
    raw_scope = e.get('coop_scope') or {}
    scope = {k: norm(raw_scope.get(k)) for k in SCOPE_KEYS}
    qa = norm(e.get('qa'))
    game = str(e.get('game') or '').strip()
    project = str(e.get('project') or '').strip()
    url = (e.get('url') or '').strip() or None
    net = norm(e.get('networking'))
    open_source = norm(e.get('open_source'))
    multi = game.lower() in ('(multiple)', 'multiple', '')

    feats = []
    if scope['story'] == 'yes':
        feats.append('story')
    elif scope['story'] == 'partial':
        feats.append('story-partial')
    if scope['enemies'] == 'yes':
        feats.append('enemies')
    if scope['world_state'] == 'yes':
        feats.append('world')
    if scope['items'] in ('shared', 'yes'):
        feats.append('shared-items')
    if net in ('steam-relay', 'hosted-relay'):
        feats.append('easy-join')
    if open_source == 'yes':
        feats.append('open-source')
    if qa == 'automated':
        feats.append('auto-tested')
    elif qa == 'community-reports':
        feats.append('player-reports')
    if e.get('up_for_adoption'):
        feats.append('adopt')

    engine = str(e.get('engine') or '').strip()
    engine_short = re.sub(r'\s*\(.*$', '', engine).strip() or 'Unknown engine'
    year = e.get('year')
    year = year if isinstance(year, int) else (int(year) if str(year or '').isdigit() else None)
    title = project if multi else game
    if kind == 'gap':
        project = 'No co-op project yet'

    repo = url if is_repo(url) else None
    return {
        'id': None,
        'title': title,
        'project': project,
        'console': kind,
        'year': year,
        'developer': None,
        'genre': 'Multi-game tool' if multi else engine_short,
        'engine': engine or None,
        'stage': STAGE.get(status, 'development'),
        'status': status,
        'quality': tier(status, scope, qa),
        'toolchain': NETWORK.get(net, 'Unknown'),
        'team': team_of(url),
        'repo': repo,
        'website': None if repo else url,
        'otherUrls': [u for u in (e.get('other_urls') or []) if u],
        'version': None,
        'versionDate': None,
        'started': None,
        'updated': month_date(e.get('last_activity')),
        'stars': None,
        'features': feats,
        'ai': 'cranebeaker' in (url or '') or 'coop-anything' in (url or ''),
        'summary': str(e.get('notes') or '').strip() or None,
        'requires': None if kind in ('gap', 'framework') or multi else f'Your own copy of {game}.',
        'scope': scope,
        'players': None if norm(e.get('players')) == 'unknown' else str(e.get('players')),
        'qa': qa,
        'qaLabel': QA.get(qa, qa),
        'openSource': open_source,
        'coopPct': coop_pct(status, scope),
        'adopt': bool(e.get('up_for_adoption')),
        'sources': [u for u in (e.get('sources') or []) if u],
        'searched': e.get('searched') or None,
        'checked': str(e.get('checked') or '') or None,
        'platforms': None,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--src', default=DEFAULT_SRC if os.path.exists(DEFAULT_SRC) else RAW_SRC)
    args = ap.parse_args()

    src = read_src(args.src)
    made, writeups = read_hub(args.src)
    old = {}
    head = meta = None
    if os.path.exists(DATA):
        _, head, meta, entries = load(DATA)
        old = {e['id']: e for e in entries}
    overrides = {}
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding='utf-8') as f:
            overrides = {k: v for k, v in json.load(f).items() if not k.startswith('_')}

    out, seen = [], set()
    for raw in src:
        e = convert(raw)
        urls = [raw.get('url')] + list(raw.get('other_urls') or [])
        # An entry can also say so itself (made_with_coop_anything: true), e.g. a Discord dev's mod.
        e['coopAnything'] = raw.get('made_with_coop_anything') is True or any(made_with_hub(u, made) for u in urls)
        if e['coopAnything']:
            e['features'].insert(0, 'coop-anything')
        e['writeup'] = writeup_for(e['title'], writeups)
        base = slug(f"{e['title']}-{raw.get('project') or ''}")[:70].strip('-') or 'project'
        i, eid = 1, base
        while eid in seen:
            i += 1
            eid = f'{base}-{i}'
        seen.add(eid)
        e['id'] = eid
        prev = old.get(eid)
        if prev:
            for k in CARRY:
                if prev.get(k) is not None:
                    e[k] = prev[k]
            # The directory only knows the month; GitHub's last push is more precise.
            if prev.get('updated') and (not e['updated'] or prev['updated'] >= e['updated']):
                e['updated'] = prev['updated']
        e.update(overrides.get(eid, {}))
        out.append(e)

    if head is None:
        head = HEAD
    meta = dict(meta or {}, snapshot=dt.date.today().isoformat(), source='coop-anything')
    with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
        f.write(dump(head, meta, out))
    stages = {}
    for e in out:
        stages[e['stage']] = stages.get(e['stage'], 0) + 1
    print(f'{len(out)} entries from {args.src} -> {DATA}: {stages}')
    unknown = sorted(set(overrides) - seen)
    if unknown:
        print('overrides for ids that no longer exist:', ', '.join(unknown))


HEAD = '''/*
 * CoOp:Anything data: one object per co-op project, built by tools/import_coop.py from the
 * Co-op Anything directory (https://github.com/cranebeaker/coop-anything, data/directory.yaml).
 * Edit the directory, or data/overrides.json for site-only calls, never this file by hand.
 *
 * Fields
 *   id           unique slug (game + project), stable across imports
 *   title        the game's name ("(multiple)" tools use their own name)
 *   project      the co-op project's name
 *   console      kind of project: mod | fork | framework | decomp-port | official | emulator-netplay | gap
 *   year         original game's release year
 *   genre        engine family (shortened); engine is the full engine note
 *   stage        released | beta | development | abandoned | wanted
 *   status       the directory's own status word
 *   quality      S | A | B | C | D | X  (see the legend on the site; S only by hand)
 *   toolchain    how players connect (Steam, hosted relay, direct IP, ...)
 *   team         repository owner, when the project is on GitHub, GitLab or Codeberg
 *   repo, website, otherUrls
 *   version, versionDate   latest tagged release (tools/refresh_stats.py)
 *   started, updated       repository created, last push (or the directory's last activity)
 *   stars, starsWeek       GitHub stars and stars gained in the last 7 days
 *   features     story | story-partial | enemies | world | shared-items | easy-join | open-source
 *                | auto-tested | player-reports | adopt
 *   scope        what the directory confirms is shared: players_visible, story, enemies, world_state, items
 *   coopPct      estimated co-op completeness 0 to 100 (community votes replace it on the site)
 *   players, qa, qaLabel, openSource, adopt, sources, searched, checked
 *   ai           true for projects built with AI agents (the Co-op Anything ones say so)
 *   coopAnything true when the Co-op Anything README lists it as made with Co-op Anything
 *   writeup      link to the game's write-up in coop-anything/games/, when there is one
 *   summary, requires
 *   pick, pickNote, playthrough   optional, set by hand in data/overrides.json
 */
'''

if __name__ == '__main__':
    main()
