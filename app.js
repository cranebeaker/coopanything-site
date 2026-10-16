(() => {
  'use strict';

  const DATA = Array.isArray(window.RECOMPS) ? window.RECOMPS : [];
  const META = window.RECOMPHAVEN_META || {};
  const DAY = 864e5;

  // ── Reference tables ─────────────────────────────────────

  const CONSOLES = {
    n64: { label: 'Nintendo 64', short: 'N64', color: '#b3242a' },
    x360: { label: 'Xbox 360', short: '360', color: '#107c10' },
    ps1: { label: 'PlayStation', short: 'PS1', color: '#56607a' },
    snes: { label: 'Super Nintendo', short: 'SNES', color: '#6a4fb0' },
    xbox: { label: 'Xbox', short: 'XBOX', color: '#3e6a1d' },
    megadrive: { label: 'Mega Drive / Genesis', short: 'MD', color: '#ad2460' },
    ps2: { label: 'PlayStation 2', short: 'PS2', color: '#1f48a8' },
    ps4: { label: 'PlayStation 4', short: 'PS4', color: '#003a8c' },
    psp: { label: 'PlayStation Portable', short: 'PSP', color: '#7d5f10' },
    dreamcast: { label: 'Dreamcast / NAOMI', short: 'DC', color: '#b04a12' },
    gamecube: { label: 'GameCube', short: 'GC', color: '#5a4a9c' },
    wii: { label: 'Wii', short: 'WII', color: '#2a72a6' },
    wiiu: { label: 'Wii U', short: 'WIIU', color: '#00738f' },
    gba: { label: 'Game Boy Advance', short: 'GBA', color: '#4b2f8f' },
    nds: { label: 'Nintendo DS', short: 'DS', color: '#8f2f74' },
    '3ds': { label: 'Nintendo 3DS', short: '3DS', color: '#a32a4e' },
    arcade: { label: 'Arcade', short: 'ARC', color: '#7a5a20' },
  };

  const STAGES = {
    released: { label: 'Released', blurb: 'Stable, finished releases', long: 'A stable release you can play through. Tagged 1.0 or marked complete by its team.' },
    beta: { label: 'Playable beta', blurb: 'Playable, still in progress', long: 'Public builds you can play, with known gaps the team is still working on.' },
    development: { label: 'In development', blurb: 'Boots or partly works', long: 'Work in progress. It may boot, reach menus or run parts of the game.' },
    abandoned: { label: 'Abandoned', blurb: 'No longer maintained', long: 'The team has stopped work or archived the project.' },
  };
  const STAGE_ORDER = ['released', 'beta', 'development', 'abandoned'];

  const TIERS = {
    S: { label: 'Definitive', text: 'Complete and polished, with enhancements past the original: widescreen, high frame rates, mods. The way to play it now.' },
    A: { label: 'Complete', text: 'Playable start to finish in a stable release. Minor issues at most.' },
    B: { label: 'Playable', text: 'Playable builds with known bugs, missing features or a rough setup.' },
    C: { label: 'Rough', text: 'Boots and partly plays in tagged pre-release builds. Expect crashes and gaps.' },
    D: { label: 'Experimental', text: 'Early research, no public build, or not playable yet.' },
  };
  const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

  const FEATURES = {
    widescreen: 'Widescreen',
    'high-fps': 'High frame rate',
    mods: 'Mod support',
    'ray-tracing': 'Ray tracing',
    multiplayer: 'Multiplayer',
    online: 'Online play',
    launcher: 'Launcher',
    'steam-deck': 'Steam Deck',
  };
  const FEATURE_FILTERS = ['widescreen', 'high-fps', 'mods', 'multiplayer'];

  const SORTS = {
    quality: { label: 'Quality', dir: 'asc', get: (e) => TIER_ORDER.indexOf(e.quality), dirs: ['Best first', 'Worst first'] },
    updated: { label: 'Last activity', dir: 'desc', get: (e) => e.updated, dirs: ['Oldest first', 'Newest first'] },
    release: { label: 'Latest release', dir: 'desc', get: (e) => e.versionDate, dirs: ['Oldest first', 'Newest first'] },
    started: { label: 'Project start', dir: 'desc', get: (e) => e.started, dirs: ['Oldest first', 'Newest first'] },
    stars: { label: 'GitHub stars', dir: 'desc', get: (e) => e.stars, dirs: ['Fewest first', 'Most first'] },
    title: { label: 'Name', dir: 'asc', get: (e) => e.title, dirs: ['A to Z', 'Z to A'] },
    year: { label: 'Original release', dir: 'asc', get: (e) => e.year, dirs: ['Oldest first', 'Newest first'] },
    console: { label: 'Console', dir: 'asc', get: (e) => consoleOf(e).label, dirs: ['A to Z', 'Z to A'] },
    genre: { label: 'Genre', dir: 'asc', get: (e) => e.genre, dirs: ['A to Z', 'Z to A'] },
    stage: { label: 'Stage', dir: 'asc', get: (e) => STAGE_ORDER.indexOf(e.stage), dirs: ['Released first', 'Earliest first'] },
    toolchain: { label: 'Toolchain', dir: 'asc', get: (e) => e.toolchain, dirs: ['A to Z', 'Z to A'] },
  };

  const DEFAULTS = { q: '', console: '', genre: '', quality: '', toolchain: '', sort: 'quality', dir: 'asc' };

  const state = {
    ...DEFAULTS,
    stages: new Set(),
    features: new Set(),
    hideAI: false,
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

  const fmtStars = (n) => (n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));

  const ctag = (e) => {
    const c = consoleOf(e);
    return `<span class="ctag" style="--c:${c.color}" title="${esc(c.label)}">${esc(c.short)}</span>`;
  };
  const stagePill = (e) => `<span class="stage" data-stage="${e.stage}">${esc(STAGES[e.stage]?.label || e.stage)}</span>`;
  const tierTile = (e) => `<span class="tier" data-tier="${e.quality}" title="${esc(e.quality + ': ' + (TIERS[e.quality]?.label || ''))}">${e.quality}</span>`;
  const aiTag = (e) => (e.ai ? '<span class="ai" title="The project discloses substantial AI-generated code">AI</span>' : '');
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

  const haystack = new Map(DATA.map((e) => [e.id, [
    e.title, e.project, e.team, e.toolchain, e.genre, e.developer, consoleOf(e).label, consoleOf(e).short, e.year,
  ].filter(Boolean).join(' ').toLowerCase()]));

  function matches(e, ignoreStage) {
    if (state.q) {
      const hay = haystack.get(e.id);
      const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    if (state.console && e.console !== state.console) return false;
    if (state.genre && e.genre !== state.genre) return false;
    if (state.quality && e.quality !== state.quality) return false;
    if (state.toolchain && e.toolchain !== state.toolchain) return false;
    if (!ignoreStage && state.stages.size && !state.stages.has(e.stage)) return false;
    for (const f of state.features) if (!(e.features || []).includes(f)) return false;
    if (state.hideAI && e.ai) return false;
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
      return (b.stars || 0) - (a.stars || 0) || a.title.localeCompare(b.title, 'en');
    });
  }

  const isFiltered = () =>
    !!(state.q || state.console || state.genre || state.quality || state.toolchain ||
      state.stages.size || state.features.size || state.hideAI);

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
        <td class="col-genre"><div class="stack"><span>${esc(e.genre)}</span><span class="small muted">${e.year || ''}</span></div></td>
        <td>${stagePill(e)}</td>
        <td>${tierTile(e)}</td>
        <td class="col-tool"><span class="mono trunc" title="${esc(e.toolchain)}">${esc(e.toolchain)}</span></td>
        <td class="col-release">${e.version || e.versionDate
          ? `<div class="stack"><span class="mono trunc" title="${esc(e.version || 'Release')}">${esc(e.version || 'Release')}</span><span class="small muted">${esc(fmtDate(e.versionDate))}</span></div>`
          : '<span class="muted">No release</span>'}</td>
        <td class="small col-activity">${actTag(e)}</td>
        <td class="num"><span class="mono">${fmtStars(e.stars)}</span></td>
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
          <div class="card__meta">${ctag(e)}<span>${esc(e.genre)}</span>${e.year ? `<span>${e.year}</span>` : ''}</div>
          ${tierTile(e)}
        </div>
        <div class="card__main">${coverTile(e, 'md')}<div class="game">
          <button type="button" class="game__title" data-open="${esc(e.id)}">${esc(e.title)}</button>
          <span class="game__sub">${subline(e)}</span>
        </div></div>
        ${(e.features || []).length ? `<div class="feats">${e.features.map((f) => `<span class="feat">${esc(FEATURES[f] || f)}</span>`).join('')}</div>` : ''}
        <div class="card__foot">
          ${stagePill(e)}
          <span class="muted">${actTag(e)}<span class="mono" title="GitHub stars">★ ${fmtStars(e.stars)}</span></span>
        </div>
      </article>`).join('');
  }

  function render() {
    const list = sortList(DATA.filter((e) => matches(e)));
    renderStageTiles();

    const total = DATA.length;
    $('#count').innerHTML = list.length === total
      ? `<strong>${total}</strong> recomps tracked`
      : `Showing <strong>${list.length}</strong> of ${total} recomps`;

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
    $('#hide-ai').checked = state.hideAI;
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
    fillSelect($('#f-console'), 'All consoles', [...consoles]
      .sort((a, b) => b[1] - a[1] || consoleOf({ console: a[0] }).label.localeCompare(consoleOf({ console: b[0] }).label))
      .map(([k, n]) => [k, consoleOf({ console: k }).label, n]));

    const genres = countBy('genre');
    fillSelect($('#f-genre'), 'All genres', [...genres].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => [k, k, n]));

    const tiers = countBy('quality');
    fillSelect($('#f-quality'), 'Any quality', TIER_ORDER.filter((t) => tiers.has(t)).map((t) => [t, `${t} · ${TIERS[t].label}`, tiers.get(t)]));

    const tools = countBy('toolchain');
    fillSelect($('#f-toolchain'), 'All toolchains', [...tools]
      .sort((a, b) => (a[0] === 'Custom') - (b[0] === 'Custom') || b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => [k, k === 'Custom' ? 'Custom or unlisted' : k, n]));

    $('#sort').innerHTML = Object.entries(SORTS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');

    $('#feature-chips').innerHTML = '<span class="chips__label">Must have</span>' + FEATURE_FILTERS.map((f) =>
      `<button type="button" class="chip" data-feature="${f}" aria-pressed="false">${FEATURES[f]}</button>`).join('');

    $('#tier-list').innerHTML = TIER_ORDER.map((t) => {
      const n = DATA.filter((e) => e.quality === t).length;
      return `<div class="tier-row" data-tier="${t}">
        <div class="tier-row__label">${t}</div>
        <div class="tier-row__text"><strong>${TIERS[t].label} <em>${n} ${n === 1 ? 'project' : 'projects'}</em></strong><span>${TIERS[t].text}</span></div>
      </div>`;
    }).join('');

    $('#stage-list').innerHTML = STAGE_ORDER.map((s) =>
      `<dt><span class="stage" data-stage="${s}">${STAGES[s].label}</span></dt><dd>${STAGES[s].long}</dd>`).join('');

    if (META.snapshot) {
      $('#snapshot').dateTime = META.snapshot;
      $('#snapshot').textContent = fmtDate(META.snapshot);
    }
  }

  // ── Detail dialog ────────────────────────────────────────

  const dialog = $('#detail');

  function openDetail(id, { push = true } = {}) {
    const e = DATA.find((x) => x.id === id);
    if (!e) return;
    const c = consoleOf(e);
    const t = TIERS[e.quality] || { label: '', text: '' };
    const fact = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');

    $('#d-body').innerHTML = `
      <button type="button" class="d-close" data-close aria-label="Close">×</button>
      <div class="d-head">
        ${fullCover(e)}
        <div class="d-head__text">
          <div class="d-head__meta">${ctag(e)}<span>${esc(c.label)}</span>${e.year ? `<span>· ${e.year}</span>` : ''}${e.developer ? `<span>· ${esc(e.developer)}</span>` : ''}</div>
          <h2 class="d-title" id="d-title">${esc(e.title)}</h2>
          <div class="d-head__meta">${subline(e)}</div>
        </div>
      </div>
      <div class="d-verdict">
        <span class="tier" data-tier="${e.quality}">${e.quality}</span>
        <div><strong>${esc(t.label)}</strong><span>${esc(t.text)}</span></div>
      </div>
      <dl class="facts">
        ${fact('Stage', stagePill(e))}
        ${fact('Genre', esc(e.genre))}
        ${fact('Toolchain', `<span class="mono">${esc(e.toolchain === 'Custom' ? 'Custom or unlisted' : e.toolchain)}</span>`)}
        ${fact('Latest release', e.version || e.versionDate ? `<span class="mono">${esc(e.version || 'Release')}</span>${e.versionDate ? `<br><span class="small muted">${esc(fmtDate(e.versionDate))}</span>` : ''}` : '<span class="muted">No release yet</span>')}
        ${fact('Last activity', `${actTag(e)}${e.updated ? `<br><span class="small muted">${esc(fmtDate(e.updated))}</span>` : ''}`)}
        ${fact('Project started', e.started ? esc(fmtDate(e.started)) : '')}
        ${fact('GitHub stars', e.stars != null ? `<span class="mono">${e.stars.toLocaleString('en')}</span>` : '')}
        ${fact('Maintained by', esc(e.team || ''))}
        ${fact('Original developer', esc(e.developer || ''))}
      </dl>
      ${e.summary ? `<div class="d-section"><h3>About this recomp</h3><p>${esc(e.summary)}</p></div>` : ''}
      ${(e.features || []).length ? `<div class="d-section"><h3>Features</h3><div class="feats">${e.features.map((f) => `<span class="feat">${esc(FEATURES[f] || f)}</span>`).join('')}</div></div>` : ''}
      ${e.requires ? `<div class="d-section"><h3>What you need</h3><p class="d-note">${esc(e.requires)}</p></div>` : ''}
      ${e.ai ? '<div class="d-section"><p class="d-note">This project discloses that a substantial share of its code was written with AI tools.</p></div>' : ''}
      ${e.repo || e.website ? `<div class="d-links">
        ${e.repo ? `<a class="btn" href="${esc(e.repo)}" target="_blank" rel="noopener">Open repository ↗</a>` : ''}
        ${e.website ? `<a class="btn btn--ghost" href="${esc(e.website)}" target="_blank" rel="noopener">Project website ↗</a>` : ''}
      </div>` : ''}`;

    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    dialog.scrollTop = 0;
    if (push) setHash(e.id);
  }

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

  dialog.addEventListener('close', () => setHash(''));
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
      for (const k of ['q', 'console', 'genre', 'quality', 'toolchain']) if (state[k]) p.set(k, state[k]);
      if (state.stages.size) p.set('stage', [...state.stages].join(','));
      if (state.features.size) p.set('has', [...state.features].join(','));
      if (state.hideAI) p.set('noai', '1');
      if (state.sort !== DEFAULTS.sort || state.dir !== DEFAULTS.dir) { p.set('sort', state.sort); p.set('dir', state.dir); }
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch { /* history unavailable */ }
  }

  function readURL() {
    let p;
    try { p = new URLSearchParams(location.search); } catch { return; }
    for (const k of ['q', 'console', 'genre', 'quality', 'toolchain']) if (p.get(k)) state[k] = p.get(k);
    (p.get('stage') || '').split(',').filter((s) => STAGES[s]).forEach((s) => state.stages.add(s));
    (p.get('has') || '').split(',').filter((f) => FEATURES[f]).forEach((f) => state.features.add(f));
    state.hideAI = p.get('noai') === '1';
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
    Object.assign(state, { q: '', console: '', genre: '', quality: '', toolchain: '', hideAI: false });
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

  $('#feature-chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    const f = chip.dataset.feature;
    state.features.has(f) ? state.features.delete(f) : state.features.add(f);
    render();
  });

  $('#hide-ai').addEventListener('change', (ev) => { state.hideAI = ev.target.checked; render(); });

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

  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
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
  $('#q').value = state.q;
  render();

  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial && DATA.some((e) => e.id === initial)) openDetail(initial, { push: false });
})();
