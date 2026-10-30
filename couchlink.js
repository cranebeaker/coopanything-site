// Couchlink page (/couchlink/): search, tier filter and "Show more" over the cards tools/build_pages.py wrote.
// With no script the whole list is still there; this only narrows it, and draws it a page at a time
// (cards and covers past the first page are not shown, so their images are not fetched either).
(() => {
  const list = document.getElementById('cl-cards');
  const input = document.getElementById('cl-q');
  if (!list || !input) return;
  const cards = [...list.querySelectorAll('.cl-card')];
  const chips = [...document.querySelectorAll('.cl-chip')];
  const count = document.getElementById('cl-count');
  const empty = document.getElementById('cl-empty');
  const moreWrap = document.getElementById('cl-more-wrap');
  const more = document.getElementById('cl-more');
  const PAGE = 48;
  const tiers = new Set();
  let limit = PAGE, sig = '';

  // Accents, case and punctuation don't count; every typed word must be somewhere in the card.
  const fold = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const hay = cards.map((c) => fold(c.dataset.search));
  const tierOf = cards.map((c) => c.dataset.tier);
  const shownNow = new Array(cards.length).fill(true);
  const n = (x) => x.toLocaleString('en');
  const games = (x) => `${n(x)} ${x === 1 ? 'game' : 'games'}`;

  function render() {
    const words = fold(input.value).split(' ').filter(Boolean);
    const nextSig = JSON.stringify([words, [...tiers].sort()]);
    if (nextSig !== sig) { sig = nextSig; limit = PAGE; }

    // One read-free pass: which cards match the words, per tier, and which of those fit this page.
    const perTier = {};
    let matched = 0, shown = 0;
    const want = new Array(cards.length);
    for (let i = 0; i < cards.length; i += 1) {
      let ok = true;
      for (let k = 0; k < words.length; k += 1) if (!hay[i].includes(words[k])) { ok = false; break; }
      if (ok) perTier[tierOf[i]] = (perTier[tierOf[i]] || 0) + 1;
      ok = ok && (!tiers.size || tiers.has(tierOf[i]));
      if (ok) matched += 1;
      want[i] = ok && shown < limit;
      if (want[i]) shown += 1;
    }
    // Write only what changed.
    for (let i = 0; i < cards.length; i += 1) {
      if (want[i] !== shownNow[i]) { cards[i].hidden = !want[i]; shownNow[i] = want[i]; }
    }

    count.textContent = shown < matched ? `Showing ${n(shown)} of ${games(matched)}` : games(matched);
    empty.hidden = matched > 0;
    moreWrap.hidden = shown >= matched;
    if (shown < matched) more.textContent = `Show ${n(Math.min(PAGE, matched - shown))} more (${n(matched - shown)} left)`;
    chips.forEach((b) => {
      b.setAttribute('aria-pressed', String(tiers.has(b.dataset.tier)));
      b.querySelector('.cl-chip__n').textContent = n(perTier[b.dataset.tier] || 0);
    });

    const p = new URLSearchParams(location.search);
    if (input.value) p.set('q', input.value); else p.delete('q');
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  input.addEventListener('input', render);
  more.addEventListener('click', () => { limit += PAGE; render(); });
  chips.forEach((b) => b.addEventListener('click', () => {
    if (tiers.has(b.dataset.tier)) tiers.delete(b.dataset.tier); else tiers.add(b.dataset.tier);
    render();
  }));
  document.getElementById('cl-reset').addEventListener('click', () => { input.value = ''; tiers.clear(); render(); input.focus(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      ev.preventDefault(); input.focus();
    }
  });
  const q = new URLSearchParams(location.search).get('q');
  if (q) input.value = q;
  render();
})();
