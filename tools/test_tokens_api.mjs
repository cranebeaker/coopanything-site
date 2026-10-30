// Checks personal API tokens (worker/tokens.js) against a local Worker:
//   npx wrangler d1 migrations apply coop-haven --local
//   npx wrangler dev --port 8794 --local --var LISTING_SECRET:test-secret-123 --var DISCORD_CLIENT_SECRET:test
//   node tools/test_tokens_api.mjs http://127.0.0.1:8794
// It adds fake sessions to the local D1 (never the live one).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8794';
const DEV = '210000000000000001', STRANGER = '310000000000000001', ROLE = '410000000000000001';
const MODS = JSON.parse(readFileSync('_site/data/mods.json', 'utf8'));
const MOD = MODS[3].id, OTHER = MODS[4].id;
const far = Date.now() + 864e5;
const seed = join(tmpdir(), 'coop-tokens-test.sql');
writeFileSync(seed, `DELETE FROM sessions WHERE id LIKE 'tk-%'; DELETE FROM api_tokens WHERE user_id IN ('${DEV}','${STRANGER}'); DELETE FROM listings WHERE id IN ('${MOD}','${OTHER}');
INSERT INTO sessions (id, user_id, name, avatar, roles, created, expires) VALUES ('tk-dev','${DEV}','Dev',NULL,'["${ROLE}"]',0,${far});
INSERT INTO sessions (id, user_id, name, avatar, roles, created, expires) VALUES ('tk-stranger','${STRANGER}','Nope',NULL,'[]',0,${far});`);
execSync(`npx wrangler d1 execute coop-haven --local --file "${seed}"`, { stdio: 'ignore' });

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const call = async (method, path, { who, token, body, origin = BASE } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (who) { headers.Cookie = `ca_session=tk-${who}`; headers.Origin = origin; }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* plain text */ }
  return { status: res.status, json, text, headers: res.headers };
};
const bot = async (body) => (await fetch(`${BASE}/api/listing`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret-123' }, body: JSON.stringify(body) })).json();
const listing = async (id) => (await (await fetch(`${BASE}/api/stats`)).json()).listings[id] || {};

await bot({ id: MOD, by: 'bot', discord: 'https://discord.com/channels/1561411702082510879/1562159739243331584', dev_role: ROLE });
await bot({ id: OTHER, by: 'bot', discord: 'https://discord.com/channels/1561411702082510879/1562159739243331585', dev_role: '999999999999999999' });

check('the guide is public text and holds no token', await (async () => { const g = await call('GET', '/api/guide'); return g.status === 200 && g.text.includes('/api/v1/listing') && !/ca_[0-9a-f]{48}/.test(g.text); })());
check('logged out cannot list or make tokens', (await call('GET', '/api/tokens')).status === 401 && (await call('POST', '/api/tokens', { body: { label: 'x' } })).status === 401);
check('a stranger with no listings cannot make a token', (await call('POST', '/api/tokens', { who: 'stranger', body: { label: 'x' } })).status === 403);
check('a token cannot be made from another site', (await call('POST', '/api/tokens', { who: 'dev', body: { label: 'x' }, origin: 'https://evil.example' })).status === 403);

const made = await call('POST', '/api/tokens', { who: 'dev', body: { label: 'My <b>Claude</b>' } });
const token = made.json?.token;
check('a dev makes a token (ca_ and 48 hex), shown once', made.status === 200 && /^ca_[0-9a-f]{48}$/.test(token || '') && made.headers.get('cache-control') === 'no-store');
const listed = await call('GET', '/api/tokens', { who: 'dev' });
check('the list shows the label and a short prefix, never the token', listed.json.tokens.length === 1 && !listed.text.includes(token) && listed.json.tokens[0].prefix === token.slice(0, 9) && !listed.json.tokens[0].label.includes('<'));

check('a bad or unknown token is refused', (await call('GET', '/api/v1/me', { token: 'ca_' + '0'.repeat(48) })).status === 401 && (await call('GET', '/api/v1/me', { token: 'nonsense' })).status === 401 && (await call('GET', '/api/v1/me')).status === 401);
const mine = await call('GET', '/api/v1/me', { token });
check('the token lists only the listings its owner can edit', mine.status === 200 && mine.json.listings.some((l) => l.id === MOD) && !mine.json.listings.some((l) => l.id === OTHER));

let r = await call('POST', '/api/v1/listing', { token, body: { id: MOD, summary: 'Written by my AI.', version: 'v2.0.0', repo: 'https://github.com/dev/ai-edit', kind: 'decomp-port', sync: { see: 'yes', story: 'partial' } } });
const l = await listing(MOD);
check('the token edits its own listing, no Origin needed', r.status === 200 && l.summary === 'Written by my AI.' && l.version === 'v2.0.0' && l.repo === 'https://github.com/dev/ai-edit' && l.kind === 'decomp-port' && l.sync.see === 'yes');
check('it cannot edit a listing it is not a dev of', (await call('POST', '/api/v1/listing', { token, body: { id: OTHER, summary: 'nope' } })).status === 403);
check('the same field rules apply (bad repo, official type, S tier, http link)',
  (await call('POST', '/api/v1/listing', { token, body: { id: MOD, repo: 'https://evil.example/a/b' } })).status === 400
  && (await call('POST', '/api/v1/listing', { token, body: { id: MOD, kind: 'official' } })).status === 400
  && (await call('POST', '/api/v1/listing', { token, body: { id: MOD, quality: 'S' } })).status === 400
  && (await call('POST', '/api/v1/listing', { token, body: { id: MOD, download: 'http://example.org/x' } })).status === 400);
check('the old editor route takes a token too', (await call('POST', '/api/listing/edit', { token, body: { id: MOD, note: 'hello there' } })).status === 200);
check('a token cannot make, list or remove tokens', (await call('POST', '/api/tokens', { token, body: { label: 'x' } })).status === 403 && (await call('GET', '/api/tokens', { token })).status === 403 && (await call('POST', '/api/tokens/revoke', { token, body: { id: 1 } })).status === 403);
check("someone else cannot remove a dev's token", (await call('POST', '/api/tokens/revoke', { who: 'stranger', body: { id: listed.json.tokens[0].id } })).status === 400 && (await call('GET', '/api/v1/me', { token })).status === 200);

for (let i = 0; i < 4; i++) await call('POST', '/api/tokens', { who: 'dev', body: { label: `t${i}` } });
check('at most 5 tokens each', (await call('POST', '/api/tokens', { who: 'dev', body: { label: 'six' } })).status === 400);

check('removing a token stops it working at once', (await call('POST', '/api/tokens/revoke', { who: 'dev', body: { id: listed.json.tokens[0].id } })).status === 200 && (await call('GET', '/api/v1/me', { token })).status === 401);

const second = (await call('POST', '/api/tokens', { who: 'dev', body: { label: 'again' } })).json.token;
check('a new token works', (await call('GET', '/api/v1/me', { token: second })).status === 200);
execSync(`npx wrangler d1 execute coop-haven --local --command "UPDATE api_tokens SET expires = 1 WHERE user_id = '${DEV}'"`, { stdio: 'ignore' });
check('an expired token stops working', (await call('GET', '/api/v1/me', { token: second })).status === 401);

await bot({ id: MOD, by: 'bot', clear: ['discord', 'summary', 'version', 'repo', 'kind', 'sync', 'note'] });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
