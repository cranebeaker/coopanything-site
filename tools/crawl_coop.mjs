// Finds co-op mods for the games in data/seed/games.json from free sources, with no accounts:
//   igdb        official co-op flags (the Twitch keys in discord-bot/.env)
//   web         web search, the core: finds mods that live on their own sites, itch, Discord, videos. Google via Serper\n//               (SERPER_API_KEY, 2,500 free queries), or BRAVE_API_KEY, or GOOGLE_CSE_KEY + GOOGLE_CSE_CX in\n//               discord-bot/.env; without a key it falls back to DuckDuckGo, which throttles fast and runs slowly
//   github      GitHub repository search (10 searches a minute without a token)
//   nexus       Nexus Mods' anonymous GraphQL search, for games Nexus has
//   gamebanana  GameBanana's open search API
// Every source is polite (its own rate limit, backs off when asked to) and the run is resumable: results are
// cached per source in data/seed/crawl/, so stopping and restarting loses nothing.
//
//   node tools/crawl_coop.mjs                       the whole list, in the background-friendly loop
//   node tools/crawl_coop.mjs --limit 40            only the first 40 games
//   node tools/crawl_coop.mjs --name "Resident Evil" --name "BioShock Remastered"     ad-hoc, nothing cached
//   node tools/crawl_coop.mjs --sources web,github  only some sources
//   node tools/crawl_coop.mjs --merge-only          just rebuild data/seed/results-crawl/crawl.json from the caches
//
// What it finds are CANDIDATES: a page whose title or description names the game and co-op. A person has not
// checked them, so they are marked auto: true and the site calls them "possible".
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SEED = join(here, '../data/seed');
const CACHE = join(SEED, 'crawl');
mkdirSync(CACHE, { recursive: true });
mkdirSync(join(SEED, 'results-crawl'), { recursive: true });

// ── arguments ───────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const values = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const ALL_SOURCES = ['igdb', 'web', 'github', 'nexus', 'gamebanana'];
const wanted = (value('sources') || ALL_SOURCES.join(',')).split(',').filter((s) => ALL_SOURCES.includes(s));
const limit = Number(value('limit')) || Infinity;
const adhoc = values('name');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── text helpers ────────────────────────────────────────────────
const fold = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'to', 'for', 'edition', 'remastered', 'definitive', 'game', 'year', 'enhanced', 'complete', 'collection', 'hd', 'goty', 'directors', 'cut']);
const COOP = /\b(co-?op|co op|cooperative|multiplayer|multi-player|multi player|multiplay|together|online play|online mode|split ?screen|2 ?player|two ?player|2p|mp mod)\b/i;
const NOT_COOP = /\b(pvp|deathmatch|dedicated server list|roleplay server|role-play|battle royale|ranked|leaderboard|cheat|trainer|aimbot|wallhack)\b/i;
const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

// Does this text name the game? Every distinctive word, and no different sequel number straight after it
// ("Resident Evil 4" must not match "Resident Evil" and the other way round).
export function namesGame(game, text) {
  const gt = fold(game).split(' ').filter(Boolean);
  const tt = fold(text).split(' ').filter(Boolean);
  if (!gt.length || !tt.length) return false;
  const core = gt.filter((w) => !STOP.has(w));
  if (!core.length) return false;
  const nums = (arr) => arr.filter((w) => /^\d{1,2}$/.test(w) || ROMAN[w]).map((w) => (ROMAN[w] ? String(ROMAN[w]) : w));
  const gnums = nums(gt);
  // The title as a run of words, when it appears whole.
  for (let i = 0; i + gt.length <= tt.length; i++) {
    if (gt.every((w, k) => tt[i + k] === w)) {
      const next = tt[i + gt.length];
      if (next && /^\d{1,2}$/.test(next) && !gnums.includes(next)) continue;     // "... Evil 4" for "Resident Evil"
      return true;
    }
  }
  // Not as a clean phrase. Only long titles may still match by their words in another order or with a
  // subtitle dropped; a short title (like "Resident Evil") must appear as its own phrase, or every sequel
  // and spin-off would match it.
  if (core.length < 3 || !core.every((w) => tt.includes(w))) return false;
  const tnums = nums(tt);
  return gnums.every((n) => tnums.includes(n)) && tnums.every((n) => gnums.includes(n));
}

const coopText = (t) => COOP.test(t) && !(NOT_COOP.test(t) && !/\bco-?op\b/i.test(t));

// ── candidates ──────────────────────────────────────────────────
const HOSTS = [
  [/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?(?:releases.*|tree\/.*|blob\/.*)?$/i, 'repo'],
  [/^https:\/\/[\w-]+\.github\.io\//i, 'site'],
  [/^https:\/\/(www\.)?nexusmods\.com\/[\w-]+\/mods\/\d+/i, 'mod-page'],
  [/^https:\/\/(www\.)?moddb\.com\/(mods|games\/[\w-]+\/mods|downloads)/i, 'mod-page'],
  [/^https:\/\/(www\.)?gamebanana\.com\/mods\//i, 'mod-page'],
  [/^https:\/\/thunderstore\.io\//i, 'mod-page'],
  [/^https:\/\/[\w-]+\.itch\.io\//i, 'site'],
  [/^https:\/\/(www\.)?(curseforge\.com|modworkshop\.net|mod\.io|gitlab\.com|codeberg\.org)\//i, 'mod-page'],
  [/^https:\/\/steamcommunity\.com\/sharedfiles\//i, 'mod-page'],
  [/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i, 'video'],
  [/^https:\/\/(www\.)?reddit\.com\//i, 'discussion'],
  [/^https:\/\/(www\.)?(steamcommunity\.com\/app|gog\.com\/forum|forums?\.)/i, 'discussion'],
];
const kindOf = (url) => (HOSTS.find(([re]) => re.test(url)) || [, 'article'])[1];
const STRONG = new Set(['repo', 'mod-page', 'site']);
const SKIP_HOST = /(wikipedia\.org|fandom\.com|wikia|steampowered\.com\/app|store\.|amazon\.|ebay\.|metacritic|ign\.com\/(games|wikis)|gamefaqs|howlongtobeat|pcgamingwiki|igdb\.com|mobygames|tvtropes|co-optimus|opencritic|steamdb|gog\.com\/game|epicgames|xbox\.com|playstation\.com)/i;

function candidate(game, { url, title, snippet, source, extra = {} }) {
  if (!/^https:\/\//i.test(url || '') || SKIP_HOST.test(url)) return null;
  const text = `${title} ${snippet || ''} ${url.replace(/[/_.-]+/g, ' ')}`;
  // A GitHub hit was already searched for the co-op words (in the readme too), so its visible text only has to name the game.
  if (!coopText(`${title} ${snippet || ''}`) && !extra.searchedForCoop) return null;
  const kind = kindOf(url);
  const named = namesGame(game, text);
  if (!named) return null;
  // A mod page or repo that only mentions the game in its URL is weaker than one that says it in its title.
  const inTitle = namesGame(game, title);
  const score = (inTitle ? 3 : 1) + (/\bco-?op\b/i.test(title) ? 2 : 0) + (STRONG.has(kind) ? 2 : 0) + (extra.stars > 20 ? 1 : 0);
  return { name: String(title).replace(/\s+/g, ' ').trim().slice(0, 120), url, source, kind, score, summary: String(snippet || '').replace(/\s+/g, ' ').trim().slice(0, 200), ...extra };
}

// ── sources ─────────────────────────────────────────────────────
// Each: async search(game) -> { ok, candidates } ; rate-limited by its own spacing.
// ── web search: the core. Serper (Google results, 2,500 free queries, no card) or Brave or Google's own
// Programmable Search when a key is in discord-bot/.env, else DuckDuckGo, which throttles quickly. ──
const ENV = Object.fromEntries((existsSync(join(here, '../../discord-bot/.env')) ? readFileSync(join(here, '../../discord-bot/.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
// Every configured provider in order; if one runs out of credits or rejects its key, the next takes over.
// DuckDuckGo is always last (needs no key, but it throttles fast).
const PROVIDERS = [ENV.SERPER_API_KEY && 'serper', ENV.TAVILY_API_KEY && 'tavily', ENV.BRAVE_API_KEY && 'brave',
  ENV.GOOGLE_CSE_KEY && ENV.GOOGLE_CSE_CX && 'google', ENV.SEARXNG_URL && 'searxng', 'ddg'].filter(Boolean);
let pi = 0;
const PROVIDER = () => PROVIDERS[pi];
const LABEL = { serper: 'Google web search (via Serper)', tavily: 'Tavily web search', brave: 'Brave web search', google: 'Google web search', searxng: 'SearXNG web search', ddg: 'DuckDuckGo web search' };

const SPACING_WEB = { serper: 350, tavily: 400, brave: 1150, google: 1000, searxng: 2500, ddg: 9000 };
const spacing = { github: 6200, nexus: 450, gamebanana: 1100 };
const lastCall = {};
async function polite(source) {
  const gap = source === 'web' ? SPACING_WEB[PROVIDER()] : spacing[source];
  const wait = (lastCall[source] || 0) + gap + Math.random() * 400 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[source] = Date.now();
}

async function getText(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(init.headers || {}) } });
  return { res, text: await res.text() };
}

const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
// Each provider's answer in one shape: [{ url, title, snippet }].
export const parseSerper = (j) => (j.organic || []).map((r) => ({ url: r.link, title: strip(r.title), snippet: strip(r.snippet) }));
export const parseTavily = (j) => (j.results || []).map((r) => ({ url: r.url, title: strip(r.title), snippet: strip(r.content).slice(0, 300) }));
export const parseSearxng = (j) => (j.results || []).map((r) => ({ url: r.url, title: strip(r.title), snippet: strip(r.content) }));
export const parseBrave = (j) => ((j.web && j.web.results) || []).map((r) => ({ url: r.url, title: strip(r.title), snippet: strip(r.description) }));
export const parseGoogle = (j) => (j.items || []).map((r) => ({ url: r.link, title: strip(r.title), snippet: strip(r.snippet) }));
export function parseDdg(html) {
  const results = [];
  for (const b of html.split(/<div class="result results_links/).slice(1)) {
    const a = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    if (!a) continue;
    let url = a[1];
    const u = /uddg=([^&]+)/.exec(url);
    if (u) url = decodeURIComponent(u[1]);
    const s = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    results.push({ url, title: strip(a[2]), snippet: s ? strip(s[1]) : '' });
  }
  return results;
}

let webBackoff = 0;
let googleToday = { day: '', n: 0 };
// Moves on to the next provider (a key was rejected, or the credits ran out). False when none is left.
function nextProvider(why) {
  if (pi >= PROVIDERS.length - 1) return false;
  log(`${PROVIDER()}: ${why}; switching to ${PROVIDERS[pi + 1]}`);
  pi++;
  webBackoff = 0;
  return true;
}

async function webQuery(q) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await polite('web');
    if (webBackoff > Date.now()) await sleep(webBackoff - Date.now());
    const provider = PROVIDER();
    let res, text;
    try {
      if (provider === 'serper') ({ res, text } = await getText('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': ENV.SERPER_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, num: 10 }) }));
      else if (provider === 'tavily') ({ res, text } = await getText('https://api.tavily.com/search', { method: 'POST', headers: { Authorization: `Bearer ${ENV.TAVILY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, max_results: 10, search_depth: 'basic' }) }));
      else if (provider === 'brave') ({ res, text } = await getText(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, { headers: { Accept: 'application/json', 'X-Subscription-Token': ENV.BRAVE_API_KEY } }));
      else if (provider === 'google') {
        const day = new Date().toISOString().slice(0, 10);
        if (googleToday.day !== day) googleToday = { day, n: 0 };
        if (googleToday.n >= Number(ENV.GOOGLE_DAILY_CAP || 95)) { if (nextProvider('daily free limit reached')) continue; return { ok: false, results: [], fatal: true }; }
        googleToday.n++;
        ({ res, text } = await getText(`https://www.googleapis.com/customsearch/v1?key=${ENV.GOOGLE_CSE_KEY}&cx=${ENV.GOOGLE_CSE_CX}&q=${encodeURIComponent(q)}&num=10`));
      } else if (provider === 'searxng') ({ res, text } = await getText(`${ENV.SEARXNG_URL.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}&format=json&language=en`));
      else ({ res, text } = await getText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q)));
    } catch (e) { log(`${provider}: request failed (${e.message})`); await sleep(5000); continue; }
    // A rejected key or used-up credits: hand over to the next provider rather than fail every game.
    if (provider !== 'ddg' && [401, 402, 403, 432, 433].includes(res.status)) {
      if (nextProvider(`HTTP ${res.status} (key rejected or credits used up)`)) continue;
      return { ok: false, results: [], fatal: true };
    }
    const blocked = res.status === 202 || res.status === 429 || (provider === 'ddg' && /anomaly|captcha|unusual traffic/i.test(text.slice(0, 4000)));
    if (blocked || !res.ok) {
      const wait = Math.min(15 * 60_000, 60_000 * 2 ** attempt);
      webBackoff = Date.now() + wait;
      log(`${provider} asked us to slow down (${res.status}); waiting ${Math.round(wait / 1000)}s`);
      continue;
    }
    let results;
    try {
      const P = { serper: parseSerper, tavily: parseTavily, brave: parseBrave, google: parseGoogle, searxng: parseSearxng };
      results = provider === 'ddg' ? parseDdg(text) : P[provider](JSON.parse(text));
    } catch (e) { log(`${provider}: could not read the answer (${e.message})`); return { ok: false, results: [] }; }
    return { ok: true, results, provider };
  }
  return { ok: false, results: [] };
}
const sources = {
  async web(game) {
    const found = [];
    let used;
    const queries = [`${game.name} co-op mod`];
    for (let qi = 0; qi < queries.length; qi++) {
      const r = await webQuery(queries[qi]);
      if (!r.ok) return { ok: false, candidates: found, ...(r.fatal ? { fatal: true } : {}) };
      used = r.provider;
      for (const x of r.results) { const c = candidate(game.name, { ...x, source: 'web' }); if (c) found.push(c); }
      // Nothing solid yet: ask once more in different words.
      if (qi === 0 && !found.some((c) => STRONG.has(c.kind))) queries.push(`${game.name} multiplayer mod github`);
    }
    return { ok: true, candidates: found, provider: used };
  },
  async github(game) {
    await polite('github');
    const title = game.name.replace(/["']/g, ' ').replace(/\s+/g, ' ').trim();
    const q = encodeURIComponent(`"${title}" (coop OR co-op OR cooperative OR multiplayer) in:name,description,readme fork:false`);
    for (let attempt = 0; attempt < 3; attempt++) {
      let out;
      try { out = await getText(`https://api.github.com/search/repositories?q=${q}&per_page=8`, { headers: { Accept: 'application/vnd.github+json' } }); } catch { await sleep(5000); continue; }
      if (out.res.status === 403 || out.res.status === 429) {
        const reset = Number(out.res.headers.get('x-ratelimit-reset')) * 1000;
        const wait = Math.max(20_000, Math.min(reset - Date.now() + 2000, 120_000) || 60_000);
        log(`github rate limit; waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!out.res.ok) return { ok: false, candidates: [] };
      const items = JSON.parse(out.text).items || [];
      const c = [];
      for (const r of items) {
        const x = candidate(game.name, {
          url: r.html_url, title: `${r.full_name}${r.description ? ': ' + r.description : ''}`, snippet: r.description || '', source: 'github',
          extra: { stars: r.stargazers_count, pushed: (r.pushed_at || '').slice(0, 10), archived: !!r.archived, searchedForCoop: true },
        });
        if (x) { x.name = r.name.replace(/[-_]+/g, ' '); c.push(x); }
      }
      return { ok: true, candidates: c };
    }
    return { ok: false, candidates: [] };
  },

  async nexus(game) {
    const index = await nexusIndex();
    const bare = fold(game.name).split(' ').filter((w) => !STOP.has(w)).join(' ');
    const domain = index.get(fold(game.name)) || index.get(fold(game.name.replace(/\s*[:(-].*$/, ''))) || index.get(bare);
    if (!domain) return { ok: true, candidates: [], note: 'not on Nexus' };
    const c = [];
    for (const kw of ['coop', 'co-op', 'multiplayer', 'together']) {
      await polite('nexus');
      const q = `{ mods(filter:{ name:{ value:${JSON.stringify(kw)}, op:WILDCARD }, gameDomainName:{ value:${JSON.stringify(domain)} } }, count:6){ nodes{ name summary modId updatedAt endorsements downloads } } }`;
      let j;
      try { j = JSON.parse((await getText('https://api.nexusmods.com/v2/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })).text); } catch { return { ok: false, candidates: c }; }
      for (const m of j.data?.mods?.nodes || []) {
        const text = `${m.name} ${m.summary || ''}`;
        // The game is fixed by the Nexus page, so only the co-op wording has to match.
        if (!coopText(text)) continue;
        c.push({ name: m.name.slice(0, 120), url: `https://www.nexusmods.com/${domain}/mods/${m.modId}`, source: 'nexus', kind: 'mod-page', score: 6 + (/\bco-?op\b/i.test(m.name) ? 2 : 0),
          summary: (m.summary || '').replace(/\s+/g, ' ').slice(0, 200), updated: (m.updatedAt || '').slice(0, 10), downloads: m.downloads });
      }
    }
    return { ok: true, candidates: [...new Map(c.map((x) => [x.url, x])).values()] };
  },

  async gamebanana(game) {
    await polite('gamebanana');
    const q = encodeURIComponent(`${game.name} coop`);
    let out;
    try { out = await getText(`https://gamebanana.com/apiv11/Util/Search/Results?_sSearchString=${q}&_nPage=1&_nPerpage=15&_sModelName=Mod`); } catch { return { ok: false, candidates: [] }; }
    if (!out.res.ok) return { ok: false, candidates: [] };
    const c = [];
    for (const r of JSON.parse(out.text)._aRecords || []) {
      if (!namesGame(game.name, r._aGame?._sName || '')) continue;
      const text = `${r._sName} ${r._sDescription || ''}`;
      if (!coopText(text)) continue;
      c.push({ name: r._sName.slice(0, 120), url: r._sProfileUrl, source: 'gamebanana', kind: 'mod-page', score: 6, summary: (r._sDescription || '').replace(/\s+/g, ' ').slice(0, 200) });
    }
    return { ok: true, candidates: c };
  },
};

let nexusGames = null;
async function nexusIndex() {
  if (nexusGames) return nexusGames;
  const cacheFile = join(CACHE, 'nexus-games.json');
  if (existsSync(cacheFile) && Date.now() - JSON.parse(readFileSync(cacheFile, 'utf8')).at < 7 * 864e5) return (nexusGames = new Map(JSON.parse(readFileSync(cacheFile, 'utf8')).list));
  const list = [];
  for (let offset = 0; ;) {
    await polite('nexus');
    const j = JSON.parse((await getText('https://api.nexusmods.com/v2/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: `{ games(count:500, offset:${offset}){ totalCount nodes{ domainName name } } }` }) })).text);
    const page = j.data?.games?.nodes || [];
    for (const g of page) list.push([fold(g.name), g.domainName]);
    offset += page.length;
    if (!page.length || offset >= (j.data.games.totalCount || 0)) break;
  }
  writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), list }));
  log(`nexus: ${list.length} games indexed`);
  return (nexusGames = new Map(list));
}

// IGDB: official co-op, all games in a few queries.
async function igdbOfficial(games) {
  const env = Object.fromEntries(readFileSync(join(here, '../../discord-bot/.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const tok = await (await fetch(`https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' })).json();
  const headers = { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` };
  const out = {};
  const ids = games.filter((g) => g.igdb_id).map((g) => g.igdb_id);
  for (let i = 0; i < ids.length; i += 500) {
    const res = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers,
      body: `fields game_modes,multiplayer_modes.campaigncoop,multiplayer_modes.offlinecoop,multiplayer_modes.onlinecoop,multiplayer_modes.lancoop; where id = (${ids.slice(i, i + 500).join(',')}); limit 500;` });
    if (!res.ok) throw new Error(`igdb ${res.status}`);
    for (const g of await res.json()) {
      const mm = g.multiplayer_modes || [];
      const flags = { campaign: mm.some((m) => m.campaigncoop), local: mm.some((m) => m.offlinecoop), online: mm.some((m) => m.onlinecoop), lan: mm.some((m) => m.lancoop) };
      out[g.id] = { coop: (g.game_modes || []).includes(3) || Object.values(flags).some(Boolean), ...flags };
    }
    await sleep(300);
  }
  return out;
}

// ── running ─────────────────────────────────────────────────────
const load = (name) => { const f = join(CACHE, `${name}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; };
const save = (name, data) => writeFileSync(join(CACHE, `${name}.json`), JSON.stringify(data));

async function runSource(name, games, results) {
  const cache = results[name];
  let n = 0;
  for (const g of games) {
    const key = g.igdb_id || g.name;
    if (cache[key] && cache[key].ok) continue;
    let r;
    try { r = await sources[name](g); } catch (e) { r = { ok: false, candidates: [], error: String(e.message || e) }; log(`${name}: "${g.name}" failed: ${r.error}`); }
    if (r.fatal) { log(`${name}: stopping (it cannot continue)`); break; }
    cache[key] = { ...r, at: new Date().toISOString().slice(0, 10) };
    if (++n % 20 === 0) { if (!adhoc.length) save(name, cache); log(`${name}: ${n} games this run (${Object.keys(cache).length} in cache)`); }
  }
  if (!adhoc.length) save(name, cache);
  log(`${name}: done`);
}

// Combine every source's candidates and the official flags into one result per game (the results/*.json shape).
export function combine(game, per, official) {
  const all = [];
  const searched = [];
  let failed = false;
  for (const [name, r] of Object.entries(per)) {
    if (!r) continue;
    if (name !== 'igdb') { searched.push(name === 'web' ? (LABEL[r.provider] || 'Web search') : name === 'github' ? 'GitHub repository search' : name === 'nexus' ? (r.note ? 'Nexus Mods (game not on Nexus)' : 'Nexus Mods search') : 'GameBanana search'); }
    if (!r.ok) failed = true;
    for (const c of r.candidates || []) all.push(c);
  }
  // One entry per URL, the best score; strong kinds first.
  const byUrl = new Map();
  for (const c of all) { const p = byUrl.get(c.url); if (!p || c.score > p.score) byUrl.set(c.url, c); }
  const list = [...byUrl.values()].sort((a, b) => (STRONG.has(b.kind) - STRONG.has(a.kind)) || b.score - a.score);
  const strong = list.filter((c) => STRONG.has(c.kind));
  const weak = list.filter((c) => !STRONG.has(c.kind));
  const projects = [...strong.slice(0, 4), ...weak.slice(0, 2)].map((c) => {
    const days = c.pushed ? (Date.now() - Date.parse(c.pushed)) / 864e5 : c.updated ? (Date.now() - Date.parse(c.updated)) / 864e5 : null;
    const stage = c.archived ? 'abandoned' : days == null ? undefined : days > 730 ? 'abandoned' : 'development';
    return { name: c.name, url: c.url, ...(stage ? { stage } : {}), summary: c.summary || '', kind: c.kind, via: c.source };
  });
  let status;
  if (official?.coop) status = 'official_coop';
  else if (strong.length || weak.length >= 2) status = 'mod_found';
  else if (failed || !searched.length) status = 'unsure';
  else status = 'none_found';
  if (status === 'unsure' && weak.length) status = 'unsure';
  return { igdb_id: game.igdb_id, name: game.name, status, projects, official: official || undefined, auto: true, searched, sources: projects.map((p) => p.url), checked: new Date().toISOString().slice(0, 10) };
}

function mergeAll(games) {
  const per = Object.fromEntries(ALL_SOURCES.map((s) => [s, load(s)]));
  const out = [];
  for (const g of games) {
    const key = g.igdb_id;
    const sub = {};
    for (const s of ['web', 'github', 'nexus', 'gamebanana']) sub[s] = per[s][key];
    if (!Object.values(sub).some(Boolean) && !per.igdb[key]) continue;
    out.push(combine(g, sub, per.igdb[key]));
  }
  return out;
}

async function main() {
  let games;
  if (adhoc.length) games = adhoc.map((name) => ({ igdb_id: 0, name }));
  else games = JSON.parse(readFileSync(join(SEED, 'games.json'), 'utf8')).slice(0, limit);
  log(`${games.length} games, sources: ${wanted.join(', ')}`);

  if (flag('merge-only')) {
    const merged = mergeAll(games);
    writeFileSync(join(SEED, 'results-crawl', 'crawl.json'), JSON.stringify(merged, null, 1));
    const c = {}; merged.forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; });
    log('merged', merged.length, c);
    return;
  }

  const results = Object.fromEntries(ALL_SOURCES.map((s) => [s, adhoc.length ? {} : load(s)]));
  if (wanted.includes('igdb') && !adhoc.length) {
    const have = results.igdb;
    if (games.some((g) => !have[g.igdb_id])) {
      Object.assign(have, await igdbOfficial(games));
      save('igdb', have);
      log(`igdb: ${Object.keys(have).length} games with official co-op flags`);
    }
  }
  await Promise.all(wanted.filter((s) => s !== 'igdb').map((s) => runSource(s, games, results)));

  if (adhoc.length) {
    for (const g of games) {
      const per = Object.fromEntries(['web', 'github', 'nexus', 'gamebanana'].map((s) => [s, results[s][g.name]]));
      console.log(JSON.stringify(combine(g, per, null), null, 1));
    }
    return;
  }
  const merged = mergeAll(games);
  writeFileSync(join(SEED, 'results-crawl', 'crawl.json'), JSON.stringify(merged, null, 1));
  const c = {}; merged.forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; });
  log('merged', merged.length, c);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
