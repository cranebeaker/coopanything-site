// Tests the wanted-games and community APIs against a local Worker:
//   npx wrangler d1 migrations apply coop-haven --local
//   npx wrangler d1 execute coop-haven --local --file data/seed/seed.sql
//   npx wrangler dev --port 8794 --local --var LISTING_SECRET:test-secret-123 --var DISCORD_CLIENT_SECRET:test --var IGDB_CLIENT_ID:... --var IGDB_CLIENT_SECRET:...
//   node tools/test_wanted_api.mjs
import { execSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:8794';
const secret = 'test-secret-123';
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };

// The local dev server can drop a connection just after the test edits the local database.
const call = async (path, { method = 'GET', body, cookie, auth } = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(base + path, {
        method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: `ca_session=${cookie}` } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status >= 500 && attempt < 5) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
};
const sql = (q) => execSync(`npx wrangler d1 execute coop-haven --local --command "${q.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });

// ── community listings ──
sql(`DELETE FROM community WHERE url LIKE 'https://github.com/x/%'`);
let r = await call('/api/community', { method: 'POST', body: { game: 'Cult of the Lamb', url: 'https://github.com/x/cotl-coop' } });
check('community needs the secret', r.status === 403);
r = await call('/api/community', { method: 'POST', auth: secret, body: { game: 'Cult of the Lamb', project: 'cotl coop', url: 'https://github.com/x/cotl-coop', by: '1' } });
const cid = r.body.id;
check('a dev listing is created', r.status === 200 && r.body.created === true && cid === 'cult-of-the-lamb-cotl-coop', JSON.stringify(r));
r = await call('/api/community', { method: 'POST', auth: secret, body: { game: 'Cult of the Lamb', project: 'other name', url: 'https://github.com/x/cotl-coop' } });
check('the same link never makes a second listing', r.body.id === cid && r.body.created === false);
r = await call('/api/community', { method: 'POST', auth: secret, body: { game: 'X', url: 'http://insecure.example/x' } });
check('only https links', r.status === 400);
r = await call('/api/community', { method: 'POST', auth: secret, body: { game: '', url: 'https://example.com/x' } });
check('a game name is required', r.status === 400);
r = await call('/api/stats');
check('/api/stats lists it', (r.body.community || []).some((c) => c.id === cid && c.game === 'Cult of the Lamb'));
r = await call('/api/listing', { method: 'POST', auth: secret, body: { id: cid, by: '1', stage: 'beta' } });
check('the listing endpoint accepts a community id', r.status === 200 && r.body.ok, JSON.stringify(r.body));

// ── visit counters ──
const visitId = (await (await fetch(base + '/data/ids.json')).json())[0];
sql(`DELETE FROM visit_counts WHERE id = '${visitId}'`); sql(`DELETE FROM config WHERE k = 'visits'`);
for (let i = 0; i < 3; i++) await call('/api/hit', { method: 'POST', body: { id: visitId } });
await call('/api/listing', { method: 'POST', auth: secret, body: { id: cid, by: '1', stage: 'beta' } }); // clears the cached stats
r = await call('/api/stats');
check('visits are counted in one row per project per day', r.body.stats[visitId]?.visits === 3, JSON.stringify(r.body.stats[visitId]));

// ── wanted: reading ──
r = await call('/api/wanted/all');
check('/all is votes and member requests, not the catalog', r.status === 200 && r.body.ok && typeof r.body.votes === 'object' && Array.isArray(r.body.extra));
r = await call('/api/wanted');
check('the old public list endpoint is gone', r.status === 404);
const catalog = JSON.parse((await (await fetch(base + '/data/wanted.json')).text()));
check('the catalog is a static file with ~2000 games', Array.isArray(catalog) && catalog.length > 1900 && 'n' in catalog[0] && 'k' in catalog[0]);
check('it is not served from the seed folder', (await fetch(base + '/data/seed/seed.sql')).status === 404);
const target = catalog.find((g) => g.k === 'unchecked' && !g.s).i;
// ── wanted: who may vote ──
r = await call('/api/wanted/vote', { method: 'POST', body: { igdb_id: target, on: true } });
check('voting needs a login', r.status === 401);
r = await call('/api/igdb/search?q=gothic');
check('IGDB search needs a login', r.status === 401);

const old = '285165543693221880';
const young = String((BigInt(Date.now() - 1420070400000 - 86400000) << 22n));
const now = Date.now();
const day = 864e5;
sql(`DELETE FROM sessions WHERE id LIKE 'test-%'`);
for (const [id, user, member, joined] of [['test-good', old, 1, now - 30 * day], ['test-young', young, 1, now - 30 * day], ['test-outsider', old, 0, null], ['test-newjoin', old, 1, now - day], ['test-owner', '285165543693221889', 0, null]]) {
  sql(`INSERT INTO sessions (id, user_id, name, avatar, roles, created, expires, member, joined) VALUES ('${id}', '${user}', 'T', NULL, '[]', ${now}, ${now + day}, ${member}, ${joined ?? 'NULL'})`);
}
for (const [name, cookie] of [['a brand-new Discord account', 'test-young'], ['someone outside the server', 'test-outsider'], ['someone who just joined', 'test-newjoin']]) {
  r = await call('/api/wanted/vote', { method: 'POST', cookie, body: { igdb_id: target, on: true } });
  check(`${name} can't vote`, r.status === 403, JSON.stringify(r.body));
}
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-outsider', body: { igdb_id: target, on: true } });
check('an old login without membership data is told to log in again', /log in with discord again/i.test(r.body.error || ''), JSON.stringify(r.body));
sql(`DELETE FROM wanted_votes WHERE user_id = '285165543693221889'`);
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-owner', body: { igdb_id: target, on: true } });
check('the owner can always vote', r.status === 200 && r.body.mine === true, JSON.stringify(r.body));
await call('/api/wanted/vote', { method: 'POST', cookie: 'test-owner', body: { igdb_id: target, on: false } });

// ── wanted: voting ──
sql(`DELETE FROM wanted_votes WHERE user_id = '${old}'`);
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-good', body: { igdb_id: target, on: true } });
check('a member can vote', r.status === 200 && r.body.votes === 1 && r.body.mine === true, JSON.stringify(r.body));
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-good', body: { igdb_id: target, on: true } });
check('voting twice still counts once', r.body.votes === 1);
r = await call('/api/wanted/mine', { cookie: 'test-good' });
check('/mine lists what I voted for', r.body.ids.includes(target) && r.body.can === null, JSON.stringify(r.body));
r = await call('/api/wanted/mine');
check('/mine for a visitor says to log in', r.body.ids.length === 0 && /log in/i.test(r.body.can || ''));
r = await call('/api/wanted/all');
check('/all shows the new vote (voting clears the cached copy)', r.body.votes[target] === 1, JSON.stringify(r.body.votes).slice(0, 100));
execSync('npx wrangler d1 execute coop-haven --local --file data/seed/seed.sql', { stdio: 'pipe' });
r = await call('/api/wanted/all');
check('reseeding the games keeps the votes', r.body.votes[target] === 1, JSON.stringify(r.body.votes).slice(0, 100));
const old301 = await fetch(base + '/wanted/', { redirect: 'manual' });
check('/wanted/ sends people to the home page filter', old301.status === 301 && (old301.headers.get('location') || '').endsWith('/?stage=wanted'));
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-good', body: { igdb_id: target, on: false } });
check('a vote can be taken back', r.body.votes === 0 && r.body.mine === false);
r = await call('/api/wanted/all');
check('and /all reflects that straight away', !r.body.votes[target], JSON.stringify(r.body.votes).slice(0, 100));
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-good', body: { igdb_id: 999999999 - 1, on: true } });
check('voting for a game that is not listed fails', r.status === 404);
r = await call('/api/wanted/vote', { method: 'POST', cookie: 'test-good', body: { igdb_id: 'x' } });
check('a bad id is refused', r.status === 400);

// ── wanted: IGDB search and requests ──
r = await call('/api/igdb/search?q=gothic', { cookie: 'test-good' });
check('members can search IGDB', r.status === 200 && r.body.ok && r.body.games.length > 0, JSON.stringify(r.body).slice(0, 200));
r = await call('/api/igdb/search?q=' + encodeURIComponent('the witcher 3'), { cookie: 'test-good' });
check('games already on the list are left out of the add results', r.body.ok && r.body.hidden > 0 && !r.body.games.some((g) => /wild hunt/i.test(g.name)), JSON.stringify(r.body).slice(0, 300));
r = await call('/api/igdb/search?q=gothic', { cookie: 'test-good' });
const fresh = (r.body.games || [])[0];
if (fresh) {
  sql(`DELETE FROM rate WHERE k LIKE 'r:%'`);
  r = await call('/api/wanted/request', { method: 'POST', cookie: 'test-good', body: { igdb_id: fresh.igdb_id } });
  check('a new game can be requested, with the requester\'s vote', r.status === 200 && r.body.added === true && r.body.votes === 1, JSON.stringify(r.body));
  r = await call('/api/wanted/request', { method: 'POST', cookie: 'test-good', body: { igdb_id: fresh.igdb_id } });
  check('requesting it again only votes (no duplicate)', r.status === 200 && r.body.added === false && r.body.votes === 1);
} else console.log('SKIP request test: every search hit is already listed');
sql(`DELETE FROM sessions WHERE id LIKE 'test-%'`);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
