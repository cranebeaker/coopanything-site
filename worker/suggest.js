// Community suggestions (the "something is missing" path). A member who is logged in with Discord, is in the
// server and is not brand new can suggest a co-op mod for a game or report a mistake. Nothing is published
// until a person approves it.
//
//   POST /api/suggest             { target, kind: mod|correction, url?, note? }   (logged in)
//   GET  /api/suggestions?status=pending&limit=50        (LISTING_SECRET) the review queue
//   POST /api/suggestions/review  { id, decision: approve|reject, note?, by }       (LISTING_SECRET)
//
// Why it is hard to abuse: Discord login plus server membership and account age (the same gate as voting), a
// daily limit, a cap on pending items per person and per game, link rules (https only, no shorteners, invites
// or file hosts), notes are text only (links in them are removed), the same link cannot be sent twice for a
// game, a person who keeps getting rejected is paused, and nothing shows until a human approves it.

import { session } from './auth.js';
import { whyNot, limited } from './wanted.js';
import { edgeBust } from './edge.js';

const PER_DAY = 5;
const PENDING_PER_USER = 12;
const PENDING_PER_GAME = 8;
const NOTE_MAX = 280;
const PAUSE_AFTER_REJECTED = 3;      // rejections in 30 days, with nothing approved, pauses suggestions

// Shorteners hide where a link goes, invites are not mods, and file hosts are a download, not a page about a mod.
const BLOCKED_HOSTS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rebrand\.ly|shorturl\.at|ow\.ly|buff\.ly|discord\.gg|discordapp\.com|t\.me|telegram\.me|mega\.nz|mega\.co\.nz|mediafire\.com|gofile\.io|anonfiles\.com|wetransfer\.com|we\.tl|zippyshare\.com|1fichier\.com|drive\.google\.com|docs\.google\.com|dropbox\.com|onedrive\.live\.com|1drv\.ms|pastebin\.com|linktr\.ee)$/i;

export class BadSuggestion extends Error {}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// One tidy https link, or a BadSuggestion saying why not.
export function cleanLink(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 300) throw new BadSuggestion('Give one link, up to 300 characters.');
  let u;
  try { u = new URL(raw); } catch { throw new BadSuggestion('That is not a link.'); }
  if (u.protocol !== 'https:') throw new BadSuggestion('The link has to start with https://');
  if (u.username || u.password) throw new BadSuggestion('The link cannot contain a login.');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.length > 100) throw new BadSuggestion('Use a normal website address.');
  if (BLOCKED_HOSTS.test(host) || (host === 'discord.com' && /^\/invite\//.test(u.pathname))) {
    throw new BadSuggestion('That kind of link is not accepted. Link the mod\'s own page (GitHub, Nexus Mods, ModDB, itch.io, its website) instead of a download or an invite.');
  }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|igshid|si$)/i.test(k)) u.searchParams.delete(k);
  u.hash = '';
  u.hostname = host;
  // A GitHub link is cut down to the repository.
  const gh = /^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/.exec(u.pathname);
  if (host === 'github.com' && gh) { u.pathname = `/${gh[1]}/${gh[2]}`; u.search = ''; }
  return u.toString().replace(/\/$/, '');
}

// Plain text only: links and markup are taken out, so a note can't be used to smuggle a link in.
export function cleanText(value, max = NOTE_MAX) {
  return String(value ?? '').replace(/https?:\/\/\S+|www\.\S+|discord\.gg\/\S+/gi, '').replace(/[<>*_`~|\\\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

// The game a target means, or null.
async function gameOf(env, url, target) {
  const w = /^w:(\d{1,9})$/.exec(target);
  if (w) return (await env.DB.prepare('SELECT name FROM wanted_games WHERE igdb_id = ?').bind(Number(w[1])).first())?.name || null;
  if (!/^[\w-]{1,100}$/.test(target)) return null;
  const c = await env.DB.prepare('SELECT game FROM community WHERE id = ? AND hidden = 0').bind(target).first();
  if (c) return c.game;
  try {
    const mods = await (await env.ASSETS.fetch(new Request(new URL('/data/mods.json', url)))).json();
    return mods.find((m) => m.id === target)?.game || null;
  } catch { return null; }
}

async function readJson(request) {
  try { const t = await request.text(); return t.length > 3000 ? null : JSON.parse(t); } catch { return null; }
}

async function create(request, env, url, ctx) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'Only from the site itself.' }, 403);
  const who = await session(request, env);
  const bad = whyNot(who);
  if (bad) return json({ ok: false, error: bad }, who ? 403 : 401);
  const body = await readJson(request);
  if (!body || typeof body.target !== 'string') return json({ ok: false, error: 'Bad request.' }, 400);

  const kind = body.kind === 'correction' ? 'correction' : body.kind === 'mod' ? 'mod' : null;
  if (!kind) return json({ ok: false, error: 'Say whether this is a mod or something wrong.' }, 400);
  let link = null;
  try {
    if (kind === 'mod' || (body.url != null && String(body.url).trim() !== '')) link = cleanLink(body.url);
  } catch (e) {
    if (e instanceof BadSuggestion) return json({ ok: false, error: e.message }, 400);
    throw e;
  }
  const note = cleanText(body.note);
  if (kind === 'correction' && note.length < 10) return json({ ok: false, error: 'Say what is wrong, in a sentence or two.' }, 400);

  const game = await gameOf(env, url, body.target);
  if (!game) return json({ ok: false, error: 'That game is not on the list.' }, 404);

  // Paused: several rejections and nothing approved lately.
  const since = Date.now() - 30 * 864e5;
  const hist = await env.DB.prepare(`SELECT SUM(status = 'rejected') AS rejected, SUM(status = 'approved') AS approved, SUM(status = 'pending') AS pending
      FROM suggestions WHERE by_user = ? AND created > ?`).bind(who.userId, since).first();
  if (!who.owner && (hist.rejected || 0) >= PAUSE_AFTER_REJECTED && !(hist.approved || 0)) {
    return json({ ok: false, error: 'Suggestions from your account are paused because several were not accepted. Ask in the Discord if you think that is a mistake.' }, 429);
  }
  if (!who.owner && (hist.pending || 0) >= PENDING_PER_USER) return json({ ok: false, error: 'You have a lot waiting for review already. Wait for those first.' }, 429);
  const forGame = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE target = ? AND status = 'pending'").bind(body.target).first();
  if (!who.owner && forGame.n >= PENDING_PER_GAME) return json({ ok: false, error: 'This game already has a lot of suggestions waiting. Try again later.' }, 429);
  if (!who.owner && (await limited(env, `g:${who.userId}`, PER_DAY, 864e5))) return json({ ok: false, error: `You can send ${PER_DAY} suggestions a day.` }, 429);

  let id;
  try {
    const r = await env.DB.prepare(`INSERT INTO suggestions (target, game, kind, url, note, by_user, by_name, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(body.target, game, kind, link, note || null, who.userId, String(who.name || '').slice(0, 40), Date.now()).first();
    id = r.id;
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) return json({ ok: false, error: 'That link was already suggested for this game. Thank you!' }, 409);
    throw e;
  }
  // Tell the review channel (the bot); the suggestion is saved either way.
  if (env.BOT && env.LISTING_SECRET) {
    const tell = env.BOT.fetch(new Request('https://bot/internal/suggestion', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LISTING_SECRET}` },
      body: JSON.stringify({ id, game, kind, url: link, note, by: who.userId, target: body.target }),
    })).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(tell);
  }
  return json({ ok: true, id, message: 'Thank you! A person checks every suggestion before it shows on the site.' });
}

const sameSecret = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const staff = (request, env) => sameSecret((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.LISTING_SECRET);

async function queue(request, env, url) {
  if (!staff(request, env)) return json({ ok: false, error: 'Not allowed.' }, 403);
  const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const rows = (await env.DB.prepare('SELECT * FROM suggestions WHERE status = ? ORDER BY created ASC LIMIT ?').bind(status, limit).all()).results;
  return json({ ok: true, suggestions: rows });
}

async function review(request, env, url) {
  if (!staff(request, env)) return json({ ok: false, error: 'Not allowed.' }, 403);
  const body = await readJson(request);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || !['approve', 'reject'].includes(body?.decision)) return json({ ok: false, error: 'Bad request.' }, 400);
  const status = body.decision === 'approve' ? 'approved' : 'rejected';
  const row = await env.DB.prepare(`UPDATE suggestions SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? RETURNING id, target, game, kind, url, by_user, status`)
    .bind(status, String(body.by || 'staff').slice(0, 40), Date.now(), cleanText(body.note, 200) || null, id).first();
  if (!row) return json({ ok: false, error: 'No such suggestion.' }, 404);
  await edgeBust(url.origin, '/api/wanted/all');
  return json({ ok: true, suggestion: row });
}

export async function suggest(req, env, url, ctx) {
  const path = url.pathname;
  if (path === '/api/suggest' && req.method === 'POST') return create(req, env, url, ctx);
  if (path === '/api/suggestions' && req.method === 'GET') return queue(req, env, url);
  if (path === '/api/suggestions/review' && req.method === 'POST') return review(req, env, url);
  return null;
}
