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
    updated: { label: 'Last activity', dir: 'desc', get: (e) => lastActive(e), dirs: ['Oldest first', 'Newest first'] },
    wanted: { label: 'Most wanted', dir: 'desc', get: (e) => (e.wantedGame ? e.wantedVotes : null), dirs: ['Fewest votes first', 'Most votes first'] },
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
    // The server counts every hit now, so each browser session sends one per project.
    try { if (sessionStorage.getItem(`rh-hit:${e.id}`)) return; sessionStorage.setItem(`rh-hit:${e.id}`, '1'); } catch { /* no storage: count it */ }
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
      if (l.repo) e.repo = l.repo;
      if (e.consoleListed === undefined) e.consoleListed = e.console;
      e.console = l.kind && CONSOLES[l.kind] ? l.kind : e.consoleListed;
      if (l.players) e.players = l.players;
      if (l.cover) e.cover = l.cover;
      if (l.quality && TIERS[l.quality]) { e.quality = l.quality; e.devRated = true; }
      if (l.coopPct != null) { e.coopPct = l.coopPct; e.devPct = true; }
      if (l.engine) e.engine = l.engine;
      if (l.connect) e.toolchain = l.connect;
      if (l.sync) {
        const map = { see: 'players_visible', story: 'story', enemies: 'enemies', world: 'world_state', items: 'items' };
        e.scope = { ...(e.scope || {}) };
        for (const [k, v] of Object.entries(l.sync)) if (map[k]) e.scope[map[k]] = v;
      }
    }
  }
  // After the devs save in the editor: reload the numbers and listings, then reopen the details.
  window.addEventListener('coop:account', () => { if (dialog.open && currentId) openDetail(currentId, { push: false }); });
  async function loadStats(fresh = false) {
    loadWanted();
    try {
      const res = await fetch(`${API}/stats`, { headers: { Accept: 'application/json' }, cache: fresh ? 'reload' : 'default' });
      if (!res.ok) return;
      const out = await res.json();
      API_ON = true;
      addCommunity(out.community || []);
      applyStats(out.stats || {});
      applyListings(out.listings || {});
      refreshTrending();
      render();
      if (dialog.open && currentId) openDetail(currentId, { push: false }); else openFromHash();
    } catch { /* static hosting or offline: estimates only */ }
  }

  const DEFAULTS = { q: '', console: '', genre: '', quality: '', toolchain: '', os: '', sort: 'quality', dir: 'asc' };

  const state = {
    ...DEFAULTS,
    stages: new Set(),
    features: new Set(),
    ca: false,
    cl: false,
    view: 'cards',
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

  // Newest of every date we know: the directory's push date, the live release and the dev's note.
  // A "-01" date with no star count is a month-level placeholder, not a real push, so it only counts
  // when nothing newer exists, and then shows as a month.
  function lastActive(e) {
    const known = [e.versionDate, e.devNoteDate, e.updated].filter(Boolean).sort();
    return known.length ? known[known.length - 1] : null;
  }
  const approxActive = (e) => !!e.updated && lastActive(e) === e.updated && /-01$/.test(e.updated) && e.stars == null;
  const fmtActive = (e) => {
    const d = lastActive(e);
    if (!d) return '';
    if (!approxActive(e)) return fmtDate(d);
    return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  function activity(e) {
    const n = daysSince(lastActive(e));
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
  const clTitles = new Set((window.COUCHLINK && window.COUCHLINK.titles) || []);
  const aiTag = (e) => (e.coopAnything ? '<span class="ca-badge" title="Made with Co-op Anything">Co-op Anything</span>' : '')
    + (clTitles.has(e.title) ? '<a class="ca-badge cl-badge" href="couchlink/" title="You can play this one together on one PC with Couchlink">Couchlink</a>' : '');
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

  const actTag = (e) => `<span class="act act--${activity(e)}" title="${lastActive(e) ? (approxActive(e) ? 'Around ' : 'Last activity ') + esc(fmtActive(e)) : 'No activity data'}">${esc(approxActive(e) ? 'Around ' + fmtActive(e) : relTime(lastActive(e)))}</span>`;

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
    return `${esc(bits.join(' · '))}${aiTag(e)}${e.community && !e.reviewed ? '<span class="rv-badge rv-badge--no" title="Listed by its developer. The owner has not looked at it yet.">Not reviewed</span>' : ''}`;
  }

  // Detail cards: "Reviewed" for directory entries and community listings the owner has marked.
  const reviewTag = (e) => ((e.community ? e.reviewed : !e.wantedGame && e.stage !== 'wanted')
    ? '<span class="rv-badge rv-badge--yes" title="Looked at by the site owner">Reviewed</span>' : '');

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

  // Mods their devs listed themselves with /listing add (no directory edit needed). Once the same
  // link is in the reviewed directory, that entry is shown and this one is skipped.
  const linkKey = (u) => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '');
  function addCommunity(list) {
    const have = new Set(DATA.filter((e) => !e.community).flatMap((e) => [e.repo, e.website, ...(e.otherUrls || [])]).map(linkKey).filter(Boolean));
    const known = new Set(DATA.map((e) => e.id));
    for (const c of list) {
      if (known.has(c.id) || have.has(linkKey(c.url))) continue;
      const github = /^https:\/\/github\.com\/[^/]+\/[^/]+$/i.test(c.url);
      const e = {
        id: c.id, title: c.game, project: c.project, console: 'mod', year: null, developer: null, genre: '', engine: '',
        stage: 'development', status: 'prototype', quality: 'D', toolchain: 'Unknown', team: null,
        repo: github ? c.url : null, website: github ? null : c.url, otherUrls: [], version: null, versionDate: null,
        started: null, updated: c.created, stars: null, features: [], ai: false,
        summary: 'Listed by its developer. It has not been reviewed yet, so check the project page for what works.',
        requires: `Your own copy of ${c.game}.`,
        scope: { players_visible: 'unknown', story: 'unknown', enemies: 'unknown', world_state: 'unknown', items: 'unknown' },
        players: null, qa: 'none', qaLabel: 'Not checked', openSource: github ? 'yes' : 'unknown', coopPct: 0, adopt: false,
        sources: [c.url], searched: null, checked: c.created, platforms: null, coopAnything: false, writeup: null, coverFrom: 'none',
        community: true, reviewed: !!c.reviewed,
      };
      DATA.push(e);
      SLUG.set(e.id, slugOf(e.title));
      PROJECTS_PER_GAME.set(SLUG.get(e.id), (PROJECTS_PER_GAME.get(SLUG.get(e.id)) || 0) + 1);
      const text = fold([e.title, e.project, e.toolchain, consoleOf(e).label, consoleOf(e).short].filter(Boolean).join(' '));
      const h = { text, seq: text.split(' '), names: [...new Set(fold(`${e.title} ${e.project}`).split(' '))].filter((w) => w.length >= 4) };
      haystack.set(e.id, h);
      HAY.push(h);
    }
  }

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

  // ── Wanted games ─────────────────────────────────────────
  // About two thousand games people could want a co-op mod for (D1, worker/wanted.js, IGDB ids), added to
  // the catalog once loaded. They show when you search or press the Wanted tile; each has an upvote.
  const WANTED = new Map();
  let wantedCan = null;
  const initialsOf = (t) => fold(t).split(' ').filter((w) => w && !['the', 'of', 'a', 'an'].includes(w)).map((w) => w[0]).join('');
  const votesText = (e) => `${e.wantedVotes} ${e.wantedVotes === 1 ? 'person wants' : 'people want'} this co-op`;
  const voteBtn = (e) => `<button type="button" class="wanted-vote${e.wantedMine ? ' is-on' : ''}" data-wvote="${e.wantedId}" aria-pressed="${!!e.wantedMine}" title="${e.wantedMine ? 'Remove your vote' : 'I want this co-op'}">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg><span class="wanted-n">${e.wantedVotes}</span></button>`;

  const KIND_LABEL = { repo: 'Repository', 'mod-page': 'Mod page', site: 'Project site', article: 'Article', video: 'Video', discussion: 'Discussion', suggested: 'Suggested by the community' };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const wantedStatus = (k, mods) => (k === 'official_coop' ? 'Has official co-op'
    : k === 'mod_found' && mods.length ? `${mods.length} ${mods.every((m) => m.a) ? 'possible ' : ''}co-op ${mods.length > 1 ? 'mods' : 'mod'} found`
    : k === 'none_found' ? 'No co-op mod found' : 'Not checked yet');

  function addWanted(list) {
    const norm = (s) => fold(String(s).replace(/\(.*?\)/g, ''));
    // The directory's hand-researched "nobody has made this" entries: their notes carry over to the matching game.
    const gaps = new Map(DATA.filter((e) => e.stage === 'wanted' && !e.wantedGame).map((e) => [norm(e.title), e]));
    const dropped = new Set();
    // A game that has a listed project is linked to it by title here, so a project merged after the catalog was
    // built still replaces its "Wanted" row (the catalog's own link, w.s, wins when it has one).
    const listedByTitle = new Map();
    for (const e of DATA) if (!e.wantedGame && e.stage !== 'wanted' && !listedByTitle.has(norm(e.title))) listedByTitle.set(norm(e.title), e.id);
    for (const w0 of list) {
      const w = { ...w0, s: w0.s || listedByTitle.get(norm(w0.n)) || null };
      const mods = (w.p || []).filter((p) => p.url);
      let k = w.k;
      // Links the community suggested and a person approved.
      for (const s of w.sg || []) if (!mods.some((m) => m.url === s.url)) mods.push({ name: hostOf(s.url), url: s.url, summary: s.note || '', kind: 'suggested' });
      if (w.sg && w.sg.length && (k === 'unchecked' || k === 'none_found')) k = 'mod_found';
      const gap = gaps.get(norm(w.n));
      if (gap && !w.s) { dropped.add(gap.id); if (k === 'unchecked') k = 'none_found'; }
      let e = WANTED.get(w.i);
      if (!e) {
        e = {
          id: `w-${w.i}`, wantedGame: true, wantedId: w.i, wantedMine: false, title: w.n, console: 'gap', year: w.y || null, developer: null,
          genre: '', engine: '', stage: 'wanted', status: 'none', quality: 'X', toolchain: 'Unknown', team: null, repo: null, website: null,
          otherUrls: [], version: null, versionDate: null, started: null, updated: null, stars: null, features: [], ai: false, summary: '',
          requires: null, scope: { players_visible: 'unknown', story: 'unknown', enemies: 'unknown', world_state: 'unknown', items: 'unknown' },
          players: null, qa: 'none', qaLabel: 'Not checked', openSource: 'unknown', coopPct: 0, adopt: false, sources: [], searched: null,
          checked: null, platforms: null, coopAnything: false, writeup: null, coverFrom: 'none',
        };
        WANTED.set(w.i, e);
        DATA.push(e);
        const text = fold(`${w.n} ${initialsOf(w.n)} ${w.y || ''}`);
        const h = { text, seq: text.split(' '), names: [...new Set(fold(w.n).split(' '))].filter((x) => x.length >= 4) };
        haystack.set(e.id, h);
        HAY.push(h);
        h.names.forEach((x) => { if (!NAME_WORDS.includes(x)) NAME_WORDS.push(x); });
      }
      Object.assign(e, {
        wantedVotes: w.v, wantedCoop: k, wantedMods: mods, igdbSlug: w.l, steam: w.g, siteId: w.s || null, project: wantedStatus(k, mods),
        cover: w.c ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${w.c}.jpg` : undefined,
      });
      // A game that already has a mod listed: its initials ("fnv") find that mod too.
      const modHay = w.s && haystack.get(w.s);
      if (modHay && !modHay.seq.includes(initialsOf(w.n))) { modHay.text += ` ${initialsOf(w.n)}`; modHay.seq = modHay.text.split(' '); }
      if (gap && !w.s) Object.assign(e, { summary: gap.summary, sources: gap.sources || [], searched: gap.searched, checked: gap.checked });
    }
    for (let i = DATA.length - 1; i >= 0; i--) if (dropped.has(DATA[i].id)) DATA.splice(i, 1);
  }

  // A link like /#some-id opens that card, but the community and wanted entries only exist once loaded.
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && !dialog.open && DATA.some((e) => e.id === id)) openDetail(id, { push: false });
  }

  async function loadWanted() {
    try {
      // The catalog is a static file (no database); only the vote counts and member requests come from the API,
      // so the list still shows when the database is slow or down.
      const [cat, live, mine] = await Promise.all([
        fetch('data/wanted.json').then((r) => r.json()),
        fetch(`${API}/wanted/all`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${API}/wanted/mine`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const votes = (live && live.votes) || {};
      const suggested = (live && live.suggested) || {};
      addWanted(cat.concat((live && live.extra) || []).map((w) => ({ ...w, v: votes[w.i] || 0, sg: suggested[`w:${w.i}`] })));
      for (const e of DATA) if (!e.wantedGame) e.suggested = suggested[e.id] || null;
      if (mine && mine.ok) {
        wantedCan = mine.can;
        const ids = new Set(mine.ids);
        WANTED.forEach((e) => { e.wantedMine = ids.has(e.wantedId); });
      }
      render();
      if (dialog.open && currentId) openDetail(currentId, { push: false }); else openFromHash();
    } catch { /* the catalog just stays out */ }
  }

  // "Missing something?": a member suggests a co-op mod (a link) or reports a mistake. Nothing shows until a
  // person approves it. The Worker checks everything again (worker/suggest.js).
  const DISCORD_INVITE = 'https://discord.gg/EXGB49R82t';
  function openSuggest(e) {
    const target = e.wantedGame ? `w:${e.wantedId}` : e.id;
    const a = window.COOP_ACCOUNT || {};
    let d = document.getElementById('suggest-dialog');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'suggest-dialog'; d.className = 'wanted-card'; d.setAttribute('aria-labelledby', 'suggest-title');
      d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); });
      document.body.appendChild(d);
    }
    const login = (label) => (a.loginOn ? `<a class="btn" href="${esc(a.loginUrl())}">${label}</a>` : '');
    const join = `<a class="btn btn--ghost" href="${DISCORD_INVITE}" target="_blank" rel="noopener">Join the Discord</a>`;
    let body;
    if (!a.user) body = `<p>Suggestions come from members of our Discord server. <strong>Join the Discord</strong>, then log in with it here to suggest a mod or a fix.</p><p>${join} ${login('Log in with Discord')}</p>`;
    else if (wantedCan) body = `<p>${esc(wantedCan)}</p><p>${join} ${/log in/i.test(wantedCan) ? login('Log in again') : ''}</p>`;
    else body = `<form id="sg-form" class="sg-form">
        <fieldset class="sg-kind"><legend class="small muted">What do you want to send?</legend>
          <label><input type="radio" name="kind" value="mod" checked> A co-op mod for this game</label>
          <label><input type="radio" name="kind" value="correction"> Something here is wrong or missing</label></fieldset>
        <label id="sg-url-row">Link to the mod's page <span class="muted">(GitHub, Nexus Mods, ModDB, itch.io, its website...)</span>
          <input name="url" type="url" class="my-search" placeholder="https://" maxlength="300" autocomplete="off"></label>
        <label>Note <span class="muted">(optional for a mod, required for a fix; text only, links are removed)</span>
          <textarea name="note" rows="3" maxlength="280" class="my-search"></textarea></label>
        <p class="small muted">A person checks every suggestion before it shows on the site. Please send real things only: accounts that send junk get paused.</p>
        <p><button class="btn" type="submit">Send suggestion</button> <span id="sg-msg" class="small" role="status"></span></p></form>`;
    d.innerHTML = `<form method="dialog" class="wanted-card__close"><button class="btn btn--ghost" aria-label="Close">Close</button></form>
      <h2 id="suggest-title">Suggest something for ${esc(e.title)}</h2>${body}`;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    const form = d.querySelector('#sg-form');
    if (!form) return;
    const sync = () => { d.querySelector('#sg-url-row').hidden = form.elements.kind.value !== 'mod'; };
    form.addEventListener('change', sync); sync();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = d.querySelector('#sg-msg');
      const kind = form.elements.kind.value;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; msg.textContent = 'Sending...';
      const out = await postJSON('/suggest', { target, kind, url: form.elements.url.value.trim() || undefined, note: form.elements.note.value.trim() });
      if (out.ok) { form.innerHTML = `<p><strong>${esc(out.message || 'Thank you!')}</strong></p>`; return; }
      msg.textContent = out.error || 'That did not work.';
      btn.disabled = false;
    });
  }

  function wantedDetail(e) {
    const mods = e.wantedMods || [];
    const links = [
      e.igdbSlug && `<a href="https://www.igdb.com/games/${encodeURIComponent(e.igdbSlug)}" target="_blank" rel="noopener">IGDB</a>`,
      e.steam && `<a href="https://store.steampowered.com/app/${encodeURIComponent(e.steam)}" target="_blank" rel="noopener">Steam</a>`,
    ].filter(Boolean).join(' · ');
    const lead = e.wantedCoop === 'official_coop' ? 'This game ships with its own co-op.'
      : mods.length ? ''
      : e.wantedCoop === 'none_found' ? `Nobody has made <strong>${esc(e.title)}</strong> co-op yet, as far as anyone has found.`
      : 'Nobody has checked this game for co-op mods yet.';
    return `<div class="d-section d-wanted">
      ${lead ? `<p>${lead}</p>` : ''}
      <div class="wanted-vote-row">${voteBtn(e)}<span id="wv-text" class="small muted">${esc(votesText(e))}. Upvote it to show you want it.</span></div>
      ${e.siteId ? `<p><button type="button" class="btn" data-goto="${esc(e.siteId)}">See the co-op mod listed for it →</button></p>` : ''}
      ${mods.length ? `<h3>${mods.every((m) => m.a) ? 'Possible co-op projects' : 'Co-op projects found'}</h3>${mods.some((m) => m.a) ? '<p class="small muted">Found by searching the web, GitHub and mod sites. A person has not checked these, so they may not be what they look like.</p>' : ''}<ul class="wanted-mods">${mods.map((p) => `<li>
        <a href="${esc(p.url)}" target="_blank" rel="noopener nofollow"><strong>${esc(p.name)}</strong></a>${p.kind && KIND_LABEL[p.kind] ? ` <span class="wanted-tag">${KIND_LABEL[p.kind]}</span>` : ''}${p.stage && STAGES[p.stage] ? ` <span class="stage" data-stage="${p.stage}">${esc(STAGES[p.stage].label)}</span>` : ''}
        ${p.summary ? `<div class="small muted">${esc(p.summary)}</div>` : ''}</li>`).join('')}</ul>` : ''}
      ${e.summary ? `<p>${esc(e.summary)}</p>` : ''}
      ${links ? `<p class="small muted">${links}</p>` : ''}
      ${sourcesHtml(e)}
      <p class="small">Know a mod? <a href="https://github.com/cranebeaker/coop-anything/issues/new?template=new-coop-mod.yml" target="_blank" rel="noopener">Add it</a>. Want to build one? <a href="https://github.com/cranebeaker/coop-anything#quick-start" target="_blank" rel="noopener">Co-op Anything</a> shows your AI agent how.</p>
    </div>`;
  }

  function toast(text) {
    let t = document.getElementById('wanted-toast');
    if (!t) { t = document.createElement('div'); t.id = 'wanted-toast'; t.className = 'wanted-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    const a = window.COOP_ACCOUNT || {};
    t.innerHTML = `${esc(text)}${/log in/i.test(text) && a.loginOn ? ` <a href="${esc(a.loginUrl())}">Log in</a>` : ''}`;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 7000);
  }

  function syncVote(e) {
    document.querySelectorAll(`[data-wvote="${e.wantedId}"]`).forEach((b) => {
      b.classList.toggle('is-on', !!e.wantedMine); b.setAttribute('aria-pressed', String(!!e.wantedMine));
      b.title = e.wantedMine ? 'Remove your vote' : 'I want this co-op';
      b.querySelector('.wanted-n').textContent = e.wantedVotes;
    });
    const t = document.getElementById('wv-text');
    if (t && currentId === e.id) t.textContent = `${votesText(e)}. Upvote it to show you want it.`;
  }

  const postJSON = (path, body) => fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => ({ ok: false, error: 'Something went wrong.' }));

  async function castVote(e) {
    const a = window.COOP_ACCOUNT || {};
    if (!a.user) { if (a.loginOn) location.href = a.loginUrl(); else toast('Logging in is not switched on yet.'); return; }
    if (wantedCan) { toast(wantedCan); return; }
    const on = !e.wantedMine;
    e.wantedMine = on; e.wantedVotes += on ? 1 : -1; syncVote(e);
    const out = await postJSON('/wanted/vote', { igdb_id: e.wantedId, on });
    if (!out.ok) { e.wantedMine = !on; e.wantedVotes += on ? -1 : 1; syncVote(e); toast(out.error || 'That did not work.'); return; }
    e.wantedVotes = out.votes; syncVote(e);
  }

  function openAddGame() {
    const a = window.COOP_ACCOUNT || {};
    let d = document.getElementById('add-dialog');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'add-dialog'; d.className = 'wanted-card'; d.setAttribute('aria-labelledby', 'add-title');
      d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); });
      document.body.appendChild(d);
    }
    const login = (label) => (a.loginOn ? `<a class="btn" href="${esc(a.loginUrl())}">${label}</a>` : '<span class="muted">Logging in is not switched on yet.</span>');
    let body;
    if (!a.user) body = `<p><strong>Log in with Discord to add a game.</strong> You need to be in the Co-op Anything server.</p><p>${login('Log in with Discord')}</p>`;
    else if (wantedCan) body = `<p>${esc(wantedCan)}</p>${/log in/i.test(wantedCan) ? `<p>${login('Log in again')}</p>` : ''}`;
    else body = `<label for="add-find"><strong>Find the game</strong> <span class="muted">(searches IGDB for PC games that are not on the list yet)</span></label>
      <input id="add-find" class="my-search" type="search" placeholder="Start typing the game's name..." autocomplete="off">
      <ul id="add-found" class="wanted-found"></ul><p id="add-msg" class="small" role="status"></p>`;
    d.innerHTML = `<form method="dialog" class="wanted-card__close"><button class="btn btn--ghost" aria-label="Close">Close</button></form><h2 id="add-title">Add a game</h2>${body}`;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    const find = d.querySelector('#add-find');
    if (!find) return;
    find.focus();
    let timer = 0, token = 0;
    const msg = d.querySelector('#add-msg'), found = d.querySelector('#add-found');
    find.addEventListener('input', () => {
      clearTimeout(timer);
      const q = find.value.trim();
      if (q.length < 2) { found.innerHTML = ''; msg.textContent = ''; return; }
      timer = setTimeout(async () => {
        const mine = ++token;
        msg.textContent = 'Searching...';
        try {
          const res = await fetch(`${API}/igdb/search?q=${encodeURIComponent(q)}`);
          const out = await res.json();
          if (mine !== token) return;
          if (!out.ok) { msg.innerHTML = esc(out.error || 'Search failed.') + (/log in/i.test(out.error || '') ? ` ${login('Log in')}` : ''); found.innerHTML = ''; return; }
          found.innerHTML = out.games.map((g) => `<li><button type="button" class="wanted-pick" data-pick="${g.igdb_id}">
            ${g.cover ? `<img src="https://images.igdb.com/igdb/image/upload/t_cover_small/${esc(g.cover)}.jpg" alt="" width="45" height="60">` : ''}
            <span>${esc(g.name)}${g.year ? ` <span class="muted">${g.year}</span>` : ''}</span><span class="small">+ Add and vote</span></button></li>`).join('');
          const listed = (out.listed || []).map((g) => `<button type="button" class="wanted-listed" data-listed="${esc(g.name)}">${esc(g.name)}</button>`).join(' ');
          msg.innerHTML = listed ? `Already on the list (press to see it and vote): ${listed}` : (out.games.length ? '' : 'No PC games found with that name.');
        } catch { if (mine === token) msg.textContent = 'Search failed. Try again.'; }
      }, 300);
    });
    d.onclick = async (ev) => {
      if (ev.target === d) { d.close(); return; }
      const listed = ev.target.closest('[data-listed]');
      if (listed) {
        d.close();
        state.stages = new Set(['wanted']); state.q = listed.dataset.listed; state.sort = 'wanted'; state.dir = 'desc';
        $('#q').value = state.q;
        render();
        $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const pick = ev.target.closest('[data-pick]');
      if (!pick) return;
      pick.disabled = true;
      const out = await postJSON('/wanted/request', { igdb_id: Number(pick.dataset.pick) });
      if (!out.ok) { msg.textContent = out.error || 'That did not work.'; pick.disabled = false; return; }
      d.close();
      await loadWanted();
      toast(out.added ? 'Added to the list, and your vote is in.' : 'It was already on the list, so your vote is in.');
      openDetail(`w-${pick.dataset.pick}`);
    };
  }

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
    // The wanted catalog (thousands of games) stays out of the way: it shows when you search (games that
    // have a mod listed show as that mod) or when the Wanted filter is on.
    if (e.wantedGame && !(ignoreStage ? !state.q || !e.siteId : state.stages.has('wanted') || (state.q && !e.siteId))) return false;
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
    if (state.cl && !clTitles.has(e.title)) return false;
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
      state.stages.size || state.features.size || state.ca || state.cl);

  // ── Rendering ────────────────────────────────────────────

  function renderStageTiles() {
    const base = DATA.filter((e) => matches(e, true));
    const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0]));
    base.forEach((e) => { counts[e.stage] = (counts[e.stage] || 0) + 1; });
    const all = `
      <button type="button" class="stage-tile stage-tile--all" data-stage="all" aria-pressed="${state.stages.size === 0}">
        <span class="stage-tile__label">Everything</span>
        <span class="stage-tile__n">${base.filter((e) => !e.wantedGame).length}</span>
      </button>`;
    $('#stage-tiles').innerHTML = all + STAGE_ORDER.map((s) => `
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
          ? `<div class="rate-cell"><span class="star star--sm"><span class="star__bg">${starSvg()}</span><span class="star__fill" style="width:100%">${starSvg()}</span></span><span class="mono score">${scoreText(e)}</span><span class="small muted" title="${ratingsText(e)}">(${e.userScoreCount})</span>${trendTag(e)}</div>`
          : '<span class="muted">-</span>'}</td>
        <td class="num">${e.wantedGame ? voteBtn(e) : `<div class="stack"><span class="mono">${fmtStars(e.stars)}</span>${gainTag(e)}</div>`}</td>
      </tr>`).join('');

    document.querySelectorAll('.grid th[data-sort]').forEach((th) => {
      if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  // Posters: the box art big, with a blurred copy of itself behind it, then the name, Co-op % and stage.
  function posterCover(e) {
    const cl = clTitles.has(e.title) ? '<span class="poster__cl" title="You can play this one together on one PC with Couchlink">Couchlink</span>' : '';
    const art = e.cover
      ? `<img src="${esc(e.cover)}" alt="" loading="lazy" decoding="async">`
      : `<span class="poster__init" aria-hidden="true">${esc(initials(e.title))}</span>`;
    return `<div class="poster__cover${e.cover ? '' : ' poster__cover--none'}" style="--c:${consoleOf(e).color}${e.cover ? `;--art:url('${esc(e.cover)}')` : ''}">${art}${cl}<span class="poster__tier">${tierTile(e)}</span></div>`;
  }

  function renderCards(list) {
    const poster = (e) => `
      <article class="card poster" data-id="${esc(e.id)}">
        ${posterCover(e)}
        <div class="poster__body">
          <button type="button" class="game__title poster__title" data-open="${esc(e.id)}">${esc(e.title)}</button>
          <span class="poster__sub">${subline(e)}</span>
          <div class="poster__pct">${pctBar(e)}</div>
          <div class="poster__foot">${e.wantedGame ? voteBtn(e) : stagePill(e)}</div>
        </div>
      </article>`;
    const parts = list.map(poster);
    // The Couchlink band sits after the first few posters, but not in search results or the wanted list.
    const band = document.getElementById('cl-band-tpl');
    const wantedOnly = state.stages.size === 1 && state.stages.has('wanted');
    if (band && !state.q && !wantedOnly && !state.cl && list.length > 6) parts.splice(6, 0, band.innerHTML);
    $('#card-view').innerHTML = parts.join('');
  }

  // Long lists (the wanted catalog) are drawn a page at a time; any change to the filters starts over.
  const PAGE = 120;
  let shown = PAGE, shownSig = '';

  function render() {
    const sig = JSON.stringify([state.q, state.console, state.genre, state.quality, state.toolchain, state.os, [...state.stages], [...state.features], state.ca, state.cl, state.sort, state.dir]);
    if (sig !== shownSig) { shownSig = sig; shown = PAGE; }
    const full = sortList(DATA.filter((e) => matches(e)));
    const list = full.slice(0, shown);
    renderStageTiles();

    const total = DATA.filter((e) => !e.wantedGame).length;
    const guessed = state.q ? searchTerms().filter((x) => x.near && x.near.size).map((x) => x.t) : [];
    const wantedOnly = state.stages.size === 1 && state.stages.has('wanted');
    $('#count').innerHTML = (wantedOnly
      ? `<strong>${full.length.toLocaleString('en')}</strong> games people could play together${state.sort === 'wanted' ? ', most wanted first' : ''}. Press the arrow on a game to vote for it.`
      : full.length === total
        ? `<strong>${total}</strong> co-op projects across <strong>${GAME_COUNT}</strong> games`
        : `Showing <strong>${full.length.toLocaleString('en')}</strong> of ${total} co-op projects`)
      + (guessed.length && full.length
        ? ` <span class="count__guess">· close matches for ${guessed.map((t) => `“${esc(t)}”`).join(', ')}</span>` : '');
    const more = $('#more-wrap');
    if (more) {
      more.hidden = full.length <= list.length;
      $('#more').textContent = `Show ${Math.min(PAGE, full.length - list.length)} more (${(full.length - list.length).toLocaleString('en')} left)`;
    }

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
    $('#cl-toggle').setAttribute('aria-pressed', String(state.cl));
    $('#filters-toggle').classList.toggle('has-set', !!(state.console || state.genre || state.quality || state.toolchain || state.ca));
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

  // Worked out each time, so releases found after the build (worker/releases.js) show up too.
  const latest = () => DATA.filter((e) => e.versionDate)
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
    $('#latest-list').innerHTML = latest().map((e) => `<li><button type="button" class="pulse__chip" data-open="${esc(e.id)}">
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
  const STAR_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
  const starSvg = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  const OUTCOME_ICONS = {
    finished: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M9 11l3 3L22 4',
    mostly: 'M6 3l14 9-14 9V3z',
    broke: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
    'no-start': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  };
  const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';
  const pctWords = (p) => (p < 20 ? 'Barely playable together' : p < 50 ? 'Some of it works' : p < 80 ? 'Most of it works' : p < 100 ? 'Nearly the whole game' : 'The whole game');
  // Five stars filled to a score out of 10 (display only).
  const starsRow = (score10) => `<span class="stars" role="img" aria-label="${(score10 / 2).toFixed(1)} stars out of 5">${[0, 1, 2, 3, 4].map((i) =>
    `<span class="star"><span class="star__bg">${starSvg()}</span><span class="star__fill" style="width:${Math.round(Math.min(1, Math.max(0, score10 / 2 - i)) * 100)}%">${starSvg()}</span></span>`).join('')}</span>`;
  const ringSvg = (p) => `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${p == null ? 'No estimate' : `${p} percent co-op`}"><circle cx="50" cy="50" r="40" class="ring__track"/>${p == null ? '' : `<circle cx="50" cy="50" r="40" class="ring__fill" stroke-dasharray="${(p / 100 * 251.3).toFixed(1)} 251.3" transform="rotate(-90 50 50)"/>`}<text x="50" y="59" text-anchor="middle">${p == null ? '-' : `${p}%`}</text></svg>`;
  const mineBits = (v) => [v.score ? `${v.score} / 10` : '', v.pct != null ? `${v.pct}% co-op` : '', v.outcome && OUTCOMES[v.outcome] ? OUTCOMES[v.outcome] : ''].filter(Boolean);

  // The ratings section of the detail dialog: the numbers, then a button that opens the rate-it sheet.
  function communityHtml(e) {
    if (e.stage === 'wanted') return '';
    const pct = pctOf(e);
    const rows = Object.entries(OUTCOMES).map(([k, label]) => ({ k, label, n: (e.outcomes && e.outcomes[k]) || 0 }));
    const total = rows.reduce((n, o) => n + o.n, 0);
    const mine = API_ON ? (myVotes()[e.id] || {}) : {};
    const bits = mineBits(mine);
    return `<div class="d-section vote" id="vote">
      <div class="vote__head"><h3>Ratings</h3>${API_ON ? `<button type="button" class="btn" data-rate="${esc(e.id)}">${mine.at ? 'Edit my vote' : 'Rate it'}</button>` : ''}</div>
      <div class="vote__cards">
        <div class="vote__card"><span class="vote__label">Co-op</span>${ringSvg(pct)}<span class="small muted">${pctIsVoted(e)
          ? `From ${e.votePctN} votes` : e.votePctN ? `Estimate. ${e.votePctN} of ${PCT_MIN_VOTES} votes so far` : 'Estimate, no votes yet'}</span></div>
        <div class="vote__card"><span class="vote__label">Rating</span>
          <span class="vote__big">${e.userScore != null ? scoreText(e) : '-'}</span>
          <span class="small muted">${e.userScore != null ? 'out of 10' : 'No ratings yet'}</span>
          ${e.userScore != null ? `${starsRow(e.userScore)}<span class="small muted">${ratingsText(e)}</span>` : ''}</div>
        <div class="vote__card"><span class="vote__label">Sessions</span>
          <span class="vote__big">${total || '-'}</span>
          <span class="small muted">${total ? (total === 1 ? 'session reported' : 'sessions reported') : 'None reported yet'}</span></div>
      </div>
      ${total ? `<h4 class="vote__sub">How sessions went</h4><ul class="vote__bars">${rows.map((o) =>
        `<li data-outcome="${o.k}"><span>${o.label}</span><span class="vote__bar"><span style="width:${Math.round(o.n / total * 100)}%"></span></span><span class="mono">${o.n}</span></li>`).join('')}</ul>` : ''}
      ${!API_ON ? '<p class="small muted">Voting opens on the live site.</p>' : bits.length
        ? `<div class="vote__prompt vote__prompt--mine"><span class="vote__tick">${CHECK_SVG}</span><div><strong>Your vote</strong><span>${esc(bits.join(' · '))}</span></div><button type="button" class="btn btn--ghost" data-rate="${esc(e.id)}">Edit</button></div>`
        : `<div class="vote__prompt"><div><strong>Played it?</strong><span>Rate it in about 20 seconds. No account needed.</span></div><button type="button" class="btn" data-rate="${esc(e.id)}">Rate it</button></div>`}
    </div>`;
  }

  // The rate-it sheet: one question at a time, big targets, nothing to read.
  function rateSheetHtml(e) {
    const mine = myVotes()[e.id] || {};
    const pct0 = mine.pct ?? (pctOf(e) ?? 50);
    const score = mine.score || 0;
    const fillOf = (i) => (score >= 2 * i ? 100 : score === 2 * i - 1 ? 50 : 0);
    return `<form class="vote__form rs" data-vote="${esc(e.id)}">
      <div class="rs__head">${coverTile(e, 'sm')}<div><h2 id="rs-title">${e.project && e.project.length <= 24 ? `Rate ${esc(e.project)}` : 'Rate it'}</h2><p>${esc(e.title)}</p></div>
        <button type="button" class="d-close rs__close" data-sheet-close aria-label="Close">×</button></div>

      <div class="rs__q">
        <div class="rs__row"><label for="v-pct">How much could you play together?</label><output class="rs__big">${pct0}%</output></div>
        <input id="v-pct" name="pct" type="range" min="0" max="100" step="5" value="${pct0}" data-touched="${mine.pct != null}">
        <div class="rs__ticks"><span>Barely</span><span>Half</span><span>Most</span><span>All</span></div>
        <div class="rs__words">${pctWords(pct0)}</div>
      </div>

      <div class="rs__q">
        <div class="rs__row"><span id="rs-rate-l">Your rating</span><span class="rs__score">${score ? `${score} / 10` : 'Not rated'}</span></div>
        <div class="stars-pick" role="radiogroup" aria-labelledby="rs-rate-l">
          ${Array.from({ length: 10 }, (_, k) => `<input class="sr-only" type="radio" name="score" id="rs-${k + 1}" value="${k + 1}"${score === k + 1 ? ' checked' : ''}>`).join('')}
          ${[1, 2, 3, 4, 5].map((i) => `<span class="star star--pick"><span class="star__bg">${starSvg()}</span><span class="star__fill" data-fill="${i}" style="width:${fillOf(i)}%">${starSvg()}</span>
            <label class="star__half star__half--l" for="rs-${2 * i - 1}" title="${2 * i - 1} out of 10"><span class="sr-only">${2 * i - 1} out of 10</span></label>
            <label class="star__half star__half--r" for="rs-${2 * i}" title="${2 * i} out of 10"><span class="sr-only">${2 * i} out of 10</span></label></span>`).join('')}
        </div>
        <p class="small muted">Tap the left or right half of a star. Ratings are out of 10.</p>
      </div>

      <div class="rs__q">
        <div class="rs__row"><span id="rs-out-l">How did your session go?</span></div>
        <div class="rs__opts" role="radiogroup" aria-labelledby="rs-out-l">${Object.entries(OUTCOMES).map(([k, label]) =>
          `<label class="opt" data-outcome="${k}"><input class="sr-only" type="radio" name="outcome" value="${k}"${mine.outcome === k ? ' checked' : ''}><span class="opt__row"><span class="opt__icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${OUTCOME_ICONS[k]}"/></svg></span><span class="opt__label">${label}</span><span class="opt__check">${CHECK_SVG}</span></span></label>`).join('')}</div>
      </div>

      <button class="rs__send" type="submit">${mine.at ? 'Update my vote' : 'Send my vote'}</button>
      <p class="vote__status small" role="status">${mine.at ? 'You voted on this one. Sending again replaces your vote.' : 'No account needed. One vote per person, and you can change it later.'}</p>
    </form>`;
  }

  function openRateSheet(id) {
    const e = DATA.find((x) => x.id === id);
    if (!e) return;
    let d = document.getElementById('rate-sheet');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'rate-sheet';
      d.className = 'sheet';
      d.setAttribute('aria-labelledby', 'rs-title');
      document.body.appendChild(d);
      d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-sheet-close]')) d.close(); });
    }
    d.innerHTML = rateSheetHtml(e);
    if (!d.open) d.showModal();
  }

  function sheetThanks(sheet, id) {
    const v = myVotes()[id] || {};
    const line = (k, val) => `<div><span>${k}</span><strong>${esc(val)}</strong></div>`;
    sheet.innerHTML = `<div class="rs rs--done">
      <span class="rs__tick">${CHECK_SVG.replace('width="14" height="14"', 'width="44" height="44"')}</span>
      <h2 id="rs-title">Thanks, your vote is in.</h2><p>It helps the next player decide.</p>
      <div class="rs__sum">${line('Co-op', v.pct != null ? `${v.pct}%` : 'Not said')}${line('Rating', v.score ? `${v.score} / 10` : 'Not rated')}${line('Session', v.outcome && OUTCOMES[v.outcome] ? OUTCOMES[v.outcome] : 'Not said')}</div>
      <button type="button" class="rs__send" data-sheet-close>Done</button>
      <button type="button" class="text-btn" data-rate="${esc(id)}">Change my vote</button></div>`;
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
      status.textContent = 'Pick a rating, say how it went or move the slider first.';
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
      const sheet = document.getElementById('rate-sheet');
      if (sheet && sheet.open) sheetThanks(sheet, id);
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
    const words = range.form.querySelector('.rs__words');
    if (words) words.textContent = pctWords(Number(range.value));
  });
  document.addEventListener('change', (ev) => {
    const r = ev.target.closest('.vote__form input[name="score"]');
    if (!r) return;
    const n = Number(r.value);
    r.form.querySelectorAll('.star__fill[data-fill]').forEach((f) => {
      const i = Number(f.dataset.fill);
      f.style.width = `${n >= 2 * i ? 100 : n === 2 * i - 1 ? 50 : 0}%`;
    });
    const out = r.form.querySelector('.rs__score');
    if (out) out.textContent = `${n} / 10`;
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rate]');
    if (b) openRateSheet(b.dataset.rate);
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
    // Game pages are built from the directory only; a game with just developer-listed (community) projects has none.
    const hasPage = !e.wantedGame && DATA.some((x) => !x.community && !x.wantedGame && SLUG.get(x.id) === slug);
    const wanted = e.stage === 'wanted';

    $('#d-body').innerHTML = `
      <button type="button" class="d-close" data-close aria-label="Close">×</button>
      <div class="d-head">
        ${fullCover(e)}
        <div class="d-head__text">
          <div class="d-head__meta">${ctag(e)}<span>${esc(c.label)}</span>${e.year ? `<span>· ${e.year}</span>` : ''}${reviewTag(e)}</div>
          <h2 class="d-title" id="d-title">${esc(e.title)}</h2>
          <div class="d-head__meta">${subline(e)}</div>
        </div>
      </div>
      ${e.wantedGame ? '' : `<div class="d-verdict">
        <span class="tier" data-tier="${e.quality}">${e.quality === 'X' ? '?' : e.quality}</span>
        <div><strong>${esc(t.label)}</strong><span>${esc(t.text)}</span>${e.devRated ? '<span class="small muted d-devrated">Rated by its devs</span>' : ''}</div>
      </div>`}
      ${e.wantedGame ? wantedDetail(e) : ''}
      ${siblings > 1 && hasPage ? `<a class="d-compare" href="games/${slug}/"><span>${siblings} projects cover this game.</span><strong>Which one should I play? →</strong></a>` : ''}
      ${e.wantedGame ? '' : wanted ? `<div class="d-section d-wanted"><p>Nobody has made <strong>${esc(e.title)}</strong> co-op yet, as far as anyone has found. Know a mod? <a href="https://github.com/cranebeaker/coop-anything/issues/new?template=new-coop-mod.yml" target="_blank" rel="noopener">Add it</a>. Want to build one? <a href="https://github.com/cranebeaker/coop-anything#quick-start" target="_blank" rel="noopener">Co-op Anything</a> shows your AI agent how.</p></div>` : `
      <dl class="facts">
        ${fact('Stage', stagePill(e))}
        ${fact('Co-op', pctBar(e))}
        ${fact('Engine', esc(e.engine || e.genre))}
        ${fact('How you connect', esc(e.toolchain === 'Unknown' ? 'Not stated' : e.toolchain))}
        ${fact('Players', esc(e.players || ''))}
        ${fact('Tested', esc(e.qaLabel || ''))}
        ${fact('Latest release', e.version || e.versionDate ? `<span class="mono">${esc(e.version || 'Release')}</span>${e.versionDate ? `<br><span class="small muted">${esc(fmtDate(e.versionDate))}</span>` : ''}` : '<span class="muted">No release found</span>')}
        ${fact('Last activity', `${actTag(e)}${lastActive(e) && !approxActive(e) ? `<br><span class="small muted">${esc(fmtActive(e))}</span>` : ''}`)}
        ${fact('GitHub stars', e.stars != null ? `<span class="mono">${e.stars.toLocaleString('en')}</span>${
          e.starsWeek > 0 ? `<br><span class="small gain">+${e.starsWeek.toLocaleString('en')} this week</span>` : ''}` : '')}
        ${fact('Open source', e.openSource && e.openSource !== 'unknown' ? esc(e.openSource === 'yes' ? 'Yes' : e.openSource === 'no' ? 'No' : 'Partly') : '')}
        ${fact('Maintained by', esc(e.team || ''))}
      </dl>
      <div class="d-section"><h3>What's synced</h3>${scopeHtml(e)}</div>`}
      ${e.devNote ? `<div class="d-section d-devnote"><h3>Update from the devs</h3><p>${esc(e.devNote)}</p>${e.devNoteDate ? `<p class="small muted">${esc(fmtDate(e.devNoteDate))}</p>` : ''}</div>` : ''}
      ${e.suggested && e.suggested.length ? `<div class="d-section"><h3>Also suggested by the community</h3><ul class="wanted-mods">${e.suggested.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow ugc">${esc(hostOf(s.url))}</a>${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}</li>`).join('')}</ul><p class="small muted">A person looked at these links before they were added, but this site does not run them.</p></div>` : ''}
      ${wanted || e.wantedGame ? '' : communityHtml(e)}
      <div class="d-links">
        ${hasPage ? `<a class="btn d-open" href="games/${slug}/#${encodeURIComponent(e.id)}" title="${siblings > 1 ? `Every detail, the devs' description and video, and how it compares with the other ${siblings - 1} ${siblings === 2 ? 'project' : 'projects'} for ${esc(e.title)}.` : `Every detail, the devs' description and video, sources and comments.`}">Open full page →</a>` : ''}
        ${window.COOP_ACCOUNT?.canEdit(e.id) ? `<button type="button" class="btn btn--edit" data-edit="${esc(e.id)}">${icon('pencil')}Edit listing</button>` : ''}
        <button type="button" class="btn btn--ghost" data-suggest="${esc(e.id)}" title="Know a co-op mod that is missing, or see something wrong here?">Missing something? Suggest it</button>
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
    if (!e.wantedGame) countVisit(e);
  }


  // ── Editing a listing in place ─────────────────────────────
  // Logged-in leads (and MJ) click Edit and the details panel itself turns editable: every value
  // sits where it shows on the card, the description renders as you type, and one Save bar at the
  // bottom sends only what changed to POST /api/listing/edit (the Worker checks it all again).
  const CONNECTS = ['Direct IP', 'Steam (no port forwarding)', 'Hosted relay', 'Dedicated server', 'LAN or split-screen', 'VPN needed'];
  const SYNC_EDIT = [['see', 'players_visible', 'See each other'], ['story', 'story', 'Story'], ['enemies', 'enemies', 'Enemies'], ['world', 'world_state', 'World'], ['items', 'items', 'Items']];
  const EDIT_FIELDS = ['cover', 'quality', 'stage', 'coop_pct', 'engine', 'connect', 'players', 'version', 'summary', 'video', 'note', 'website', 'download', 'repo', 'kind'];

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
          <div><dt>Type</dt><dd><select class="ed-field" name="kind">${opt('', `As listed (${CONSOLES[e.consoleListed ?? e.console]?.label || e.console})`, cur('kind'))}${['mod', 'fork', 'decomp-port', 'framework', 'emulator-netplay'].map((k) => opt(k, CONSOLES[k].label, cur('kind'))).join('')}</select></dd></div>
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
          <label><span>Repository</span><input class="ed-field" name="repo" type="url" value="${esc(cur('repo'))}" placeholder="${esc(e.repo || 'https://github.com/owner/repo')}"></label>
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
        await loadStats(true);
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
      if (state.cl) p.set('cl', '1');
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
    if (state.stages.has('wanted') && !p.get('sort')) { state.sort = 'wanted'; state.dir = 'desc'; }
    (p.get('has') || '').split(',').filter((f) => FEATURE_FILTERS[f]).forEach((f) => state.features.add(f));
    state.ca = p.get('ca') === '1';
    state.cl = p.get('cl') === '1';
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
    Object.assign(state, { q: '', console: '', genre: '', quality: '', toolchain: '', os: '', ca: false, cl: false });
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
  $('#cl-toggle').addEventListener('click', () => { state.cl = !state.cl; render(); });

  // "/" jumps to the search box from anywhere on the page.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || dialog.open) return;
    if (ev.target.closest('input, textarea, select, [contenteditable]')) return;
    ev.preventDefault();
    $('#q').focus();
    $('#q').select();
  });

  // The Filters button opens the panel of dropdowns under the results bar.
  $('#filters-toggle').addEventListener('click', (ev) => {
    const panel = $('#filters-panel');
    panel.hidden = !panel.hidden;
    ev.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  });

  $('#stage-tiles').addEventListener('click', (ev) => {
    const tile = ev.target.closest('.stage-tile');
    if (!tile) return;
    const s = tile.dataset.stage;
    if (s === 'all') {
      state.stages.clear();
      if (state.sort === 'wanted') { state.sort = DEFAULTS.sort; state.dir = DEFAULTS.dir; }
      render();
      return;
    }
    state.stages.has(s) ? state.stages.delete(s) : state.stages.add(s);
    // The Wanted tile is the list to vote on: most wanted first.
    if (s === 'wanted' && state.stages.has('wanted') && state.sort === DEFAULTS.sort) { state.sort = 'wanted'; state.dir = 'desc'; }
    if (s === 'wanted' && !state.stages.has('wanted') && state.sort === 'wanted') { state.sort = DEFAULTS.sort; state.dir = DEFAULTS.dir; }
    render();
  });

  document.addEventListener('click', (ev) => {
    const goto = ev.target.closest('[data-goto]');
    if (goto) { openDetail(goto.dataset.goto); return; }
    const vote = ev.target.closest('[data-wvote]');
    if (vote) { const e = WANTED.get(Number(vote.dataset.wvote)); if (e) castVote(e); return; }
    if (ev.target.closest('#add-game')) { openAddGame(); return; }
    const sug = ev.target.closest('[data-suggest]');
    if (sug) { const e = DATA.find((x) => x.id === sug.dataset.suggest); if (e) openSuggest(e); return; }
    if (ev.target.closest('#more')) { shown += PAGE; render(); }
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
    if (!opener || ev.target.closest('a') || ev.target.closest('[data-wvote]')) return;
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
    : 'cards';

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
