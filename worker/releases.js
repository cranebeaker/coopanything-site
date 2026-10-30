// New releases of listed mods, without a redeploy. On a schedule (the cron in wrangler.jsonc) this
// reads the public releases feed of a slice of the listed GitHub repos (github.com/<owner>/<repo>/
// releases.atom: no token, no API rate limit), saves each one's newest release in D1, and when a
// mod gets a new one, asks the Discord bot (BOT service binding) to post it in the mod's topic.
// /api/stats then shows it like any other release.

const PER_RUN = 20;               // feeds per run; well under a Worker's subrequest limit
const UA = 'CoOp:Anything release check (+https://coopanything.app)';

// The newest entry of a releases.atom feed: its tag, date and link. Null when there are none.
export function parseFeed(xml) {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
  if (!entry) return null;
  const href = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(entry)?.[1] || /<link[^>]*href="([^"]+)"/.exec(entry)?.[1];
  const tag = href && /\/releases\/tag\/([^/?#"]+)/.exec(href)?.[1];
  const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1]?.trim();
  const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1];
  const version = (tag ? decodeURIComponent(tag) : title || '').replace(/&amp;/g, '&').slice(0, 60);
  if (!version || !updated) return null;
  return { version, date: updated.slice(0, 10), url: href || null };
}

const GITHUB_REPO = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

// The directory's repos (built into the site) plus the GitHub repos devs linked themselves with
// /request-dev or /listing add, so their releases show up too.
async function repoList(env) {
  const res = await env.ASSETS.fetch(new Request('https://coopanything.app/data/repos.json'));
  const repos = res.ok ? await res.json() : [];
  try {
    const set = (await env.DB.prepare('SELECT id, repo FROM listings WHERE repo IS NOT NULL').all()).results;
    for (const s of set) {
      const m = GITHUB_REPO.exec(s.repo || '');
      if (!m) continue;
      const hit = repos.find((r) => r.id === s.id);
      if (hit) hit.repo = `${m[1]}/${m[2]}`; else repos.push({ id: s.id, repo: `${m[1]}/${m[2]}` });
    }
  } catch { /* the directory's repos still get checked */ }
  try {
    const have = new Set(repos.map((r) => r.id));
    const rows = (await env.DB.prepare('SELECT id, url FROM community WHERE hidden = 0').all()).results;
    for (const r of rows) {
      const m = GITHUB_REPO.exec(r.url || '');
      if (m && !have.has(r.id)) repos.push({ id: r.id, repo: `${m[1]}/${m[2]}` });
    }
  } catch { /* the directory's repos still get checked */ }
  return repos;
}

const RECENT_DAYS = 7;

// ids: check just these mods now (a manual run), instead of the longest-unchecked slice.
export async function checkReleases(env, { limit = PER_RUN, ids = null, fetchFeed = (url) => fetch(url, { headers: { 'User-Agent': UA } }) } = {}) {
  const repos = await repoList(env);
  if (!repos.length) return { checked: 0, found: [] };
  const rows = (await env.DB.prepare('SELECT id, version, checked FROM releases').all()).results;
  const known = new Map(rows.map((r) => [r.id, r]));
  // Never-checked repos first, then the ones checked longest ago.
  const batch = ids
    ? repos.filter((x) => ids.includes(x.id)).slice(0, limit)
    : repos.slice().sort((a, b) => (known.get(a.id)?.checked || 0) - (known.get(b.id)?.checked || 0)).slice(0, limit);
  const found = [], results = [];
  for (const { id, repo } of batch) {
    let latest = null;
    try {
      const res = await fetchFeed(`https://github.com/${repo}/releases.atom`);
      if (res.ok) latest = parseFeed(await res.text());
    } catch { /* try again next round */ }
    const before = known.get(id);
    await env.DB.prepare(`INSERT INTO releases (id, repo, version, version_date, url, checked) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT (id) DO UPDATE SET repo = excluded.repo, checked = excluded.checked,
          version = COALESCE(excluded.version, releases.version), version_date = COALESCE(excluded.version_date, releases.version_date),
          url = COALESCE(excluded.url, releases.url)`)
      .bind(id, repo, latest?.version ?? null, latest?.date ?? null, latest?.url ?? null, Date.now()).run();
    results.push({ id, version: latest?.version ?? null });
    // Only a change after the first look counts as news, so the first sweep doesn't post 100 releases.
    // A repo that had no release at its last look and has one now is news too (a dev's first release),
    // as long as it is recent: an old release first seen after a failed check is not.
    const recent = latest?.date && Date.parse(latest.date) > Date.now() - RECENT_DAYS * 864e5;
    if (latest && before && before.version !== latest.version && (before.version || recent)) found.push({ id, repo, ...latest });
  }
  for (const r of found) await announce(env, r);
  return { checked: batch.length, found, results };
}

async function announce(env, release) {
  if (!env.BOT || !env.LISTING_SECRET) return;
  const row = await env.DB.prepare('SELECT discord FROM listings WHERE id = ?').bind(release.id).first();
  const thread = /\/channels\/\d+\/(\d+)$/.exec(row?.discord || '')?.[1] || null;
  // No Discord topic: the bot still announces it in #releases, by the mod's name.
  let game = null;
  if (!thread) {
    try {
      const mods = await (await env.ASSETS.fetch(new Request('https://coopanything.app/data/mods.json'))).json();
      const m = mods.find((x) => x.id === release.id)
        || (await env.DB.prepare('SELECT game, project FROM community WHERE id = ?').bind(release.id).first());
      if (m) game = m.project && m.project !== m.game ? `${m.game}: ${m.project}` : m.game;
    } catch { /* no name, no post */ }
    if (!game) return;
  }
  await env.BOT.fetch(new Request('https://bot/internal/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LISTING_SECRET}` },
    body: JSON.stringify({ thread, id: release.id, version: release.version, url: release.url, game }),
  })).catch(() => {});
}

// For /api/stats: each id's checked release, to merge with what devs set themselves.
export async function releaseMap(env) {
  const rows = (await env.DB.prepare('SELECT id, version, version_date, url FROM releases WHERE version IS NOT NULL').all()).results;
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}
