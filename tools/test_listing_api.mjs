// Checks POST /api/listing against a local `wrangler dev --var LISTING_SECRET:test-secret-123`.
// Run: node tools/test_listing_api.mjs [base]   (default http://127.0.0.1:8791)
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const SECRET = 'test-secret-123';
const ID = 'alien-isolation-alien-isolation-co-op-dropper7894';
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const post = async (body, secret = SECRET) => {
  const res = await fetch(`${BASE}/api/listing`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const stats = async () => (await (await fetch(`${BASE}/api/stats`)).json()).listings || {};

check('no secret refused', (await post({ id: ID, stage: 'beta' }, null)).status === 403);
check('wrong secret refused', (await post({ id: ID, stage: 'beta' }, 'nope-nope-nope-1')).status === 403);
check('unknown mod refused', (await post({ id: 'not-a-mod', stage: 'beta' })).status === 404);
check('non-Discord link refused', (await post({ id: ID, discord: 'https://evil.example/x' })).status === 400);
check('bad stage refused', (await post({ id: ID, stage: 'wanted' })).status === 400);
check('odd version refused', (await post({ id: ID, version: '<script>' })).status === 400);
let r = await post({ id: ID, by: '1', discord: 'https://discord.com/channels/1561411702082510879/1562159739243331584', stage: 'beta', version: 'v0.3.1', note: 'Saves sync now! Get it at https://evil.example/x and <b>bold</b>' });
check('valid update saved', r.status === 200 && r.body.ok);
const l = (await stats())[ID] || {};
check('stats returns the listing', l.discord?.endsWith('/1562159739243331584') && l.stage === 'beta' && l.version === 'v0.3.1' && !!l.versionDate);
check('note has links and markup taken out', l.note === 'Saves sync now! Get it at and bbold/b' || (!l.note.includes('http') && !l.note.includes('<')));
check('partial update keeps other fields', (await post({ id: ID, note: 'Second note' })).status === 200 && (await stats())[ID].version === 'v0.3.1');
r = await post({ id: ID, clear: ['discord', 'note'] });
const after = (await stats())[ID] || {};
check('clear removes fields', r.status === 200 && !after.discord && !after.note && after.stage === 'beta');
// Community listings: publish, then moderate (Mark reviewed / Hide), owner secret only.
const RUN = Math.random().toString(36).slice(2, 8);
const comm = (path, body, secret = SECRET) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body) });
const cl = async () => (await (await fetch(`${BASE}/api/stats`)).json()).community || [];
const made = await (await comm('/api/community', { game: 'Review Test Game', project: 'review test', url: `https://github.com/zz/review-test-${RUN}`, by: '1' })).json();
const found = async () => (await cl()).find((c) => c.id === made.id);
check('a new community listing is public and not reviewed', made.ok && made.created && (await found())?.reviewed === 0);
check('review needs the secret', (await comm('/api/community/review', { id: made.id, action: 'review' }, null)).status === 403);
check('review of an unknown listing is refused', (await comm('/api/community/review', { id: 'nope-nope', action: 'review' })).status === 400);
check('review with a bad action is refused', (await comm('/api/community/review', { id: made.id, action: 'delete' })).status === 400);
check('Mark reviewed sets the flag', (await comm('/api/community/review', { id: made.id, action: 'review' })).status === 200 && (await found())?.reviewed === 1);
check('Hide removes it from the public list', (await comm('/api/community/review', { id: made.id, action: 'hide' })).status === 200 && !(await found()));
check('a hidden link cannot be listed again', (await comm('/api/community', { game: 'Review Test Game', project: 'review test', url: `https://github.com/zz/review-test-${RUN}`, by: '1' })).status === 400);

// Handoff: a community listing whose repo now has a directory entry moves to that entry on the next cron.
const dirRepos = (await (await fetch(`${BASE}/data/repos.json`)).json()).filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r.repo));
const pick = dirRepos[Math.floor(Math.random() * dirRepos.length)];
const DIR_ID = pick.id;
const hand = await (await comm('/api/community', { game: 'Handoff Test', project: 'anchor', url: `https://github.com/${pick.repo.toUpperCase()}`, by: '1' })).json();
await post({ id: hand.id, by: '1', discord: 'https://discord.com/channels/1561411702082510879/1562159739243331584', stage: 'beta' });
const cron = await fetch(`${BASE}/__scheduled?cron=*+*+*+*+*`);
await new Promise((r) => setTimeout(r, 1500));
const afterHand = await (await fetch(`${BASE}/api/stats`)).json();
check('cron ran', cron.status === 200);
check('handoff: the community duplicate is hidden', !(afterHand.community || []).some((c) => c.id === hand.id));
check('handoff: the directory entry took over the Discord topic and settings', afterHand.listings[DIR_ID]?.discord?.endsWith('/1562159739243331584') && afterHand.listings[DIR_ID]?.stage === 'beta' && !afterHand.listings[hand.id]);
await post({ id: DIR_ID, clear: ['discord', 'stage'] });await post({ id: ID, clear: ['stage', 'version'] });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
