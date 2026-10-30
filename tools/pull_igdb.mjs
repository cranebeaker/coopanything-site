// Pulls the most-rated single-player PC games from IGDB and splits them into batch files
// for the research agents. Needs IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in discord-bot/.env.
//   node tools/pull_igdb.mjs [total=2000] [batch=50]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(here, '../../discord-bot/.env'), 'utf8')
  .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const total = +process.argv[2] || 2000, size = +process.argv[3] || 50;

const tok = await (await fetch(`https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' })).json();
const headers = { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` };

const games = [];
for (let offset = 0; games.length < total; offset += 500) {
  const body = `fields name,slug,first_release_date,total_rating_count,external_games.category,external_games.uid,external_games.external_game_source;
    where platforms = (6) & game_modes = (1) & version_parent = null & game_type = (0,8,9,10) & total_rating_count != null;
    sort total_rating_count desc; limit 500; offset ${offset};`;
  const res = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const page = await res.json();
  if (!page.length) break;
  games.push(...page);
  await new Promise((r) => setTimeout(r, 300));
}

const seen = new Set();
const out = [];
for (const g of games) {
  const key = g.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (seen.has(key)) continue;
  seen.add(key);
  const steam = (g.external_games || []).find((x) => x.category === 1 || x.external_game_source === 1);
  out.push({
    igdb_id: g.id, name: g.name, slug: g.slug,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    ratings: g.total_rating_count, steam_appid: steam ? steam.uid : null,
  });
  if (out.length >= total) break;
}

const dir = join(here, '../data/seed');
mkdirSync(join(dir, 'batches'), { recursive: true });
writeFileSync(join(dir, 'games.json'), JSON.stringify(out, null, 1));
for (let i = 0; i * size < out.length; i++) {
  const n = String(i + 1).padStart(2, '0');
  writeFileSync(join(dir, 'batches', `batch-${n}.json`), JSON.stringify(out.slice(i * size, (i + 1) * size), null, 1));
}
console.log(`${out.length} games, ${Math.ceil(out.length / size)} batches`);
