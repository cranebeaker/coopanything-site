(() => {
  'use strict';

  const DATA = Array.isArray(window.RECOMPS) ? window.RECOMPS : [];
  const META = window.RECOMPHAVEN_META || {};
  const DAY = 864e5;

  // ── Reference tables ─────────────────────────────────────

  // Labels, colours and icons come from data/tables.js, shared with tools/build_pages.py.
  const TABLES = window.RECOMPHAVEN_TABLES;
  const CONSOLES = TABLES.consoles;
  const STAGES = TABLES.stages;
  const STAGE_ORDER = Object.keys(STAGES);
  const TIERS = TABLES.tiers;
  const TIER_ORDER = Object.keys(TIERS);
  const FEATURES = TABLES.features;
  // "Must have" chips: each matches any of its feature tags.
  const FEATURE_FILTERS = {
    story: { label: 'Story co-op', tags: ['story'], title: 'Play the campaign together: quests, cutscenes or mission progress are shared' },
    enemies: { label: 'Synced enemies', tags: ['enemies'], title: 'Both players fight the same enemies' },
    world: { label: 'Shared world', tags: ['world'], title: 'Doors, pickups and world changes are the same for everyone' },
    easy: { label: 'Easy join', tags: ['easy-join'], title: 'Join through Steam or a hosted relay: no port forwarding or VPN' },
    open: { label: 'Open source', tags: ['open-source'] },
    tested: { label: 'Tested', tags: ['auto-tested', 'player-reports'], title: 'Covered by automated tests, or players report playing it' },
    adopt: { label: 'Up for adoption', tags: ['adopt'], title: 'The author stopped and wants someone to take it over' },
  };
  // What each project shares between players (the directory's coop_scope), in display order.
  const SCOPE = [['players_visible', 'See each other'], ['story', 'Story'], ['enemies', 'Enemies'], ['world_state', 'World'], ['items', 'Items']];
  // Lucide icons (https://lucide.dev, ISC licence) for the site's own UI; no emojis.
  const LUCIDE = {
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
    heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };
  const icon = (name, size = 16) => `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name]}</svg>`;
  const SCOPE_WORD = { yes: 'Synced', shared: 'Shared', 'per-player': 'Per player', partial: 'Partly', no: 'Not synced', unknown: 'Unknown' };
  // Systems a recomp runs on: Windows, Linux, macOS, Android (the "platforms" field). Logos from
  // Simple Icons (CC0); the 24x24 paths are filled with currentColor.
  const OS = TABLES.os;
  const OS_ORDER = Object.keys(OS);
  const PLATFORM_SOURCE = TABLES.platformSource;

  // Trending ranks by people who opened each project here in the last 3 days (visitsWeek, from
  // tools/track_visits.py). Until there are any, it uses GitHub stars gained this week
  // (starsWeek, from tools/track_stars.py).
  let byVisits = DATA.some((e) => e.visitsWeek > 0);
  const trendOf = (e) => (byVisits ? e.visitsWeek : e.starsWeek);

  const SORTS = {
    quality: { label: 'Quality', dir: 'asc', get: (e) => TIER_ORDER.indexOf(e.quality), dirs: ['Best first', 'Worst first'] },
    coop: { label: 'Co-op %', dir: 'desc', get: (e) => pctOf(e), dirs: ['Lowest first', 'Highest first'] },
    updated: { label: 'Last activity', dir: 'desc', get: (e) => e.updated, dirs: ['Oldest first', 'Newest first'] },
    release: { label: 'Latest release', dir: 'desc', get: (e) => e.versionDate, dirs: ['Oldest first', 'Newest first'] },
    started: { label: 'Project start', dir: 'desc', get: (e) => e.started, dirs: ['Oldest first', 'Newest first'] },
    stars: { label: 'GitHub stars', dir: 'desc', get: (e) => e.stars, dirs: ['Fewest first', 'Most first'] },
    score: { label: 'Rating', dir: 'desc', get: (e) => e.userScore, dirs: ['Lowest first', 'Highest first'] },
    trending: { label: 'Trending', dir: 'desc', get: (e) => trendOf(e), dirs: ['Fewest first', 'Most first'] },
    title: { label: 'Name', dir: 'asc', get: (e) => e.title, dirs: ['A to Z', 'Z to A'] },
    year: { label: 'Game release', dir: 'asc', get: (e) => e.year, dirs: ['Oldest first', 'Newest first'] },
    console: { label: 'Kind', dir: 'asc', get: (e) => consoleOf(e).label, dirs: ['A to Z', 'Z to A'] },
    genre: { label: 'Engine', dir: 'asc', get: (e) => e.genre, dirs: ['A to Z', 'Z to A'] },
    stage: { label: 'Stage', dir: 'asc', get: (e) => STAGE_ORDER.indexOf(e.stage), dirs: ['Playable first', 'Wanted first'] },
    toolchain: { label: 'How you connect', dir: 'asc', get: (e) => e.toolchain, dirs: ['A to Z', 'Z to A'] },
  };

  // The feedback issue form (.github/ISSUE_TEMPLATE/feedback.yml). "Suggest a correction"
  // opens it with the game and project filled in.
  const FEEDBACK_URL = 'https://github.com/cranebeaker/coop-anything/issues/new?labels=correction';
  const PENCIL = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>';

  // User scores: the average of everyone's latest "N/10" in a project's comments on its game page
  // (tools/track_ratings.py, nightly). Comments exist once giscus is set up; the build marks that
  // with <meta name="rh-comments">.
  const COMMENTS_ON = !!document.querySelector('meta[name="rh-comments"]');
  const scoreText = (e) => e.userScore.toFixed(1);
  const ratingsText = (e) => `${e.userScoreCount} ${e.userScoreCount === 1 ? 'rating' : 'ratings'}`;
  // Rating trend (tools/track_ratings.py): the average score since the latest release minus the
  // one before it, there once five or more people have rated on each side. long adds "since vX".
  const trendTag = (e, long) => {
    if (e.scoreTrend == null) return '';
    const t = e.scoreTrend;
    const dir = t > 0 ? 'up' : t < 0 ? 'down' : 'flat';
    const text = `${t > 0 ? '▲ +' : t < 0 ? '▼ −' : '= '}${Math.abs(t).toFixed(1)}`;
    const since = esc(e.scoreTrendSince || 'the latest release');
    return `<span class="trend trend--${dir}" title="Average score since ${since} compared with before it">${text}${long ? ` since ${since}` : ''}</span>`;
  };

  // Email: the Sunday newsletter and per-project update alerts, run by a Cloudflare Worker
  // (newsletter/worker.js). The build puts its address in <meta name="rh-mail"> once it's set
  // up; until then the sign-up forms stay hidden. game.js does the same on game pages.
  const MAIL_API = ((document.querySelector('meta[name="rh-mail"]') || {}).content || '').replace(/\/+$/, '');
  const BELL = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const followForm = (formId, e) => `
      <form class="mail-form mail-form--follow" id="${formId}" data-mail-form data-recomp="${esc(e.id)}" hidden>
        <p class="mail-form__lead">Email me as soon as ${esc(e.project || e.title)} puts out a new release.</p>
        <div class="mail-form__row">
          <input type="email" name="email" required autocomplete="email" placeholder="you@example.com" aria-label="Your email address">
          <button class="btn" type="submit">Follow</button>
        </div>
        <label class="mail-form__check"><input type="checkbox" name="weekly"> Also send me the Sunday newsletter</label>
        <input class="mail-form__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="mail-form__status" role="status"></p>
      </form>`;

  async function submitMail(form) {
    const status = form.querySelector('.mail-form__status');
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const body = { email, website: String(data.get('website') || ''), weekly: !form.dataset.recomp || data.get('weekly') === 'on' };
    if (form.dataset.recomp) body.recomp = form.dataset.recomp;
    button.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Sending…';
    try {
      const res = await fetch(`${MAIL_API}/subscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      const ok = res.ok && out.ok !== false;
      status.dataset.state = ok ? 'ok' : 'error';
      status.textContent = out.message || (ok ? `Almost done: check ${email} for a link to confirm.` : 'Something went wrong. Please try again later.');
      if (ok) store.set('rh-mail-email', email);
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Couldn’t reach the sign-up service. Check your connection and try again.';
    } finally {
      button.disabled = false;
    }
  }

  if (MAIL_API) {
    document.addEventListener('submit', (ev) => {
      const form = ev.target.closest('form[data-mail-form]');
      if (!form) return;
      ev.preventDefault();
      submitMail(form);
    });
    // "Get update emails" opens its form, with the address used last time filled in.
    document.addEventListener('click', (ev) => {
      const toggle = ev.target.closest('[data-follow-toggle]');
      const form = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
      if (!form) return;
      form.hidden = !form.hidden;
      toggle.setAttribute('aria-expanded', String(!form.hidden));
      if (form.hidden) return;
      const input = form.querySelector('input[type="email"]');
      if (!input.value) input.value = store.get('rh-mail-email') || '';
      input.focus();
    });
  }

  // Featured playthrough: a YouTube video picked for a project ("playthrough" in the data). It
  // shows as a thumbnail; YouTube's player (its privacy-enhanced, no-cookie one) loads only when
  // someone presses play. game.js does the same on game pages.
  const youtubeId = (url) => (String(url || '').match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/) || [])[1];
  const PLAY_ICON = '<svg viewBox="0 0 68 48" width="68" height="48" aria-hidden="true"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3s-21.2 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3Z" fill="#e00"/><path d="M45 24 27 14v20z" fill="#fff"/></svg>';
  function videoHtml(e) {
    const id = youtubeId(e.playthrough);
    if (!id) return '';
    return `<figure class="video">
        <button type="button" class="video__play" data-youtube="${id}" aria-label="Play the featured playthrough of ${esc(e.project || e.title)}">
          <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">${PLAY_ICON}
        </button>
        <figcaption><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Watch on YouTube ↗</a></figcaption>
      </figure>`;
  }
  // Pressing play swaps the thumbnail for the player.
  function playVideo(button) {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.youtube}?autoplay=1&rel=0`;
    frame.title = button.getAttribute('aria-label').replace(/^Play the /, 'The ');
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    button.replaceWith(frame);
  }
  document.addEventListener('click', (ev) => {
    const button = ev.target.closest('button[data-youtube]');
    if (button) playVideo(button);
  });

  const correctionUrl = (e) => `${FEEDBACK_URL}&${new URLSearchParams({
    title: `[CoOp:Anything] ${e.title}: ${e.project || ''}`,
    body: `About ${e.project || e.title}${e.repo || e.website ? ` (${e.repo || e.website})` : ''}, id ${e.id}:\n\n`,
  })}`;

  // Each game has a page at games/<slug>/, built by tools/build_pages.py, whose slug_of()
  // this must match. A trailing note in brackets doesn't count unless it's a year, so
  // "Daytona USA (Arcade)" and "Daytona USA (XBLA)" share daytona-usa.
  const slugOf = (title) => title.replace(/\s*\((?!\d{4}\))[^)]*\)\s*$/, '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .toLowerCase().replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const SLUG = new Map(DATA.map((e) => [e.id, slugOf(e.title)]));
  const PROJECTS_PER_GAME = new Map();
  const GAME_COUNT = new Set(DATA.filter((e) => e.genre !== 'Multi-game tool').map((e) => slugOf(e.title))).size;
  SLUG.forEach((s) => PROJECTS_PER_GAME.set(s, (PROJECTS_PER_GAME.get(s) || 0) + 1));

  // Visits for Trending: one hit per project when its details open or someone follows its
  // repository or website link. The Worker (worker/index.js) counts each visitor once a day per
  // project, without cookies, and /api/stats returns the last 3 days as visitsWeek.
  const API = '/api';
  const counted = new Set();
  function countVisit(e) {
    if (counted.has(e.id) || !API_ON) return;
    counted.add(e.id);
    try { navigator.sendBeacon(`${API}/hit`, JSON.stringify({ id: e.id })); } catch { /* no beacon */ }
  }

  // Community votes (worker/index.js, D1): per project, how much of the game worked in co-op
  // (0 to 100), a rating out of 10, and how a session went. Merged into the data once loaded.
  const PCT_MIN_VOTES = 3;
  const OUTCOMES = {
    finished: 'Finished it together',
    mostly: 'Played a lot, some bugs',
    broke: 'Broke after a while',
    'no-start': 'Couldn\u2019t get it running',
  };
  let API_ON = false;
  const pctOf = (e) => (e.votePctN >= PCT_MIN_VOTES ? e.votePct : e.coopPct);
  const pctIsVoted = (e) => e.votePctN >= PCT_MIN_VOTES;
  function pctBar(e) {
    if (e.stage === 'wanted') return '<span class="muted small">None yet</span>';
    const p = pctOf(e);
    if (p == null) return '<span class="muted">-</span>';
    const how = pctIsVoted(e) ? `the average of ${e.votePctN} players' votes` : 'an estimate from what the project syncs; players\u2019 votes replace it';
    return `<span class="pct" style="--p:${p}" title="${p}% of the game playable together: ${how}">`
      + `<span class="pct__track"><span class="pct__fill"></span></span><span class="pct__n mono">${p}%</span>${pctIsVoted(e) ? '<span class="pct__voted" title="From players\u2019 votes">\u2713</span>' : ''}</span>`;
  }
  function applyStats(stats) {
    for (const e of DATA) {
      const s = stats[e.id] || {};
      e.userScore = s.scoreN ? s.score : null;
      e.userScoreCount = s.scoreN || 0;
      e.votePct = s.pctN ? s.pct : null;
      e.votePctN = s.pctN || 0;
      e.outcomes = s.outcomes || null;
      e.votes = s.n || 0;
      e.visitsWeek = s.visits || 0;
    }
  }
  // What a mod's own devs set from Discord with /listing (worker/index.js): their Discord topic, the
  // stage, the latest version and a short note. It goes on top of the directory data.
  const DISCORD_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/></svg>';
  let LISTINGS = {};
  function applyListings(listings) {
    LISTINGS = listings;
    for (const e of DATA) {
      const l = listings[e.id];
      if (!l) continue;
      if (l.discord) e.discord = l.discord;
      if (l.stage && STAGES[l.stage]) e.stage = l.stage;
      if (l.version && (!e.versionDate || (l.versionDate || '') >= e.versionDate)) { e.version = l.version; e.versionDate = l.versionDate; }
      if (l.note) { e.devNote = l.note; e.devNoteDate = l.noteDate; }
      if (l.summary) e.devSummary = l.summary;
      if (l.video) e.devVideo = l.video;
      if (l.website) e.website = l.website;
      if (l.download) e.download = l.download;
      if (l.players) e.players = l.players;
      if (l.cover) e.cover = l.cover;
      if (l.quality && TIERS[l.quality]) { e.quality = l.quality; e.devRated = true; }
      if (l.coopPct != null) { e.coopPct = l.coopPct; e.devPct = true; }
      if (l.engine) e.engine = l.engine;
      if (l.connect) e.toolchain = l.connect;
      if (l.sync) {
        const map = { story: 'story', enemies: 'enemies', world: 'world_state', items: 'items' };
        e.scope = { ...(e.scope || {}) };
        for (const [k, v] of Object.entries(l.sync)) if (map[k]) e.scope[map[k]] = v;
      }
    }
  }
  // After the devs save in the editor: reload the numbers and listings, then reopen the details.
  window.addEventListener('coop:account', () => { if (dialog.open && currentId) openDetail(currentId, { push: false }); });
  async function loadStats() {
    try {
      const res = await fetch(`${API}/stats`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const out = await res.json();
      API_ON = true;
      applyStats(out.stats || {});
      applyListings(out.listings || {});
      refreshTrending();
      render();
      if (dialog.open && currentId) openDetail(currentId, { push: false });
    } catch { /* static hosting or offline: estimates only */ }
  }

  const DEFAULTS = { q: '', console: '', genre: '', quality: '', toolchain: '', os: '', sort: 'quality', dir: 'asc' };

  const state = {
    ...DEFAULTS,
    stages: new Set(),
    features: new Set(),
    ca: false,
    view: 'table',
  };

  // ── Helpers ──────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const consoleOf = (e) => CONSOLES[e.console] || { label: e.console, short: String(e.console).toUpperCase(), color: '#555' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  const today = Date.now();
  const daysSince = (d) => (d ? Math.max(0, Math.floor((today - Date.parse(d + 'T00:00:00Z')) / DAY)) : null);

  function activity(e) {
    const n = daysSince(e.updated);
    if (n == null) return 'unknown';
    if (n <= 60) return 'active';
    if (n <= 180) return 'quiet';
    return 'stalled';
  }

  function relTime(d) {
    const n = daysSince(d);
    if (n == null) return 'Unknown';
    if (n === 0) return 'Today';
    if (n === 1) return 'Yesterday';
    if (n < 45) return `${n} days ago`;
    if (n < 365) return `${Math.round(n / 30.4)} months ago`;
    const y = n / 365;
    return y < 1.5 ? '1 year ago' : `${Math.round(y)} years ago`;
  }

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00Z');
    return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const fmtStars = (n) => (n == null ? '-' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
  const gainTag = (e) => (e.starsWeek > 0
    ? `<span class="gain" title="${e.starsWeek.toLocaleString('en')} new GitHub stars in the last 7 days">+${fmtStars(e.starsWeek)}</span>` : '');

  const ctag = (e) => {
    const c = consoleOf(e);
    return `<span class="ctag" style="--c:${c.color}" title="${esc(c.label)}">${esc(c.short)}</span>`;
  };
  const stagePill = (e) => `<span class="stage" data-stage="${e.stage}">${esc(STAGES[e.stage]?.label || e.stage)}</span>`;
  const tierTile = (e) => `<span class="tier" data-tier="${e.quality}" title="${esc(e.quality + ': ' + (TIERS[e.quality]?.label || ''))}">${e.quality}</span>`;
  const aiTag = (e) => (e.coopAnything ? '<span class="ca-badge" title="Made with Co-op Anything">Co-op Anything</span>' : '')
;
  const osIcon = (k) => `<svg class="os-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${OS[k].path}"/></svg>`;

  // Table: only the systems it runs on, in the filter's order. A faded logo for the others
  // read as "runs here too".
  function osSlots(e) {
    if (!e.platforms) return '<span class="muted small" title="Not stated by the project">-</span>';
    const names = e.platforms.map((k) => OS[k].label).join(', ');
    return `<span class="os-set" title="Runs on ${esc(names)}" aria-label="Runs on ${esc(names)}">${OS_ORDER
      .filter((k) => e.platforms.includes(k)).map(osIcon).join('')}</span>`;
  }

  // Cards: only the supported logos.
  function osInline(e) {
    if (!e.platforms) return '';
    const names = e.platforms.map((k) => OS[k].label).join(', ');
    return `<span class="os-set os-set--inline" title="Runs on ${esc(names)}" aria-label="Runs on ${esc(names)}">${e.platforms.map(osIcon).join('')}</span>`;
  }

  const actTag = (e) => `<span class="act act--${activity(e)}" title="${e.updated ? 'Last push ' + esc(fmtDate(e.updated)) : 'No activity data'}">${esc(relTime(e.updated))}</span>`;

  const STOPWORDS = new Set(['the', 'of', 'and', 'a', 'an', 'to', 'in']);
  function initials(title) {
    const words = title.replace(/\s*\([^)]*\)\s*$/, '').split(/[^A-Za-z0-9]+/).filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
    return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  // Box art, or the console's colour with the game's initials when there is none.
  // size: sm (table), md (cards), lg (detail panel).
  function coverTile(e, size) {
    const attrs = `class="cover cover--${size}${e.cover ? '' : ' cover--none'}" style="--c:${consoleOf(e).color}" data-initials="${esc(initials(e.title))}"`;
    return e.cover
      ? `<span ${attrs}><img src="${esc(e.cover)}" alt="" loading="lazy" decoding="async"></span>`
      : `<span ${attrs} aria-hidden="true">${esc(initials(e.title))}</span>`;
  }

  // The detail panel shows the whole box at its own shape; no cover keeps the square tile.
  function fullCover(e) {
    if (!e.cover) return coverTile(e, 'lg');
    return `<figure class="d-cover" style="--c:${consoleOf(e).color}" data-initials="${esc(initials(e.title))}">
      <img src="${esc(e.cover)}" alt="Box art for ${esc(e.title)}" decoding="async"></figure>`;
  }

  function subline(e) {
    const bits = [e.project, e.team && e.team !== e.project ? e.team : null].filter(Boolean);
    return `${esc(bits.join(' · '))}${aiTag(e)}`;
  }

  // ── Filtering & sorting ──────────────────────────────────

  // Search forgives typos. Accents, case and punctuation don't count ("pokemon" finds Pokémon,
  // "pt" finds P.T.), and spaces may be left out ("supermario"). A typed word matches the start of
  // a word (four letters or more may match inside one too). A typed word that matches nothing that
  // way matches the closest words in game and project names instead, one letter off in a short
  // word and two in a longer one, so "legnd of zlda" finds the Zelda games.
  const fold = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const haystack = new Map(DATA.map((e) => {
    const text = fold([
      e.title, e.project, e.team, e.toolchain, e.genre, e.engine, e.developer, consoleOf(e).label, consoleOf(e).short, e.year,
      ...(e.features || []).map((f) => FEATURES[f]),
    ].filter(Boolean).join(' '));
    const seq = text.split(' ');
    const names = [...new Set(fold(`${e.title} ${e.project || ''}`).split(' '))].filter((w) => w.length >= 4);
    return [e.id, { text, seq, names }];
  }));
  const HAY = [...haystack.values()];

  function hasTerm(h, t) {
    if (t.length >= 4 && h.text.includes(t)) return true;
    // From the start of a word, running on into the next words when spaces were left out.
    for (let i = 0; i < h.seq.length; i++) {
      let run = '';
      for (let j = i; j < h.seq.length && run.length < t.length; j++) {
        run += h.seq[j];
        if (!(run.startsWith(t) || t.startsWith(run))) break;
        if (run.startsWith(t)) return true;
      }
    }
    return false;
  }
  const NAME_WORDS = [...new Set(HAY.flatMap((h) => h.names))];

  // Edit distance with swapped neighbours counting as one edit, giving up past max.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let before = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (before && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1);
        cur[j] = d;
        best = Math.min(best, d);
      }
      if (best > max) return max + 1;
      before = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  // A word is close to what was typed if it's within the typo allowance: one letter for three to
  // five typed letters, two for more. From five letters, the start of a longer word counts too,
  // for a word still being typed. One or two typed letters must match exactly.
  function isNear(typed, word) {
    const max = typed.length <= 2 ? 0 : typed.length <= 5 ? 1 : 2;
    if (!max) return false;
    const forms = typed.length >= 5 ? [word, word.slice(0, typed.length), word.slice(0, typed.length + 1)] : [word];
    return forms.some((w) => w.length >= typed.length - max && editDistance(typed, w, max) <= max);
  }

  // The typed words, each with the set of close words it stands for when it matches nothing as
  // typed. Worked out once per search, not once per row.
  let searchCache = { q: null, terms: [] };
  function searchTerms() {
    if (searchCache.q !== state.q) {
      const terms = fold(state.q).split(' ').filter(Boolean).map((t) => {
        const found = HAY.some((h) => hasTerm(h, t));
        return { t, near: found ? null : new Set(NAME_WORDS.filter((w) => isNear(t, w))) };
      });
      searchCache = { q: state.q, terms };
    }
    return searchCache.terms;
  }

  function matches(e, ignoreStage) {
    if (state.q) {
      const h = haystack.get(e.id);
      for (const { t, near } of searchTerms()) {
        if (near ? !h.names.some((w) => near.has(w)) : !hasTerm(h, t)) return false;
      }
    }
    if (state.console && e.console !== state.console) return false;
    if (state.genre && e.genre !== state.genre) return false;
    if (state.quality && e.quality !== state.quality) return false;
    if (state.toolchain && e.toolchain !== state.toolchain) return false;
    if (state.os && !(e.platforms || []).includes(state.os)) return false;
    if (!ignoreStage && state.stages.size && !state.stages.has(e.stage)) return false;
    for (const f of state.features) if (!FEATURE_FILTERS[f].tags.some((t) => (e.features || []).includes(t))) return false;
    if (state.ca && !e.coopAnything) return false;
    return true;
  }

  function sortList(list) {
    const s = SORTS[state.sort] || SORTS.quality;
    const m = state.dir === 'desc' ? -1 : 1;
    return list.slice().sort((a, b) => {
      const va = s.get(a);
      const vb = s.get(b);
      const na = va == null || va === '' || va === -1;
      const nb = vb == null || vb === '' || vb === -1;
      if (na !== nb) return na ? 1 : -1;
      if (!na && va !== vb) {
        const c = typeof va === 'string' ? va.localeCompare(vb, 'en', { sensitivity: 'base' }) : va - vb;
        if (c) return c * m;
      }
      return (pctOf(b) || 0) - (pctOf(a) || 0) || (b.stars || 0) - (a.stars || 0) || a.title.localeCompare(b.title, 'en');
    });
  }

  const isFiltered = () =>
    !!(state.q || state.console || state.genre || state.quality || state.toolchain || state.os ||
      state.stages.size || state.features.size || state.ca);

  // ── Rendering ────────────────────────────────────────────

  function renderStageTiles() {
    const base = DATA.filter((e) => matches(e, true));
    const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0]));
    base.forEach((e) => { counts[e.stage] = (counts[e.stage] || 0) + 1; });
    $('#stage-tiles').innerHTML = STAGE_ORDER.map((s) => `
      <button type="button" class="stage-tile" data-stage="${s}" aria-pressed="${state.stages.has(s)}">
        <span class="stage-tile__n">${counts[s]}</span>
        <span class="stage-tile__dot" aria-hidden="true"></span>
        <span class="stage-tile__label">${STAGES[s].label}</span>
        <span class="stage-tile__blurb">${STAGES[s].blurb}</span>
      </button>`).join('');
  }

  function renderTable(list) {
    $('#rows').innerHTML = list.map((e) => `
      <tr data-id="${esc(e.id)}">
        <td><div class="game-cell">${coverTile(e, 'sm')}<div class="game">
          <button type="button" class="game__title" data-open="${esc(e.id)}">${esc(e.title)}</button>
          <span class="game__sub">${subline(e)}</span>
        </div></div></td>
        <td>${ctag(e)}</td>
        <td class="col-coop">${pctBar(e)}</td>
        <td class="col-genre"><div class="stack"><span class="trunc" title="${esc(e.engine || e.genre)}">${esc(e.genre)}</span><span class="small muted">${e.year || ''}</span></div></td>
        <td>${stagePill(e)}</td>
        <td>${tierTile(e)}</td>
        <td class="col-release">${e.version || e.versionDate
          ? `<div class="stack"><span class="mono trunc" title="${esc(e.version || 'Release')}">${esc(e.version || 'Release')}</span><span class="small muted">${esc(fmtDate(e.versionDate))}</span></div>`
          : '<span class="muted">No release</span>'}</td>
        <td class="small col-activity">${actTag(e)}</td>
        <td class="num col-score">${e.userScore != null
          ? `<div class="stack"><span class="mono score">${scoreText(e)}</span><span class="small muted">${ratingsText(e)}</span>${trendTag(e)}</div>`
          : '<span class="muted">-</span>'}</td>
        <td class="num"><div class="stack"><span class="mono">${fmtStars(e.stars)}</span>${gainTag(e)}</div></td>
      </tr>`).join('');

    document.querySelectorAll('.grid th[data-sort]').forEach((th) => {
      if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  function renderCards(list) {
    $('#card-view').innerHTML = list.map((e) => `
      <article class="card" data-id="${esc(e.id)}">
        <div class="card__top">
          <div class="card__meta">${ctag(e)}<span class="trunc">${esc(e.genre)}</span>${e.year ? `<span>${e.year}</span>` : ''}</div>
          ${tierTile(e)}
        </div>
        <div class="card__main">${coverTile(e, 'md')}<div class="game">
          <button type="button" class="game__title" data-open="${esc(e.id)}">${esc(e.title)}</button>
          <span class="game__sub">${subline(e)}</span>
        </div></div>
        <div class="card__pct">${pctBar(e)}</div>
        ${(e.features || []).length ? `<div class="feats">${e.features.map((f) => `<span class="feat">${esc(FEATURES[f] || f)}</span>`).join('')}</div>` : ''}
        <div class="card__foot">
          ${stagePill(e)}
          <span class="muted">${actTag(e)}${e.userScore != null ? `<span class="mono" title="User score, from ${ratingsText(e)}">${scoreText(e)}/10</span>` : ''}<span class="mono" title="GitHub stars">${icon('star', 12)} ${fmtStars(e.stars)} ${gainTag(e)}</span></span>
        </div>
      </article>`).join('');
  }

  function render() {
    const list = sortList(DATA.filter((e) => matches(e)));
    renderStageTiles();

    const total = DATA.length;
    const guessed = state.q ? searchTerms().filter((x) => x.near && x.near.size).map((x) => x.t) : [];
    $('#count').innerHTML = (list.length === total
      ? `<strong>${total}</strong> co-op projects across <strong>${GAME_COUNT}</strong> games`
      : `Showing <strong>${list.length}</strong> of ${total} co-op projects`)
      + (guessed.length && list.length
        ? ` <span class="count__guess">· close matches for ${guessed.map((t) => `“${esc(t)}”`).join(', ')}</span>` : '');

    $('#reset').disabled = !isFiltered();
    $('#empty').hidden = list.length > 0;
    $('#table-view').hidden = state.view !== 'table' || !list.length;
    $('#card-view').hidden = state.view !== 'cards' || !list.length;
    document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));

    if (state.view === 'table') renderTable(list); else renderCards(list);

    const s = SORTS[state.sort];
    $('#sort').value = state.sort;
    $('#sort-dir').textContent = s.dirs[state.dir === 'asc' ? 0 : 1];
    $('#sort-dir').setAttribute('aria-label', `Sort direction: ${s.dirs[state.dir === 'asc' ? 0 : 1]}. Click to reverse.`);

    for (const [id, key] of [['#f-console', 'console'], ['#f-genre', 'genre'], ['#f-quality', 'quality'], ['#f-toolchain', 'toolchain']]) {
      const el = $(id);
      el.value = state[key];
      el.classList.toggle('is-set', !!state[key]);
    }
    $('#ca-toggle').setAttribute('aria-pressed', String(state.ca));
    document.querySelectorAll('#os-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.os === state.os)));
    document.querySelectorAll('#feature-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(state.features.has(c.dataset.feature))));

    writeURL();
  }

  // ── Static UI ────────────────────────────────────────────

  function countBy(key) {
    const m = new Map();
    DATA.forEach((e) => m.set(e[key], (m.get(e[key]) || 0) + 1));
    return m;
  }

  function fillSelect(el, allLabel, entries) {
    el.innerHTML = `<option value="">${allLabel}</option>` +
      entries.map(([v, label, n]) => `<option value="${esc(v)}">${esc(label)} (${n})</option>`).join('');
  }

  function buildControls() {
    const consoles = countBy('console');
    fillSelect($('#f-console'), 'All kinds', [...consoles]
      .sort((a, b) => b[1] - a[1] || consoleOf({ console: a[0] }).label.localeCompare(consoleOf({ console: b[0] }).label))
      .map(([k, n]) => [k, consoleOf({ console: k }).label, n]));

    const genres = countBy('genre');
    fillSelect($('#f-genre'), 'All engines', [...genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => [k, k, n]));

    const tiers = countBy('quality');
    fillSelect($('#f-quality'), 'Any quality', TIER_ORDER.filter((t) => tiers.has(t)).map((t) => [t, `${t} · ${TIERS[t].label}`, tiers.get(t)]));

    const tools = countBy('toolchain');
    fillSelect($('#f-toolchain'), 'Any way', [...tools]
      .sort((a, b) => (a[0] === 'Unknown') - (b[0] === 'Unknown') || b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => [k, k === 'Unknown' ? 'Not stated' : k, n]));

    $('#sort').innerHTML = Object.entries(SORTS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');



    $('#tier-list').innerHTML = TIER_ORDER.map((t) => {
      const n = DATA.filter((e) => e.quality === t).length;
      return `<div class="tier-row" data-tier="${t}">
        <div class="tier-row__label">${t}</div>
        <div class="tier-row__text"><strong>${TIERS[t].label} <em>${n} ${t === 'X' ? (n === 1 ? 'game' : 'games') : n === 1 ? 'project' : 'projects'}</em></strong><span>${TIERS[t].text}</span></div>
      </div>`;
    }).join('');

    $('#stage-list').innerHTML = STAGE_ORDER.map((s) =>
      `<dt><span class="stage" data-stage="${s}">${STAGES[s].label}</span></dt><dd>${STAGES[s].long}</dd>`).join('');

    const ca = DATA.filter((e) => e.coopAnything).length;
    $('#ca-count').textContent = `${ca} ${ca === 1 ? 'mod' : 'mods'}`;

    if (META.snapshot) {
      $('#snapshot').dateTime = META.snapshot;
      $('#snapshot').textContent = fmtDate(META.snapshot);
    }
  }

  // ── What's new: latest releases and trending ─────────────

  const LATEST = DATA.filter((e) => e.versionDate)
    .sort((a, b) => b.versionDate.localeCompare(a.versionDate) || (b.stars || 0) - (a.stars || 0))
    .slice(0, 5);
  let TRENDING = [];
  function refreshTrending() {
    byVisits = DATA.some((e) => e.visitsWeek > 0);
    TRENDING = DATA.filter((e) => trendOf(e) >= (byVisits ? 1 : 2))
      .sort((a, b) => trendOf(b) - trendOf(a) || (b.stars || 0) - (a.stars || 0))
      .slice(0, 5);
    renderPulse();
  }

  // Latest releases: one chip per release in the slim strip.
  function renderPulse() {
    $('#latest-list').innerHTML = LATEST.map((e) => `<li><button type="button" class="pulse__chip" data-open="${esc(e.id)}">
      <strong>${esc(e.title)}</strong> <span class="mono">${esc(e.version || '')}</span>
      <time datetime="${esc(e.versionDate)}" title="${esc(fmtDate(e.versionDate))}">${esc(relTime(e.versionDate))}</time></button></li>`).join('');
  }

  // ── Thanks (data/credits.js) ─────────────────────────────

  const PROFILES = {
    github: (n) => [`https://github.com/${encodeURIComponent(n)}`, `@${n}`],
    reddit: (n) => [`https://www.reddit.com/user/${encodeURIComponent(n)}/`, `u/${n}`],
  };

  function renderNewsletter() {
    if (!MAIL_API) return;
    const section = $('#newsletter');
    const input = $('#nl-email');
    section.hidden = false;
    $('#newsletter-btn').hidden = false;
    if (!input.value) input.value = store.get('rh-mail-email') || '';
    // The masthead's Newsletter button scrolls down to the box and puts the cursor in it,
    // without touching the #id hash the details dialog uses.
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('a[href="#newsletter"]')) return;
      ev.preventDefault();
      goToNewsletter();
    });
  }

  // Smooth for a short way; a jump from far up a phone's long card list.
  function goToNewsletter() {
    const section = $('#newsletter');
    const far = Math.abs(section.getBoundingClientRect().top) > 4 * window.innerHeight;
    section.scrollIntoView({ behavior: far ? 'auto' : 'smooth', block: 'center' });
    $('#nl-email').focus({ preventScroll: true });
  }

  function renderThanks() {
    if (!$('.thanks')) return;
    const people = (window.RECOMPHAVEN_CREDITS || []).filter((p) => PROFILES[p.site]);
    $('.thanks').hidden = !people.length;
    $('#thanks-list').innerHTML = people.map((p) => {
      const [url, handle] = PROFILES[p.site](p.name);
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(handle)}</a>${p.for ? `<span>${esc(p.for)}</span>` : ''}</li>`;
    }).join('');
  }

  // ── Detail dialog ────────────────────────────────────────

  const dialog = $('#detail');

  let currentId = null;

  // What's shared between players, one row per part of the game.
  function scopeHtml(e) {
    if (!e.scope) return '';
    return `<ul class="scope">${SCOPE.map(([k, label]) => {
      const v = e.scope[k] || 'unknown';
      return `<li data-v="${esc(v)}"><span class="scope__dot" aria-hidden="true"></span>${label}<span class="scope__v">${SCOPE_WORD[v] || esc(v)}</span></li>`;
    }).join('')}</ul>`;
  }

  // The community box: the current numbers, then a vote form (when the Worker's API answers).
  const myVotes = () => { try { return JSON.parse(store.get('ch-votes') || '{}'); } catch { return {}; } };
  function communityHtml(e) {
    if (e.stage === 'wanted') return '';
    const outcomes = e.outcomes ? Object.entries(OUTCOMES).filter(([k]) => e.outcomes[k])
      .map(([k, label]) => `<li data-outcome="${k}"><span class="mono">${e.outcomes[k]}</span> ${label.toLowerCase()}</li>`).join('') : '';
    const pct = pctOf(e);
    const summary = `
      <div class="vote__now">
        <div><span class="vote__big mono">${pct == null ? '-' : pct + '%'}</span><span class="small muted">${pctIsVoted(e)
          ? `co-op, from ${e.votePctN} votes` : e.votePctN ? `estimate (${e.votePctN} of ${PCT_MIN_VOTES} votes so far)` : 'estimate, no votes yet'}</span></div>
        <div><span class="vote__big mono">${e.userScore != null ? scoreText(e) : '-'}</span><span class="small muted">${e.userScore != null ? `/ 10 from ${ratingsText(e)}` : 'no ratings yet'}</span></div>
      </div>
      ${outcomes ? `<ul class="vote__outcomes">${outcomes}</ul>` : ''}`;
    if (!API_ON) {
      return `<div class="d-section vote"><h3>Community check</h3>${summary}<p class="small muted">Voting opens on the live site.</p></div>`;
    }
    const mine = myVotes()[e.id] || {};
    const pctVal = mine.pct ?? (pct ?? 50);
    return `<div class="d-section vote" id="vote"><h3>Community check</h3>${summary}
      <form class="vote__form" data-vote="${esc(e.id)}">
        <label class="vote__q" for="v-pct">How much of the game could you play together? <output id="v-pct-out" class="mono">${pctVal}%</output></label>
        <input id="v-pct" name="pct" type="range" min="0" max="100" step="5" value="${pctVal}" data-touched="${mine.pct != null}">
        <fieldset class="vote__q"><legend>Your rating</legend>
          <div class="vote__scores">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
            `<label><input type="radio" name="score" value="${n}"${mine.score === n ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset class="vote__q"><legend>How did your session go?</legend>
          <div class="vote__opts">${Object.entries(OUTCOMES).map(([k, label]) =>
            `<label><input type="radio" name="outcome" value="${k}"${mine.outcome === k ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>
        </fieldset>
        <div class="vote__send">
          <button class="btn" type="submit">${mine.at ? 'Update my vote' : 'Send my vote'}</button>
          <p class="vote__status small" role="status">${mine.at ? 'You voted on this one. Sending again replaces your vote.' : 'No account needed. One vote per person; you can change it.'}</p>
        </div>
      </form>
    </div>`;
  }

  async function sendVote(form) {
    const id = form.dataset.vote;
    const status = form.querySelector('.vote__status');
    const data = new FormData(form);
    const range = form.querySelector('input[name="pct"]');
    const body = { id };
    if (range.dataset.touched === 'true') body.pct = Number(data.get('pct'));
    if (data.get('score')) body.score = Number(data.get('score'));
    if (data.get('outcome')) body.outcome = String(data.get('outcome'));
    if (Object.keys(body).length === 1) {
      status.dataset.state = 'error';
      status.textContent = 'Move the slider, pick a rating or say how it went first.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Sending...';
    try {
      const res = await fetch(`${API}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || 'Something went wrong. Please try again later.');
      const votes = myVotes();
      votes[id] = { ...votes[id], ...body, at: Date.now() };
      delete votes[id].id;
      store.set('ch-votes', JSON.stringify(votes));
      if (out.stats) applyStats({ ...Object.fromEntries(DATA.map((x) => [x.id, statsOf(x)])), [id]: out.stats });
      render();
      openDetail(id, { push: false });
      const again = $('#d-body .vote__status');
      if (again) {
        again.dataset.state = 'ok';
        again.textContent = 'Thanks! Your vote counts now.';
        $('#vote').scrollIntoView({ block: 'center' });
      }
    } catch (err) {
      status.dataset.state = 'error';
      status.textContent = err.message || 'Couldn’t reach the vote service. Try again later.';
    } finally {
      button.disabled = false;
    }
  }
  // The stats a project already has, in the shape /api/stats returns.
  const statsOf = (x) => ({ n: x.votes, score: x.userScore, scoreN: x.userScoreCount, pct: x.votePct, pctN: x.votePctN, outcomes: x.outcomes, visits: x.visitsWeek });

  document.addEventListener('input', (ev) => {
    const range = ev.target.closest('.vote__form input[name="pct"]');
    if (!range) return;
    range.dataset.touched = 'true';
    range.form.querySelector('output').textContent = `${range.value}%`;
  });
  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest('form[data-vote]');
    if (!form) return;
    ev.preventDefault();
    sendVote(form);
  });

  function sourcesHtml(e) {
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
    const urls = [...new Set([...(e.otherUrls || []), ...(e.sources || [])])].filter((u) => u !== e.repo && u !== e.website);
    if (!urls.length && !e.searched) return '';
    return `<div class="d-section"><h3>${e.stage === 'wanted' ? 'Where people looked' : 'Sources'}</h3>
      ${e.searched ? `<p class="d-note">${esc(Array.isArray(e.searched) ? e.searched.join('; ') : e.searched)}</p>` : ''}
      ${urls.length ? `<ul class="d-sources">${urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a></li>`).join('')}</ul>` : ''}
      ${e.checked ? `<p class="small muted">Last checked ${esc(fmtDate(e.checked))}.</p>` : ''}</div>`;
  }

  function openDetail(id, { push = true } = {}) {
    const e = DATA.find((x) => x.id === id);
    if (!e) return;
    currentId = id;
    const c = consoleOf(e);
    const t = TIERS[e.quality] || { label: '', text: '' };
    const fact = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
    const slug = SLUG.get(e.id);
    const siblings = PROJECTS_PER_GAME.get(slug);
    const wanted = e.stage === 'wanted';

    $('#d-body').innerHTML = `
      <button type="button" class="d-close" data-close aria-label="Close">×</button>
      <div class="d-head">
        ${fullCover(e)}
        <div class="d-head__text">
          <div class="d-head__meta">${ctag(e)}<span>${esc(c.label)}</span>${e.year ? `<span>· ${e.year}</span>` : ''}</div>
          <h2 class="d-title" id="d-title">${esc(e.title)}</h2>
          <div class="d-head__meta">${subline(e)}</div>
        </div>
      </div>
      <div class="d-verdict">
        <span class="tier" data-tier="${e.quality}">${e.quality === 'X' ? '?' : e.quality}</span>
        <div><strong>${esc(t.label)}</strong><span>${esc(t.text)}</span>${e.devRated ? '<span class="small muted d-devrated">Rated by its devs</span>' : ''}</div>
      </div>
      ${siblings > 1 ? `<a class="d-compare" href="games/${slug}/"><span>${siblings} projects cover this game.</span><strong>Which one should I play? →</strong></a>` : ''}
      ${wanted ? `<div class="d-section d-wanted"><p>Nobody has made <strong>${esc(e.title)}</strong> co-op yet, as far as anyone has found. Know a mod? <a href="https://github.com/cranebeaker/coop-anything/issues/new?template=new-coop-mod.yml" target="_blank" rel="noopener">Add it</a>. Want to build one? <a href="https://github.com/cranebeaker/coop-anything#quick-start" target="_blank" rel="noopener">Co-op Anything</a> shows your AI agent how.</p></div>` : `
      <dl class="facts">
        ${fact('Stage', stagePill(e))}
        ${fact('Co-op', pctBar(e))}
        ${fact('Engine', esc(e.engine || e.genre))}
        ${fact('How you connect', esc(e.toolchain === 'Unknown' ? 'Not stated' : e.toolchain))}
        ${fact('Players', esc(e.players || ''))}
        ${fact('Tested', esc(e.qaLabel || ''))}
        ${fact('Latest release', e.version || e.versionDate ? `<span class="mono">${esc(e.version || 'Release')}</span>${e.versionDate ? `<br><span class="small muted">${esc(fmtDate(e.versionDate))}</span>` : ''}` : '<span class="muted">No release found</span>')}
        ${fact('Last activity', `${actTag(e)}${e.updated ? `<br><span class="small muted">${esc(fmtDate(e.updated))}</span>` : ''}`)}
        ${fact('GitHub stars', e.stars != null ? `<span class="mono">${e.stars.toLocaleString('en')}</span>${
          e.starsWeek > 0 ? `<br><span class="small gain">+${e.starsWeek.toLocaleString('en')} this week</span>` : ''}` : '')}
        ${fact('Open source', e.openSource && e.openSource !== 'unknown' ? esc(e.openSource === 'yes' ? 'Yes' : e.openSource === 'no' ? 'No' : 'Partly') : '')}
        ${fact('Maintained by', esc(e.team || ''))}
      </dl>
      <div class="d-section"><h3>What's synced</h3>${scopeHtml(e)}</div>`}
      ${e.devNote ? `<div class="d-section d-devnote"><h3>Update from the devs</h3><p>${esc(e.devNote)}</p>${e.devNoteDate ? `<p class="small muted">${esc(fmtDate(e.devNoteDate))}</p>` : ''}</div>` : ''}
      ${wanted ? '' : `<details class="d-section d-rate"${new URLSearchParams(location.search).has('vote') ? ' open' : ''}><summary>${icon('star')} Rate it and vote on its co-op %</summary>${communityHtml(e)}</details>`}
      <div class="d-links">
        <a class="btn d-open" href="games/${slug}/#${encodeURIComponent(e.id)}" title="${siblings > 1 ? `Every detail, the devs' description and video, and how it compares with the other ${siblings - 1} ${siblings === 2 ? 'project' : 'projects'} for ${esc(e.title)}.` : `Every detail, the devs' description and video, sources and comments.`}">Open full page →</a>
        ${window.COOP_ACCOUNT?.canEdit(e.id) ? `<button type="button" class="btn btn--edit" data-edit="${esc(e.id)}">${icon('pencil')}Edit listing</button>` : ''}
        ${e.download ? `<a class="btn" href="${esc(e.download)}" target="_blank" rel="noopener nofollow" data-visit="${esc(e.id)}">Download ↗</a>` : ''}
        ${e.discord ? `<a class="btn btn--discord" href="${esc(e.discord)}" target="_blank" rel="noopener" title="Chat with this mod's devs in their topic on the Co-op Anything Discord">${DISCORD_ICON}Discord topic</a>` : ''}
        ${e.repo ? `<a class="btn btn--edit" href="${esc(e.repo)}" target="_blank" rel="noopener" data-visit="${esc(e.id)}">Repository ↗</a>` : ''}
        ${e.website ? `<a class="btn${e.repo ? ' btn--ghost' : ''}" href="${esc(e.website)}" target="_blank" rel="noopener" data-visit="${esc(e.id)}">Project page ↗</a>` : ''}
      </div>`;

    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    dialog.scrollTop = 0;
    if (push) pushDetail(e.id);
    countVisit(e);
  }


  // ── Editing a listing in place ─────────────────────────────
  // Logged-in leads (and MJ) click Edit and the details panel itself turns editable: every value
  // sits where it shows on the card, the description renders as you type, and one Save bar at the
  // bottom sends only what changed to POST /api/listing/edit (the Worker checks it all again).
  const CONNECTS = ['Direct IP', 'Steam (no port forwarding)', 'Hosted relay', 'Dedicated server', 'LAN or split-screen', 'VPN needed'];
  const SYNC_EDIT = [['story', 'story', 'Story'], ['enemies', 'enemies', 'Enemies'], ['world', 'world_state', 'World'], ['items', 'items', 'Items']];
  const EDIT_FIELDS = ['cover', 'quality', 'stage', 'coop_pct', 'engine', 'connect', 'players', 'version', 'summary', 'video', 'note', 'website', 'download'];

  function editDetail(id) {
    const e = DATA.find((x) => x.id === id);
    if (!e || !window.COOP_ACCOUNT?.canEdit(id)) return;
    currentId = id;
    const l = LISTINGS[id] || {};
    const owner = window.COOP_ACCOUNT.ids === '*';
    const c = consoleOf(e);
    const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
    const sync = l.sync || {};
    const cur = (k) => (k === 'coop_pct' ? l.coopPct : l[k]) ?? '';
    $('#d-body').innerHTML = `
      <form class="ed" novalidate>
        <div class="ed-bar"><strong>${icon('pencil')} Editing ${esc(e.project || e.title)}</strong><span>Change anything below. Empty fields show what's listed now. Nothing is saved until you press Save.</span></div>
        <div class="d-head">
          <div class="ed-cover">
            <div class="ed-cover__img">${fullCover(l.cover ? { ...e, cover: l.cover } : e)}</div>
            <input class="ed-field" name="cover" type="url" value="${esc(cur('cover'))}" placeholder="Cover image link (https://...)" aria-label="Cover image link">
          </div>
          <div class="d-head__text">
            <div class="d-head__meta">${ctag(e)}<span>${esc(c.label)}</span>${e.year ? `<span>· ${e.year}</span>` : ''}</div>
            <h2 class="d-title" id="d-title">${esc(e.title)}</h2>
            <div class="d-head__meta">${subline(e)}</div>
          </div>
        </div>
        <div class="d-verdict">
          <span class="tier" data-tier="${esc(l.quality || e.quality)}" data-ed-tier>${esc((l.quality || e.quality) === 'X' ? '?' : (l.quality || e.quality))}</span>
          <div class="ed-grow">
            <select class="ed-field ed-big" name="quality" aria-label="Tier">${opt('', `Tier as listed (${e.quality})`, cur('quality'))}${(owner ? ['S'] : []).concat(['A', 'B', 'C', 'D', 'X']).map((t) => opt(t, `${t}: ${TIERS[t].label}`, cur('quality'))).join('')}</select>
            <span class="small muted">Your own rating${owner ? '' : '. S is picked by MJ'}.</span>
          </div>
        </div>
        <dl class="facts ed-facts">
          <div><dt>Stage</dt><dd><select class="ed-field" name="stage">${opt('', `As listed (${STAGES[e.stage]?.label || e.stage})`, cur('stage'))}${['released', 'beta', 'development', 'abandoned'].map((s) => opt(s, STAGES[s].label, cur('stage'))).join('')}</select></dd></div>
          <div><dt>Co-op %</dt><dd><input class="ed-field" name="coop_pct" type="number" min="0" max="100" step="1" value="${esc(cur('coop_pct'))}" placeholder="${pctOf(e)}"></dd></div>
          <div><dt>Engine</dt><dd><input class="ed-field" name="engine" value="${esc(cur('engine'))}" maxlength="60" placeholder="${esc(e.engine || e.genre || '')}"></dd></div>
          <div><dt>How you connect</dt><dd><select class="ed-field" name="connect">${opt('', `As listed (${e.toolchain === 'Unknown' ? 'Not stated' : e.toolchain})`, cur('connect'))}${CONNECTS.map((x) => opt(x, x, cur('connect'))).join('')}</select></dd></div>
          <div><dt>Players</dt><dd><input class="ed-field" name="players" value="${esc(cur('players'))}" maxlength="20" placeholder="${esc(e.players || '2-4')}"></dd></div>
          <div><dt>Latest version</dt><dd><input class="ed-field" name="version" value="${esc(cur('version'))}" maxlength="40" placeholder="${esc(e.version || 'v0.1.0')}"></dd></div>
        </dl>
        <div class="d-section"><h3>What's synced</h3>
          <ul class="scope ed-scope">${SYNC_EDIT.map(([k, scopeKey, label]) => {
            const listed = (e.scope || {})[scopeKey] || 'unknown';
            return `<li data-v="${esc(sync[k] || listed)}"><span class="scope__dot" aria-hidden="true"></span>${label}<select class="ed-field ed-mini" name="sync_${k}">${opt('', `${SCOPE_WORD[listed] || listed}`, sync[k] || '')}${[['yes', 'Synced'], ['partial', 'Partly'], ['no', 'Not synced']].map(([v, t]) => opt(v, t, sync[k])).join('')}</select></li>`;
          }).join('')}</ul>
        </div>
        <div class="d-section d-devsummary"><h3>From the devs</h3>
          <div class="ed-tools" aria-label="Formatting">
            <button type="button" data-md="**|**" title="Bold" aria-label="Bold">${icon('bold')}</button><button type="button" data-md="*|*" title="Italic" aria-label="Italic">${icon('italic')}</button>
            <button type="button" data-md="## |" title="Heading" aria-label="Heading">${icon('heading')}</button><button type="button" data-md="- |" title="List" aria-label="List">${icon('list')}</button>
            <button type="button" data-md="[|](https://)" title="Link" aria-label="Link">${icon('link')}</button><span class="small muted ed-count"></span>
          </div>
          <textarea class="ed-field ed-text" name="summary" rows="6" maxlength="4000" placeholder="Tell players what your mod does, what's synced and how to play. Markdown works: **bold**, ## headings, - lists, [links](https://...)">${esc(cur('summary'))}</textarea>
          <div class="md ed-preview" aria-live="polite"></div>
          <input class="ed-field" name="video" type="url" value="${esc(cur('video'))}" placeholder="Video link: YouTube, Vimeo or Streamable" aria-label="Video link">
          <div class="ed-video"></div>
        </div>
        <div class="d-section"><h3>Short news</h3><input class="ed-field" name="note" value="${esc(cur('note'))}" maxlength="200" placeholder="One line, no links. Shows as Update from the devs."></div>
        <div class="d-section ed-pair">
          <label><span>Website</span><input class="ed-field" name="website" type="url" value="${esc(cur('website'))}" placeholder="${esc(e.website || 'https://...')}"></label>
          <label><span>Download page</span><input class="ed-field" name="download" type="url" value="${esc(cur('download'))}" placeholder="https://.../releases"></label>
        </div>
        <p class="ed-status" role="status" aria-live="polite"></p>
        <div class="d-links">
          <button type="submit" class="btn d-open">Save changes</button>
          <button type="button" class="btn btn--ghost" data-ed-cancel>Cancel</button>
        </div>
      </form>`;
    const form = $('#d-body form');
    const area = form.elements.summary;
    const live = () => {
      form.querySelector('.ed-preview').innerHTML = area.value.trim() ? window.COOP_MD(area.value) : '<p class="muted">Your description shows here as you type.</p>';
      form.querySelector('.ed-count').textContent = `${area.value.length} / 4000`;
      const v = form.elements.video.value.trim();
      form.querySelector('.ed-video').innerHTML = v && window.COOP_VIDEO(v) ? window.COOP_VIDEO_HTML(v, e.title) : '';
      const q = form.elements.quality.value || e.quality;
      const tile = form.querySelector('[data-ed-tier]');
      tile.dataset.tier = q; tile.textContent = q === 'X' ? '?' : q;
      form.querySelectorAll('.ed-scope li').forEach((li) => { const s = li.querySelector('select'); if (s.value) li.dataset.v = s.value; });
    };
    form.addEventListener('input', live);
    form.addEventListener('change', live);
    live();
    form.elements.cover.addEventListener('change', () => {
      const v = form.elements.cover.value.trim();
      if (/^https:\/\//.test(v)) form.querySelector('.ed-cover__img').innerHTML = fullCover({ ...e, cover: v });
    });
    form.querySelectorAll('[data-md]').forEach((b) => b.addEventListener('click', () => {
      const [before, after] = b.dataset.md.split('|');
      const { selectionStart: s, selectionEnd: t, value } = area;
      area.value = value.slice(0, s) + before + value.slice(s, t) + after + value.slice(t);
      area.focus(); area.setSelectionRange(s + before.length, t + before.length); live();
    }));
    form.querySelector('[data-ed-cancel]').addEventListener('click', () => openDetail(id, { push: false }));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const status = form.querySelector('.ed-status');
      const button = form.querySelector('[type="submit"]');
      const body = { id, clear: [] };
      for (const f of EDIT_FIELDS) {
        const v = form.elements[f].value.trim();
        const before = String(cur(f));
        if (v && v !== before) body[f] = v;
        else if (!v && before) body.clear.push(f);
      }
      const nextSync = Object.fromEntries(SYNC_EDIT.map(([k]) => [k, form.elements[`sync_${k}`].value]).filter(([, v]) => v));
      if (JSON.stringify(nextSync) !== JSON.stringify(sync)) {
        if (Object.keys(nextSync).length) body.sync = nextSync; else body.clear.push('sync');
      }
      if (Object.keys(body).length === 2 && !body.clear.length) { status.textContent = 'Nothing changed yet.'; return; }
      button.disabled = true; status.dataset.state = ''; status.textContent = 'Saving…';
      try {
        const res = await fetch('/api/listing/edit', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || 'Couldn’t save. Try again later.');
        status.dataset.state = 'ok'; status.textContent = 'Saved. It’s live now.';
        await loadStats();
        openDetail(id, { push: false });
      } catch (err) {
        status.dataset.state = 'error'; status.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    });
    dialog.scrollTop = 0;
  }

  // Opening a game's details adds a history entry (#id), so the browser's or phone's Back button
  // closes them instead of leaving the site. detailPushed says the current entry is one this page
  // added, so closing with ✕, Esc or a click outside steps back over it rather than leaving it in
  // the way of the next Back. An entry the page didn't add (a shared #id link) is never stepped
  // back over: that would leave the site.
  let detailPushed = false;
  function pushDetail(id) {
    if (detailPushed) return setHash(id);
    try {
      history.pushState({ detail: id }, '', location.pathname + location.search + '#' + id);
      detailPushed = true;
    } catch { setHash(id); }
  }
  const ownsEntry = (id) => !!id && !!history.state && history.state.detail === id;

  function closeDetail() {
    if (dialog.open) dialog.close();
  }

  // A cover that fails to load turns into the initials placeholder.
  document.addEventListener('error', (ev) => {
    const box = ev.target instanceof HTMLImageElement && ev.target.closest('.cover, .d-cover');
    if (!box) return;
    if (box.classList.contains('d-cover')) box.className = 'cover cover--lg';
    box.classList.add('cover--none');
    box.textContent = box.dataset.initials;
  }, true);

  document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[data-visit]');
    const e = link && DATA.find((x) => x.id === link.dataset.visit);
    if (e) countVisit(e);
  });

  dialog.addEventListener('close', () => {
    dialog.querySelectorAll('.video iframe').forEach((frame) => frame.remove());
    if (detailPushed) {
      detailPushed = false;
      history.back();
    } else {
      setHash('');
    }
  });
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog || ev.target.closest('[data-close]')) closeDetail();
  });

  // ── URL state ────────────────────────────────────────────

  function setHash(id) {
    try {
      const url = location.pathname + location.search + (id ? '#' + id : '');
      history.replaceState(null, '', url);
    } catch { /* history unavailable */ }
  }

  function writeURL() {
    try {
      const p = new URLSearchParams();
      for (const k of ['q', 'console', 'genre', 'quality', 'toolchain', 'os']) if (state[k]) p.set(k, state[k]);
      if (state.stages.size) p.set('stage', [...state.stages].join(','));
      if (state.features.size) p.set('has', [...state.features].join(','));
      if (state.ca) p.set('ca', '1');
      if (window.COOP_LANG === 'ru') p.set('lang', 'ru');
      if (state.sort !== DEFAULTS.sort || state.dir !== DEFAULTS.dir) { p.set('sort', state.sort); p.set('dir', state.dir); }
      const qs = p.toString();
      history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch { /* history unavailable */ }
  }

  function readURL() {
    let p;
    try { p = new URLSearchParams(location.search); } catch { return; }
    for (const k of ['q', 'console', 'genre', 'quality', 'toolchain']) if (p.get(k)) state[k] = p.get(k);
    if (OS[p.get('os')]) state.os = p.get('os');
    (p.get('stage') || '').split(',').filter((s) => STAGES[s]).forEach((s) => state.stages.add(s));
    (p.get('has') || '').split(',').filter((f) => FEATURE_FILTERS[f]).forEach((f) => state.features.add(f));
    state.ca = p.get('ca') === '1';
    if (SORTS[p.get('sort')]) state.sort = p.get('sort');
    if (['asc', 'desc'].includes(p.get('dir'))) state.dir = p.get('dir');
  }

  // ── Theme ────────────────────────────────────────────────

  const root = document.documentElement;
  const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : !!(darkMQ && darkMQ.matches);
  function syncThemeButton() {
    $('#theme-toggle').setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  }
  const savedTheme = store.get('rh-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') root.dataset.theme = savedTheme;
  $('#theme-toggle').addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    store.set('rh-theme', root.dataset.theme);
    syncThemeButton();
  });
  darkMQ && darkMQ.addEventListener && darkMQ.addEventListener('change', syncThemeButton);
  syncThemeButton();

  // ── Events ───────────────────────────────────────────────

  function setSort(key, dir) {
    if (!SORTS[key]) return;
    state.sort = key;
    state.dir = dir || SORTS[key].dir;
    render();
  }

  function resetFilters() {
    Object.assign(state, { q: '', console: '', genre: '', quality: '', toolchain: '', os: '', ca: false });
    state.stages.clear();
    state.features.clear();
    $('#q').value = '';
    render();
  }

  let qTimer;
  $('#q').addEventListener('input', (ev) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = ev.target.value.trim(); render(); }, 120);
  });

  for (const [id, key] of [['#f-console', 'console'], ['#f-genre', 'genre'], ['#f-quality', 'quality'], ['#f-toolchain', 'toolchain']]) {
    $(id).addEventListener('change', (ev) => { state[key] = ev.target.value; render(); });
  }

  $('#sort').addEventListener('change', (ev) => setSort(ev.target.value));
  $('#sort-dir').addEventListener('click', () => setSort(state.sort, state.dir === 'asc' ? 'desc' : 'asc'));


  $('#ca-toggle').addEventListener('click', () => { state.ca = !state.ca; render(); });

  // "/" jumps to the search box from anywhere on the page.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || dialog.open) return;
    if (ev.target.closest('input, textarea, select, [contenteditable]')) return;
    ev.preventDefault();
    $('#q').focus();
    $('#q').select();
  });

  $('#stage-tiles').addEventListener('click', (ev) => {
    const tile = ev.target.closest('.stage-tile');
    if (!tile) return;
    const s = tile.dataset.stage;
    state.stages.has(s) ? state.stages.delete(s) : state.stages.add(s);
    render();
  });

  $('#reset').addEventListener('click', resetFilters);
  $('#empty-reset').addEventListener('click', resetFilters);

  document.querySelector('.segmented').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    store.set('rh-view', state.view);
    render();
  });

  document.querySelector('.grid thead').addEventListener('click', (ev) => {
    const th = ev.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (key === state.sort) setSort(key, state.dir === 'asc' ? 'desc' : 'asc');
    else setSort(key);
  });

  $('#results').addEventListener('click', (ev) => {
    const opener = ev.target.closest('[data-open]') || ev.target.closest('tr[data-id], .card[data-id]');
    if (!opener || ev.target.closest('a')) return;
    openDetail(opener.dataset.open || opener.dataset.id);
  });

  document.querySelector('.pulse').addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-open]');
    if (row) {
      openDetail(row.dataset.open);
    } else if (ev.target.closest('[data-sort-trending]')) {
      setSort('trending');
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  dialog.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-edit]');
    if (btn) editDetail(btn.dataset.edit);
  });

  // Back and Forward: open or close the details to match the address. Set detailPushed first, so a
  // close caused by Back doesn't step back a second time.
  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    detailPushed = ownsEntry(id);
    if (id && DATA.some((e) => e.id === id)) openDetail(id, { push: false });
    else closeDetail();
  });

  // ── Boot ─────────────────────────────────────────────────

  const savedView = store.get('rh-view');
  state.view = savedView === 'cards' || savedView === 'table'
    ? savedView
    : (window.matchMedia && window.matchMedia('(max-width: 760px)').matches ? 'cards' : 'table');

  readURL();
  buildControls();
  refreshTrending();
  renderNewsletter();
  renderThanks();
  $('#q').value = state.q;
  render();

  // Game pages' Newsletter button links to #newsletter, a box that was still hidden when the
  // browser looked for it. Done again after load, when the browser's own jump to #newsletter
  // has taken the cursor back out of the box.
  if (MAIL_API && location.hash === '#newsletter') {
    goToNewsletter();
    window.addEventListener('load', () => setTimeout(goToNewsletter, 0), { once: true });
  }
  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial && DATA.some((e) => e.id === initial)) {
    detailPushed = ownsEntry(initial);  // true when Back from a game page returns to open details
    openDetail(initial, { push: false });
  }
  loadStats();
  {
    const editId = new URLSearchParams(location.search).get('edit');
    const openEditor = () => {
      if (!window.COOP_ACCOUNT?.canEdit(editId)) return;
      openDetail(editId, { push: false });
      editDetail(editId);
    };
    if (editId) window.addEventListener('coop:account', () => setTimeout(openEditor, 300), { once: true });
  }
})();
