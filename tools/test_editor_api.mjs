// Checks logging in with Discord, /api/my-listings and the site editor (POST /api/listing/edit), plus
// the markdown renderer, against a local Worker:
//   npx wrangler d1 migrations apply coop-haven --local
//   npx wrangler dev --port 8793 --local --var LISTING_SECRET:test-secret-123 --var DISCORD_CLIENT_SECRET:test
//   node tools/test_editor_api.mjs
// It adds three fake sessions to the local D1 (never the live one).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const BASE = process.argv[2] || 'http://127.0.0.1:8793';
const OWNER = '285165543693221889', DEV = '200000000000000001', STRANGER = '300000000000000001', ROLE = '400000000000000001';
const MOD = 'alien-isolation-alien-isolation-co-op-dropper7894';
const OTHER = JSON.parse(readFileSync('_site/data/mods.json', 'utf8')).find((m) => m.id !== MOD).id;
const far = Date.now() + 864e5;
const seed = join(tmpdir(), 'coop-editor-test.sql');
writeFileSync(seed, `DELETE FROM sessions WHERE id LIKE 'test-%'; DELETE FROM listings WHERE id IN ('${MOD}','${OTHER}');
INSERT INTO sessions VALUES ('test-owner','${OWNER}','MJ',NULL,'[]',0,${far});
INSERT INTO sessions VALUES ('test-dev','${DEV}','Dev',NULL,'["${ROLE}"]',0,${far});
INSERT INTO sessions VALUES ('test-stranger','${STRANGER}','Nope',NULL,'[]',0,${far});
INSERT INTO sessions VALUES ('test-assistant','500000000000000001','Helper',NULL,'["${ROLE}"]',0,${far});`);
execSync(`npx wrangler d1 execute coop-haven --local --file "${seed}"`, { stdio: 'ignore' });

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const get = async (path, who) => (await fetch(BASE + path, { headers: who ? { Cookie: `ca_session=test-${who}` } : {} })).json();
const edit = async (who, body, origin = BASE) => {
  const res = await fetch(`${BASE}/api/listing/edit`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(who ? { Cookie: `ca_session=test-${who}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const bot = async (body) => (await fetch(`${BASE}/api/listing`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret-123' }, body: JSON.stringify(body) })).json();
const listing = async (id) => (await get('/api/stats')).listings[id] || {};

let me = await get('/api/me');
check('logged out: no user, login switched on', me.user === null && me.loginOn === true);
me = await get('/api/me', 'dev');
check('session cookie is recognised', me.user?.id === DEV && !me.owner);
check('owner is recognised', (await get('/api/me', 'owner')).owner === true);

const linked = await bot({ id: MOD, by: 'bot', discord: 'https://discord.com/channels/1561411702082510879/1562159739243331584', dev_role: ROLE });
check('bot links a listing with its Dev role', linked.ok && linked.listing.devRole === ROLE);
check('the Dev role is not public', !('devRole' in (await listing(MOD))) && !('dev_role' in (await listing(MOD))));
check("dev's listings include it", (await get('/api/my-listings', 'dev')).ids.includes(MOD));
check('stranger has none', (await get('/api/my-listings', 'stranger')).ids.length === 0);
check('owner can edit all', (await get('/api/my-listings', 'owner')).ids === '*');

check('no login: 401', (await edit(null, { id: MOD, summary: 'x' })).status === 401);
check('other site posting: 403', (await edit('dev', { id: MOD, summary: 'x' }, 'https://evil.example')).status === 403);
check('stranger: 403', (await edit('stranger', { id: MOD, summary: 'hacked' })).status === 403);
check("dev can't edit another mod", (await edit('dev', { id: OTHER, summary: 'x' })).status === 403);

let r = await edit('dev', { id: MOD, summary: '## Hi\n**Bold** <script>alert(1)</script>', video: 'https://youtu.be/dQw4w9WgXcQ',
  website: 'https://example.org/mod', download: 'https://github.com/x/y/releases', players: '2-4', stage: 'beta', version: 'v0.5',
  note: 'Saves sync now https://evil.example', sync: { story: 'yes', enemies: 'partial', world: '', items: 'no' } });
let l = await listing(MOD);
check('dev saves everything', r.status === 200 && r.body.ok);
check('video normalised to a YouTube watch link', l.video === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
check('links, players, stage, version saved', l.website === 'https://example.org/mod' && l.download === 'https://github.com/x/y/releases' && l.players === '2-4' && l.stage === 'beta' && l.version === 'v0.5');
check('note loses its link', l.note === 'Saves sync now');
check('sync saved, blanks dropped', JSON.stringify(l.sync) === JSON.stringify({ story: 'yes', enemies: 'partial', items: 'no' }));
check('summary kept as text (escaped when shown)', l.summary.includes('<script>'));

check('non-video site refused', (await edit('dev', { id: MOD, video: 'https://evil.example/v.mp4' })).status === 400);
check('javascript: link refused', (await edit('dev', { id: MOD, website: 'javascript:alert(1)' })).status === 400);
check('http (not https) refused', (await edit('dev', { id: MOD, download: 'http://example.org/x' })).status === 400);
check('too long description refused', (await edit('dev', { id: MOD, summary: 'x'.repeat(4001) })).status === 400);
check("editor can't change the Discord link", (await edit('dev', { id: MOD, discord: 'https://discord.com/channels/1/2', summary: 'ok' })).status === 200
  && (await listing(MOD)).discord.endsWith('/1562159739243331584'));
r = await edit('dev', { id: MOD, clear: ['video', 'download', 'sync'] });
l = await listing(MOD);
check('clearing fields works', r.status === 200 && !l.video && !l.download && !l.sync && l.website);
check('owner edits a mod with no Dev role', (await edit('owner', { id: OTHER, summary: 'From MJ' })).status === 200 && (await listing(OTHER)).summary === 'From MJ');

// Card details: cover link, own tier (S is the owner's), co-op %, engine, how you connect.
r = await edit('dev', { id: MOD, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg', quality: 'b', coop_pct: '60', engine: 'Unreal Engine 4', connect: 'Direct IP' });
l = await listing(MOD);
check('dev sets cover, tier, co-op %, engine, connect', r.status === 200 && l.cover.endsWith('header.jpg') && l.quality === 'B' && l.coopPct === 60 && l.engine === 'Unreal Engine 4' && l.connect === 'Direct IP');
check("dev can't give themselves S", (await edit('dev', { id: MOD, quality: 'S' })).status === 400 && (await listing(MOD)).quality === 'B');
check('owner can set S', (await edit('owner', { id: MOD, quality: 'S' })).status === 200 && (await listing(MOD)).quality === 'S');
check('cover must be an image link', (await edit('dev', { id: MOD, cover: 'https://evil.example/page' })).status === 400);
check('co-op % must be 0-100', (await edit('dev', { id: MOD, coop_pct: 150 })).status === 400);
check('connect must be a known way', (await edit('dev', { id: MOD, connect: 'Telepathy' })).status === 400);
check('engine loses links', (await edit('dev', { id: MOD, engine: 'Unity https://evil.example' })).status === 200 && (await listing(MOD)).engine === 'Unity');
await edit('owner', { id: MOD, clear: ['cover', 'quality', 'coop_pct', 'engine', 'connect'] });

// Leads: once a listing has them, only they (and the owner) edit; assistants with the Dev role can't.
check('before leads are set, anyone with the Dev role can edit', (await edit('assistant', { id: MOD, players: '3' })).status === 200);
check('bot sets the leads', (await bot({ id: MOD, by: 'bot', leads: [DEV] })).ok);
check('leads stay private', !('leads' in (await listing(MOD))));
check('assistant (Dev role, not a lead) is refused', (await edit('assistant', { id: MOD, players: '4' })).status === 403);
check("assistant's My projects leaves it out", !(await get('/api/my-listings', 'assistant')).ids.includes(MOD));
check('lead still edits', (await edit('dev', { id: MOD, players: '4' })).status === 200);
check('bad lead ids refused', (await bot({ id: MOD, leads: ['not-an-id'] })).ok === false);
await bot({ id: MOD, clear: ['leads'] });

const login = await fetch(`${BASE}/auth/login?return=${encodeURIComponent('https://evil.example/')}`, { redirect: 'manual' });
const loc = login.headers.get('Location') || '';
check('login goes to Discord with identify + guilds.members.read', loc.startsWith('https://discord.com/oauth2/authorize') && loc.includes('guilds.members.read'));
check('login never returns to another site', /ca_oauth=[^;]*%7C%2F;/.test(login.headers.get('Set-Cookie') || ''));
check('callback with a wrong state is refused', ((await fetch(`${BASE}/auth/callback?code=x&state=nope`, { redirect: 'manual' })).headers.get('Location') || '').includes('login=failed'));

// md.js: safe by construction
const ctx = { window: {} };
vm.runInNewContext(readFileSync('md.js', 'utf8'), ctx);
const html = ctx.window.COOP_MD('# T\n<img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://a.b/c?d=1&e="2") **b**\n- one\n- two');
check('md: raw HTML escaped', !html.includes('<img') && html.includes('&lt;img'));
check('md: javascript: never becomes a link', !html.includes('href="javascript'));
check('md: https link, quotes escaped, nofollow', html.includes('href="https://a.b/c?d=1&amp;e=&quot;2&quot;"') && html.includes('rel="nofollow noopener ugc"'));
check('md: heading, bold, list', html.includes('<h4>T</h4>') && html.includes('<strong>b</strong>') && html.includes('<ul><li>one</li><li>two</li></ul>'));
check('video embed uses youtube-nocookie', ctx.window.COOP_VIDEO('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

await bot({ id: MOD, clear: ['discord', 'dev_role', 'summary', 'website', 'players', 'stage', 'version', 'note'] });
await bot({ id: OTHER, clear: ['summary'] });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
