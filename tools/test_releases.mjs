// Checks the release check (worker/releases.js): reading a releases.atom feed, the scheduling and
// change detection against a stand-in database, and one live run against a local Worker that reads
// real GitHub feeds:
//   npx wrangler d1 migrations apply coop-haven --local
//   npx wrangler dev --port 8793 --local --var LISTING_SECRET:test-secret-123
//   node tools/test_releases.mjs
import { checkReleases, parseFeed } from '../worker/releases.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8793';
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };

// ---- parsing ----
const feed = (entries) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>${entries}</feed>`;
const entry = (tag, date) => `<entry><updated>${date}T12:00:00Z</updated><link rel="alternate" type="text/html" href="https://github.com/a/b/releases/tag/${tag}"/><title>B ${tag}</title></entry>`;
let r = parseFeed(feed(entry('v1.2.0', '2026-10-20') + entry('v1.0', '2026-01-01')));
check('feed: newest entry, tag from the link', r?.version === 'v1.2.0' && r.date === '2026-10-20' && r.url.endsWith('/tag/v1.2.0'));
check('feed: no releases is null', parseFeed(feed('')) === null);
r = parseFeed(feed('<entry><updated>2026-05-05T00:00:00Z</updated><title>Release 7</title></entry>'));
check('feed: falls back to the title', r?.version === 'Release 7' && r.url === null);
check('feed: tag with an escaped name', parseFeed(feed(entry('v2%2Bfix', '2026-05-05')))?.version === 'v2+fix');

// ---- scheduling and change detection, with a stand-in D1 ----
function fakeEnv(repos, listings = {}) {
  const releases = new Map();
  const posts = [];
  const DB = {
    prepare(sql) {
      const stmt = { args: [], bind(...a) { stmt.args = a; return stmt; } };
      stmt.all = async () => ({ results: [...releases.values()] });
      stmt.first = async () => (sql.includes('FROM listings') ? listings[stmt.args[0]] || null : null);
      stmt.run = async () => {
        const [id, repo, version, date, url, checked] = stmt.args;
        const old = releases.get(id) || {};
        releases.set(id, { id, repo, checked, version: version ?? old.version ?? null, version_date: date ?? old.version_date ?? null, url: url ?? old.url ?? null });
      };
      return stmt;
    },
  };
  return {
    env: {
      DB, LISTING_SECRET: 's',
      ASSETS: { fetch: async () => new Response(JSON.stringify(repos)) },
      BOT: { fetch: async (req) => { posts.push(await req.json()); return new Response('ok'); } },
    },
    releases, posts,
  };
}
const repos = Array.from({ length: 5 }, (_, n) => ({ id: `mod-${n}`, repo: `dev/mod-${n}` }));
const latestTag = Object.fromEntries(repos.map((x) => [x.repo, 'v1.0']));
const fetchFeed = async (url) => {
  const repo = url.replace('https://github.com/', '').replace('/releases.atom', '');
  if (repo === 'dev/mod-4') return new Response('', { status: 404 });
  return new Response(feed(entry(latestTag[repo], '2026-10-01')));
};
const t = fakeEnv(repos, { 'mod-1': { discord: 'https://discord.com/channels/1561411702082510879/1562166509659230338' } });
let out = await checkReleases(t.env, { limit: 3, fetchFeed });
check('a run checks a slice of the repos', out.checked === 3 && t.releases.size === 3);
check('the first look posts nothing', out.found.length === 0 && t.posts.length === 0);
await new Promise((res) => setTimeout(res, 5));
out = await checkReleases(t.env, { limit: 3, fetchFeed });
check('the next run starts with repos not checked yet', ['mod-3', 'mod-4'].every((id) => out.results.some((x) => x.id === id)) && t.releases.size === 5);
check('a repo without releases is saved as checked, with no version', t.releases.get('mod-4').version === null && t.releases.get('mod-4').checked > 0);
latestTag['dev/mod-1'] = 'v2.0';
for (const row of t.releases.values()) row.checked = row.id === 'mod-1' ? 0 : Date.now();
out = await checkReleases(t.env, { limit: 1, fetchFeed });
check('a new release is found', out.found.length === 1 && out.found[0].version === 'v2.0' && t.releases.get('mod-1').version === 'v2.0');
check('the bot is asked to post it in the topic', t.posts.length === 1 && t.posts[0].thread === '1562166509659230338' && t.posts[0].version === 'v2.0');
latestTag['dev/mod-2'] = 'v3.0';
for (const row of t.releases.values()) row.checked = row.id === 'mod-2' ? 0 : Date.now();
out = await checkReleases(t.env, { limit: 1, fetchFeed });
check('no Discord topic: found, but nothing posted', out.found.length === 1 && t.posts.length === 1);

// ---- one live run: real GitHub feeds through the local Worker ----
const run = async (secret, limit) => {
  const res = await fetch(`${BASE}/api/releases/check?limit=${limit}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
  return { status: res.status, body: await res.json() };
};
check('manual check needs the secret', (await run('wrong-secret-xyz', 1)).status === 403);
out = await run('test-secret-123', 8);
check('live run reads real feeds', out.status === 200 && out.body.checked === 8);
check('live run finds real releases', out.body.results.some((x) => x.version));
const stats = await (await fetch(`${BASE}/api/stats`)).json();
const hit = out.body.results.find((x) => x.version);
check('/api/stats shows a checked release', !hit || stats.listings[hit.id]?.version);
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
