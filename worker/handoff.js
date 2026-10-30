// When a reviewed directory entry appears for the same repo as a community listing, the topic moves to
// it by itself: the listing row (Discord topic, Dev role, leads) follows, the community duplicate is
// hidden, and the bot patches the topic's "Site listing:" line. Runs on the same cron as the release check.

import { forgetCommunity } from './community.js';
import { COLUMNS } from './listings.js';

const GITHUB = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

export async function handoffCommunity(env) {
  const res = await env.ASSETS.fetch(new Request('https://coopanything.app/data/repos.json'));
  if (!res.ok) return { moved: [] };
  const byRepo = new Map((await res.json()).map((r) => [String(r.repo).toLowerCase(), r.id]));
  const rows = (await env.DB.prepare("SELECT id, game, url FROM community WHERE hidden = 0 AND url LIKE 'https://github.com/%'").all()).results;
  const moved = [];
  for (const row of rows) {
    const m = GITHUB.exec(row.url || '');
    const to = m && byRepo.get(`${m[1]}/${m[2]}`.toLowerCase());
    if (!to || to === row.id) continue;
    const from = await env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(row.id).first();
    if (from) {
      const target = await env.DB.prepare('SELECT id FROM listings WHERE id = ?').bind(to).first();
      if (!target) await env.DB.prepare('UPDATE listings SET id = ? WHERE id = ?').bind(to, row.id).run();
      else {
        await env.DB.prepare(`UPDATE listings SET ${COLUMNS.map((c) => `${c} = COALESCE(${c}, ?)`).join(', ')} WHERE id = ?`)
          .bind(...COLUMNS.map((c) => from[c] ?? null), to).run();
        await env.DB.prepare('DELETE FROM listings WHERE id = ?').bind(row.id).run();
      }
    }
    await env.DB.prepare('UPDATE community SET hidden = 1 WHERE id = ?').bind(row.id).run();
    forgetCommunity();
    moved.push({ from: row.id, to });
    const thread = /\/(\d{15,22})$/.exec(from?.discord || '')?.[1];
    if (thread && env.BOT && env.LISTING_SECRET) {
      try {
        await env.BOT.fetch(new Request('https://bot/internal/relink', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${env.LISTING_SECRET}` },
          body: JSON.stringify({ thread, from: row.id, to, game: row.game }),
        }));
      } catch { /* the move stands; the dev can still /listing link */ }
    }
  }
  return { moved };
}
