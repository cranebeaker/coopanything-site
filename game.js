// Game pages (games/<slug>/, built by tools/build_pages.py): the theme toggle, the ratings and
// comments, update-email sign-ups, visit counting and the box-art fallback. The list page does
// its share in app.js.
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

  // "Get update emails" on a project's card: update alerts by email, through the newsletter
  // Worker in <meta name="rh-mail"> (newsletter/worker.js). The same as in app.js.
  const MAIL_API = ((document.querySelector('meta[name="rh-mail"]') || {}).content || '').replace(/\/+$/, '');
  const remember = {
    get() { try { return localStorage.getItem('rh-mail-email') || ''; } catch { return ''; } },
    set(v) { try { localStorage.setItem('rh-mail-email', v); } catch { /* storage unavailable */ } },
  };

  async function submitMail(form) {
    const status = form.querySelector('.mail-form__status');
    const submit = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const body = { email, website: String(data.get('website') || ''), weekly: !form.dataset.recomp || data.get('weekly') === 'on' };
    if (form.dataset.recomp) body.recomp = form.dataset.recomp;
    submit.disabled = true;
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
      if (ok) remember.set(email);
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Couldn’t reach the sign-up service. Check your connection and try again.';
    } finally {
      submit.disabled = false;
    }
  }

  if (MAIL_API) {
    document.addEventListener('submit', (ev) => {
      const form = ev.target.closest('form[data-mail-form]');
      if (!form) return;
      ev.preventDefault();
      submitMail(form);
    });
    document.addEventListener('click', (ev) => {
      const toggle = ev.target.closest('[data-follow-toggle]');
      const form = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
      if (!form) return;
      form.hidden = !form.hidden;
      toggle.setAttribute('aria-expanded', String(!form.hidden));
      if (form.hidden) return;
      const input = form.querySelector('input[type="email"]');
      if (!input.value) input.value = remember.get();
      input.focus();
    });
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
