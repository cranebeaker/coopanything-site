// Game pages (games/<slug>/, built by tools/build_pages.py): the theme toggle and the
// box-art fallback. The list page does the same in app.js.
(() => {
  'use strict';

  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : !!(darkMQ && darkMQ.matches);
  const sync = () => button.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');

  let saved = null;
  try { saved = localStorage.getItem('rh-theme'); } catch { /* storage unavailable */ }
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  button.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('rh-theme', root.dataset.theme); } catch { /* storage unavailable */ }
    sync();
  });
  darkMQ && darkMQ.addEventListener && darkMQ.addEventListener('change', sync);
  sync();

  // Visits for Trending (tools/track_visits.py): one GoatCounter event per project, for a
  // game page with a single project and for any project's repository or website link.
  // GoatCounter's script is only on the built site, and only once it's set up.
  const countVisit = (id) => {
    try { window.goatcounter.count({ path: `recomp/${id}`, event: true }); } catch { /* not loaded */ }
  };
  document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[data-visit]');
    if (link) countVisit(link.dataset.visit);
  });
  if (document.body.dataset.visit) {
    window.addEventListener('load', () => countVisit(document.body.dataset.visit));
  }

  // A cover that fails to load turns into the initials placeholder.
  document.addEventListener('error', (ev) => {
    const box = ev.target instanceof HTMLImageElement && ev.target.closest('.cover, .d-cover');
    if (!box) return;
    if (box.classList.contains('d-cover')) box.className = 'cover cover--lg';
    box.classList.add('cover--none');
    box.textContent = box.dataset.initials;
  }, true);
})();
