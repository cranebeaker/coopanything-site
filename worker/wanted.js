// Wanted games: search IGDB, request a game, upvote. Everything that changes data needs a Discord
// login, and the account must be in the Co-op Anything server and not brand new.
//
//   GET  /api/wanted/all    vote counts and member-requested games (the catalog itself is the static data/wanted.json)
//   GET  /api/wanted/mine   (logged in) the games this login voted for
//   GET  /api/igdb/search?q=       (logged in) autocomplete from IGDB
//   POST /api/wanted/request { igdb_id }   (logged in) adds the game, with the requester's vote
//   POST /api/wanted/vote    { igdb_id, on }  (logged in) on = true adds a vote, false removes it

import { session } from './auth.js';
import { edgeBust, edgeCached } from './edge.js';

export const ACCOUNT_DAYS = 7;       // Discord account age
export const JOIN_DAYS = 7;          // time in the server
const VOTES_PER_HOUR = 60;
const REQUESTS_PER_DAY = 5;
const SEARCHES_PER_MINUTE = 20;
const MAIN_TYPES = '(0,8,9,10)';     // IGDB: main game, remake, remaster, expanded

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

// "Fallout: New Vegas" -> "fallout new vegas fnv". Searches match every typed word inside this.
export function searchKey(name) {
  const words = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const initials = words.filter((w) => !['the', 'of', 'a', 'an'].includes(w)).map((w) => w[0]).join('');
  return `${words.join(' ')} ${initials}`.trim();
}

const accountCreated = (id) => Number((BigInt(id) >> 22n) + 1420070400000n);

// Can this login vote or request? Returns a message when not.
export function whyNot(who) {
  if (!who) return 'Log in with Discord first.';
  if (who.owner) return null;
  if (!who.member) return 'Log in with Discord again so we can check you are in the Co-op Anything server. If you have not joined it yet, join first.';
  if (Date.now() - accountCreated(who.userId) < ACCOUNT_DAYS * 864e5) return `Your Discord account needs to be ${ACCOUNT_DAYS} days old to vote.`;
  if (who.joined && Date.now() - who.joined < JOIN_DAYS * 864e5) return `You can vote ${JOIN_DAYS} days after joining the server.`;
  return null;
}

export async function limited(env, key, max, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM rate WHERE k = ? AND at > ?').bind(key, now - windowMs).first();
  if (row.c >= max) return true;
  await env.DB.prepare('INSERT INTO rate (k, at) VALUES (?, ?)').bind(key, now).run();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate WHERE at < ?').bind(now - 2 * 864e5).run();
  return false;
}

// ── IGDB ────────────────────────────────────────────────────────

async function igdbToken(env) {
  const row = await env.DB.prepare("SELECT v FROM config WHERE k = 'igdb_token'").first();
  if (row) {
    const [token, exp] = row.v.split('|');
    if (Number(exp) > Date.now() + 3600_000) return token;
  }
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
  if (!res.ok) throw new Error(`IGDB token ${res.status}`);
  const { access_token: token, expires_in: secs } = await res.json();
  await env.DB.prepare("INSERT INTO config (k, v) VALUES ('igdb_token', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
    .bind(`${token}|${Date.now() + secs * 1000}`).run();
  return token;
}

async function igdb(env, body) {
  const call = async (token) => fetch('https://api.igdb.com/v4/games', {
    method: 'POST', headers: { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${token}`, Accept: 'application/json' }, body,
  });
  let res = await call(await igdbToken(env));
  if (res.status === 401) {
    await env.DB.prepare("DELETE FROM config WHERE k = 'igdb_token'").run();
    res = await call(await igdbToken(env));
  }
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  return res.json();
}

const GAME_FIELDS = 'fields name,slug,first_release_date,total_rating_count,cover.image_id,external_games.category,external_games.uid,external_games.external_game_source;';
const yearOf = (g) => (g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null);
const steamOf = (g) => ((g.external_games || []).find((x) => x.category === 1 || x.external_game_source === 1) || {}).uid || null;

async function search(request, env, url) {
  const who = await session(request, env);
  const bad = whyNot(who);
  if (bad) return json({ ok: false, error: bad }, who ? 403 : 401);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ ok: true, games: [] });
  if (await limited(env, `s:${who.userId}`, SEARCHES_PER_MINUTE, 60_000)) return json({ ok: false, error: 'Slow down a little.' }, 429);
  const found = await igdb(env, `search "${q.replace(/["\\]/g, ' ')}"; fields name,first_release_date,cover.image_id; where version_parent = null & game_type = ${MAIN_TYPES} & platforms = (6); limit 25;`);
  const ids = found.map((g) => g.id);
  const have = ids.length
    ? (await env.DB.prepare(`SELECT igdb_id FROM wanted_games WHERE igdb_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map((r) => r.igdb_id)
    : [];
  // Only games that are not on the list yet can be added; the rest are counted so the page can say so.
  const fresh = found.filter((g) => !have.includes(g.id));
  const listed = found.filter((g) => have.includes(g.id)).slice(0, 4).map((g) => ({ igdb_id: g.id, name: g.name }));
  return json({
    ok: true, hidden: found.length - fresh.length, listed,
    games: fresh.slice(0, 8).map((g) => ({ igdb_id: g.id, name: g.name, year: yearOf(g), cover: g.cover?.image_id || null })),
  });
}

// ── Writing ─────────────────────────────────────────────────────

async function readJson(request) {
  try {
    const text = await request.text();
    return text.length > 1000 ? null : JSON.parse(text);
  } catch { return null; }
}

const sameOrigin = (request, url) => { const o = request.headers.get('Origin'); return !o || o === url.origin; };
const gameId = (v) => (Number.isInteger(v) && v > 0 && v < 1e9 ? v : null);

async function gate(request, env, url) {
  if (!sameOrigin(request, url)) return { err: json({ ok: false, error: 'Only from the site itself.' }, 403) };
  const who = await session(request, env);
  const bad = whyNot(who);
  if (bad) return { err: json({ ok: false, error: bad }, who ? 403 : 401) };
  const body = await readJson(request);
  const id = body && gameId(body.igdb_id);
  if (!id) return { err: json({ ok: false, error: 'Bad request.' }, 400) };
  return { who, body, id };
}

// Recounts this one game's votes (an index lookup, a few rows) and stores the number, so the home page can
// read counters instead of counting every vote row.
async function voteCount(env, id) {
  const row = await env.DB.prepare('UPDATE wanted_games SET votes = (SELECT COUNT(*) FROM wanted_votes WHERE igdb_id = ?1) WHERE igdb_id = ?1 RETURNING votes').bind(id).first();
  return row ? row.votes : 0;
}

async function vote(request, env, url) {
  const g = await gate(request, env, url);
  if (g.err) return g.err;
  const exists = await env.DB.prepare('SELECT 1 AS x FROM wanted_games WHERE igdb_id = ?').bind(g.id).first();
  if (!exists) return json({ ok: false, error: 'That game isn’t on the list.' }, 404);
  if (g.body.on === false) {
    await env.DB.prepare('DELETE FROM wanted_votes WHERE igdb_id = ? AND user_id = ?').bind(g.id, g.who.userId).run();
  } else {
    if (await limited(env, `v:${g.who.userId}`, VOTES_PER_HOUR, 3600_000)) return json({ ok: false, error: 'That’s a lot of votes. Try again later.' }, 429);
    await env.DB.prepare('INSERT OR IGNORE INTO wanted_votes (igdb_id, user_id, created) VALUES (?, ?, ?)').bind(g.id, g.who.userId, Date.now()).run();
  }
  await edgeBust(url.origin, '/api/wanted/all');
  return json({ ok: true, votes: await voteCount(env, g.id), mine: g.body.on !== false });
}

async function request(request, env, url) {
  const g = await gate(request, env, url);
  if (g.err) return g.err;
  const have = await env.DB.prepare('SELECT igdb_id FROM wanted_games WHERE igdb_id = ?').bind(g.id).first();
  if (!have) {
    if (await limited(env, `r:${g.who.userId}`, REQUESTS_PER_DAY, 864e5)) return json({ ok: false, error: `You can request ${REQUESTS_PER_DAY} new games a day.` }, 429);
    const [game] = await igdb(env, `${GAME_FIELDS} where id = ${g.id} & version_parent = null & game_type = ${MAIN_TYPES} & platforms = (6); limit 1;`);
    if (!game) return json({ ok: false, error: 'That isn’t a PC game IGDB knows as a main game.' }, 404);
    await env.DB.prepare(`INSERT OR IGNORE INTO wanted_games (igdb_id, name, slug, year, cover, steam_appid, ratings, coop, requested_by, created, search)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unchecked', ?, ?, ?)`)
      .bind(game.id, game.name, game.slug || null, yearOf(game), game.cover?.image_id || null, steamOf(game), game.total_rating_count || null, g.who.userId, Date.now(), searchKey(game.name)).run();
  }
  await env.DB.prepare('INSERT OR IGNORE INTO wanted_votes (igdb_id, user_id, created) VALUES (?, ?, ?)').bind(g.id, g.who.userId, Date.now()).run();
  await edgeBust(url.origin, '/api/wanted/all');
  return json({ ok: true, added: !have, votes: await voteCount(env, g.id), mine: true });
}

// What changes: vote counts, and games members requested (the other ~2000 are the static data/wanted.json,
// so this costs a small read, cached at the edge for 5 minutes and cleared when someone votes or adds).
function all(request, env) {
  return edgeCached(request, 300, async () => {
    const [extra, votes, approved] = await env.DB.batch([
      env.DB.prepare('SELECT igdb_id, name, slug, year, cover, steam_appid FROM wanted_games WHERE requested_by IS NOT NULL'),
      env.DB.prepare('SELECT igdb_id, votes AS n FROM wanted_games WHERE votes > 0'),
      env.DB.prepare("SELECT target, url, note FROM suggestions WHERE status = 'approved' AND kind = 'mod'"),
    ]);
    // Community suggestions a person has approved: { 'w:<igdb id>' or a listing id: [{ url, note }] }.
    const suggested = {};
    for (const r of approved.results) (suggested[r.target] ||= []).push({ url: r.url, note: r.note || '' });
    return json({
      ok: true,
      extra: extra.results.map((r) => ({ i: r.igdb_id, n: r.name, l: r.slug, y: r.year, c: r.cover, g: r.steam_appid, k: 'unchecked', s: null, p: [] })),
      votes: Object.fromEntries(votes.results.map((r) => [r.igdb_id, r.n])),
      suggested,
    }, 200, { 'Cache-Control': 'public, max-age=300' });
  });
}
// What this login has voted for, and why it can't vote (if it can't).
async function mine(request, env) {
  const who = await session(request, env);
  const ids = who ? (await env.DB.prepare('SELECT igdb_id FROM wanted_votes WHERE user_id = ?').bind(who.userId).all()).results.map((r) => r.igdb_id) : [];
  return json({ ok: true, ids, can: whyNot(who), user: who ? { id: who.userId, name: who.name } : null });
}

export async function wanted(req, env, url) {
  const path = url.pathname;
  if (path === '/api/wanted/all' && req.method === 'GET') return all(req, env);
  if (path === '/api/wanted/mine' && req.method === 'GET') return mine(req, env);
  if (path === '/api/igdb/search' && req.method === 'GET') return search(req, env, url);
  if (path === '/api/wanted/vote' && req.method === 'POST') return vote(req, env, url);
  if (path === '/api/wanted/request' && req.method === 'POST') return request(req, env, url);
  return null;
}
