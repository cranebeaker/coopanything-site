// "Log in with Discord" for mod devs. Discord's OAuth2 code flow with the identify and
// guilds.members.read scopes: we learn who you are and your roles in the Co-op Anything server,
// and nothing else. A session is a random id in an HttpOnly cookie, stored in D1 with those roles.
//   GET  /auth/login?return=/path   off to Discord
//   GET  /auth/callback             back from Discord: make the session, return
//   POST /auth/logout
//   GET  /api/me                    { user, owner, roles } or { user: null }
// Needs vars DISCORD_CLIENT_ID, GUILD_ID, OWNER_ID and the secret DISCORD_CLIENT_SECRET; until the
// secret is set, logging in says so instead of half working.

const COOKIE = 'ca_session';
const STATE = 'ca_oauth';
const DAYS = 30;
const API = 'https://discord.com/api/v10';

const randomId = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(/;\s*/).filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
  }));
}

const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// Only paths on this site: never send people to another site after logging in.
function safeReturn(value) {
  const v = String(value || '/');
  return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v.slice(0, 500) : '/';
}

const redirect = (to, extraHeaders = []) => {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const [k, v] of extraHeaders) h.append(k, v);
  return new Response(null, { status: 302, headers: h });
};

export async function login(request, env, url) {
  if (!env.DISCORD_CLIENT_SECRET) return new Response('Logging in with Discord isn’t switched on yet.', { status: 503 });
  const state = randomId();
  const back = safeReturn(url.searchParams.get('return'));
  const to = new URL('https://discord.com/oauth2/authorize');
  to.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify guilds.members.read',
    redirect_uri: `${url.origin}/auth/callback`, state,
  });
  return redirect(to.toString(), [['Set-Cookie', cookie(STATE, `${state}|${back}`, 600)]]);
}

export async function callback(request, env, url) {
  const [state, back] = (cookies(request)[STATE] || '').split('|');
  const clearState = ['Set-Cookie', cookie(STATE, '', 0)];
  if (!state || url.searchParams.get('state') !== state) return redirect('/?login=failed', [clearState]);
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return redirect(safeReturn(back), [clearState]);

  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`,
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) return redirect('/?login=failed', [clearState]);
  const { access_token: token } = await tokenRes.json();
  const auth = { Authorization: `Bearer ${token}` };
  const user = await (await fetch(`${API}/users/@me`, { headers: auth })).json();
  const memberRes = await fetch(`${API}/users/@me/guilds/${env.GUILD_ID}/member`, { headers: auth });
  const memberInfo = memberRes.ok ? await memberRes.json() : null;
  const roles = memberInfo?.roles || [];
  const joined = memberInfo?.joined_at ? Date.parse(memberInfo.joined_at) : null;

  const id = randomId();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, name, avatar, roles, created, expires, member, joined) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, user.global_name || user.username, user.avatar || null, JSON.stringify(roles), now, now + DAYS * 864e5, memberInfo ? 1 : 0, joined).run();
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now).run();
  return redirect(safeReturn(back), [clearState, ['Set-Cookie', cookie(COOKIE, id, DAYS * 86400)]]);
}

export async function logout(request, env) {
  const id = cookies(request)[COOKIE];
  if (id) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie(COOKIE, '', 0), 'Cache-Control': 'no-store' },
  });
}

export async function session(request, env) {
  const id = cookies(request)[COOKIE];
  if (!id) return null;
  const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND expires > ?').bind(id, Date.now()).first();
  if (!row) return null;
  return { userId: row.user_id, name: row.name, avatar: row.avatar, roles: JSON.parse(row.roles || '[]'), owner: row.user_id === env.OWNER_ID, member: row.member === 1, joined: row.joined };
}

export async function me(request, env) {
  const s = await session(request, env);
  const body = s
    ? { user: { id: s.userId, name: s.name, avatar: s.avatar }, owner: s.owner, roles: s.roles, loginOn: true }
    : { user: null, loginOn: Boolean(env.DISCORD_CLIENT_SECRET) };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
