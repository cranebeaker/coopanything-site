// What a mod's own devs set about their listing. Two ways in, one set of rules:
//   POST /api/listing       from the Discord bot (/listing), with Authorization: Bearer LISTING_SECRET
//   POST /api/listing/edit  from the site's editor, by someone logged in with Discord who has the
//                           listing's Dev role (or the server owner)
// Everything is checked here, so neither path can store something the other wouldn't.

export const STAGES = new Set(['released', 'beta', 'development', 'abandoned']);
const SYNC_KEYS = ['see', 'story', 'enemies', 'world', 'items'];
const SYNC_VALUES = new Set(['yes', 'partial', 'no']);
const DISCORD_THREAD = /^https:\/\/discord\.com\/channels\/\d{15,22}\/\d{15,22}$/;
export const COLUMNS = ['discord', 'dev_role', 'leads', 'stage', 'version', 'version_date', 'note', 'note_date',
  'summary', 'video', 'website', 'download', 'players', 'sync', 'cover', 'quality', 'coop_pct', 'engine', 'connect', 'repo', 'kind'];
// Fields the editor and /listing may set; discord and dev_role only come from the bot.
const EDITABLE = ['stage', 'version', 'note', 'summary', 'video', 'website', 'download', 'repo', 'players', 'sync',
  'cover', 'quality', 'coop_pct', 'engine', 'connect', 'kind'];
// What kind of project it is. Official modes and wanted entries are the owner's, not a dev's to claim.
export const KINDS = new Set(['mod', 'fork', 'decomp-port', 'framework', 'emulator-netplay']);
export const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'X']);
export const CONNECT = new Set(['Direct IP', 'Steam (no port forwarding)', 'Hosted relay', 'Dedicated server', 'LAN or split-screen', 'VPN needed']);
// Cover images are only linked: an image file, or a known image host.
const IMAGE_HOSTS = /(^|\.)(steamstatic\.com|akamaihd\.net|imgur\.com|githubusercontent\.com|discordapp\.(com|net)|igdb\.com|wikimedia\.org|moddb\.com|nexusmods\.com|staticnexusmods\.com)$/;

export class BadField extends Error {}

// Notes are plain text: no links (they could point anywhere), no markup, one short paragraph.
export function cleanNote(text) {
  return String(text).replace(/https?:\/\/\S+|www\.\S+|discord\.gg\/\S+/gi, '').replace(/[<>*_`~|\\]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 200);
}

function httpsUrl(value, what) {
  let u;
  try { u = new URL(String(value).trim()); } catch { throw new BadField(`The ${what} isn’t a link.`); }
  if (u.protocol !== 'https:' || u.username || u.password || String(value).length > 300) throw new BadField(`The ${what} has to be an https:// link.`);
  return u.toString();
}

// The code repository: GitHub, GitLab or Codeberg, owner/repo, tidied.
export function repoUrl(value) {
  const u = new URL(httpsUrl(value, 'repository link'));
  const host = u.hostname.replace(/^www\./, '');
  const m = /^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(u.pathname);
  if (!['github.com', 'gitlab.com', 'codeberg.org'].includes(host) || !m) {
    throw new BadField('The repository is a GitHub, GitLab or Codeberg link like https://github.com/owner/repo.');
  }
  return `https://${host}/${m[1]}/${m[2]}`;
}

// Videos are only linked and embedded from their own site: YouTube, Vimeo or Streamable.
export function videoUrl(value) {
  const u = new URL(httpsUrl(value, 'video link'));
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let m;
  if (host === 'youtu.be' && (m = u.pathname.match(/^\/([\w-]{11})$/))) return `https://www.youtube.com/watch?v=${m[1]}`;
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1];
    if (/^[\w-]{11}$/.test(id || '')) return `https://www.youtube.com/watch?v=${id}`;
  }
  if (host === 'vimeo.com' && (m = u.pathname.match(/^\/(\d{5,12})$/))) return `https://vimeo.com/${m[1]}`;
  if (host === 'streamable.com' && (m = u.pathname.match(/^\/(?:e\/)?(\w{4,12})$/))) return `https://streamable.com/${m[1]}`;
  throw new BadField('Videos can be YouTube, Vimeo or Streamable links.');
}

// Checks every field it's given and returns the columns to write (null clears a field).
export function checkFields(body, { fromBot, owner = false }) {
  const set = {};
  const today = new Date().toISOString().slice(0, 10);
  const has = (k) => body[k] != null && !(typeof body[k] === 'string' && body[k].trim() === '');
  if (fromBot && has('discord')) {
    if (!DISCORD_THREAD.test(body.discord)) throw new BadField('That isn’t a Discord topic link.');
    set.discord = body.discord;
  }
  if (fromBot && has('dev_role')) {
    if (!/^\d{15,22}$/.test(String(body.dev_role))) throw new BadField('Bad role id.');
    set.dev_role = String(body.dev_role);
  }
  if (fromBot && Array.isArray(body.leads) && body.leads.length) {
    const leads = [...new Set(body.leads.map(String))];
    if (leads.length > 20 || !leads.every((u) => /^\d{15,22}$/.test(u))) throw new BadField('Bad lead ids.');
    set.leads = JSON.stringify(leads);
  }
  if (has('stage')) {
    if (!STAGES.has(body.stage)) throw new BadField('Unknown stage.');
    set.stage = body.stage;
  }
  if (has('version')) {
    const v = String(body.version).trim();
    if (!/^[\w.+\- ]{1,40}$/.test(v)) throw new BadField('Versions are up to 40 letters, numbers, dots and dashes.');
    set.version = v; set.version_date = today;
  }
  if (has('note')) {
    const n = cleanNote(body.note);
    if (!n) throw new BadField('The note is empty (links are taken out).');
    set.note = n; set.note_date = today;
  }
  if (has('summary')) {
    const s = String(body.summary).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    if (s.length > 4000) throw new BadField('The description is over 4000 characters.');
    set.summary = s;
  }
  if (has('video')) set.video = videoUrl(body.video);
  if (has('website')) set.website = httpsUrl(body.website, 'website link');
  if (has('download')) set.download = httpsUrl(body.download, 'download link');
  if (has('repo')) set.repo = repoUrl(body.repo);
  if (has('kind')) {
    if (!KINDS.has(body.kind)) throw new BadField('The project type is mod, fork or port, decomp port, framework or tool, or emulator netplay.');
    set.kind = body.kind;
  }
  if (has('players')) {
    const p = String(body.players).trim();
    if (!/^[\w +\-–]{1,20}$/.test(p)) throw new BadField('Players is short, like 2 or 2-4.');
    set.players = p;
  }
  if (has('cover')) {
    const u = new URL(httpsUrl(body.cover, 'cover image link'));
    if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(u.pathname) && !IMAGE_HOSTS.test(u.hostname)) {
      throw new BadField('The cover has to be a link to an image (.png, .jpg, .webp...) or from Steam, Imgur, GitHub or Discord.');
    }
    set.cover = u.toString();
  }
  if (has('quality')) {
    const q = String(body.quality).trim().toUpperCase();
    if (!TIERS.has(q)) throw new BadField('Tiers are S, A, B, C, D or X.');
    if (q === 'S' && !owner) throw new BadField('S tier is picked by MJ. Pick A to D for your mod.');
    set.quality = q;
  }
  if (body.coop_pct != null && body.coop_pct !== '') {
    const n = Number(body.coop_pct);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new BadField('Co-op % is a whole number from 0 to 100.');
    set.coop_pct = n;
  }
  if (has('engine')) {
    const e = cleanNote(body.engine).slice(0, 60);
    if (!e) throw new BadField('The engine name is empty.');
    set.engine = e;
  }
  if (has('connect')) {
    if (!CONNECT.has(body.connect)) throw new BadField(`How you connect is one of: ${[...CONNECT].join(', ')}.`);
    set.connect = body.connect;
  }
  if (body.sync != null && typeof body.sync === 'object') {
    const sync = {};
    for (const k of SYNC_KEYS) {
      if (body.sync[k] == null || body.sync[k] === '') continue;
      if (!SYNC_VALUES.has(body.sync[k])) throw new BadField('Sync values are yes, partial or no.');
      sync[k] = body.sync[k];
    }
    set.sync = Object.keys(sync).length ? JSON.stringify(sync) : null;
  }
  const clear = new Set(Array.isArray(body.clear) ? body.clear : []);
  for (const f of fromBot ? ['discord', 'dev_role', 'leads', ...EDITABLE] : EDITABLE) {
    if (!clear.has(f)) continue;
    set[f] = null;
    if (f === 'version' || f === 'note') set[`${f}_date`] = null;
  }
  return set;
}

export async function save(env, id, set, by) {
  const cols = Object.keys(set).filter((c) => COLUMNS.includes(c));
  if (!cols.length) throw new BadField('Nothing to change.');
  await env.DB.prepare(`INSERT INTO listings (id, ${cols.join(', ')}, updated, updated_by)
      VALUES (?1, ${cols.map((_, i) => `?${i + 2}`).join(', ')}, ?${cols.length + 2}, ?${cols.length + 3})
      ON CONFLICT (id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, updated = excluded.updated, updated_by = excluded.updated_by`)
    .bind(id, ...cols.map((c) => set[c]), Date.now(), String(by || '').slice(0, 30)).run();
  return env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first();
}

// Who may edit a listing on the site: its leads when it has any, else anyone with its Dev role.
export function canEdit(row, who) {
  if (who.owner) return true;
  if (!row) return false;
  let leads = [];
  try { leads = row.leads ? JSON.parse(row.leads) : []; } catch { /* ignore */ }
  if (leads.length) return leads.includes(who.userId);
  return Boolean(row.dev_role && who.roles.includes(row.dev_role));
}

// The public shape (in /api/stats): camelCase, nulls dropped, dev_role and leads kept private.
export function publicListing(r) {
  let sync = null;
  try { sync = r.sync ? JSON.parse(r.sync) : null; } catch { /* ignore */ }
  return Object.fromEntries(Object.entries({
    discord: r.discord, stage: r.stage, version: r.version, versionDate: r.version_date, note: r.note, noteDate: r.note_date,
    summary: r.summary, video: r.video, website: r.website, download: r.download, players: r.players, sync,
    cover: r.cover, quality: r.quality, coopPct: r.coop_pct, engine: r.engine, connect: r.connect, repo: r.repo, kind: r.kind,
  }).filter(([, v]) => v != null));
}
