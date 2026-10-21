// The listing editor for logged-in mod devs: a markdown description with live preview, a video
// link (embedded from YouTube, Vimeo or Streamable, never uploaded), links, players, stage,
// version, a short news note and what's synced. Saves to POST /api/listing/edit; the Worker
// checks everything again (worker/listings.js). Discord's /listing edits the same fields.
window.COOP_EDITOR = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = [['', 'Keep as listed'], ['released', 'Playable'], ['beta', 'Partial'], ['development', 'In development'], ['abandoned', 'Abandoned']];
  const SYNC = [['story', 'Story'], ['enemies', 'Enemies'], ['world', 'World'], ['items', 'Items']];
  const SYNC_V = [['', 'Keep as listed'], ['yes', 'Synced'], ['partial', 'Partly'], ['no', 'Not synced']];
  const FIELDS = ['summary', 'video', 'website', 'download', 'players', 'stage', 'version', 'note', 'cover', 'quality', 'coop_pct', 'engine', 'connect'];
  const TIER_OPTS = [['', 'Keep as listed'], ['A', 'A: Complete'], ['B', 'B: Playable'], ['C', 'C: Rough'], ['D', 'D: Experimental'], ['X', 'X: None yet']];
  const CONNECT = [['', 'Keep as listed'], ...['Direct IP', 'Steam (no port forwarding)', 'Hosted relay', 'Dedicated server', 'LAN or split-screen', 'VPN needed'].map((c) => [c, c])];
  let dialog, current, onSaved;

  const select = (name, opts, value) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}"${v === (value || '') ? ' selected' : ''}>${l}</option>`).join('')}</select>`;

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'editor';
    dialog.className = 'editor';
    dialog.setAttribute('aria-labelledby', 'editor-title');
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });
  }

  function open(entry, listing, saved) {
    if (!dialog) build();
    current = { entry, listing: listing || {} };
    onSaved = saved;
    const l = current.listing;
    const sync = l.sync || {};
    dialog.innerHTML = `
      <form class="editor__form" method="dialog" novalidate>
        <div class="editor__head">
          <h2 id="editor-title">Edit listing</h2>
          <p class="small muted">${esc(entry.title)}: ${esc(entry.project || '')}</p>
          <button type="button" class="d-close" data-close aria-label="Close">×</button>
        </div>
        <label class="editor__label">Description <span class="small muted">(markdown, shown on your listing)</span></label>
        <div class="editor__tabs" role="tablist">
          <button type="button" role="tab" aria-selected="true" data-tab="write">Write</button>
          <button type="button" role="tab" aria-selected="false" data-tab="preview">Preview</button>
          <span class="editor__tools" aria-label="Formatting">
            <button type="button" data-md="**|**" title="Bold"><b>B</b></button>
            <button type="button" data-md="*|*" title="Italic"><i>I</i></button>
            <button type="button" data-md="## |" title="Heading">H</button>
            <button type="button" data-md="- |" title="List">•</button>
            <button type="button" data-md="[|](https://)" title="Link">🔗</button>
            <button type="button" data-md="\`|\`" title="Code">&lt;/&gt;</button>
          </span>
        </div>
        <textarea name="summary" rows="10" maxlength="4000" placeholder="What does your mod do, what's synced, how do people play it?">${esc(l.summary || '')}</textarea>
        <div class="editor__preview md" hidden></div>
        <p class="small muted editor__count"><span data-count>0</span> / 4000</p>
        <div class="editor__grid">
          <label>Video link <span class="small muted">YouTube, Vimeo or Streamable</span><input name="video" type="url" value="${esc(l.video || '')}" placeholder="https://www.youtube.com/watch?v=..."></label>
          <label>Website<input name="website" type="url" value="${esc(l.website || '')}" placeholder="https://..."></label>
          <label>Download<input name="download" type="url" value="${esc(l.download || '')}" placeholder="https://.../releases"></label>
          <label>Players<input name="players" value="${esc(l.players || '')}" placeholder="2-4" maxlength="20"></label>
          <label>Stage${select('stage', STAGES, l.stage)}</label>
          <label>Latest version<input name="version" value="${esc(l.version || '')}" placeholder="v0.4.0" maxlength="40"></label>
        </div>
        <fieldset class="editor__sync"><legend>Card details</legend>
          <label>Cover image link <span class="small muted">an image file, or from Steam, Imgur, GitHub</span><input name="cover" type="url" value="${esc(l.cover || '')}" placeholder="https://.../cover.jpg"></label>
          <label>Tier <span class="small muted">your own rating; S is picked by MJ</span>${select('quality', window.COOP_ACCOUNT?.ids === '*' ? [...TIER_OPTS.slice(0, 1), ['S', 'S: Definitive'], ...TIER_OPTS.slice(1)] : TIER_OPTS, l.quality)}</label>
          <label>Co-op % <span class="small muted">0 to 100; players' votes replace it</span><input name="coop_pct" type="number" min="0" max="100" step="1" value="${l.coopPct ?? ''}"></label>
          <label>Engine<input name="engine" value="${esc(l.engine || '')}" maxlength="60" placeholder="Unreal Engine 4"></label>
          <label>How you connect${select('connect', CONNECT, l.connect)}</label>
        </fieldset>
        <label>Short news <span class="small muted">(one line, no links, shows as "Update from the devs")</span><input name="note" value="${esc(l.note || '')}" maxlength="200"></label>
        <fieldset class="editor__sync"><legend>What's synced</legend>
          ${SYNC.map(([k, label]) => `<label>${label}${select(`sync_${k}`, SYNC_V, sync[k])}</label>`).join('')}
        </fieldset>
        <p class="editor__status" role="status" aria-live="polite"></p>
        <div class="editor__actions">
          <button type="button" class="btn btn--ghost" data-close>Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
      </form>`;
    const form = dialog.querySelector('form');
    const area = form.summary;
    const preview = form.querySelector('.editor__preview');
    const count = () => { form.querySelector('[data-count]').textContent = area.value.length; };
    count();
    area.addEventListener('input', count);
    form.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
    form.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
      const show = tab.dataset.tab === 'preview';
      form.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      preview.innerHTML = show ? (window.COOP_MD(area.value) || '<p class="muted">Nothing to preview yet.</p>') + (form.video.value ? window.COOP_VIDEO_HTML(form.video.value, entry.title) : '') : '';
      preview.hidden = !show; area.hidden = show;
    }));
    form.querySelectorAll('[data-md]').forEach((b) => b.addEventListener('click', () => {
      const [before, after] = b.dataset.md.split('|');
      const { selectionStart: s, selectionEnd: e, value } = area;
      area.value = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
      area.focus();
      area.setSelectionRange(s + before.length, e + before.length);
      count();
    }));
    form.addEventListener('submit', (ev) => { ev.preventDefault(); save(form); });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  async function save(form) {
    const status = form.querySelector('.editor__status');
    const button = form.querySelector('[type="submit"]');
    const l = current.listing;
    const body = { id: current.entry.id, clear: [] };
    for (const f of FIELDS) {
      const v = form[f].value.trim();
      const before = ((f === 'coop_pct' ? l.coopPct : l[f]) ?? '').toString();
      if (v && v !== before) body[f] = v;
      else if (!v && before && f !== 'stage' && f !== 'quality' && f !== 'connect') body.clear.push(f);
    }
    const sync = {};
    for (const [k] of SYNC) sync[k] = form[`sync_${k}`].value;
    if (JSON.stringify(Object.fromEntries(Object.entries(sync).filter(([, v]) => v))) !== JSON.stringify(l.sync || {})) {
      body.sync = sync;
      if (!Object.values(sync).some(Boolean)) body.clear.push('sync');
    }
    if (Object.keys(body).length === 2 && !body.clear.length) { status.textContent = 'Nothing changed.'; return; }
    button.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Saving…';
    try {
      const res = await fetch('/api/listing/edit', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || 'Couldn’t save. Try again later.');
      status.dataset.state = 'ok';
      status.textContent = 'Saved. It’s live on your listing now.';
      onSaved?.(out.listing);
      setTimeout(() => dialog.close(), 700);
    } catch (err) {
      status.dataset.state = 'error';
      status.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }

  return { open };
})();
