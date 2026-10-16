#!/usr/bin/env python3
"""Tag which recomps can be played with keyboard and mouse, from GitHub.

Reads each project's README and its three newest release notes and adds a
feature tag to the entry's "features":

    "keyboard-mouse"  keyboard and mouse controls are supported
    "keyboard"        keyboard controls are supported, no mention of the mouse

and records how it was decided in "inputFrom": "github" (found by this
script), "none" (checked, nothing found) or "manual" (set by hand: never
touched by this script). Mentions next to "not supported", "planned",
"controller required" and the like are skipped.

By default only entries without "inputFrom" are checked. No token needed.

    python tools/detect_input.py --dry-run --verbose
    python tools/detect_input.py
    python tools/detect_input.py --all --only skate-3
"""

import argparse
import html
import os
import re
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh_stats import DATA, dump, load  # noqa: E402
from fetch_covers import http  # noqa: E402

REPO_RE = re.compile(r'^https://github\.com/([^/]+/[^/#?]+)')
TAGS = ('keyboard-mouse', 'keyboard')

KEYBOARD = re.compile(r'\bkeyboards?\b|\bkb\s*[+&/]\s*m\b|\bm\s*[+&/]\s*kb?\b|\bk\s*[+&/]\s*m\b|\bwasd\b', re.I)
MOUSE = re.compile(r'\bmouse\b|\bmouselook\b|\bmouse[- ]?aim', re.I)
NEGATION = re.compile(
    r"not (?:yet )?(?:supported|available|implemented|working|great|ideal)|unsupported|isn['’]t supported|"
    r"no (?:native )?(?:keyboard|mouse|kb)|without (?:a )?(?:keyboard|mouse)|controller (?:is )?required|"
    r"gamepad (?:is )?required|requires? a (?:controller|gamepad)|planned|coming soon|\btodo\b|"
    r"in the future|eventually|not yet|weak|broken|doesn['’]t work|does not work|missing", re.I)
# Debug keys and build tooling, not gameplay controls.
NOT_CONTROLS = re.compile(r'shortcut|hotkey|debug|keyboard layout|on-screen keyboard|virtual keyboard|\bide\b', re.I)


def texts(repo):
    """README and recent release notes, as plain-text lines."""
    out = []
    for name in ('README.md', 'readme.md', 'README.txt', 'README'):
        raw = http(f'https://raw.githubusercontent.com/{repo}/HEAD/{name}')
        if raw:
            out += raw.decode('utf-8', 'replace').splitlines()
            break
    atom = http(f'https://github.com/{repo}/releases.atom')
    if atom:
        for content in re.findall(r'<content type="html">(.*?)</content>', atom.decode('utf-8', 'replace'), re.S)[:3]:
            body = re.sub(r'<[^>]+>', '\n', html.unescape(html.unescape(content)))
            out += body.splitlines()
    return out


def scan(lines, rx):
    """First line mentioning rx positively, or None."""
    for line in lines:
        for m in rx.finditer(line):
            near = line[max(0, m.start() - 70):m.end() + 70]
            if NEGATION.search(near) or NOT_CONTROLS.search(near):
                continue
            return line.strip()[:170]
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--dry-run', action='store_true', help='print what was found, write nothing')
    ap.add_argument('--all', action='store_true', help='recheck every entry not set by hand')
    ap.add_argument('--only', action='append', metavar='ID', help='only these entries (repeatable)')
    ap.add_argument('--verbose', action='store_true', help='print the evidence lines')
    args = ap.parse_args()

    _, head, meta, entries = load(DATA)
    changed = 0
    for e in entries:
        if args.only and e['id'] not in args.only:
            continue
        m = REPO_RE.match(e.get('repo') or '')
        if not m or e.get('inputFrom') == 'manual':
            continue
        if not args.all and 'inputFrom' in e:
            continue
        try:
            lines = texts(m[1])
        except (urllib.error.URLError, OSError) as err:
            print(f'  !  {e["id"]:<40} {err}')
            continue
        kb, mouse = scan(lines, KEYBOARD), scan(lines, MOUSE)
        tag = 'keyboard-mouse' if kb and mouse else 'keyboard' if kb else None
        print(f'  {e["id"]:<40} {tag or "-"}')
        if args.verbose:
            for label, ev in (('kb', kb), ('mouse', mouse)):
                if ev:
                    print(f'       {label}: {ev}')
        features = [f for f in e.get('features', []) if f not in TAGS] + ([tag] if tag else [])
        source = 'github' if tag else 'none'
        if features != e.get('features') or source != e.get('inputFrom'):
            e['features'] = features
            e['inputFrom'] = source
            changed += 1

    if changed and not args.dry_run:
        with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump(head, meta, entries))
    print(f'\n{"Would update" if args.dry_run else "Updated"} {changed} entries.')


if __name__ == '__main__':
    main()
