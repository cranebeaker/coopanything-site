// CoOp:Anything's Worker. Cloudflare serves the built site (_site/) as static assets; only /api/*
// reaches this code (run_worker_first in wrangler.jsonc). It keeps community votes and visit
// counts in D1 (migrations/), with no accounts and no cookies:
//
//   GET  /api/stats   every project's votes and last-3-days visitors, as { stats: { id: {...} } }
//   POST /api/vote    { id, pct?: 0-100, score?: 1-10, outcome?: finished|mostly|broke|no-start }
//   POST /api/hit     { id }  counts one visitor per project per day, for Trending
//   POST /api/listing { id, by, ...fields }  from the Discord bot only (Authorization: Bearer
//                     LISTING_SECRET): what a mod's devs set with /listing (fields: worker/listings.js)
//   POST /api/listing/edit { id, ...fields }  the site's editor, for someone logged in with Discord
//                     who has the listing's Dev role, or the server owner
//   /auth/*, GET /api/me   logging in with Discord (worker/auth.js)
//
// A voter is a salted hash of their IP address and browser, so one person gets one vote per
// project (sending again updates it) and no address is stored. The salt is made on first use
// and kept in the config table.

import { BadField, canEdit, checkFields, publicListing, save } from './listings.js';
import { callback, login, logout, me, session } from './auth.js';
import { checkReleases, releaseMap } from './releases.js';

const CANONICAL_HOST = 'coopanything.app';

const OUTCOMES = new Set(['finished', 'mostly', 'broke', 'no-start']);
const VOTES_PER_HOUR = 40;       // per IP, across all projects
const VISIT_DAYS = 3;            // Trending window
const STATS_TTL = 30_000;        // ms an isolate reuses /api/stats

let idsCache = null;
let statsCache = null;
let saltCache = null;

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function salt(env) {
  if (saltCache) return saltCache;
  const row = await env.DB.prepare("SELECT v FROM config WHERE k = 'salt'").first();
  if (row) return (saltCache = row.v);
  const fresh = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('salt', ?)").bind(fresh).run();
  const again = await env.DB.prepare("SELECT v FROM config WHERE k = 'salt'").first();
  return (saltCache = again.v);
}

// The project ids on the site (the build writes them to data/ids.json).
async function knownIds(env, url) {
  if (idsCache) return idsCache;
  const res = await env.ASSETS.fetch(new Request(new URL('/data/ids.json', url)));
  idsCache = res.ok ? new Set(await res.json()) : new Set();
  return idsCache;
}

async function who(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = request.headers.get('User-Agent') || '';
  const s = await salt(env);
  return { voter: await sha256(`${s}|${ip}|${ua}`), iph: await sha256(`${s}|${ip}`) };
}

// Votes must come from the site itself, not another page posting on a visitor's behalf.
function sameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}

async function readBody(request, max = 2000) {
  try {
    const text = await request.text();
    return text.length > max ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function shape(row, outcomes, visits) {
  return {
    n: row ? row.n : 0,
    score: row && row.scoreN ? Math.round(row.score * 10) / 10 : null,
    scoreN: row ? row.scoreN : 0,
    pct: row && row.pctN ? Math.round(row.pct) : null,
    pctN: row ? row.pctN : 0,
    outcomes: outcomes || null,
    visits: visits || 0,
  };
}

async function allStats(env) {
  if (statsCache && Date.now() - statsCache.at < STATS_TTL) return statsCache.body;
  const since = new Date(Date.now() - (VISIT_DAYS - 1) * 864e5).toISOString().slice(0, 10);
  const [votes, outs, hits, lists] = await env.DB.batch([
    env.DB.prepare(`SELECT id, COUNT(*) AS n, AVG(score) AS score, COUNT(score) AS scoreN,
      AVG(pct) AS pct, COUNT(pct) AS pctN FROM votes GROUP BY id`),
    env.DB.prepare('SELECT id, outcome, COUNT(*) AS c FROM votes WHERE outcome IS NOT NULL GROUP BY id, outcome'),
    env.DB.prepare('SELECT id, COUNT(DISTINCT voter) AS c FROM hits WHERE day >= ? GROUP BY id').bind(since),
    env.DB.prepare('SELECT * FROM listings'),
  ]);
  const outcomes = {};
  for (const r of outs.results) (outcomes[r.id] ||= {})[r.outcome] = r.c;
  const visits = Object.fromEntries(hits.results.map((r) => [r.id, r.c]));
  const stats = {};
  for (const r of votes.results) stats[r.id] = shape(r, outcomes[r.id], visits[r.id]);
  for (const [id, c] of Object.entries(visits)) if (!stats[id]) stats[id] = shape(null, null, c);
  const listings = {};
  for (const r of lists.results) listings[r.id] = publicListing(r);
  // Releases found by the schedule: shown unless the devs posted a newer version themselves.
  for (const [id, r] of Object.entries(await releaseMap(env))) {
    const l = (listings[id] ||= {});
    if (!l.versionDate || (r.version_date || '') > l.versionDate) {
      l.version = r.version; l.versionDate = r.version_date;
      if (r.url) l.releaseUrl = r.url;
    }
  }
  const body = { stats, listings, generated: new Date().toISOString() };
  statsCache = { at: Date.now(), body };
  return body;
}

async function oneStats(env, id) {
  const [votes, outs] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n, AVG(score) AS score, COUNT(score) AS scoreN,
      AVG(pct) AS pct, COUNT(pct) AS pctN FROM votes WHERE id = ?`).bind(id),
    env.DB.prepare('SELECT outcome, COUNT(*) AS c FROM votes WHERE id = ? AND outcome IS NOT NULL GROUP BY outcome').bind(id),
  ]);
  const outcomes = outs.results.length ? Object.fromEntries(outs.results.map((r) => [r.outcome, r.c])) : null;
  const visits = statsCache?.body.stats[id]?.visits || 0;
  return shape(votes.results[0], outcomes, visits);
}

async function vote(request, env, url) {
  if (!sameOrigin(request, url)) return json({ ok: false, error: 'Votes are only taken from the site itself.' }, 403);
  const body = await readBody(request);
  if (!body || typeof body.id !== 'string') return json({ ok: false, error: 'Bad request.' }, 400);
  const ids = await knownIds(env, url);
  if (!ids.has(body.id)) return json({ ok: false, error: 'That project isn’t on the list.' }, 404);

  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const pct = body.pct == null ? null : int(body.pct, 0, 100);
  const score = body.score == null ? null : int(body.score, 1, 10);
  const outcome = body.outcome == null ? null : OUTCOMES.has(body.outcome) ? body.outcome : undefined;
  if ((body.pct != null && pct == null) || (body.score != null && score == null) || outcome === undefined) {
    return json({ ok: false, error: 'One of the answers is out of range.' }, 400);
  }
  if (pct == null && score == null && outcome == null) return json({ ok: false, error: 'Nothing to vote.' }, 400);

  const { voter, iph } = await who(request, env);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM votes WHERE iph = ? AND updated > ?')
    .bind(iph, now - 3600_000).first();
  if (recent.c >= VOTES_PER_HOUR) return json({ ok: false, error: 'That’s a lot of votes. Try again in an hour.' }, 429);

  await env.DB.prepare(`INSERT INTO votes (id, voter, iph, pct, score, outcome, created, updated)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
      ON CONFLICT (id, voter) DO UPDATE SET
        pct = COALESCE(excluded.pct, votes.pct),
        score = COALESCE(excluded.score, votes.score),
        outcome = COALESCE(excluded.outcome, votes.outcome),
        iph = excluded.iph,
        updated = excluded.updated`)
    .bind(body.id, voter, iph, pct, score, outcome, now).run();
  statsCache = null;
  return json({ ok: true, stats: await oneStats(env, body.id) });
}

async function hit(request, env, url) {
  if (!sameOrigin(request, url)) return new Response(null, { status: 204 });
  const body = await readBody(request);
  if (!body || typeof body.id !== 'string') return new Response(null, { status: 204 });
  const ids = await knownIds(env, url);
  if (!ids.has(body.id)) return new Response(null, { status: 204 });
  const { voter } = await who(request, env);
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare('INSERT OR IGNORE INTO hits (id, day, voter) VALUES (?, ?, ?)').bind(body.id, day, voter).run();
  // Now and then, drop visits older than the Trending window.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM hits WHERE day < ?').bind(cutoff).run();
  }
  return new Response(null, { status: 204 });
}

// ── /listing: from the Discord bot, or from the site's editor ───────────────────

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function listing(request, env, url) {
  const auth = request.headers.get('Authorization') || '';
  if (!sameSecret(auth.replace(/^Bearer /, ''), env.LISTING_SECRET)) return json({ ok: false, error: 'Not allowed.' }, 403);
  const body = await readBody(request, 10000);
  if (!body || typeof body.id !== 'string') return json({ ok: false, error: 'Bad request.' }, 400);
  if (!(await knownIds(env, url)).has(body.id)) return json({ ok: false, error: 'That mod isn’t on the site.' }, 404);
  try {
    const row = await save(env, body.id, checkFields(body, { fromBot: true, owner: body.as_owner === true }), body.by);
    statsCache = null;
    return json({ ok: true, listing: { ...publicListing(row), devRole: row.dev_role || null } });
  } catch (e) {
    if (e instanceof BadField) return json({ ok: false, error: e.message }, 400);
    throw e;
  }
}

const EDITS_PER_HOUR = 60;

async function editListing(request, env, url) {
  if (!sameOrigin(request, url)) return json({ ok: false, error: 'Edits are only taken from the site itself.' }, 403);
  const who = await session(request, env);
  if (!who) return json({ ok: false, error: 'Log in with Discord first.' }, 401);
  const body = await readBody(request, 10000);
  if (!body || typeof body.id !== 'string') return json({ ok: false, error: 'Bad request.' }, 400);
  if (!(await knownIds(env, url)).has(body.id)) return json({ ok: false, error: 'That mod isn’t on the site.' }, 404);
  const row = await env.DB.prepare('SELECT dev_role, leads FROM listings WHERE id = ?').bind(body.id).first();
  if (!canEdit(row, who)) return json({ ok: false, error: 'Only this mod’s lead devs can edit it. Link your Discord topic to it with /listing link first.' }, 403);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM listings WHERE updated_by = ? AND updated > ?')
    .bind(`web:${who.userId}`, Date.now() - 3600_000).first();
  if (recent.c >= EDITS_PER_HOUR) return json({ ok: false, error: 'That’s a lot of edits. Try again in an hour.' }, 429);
  try {
    const saved = await save(env, body.id, checkFields(body, { fromBot: false, owner: who.owner }), `web:${who.userId}`);
    statsCache = null;
    return json({ ok: true, listing: publicListing(saved) });
  } catch (e) {
    if (e instanceof BadField) return json({ ok: false, error: e.message }, 400);
    throw e;
  }
}

// Which listings this login can edit (the site shows an Edit button on those).
async function myListings(request, env) {
  const who = await session(request, env);
  if (!who) return json({ ids: [] });
  if (who.owner) return json({ ids: '*' });
  const rows = await env.DB.prepare('SELECT id, dev_role, leads FROM listings WHERE dev_role IS NOT NULL OR leads IS NOT NULL').all();
  return json({ ids: rows.results.filter((r) => canEdit(r, who)).map((r) => r.id) });
}

// ?lang=ru pages: i18n.js translates them in the browser, but link previews (Discord, Reddit) read
// the HTML, so the title and description are swapped here too.
const RU_HOME = 'CoOp:Anything: список всех кооп-модов';
const RU_DESC = 'Все кооп-моды для одиночных игр. Найдите любую игру и узнайте, какую её часть можно пройти с друзьями.';
const ruTitle = (t, home) => (home ? RU_HOME : t.replace(/ co-op: (\d+) mods? compared/, ': сравнение кооп-модов ($1)').replace(/ co-op\b/, ' в кооперативе'));

async function page(request, env, url) {
  const res = await env.ASSETS.fetch(request);
  if (url.searchParams.get('lang') !== 'ru' || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const home = url.pathname === '/';
  let buf = '';
  return new HTMLRewriter()
    .on('html', { element(e) { e.setAttribute('lang', 'ru'); } })
    .on('title', { text(t) { buf += t.text; if (t.lastInTextNode) t.replace(ruTitle(buf, home)); else t.remove(); } })
    .on('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:image:alt"]', {
      element(e) { e.setAttribute('content', ruTitle(e.getAttribute('content') || '', home)); },
    })
    .on('meta[name="description"], meta[property="og:description"]', { element(e) { if (home) e.setAttribute('content', RU_DESC); } })
    .on('meta[property="og:url"]', { element(e) { e.setAttribute('content', `${e.getAttribute('content')}?lang=ru`); } })
    .transform(res);
}

export default {
  // The release check (worker/releases.js) runs on the cron in wrangler.jsonc.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkReleases(env).then((r) => console.log('releases', JSON.stringify(r))).catch((e) => console.error(e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    // One address for search engines and logins: everything but the API moves to coopanything.app.
    const oldHost = url.hostname === `www.${CANONICAL_HOST}` || url.hostname.endsWith('.workers.dev');
    if (oldHost && !url.pathname.startsWith('/api/')) {
      return Response.redirect(`https://${CANONICAL_HOST}${url.pathname}${url.search}`, 301);
    }
    try {
      if (url.pathname === '/auth/login') return await login(request, env, url);
      if (url.pathname === '/auth/callback') return await callback(request, env, url);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return await logout(request, env);
      if (!url.pathname.startsWith('/api/')) return page(request, env, url);
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return json(await allStats(env), 200, { 'Cache-Control': 'public, max-age=30' });
      }
      if (url.pathname === '/api/vote' && request.method === 'POST') return await vote(request, env, url);
      if (url.pathname === '/api/hit' && request.method === 'POST') return await hit(request, env, url);
      if (url.pathname === '/api/listing' && request.method === 'POST') return await listing(request, env, url);
      if (url.pathname === '/api/releases/check' && request.method === 'POST') {
        if (!sameSecret((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.LISTING_SECRET)) return json({ ok: false, error: 'Not allowed.' }, 403);
        const out = await checkReleases(env, { limit: Math.min(Number(url.searchParams.get('limit')) || 20, 40) });
        statsCache = null;
        return json({ ok: true, ...out });
      }
      if (url.pathname === '/api/listing/edit' && request.method === 'POST') return await editListing(request, env, url);
      if (url.pathname === '/api/me' && request.method === 'GET') return await me(request, env);
      if (url.pathname === '/api/my-listings' && request.method === 'GET') return await myListings(request, env);
      return json({ ok: false, error: 'Not found.' }, 404);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'Something went wrong on our side. Try again later.' }, 500);
    }
  },
};
