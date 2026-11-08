const GITHUB_API = 'https://api.github.com';
const API_HEADERS = { 'User-Agent': 'yesid-login', 'X-GitHub-Api-Version': '2022-11-28' };

/** Refresh five minutes before GitHub's one-hour expiry, so a token never dies mid-request. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const base64Url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return [0x80 | bytes.length, ...bytes];
}

/** GitHub issues PKCS#1 keys, but Web Crypto only imports PKCS#8, so the key gets wrapped. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = [0x02, 0x01, 0x00];
  const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octetString = [0x04, ...derLength(pkcs1.length)];
  const inner = version.length + rsaAlgorithm.length + octetString.length + pkcs1.length;
  return Uint8Array.from([0x30, ...derLength(inner), ...version, ...rsaAlgorithm, ...octetString, ...pkcs1]);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const match = pem.match(/-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (RSA )?PRIVATE KEY-----/);
  if (!match) throw new Error('The GitHub App private key is not a PEM private key');

  const der = Uint8Array.from(atob(match[2].replace(/\s/g, '')), (char) => char.charCodeAt(0));
  const pkcs8 = match[1] ? pkcs1ToPkcs8(der) : der;
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** A ten-minute JWT identifying the App, with the clock allowance GitHub recommends. */
export async function appJwt(appId: string, pem: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await importPrivateKey(pem);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(signature)}`;
}

export interface GitHubAppConfig {
  appId: string;
  installationId: string;
  privateKey: string;
  repo: string;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

/** Each repository keeps its own token, so one client's request can never reuse another's. */
export const tokenCacheKey = ({ installationId, repo }: Pick<GitHubAppConfig, 'installationId' | 'repo'>) => `${installationId}:${repo}`;

/** A token limited to one repository, to file contents and metadata, for about an hour. */
export async function installationToken(config: GitHubAppConfig): Promise<string> {
  const key = tokenCacheKey(config);
  const cached = cache.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.token;

  const response = await fetch(`${GITHUB_API}/app/installations/${config.installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      ...API_HEADERS,
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${await appJwt(config.appId, config.privateKey)}`
    },
    body: JSON.stringify({ repositories: [config.repo], permissions: { contents: 'write', metadata: 'read' } })
  });
  if (!response.ok) throw new Error(`GitHub refused an installation token: ${response.status}`);

  const { token, expires_at: expiresAt } = (await response.json()) as { token: string; expires_at: string };
  cache.set(key, { token, expiresAt: Date.parse(expiresAt) });
  return token;
}

/** Sends a checked request to GitHub with the App's token, which the browser never sees. */
export async function forward(path: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(API_HEADERS)) headers.set(name, value);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${GITHUB_API}${path}`, { ...init, headers });
}

export const withPushPermission = (repository: Record<string, unknown>): Record<string, unknown> => ({
  ...repository,
  permissions: { ...(repository.permissions as object), push: true }
});

export interface Editor {
  id: string;
  name: string;
  email: string;
}

/** What Sveltia reads from `/user`, for someone who has no GitHub account. */
export const editorProfile = (editor: Editor) => ({
  id: editor.id,
  login: editor.id,
  name: editor.name,
  email: editor.email,
  avatar_url: null,
  html_url: null,
  bot: false
});
