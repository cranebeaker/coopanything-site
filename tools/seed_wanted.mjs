// Builds data/seed/seed.sql for the wanted_games table from the IGDB list (data/seed/games.json),
// the research results (data/seed/results/*.json, then data/seed/results-cloud/*.json, which win),
// IGDB cover ids, and the site's own entries (so a game that already has a listed mod is flagged).
// Only findings with evidence are kept: official_coop, and mod_found with a project URL. Everything
// else ("none_found", "unsure") becomes "unchecked", because those searches were not complete.
//   node tools/seed_wanted.mjs
//   npx wrangler d1 execute coop-haven --local --file data/seed/seed.sql     (or --remote)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchKey } from '../worker/wanted.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '../data/seed');
const env = Object.fromEntries(readFileSync(join(here, '../../discord-bot/.env'), 'utf8')
  .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));

const games = JSON.parse(readFileSync(join(dir, 'games.json'), 'utf8'));

// Research, later folders overriding earlier ones. results-crawl is automatic (tools/crawl_coop.mjs): it may
// add to what people found but never replaces a positive answer with "nothing found", and its projects are
// tagged auto so the site calls them "possible".
const RANK = { official_coop: 3, mod_found: 2, none_found: 1, unsure: 0 };
const research = new Map();
for (const sub of ['results', 'results-crawl', 'results-cloud']) {
  const p = join(dir, sub);
  if (!existsSync(p)) continue;
  for (const f of readdirSync(p).filter((x) => x.endsWith('.json')).sort()) {
    let rows;
    try { rows = JSON.parse(readFileSync(join(p, f), 'utf8')); } catch { console.warn('skipping unreadable', sub, f); continue; }
    for (const r of Array.isArray(rows) ? rows : []) if (r && r.igdb_id) {
      const prev = research.get(r.igdb_id);
      if (sub === 'results-crawl') r.projects = (r.projects || []).map((x) => ({ ...x, auto: true }));
      if (prev && prev.status !== 'unsure' && r.status === 'unsure') continue; // never replace an answer with a shrug
      if (prev && sub === 'results-crawl') {
        // Add the crawler's finds to what is already known; keep the stronger answer.
        const urls = new Set((prev.projects || []).map((x) => x.url));
        const extra = (r.projects || []).filter((x) => !urls.has(x.url));
        const status = RANK[r.status] > RANK[prev.status] ? r.status : prev.status;
        research.set(r.igdb_id, { ...prev, status, projects: [...(prev.projects || []), ...extra], searched: r.searched, official: r.official || prev.official });
        continue;
      }
      research.set(r.igdb_id, r);
    }
  }
}

// The site's listed mods, to flag games that already have one.
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '');
const listed = new Map();
for (const line of readFileSync(join(here, '../data/recomps.js'), 'utf8').split(/\r?\n/)) {
  const m = line.trim().match(/^(\{"id".*\}),?$/);
  if (!m) continue;
  try {
    const e = JSON.parse(m[1]);
    if (e.stage !== 'wanted' && !listed.has(norm(e.title))) listed.set(norm(e.title), e.id);
  } catch { /* not an entry line */ }
}

// Games whose directory title differs from IGDB's name: data/igdb_links.json pins them (title -> IGDB id), so the
// same game never shows up twice (a listed project and a Wanted row).
const pinned = new Map();
for (const [title, igdb] of Object.entries(JSON.parse(readFileSync(join(here, '../data/igdb_links.json'), 'utf8')))) {
  const id = listed.get(norm(title));
  if (id) pinned.set(igdb, id); else console.warn('igdb_links.json: no listed project called', title);
}

// Cover ids from IGDB, 500 at a time.
const tok = await (await fetch(`https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' })).json();
const headers = { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` };
const covers = new Map();
for (let i = 0; i < games.length; i += 500) {
  const ids = games.slice(i, i + 500).map((g) => g.igdb_id).join(',');
  const res = await fetch('https://api.igdb.com/v4/covers', { method: 'POST', headers, body: `fields game,image_id; where game = (${ids}); limit 500;` });
  if (!res.ok) throw new Error(`covers ${res.status}`);
  for (const c of await res.json()) covers.set(c.game, c.image_id);
  await new Promise((r) => setTimeout(r, 300));
}

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const now = Date.now();
const out = [];
const counts = {};
const catalog = [];   // data/wanted.json: what the home page shows, served as a static file (no database reads)
for (const g of games) {
  const r = research.get(g.igdb_id);
  let coop = 'unchecked', data = null;
  const projects = (r?.projects || []).filter((p) => p && /^https?:\/\//.test(p.url || ''));
  if (r && r.status === 'official_coop') coop = 'official_coop';
  if (r && r.status === 'mod_found' && projects.length) coop = 'mod_found';
  // "Nothing found" is only believed when several sources were really searched (the crawler records which).
  if (r && r.status === 'none_found' && r.auto && (r.searched || []).length >= 3) coop = 'none_found';
  if (projects.length && coop !== 'unchecked') {
    data = { projects: projects.slice(0, 6).map(({ name, url, stage, summary, kind, auto }) => ({ name, url, stage, summary, ...(kind ? { kind } : {}), ...(auto ? { a: 1 } : {}) })), checked: r.checked || null };
  }
  const siteId = listed.get(norm(g.name)) || pinned.get(g.igdb_id) || null;
  counts[coop] = (counts[coop] || 0) + 1;
  // r/rn: a release date still ahead (games.json "release", "release_note"); the site shows "Coming soon".
  catalog.push({ i: g.igdb_id, n: g.name, l: g.slug, y: g.year, c: covers.get(g.igdb_id) || null, g: g.steam_appid, k: coop, s: siteId, p: data ? data.projects : [],
    ...(g.release ? { r: g.release, ...(g.release_note ? { rn: g.release_note } : {}) } : {}) });
  out.push(`INSERT INTO wanted_games (igdb_id, name, slug, year, cover, steam_appid, ratings, coop, research, site_id, requested_by, created, search) VALUES (${[
    g.igdb_id, q(g.name), q(g.slug), q(g.year), q(covers.get(g.igdb_id) || null), q(g.steam_appid), q(g.ratings), q(coop),
    q(data ? JSON.stringify(data) : null), q(siteId), 'NULL', now, q(searchKey(g.name))].join(', ')})
    ON CONFLICT (igdb_id) DO UPDATE SET name = excluded.name, slug = excluded.slug, year = excluded.year, cover = excluded.cover,
      steam_appid = excluded.steam_appid, ratings = excluded.ratings, coop = excluded.coop, research = excluded.research,
      site_id = excluded.site_id, search = excluded.search;`.replace(/\s*\n\s*/g, ' '));
}
// An upsert, not a replace: votes, requested_by and the vote counter on existing rows are kept.
// Crawled snippets can carry strangers' email addresses; they never reach the site or the database.
const scrub = (s) => s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '');
writeFileSync(join(dir, 'seed.sql'), scrub(out.join('\n') + '\n'));
// Public, so it lives in data/ (data/seed is never published). Compact keys: i id, n name, l slug, y year,
// c IGDB cover, g Steam app id, k co-op status, s site listing id, p mods found.
writeFileSync(join(here, '../data/wanted.json'), scrub(JSON.stringify(catalog)));
// Warn about a listed project that looks like a catalog game but is not linked to it (a likely duplicate).
const linkedSite = new Set(catalog.map((c) => c.s).filter(Boolean));
const catNorm = catalog.map((c) => [norm(c.n), c.n]);
const unlinked = [];
for (const line of readFileSync(join(here, '../data/recomps.js'), 'utf8').split(/\r?\n/)) {
  const m = line.trim().match(/^(\{"id".*\}),?$/);
  if (!m) continue;
  try {
    const e = JSON.parse(m[1]);
    const a = norm(e.title);
    if (e.stage === 'wanted' || linkedSite.has(listed.get(a))) continue;
    const near = a.length >= 5 ? catNorm.filter(([b]) => b.length >= 5 && (b.includes(a) || a.includes(b))).map(([, n]) => n).slice(0, 2) : [];
    if (near.length && !unlinked.some((u) => u.startsWith(`${e.title} <->`))) unlinked.push(`${e.title} <-> ${near.join(' / ')}`);
  } catch { /* not an entry line */ }
}
if (unlinked.length) console.warn(`Possible duplicates (pin the right ones in data/igdb_links.json):\n  ${unlinked.join('\n  ')}`);
console.log(`${games.length} games`, counts, `${[...listed.keys()].length} site titles; ${research.size} researched`);
