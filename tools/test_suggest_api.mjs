// Tests community suggestions against a local Worker (see the header of test_wanted_api.mjs for how to start it):
//   npx wrangler d1 migrations apply coop-haven --local
//   npx wrangler dev --port 8794 --local --var LISTING_SECRET:test-secret-123 --var DISCORD_CLIENT_SECRET:test
//   node tools/test_suggest_api.mjs
import { execSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:8794';
const secret = 'test-secret-123';
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };
const call = async (path, { method = 'GET', body, cookie, auth } = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(base + path, {
        method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: `ca_session=${cookie}` } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status >= 500 && attempt < 5) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch (e) { if (attempt >= 5) throw e; await new Promise((r) => setTimeout(r, 1000)); }
  }
};
const sql = (q) => execSync(`npx wrangler d1 execute coop-haven --local --command "${q.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });

const catalog = JSON.parse(await (await fetch(base + '/data/wanted.json')).text());
const target = `w:${catalog.find((g) => g.k === 'unchecked' && !g.s).i}`;
const target2 = `w:${catalog.filter((g) => g.k === 'unchecked' && !g.s)[1].i}`;
const suggest = (cookie, body) => call('/api/suggest', { method: 'POST', cookie, body });

const day = 864e5, now = Date.now();
const old = (n) => String(285165543693221880n + BigInt(n));       // an account made long ago
const young = String(BigInt(now - 1420070400000 - day) << 22n);
sql(`DELETE FROM suggestions`); sql(`DELETE FROM sessions WHERE id LIKE 'test-%'`); sql(`DELETE FROM rate WHERE k LIKE 'g:%'`);
for (const [id, user, member, joined] of [['test-good', old(0), 1, now - 30 * day], ['test-young', young, 1, now - 30 * day], ['test-outsider', old(1), 0, null],
  ['test-limit', old(2), 1, now - 30 * day], ['test-paused', old(3), 1, now - 30 * day], ['test-other', old(4), 1, now - 30 * day]]) {
  sql(`INSERT INTO sessions (id, user_id, name, avatar, roles, created, expires, member, joined) VALUES ('${id}', '${user}', 'T', NULL, '[]', ${now}, ${now + day}, ${member}, ${joined ?? 'NULL'})`);
}
const good = { target, kind: 'mod', url: 'https://github.com/someone/cool-coop-mod', note: 'Two player story co-op, works on the Steam version.' };

// ── who may suggest ──
let r = await call('/api/suggest', { method: 'POST', body: good });
check('suggesting needs a login', r.status === 401);
r = await suggest('test-outsider', good);
check('someone outside the server is told to log in again', r.status === 403 && /server/i.test(r.body.error || ''), JSON.stringify(r.body));
r = await suggest('test-young', good);
check('a brand-new Discord account cannot suggest', r.status === 403);

// ── what may be suggested ──
const bad = async (name, body, status = 400) => { const x = await suggest('test-good', { target, kind: 'mod', ...body }); check(name, x.status === status, JSON.stringify(x.body)); };
r = await suggest('test-good', { target, url: 'https://github.com/a/b' });
check('a kind is required', r.status === 400);
await bad('a mod needs a link', { url: '' });
await bad('http links are refused', { url: 'http://example.com/mod' });
await bad('link shorteners are refused', { url: 'https://bit.ly/3abcde' });
await bad('Discord invites are refused', { url: 'https://discord.gg/abcdef' });
await bad('Discord invite pages are refused', { url: 'https://discord.com/invite/abcdef' });
await bad('file hosts are refused', { url: 'https://mega.nz/file/abc#key' });
await bad('IP addresses are refused', { url: 'https://203.0.113.9/mod' });
await bad('logins in a link are refused', { url: 'https://user:pass@example.com/mod' });
await bad('text that is not a link is refused', { url: 'my cool mod' });
await bad('an unknown game is refused', { target: 'w:999999999', url: 'https://github.com/a/b' }, 404);
await bad('a made-up listing id is refused', { target: 'nope-not-a-listing', url: 'https://github.com/a/b' }, 404);
r = await suggest('test-good', { target, kind: 'correction', note: 'wrong' });
check('a correction needs a real sentence', r.status === 400);

// ── a good suggestion ──
r = await suggest('test-good', { ...good, url: 'https://www.GitHub.com/someone/cool-coop-mod/tree/main/src?utm_source=x#readme', note: 'Great mod, see https://evil.example/x and **bold** <b>html</b>' });
check('a good suggestion is accepted', r.status === 200 && r.body.ok && r.body.id > 0, JSON.stringify(r.body));
const firstId = r.body.id;
r = await suggest('test-other', good);
check('the same link cannot be suggested twice, however it is written', r.status === 409, JSON.stringify(r.body));

// ── the review queue ──
r = await call('/api/suggestions');
check('the queue needs the secret', r.status === 403);
r = await call('/api/suggestions?status=pending', { auth: secret });
const mine = r.body.suggestions?.find((s) => s.id === firstId);
check('the queue shows it', !!mine && mine.game && mine.by_user === old(0) && mine.status === 'pending', JSON.stringify(r.body).slice(0, 200));
check('its link was tidied (host, repository only, no tracking)', mine?.url === 'https://github.com/someone/cool-coop-mod', mine?.url);
check('its note has no links or markup', mine && !/https?:|evil|\*\*|<b>/.test(mine.note), mine?.note);
r = await call('/api/wanted/all');
check('a pending suggestion is not public', !(r.body.suggested || {})[target]);
r = await call('/api/suggestions/review', { method: 'POST', body: { id: firstId, decision: 'approve' } });
check('reviewing needs the secret', r.status === 403);
r = await call('/api/suggestions/review', { method: 'POST', auth: secret, body: { id: firstId, decision: 'maybe' } });
check('a bad decision is refused', r.status === 400);
r = await call('/api/suggestions/review', { method: 'POST', auth: secret, body: { id: firstId, decision: 'approve', by: 'tester', note: 'checked' } });
check('approving works', r.status === 200 && r.body.suggestion.status === 'approved', JSON.stringify(r.body));
r = await call('/api/wanted/all');
check('an approved suggestion shows on the home page data', (r.body.suggested || {})[target]?.[0]?.url === 'https://github.com/someone/cool-coop-mod', JSON.stringify(r.body.suggested));

// ── corrections ──
r = await suggest('test-good', { target, kind: 'correction', note: 'The listing says two players but the readme says up to four.' });
check('a correction with a note is accepted without a link', r.status === 200, JSON.stringify(r.body));
const corrId = r.body.id;
await call('/api/suggestions/review', { method: 'POST', auth: secret, body: { id: corrId, decision: 'approve' } });
r = await call('/api/wanted/all');
check('approved corrections are not shown publicly (only mods are)', (r.body.suggested || {})[target]?.length === 1);

// ── rejected links cannot come back; a rejected account is paused ──
r = await suggest('test-good', { target: target2, kind: 'mod', url: 'https://example.com/spammy-page' });
const spamId = r.body.id;
await call('/api/suggestions/review', { method: 'POST', auth: secret, body: { id: spamId, decision: 'reject', note: 'not a mod' } });
r = await suggest('test-other', { target: target2, kind: 'mod', url: 'https://example.com/spammy-page' });
check('a rejected link cannot be sent again', r.status === 409);
for (let i = 1; i <= 3; i++) sql(`INSERT INTO suggestions (target, game, kind, url, by_user, by_name, created, status) VALUES ('${target}', 'x', 'mod', 'https://spam.example/${i}', '${old(3)}', 'T', ${now - 1000}, 'rejected')`);
r = await suggest('test-paused', { target: target2, kind: 'mod', url: 'https://example.com/another' });
check('someone with several rejections and nothing accepted is paused', r.status === 429 && /paused/i.test(r.body.error || ''), JSON.stringify(r.body));

// ── limits ──
sql(`DELETE FROM rate WHERE k LIKE 'g:%'`);
const results = [];
for (let i = 1; i <= 6; i++) results.push((await suggest('test-limit', { target: target2, kind: 'mod', url: `https://example.org/mod-${i}` })).status);
check('five suggestions a day, the sixth is refused', results.slice(0, 5).every((s) => s === 200) && results[5] === 429, results.join());
sql(`DELETE FROM suggestions WHERE target = '${target2}' AND status = 'pending'`);
for (let i = 1; i <= 8; i++) sql(`INSERT INTO suggestions (target, game, kind, url, by_user, by_name, created) VALUES ('${target2}', 'x', 'mod', 'https://crowd.example/${i}', '${old(100 + i)}', 'T', ${now - 500})`);
sql(`DELETE FROM rate WHERE k LIKE 'g:%'`);
r = await suggest('test-other', { target: target2, kind: 'mod', url: 'https://crowd.example/new' });
check('a game with many suggestions waiting takes no more', r.status === 429, JSON.stringify(r.body));

sql(`DELETE FROM suggestions`); sql(`DELETE FROM sessions WHERE id LIKE 'test-%'`); sql(`DELETE FROM rate WHERE k LIKE 'g:%'`);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
