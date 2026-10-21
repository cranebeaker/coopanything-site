#!/usr/bin/env python3
"""Fetch box art covers for data/recomps.js.

The game's art is decided once per distinct `title` and shared by every entry
with that title (one file: assets/covers/<slug-of-title>.webp). Sources, in
order: the Steam portrait capsule (library_600x900, then header.jpg), then the
English Wikipedia infobox image.

Hand-set `coverFrom` hints are honoured:
    steam:<appid>            use exactly this Steam app
    wikipedia:<page title>   use exactly this Wikipedia page
    none | manual            never touched

Entries whose genre is "Multi-game tool" get coverFrom "none".

Needs Python 3.11 and Pillow.

    python tools/fetch_covers_coop.py                 # entries without a cover
    python tools/fetch_covers_coop.py --force         # redo everything
    python tools/fetch_covers_coop.py --only <id>     # one entry's title group
    python tools/fetch_covers_coop.py --mark-missing  # coverFrom "none" if not found
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

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh_stats import DATA, ROOT, dump, load  # noqa: E402

UA = 'coop-haven-covers/1.0 (https://github.com/cranebeaker/coop-anything)'
COVER_DIR = os.path.join(ROOT, 'assets', 'covers')
MAX_SIDE = 450
QUALITY = 82
DELAY = 0.5
MIN_RATIO = 0.9
BAD_WORDS = re.compile(r'soundtrack|\bdlc\b|\bdemo\b|bundle|\bpack\b|artbook|season pass|dedicated server|\bsdk\b|\btool\b', re.I)

# Words Steam may add to a title without it being a different game.
SAFE_EXTRA = {'hd', 'remastered', 'remaster', 'edition', 'definitive', 'enhanced', 'special', 'game', 'of',
              'the', 'year', 'goty', 'directors', 'director', 's', 'cut', 'legendary', 'complete', 'collection',
              'classic', 'gold', 'anniversary', 'ultimate', 'deluxe', 'standard', 'and'}

_last = [0.0]


def pause():
    wait = DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()


def http(url, binary=False, tries=3):
    for attempt in range(tries):
        pause()
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return data if binary else json.loads(data.decode('utf-8'))
        except urllib.error.HTTPError as err:
            if err.code in (404, 403, 400):
                return None
            if err.code in (429, 500, 502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError):
            time.sleep(2 * (attempt + 1))
    return None


def slugify(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'cover'


def norm(text):
    text = re.sub(r'[™®©]', '', text).lower().replace('&', ' and ')
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    text = re.sub(r"[^a-z0-9]+", ' ', text.replace("'", '')).strip()
    return re.sub(r'^the ', '', text)


YEAR_NOTE = re.compile(r'\s*\((\d{4})[^)]*\)\s*$')
ANY_NOTE = re.compile(r'\s*\([^)]*\)\s*$')


def title_info(title):
    """(base title, year or None, [name candidates in preference order])."""
    year = None
    t = title.strip()
    m = YEAR_NOTE.search(t)
    if m:
        year = m.group(1)
        t = t[:m.start()]
    else:
        t = ANY_NOTE.sub('', t)
    names = [t]
    # "A / B", "A, B and C", "A and B": the first game named.
    for sep in (' / ', ', ', ' and '):
        if sep in t:
            names.append(t.split(sep)[0].strip())
            break
    out = []
    for n in names:
        if n not in out:
            out.append(n)
    return t, year, out


def steam_search(name):
    url = ('https://store.steampowered.com/api/storesearch/?term='
           + urllib.parse.quote(name) + '&cc=us&l=en')
    data = http(url)
    if not data:
        return None
    want = norm(name)
    best = None
    for item in data.get('items', []):
        if item.get('type') not in (None, 'app'):
            continue
        got = item.get('name', '')
        if BAD_WORDS.search(got) and not BAD_WORDS.search(name):
            continue
        ratio = 1.0 if norm(got) == want else difflib.SequenceMatcher(None, norm(got), want).ratio()
        extra = set(norm(got).split()) - set(want.split())
        if extra - SAFE_EXTRA:
            continue
        if ratio >= MIN_RATIO and (best is None or ratio > best[0]):
            best = (ratio, item['id'], got)
    return best


def fetch_image(urls):
    for url in urls:
        data = http(url, binary=True)
        if data and len(data) > 1500:
            try:
                img = Image.open(io.BytesIO(data))
                img.load()
                return img
            except Exception:
                continue
    return None


def steam_image(appid):
    base = f'steam/apps/{appid}'
    return fetch_image([
        f'https://shared.cloudflare.steamstatic.com/store_item_assets/{base}/library_600x900.jpg',
        f'https://cdn.cloudflare.steamstatic.com/{base}/library_600x900.jpg',
        f'https://cdn.cloudflare.steamstatic.com/{base}/header.jpg',
    ])


def wiki_file_url(filename):
    """URL of a File: page on en.wikipedia (non-free covers are not served by pageimages)."""
    url = ('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url'
           '&titles=' + urllib.parse.quote('File:' + filename.replace('_', ' ')))
    data = http(url)
    if not data:
        return None
    for p in data.get('query', {}).get('pages', {}).values():
        info = p.get('imageinfo')
        if info:
            return info[0].get('url')
    return None


def wiki_image(page, require_game=True):
    """(image, resolved page title) from the English Wikipedia infobox image."""
    url = ('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1'
           '&prop=pageimages|pageprops|categories&piprop=original&ppprop=wikibase-shortdesc|page_image'
           '&cllimit=max&titles=' + urllib.parse.quote(page))
    data = http(url)
    if not data:
        return None
    for p in data.get('query', {}).get('pages', {}).values():
        if 'missing' in p:
            return None
        props = p.get('pageprops', {})
        desc = props.get('wikibase-shortdesc', '')
        cats = ' '.join(c.get('title', '') for c in p.get('categories', []))
        if require_game and not re.search(r'video game', desc + ' ' + cats, re.I):
            return None
        if require_game and re.search(r'series|franchise|disambig', desc, re.I):
            return None
        src = p.get('original', {}).get('source')
        if not src and props.get('page_image'):
            src = wiki_file_url(props['page_image'])
        if not src or src.lower().endswith(('.svg', '.gif', '.ogv', '.webm')):
            return None
        img = fetch_image([src])
        if img:
            return img, p['title']
    return None


def to_webp(img, path):
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert('RGB')
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=QUALITY, method=6)


def resolve(title, hints):
    """(image, coverFrom, note) or None."""
    base, year, names = title_info(title)
    for hint in hints:
        if hint.startswith('steam:'):
            appid = hint[6:]
            img = steam_image(appid)
            if img:
                return img, hint, 'hint'
        elif hint.startswith('wikipedia:'):
            res = wiki_image(hint[10:], require_game=False)
            if res:
                return res[0], 'wikipedia:' + res[1], 'hint'
    if hints:
        return None
    wiki_names = []
    for n in names:
        if year:
            wiki_names.append(f'{n} ({year} video game)')
        wiki_names += [f'{n} (video game)', n]
    if year:
        # The year pins the version, so Steam (current listing) is unsafe.
        order = ['wiki']
    else:
        order = ['steam', 'wiki']
    for src in order:
        if src == 'steam':
            for n in names:
                hit = steam_search(n)
                if hit:
                    img = steam_image(hit[1])
                    if img:
                        return img, f'steam:{hit[1]}', f'{hit[2]!r} ({hit[0]:.2f})'
        else:
            for w in wiki_names:
                res = wiki_image(w)
                if res:
                    return res[0], 'wikipedia:' + res[1], 'page'
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--force', action='store_true', help='redo entries that already have a cover')
    ap.add_argument('--only', metavar='ID', help='only the title group of this entry id')
    ap.add_argument('--mark-missing', action='store_true', help='set coverFrom "none" when nothing is found')
    args = ap.parse_args()

    _, head, meta, entries = load(DATA)
    by_id = {e['id']: e for e in entries}
    if args.only and args.only not in by_id:
        sys.exit(f'no entry with id {args.only}')

    def save():
        with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump(head, meta, entries))

    groups = {}
    for e in entries:
        if e.get('coverFrom') in ('manual', 'none'):
            continue
        if e.get('genre') == 'Multi-game tool':
            e['coverFrom'] = 'none'
            e.pop('cover', None)
            continue
        groups.setdefault(e['title'], []).append(e)

    if args.only:
        wanted = by_id[args.only]['title']
        if args.only and by_id[args.only].get('coverFrom') in ('manual', 'none'):
            sys.exit('that entry is manual/none; change its coverFrom hint first')
        groups = {wanted: groups.get(wanted, [])}

    found, missing, review = 0, [], []
    for title, group in groups.items():
        todo = [e for e in group if args.force or args.only or not e.get('cover')]
        if not todo:
            continue
        done = next((e for e in group if e.get('cover') and not (args.force or args.only)), None)
        rel = f'assets/covers/{slugify(title)}.webp'
        if done:
            for e in todo:
                e['cover'], e['coverFrom'] = done['cover'], done.get('coverFrom', '')
            continue
        hints = []
        for e in group:
            h = e.get('coverFrom', '')
            if h.startswith(('steam:', 'wikipedia:')) and h not in hints:
                hints.append(h)
        res = resolve(title, hints)
        if res:
            img, src, note = res
            to_webp(img, os.path.join(ROOT, *rel.split('/')))
            for e in todo:
                e['cover'], e['coverFrom'] = rel, src
            found += len(todo)
            review.append((title, src, note))
            print(f'{title} -> {src} {note}', flush=True)
        else:
            missing.append(title)
            if args.mark_missing:
                for e in todo:
                    e.pop('cover', None)
                    e['coverFrom'] = 'none'
            print(f'{title} -> NOT FOUND', flush=True)
        save()
    save()

    print('\n=== Review list ===')
    for title, src, note in review:
        print(f'{title} -> {src}  [{note}]')
    print(f'\n=== No cover ({len(missing)}) ===')
    for t in missing:
        print(t)
    print(f'\nEntries given a cover this run: {found}')


if __name__ == '__main__':
    main()
