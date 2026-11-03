import { beforeEach, describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { API_VERSION, handle, type DailyEntry, type Env, type RunStats } from './handle';
import { LIMITS } from './limits';

class FakeKV {
  store = new Map<string, string>();
  ttl = new Map<string, number | undefined>();
  async get(key: string, opts?: { type?: string } | string): Promise<unknown> {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    const type = typeof opts === 'string' ? opts : opts?.type;
    return type === 'json' ? JSON.parse(raw) : raw;
  }
  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
    this.ttl.set(key, opts?.expirationTtl);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let kv: FakeKV;
let env: Env;

beforeEach(() => {
  kv = new FakeKV();
  env = { PDC_KV: kv as unknown as KVNamespace };
});

const DATE = '2026-11-02';

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const res = await handle(req(method, path, body, headers), env);
  const text = await res.text();
  return { res, data: (text ? JSON.parse(text) : null) as any };
}

function submission(over: Record<string, unknown> = {}) {
  return { nickname: 'Ash', score: 100, seed: 12345, runId: 'run-1', ...over };
}

describe('meta', () => {
  it('health reports the package version', async () => {
    const { res, data } = await call('GET', '/health');
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.version).toBe(pkg.version);
    expect(API_VERSION).toBe(pkg.version);
  });

  it('unknown routes 404 with an error and CORS headers', async () => {
    const { res, data } = await call('GET', '/nope');
    expect(res.status).toBe(404);
    expect(typeof data.error).toBe('string');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('answers OPTIONS preflight with 204 and allow headers', async () => {
    const res = await handle(req('OPTIONS', '/runs'), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('every response carries CORS headers, errors included', async () => {
    for (const r of [
      await call('GET', '/health'),
      await call('GET', '/daily/garbage'),
      await call('POST', `/daily/${DATE}`, '{not json'),
      await call('GET', '/runs/stats'),
    ]) {
      expect(r.res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
  });

  it('echoes only allow-listed origins when ALLOWED_ORIGINS is set', async () => {
    env.ALLOWED_ORIGINS = 'https://a.example, https://b.example';
    const ok = await call('GET', '/health', undefined, { Origin: 'https://b.example' });
    expect(ok.res.headers.get('Access-Control-Allow-Origin')).toBe('https://b.example');
    const bad = await call('GET', '/health', undefined, { Origin: 'https://evil.example' });
    expect(bad.res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const none = await call('GET', '/health');
    expect(none.res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('never throws when storage fails', async () => {
    env = {
      PDC_KV: {
        get: async () => {
          throw new Error('boom');
        },
      } as unknown as KVNamespace,
    };
    const { res, data } = await call('GET', `/daily/${DATE}`);
    expect(res.status).toBe(500);
    expect(typeof data.error).toBe('string');
  });
});

describe('daily', () => {
  it('rejects malformed dates', async () => {
    for (const d of ['2026-13-01', '2026-02-30', 'today', '20261102']) {
      expect((await call('GET', `/daily/${d}`)).res.status).toBe(400);
      expect((await call('POST', `/daily/${d}`, submission())).res.status).toBe(400);
    }
  });

  it('returns an empty list when nothing is stored', async () => {
    const { res, data } = await call('GET', `/daily/${DATE}`);
    expect(res.status).toBe(200);
    expect(data.date).toBe(DATE);
    expect(data.entries).toEqual([]);
  });

  it('keeps entries sorted by score descending', async () => {
    const scores = [50, 900, 300, 300, 0, 1000000];
    for (const [i, score] of scores.entries()) {
      await call('POST', `/daily/${DATE}`, submission({ runId: `r${i}`, score }));
    }
    const { data } = await call('GET', `/daily/${DATE}`);
    const got = (data.entries as DailyEntry[]).map((e) => e.score);
    expect(got).toEqual([...got].sort((a, b) => b - a));
    expect(got).toHaveLength(scores.length);
  });

  it('breaks ties by earlier submittedAt', async () => {
    await call('POST', `/daily/${DATE}`, submission({ runId: 'first', score: 10 }));
    await new Promise((r) => setTimeout(r, 5));
    await call('POST', `/daily/${DATE}`, submission({ runId: 'second', score: 10 }));
    const { data } = await call('GET', `/daily/${DATE}`);
    expect((data.entries as DailyEntry[]).map((e) => e.runId)).toEqual(['first', 'second']);
  });

  it('returns a 1-based rank consistent with the stored order', async () => {
    await call('POST', `/daily/${DATE}`, submission({ runId: 'a', score: 500 }));
    const low = await call('POST', `/daily/${DATE}`, submission({ runId: 'b', score: 100 }));
    expect(low.data.ok).toBe(true);
    expect(low.data.rank).toBe(2);
    const top = await call('POST', `/daily/${DATE}`, submission({ runId: 'c', score: 900 }));
    expect(top.data.rank).toBe(1);
    const entries = top.data.entries as DailyEntry[];
    expect(entries[top.data.rank - 1]?.runId).toBe('c');
  });

  it('keeps one entry per runId and only replaces with a higher score', async () => {
    await call('POST', `/daily/${DATE}`, submission({ score: 200 }));
    const lower = await call('POST', `/daily/${DATE}`, submission({ score: 150 }));
    expect(lower.res.status).toBe(200);
    expect(lower.data.replaced).toBe(false);
    expect(lower.data.entry.score).toBe(200);
    const same = await call('POST', `/daily/${DATE}`, submission({ score: 200 }));
    expect(same.data.replaced).toBe(false);
    const higher = await call('POST', `/daily/${DATE}`, submission({ score: 250 }));
    expect(higher.data.replaced).toBe(true);

    const { data } = await call('GET', `/daily/${DATE}`);
    const mine = (data.entries as DailyEntry[]).filter((e) => e.runId === 'run-1');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.score).toBe(250);
  });

  it('caps stored entries and the page size, dropping the lowest', async () => {
    const seeded: DailyEntry[] = Array.from({ length: LIMITS.dailyCap }, (_, i) => ({
      nickname: 'x',
      score: 1000 + i,
      seed: 1,
      runId: `seed${i}`,
      submittedAt: new Date(i * 1000).toISOString(),
    }));
    await kv.put(`daily:${DATE}`, JSON.stringify(seeded));

    const better = await call('POST', `/daily/${DATE}`, submission({ runId: 'newbie', score: 5000 }));
    expect(better.data.rank).toBe(1);
    const stored = JSON.parse(kv.store.get(`daily:${DATE}`) as string) as DailyEntry[];
    expect(stored.length).toBeLessThanOrEqual(LIMITS.dailyCap);
    expect(stored.some((e) => e.runId === 'seed0')).toBe(false);
    expect(stored.some((e) => e.runId === 'newbie')).toBe(true);
    expect(better.data.entries.length).toBeLessThanOrEqual(LIMITS.pageSize);

    const { data } = await call('GET', `/daily/${DATE}`);
    expect(data.entries.length).toBe(LIMITS.pageSize);
  });

  it('a score below a full board is not stored', async () => {
    const seeded: DailyEntry[] = Array.from({ length: LIMITS.dailyCap }, (_, i) => ({
      nickname: 'x',
      score: 1000 + i,
      seed: 1,
      runId: `seed${i}`,
      submittedAt: new Date(i * 1000).toISOString(),
    }));
    await kv.put(`daily:${DATE}`, JSON.stringify(seeded));
    await call('POST', `/daily/${DATE}`, submission({ runId: 'loser', score: 1 }));
    const stored = JSON.parse(kv.store.get(`daily:${DATE}`) as string) as DailyEntry[];
    expect(stored).toHaveLength(LIMITS.dailyCap);
    expect(stored.some((e) => e.runId === 'loser')).toBe(false);
  });

  it('sanitizes and normalizes optional fields', async () => {
    const { data } = await call(
      'POST',
      `/daily/${DATE}`,
      submission({ nickname: '  Mis\u0000ty\u0007  ', abbrev: 'ab1', result: ' Champion ', version: '0.3.1' }),
    );
    const e = (data.entries as DailyEntry[])[0]!;
    expect(e.nickname).toBe('Misty');
    expect(e.abbrev).toBe('AB1');
    expect(e.result).toBe('Champion');
    expect(e.version).toBe('0.3.1');
    expect(new Date(e.submittedAt).toISOString()).toBe(e.submittedAt);
  });

  it('rejects bad input with 400 and stores nothing', async () => {
    const long = (n: number) => 'a'.repeat(n);
    const bad: Record<string, unknown>[] = [
      { nickname: '' },
      { nickname: '   ' },
      { nickname: '\u0000\u0001' },
      { nickname: long(LIMITS.nicknameMax + 1) },
      { nickname: 42 },
      { score: -1 },
      { score: 1.5 },
      { score: LIMITS.scoreMax + 1 },
      { score: '10' },
      { score: Number.NaN },
      { seed: -1 },
      { seed: LIMITS.seedMax + 1 },
      { seed: 0.5 },
      { runId: '' },
      { runId: long(LIMITS.runIdMax + 1) },
      { runId: 'has space' },
      { runId: 'slash/bad' },
      { abbrev: 'TOOLONG' },
      { abbrev: 'a-b' },
      { result: long(LIMITS.resultMax + 1) },
      { version: long(LIMITS.versionMax + 1) },
    ];
    for (const over of bad) {
      const { res, data } = await call('POST', `/daily/${DATE}`, submission(over));
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(typeof data.error).toBe('string');
    }
    for (const body of ['{not json', '[]', '"str"', 'null']) {
      expect((await call('POST', `/daily/${DATE}`, body)).res.status).toBe(400);
    }
    expect(kv.store.has(`daily:${DATE}`)).toBe(false);
  });

  it('accepts boundary values', async () => {
    const { res } = await call(
      'POST',
      `/daily/${DATE}`,
      submission({
        nickname: 'n'.repeat(LIMITS.nicknameMax),
        score: LIMITS.scoreMax,
        seed: LIMITS.seedMax,
        runId: 'r'.repeat(LIMITS.runIdMax),
        abbrev: 'ABCD',
        result: 'r'.repeat(LIMITS.resultMax),
        version: 'v'.repeat(LIMITS.versionMax),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects oversized bodies', async () => {
    const { res } = await call('POST', `/daily/${DATE}`, submission({ junk: 'x'.repeat(LIMITS.dailyBodyMaxBytes) }));
    expect(res.status).toBe(413);
  });

  it('keeps boards for different dates separate', async () => {
    await call('POST', '/daily/2026-11-02', submission());
    const other = await call('GET', '/daily/2026-11-03');
    expect(other.data.entries).toEqual([]);
  });
});

describe('runs', () => {
  const run = (over: Record<string, unknown> = {}) => ({
    runId: 'run-1',
    phase: 'champion',
    config: { teams: 12 },
    ...over,
  });

  it('returns zeroed stats when none exist', async () => {
    const { res, data } = await call('GET', '/runs/stats');
    expect(res.status).toBe(200);
    const s = data as RunStats;
    expect(s.count).toBe(0);
    expect(s.champions).toBe(0);
    expect(s.daily).toBe(0);
    expect(Object.values(s.eliminated).every((n) => n === 0)).toBe(true);
    for (const t of LIMITS.teamSizes) expect(s.byTeams[String(t)]).toBe(0);
    expect(s.byVersion).toEqual({});
  });

  it('stores the summary with a 90-day TTL and increments counters', async () => {
    const r = await call('POST', '/runs', run({ version: '0.3.1', daily: DATE, score: 321, extra: { any: 'thing' } }));
    expect(r.res.status).toBe(200);
    expect(r.data).toEqual({ ok: true });

    const keys = [...kv.store.keys()].filter((k) => k.startsWith('run:') && k !== 'runs:stats');
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^run:\d{4}-\d{2}-\d{2}:run-1$/);
    expect(kv.ttl.get(keys[0]!)).toBe(LIMITS.runTtlSeconds);

    const { data } = await call('GET', '/runs/stats');
    const s = data as RunStats;
    expect(s.count).toBe(1);
    expect(s.champions).toBe(1);
    expect(s.byTeams['12']).toBe(1);
    expect(s.byVersion['0.3.1']).toBe(1);
    expect(s.daily).toBe(1);
  });

  it('counts eliminations by reason, team size and version', async () => {
    await call('POST', '/runs', run({ runId: 'a', phase: 'eliminated', eliminationReason: 'lossCap', config: { teams: 8 } }));
    await call('POST', '/runs', run({ runId: 'b', phase: 'eliminated', eliminationReason: 'missedPlayoffs', config: { teams: 16 }, version: '1.0.0' }));
    await call('POST', '/runs', run({ runId: 'c', phase: 'eliminated', eliminationReason: 'playoffLoss', version: '1.0.0' }));
    await call('POST', '/runs', run({ runId: 'd', phase: 'champion' }));
    const s = (await call('GET', '/runs/stats')).data as RunStats;
    expect(s.count).toBe(4);
    expect(s.champions).toBe(1);
    expect(s.eliminated).toEqual({ lossCap: 1, missedPlayoffs: 1, playoffLoss: 1 });
    expect((s.byTeams['8'] ?? 0) + (s.byTeams['12'] ?? 0) + (s.byTeams['16'] ?? 0)).toBe(s.count);
    expect(s.byVersion['1.0.0']).toBe(2);
    expect(s.byVersion['unknown']).toBe(2);
    expect(s.champions + Object.values(s.eliminated).reduce((a, b) => a + b, 0)).toBe(s.count);
  });

  it('is idempotent per runId on the same day', async () => {
    const first = await call('POST', '/runs', run());
    expect(first.data.duplicate).toBeUndefined();
    const again = await call('POST', '/runs', run({ phase: 'eliminated' }));
    expect(again.res.status).toBe(200);
    expect(again.data).toEqual({ ok: true, duplicate: true });
    const s = (await call('GET', '/runs/stats')).data as RunStats;
    expect(s.count).toBe(1);
    expect(s.champions).toBe(1);
  });

  it('rejects invalid summaries with 400 and counts nothing', async () => {
    const bad: unknown[] = [
      run({ runId: undefined }),
      run({ runId: 'bad id' }),
      run({ phase: 'winning' }),
      run({ phase: undefined }),
      run({ config: undefined }),
      run({ config: { teams: 10 } }),
      run({ config: { teams: '8' } }),
      run({ eliminationReason: 'rage' }),
      run({ daily: 'yesterday' }),
      run({ version: 'v'.repeat(LIMITS.versionMax + 1) }),
      run({ score: 1.5 }),
      '{oops',
      '[]',
    ];
    for (const body of bad) {
      const { res, data } = await call('POST', '/runs', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(typeof data.error).toBe('string');
    }
    expect(kv.store.size).toBe(0);
  });

  it('rejects bodies over 16 KB', async () => {
    const { res } = await call('POST', '/runs', run({ blob: 'x'.repeat(LIMITS.runBodyMaxBytes) }));
    expect(res.status).toBe(413);
    expect(kv.store.size).toBe(0);
  });

  it('survives a corrupt stats record', async () => {
    await kv.put('runs:stats', JSON.stringify({ count: 'many', byVersion: null, eliminated: 7 }));
    expect((await call('POST', '/runs', run())).res.status).toBe(200);
    const s = (await call('GET', '/runs/stats')).data as RunStats;
    expect(s.count).toBe(1);
  });

  it('caps distinct tracked versions', async () => {
    for (let i = 0; i < LIMITS.maxVersions + 5; i++) {
      await call('POST', '/runs', run({ runId: `r${i}`, version: `v${i}` }));
    }
    const s = (await call('GET', '/runs/stats')).data as RunStats;
    expect(Object.keys(s.byVersion).length).toBeLessThanOrEqual(LIMITS.maxVersions + 1);
    expect(Object.values(s.byVersion).reduce((a, b) => a + b, 0)).toBe(s.count);
  });
});
