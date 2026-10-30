// Game pages (games/<slug>/, built by tools/build_pages.py): the theme toggle, community votes,
// visit counting and the box-art fallback. The list page does
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

  // Community votes and visits, from the Worker (worker/index.js). Each project card's
  // "Players say" line and Co-op % switch to players' numbers once there are enough votes.
  const API = '/api';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let apiOn = false;
  const counted = new Set();
  const countVisit = (id) => {
    if (!apiOn || counted.has(id)) return;
    counted.add(id);
    try { if (sessionStorage.getItem(`rh-hit:${id}`)) return; sessionStorage.setItem(`rh-hit:${id}`, '1'); } catch { /* no storage: count it */ }
    try { navigator.sendBeacon(`${API}/hit`, JSON.stringify({ id })); } catch { /* no beacon */ }
  };
  document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[data-visit]');
    if (link) countVisit(link.dataset.visit);
  });
  const DISCORD_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/></svg>';
  const OUTCOMES = { finished: 'finished it together', mostly: 'played a lot', broke: 'broke after a while', 'no-start': 'couldn’t start it' };
  (async () => {
    try {
      const res = await fetch(`${API}/stats`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const { stats = {}, listings = {} } = await res.json();
      // /listing from Discord: the devs' topic link and their latest note, on each project card.
      document.querySelectorAll('[data-listing]').forEach((el) => {
        const l = listings[el.dataset.listing];
        const card = el.closest('.gp-card');
        if (l && l.quality && card) {
          const tile = card.querySelector('.tier');
          if (tile) { tile.dataset.tier = l.quality; tile.textContent = l.quality === 'X' ? '?' : l.quality; tile.title = `${l.quality}: rated by its devs`; }
        }
        if (!l || !(l.discord || l.note || l.summary || l.video || l.download)) return;
        el.innerHTML = (l.download ? `<a class="btn" href="${esc(l.download)}" target="_blank" rel="noopener nofollow">Download ↗</a>` : '')
          + (l.discord ? `<a class="btn btn--discord" href="${esc(l.discord)}" target="_blank" rel="noopener">${DISCORD_ICON}Discord topic</a>` : '')
          + (l.note ? `<span class="gp-devnote"><strong>Update from the devs:</strong> ${esc(l.note)}</span>` : '')
          + (l.summary && window.COOP_MD ? `<div class="gp-devsummary md">${window.COOP_MD(l.summary)}</div>` : '')
          + (l.video && window.COOP_VIDEO_HTML ? `<div class="gp-devsummary">${window.COOP_VIDEO_HTML(l.video)}</div>` : '')
          + `<a class="gp-edit" href="../../?edit=${encodeURIComponent(el.dataset.listing)}#${encodeURIComponent(el.dataset.listing)}" hidden><svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>Edit listing</a>`;
        el.hidden = false;
      });
      // Logged-in devs get an Edit link on their own projects (the editor lives on the main page).
      const showEdit = () => document.querySelectorAll('[data-listing]').forEach((el) => {
        const a = el.querySelector('.gp-edit');
        if (a && window.COOP_ACCOUNT?.canEdit(el.dataset.listing)) { a.hidden = false; el.hidden = false; }
      });
      if (window.COOP_ACCOUNT?.ready) showEdit(); else window.addEventListener('coop:account', showEdit);
      apiOn = true;
      if (document.body.dataset.visit) countVisit(document.body.dataset.visit);
      document.querySelectorAll('[data-community]').forEach((el) => {
        const s = stats[el.dataset.community];
        if (!s || !s.n) return;
        const bits = [];
        if (s.scoreN) bits.push(`<span class="mono">${s.score.toFixed(1)}</span> / 10 from ${s.scoreN} ${s.scoreN === 1 ? 'rating' : 'ratings'}`);
        const top = Object.entries(s.outcomes || {}).sort((a, b) => b[1] - a[1])[0];
        if (top) bits.push(`${top[1]} ${OUTCOMES[top[0]] || esc(top[0])}`);
        el.innerHTML = `${bits.join('<br>')}<br><a href="../../?vote=1#${esc(el.dataset.community)}">Add your vote</a>`;
      });
      document.querySelectorAll('[data-pct]').forEach((el) => {
        const s = stats[el.dataset.pct];
        if (!s || !(s.pctN >= 3)) return;
        el.innerHTML = `<span class="pct" style="--p:${s.pct}" title="${s.pct}% of the game playable together: the average of ${s.pctN} players' votes">`
          + `<span class="pct__track"><span class="pct__fill"></span></span><span class="pct__n mono">${s.pct}%</span><span class="pct__voted"><svg class="icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span></span>`;
      });
    } catch { /* static hosting or offline */ }
  })();

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

  // Featured playthrough (playthrough_html() in tools/build_pages.py): the thumbnail turns into
  // YouTube's no-cookie player when pressed, as in app.js.
  document.addEventListener('click', (ev) => {
    const button = ev.target.closest('button[data-youtube]');
    if (!button) return;
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.youtube}?autoplay=1&rel=0`;
    frame.title = button.getAttribute('aria-label').replace(/^Play the /, 'The ');
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    button.replaceWith(frame);
  });

  // A cover that fails to load turns into the initials placeholder.
  document.addEventListener('error', (ev) => {
    const box = ev.target instanceof HTMLImageElement && ev.target.closest('.cover, .d-cover');
    if (!box) return;
    if (box.classList.contains('d-cover')) box.className = 'cover cover--lg';
    box.classList.add('cover--none');
    box.textContent = box.dataset.initials;
  }, true);
})();
