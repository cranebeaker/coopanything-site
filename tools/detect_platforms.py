#!/usr/bin/env python3
"""Work out which systems each recomp runs on (Windows, Linux, macOS, Android, Switch), from GitHub.

For every entry with a github.com repo this sets:

    "platforms"      a list of "windows", "linux", "macos", "android", "switch" (null when unknown)
    "platformsFrom"  "release"  the newest release has downloads for them
                     "readme"   the README says it runs or builds there
                     "manual"   set by hand: never touched by this script
    "platformsTag"   the release tag the downloads came from

Release downloads are read from GitHub's release pages (not the API, so no
token or rate limit). An entry whose newest release has no OS-specific files,
or that has no releases, falls back to what its README says, skipping
mentions like "Linux is planned" or "Android: coming soon".

"switch" means a native Nintendo Switch build (homebrew, a .nro or .nsp download). Projects
that port a Switch game to PC mention the Switch all over their READMEs, so for entries whose
console is the Switch only downloads count, never the README.

By default only entries without platforms, and release-based entries whose
newest release changed, are checked. Standard library only.

    python tools/detect_platforms.py --dry-run
    python tools/detect_platforms.py
    python tools/detect_platforms.py --all --only pt
"""

import argparse
import html
import os
import re
import sys
import urllib.error
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh_stats import DATA, dump, load  # noqa: E402
from fetch_covers import http  # noqa: E402

OSES = ('windows', 'linux', 'macos', 'android', 'switch')
REPO_RE = re.compile(r'^https://github\.com/([^/]+/[^/#?]+)')
IGNORE_ASSET = re.compile(r'\.(sha\d+|sig|asc|txt|md|json|yml|yaml|pdb|sym|ipa|vpk|pkg)$|source code', re.I)

WIN_TOKENS = {'windows', 'win', 'win64', 'win32', 'win10', 'win11', 'msvc', 'mingw', 'uwp'}
LINUX_TOKENS = {'linux', 'lin64', 'lin32', 'appimage', 'ubuntu', 'debian', 'fedora', 'steamdeck', 'steamos', 'flatpak'}
MAC_TOKENS = {'macos', 'mac', 'osx', 'darwin', 'macosx', 'applesilicon'}
ANDROID_TOKENS = {'android', 'apk'}
SWITCH_TOKENS = {'switch', 'nx', 'nro', 'nsp'}

README_OS = {
    'windows': re.compile(r'\bwindows\b|\bwin(?:64|32)\b|\.exe\b', re.I),
    'linux': re.compile(r'\blinux\b|steam ?deck|steamos|appimage', re.I),
    'macos': re.compile(r'\bmac ?os\b|\bmacos\b|apple silicon|\bmac\b(?!\s*address)|\bos ?x\b', re.I),
    'android': re.compile(r'\bandroid\b|\.apk\b', re.I),
    'switch': re.compile(r'\.nro\b|atmosphère|\batmosphere (?:cfw|custom firmware)|\bhbmenu\b|\bnintendo switch\b|\bswitch (?:homebrew|build|port|release)s?\b', re.I),
}
NEGATION = re.compile(
    r"not (?:yet )?(?:supported|available|built|tested|working|a target)|unsupported|untested|planned|"
    r"coming soon|\bsoon\b|\btodo\b|in the future|eventually|isn['’]t supported|aren['’]t supported|no plans|"
    r"no (?:ready-made|prebuilt|pre-built|native) (?:build|download)|not published|won['’]t", re.I)


def asset_os(name):
    n = name.lower()
    tokens = set(re.split(r'[^a-z0-9]+', n))
    found = set()
    if n.endswith(('.exe', '.msi', '.msix', '.appx')) or tokens & WIN_TOKENS:
        found.add('windows')
    if n.endswith(('.appimage', '.deb', '.rpm', '.flatpak')) or tokens & LINUX_TOKENS:
        found.add('linux')
    if n.endswith('.dmg') or tokens & MAC_TOKENS:
        found.add('macos')
    if n.endswith(('.apk', '.aab')) or tokens & ANDROID_TOKENS:
        found.add('android')
    if n.endswith(('.nro', '.nsp')) or tokens & SWITCH_TOKENS:
        found.add('switch')
    return found


def release_tags(repo, count=3):
    atom = http(f'https://github.com/{repo}/releases.atom')
    if not atom:
        return []
    links = re.findall(r'<link[^>]+href="https://github\.com/[^"]+/releases/tag/([^"]+)"', atom.decode('utf-8', 'replace'))
    return [html.unescape(urllib.parse.unquote(t)) for t in links[:count]]


def release_assets(repo, tag):
    page = http(f'https://github.com/{repo}/releases/expanded_assets/{urllib.parse.quote(tag, safe="")}')
    if not page:
        return []
    hrefs = re.findall(r'href="/[^"]+/releases/download/[^"/]+/([^"]+)"', page.decode('utf-8', 'replace'))
    return [html.unescape(urllib.parse.unquote(h)) for h in hrefs]


def from_releases(repo):
    """(oses, tag, evidence) from the newest release with OS-specific downloads."""
    for tag in release_tags(repo):
        names = [n for n in release_assets(repo, tag) if not IGNORE_ASSET.search(n)]
        found = set()
        for n in names:
            found |= asset_os(n)
        if found:
            return found, tag, names
    return set(), None, []


def from_readme(repo, skip=()):
    """(oses, evidence) from README mentions that aren't negated nearby, leaving out skip."""
    text = None
    for name in ('README.md', 'readme.md', 'README.txt', 'README'):
        raw = http(f'https://raw.githubusercontent.com/{repo}/HEAD/{name}')
        if raw:
            text = raw.decode('utf-8', 'replace')
            break
    if not text:
        return set(), {}
    found, evidence = set(), {}
    for line in text.splitlines():
        for os_name, rx in README_OS.items():
            if os_name in skip:
                continue
            for m in rx.finditer(line):
                near = line[max(0, m.start() - 60):m.end() + 60]
                if NEGATION.search(near):
                    continue
                found.add(os_name)
                evidence.setdefault(os_name, line.strip()[:160])
    return found, evidence


def ordered(oses):
    return [o for o in OSES if o in oses] or None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--dry-run', action='store_true', help='print what was found, write nothing')
    ap.add_argument('--all', action='store_true', help='check every entry not set by hand')
    ap.add_argument('--only', action='append', metavar='ID', help='only these entries (repeatable)')
    ap.add_argument('--verbose', action='store_true', help='print the evidence for each entry')
    args = ap.parse_args()

    _, head, meta, entries = load(DATA)
    changed = 0
    for e in entries:
        if args.only and e['id'] not in args.only:
            continue
        m = REPO_RE.match(e.get('repo') or '')
        if not m or e.get('platformsFrom') == 'manual':
            continue
        if not args.all and 'platforms' in e:
            if e.get('platformsFrom') != 'release' or e.get('version') in (None, e.get('platformsTag')):
                continue
        repo = m[1]
        try:
            oses, tag, names = from_releases(repo)
            source, evidence = 'release', names
            if not oses:
                oses, evidence = from_readme(repo, skip=('switch',) if e['console'] == 'switch' else ())
                source, tag = 'readme', None
        except (urllib.error.URLError, OSError) as err:
            print(f'  !  {e["id"]:<40} {err}')
            continue
        new = ordered(oses)
        line = f'{e["id"]:<40} {source:<8} {",".join(new or ["unknown"])}'
        if args.verbose:
            line += f'\n       {evidence}'
        print('  ' + line)
        if (new, source if new else None, tag) != (e.get('platforms'), e.get('platformsFrom'), e.get('platformsTag')):
            e['platforms'] = new
            e['platformsFrom'] = source if new else None
            e['platformsTag'] = tag
            changed += 1

    if changed and not args.dry_run:
        with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dump(head, meta, entries))
    print(f'\n{"Would update" if args.dry_run else "Updated"} {changed} entries.')


if __name__ == '__main__':
    main()
