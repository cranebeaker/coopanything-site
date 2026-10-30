// A few seconds of caching at Cloudflare's edge for the public, busy endpoints (/api/stats, the wanted
// votes). Every visitor shares one database read per window instead of making their own: D1's free tier
// allows a limited number of row reads a day, and the site went over it once.
//
// Browsers are told to re-check every time (no-cache): Cloudflare stretches any max-age it sees up to the
// zone's Browser Cache TTL (4 hours), which left people looking at old edits for hours. The re-check is cheap,
// because it is answered from this edge copy and never reaches the database.

const keyFor = (origin, path) => new Request(`${origin}${path}`);

const forBrowser = (body, status, type) => new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });

export async function edgeCached(request, ttl, build) {
  const url = new URL(request.url);
  const cache = caches.default;
  const key = keyFor(url.origin, url.pathname);
  const hit = await cache.match(key).catch(() => null);
  if (hit) return forBrowser(await hit.text(), 200, hit.headers.get('Content-Type') || 'application/json');
  const res = await build();
  const type = res.headers.get('Content-Type') || 'application/json';
  if (res.status !== 200) return res;
  const text = await res.text();
  await cache.put(key, new Response(text, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': `public, s-maxage=${ttl}` } })).catch(() => {});
  return forBrowser(text, 200, type);
}

// After a change, drop this data centre's copy so the person who changed it sees it at once.
export const edgeBust = (origin, path) => caches.default.delete(keyFor(origin, path)).catch(() => false);
