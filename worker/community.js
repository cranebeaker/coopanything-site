// Mods their devs list themselves: POST /api/community from the Discord bot (Authorization: Bearer
// LISTING_SECRET), sent when a dev with the Dev role runs /listing add. The Dev role is the approval,
// so the mod is public at once. The owner can hide one (hidden = 1) if it is ever abused.

const MAX = 100;

const slug = (s) => String(s).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase()
  .replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

let cache = null;

export async function communityIds(env) {
  if (cache && Date.now() - cache.at < 30_000) return cache.ids;
  const rows = (await env.DB.prepare('SELECT id FROM community WHERE hidden = 0').all()).results;
  cache = { at: Date.now(), ids: rows.map((r) => r.id) };
  return cache.ids;
}

export async function communityList(env) {
  const rows = (await env.DB.prepare('SELECT id, game, project, url, created, reviewed FROM community WHERE hidden = 0 ORDER BY created DESC LIMIT 500').all()).results;
  return rows.map((r) => ({ id: r.id, game: r.game, project: r.project, url: r.url, reviewed: r.reviewed ? 1 : 0, created: new Date(r.created).toISOString().slice(0, 10) }));
}

function cleanText(v, what) {
  const t = String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX) throw new Error(`The ${what} has to be 1 to ${MAX} characters.`);
  return t;
}

// Returns { id, created } for the mod at this link: the same link never makes a second listing.
export async function saveCommunity(env, body, directoryIds) {
  const game = cleanText(body.game, 'game name');
  const project = cleanText(body.project || `${game} co-op`, 'project name');
  let url;
  try { url = new URL(String(body.url).trim()); } catch { throw new Error('The link isn’t a link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.toString().length > 300) throw new Error('The link has to be an https:// link.');
  url.hash = '';
  const link = url.toString().replace(/\/$/, '');

  const same = await env.DB.prepare('SELECT id, hidden FROM community WHERE url = ?').bind(link).first();
  if (same) {
    if (same.hidden) throw new Error('That listing was removed. Ask the server owner.');
    return { id: same.id, created: false };
  }
  let id = `${slug(game)}-${slug(project)}`.slice(0, 80).replace(/-+$/, '');
  if (!id) throw new Error('That name has no letters or numbers.');
  const taken = async (x) => directoryIds.has(x) || (await env.DB.prepare('SELECT 1 AS x FROM community WHERE id = ?').bind(x).first());
  for (let n = 2; await taken(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
  await env.DB.prepare('INSERT INTO community (id, game, project, url, created, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, game, project, link, Date.now(), String(body.by || '').slice(0, 40)).run();
  cache = null;
  return { id, created: true };
}

// The owner's review of a community listing (the buttons on its card in the private review channel).
export async function reviewCommunity(env, id, action) {
  if (!['review', 'hide'].includes(action)) throw new Error('Unknown action.');
  const col = action === 'review' ? 'reviewed' : 'hidden';
  const res = await env.DB.prepare(`UPDATE community SET ${col} = 1 WHERE id = ?`).bind(String(id)).run();
  cache = null;
  if (!res.meta.changes) throw new Error('No such community listing.');
  return { id, action };
}

export function forgetCommunity() { cache = null; }
