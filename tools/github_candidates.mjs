// For every game in data/seed/games.json, searches GitHub repositories for co-op or multiplayer mods
// and saves the plausible ones as CANDIDATES (a human or the dev confirms them). Resumable: it keeps
// data/seed/github.json and skips games it already did. GitHub allows 30 searches a minute.
//   node tools/github_candidates.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../data/seed');
const games = JSON.parse(readFileSync(join(dir, 'games.json'), 'utf8'));
const file = join(dir, 'github.json');
const done = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const token = execSync('gh auth token --user cranebeaker', { encoding: 'utf8' }).trim();

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'of', 'and', 'a', 'in', 'to', 'for', 'edition', 'remastered', 'definitive', 'game', 'year', 'enhanced']);
const COOP = /\b(co-?op|cooperative|multiplayer|multi-player|online|netplay|together)\b/i;

// A repo counts when its name or description mentions the game (every distinctive word of the title
// for short titles, most of them for long ones) and says co-op or multiplayer.
function plausible(game, repo) {
  const text = norm(`${repo.name} ${repo.description || ''}`);
  const words = norm(game.name).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return false;
  const hit = words.filter((w) => text.includes(w)).length;
  const need = words.length <= 2 ? words.length : Math.ceil(words.length * 0.7);
  return hit >= need && COOP.test(`${repo.name} ${repo.description || ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
for (const game of games) {
  if (done[game.igdb_id]) continue;
  const title = game.name.replace(/["']/g, ' ').replace(/[:–-]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = encodeURIComponent(`"${title}" (coop OR co-op OR multiplayer) in:name,description,readme fork:false`);
  let res;
  try {
    res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=8`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'coop-anything-seed' },
    });
  } catch { await sleep(5000); continue; }
  if (res.status === 403 || res.status === 429) {
    const wait = Math.max(Number(res.headers.get('retry-after')) || 0, 30);
    console.log(`rate limited, waiting ${wait}s`);
    await sleep(wait * 1000);
    continue;
  }
  if (!res.ok) { done[game.igdb_id] = { error: res.status }; continue; }
  const items = (await res.json()).items || [];
  done[game.igdb_id] = {
    checked: new Date().toISOString().slice(0, 10),
    repos: items.filter((r) => plausible(game, r)).slice(0, 5).map((r) => ({
      name: r.full_name, url: r.html_url, description: (r.description || '').slice(0, 200),
      stars: r.stargazers_count, pushed: r.pushed_at.slice(0, 10), archived: r.archived,
    })),
  };
  if (++n % 25 === 0) { writeFileSync(file, JSON.stringify(done)); console.log(`${Object.keys(done).length}/${games.length}`); }
  await sleep(2200);
}
writeFileSync(file, JSON.stringify(done));
console.log('done', Object.keys(done).length);
