import type { Account, LegacyCredentials } from './types';

/**
 * The sync/account server. Overridable at build time (VITE_API_URL) so local
 * development can point at a server on localhost.
 */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || 'https://api.theprocesstracker.com')
  .replace(/\/$/, '');

/** A request the server answered with an error status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Calls the API with the session cookie attached. `legacy` sends the pre-account
 * Bearer credential instead, for devices that haven't upgraded yet.
 *
 * Errors: a network failure throws a TypeError-derived message; an error status
 * throws ApiError carrying the server's message when it sent one.
 */
export async function apiFetch<T = any>(
  path: string,
  options: { method?: string; body?: unknown; legacy?: LegacyCredentials | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.legacy) headers['Authorization'] = `Bearer ${options.legacy.guid}.${options.legacy.secret}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const serverMessage = typeof data?.error === 'string' ? data.error : null;
    throw new ApiError(messageFor(res.status, serverMessage), res.status);
  }
  return data as T;
}

/** The server could not be reached at all (offline, DNS, CORS, …). */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach the server — check your connection and try again.");
  }
}

function messageFor(status: number, serverMessage: string | null): string {
  if (status === 429) return 'Too many attempts — wait a little and try again.';
  if (status >= 500) return 'The server ran into a problem — try again later.';
  // 4xx messages from the account endpoints are written for people to read.
  return serverMessage ?? 'The request failed — try again later.';
}

// ── Account endpoints ───────────────────────────────────────────────────────

export async function register(input: {
  username: string;
  password: string;
  email: string | null;
  legacy: LegacyCredentials | null;
}): Promise<Account> {
  const { account } = await apiFetch<{ account: Account }>('/api/v1/auth/register', { body: input });
  return account;
}

export async function login(username: string, password: string): Promise<Account> {
  const { account } = await apiFetch<{ account: Account }>('/api/v1/auth/login', { body: { username, password } });
  return account;
}

// ── Logging in another device with a QR code ──────────────────────────────
// A logged-in device asks for a single-use, short-lived code and shows it as a
// QR code holding <app>/link#<code>. The code rides in the fragment, which
// browsers never send to a server, so it stays out of every request log.

/** A fresh login code for the QR code, and how many seconds it stays valid. */
export async function createLoginLink(): Promise<{ token: string; expiresIn: number }> {
  return apiFetch('/api/v1/auth/link', { method: 'POST' });
}

/** Logs this device in with a code from another device's QR code. */
export async function redeemLoginLink(token: string): Promise<Account> {
  const { account } = await apiFetch<{ account: Account }>('/api/v1/auth/link/redeem', { body: { token } });
  return account;
}

export function loginLinkUrl(token: string): string {
  return `${location.origin}/link#${token}`;
}

/** The code in a scanned login QR code, or null when it is something else. */
export function parseLoginLink(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const token = url.hash.slice(1);
    if (url.pathname === '/link' && /^[0-9a-f]{64}$/.test(token)) return token;
  } catch {}
  return null;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/v1/auth/logout', { method: 'POST' });
}

export async function fetchAccount(): Promise<Account> {
  const { account } = await apiFetch<{ account: Account }>('/api/v1/auth/me');
  return account;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/api/v1/account/password', { body: { currentPassword, newPassword } });
}

export async function setEmail(email: string | null, password: string): Promise<Account> {
  const { account } = await apiFetch<{ account: Account }>('/api/v1/account/email', { body: { email, password } });
  return account;
}

export async function resendVerification(): Promise<void> {
  await apiFetch('/api/v1/account/email/resend', { method: 'POST' });
}

export async function verifyEmail(token: string): Promise<void> {
  await apiFetch('/api/v1/account/email/verify', { body: { token } });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch('/api/v1/auth/password-reset/request', { body: { email } });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch('/api/v1/auth/password-reset/confirm', { body: { token, password } });
}

/** Folds an old GUID account's server data into the logged-in account. */
export async function mergeLegacy(legacy: LegacyCredentials): Promise<void> {
  await apiFetch('/api/v1/account/merge-legacy', { body: legacy });
}

export async function deleteAccount(password: string): Promise<void> {
  await apiFetch('/api/v1/account', { method: 'DELETE', body: { password } });
}

/**
 * Pulls GUID-era credentials out of an old app's "Link another device" QR code
 * (an intent:// or theprocesstracker:// link carrying guid and secret).
 */
export function parseLegacyCredentials(raw: string): LegacyCredentials | null {
  try {
    const url = new URL(raw.trim().replace(/^(intent|theprocesstracker):\/\//, 'https://'));
    const guid = url.searchParams.get('guid')?.trim();
    const secret = url.searchParams.get('secret')?.trim();
    if (guid && secret && isLegacyShape(guid, secret)) return { guid, secret };
  } catch {}
  return null;
}

export function isLegacyShape(guid: string, secret: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(guid)
    && /^[0-9a-f]{64}$/.test(secret);
}
