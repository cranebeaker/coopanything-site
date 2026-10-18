#!/usr/bin/env python3
"""Fetch box art for the entries in data/recomps.js that don't have a cover yet.

Each cover is saved as assets/covers/<id>.webp, at most 360 px on its longest
side, and the entry gets two fields:

    "cover"      the image the site shows (null shows a placeholder)
    "coverFrom"  where it came from, which is also how you steer the next fetch:
                   "libretro:<box art name>"  a box art on thumbnails.libretro.com for
                                              the entry's console, e.g.
                                              "libretro:Castlevania (USA)"
                   "wikipedia:<page title>"   the infobox image of that English
                                              Wikipedia page
                   "none"                     no cover; keep the placeholder
                   anything else, e.g. "manual"  your own image: never touched

Without a "coverFrom" hint the script tries the libretro thumbnail server (the
box art RetroArch uses) by title, then the best-matching English Wikipedia
article about the game. Covers whose file exists are kept: to replace one, edit
its "coverFrom" and run with --only ID --force.

Needs Pillow (pip install pillow). Standard library otherwise.

    python tools/fetch_covers.py --dry-run
    python tools/fetch_covers.py
    python tools/fetch_covers.py --only castlevania-64 --force
"""

import argparse
import difflib
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh_stats import DATA, ROOT, dump, load  # noqa: E402

COVERS = os.path.join(ROOT, 'assets', 'covers')
COVER_PATH = 'assets/covers/{}.webp'
MAX_SIDE = 360
UA = 'RecompHaven-covers/1.0 (game recompilation tracker; box art fetcher)'
LIBRETRO = 'https://thumbnails.libretro.com/'
WIKI_API = 'https://en.wikipedia.org/w/api.php'

# Console keys (see CONSOLES in app.js) to libretro system folders, best first.
SYSTEMS = {
    'n64': ['Nintendo - Nintendo 64'],
    'snes': ['Nintendo - Super Nintendo Entertainment System'],
    'gba': ['Nintendo - Game Boy Advance'],
    'nds': ['Nintendo - Nintendo DS'],
    '3ds': ['Nintendo - Nintendo 3DS'],
    'switch': [],  # libretro has no Switch box art: Wikipedia only
    'mac': [],     # nor classic Macintosh
    'gamecube': ['Nintendo - GameCube'],
    'wii': ['Nintendo - Wii'],
    'wiiu': ['Nintendo - Wii U'],
    'ps1': ['Sony - PlayStation'],
    'ps2': ['Sony - PlayStation 2'],
    'ps4': ['Sony - PlayStation 4'],
    'psp': ['Sony - PlayStation Portable'],
    'megadrive': ['Sega - Mega Drive - Genesis'],
    'dreamcast': ['Sega - Dreamcast', 'Sega - Naomi 2', 'Sega - Naomi'],
    'xbox': ['Microsoft - Xbox'],
    'x360': ['Microsoft - Xbox 360'],
    'arcade': ['MAME', 'FBNeo - Arcade Games'],
}

# Box art of demos, kiosk discs, prototypes and re-releases on other hardware.
SKIP_TAG = re.compile(
    r'\([^)]*\b(?:demo|kiosk|debug|beta|proto|prototype|sample|virtual console|gamecube|'
    r'unl|pirate|hack|aftermarket|trial|preview|promo|competition|ique)\b[^)]*\)', re.I)
NUMBERS = re.compile(r'\b(?:\d+|i{1,3}|iv|v|vi{1,3}|ix|x)\b')


def norm(s):
    """Comparable form of a title: ASCII, lower case, no punctuation or leading 'the'."""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = s.lower().replace('&', ' and ')
    s = re.sub(r"['’`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    return re.sub(r'^the ', '', s)


def plain_title(title):
    """'Daytona USA (XBLA)' -> 'Daytona USA'."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', title)


def libretro_base(name):
    """'Legend of Zelda, The - Majora's Mask (USA) (Rev 1)' -> 'The Legend of Zelda - Majora's Mask'."""
    base = name.split(' (')[0].replace(' _ ', ' & ')  # libretro writes '&' as '_'
    m = re.match(r'^(.*?), (The|A|An)( - .*)?$', base)
    return f'{m[2]} {m[1]}{m[3] or ""}' if m else base


def same_numbers(a, b):
    """'Mega Man X2' and 'Mega Man X' must not match: sequels differ by a number."""
    return NUMBERS.findall(a) == NUMBERS.findall(b)


def similar(a, b, threshold):
    if a == b:
        return 1.0
    if not same_numbers(a, b):
        return 0.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    return r if r >= threshold else 0.0


def region_rank(name):
    tags = ' '.join(re.findall(r'\(([^)]*)\)', name)).lower()
    for i, region in enumerate(('usa', 'world', 'europe', 'australia', 'japan')):
        if region in tags:
            return i
    return 5


# Minimum seconds between requests to one host, so Wikipedia doesn't answer 429.
SPACING = {'en.wikipedia.org': 1.0, 'upload.wikimedia.org': 0.5}
_last_request = {}


def http(url, retries=6):
    host = urllib.parse.urlsplit(url).hostname
    for attempt in range(retries):
        wait = SPACING.get(host, 0) - (time.monotonic() - _last_request.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_request[host] = time.monotonic()
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            if attempt == retries - 1 or err.code < 500 and err.code != 429:
                raise
            try:
                delay = int(err.headers.get('Retry-After'))
            except (TypeError, ValueError):
                delay = min(5 * 2 ** attempt, 60)
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
            delay = min(5 * 2 ** attempt, 60)
        time.sleep(delay)
    return None


class Libretro:
    def __init__(self):
        self.listings = {}

    def names(self, system):
        if system not in self.listings:
            page = http(f'{LIBRETRO}{urllib.parse.quote(system)}/Named_Boxarts/') or b''
            hrefs = re.findall(r'href="([^"?/]+\.png)"', page.decode('utf-8', 'replace'))
            self.listings[system] = [urllib.parse.unquote(h)[:-4] for h in hrefs]
        return self.listings[system]

    def url(self, system, name):
        return f'{LIBRETRO}{urllib.parse.quote(system)}/Named_Boxarts/{urllib.parse.quote(name)}.png'

    def exact(self, console, name):
        for system in SYSTEMS.get(console, []):
            if name in self.names(system):
                return self.url(system, name)
        return None

    def match(self, entry):
        want = norm(plain_title(entry['title']))
        for system in SYSTEMS.get(entry['console'], []):
            found = []
            for name in self.names(system):
                if SKIP_TAG.search(name):
                    continue
                score = similar(norm(libretro_base(name)), want, 0.93)
                if score:
                    found.append((-score, region_rank(name), len(name), name))
            if found:
                name = min(found)[3]
                return name, self.url(system, name)
        return None


class Wikipedia:
    def query(self, **params):
        params.update(action='query', format='json', formatversion=2, redirects=1)
        raw = http(f'{WIKI_API}?{urllib.parse.urlencode(params)}')
        return json.loads(raw)['query'] if raw else {}

    def image(self, title):
        pages = self.query(titles=title, prop='pageimages', piprop='thumbnail',
                           pithumbsize=480, pilicense='any').get('pages', [])
        return (pages[0].get('thumbnail') or {}).get('source') if pages else None

    def match(self, entry):
        want = norm(plain_title(entry['title']))
        pages = self.query(generator='search', gsrsearch=f'{plain_title(entry["title"])} video game',
                           gsrlimit=8, prop='pageimages|description', piprop='thumbnail',
                           pithumbsize=480, pilicense='any').get('pages', [])
        found = []
        for p in pages:
            desc = (p.get('description') or '').lower()
            thumb = (p.get('thumbnail') or {}).get('source')
            if not thumb or 'game' not in desc:
                continue
            score = similar(norm(plain_title(p['title'])), want, 0.85)
            if score:
                found.append((-score, p.get('index', 99), p['title'], thumb))
        if found:
            _, _, title, thumb = min(found)
            return title, thumb
        return None


def save_webp(data, path):
    from PIL import Image  # imported here so --dry-run works without Pillow

    img = Image.open(io.BytesIO(data))
    img = img.convert('RGBA' if 'A' in img.getbands() or img.mode == 'P' else 'RGB')
    if img.mode == 'RGBA' and img.getchannel('A').getextrema()[0] == 255:
        img = img.convert('RGB')
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=82, method=6)


def find(entry, libretro, wiki):
    """(coverFrom, image URL) for an entry, or (None, None)."""
    hint = entry.get('coverFrom')
    if hint and hint.startswith('libretro:'):
        url = libretro.exact(entry['console'], hint[len('libretro:'):])
        return (hint, url) if url else (None, None)
    if hint and hint.startswith('wikipedia:'):
        url = wiki.image(hint[len('wikipedia:'):])
        return (hint, url) if url else (None, None)
    hit = libretro.match(entry)
    if hit:
        return f'libretro:{hit[0]}', hit[1]
    hit = wiki.match(entry)
    if hit:
        return f'wikipedia:{hit[0]}', hit[1]
    return None, None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--dry-run', action='store_true', help='show matches, download and write nothing')
    ap.add_argument('--only', action='append', metavar='ID', help='only these entries (repeatable)')
    ap.add_argument('--force', action='store_true', help='fetch again even if the cover file exists')
    ap.add_argument('--summary', metavar='PATH', help='append a Markdown report (for $GITHUB_STEP_SUMMARY)')
    args = ap.parse_args()

    _, head, meta, entries = load(DATA)
    libretro, wiki = Libretro(), Wikipedia()
    added, missing, failed = [], [], []

    for e in entries:
        if args.only and e['id'] not in args.only:
            continue
        hint = e.get('coverFrom')
        default = os.path.join(COVERS, f'{e["id"]}.webp')
        if hint == 'none':
            continue
        if hint and not hint.startswith(('libretro:', 'wikipedia:')):
            continue  # the user's own image
        if not args.force:
            if e.get('cover') and os.path.exists(os.path.join(ROOT, e['cover'])):
                continue
            if os.path.exists(default):
                e['cover'] = COVER_PATH.format(e['id'])
                continue

        try:
            source, url = find(e, libretro, wiki)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError) as err:
            failed.append((e, str(err)))
            continue
        if not url:
            missing.append(e)
            print(f'  -  {e["id"]:<44} no match')
            continue
        print(f'  +  {e["id"]:<44} {source}')
        if args.dry_run:
            added.append((e, source))
            continue
        try:
            data = http(url)
            if not data:
                raise ValueError('image not found')
            save_webp(data, default)
        except Exception as err:  # bad download or unreadable image
            failed.append((e, str(err)))
            continue
        e['cover'] = COVER_PATH.format(e['id'])
        e['coverFrom'] = source
        added.append((e, source))
        time.sleep(0.2)

    if not args.dry_run and added:
        with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump(head, meta, entries))

    verb = 'Would add' if args.dry_run else 'Added'
    print(f'\n{verb} {len(added)} covers; {len(missing)} without a match; {len(failed)} failed.')
    for e, err in failed:
        print(f'  failed: {e["id"]}: {err}')

    if args.summary:
        lines = []
        if added:
            lines += [f'### New covers ({len(added)})', '', 'Check these look right; fix any with "coverFrom".', '']
            lines += [f'- **{e["title"]}** (`{e["id"]}`): {s}' for e, s in added]
        if missing:
            lines += ['', f'### No cover found ({len(missing)})', '']
            lines += [f'- **{e["title"]}** (`{e["id"]}`)' for e in missing]
        if lines:
            with open(args.summary, 'a', encoding='utf-8') as f:
                f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
