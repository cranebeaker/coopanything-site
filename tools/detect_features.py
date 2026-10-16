#!/usr/bin/env python3
"""Tag recomps' controls and mod tooling, from what their GitHub pages say.

Reads each project's README and its three newest release notes and sets
feature tags in the entry's "features":

  Keyboard and mouse (marker "inputFrom")
    "keyboard-mouse"  keyboard and mouse controls are supported
    "keyboard"        keyboard controls are supported, no mention of the mouse

  Mod manager (marker "modManagerFrom")
    "mod-manager"     community mods can be found and installed through a mod
                      manager or mod site: Thunderstore, r2modman, an in-game
                      mod browser or menu

Each marker records how its tags were decided: "github" (found by this
script), "none" (checked, nothing found) or "manual" (set by hand: never
touched by this script). Mentions next to "not supported", "planned",
"controller required" and the like are skipped.

By default an entry is only checked for the markers it doesn't have yet.
No token needed.

    python tools/detect_features.py --dry-run --verbose
    python tools/detect_features.py
    python tools/detect_features.py --all --only skate-3
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

KEYBOARD = re.compile(r'\bkeyboards?\b|\bkb\s*[+&/]\s*m\b|\bm\s*[+&/]\s*kb?\b|\bk\s*[+&/]\s*m\b|\bwasd\b', re.I)
MOUSE = re.compile(r'\bmouse\b|\bmouselook\b|\bmouse[- ]?aim', re.I)
MOD_MANAGER = re.compile(
    r'thunderstore|r2modman|mod (?:manager|browser|store|downloader|menu|loader ui)|'
    r'download(?:s|ing)? (?:user[- ]made |community )?mods|install(?:s|ing)? mods (?:from|in)|in-?game mods?\b', re.I)
NEGATION = re.compile(
    r"not (?:yet )?(?:supported|available|implemented|working|great|ideal)|unsupported|isn['’]t supported|"
    r"no (?:native )?(?:keyboard|mouse|kb|mod)|without (?:a )?(?:keyboard|mouse)|controller (?:is )?required|"
    r"gamepad (?:is )?required|requires? a (?:controller|gamepad)|planned|coming soon|\btodo\b|"
    r"in the future|eventually|not yet|weak|broken|doesn['’]t work|does not work|missing|looking into", re.I)
# Debug keys and build tooling, not gameplay controls.
NOT_CONTROLS = re.compile(r'shortcut|hotkey|debug|keyboard layout|on-screen keyboard|virtual keyboard|\bide\b', re.I)

INPUT_TAGS = ('keyboard-mouse', 'keyboard')


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


def scan(lines, rx, skip=None):
    """First line mentioning rx positively, or None."""
    for line in lines:
        for m in rx.finditer(line):
            near = line[max(0, m.start() - 70):m.end() + 70]
            if NEGATION.search(near) or (skip and skip.search(near)):
                continue
            return line.strip()[:170]
    return None


def input_tags(lines):
    kb, mouse = scan(lines, KEYBOARD, NOT_CONTROLS), scan(lines, MOUSE, NOT_CONTROLS)
    tags = ['keyboard-mouse'] if kb and mouse else ['keyboard'] if kb else []
    return tags, {'kb': kb, 'mouse': mouse}


def mod_manager_tags(lines):
    hit = scan(lines, MOD_MANAGER)
    return (['mod-manager'] if hit else []), {'mods': hit}


# (marker, tags it owns, detector)
DETECTORS = (
    ('inputFrom', INPUT_TAGS, input_tags),
    ('modManagerFrom', ('mod-manager',), mod_manager_tags),
)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--dry-run', action='store_true', help='print what was found, write nothing')
    ap.add_argument('--all', action='store_true', help='recheck every marker not set by hand')
    ap.add_argument('--only', action='append', metavar='ID', help='only these entries (repeatable)')
    ap.add_argument('--verbose', action='store_true', help='print the evidence lines')
    args = ap.parse_args()

    _, head, meta, entries = load(DATA)
    changed = 0
    for e in entries:
        if args.only and e['id'] not in args.only:
            continue
        m = REPO_RE.match(e.get('repo') or '')
        if not m:
            continue
        due = [d for d in DETECTORS if e.get(d[0]) != 'manual' and (args.all or d[0] not in e)]
        if not due:
            continue
        try:
            lines = texts(m[1])
        except (urllib.error.URLError, OSError) as err:
            print(f'  !  {e["id"]:<40} {err}')
            continue
        features = list(e.get('features', []))
        report = []
        for marker, owned, detect in due:
            tags, evidence = detect(lines)
            features = [f for f in features if f not in owned] + tags
            source = 'github' if tags else 'none'
            report.append(','.join(tags) or '-')
            if args.verbose:
                report += [f'\n       {k}: {v}' for k, v in evidence.items() if v]
            if source != e.get(marker):
                e[marker] = source
                changed += 1
        if features != e.get('features'):
            e['features'] = features
            changed += 1
        print(f'  {e["id"]:<40} ' + ' '.join(report))

    if changed and not args.dry_run:
        with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump(head, meta, entries))
    print(f'\n{"Would make" if args.dry_run else "Made"} {changed} changes.')


if __name__ == '__main__':
    main()
