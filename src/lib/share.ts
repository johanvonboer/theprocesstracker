import type { SharedSchemaPayload } from './types';

/** Used for sharing when the user has no sync account of their own. */
export const DEFAULT_API_URL = 'https://api.theprocesstracker.com';

/** Where share links point. The site redirects into the app via deep link. */
const SHARE_LINK_BASE = 'https://theprocesstracker.com/s';

/** Share codes are opaque server-generated strings. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

const MAX_EXERCISES = 200;
const MAX_NAME_LEN = 80;
const MAX_DESC_LEN = 500;

function base(serverUrl?: string | null): string {
  return (serverUrl || DEFAULT_API_URL).replace(/\/$/, '');
}

export function shareLinkFor(code: string): string {
  return `${SHARE_LINK_BASE}/${code}`;
}

/**
 * Uploads a schema snapshot and returns the code others can scan or paste.
 * Deliberately unauthenticated so users without a sync account can share too;
 * the auth header is sent when available so the server can attribute uploads.
 */
export async function shareSchema(
  payload: SharedSchemaPayload,
  auth?: { serverUrl: string; guid: string; secret: string } | null,
): Promise<{ code: string; url: string; expiresAt: string | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = `Bearer ${auth.guid}.${auth.secret}`;

  let res: Response;
  try {
    res = await fetch(`${base(auth?.serverUrl)}/api/v1/schema/share`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the server — check your connection and try again.");
  }
  if (res.status === 413) throw new Error('This schema is too large to share.');
  if (res.status === 429) throw new Error('Too many shares just now — try again in a minute.');
  if (res.status >= 500) throw new Error('The server ran into a problem — try again later.');
  if (!res.ok) throw new Error('Sharing failed — try again later.');

  const data = await res.json().catch(() => null);
  const code = typeof data?.code === 'string' ? data.code : null;
  if (!code || !CODE_PATTERN.test(code)) throw new Error('The server returned an invalid share code.');
  return {
    code,
    url: typeof data?.url === 'string' ? data.url : shareLinkFor(code),
    expiresAt: typeof data?.expiresAt === 'string' ? data.expiresAt : null,
  };
}

export async function fetchSharedSchema(
  code: string,
  serverUrl?: string | null,
): Promise<SharedSchemaPayload> {
  let res: Response;
  try {
    res = await fetch(`${base(serverUrl)}/api/v1/schema/share/${encodeURIComponent(code)}`);
  } catch {
    throw new Error("Couldn't reach the server — check your connection and try again.");
  }
  if (res.status === 404 || res.status === 410) {
    throw new Error('This share code is no longer valid — ask for a new one.');
  }
  if (res.status >= 500) throw new Error('The server ran into a problem — try again later.');
  if (!res.ok) throw new Error('Could not fetch that schema — try again later.');

  const data = await res.json().catch(() => null);
  return validateSharedPayload(data);
}

/**
 * Share payloads arrive from a stranger's device, so nothing is trusted: the
 * shape is checked field by field and strings are trimmed and length-capped
 * before any of it reaches the store.
 */
export function validateSharedPayload(raw: unknown): SharedSchemaPayload {
  const invalid = () => new Error("That doesn't look like a workout schema.");
  if (!raw || typeof raw !== 'object') throw invalid();
  const d = raw as Record<string, unknown>;
  if (d.version !== 1) throw new Error('That schema was shared by a newer version of the app.');
  if (!Array.isArray(d.exercises)) throw invalid();

  const str = (v: unknown, max: number): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const trimmed = v.trim().slice(0, max);
    return trimmed || undefined;
  };
  const num = (v: unknown, max: number): number | undefined => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    const n = Math.round(v);
    return n > 0 ? Math.min(n, max) : undefined;
  };

  const exercises: SharedSchemaPayload['exercises'] = [];
  for (const item of d.exercises.slice(0, MAX_EXERCISES)) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const name = str(e.name, MAX_NAME_LEN);
    if (!name) continue;

    const ov = e.colorOverride as Record<string, unknown> | undefined;
    const yellow = num(ov?.yellowAfterDays, 365);
    const red = num(ov?.redAfterDays, 365);

    exercises.push({
      name,
      ...(str(e.description, MAX_DESC_LEN) ? { description: str(e.description, MAX_DESC_LEN)! } : {}),
      ...(num(e.targetSets, 99) ? { targetSets: num(e.targetSets, 99)! } : {}),
      ...(num(e.targetReps, 999) ? { targetReps: num(e.targetReps, 999)! } : {}),
      // Both thresholds are required, and yellow must come before red.
      ...(yellow && red && yellow < red ? { colorOverride: { yellowAfterDays: yellow, redAfterDays: red } } : {}),
    });
  }
  if (exercises.length === 0) throw new Error('That schema has no exercises in it.');

  return {
    version: 1,
    name: str(d.name, MAX_NAME_LEN) ?? 'Shared schema',
    exercises,
  };
}

/**
 * Pulls a share code out of whatever the user scanned or pasted: a share link,
 * an app deep link, or the bare code itself.
 */
export function parseShareCode(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  if (CODE_PATTERN.test(input)) return input;

  try {
    const url = new URL(input.replace(/^intent:\/\//, 'https://'));
    const fromQuery = url.searchParams.get('code') ?? url.searchParams.get('schema');
    if (fromQuery && CODE_PATTERN.test(fromQuery)) return fromQuery;
    // Path form: /s/<code> (the hash strips any Android intent suffix)
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last && CODE_PATTERN.test(last)) return last;
  } catch {}
  return null;
}
