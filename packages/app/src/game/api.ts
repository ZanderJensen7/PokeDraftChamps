// The online client: the daily leaderboard and the opt-in run-summary upload, against the Cloudflare Worker in
// packages/api. Optional by design: with VITE_PDC_API_URL unset every call short-circuits and nothing is fetched.
// Never throws; every request times out after 8 s and bypasses the HTTP cache (and the service worker's runtime
// caches, which only match the sprite and font hosts).
import type { RunSummary } from '@pdc/engine';
import { APP_VERSION } from '../app/version';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DailyEntry {
  nickname: string;
  score: number;
  seed: number;
  runId: string;
  abbrev?: string;
  result?: string;
  version?: string;
  submittedAt: number | string;
}

export interface DailyBoard {
  date: string;
  entries: DailyEntry[];
}

export interface DailySubmission {
  nickname: string;
  score: number;
  seed: number;
  runId: string;
  abbrev?: string;
  result?: string;
}

export interface DailyPostResult {
  rank: number;
  entries: DailyEntry[];
}

const TIMEOUT_MS = 8000;

/** The API base URL from the build env: trimmed, no trailing slash, '' when unset. */
export function apiBase(): string {
  const raw = import.meta.env.VITE_PDC_API_URL;
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
}

export function apiEnabled(): boolean {
  return apiBase() !== '';
}

/** The API's host for status lines ("api.example.com"), or the raw base when it does not parse. */
export function apiHost(): string {
  const base = apiBase();
  try {
    return new URL(base).host || base;
  } catch {
    return base;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) return { ok: false, error: 'Leaderboard not configured in this build.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      cache: 'no-store',
      signal: ctrl.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON: handled below */
    }
    if (!res.ok) {
      const msg = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Server error ${res.status}`;
      return { ok: false, error: msg };
    }
    if (data === null || typeof data !== 'object') return { ok: false, error: 'Unexpected reply from the server.' };
    return { ok: true, data: data as T };
  } catch (e) {
    if (ctrl.signal.aborted) return { ok: false, error: 'The server took too long to answer.' };
    return { ok: false, error: e instanceof Error && e.message ? `Network error: ${e.message}` : 'Network error.' };
  } finally {
    clearTimeout(timer);
  }
}

const entriesOf = (x: unknown): DailyEntry[] => (Array.isArray(x) ? (x as DailyEntry[]) : []);

/** Top 100 for a date, sorted by score (the server sorts). */
export async function fetchDailyBoard(date: string): Promise<ApiResult<DailyBoard>> {
  const res = await request<Partial<DailyBoard>>('GET', `/daily/${encodeURIComponent(date)}`);
  if (!res.ok) return res;
  return { ok: true, data: { date: typeof res.data.date === 'string' ? res.data.date : date, entries: entriesOf(res.data.entries) } };
}

/** Posts a daily score. Resubmitting the same runId only replaces a lower score (server rule). */
export async function postDailyScore(date: string, entry: DailySubmission): Promise<ApiResult<DailyPostResult>> {
  const res = await request<Partial<DailyPostResult>>('POST', `/daily/${encodeURIComponent(date)}`, {
    ...entry,
    version: APP_VERSION.version,
  });
  if (!res.ok) return res;
  if (typeof res.data.rank !== 'number') return { ok: false, error: 'Unexpected reply from the server.' };
  return { ok: true, data: { rank: res.data.rank, entries: entriesOf(res.data.entries) } };
}

/**
 * The opt-in anonymous run-summary upload. The coach name and tag are left out (the setting promises
 * "never your name"); `version` carries the app version string, as the API expects.
 */
export async function postRunSummary(summary: RunSummary): Promise<ApiResult<{ ok: true }>> {
  const { humanName: _name, humanAbbrev: _abbrev, ...rest } = summary;
  return request<{ ok: true }>('POST', '/runs', { ...rest, version: APP_VERSION.version });
}
