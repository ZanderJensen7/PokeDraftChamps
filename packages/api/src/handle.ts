import pkg from '../package.json';
import { LIMITS } from './limits';

export interface Env {
  PDC_KV: KVNamespace;
  ALLOWED_ORIGINS?: string;
}

export interface DailyEntry {
  nickname: string;
  score: number;
  seed: number;
  runId: string;
  abbrev?: string;
  result?: string;
  version?: string;
  submittedAt: string;
}

export interface RunStats {
  count: number;
  champions: number;
  eliminated: { lossCap: number; missedPlayoffs: number; playoffLoss: number };
  byTeams: Record<string, number>;
  byVersion: Record<string, number>;
  daily: number;
  updatedAt: string;
}

/** The package version (npm run bump moves every workspace together). */
export const API_VERSION: string = pkg.version;

type EliminationReason = (typeof LIMITS.eliminationReasons)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RUN_ID_RE = /^[A-Za-z0-9_-]+$/;
const ABBREV_RE = /^[A-Z0-9]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- CORS / responses ----------

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const allowed = (env.ALLOWED_ORIGINS ?? '*').trim();
  if (allowed === '' || allowed === '*') {
    headers['Access-Control-Allow-Origin'] = '*';
  } else {
    const origin = request.headers.get('Origin');
    const list = allowed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (origin && list.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------- validation helpers ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function intInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function validRunId(v: unknown): v is string {
  return (
    typeof v === 'string' && v.length >= LIMITS.runIdMin && v.length <= LIMITS.runIdMax && RUN_ID_RE.test(v)
  );
}

function cleanText(v: string): string {
  return v.replace(CONTROL_RE, '').trim();
}

/** Optional short text field: undefined when absent or blank, throws when too long. */
function optionalText(v: unknown, name: string, max: number): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be a string`);
  const t = cleanText(v);
  if (t.length > max) throw new HttpError(400, `${name} must be at most ${max} characters`);
  return t.length > 0 ? t : undefined;
}

async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'body too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
  if (!isRecord(parsed)) throw new HttpError(400, 'body must be a JSON object');
  return parsed;
}

function parseDailySubmission(body: Record<string, unknown>): Omit<DailyEntry, 'submittedAt'> {
  const { nickname, score, seed, runId, abbrev } = body;
  if (typeof nickname !== 'string') throw new HttpError(400, 'nickname must be a string');
  const nick = cleanText(nickname);
  if (nick.length < LIMITS.nicknameMin || nick.length > LIMITS.nicknameMax) {
    throw new HttpError(400, `nickname must be ${LIMITS.nicknameMin}-${LIMITS.nicknameMax} characters`);
  }
  if (!intInRange(score, 0, LIMITS.scoreMax)) throw new HttpError(400, 'score must be an integer in range');
  if (!intInRange(seed, 0, LIMITS.seedMax)) throw new HttpError(400, 'seed must be an integer in range');
  if (!validRunId(runId)) throw new HttpError(400, 'runId must be 1-64 characters of A-Z a-z 0-9 _ -');

  const entry: Omit<DailyEntry, 'submittedAt'> = { nickname: nick, score, seed, runId };

  if (abbrev !== undefined) {
    if (typeof abbrev !== 'string') throw new HttpError(400, 'abbrev must be a string');
    const a = abbrev.trim().toUpperCase();
    if (a.length > LIMITS.abbrevMax || (a.length > 0 && !ABBREV_RE.test(a))) {
      throw new HttpError(400, `abbrev must be at most ${LIMITS.abbrevMax} letters or digits`);
    }
    if (a.length > 0) entry.abbrev = a;
  }
  const result = optionalText(body.result, 'result', LIMITS.resultMax);
  if (result !== undefined) entry.result = result;
  const version = optionalText(body.version, 'version', LIMITS.versionMax);
  if (version !== undefined) entry.version = version;
  return entry;
}

function compareEntries(a: DailyEntry, b: DailyEntry): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.submittedAt !== b.submittedAt) return a.submittedAt < b.submittedAt ? -1 : 1;
  return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
}

// ---------- daily ----------

async function loadDaily(env: Env, date: string): Promise<DailyEntry[]> {
  const stored = await env.PDC_KV.get<DailyEntry[]>(`daily:${date}`, { type: 'json' });
  return Array.isArray(stored) ? stored : [];
}

async function getDaily(env: Env, date: string, cors: Record<string, string>): Promise<Response> {
  const entries = (await loadDaily(env, date)).sort(compareEntries).slice(0, LIMITS.pageSize);
  return json({ date, entries }, 200, cors);
}

async function postDaily(
  request: Request,
  env: Env,
  date: string,
  cors: Record<string, string>,
): Promise<Response> {
  const body = await readJsonObject(request, LIMITS.dailyBodyMaxBytes);
  const fields = parseDailySubmission(body);
  const stored = await loadDaily(env, date);

  const existing = stored.find((e) => e.runId === fields.runId);
  if (existing && existing.score >= fields.score) {
    const sorted = [...stored].sort(compareEntries);
    return json(
      {
        ok: true,
        replaced: false,
        entry: existing,
        rank: sorted.findIndex((e) => e.runId === existing.runId) + 1,
        entries: sorted.slice(0, LIMITS.pageSize),
      },
      200,
      cors,
    );
  }

  const entry: DailyEntry = { ...fields, submittedAt: new Date().toISOString() };
  const merged = stored.filter((e) => e.runId !== fields.runId);
  merged.push(entry);
  merged.sort(compareEntries);
  const rank = merged.findIndex((e) => e.runId === entry.runId) + 1;
  const kept = merged.slice(0, LIMITS.dailyCap);
  await env.PDC_KV.put(`daily:${date}`, JSON.stringify(kept));
  return json(
    { ok: true, replaced: existing !== undefined, rank, entries: kept.slice(0, LIMITS.pageSize) },
    200,
    cors,
  );
}

// ---------- runs ----------

function emptyStats(): RunStats {
  return {
    count: 0,
    champions: 0,
    eliminated: { lossCap: 0, missedPlayoffs: 0, playoffLoss: 0 },
    byTeams: { '8': 0, '12': 0, '16': 0 },
    byVersion: {},
    daily: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Coerce whatever is stored into a well-formed RunStats. */
function normalizeStats(raw: unknown): RunStats {
  const stats = emptyStats();
  if (!isRecord(raw)) return stats;
  stats.count = num(raw.count);
  stats.champions = num(raw.champions);
  stats.daily = num(raw.daily);
  if (typeof raw.updatedAt === 'string') stats.updatedAt = raw.updatedAt;
  if (isRecord(raw.eliminated)) {
    for (const k of LIMITS.eliminationReasons) stats.eliminated[k] = num(raw.eliminated[k]);
  }
  if (isRecord(raw.byTeams)) {
    for (const k of LIMITS.teamSizes) stats.byTeams[String(k)] = num(raw.byTeams[String(k)]);
  }
  if (isRecord(raw.byVersion)) {
    for (const [k, v] of Object.entries(raw.byVersion)) stats.byVersion[k] = num(v);
  }
  return stats;
}

function parseRunSummary(body: Record<string, unknown>): {
  runId: string;
  phase: 'champion' | 'eliminated';
  teams: number;
  reason?: EliminationReason;
  daily: boolean;
  version?: string;
} {
  const { runId, phase, config, eliminationReason, daily, score } = body;
  if (!validRunId(runId)) throw new HttpError(400, 'runId must be 1-64 characters of A-Z a-z 0-9 _ -');
  if (phase !== 'champion' && phase !== 'eliminated') {
    throw new HttpError(400, 'phase must be champion or eliminated');
  }
  if (!isRecord(config)) throw new HttpError(400, 'config must be an object');
  const teams = config.teams;
  if (typeof teams !== 'number' || !(LIMITS.teamSizes as readonly number[]).includes(teams)) {
    throw new HttpError(400, `config.teams must be one of ${LIMITS.teamSizes.join(', ')}`);
  }
  let reason: EliminationReason | undefined;
  if (eliminationReason !== undefined) {
    reason = LIMITS.eliminationReasons.find((r) => r === eliminationReason);
    if (!reason) {
      throw new HttpError(400, `eliminationReason must be one of ${LIMITS.eliminationReasons.join(', ')}`);
    }
  }
  if (daily !== undefined && (typeof daily !== 'string' || !isValidDate(daily))) {
    throw new HttpError(400, 'daily must be a YYYY-MM-DD date');
  }
  const version = optionalText(body.version, 'version', LIMITS.versionMax);
  if (score !== undefined && !intInRange(score, 0, LIMITS.scoreMax)) {
    throw new HttpError(400, 'score must be an integer in range');
  }
  return { runId, phase, teams, reason, daily: daily !== undefined, version };
}

async function postRun(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJsonObject(request, LIMITS.runBodyMaxBytes);
  const run = parseRunSummary(body);

  const today = new Date().toISOString().slice(0, 10);
  const key = `run:${today}:${run.runId}`;
  if ((await env.PDC_KV.get(key)) !== null) return json({ ok: true, duplicate: true }, 200, cors);

  await env.PDC_KV.put(key, JSON.stringify(body), { expirationTtl: LIMITS.runTtlSeconds });

  const stats = normalizeStats(await env.PDC_KV.get('runs:stats', { type: 'json' }));
  stats.count += 1;
  if (run.phase === 'champion') stats.champions += 1;
  else if (run.reason) stats.eliminated[run.reason] += 1;
  const teamKey = String(run.teams);
  stats.byTeams[teamKey] = (stats.byTeams[teamKey] ?? 0) + 1;
  if (run.daily) stats.daily += 1;

  let vKey = run.version ?? 'unknown';
  const known = (k: string) => Object.hasOwn(stats.byVersion, k);
  if (!known(vKey) && Object.keys(stats.byVersion).length >= LIMITS.maxVersions) vKey = 'other';
  stats.byVersion[vKey] = (known(vKey) ? (stats.byVersion[vKey] ?? 0) : 0) + 1;

  stats.updatedAt = new Date().toISOString();
  await env.PDC_KV.put('runs:stats', JSON.stringify(stats));
  return json({ ok: true }, 200, cors);
}

async function getRunStats(env: Env, cors: Record<string, string>): Promise<Response> {
  return json(normalizeStats(await env.PDC_KV.get('runs:stats', { type: 'json' })), 200, cors);
}

// ---------- router ----------

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    if (path === '/health' && method === 'GET') return json({ ok: true, version: API_VERSION }, 200, cors);

    const daily = /^\/daily\/([^/]+)$/.exec(path);
    if (daily && (method === 'GET' || method === 'POST')) {
      const date = daily[1] ?? '';
      if (!isValidDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      return method === 'GET' ? await getDaily(env, date, cors) : await postDaily(request, env, date, cors);
    }

    if (path === '/runs' && method === 'POST') return await postRun(request, env, cors);
    if (path === '/runs/stats' && method === 'GET') return await getRunStats(env, cors);

    throw new HttpError(404, 'not found');
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
    return json({ error: 'internal error' }, 500, cors);
  }
}
