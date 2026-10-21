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

async function repoList(env) {
  const res = await env.ASSETS.fetch(new Request('https://coopanything.app/data/repos.json'));
  return res.ok ? res.json() : [];
}

export async function checkReleases(env, { limit = PER_RUN, fetchFeed = (url) => fetch(url, { headers: { 'User-Agent': UA } }) } = {}) {
  const repos = await repoList(env);
  if (!repos.length) return { checked: 0, found: [] };
  const rows = (await env.DB.prepare('SELECT id, version, checked FROM releases').all()).results;
  const known = new Map(rows.map((r) => [r.id, r]));
  // Never-checked repos first, then the ones checked longest ago.
  const batch = repos.slice().sort((a, b) => (known.get(a.id)?.checked || 0) - (known.get(b.id)?.checked || 0)).slice(0, limit);
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
    if (latest && before && before.version && before.version !== latest.version) found.push({ id, repo, ...latest });
  }
  for (const r of found) await announce(env, r);
  return { checked: batch.length, found, results };
}

async function announce(env, release) {
  if (!env.BOT || !env.LISTING_SECRET) return;
  const row = await env.DB.prepare('SELECT discord FROM listings WHERE id = ?').bind(release.id).first();
  const thread = /\/channels\/\d+\/(\d+)$/.exec(row?.discord || '')?.[1];
  if (!thread) return;
  await env.BOT.fetch(new Request('https://bot/internal/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LISTING_SECRET}` },
    body: JSON.stringify({ thread, id: release.id, version: release.version, url: release.url }),
  })).catch(() => {});
}

// For /api/stats: each id's checked release, to merge with what devs set themselves.
export async function releaseMap(env) {
  const rows = (await env.DB.prepare('SELECT id, version, version_date, url FROM releases WHERE version IS NOT NULL').all()).results;
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}
