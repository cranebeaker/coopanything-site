// "My projects" (/my/): the mods a logged-in dev can edit, with View, Game page and Edit. The owner
// sees every mod that has a Discord listing, plus a search over all mods. Uses account.js for the
// login and editor.js for editing; the Worker checks every save again.
(() => {
  const box = document.getElementById('my-projects');
  if (!box) return;
  const root = box.dataset.root || '../';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugOf = (title) => title.replace(/\s*\((?!\d{4}\))[^)]*\)\s*$/, '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .toLowerCase().replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const STAGE = { released: 'Playable', beta: 'Partial', development: 'In development', abandoned: 'Abandoned' };
  let mods = [], listings = {};

  async function load() {
    const [m, s] = await Promise.all([
      fetch(`${root}data/mods.json`).then((r) => r.json()),
      fetch('/api/stats').then((r) => r.json()).catch(() => ({})),
    ]);
    mods = m; listings = s.listings || {};
  }

  const row = (m) => {
    const l = listings[m.id] || {};
    const bits = [l.stage ? STAGE[l.stage] : '', l.version ? `v${String(l.version).replace(/^v/i, '')}` : '', l.discord ? 'Discord topic linked' : ''].filter(Boolean);
    return `<li class="my-row">
      <div class="my-row__main"><strong>${esc(m.game)}</strong><span class="game__sub">${esc(m.project)}</span>
        ${bits.length ? `<span class="small muted">${esc(bits.join(' · '))}</span>` : ''}</div>
      <div class="my-row__actions">
        <a class="btn btn--ghost" href="${root}#${encodeURIComponent(m.id)}">View</a>
        <a class="btn btn--ghost" href="${root}games/${slugOf(m.game)}/">Game page</a>
        <a class="btn" href="${root}?edit=${encodeURIComponent(m.id)}#${encodeURIComponent(m.id)}"><svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>Edit</a>
      </div></li>`;
  };

  function render() {
    const acc = window.COOP_ACCOUNT;
    if (!acc.user) {
      box.innerHTML = acc.loginOn
        ? `<p>Log in with Discord to see and edit the mods you're a dev of.</p><p><a class="btn" href="${esc(acc.loginUrl())}">Log in with Discord</a></p>
           <p class="small muted">Not a dev yet? Get your Dev role in the <a href="https://discord.gg/EXGB49R82t" target="_blank" rel="noopener">Co-op Anything Discord</a> (#get-dev-role).</p>`
        : '<p>Logging in with Discord isn’t switched on yet. Until then, devs can edit their listing with <code>/listing edit</code> in their Discord topic.</p>';
      return;
    }
    const all = acc.ids === '*';
    const mine = all ? mods.filter((m) => listings[m.id]?.discord) : mods.filter((m) => acc.ids.includes(m.id));
    box.innerHTML = `
      <p>Logged in as <strong>${esc(acc.user.name)}</strong>. ${all ? 'You can edit every listing.' : `You can edit ${mine.length} ${mine.length === 1 ? 'listing' : 'listings'}.`}</p>
      ${mine.length ? `<h2 class="gp-h2">${all ? 'Mods with a Discord topic' : 'Your mods'}</h2><ul class="my-list">${mine.map(row).join('')}</ul>`
        : '<p class="muted">None yet. In your Discord topic, run <code>/listing link</code> (or <code>/listing add</code> if your mod isn’t on the site), then come back here.</p>'}
      ${all ? `<h2 class="gp-h2">Any mod</h2><input id="my-search" class="my-search" type="search" placeholder="Search all ${mods.length} mods..." autocomplete="off"><ul class="my-list" id="my-results"></ul>` : ''}`;
    const search = document.getElementById('my-search');
    if (search) {
      search.addEventListener('input', () => {
        const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        document.getElementById('my-results').innerHTML = words.length
          ? mods.filter((m) => words.every((w) => `${m.game} ${m.project}`.toLowerCase().includes(w))).slice(0, 30).map(row).join('') : '';
      });
    }
  }

  box.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-edit]');
    if (!btn || !window.COOP_EDITOR) return;
    const m = mods.find((x) => x.id === btn.dataset.edit);
    if (m) window.COOP_EDITOR.open({ id: m.id, title: m.game, project: m.project }, listings[m.id], async () => { await load(); render(); });
  });

  const start = async () => { await load(); render(); };
  if (window.COOP_ACCOUNT?.ready) start(); else window.addEventListener('coop:account', start, { once: true });
})();
