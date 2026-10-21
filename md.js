// A small markdown renderer for devs' listing descriptions. Safe by construction: the text is
// HTML-escaped first, then only these turn into tags: #, ##, ### headings, - and 1. lists,
// > quotes, **bold**, *italic*, `code`, [text](https://...) links and bare https:// links.
// Links open in a new tab with rel="nofollow noopener ugc"; only http(s) links can match.
window.COOP_MD = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = (href, text) => `<a href="${href}" target="_blank" rel="nofollow noopener ugc">${text}</a>`;

  function inline(raw) {
    const codes = [];
    let t = esc(raw).replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
    t = t.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g, (_, txt, href) => `\u0001${codes.push(link(href, txt)) - 1}\u0001`);
    t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]{3,500})/g, (_, pre, href) => `${pre}\u0001${codes.push(link(href, href)) - 1}\u0001`);
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>');
    return t.replace(/[\u0000\u0001](\d+)[\u0000\u0001]/g, (_, i) => codes[+i]);
  }

  return function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [], list = null;
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
    for (const line of lines) {
      let m;
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = line.match(/^(#{1,3})\s+(.+)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length + 3}>${inline(m[2])}</h${m[1].length + 3}>`); continue; }
      if ((m = line.match(/^\s*[-*]\s+(.+)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.+)$/))) {
        const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
        flushPara();
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[1]);
        continue;
      }
      if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      flushList();
      para.push(line);
    }
    flushPara(); flushList();
    return out.join('');
  };
})();

// A video link (YouTube, Vimeo or Streamable, already checked by the Worker) as an embed.
window.COOP_VIDEO = (url) => {
  let m;
  const u = String(url || '');
  if ((m = u.match(/^https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})$/))) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  if ((m = u.match(/^https:\/\/vimeo\.com\/(\d+)$/))) return `https://player.vimeo.com/video/${m[1]}`;
  if ((m = u.match(/^https:\/\/streamable\.com\/(\w+)$/))) return `https://streamable.com/e/${m[1]}`;
  return null;
};
window.COOP_VIDEO_HTML = (url, title) => {
  const src = window.COOP_VIDEO(url);
  return src ? `<div class="video-embed"><iframe src="${src}" title="${String(title || 'Video').replace(/"/g, '&quot;')}" loading="lazy" allow="fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : '';
};
