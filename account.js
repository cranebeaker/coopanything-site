// "Dev login" in the header: log in with Discord (worker/auth.js) so a mod's devs can edit their
// listing on the site. Sets window.COOP_ACCOUNT and fires a "coop:account" event once it knows.
(() => {
  const DISCORD = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52c-.21.38-.45.88-.62 1.29a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.29 19.7 19.7 0 0 0-4.88 1.52C.53 9.05-.32 13.58.1 18.06a19.9 19.9 0 0 0 6.02 3.06c.48-.66.9-1.36 1.27-2.09a13 13 0 0 1-1.95-.94l.48-.37a14.2 14.2 0 0 0 12.16 0l.48.37c-.62.37-1.28.68-1.96.94.37.73.8 1.43 1.27 2.09a19.8 19.8 0 0 0 6.03-3.06c.5-5.18-.84-9.67-3.55-13.69ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42 2.18 1.1 2.16 2.42c0 1.33-.95 2.42-2.16 2.42Z"/></svg>';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { user: null, owner: false, ids: [], loginOn: false, ready: false };
  window.COOP_ACCOUNT = {
    get user() { return state.user; },
    get ready() { return state.ready; },
    get ids() { return state.ids; },
    get loginOn() { return state.loginOn; },
    canEdit: (id) => Boolean(state.user) && (state.ids === '*' || state.ids.includes(id)),
    loginUrl: () => `/auth/login?return=${encodeURIComponent(location.pathname + location.search + location.hash)}`,
  };

  function render() {
    const bar = document.querySelector('.masthead__actions');
    if (!bar) return;
    bar.querySelector('.account')?.remove();
    const box = document.createElement('div');
    box.className = 'account';
    if (state.user) {
      const pic = state.user.avatar ? `https://cdn.discordapp.com/avatars/${state.user.id}/${state.user.avatar}.png?size=64` : '';
      box.innerHTML = `<button type="button" class="account__me" aria-haspopup="true" aria-expanded="false" title="Logged in with Discord">
          ${pic ? `<img src="${esc(pic)}" alt="" width="26" height="26">` : DISCORD}<span>${esc(state.user.name)}</span></button>
        <div class="account__menu" hidden><p class="small muted">${state.ids === '*' ? 'You can edit every listing.' : `You can edit ${state.ids.length} ${state.ids.length === 1 ? 'listing' : 'listings'}.`}</p>
          <a class="account__link" href="/my/">My projects</a>
          <button type="button" class="text-btn" data-logout>Log out</button></div>`;
      box.querySelector('.account__me').addEventListener('click', (ev) => {
        const menu = box.querySelector('.account__menu');
        menu.hidden = !menu.hidden;
        ev.currentTarget.setAttribute('aria-expanded', String(!menu.hidden));
      });
      box.querySelector('[data-logout]').addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
        location.reload();
      });
    } else if (state.loginOn) {
      box.innerHTML = `<a class="submit-btn feedback-btn account__login" href="${esc(window.COOP_ACCOUNT.loginUrl())}" title="Mod devs: log in with Discord to edit your mod's listing">${DISCORD}<span>Dev login</span></a>`;
    } else {
      return;
    }
    bar.insertBefore(box, bar.querySelector('.lang-btn') || bar.querySelector('#theme-toggle'));
  }

  async function load() {
    try {
      const meRes = await fetch('/api/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (!meRes.ok) return;
      const me = await meRes.json();
      state.user = me.user; state.owner = Boolean(me.owner); state.loginOn = Boolean(me.loginOn);
      if (me.user) {
        const mine = await (await fetch('/api/my-listings', { credentials: 'same-origin' })).json();
        state.ids = mine.ids || [];
      }
    } catch { /* static hosting or offline: no login */ }
    state.ready = true;
    render();
    window.dispatchEvent(new CustomEvent('coop:account'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
