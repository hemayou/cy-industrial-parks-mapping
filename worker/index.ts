interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  LOGIN_RATE_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  WORKSPACE_PASSCODE?: string;
  WORKSPACE_SESSION_KEY?: string;
}

const loginPath = '/_workspace/login';
const cookieName = '__Host-cy-workspace';
const sessionSeconds = 4 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};
const unavailable = '访问暂不可用，请稍后再试。';
const invalidPasscode = '访问口令不正确，请重试。';

function loginPage(request: Request, status: number, message?: string): Response {
  const headers = new Headers({
    ...privateHeaders,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'same-origin',
  });
  if (status === 429) headers.set('Retry-After', '60');
  if (request.method === 'HEAD') return new Response(null, { status, headers });

  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>朝阳园产业园区地图</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #162638;
      background: #f1f4f6;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      display: grid;
      align-items: center;
      justify-items: center;
      min-height: 100vh;
      min-height: 100svh;
      padding: 20px;
      margin: 0;
    }
    main {
      width: min(100%, 400px);
      padding: clamp(24px, 6vw, 36px);
      border: 1px solid #d7e0e7;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 14px 38px rgb(22 38 56 / 8%);
    }
    h1 {
      margin: 0;
      font-size: clamp(21px, 5.8vw, 26px);
      font-weight: 650;
      line-height: 1.4;
    }
    form { display: grid; gap: 10px; margin-top: 26px; }
    label { font-size: 14px; font-weight: 600; }
    input, button { min-height: 44px; border-radius: 7px; font: inherit; }
    input { width: 100%; padding: 9px 12px; border: 1px solid #8093a4; color: inherit; }
    button {
      padding: 10px 14px;
      margin-top: 4px;
      border: 0;
      color: #fff;
      background: #162638;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #263e56; }
    :focus-visible { outline: 2px solid #316593; outline-offset: 3px; }
    .message { margin: 2px 0 0; color: #9a302c; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>朝阳园产业园区地图</h1>
    <form action="${loginPath}" method="post">
      <label for="passcode">访问口令</label>
      <input id="passcode" name="passcode" type="password" autocomplete="current-password" required>
      <button type="submit">打开地图</button>
      ${message ? `<p class="message" role="alert">${message}</p>` : ''}
    </form>
  </main>
</body>
</html>`, { status, headers });
}

function plainResponse(request: Request, status: number, message: string): Response {
  return new Response(request.method === 'HEAD' ? null : message, {
    status,
    headers: { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function readPasscode(request: Request): Promise<string | null> {
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded' || !request.body) return null;

  const reader = request.body.getReader();
  const bytes = new Uint8Array(4096);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.length;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  return new URLSearchParams(decoder.decode(bytes.subarray(0, length))).get('passcode');
}

function loadSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function sessionMessage(expiresAt: string, passcode: string) {
  // Include the passcode in the authenticated message so rotation ends existing sessions.
  return encoder.encode(`session-v1:${expiresAt}:${passcode}`);
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function validSession(request: Request, passcode: string, secret: string): Promise<boolean> {
  const prefix = `${cookieName}=`;
  const cookie = request.headers.get('Cookie')?.split(';')
    .map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length);
  const token = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(cookie ?? '');
  if (!token || Number(token[1]) <= Math.floor(Date.now() / 1000)) return false;

  const signed = atob(token[2].replace(/-/g, '+').replace(/_/g, '/') + '=');
  const signature = Uint8Array.from(signed, value => value.charCodeAt(0));
  if (base64url(signature) !== token[2]) return false;
  const key = await loadSigningKey(secret);
  return crypto.subtle.verify('HMAC', key, signature, sessionMessage(token[1], passcode));
}

async function logIn(request: Request, origin: string, env: Env, passcode: string, secret: string): Promise<Response> {
  const requestOrigin = request.headers.get('Origin');
  if (requestOrigin && requestOrigin !== origin) return plainResponse(request, 403, '请从地图访问页提交口令。');

  try {
    const key = request.headers.get('CF-Connecting-IP') || 'unknown';
    const result = await env.LOGIN_RATE_LIMIT.limit({ key });
    if (!result.success) return loginPage(request, 429, '尝试次数过多，请稍后再试。');
  } catch {
    return loginPage(request, 503, unavailable);
  }

  const enteredPasscode = await readPasscode(request);
  if (!enteredPasscode) return loginPage(request, 400, '请输入访问口令。');

  const key = await loadSigningKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(`passcode:${passcode}`));
  const matches = await crypto.subtle.verify('HMAC', key, expected, encoder.encode(`passcode:${enteredPasscode}`));
  if (!matches) return loginPage(request, 401, invalidPasscode);

  const expiresAt = String(Math.floor(Date.now() / 1000) + sessionSeconds);
  const signature = await crypto.subtle.sign('HMAC', key, sessionMessage(expiresAt, passcode));
  const token = `${expiresAt}.${base64url(new Uint8Array(signature))}`;
  return new Response(null, {
    status: 303,
    headers: {
      ...privateHeaders,
      'Location': '/',
      'Set-Cookie': `${cookieName}=${token}; Path=/; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      url.protocol = 'https:';
      return new Response(null, { status: 303, headers: { ...privateHeaders, 'Location': url.href } });
    }

    const passcode = env.WORKSPACE_PASSCODE;
    const secret = env.WORKSPACE_SESSION_KEY;
    if (!passcode?.trim() || !secret?.trim() || secret.length < 32 || secret === passcode) {
      return plainResponse(request, 503, unavailable);
    }

    if (request.method === 'POST' && url.pathname === loginPath) {
      return logIn(request, url.origin, env, passcode, secret);
    }

    if (await validSession(request, passcode, secret)) {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('Cache-Control', privateHeaders['Cache-Control']);
      response.headers.set('X-Robots-Tag', privateHeaders['X-Robots-Tag']);
      return response;
    }

    const isPage = url.pathname === '/' || url.pathname === '/index.html' ||
      request.headers.get('Sec-Fetch-Mode') === 'navigate' || request.headers.get('Accept')?.includes('text/html');
    return isPage ? loginPage(request, 401) : plainResponse(request, 401, '请先输入访问口令。');
  },
};
