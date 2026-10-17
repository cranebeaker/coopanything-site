// Game pages (games/<slug>/, built by tools/build_pages.py): the theme toggle, the ratings and
// comments, visit counting and the box-art fallback. The list page does its share in app.js.
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
    giscus({ theme: isDark() ? 'dark' : 'light' });
  });
  darkMQ && darkMQ.addEventListener && darkMQ.addEventListener('change', sync);
  sync();

  // ── Ratings and comments (giscus, see comments_html() in tools/build_pages.py) ──

  function giscus(config) {
    const frame = document.querySelector('iframe.giscus-frame');
    if (frame) frame.contentWindow.postMessage({ giscus: { setConfig: config } }, 'https://giscus.app');
  }

  // giscus starts in the system's light or dark; match a theme picked with the toggle.
  let themed = false;
  window.addEventListener('message', (ev) => {
    if (ev.origin !== 'https://giscus.app' || themed) return;
    themed = true;
    if (root.dataset.theme) giscus({ theme: isDark() ? 'dark' : 'light' });
  });

  const comments = document.getElementById('comments');
  if (comments) {
    const status = comments.querySelector('.gp-rate__status');
    const tabs = [...comments.querySelectorAll('.gp-tabs [data-term]')];

    const showProject = (term) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.term === term)));
      giscus({ term });
      status.textContent = '';
    };
    tabs.forEach((t) => t.addEventListener('click', () => showProject(t.dataset.term)));

    // "Be the first to rate it" on a project's card opens that project's thread.
    document.addEventListener('click', (ev) => {
      const link = ev.target.closest('a[data-rate]');
      if (link && tabs.length) showProject(link.dataset.rate);
    });

    comments.querySelector('.gp-rate__buttons').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-score]');
      if (!b) return;
      const text = `Score: ${b.dataset.score}/10`;
      comments.querySelectorAll('.gp-rate__buttons button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      try {
        await navigator.clipboard.writeText(`${text}\n\n`);
        status.textContent = `Copied "${text}". Paste it at the start of your comment below, add your thoughts, and post.`;
      } catch {
        status.textContent = `Start your comment below with "${text}", then add your thoughts and post.`;
      }
    });
  }

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
