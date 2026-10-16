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
    'keyboard-mouse': 'Keyboard & mouse',
    keyboard: 'Keyboard',
  };
  // "Must have" chips: each matches any of its feature tags.
  const FEATURE_FILTERS = {
    widescreen: { label: 'Widescreen', tags: ['widescreen'] },
    'high-fps': { label: 'High frame rate', tags: ['high-fps'] },
    mods: { label: 'Mod support', tags: ['mods'] },
    multiplayer: { label: 'Multiplayer', tags: ['multiplayer'] },
    kbm: { label: 'Keyboard/mouse', tags: ['keyboard-mouse', 'keyboard'], title: 'Playable with a keyboard, with or without the mouse' },
  };

  // PC operating systems a recomp runs on (the "platforms" field). Logos from
  // Simple Icons (CC0); the 24×24 paths are filled with currentColor.
  const OS = {
    windows: { label: 'Windows', path: 'M0,0H11.377V11.372H0ZM12.623,0H24V11.372H12.623ZM0,12.623H11.377V24H0Zm12.623,0H24V24H12.623' },
    linux: { label: 'Linux', path: 'M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z' },
    macos: { label: 'macOS', path: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701' },
  };
  const OS_ORDER = ['windows', 'linux', 'macos'];
  const PLATFORM_SOURCE = {
    release: 'Downloads on its latest GitHub release',
    readme: "Going by the project's README",
  };

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

  const DEFAULTS = { q: '', console: '', genre: '', quality: '', toolchain: '', os: '', sort: 'quality', dir: 'asc' };

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
  const osIcon = (k) => `<svg class="os-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${OS[k].path}"/></svg>`;

  // Table: all three logos in fixed slots, the unsupported ones dimmed, so rows line up.
  function osSlots(e) {
    if (!e.platforms) return '<span class="muted small" title="Not stated by the project">—</span>';
    const names = e.platforms.map((k) => OS[k].label).join(', ');
    return `<span class="os-set" title="Runs on ${esc(names)}" aria-label="Runs on ${esc(names)}">${OS_ORDER.map((k) =>
      `<span class="os-slot${e.platforms.includes(k) ? '' : ' is-off'}">${osIcon(k)}</span>`).join('')}</span>`;
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
    if (state.os && !(e.platforms || []).includes(state.os)) return false;
    if (!ignoreStage && state.stages.size && !state.stages.has(e.stage)) return false;
    for (const f of state.features) if (!FEATURE_FILTERS[f].tags.some((t) => (e.features || []).includes(t))) return false;
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
    !!(state.q || state.console || state.genre || state.quality || state.toolchain || state.os ||
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
        <td class="col-os">${osSlots(e)}</td>
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
          <div class="card__meta">${ctag(e)}<span>${esc(e.genre)}</span>${e.year ? `<span>${e.year}</span>` : ''}${osInline(e)}</div>
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

    const osCount = (k) => DATA.filter((e) => (e.platforms || []).includes(k)).length;
    $('#os-filter').innerHTML = `<button type="button" data-os="" aria-pressed="true">All</button>` +
      OS_ORDER.map((k) => `<button type="button" data-os="${k}" aria-pressed="false" title="${osCount(k)} recomps run on ${OS[k].label}">${osIcon(k)}<span>${OS[k].label}</span></button>`).join('');

    $('#feature-chips').innerHTML = '<span class="chips__label">Must have</span>' + Object.entries(FEATURE_FILTERS).map(([f, c]) =>
      `<button type="button" class="chip" data-feature="${f}" aria-pressed="false"${c.title ? ` title="${c.title}"` : ''}>${c.label}</button>`).join('');

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
        <div class="fact--wide"><dt>Runs on</dt><dd>${e.platforms
          ? `<span class="os-chips">${e.platforms.map((k) => `<span class="os-chip">${osIcon(k)}${OS[k].label}</span>`).join('')}</span>${
            PLATFORM_SOURCE[e.platformsFrom] ? `<span class="small muted os-note">${PLATFORM_SOURCE[e.platformsFrom]}</span>` : ''}`
          : '<span class="muted">Not stated by the project</span>'}</dd></div>
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
      for (const k of ['q', 'console', 'genre', 'quality', 'toolchain', 'os']) if (state[k]) p.set(k, state[k]);
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
    if (OS[p.get('os')]) state.os = p.get('os');
    (p.get('stage') || '').split(',').filter((s) => STAGES[s]).forEach((s) => state.stages.add(s));
    (p.get('has') || '').split(',').filter((f) => FEATURE_FILTERS[f]).forEach((f) => state.features.add(f));
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
    Object.assign(state, { q: '', console: '', genre: '', quality: '', toolchain: '', os: '', hideAI: false });
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

  $('#os-filter').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-os]');
    if (!b) return;
    state.os = b.dataset.os;
    render();
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
