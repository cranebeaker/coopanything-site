// Personal API tokens, so a dev's AI can edit their listings. A person logs in with Discord, makes a token
// on /my/, and gives it to their AI. A token can do exactly what its owner can do in the site editor
// (same rules, same checks), never owner-only things. Only a hash is stored; tokens expire after 90 days.

const MAX_TOKENS = 5;
const DAYS = 90;
export const TOKEN_FORMAT = /^ca_[0-9a-f]{48}$/;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const hashOf = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));

// The person behind a token, in the same shape as a logged-in session. Null when it isn't valid.
export async function tokenUser(env, token) {
  if (!TOKEN_FORMAT.test(token || '')) return null;
  const row = await env.DB.prepare('SELECT * FROM api_tokens WHERE hash = ? AND expires > ?').bind(await hashOf(token), Date.now()).first();
  if (!row) return null;
  if (!row.last_used || Date.now() - row.last_used > 600_000) {
    await env.DB.prepare('UPDATE api_tokens SET last_used = ? WHERE id = ?').bind(Date.now(), row.id).run();
  }
  let roles = [];
  try { roles = JSON.parse(row.roles || '[]'); } catch { /* none */ }
  return { userId: row.user_id, name: row.label || 'token', roles, owner: false, member: true, viaToken: true };
}

export async function listTokens(env, who) {
  const rows = (await env.DB.prepare('SELECT id, label, prefix, created, expires, last_used FROM api_tokens WHERE user_id = ? ORDER BY created DESC').bind(who.userId).all()).results;
  return rows.filter((r) => r.expires > Date.now());
}

export async function createToken(env, who, label) {
  const mine = await listTokens(env, who);
  if (mine.length >= MAX_TOKENS) throw new Error(`You have ${MAX_TOKENS} tokens already. Remove one first.`);
  const clean = String(label || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 40) || 'My AI';
  const token = `ca_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
  const now = Date.now();
  await env.DB.prepare('INSERT INTO api_tokens (user_id, label, hash, prefix, roles, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(who.userId, clean, await hashOf(token), token.slice(0, 9), JSON.stringify(who.roles || []), now, now + DAYS * 864e5).run();
  return { token, label: clean, expires: now + DAYS * 864e5 };
}

export async function revokeToken(env, who, id) {
  const res = await env.DB.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').bind(Number(id), who.userId).run();
  if (!res.meta.changes) throw new Error('No such token.');
}

export function guideText(origin) {
  return `# CoOp:Anything API for AI assistants

This lets you (an AI assistant) edit a co-op mod's listing on ${origin} for your user. They gave you a personal
token. It can edit only the listings its owner is a dev or lead of (same rules as the site's Edit listing panel).

Send the token on every request:  Authorization: Bearer <token>
Never print the token back to the user, never put it in a file, and never send it anywhere but ${origin}.

## 1. See which listings you can edit
GET ${origin}/api/v1/me
-> { ok, listings: [ { id, game, project, current: { ...what is set now } } ] }

## 2. Edit one
POST ${origin}/api/v1/listing   (Content-Type: application/json)
Body: { "id": "<listing id>", ...only the fields to change }
-> { ok: true, listing } or { ok: false, error } (400 means a field was refused: read the error and fix it).

Fields (all optional):
- stage: released | beta | development | abandoned
- version: short text like v1.2.0 (up to 40 characters)
- note: one short plain-text line (up to 200 characters, links and markup are removed)
- summary: the description, Markdown allowed (**bold**, ## headings, - lists, [links](https://...)), up to 4000 characters
- video: a YouTube, Vimeo or Streamable link
- website, download: https links
- repo: a GitHub, GitLab or Codeberg link like https://github.com/owner/repo (releases are read from it)
- cover: a link to an image (.png .jpg .webp ...) or a Steam, Imgur, GitHub or Discord image
- kind: mod | fork | decomp-port | framework | emulator-netplay
- quality: tier A, B, C, D or X (S is the owner's)
- coop_pct: whole number 0 to 100 (how much of the game works in co-op)
- engine: short text, players: like 2 or 2-4
- connect: Direct IP | Steam (no port forwarding) | Hosted relay | Dedicated server | LAN or split-screen | VPN needed
- sync: { see, story, enemies, world, items }, each one of yes | partial | no
- clear: ["video", "download", ...] to empty fields

## Rules of the road
- Only state facts the user told you or you checked yourself (their repo, their README). Do not invent tests,
  versions or features. Ask the user when unsure.
- Changes appear on the site within about 5 minutes. Edits are limited per hour; a 429 means wait.
- Changes to the long write-up, the "Reviewed" badge and the directory entry go through the project's GitHub pull
  requests, not this API.
`;
}
