// The review queue for community suggestions. Meant to be run by the owner, or by Claude on the owner's behalf,
// every so often. It reads the pending suggestions from the site, opens each link for real and says whether it
// looks right; it never approves or rejects on its own, a person (or Claude, when asked) decides.
//
//   node tools/review_suggestions.mjs list                     pending suggestions with automatic checks
//   node tools/review_suggestions.mjs list --status approved   what was approved before
//   node tools/review_suggestions.mjs approve 12 "checked, it is the real mod page"
//   node tools/review_suggestions.mjs reject 13 "not a mod"
//   node tools/review_suggestions.mjs apply decisions.json     [{ "id": 12, "decision": "approve", "note": "..." }, ...]
// --site http://127.0.0.1:8794 points it at a local Worker. The secret is LISTING_SECRET in discord-bot/.env.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namesGame } from './crawl_coop.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const TRUSTED = /(^|\.)(github\.com|github\.io|gitlab\.com|codeberg\.org|nexusmods\.com|moddb\.com|indiedb\.com|gamebanana\.com|thunderstore\.io|itch\.io|curseforge\.com|modworkshop\.net|mod\.io|steamcommunity\.com|gog\.com|patreon\.com|ko-fi\.com)$/i;
const COOP = /\b(co-?op|co op|cooperative|multiplayer|multi-player|together|split ?screen|online)\b/i;
const BAD = /\b(casino|betting|porn|xxx|nsfw|onlyfans|crack(ed)?|keygen|free (robux|vbucks)|giveaway|click here|buy now|promo code|telegram)\b/i;

// Looks at what a link really is. `page` is { status, finalUrl, title, description, error } from fetchPage.
export function assess(s, page) {
  const flags = [];
  let recommend = 'look';
  if (s.kind === 'correction') return { recommend: 'look', flags: ['a correction: needs a person to check the claim'] };
  if (page.error) return { recommend: 'reject', flags: [`the link did not load (${page.error})`] };
  if (page.status >= 400) return { recommend: 'reject', flags: [`the link answered ${page.status}`] };
  const host = (() => { try { return new URL(page.finalUrl || s.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const origHost = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const text = `${page.title || ''} ${page.description || ''} ${page.finalUrl || s.url}`.replace(/[/_.-]+/g, ' ');
  const named = namesGame(s.game, text);
  const coop = COOP.test(`${page.title || ''} ${page.description || ''} ${s.note || ''}`);
  const trusted = TRUSTED.test(host);
  if (host && origHost && host !== origHost) flags.push(`it redirects to another site (${host})`);
  if (BAD.test(`${page.title || ''} ${page.description || ''} ${s.note || ''}`)) flags.push('spam or unsafe wording on the page or in the note');
  if (!named) flags.push('the page does not seem to name the game');
  if (!coop) flags.push('no co-op wording on the page or in the note');
  if (!trusted) flags.push(`${host || 'this site'} is not a usual mod host`);
  if (flags.some((f) => /spam/.test(f))) recommend = 'reject';
  else if (named && coop && trusted && !flags.some((f) => /redirects/.test(f))) recommend = 'approve';
  return { recommend, flags };
}

async function fetchPage(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CoopAnythingReview/1.0; +https://coopanything.app)', Accept: 'text/html' } });
    const html = (await res.text()).slice(0, 200_000);
    clearTimeout(timer);
    const pick = (re) => (re.exec(html) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 300) || '';
    return {
      status: res.status, finalUrl: res.url,
      title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i) || pick(/property="og:title"[^>]*content="([^"]*)"/i),
      description: pick(/name="description"[^>]*content="([^"]*)"/i) || pick(/property="og:description"[^>]*content="([^"]*)"/i),
    };
  } catch (e) { return { error: e.name === 'AbortError' ? 'timed out' : String(e.message || e).slice(0, 80) }; }
}

async function main() {
  const env = Object.fromEntries(readFileSync(join(here, '../../discord-bot/.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const site = (flag('site') || 'https://coopanything.app').replace(/\/$/, '');
  const api = async (path, init = {}) => {
    const res = await fetch(site + path, { ...init, headers: { Authorization: `Bearer ${env.LISTING_SECRET}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const cmd = positional[0] || 'list';

  if (cmd === 'approve' || cmd === 'reject') {
    const id = Number(positional[1]);
    const r = await api('/api/suggestions/review', { method: 'POST', body: JSON.stringify({ id, decision: cmd, note: positional[2] || '', by: 'review-tool' }) });
    console.log(r.status === 200 ? `#${id} ${cmd === 'approve' ? 'approved' : 'rejected'}` : `#${id}: ${r.body.error || r.status}`);
    return;
  }
  if (cmd === 'apply') {
    const list = JSON.parse(readFileSync(positional[1], 'utf8'));
    for (const d of list) {
      const r = await api('/api/suggestions/review', { method: 'POST', body: JSON.stringify({ id: d.id, decision: d.decision, note: d.note || '', by: 'review-tool' }) });
      console.log(`#${d.id} ${d.decision}: ${r.status === 200 ? 'ok' : r.body.error || r.status}`);
    }
    return;
  }

  const status = flag('status') || 'pending';
  const q = await api(`/api/suggestions?status=${status}&limit=100`);
  if (q.status !== 200) { console.log('could not read the queue:', q.body.error || q.status); process.exit(1); }
  const rows = q.body.suggestions;
  if (!rows.length) { console.log(`Nothing ${status}.`); return; }
  // How each person's earlier suggestions went.
  const history = {};
  for (const st of ['approved', 'rejected']) for (const r of (await api(`/api/suggestions?status=${st}&limit=200`)).body.suggestions || []) { (history[r.by_user] ||= { approved: 0, rejected: 0 })[st]++; }
  const report = [];
  for (const s of rows) {
    const page = s.kind === 'mod' && s.url ? await fetchPage(s.url) : {};
    const a = assess(s, page);
    report.push({ id: s.id, game: s.game, kind: s.kind, url: s.url, note: s.note, by: s.by_name || s.by_user, history: history[s.by_user] || { approved: 0, rejected: 0 }, page: { status: page.status, title: page.title, finalUrl: page.finalUrl }, ...a });
  }
  for (const r of report) {
    console.log(`\n#${r.id} [${r.recommend.toUpperCase()}] ${r.game} (${r.kind}) from ${r.by} (before: ${r.history.approved} approved, ${r.history.rejected} rejected)`);
    if (r.url) console.log(`  link: ${r.url}${r.page.finalUrl && r.page.finalUrl !== r.url ? ` -> ${r.page.finalUrl}` : ''}`);
    if (r.page.title) console.log(`  page: ${r.page.title}`);
    if (r.note) console.log(`  note: ${r.note}`);
    for (const f of r.flags) console.log(`  ! ${f}`);
  }
  writeFileSync(join(here, '../data/seed/suggestions-report.json'), JSON.stringify(report, null, 1));
  const c = {}; report.forEach((r) => { c[r.recommend] = (c[r.recommend] || 0) + 1; });
  console.log(`\n${report.length} ${status}:`, c, '| report saved to data/seed/suggestions-report.json');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
