// Draft AI arena: seeded 12-coach drafts where half the coaches pick with config A and half with config B (which half
// alternates by draft, so seat order cancels out), then every A coach plays every B coach once (home alternating).
// Battles use the default HeuristicPlayer, so only the drafting differs. Node-only.
//
//   npm run draft-arena -w @pdc/engine -- --drafts 60 --seed 1 --a fit
//
// Options: --drafts N (40, rounded up to even) --seed S (1) --teams 8|12|16 (12) --no-megas
//          --a / --b k=v,... (fit, roles=N (every roleBonus), overpay=N, any numeric AI_DRAFT_DIALS key)
//          --jobs J (min(cpus - 2, 16)) --shard i/J (internal)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  aiChoosePick, aiRosterTarget, AI_DRAFT_DIALS, createRng, createRun, currentPicker, deriveSeed, draftPick, draftRoles,
  draftStop, aiWantsToStop, finishDraft, getDraftMon, isBulky, isFast, runPool, DEFAULT_LEAGUE_CONFIG, MOVE_CATEGORIES,
  type AiDraftDials, type Coach, type LeagueConfig, type RunState,
} from '../src';
import { engineDeps } from '../src/battle';

interface Side { fit: boolean; dials: Partial<AiDraftDials> }
interface Opts { drafts: number; seed: number; teams: 8 | 12 | 16; megas: boolean; a: Side; b: Side; jobs: number; shard?: [number, number] }

const ROLES = ['Entry Hazards', 'Hazard Removal', 'Healing', 'Priority'] as const;

function parseSide(s: string): Side {
  const side: Side = { fit: false, dials: {} };
  const dials = side.dials as Record<string, unknown>;
  for (const kv of s.split(',').filter(Boolean)) {
    const [k, v = 'true'] = kv.split('=');
    if (k === 'fit') { side.fit = v === 'true' || v === '1'; continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${k} needs a number`);
    if (k === 'roles') dials.roleBonus = Object.fromEntries(ROLES.map((r) => [r, n]));
    else if (k && typeof (AI_DRAFT_DIALS as Record<string, unknown>)[k] === 'number') dials[k] = n;
    else throw new Error(`unknown option ${k}: fit, roles, or a numeric AI_DRAFT_DIALS key`);
  }
  return side;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { drafts: 40, seed: 1, teams: 12, megas: true, a: parseSide(''), b: parseSide(''), jobs: Math.max(1, Math.min(cpus().length - 2, 16)) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = (): number => {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error(`${a} needs a number`);
      return v;
    };
    switch (a) {
      case '--drafts': o.drafts = Math.max(2, Math.ceil(num() / 2) * 2); break;
      case '--seed': o.seed = Math.floor(num()); break;
      case '--teams': {
        const t = num();
        if (t !== 8 && t !== 12 && t !== 16) throw new Error('--teams must be 8, 12 or 16');
        o.teams = t;
        break;
      }
      case '--no-megas': o.megas = false; break;
      case '--a': o.a = parseSide(argv[++i] ?? ''); break;
      case '--b': o.b = parseSide(argv[++i] ?? ''); break;
      case '--jobs': o.jobs = Math.max(1, Math.floor(num())); break;
      case '--shard': {
        const [x, y] = (argv[++i] ?? '').split('/').map(Number);
        if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('--shard i/J');
        o.shard = [x!, y!];
        break;
      }
      case '--': break;
      default: if (a) throw new Error(`unknown option ${a}`);
    }
  }
  return o;
}

interface Group { coaches: number; mons: number; points: number; roles: Record<string, number>; setRoles: Record<string, number>; fast: number; bulky: number }
interface Tally { wins: number; games: number; pickMs: { a: number; b: number }; picks: { a: number; b: number }; a: Group; b: Group }
const emptyGroup = (): Group => ({ coaches: 0, mons: 0, points: 0, roles: {}, setRoles: {}, fast: 0, bulky: 0 });

const moveId = (m: string): string => m.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Roles the coach's rolled season sets actually carry (draftRoles is what the movepools could roll). */
function setRolesOf(c: Coach): Set<string> {
  const moves = new Set(Object.values(c.sets).flatMap((s) => s.moves.map(moveId)));
  return new Set(ROLES.filter((r) => MOVE_CATEGORIES[r].some((m) => moves.has(moveId(m)))));
}

/** Every coach drafts as the AI; `sideOf` says which config each coach uses. */
function draft(config: LeagueConfig, seed: number, sideOf: (coach: string) => Side, ms: { a: number; b: number }, picks: { a: number; b: number }, isA: (c: string) => boolean): RunState {
  let run = createRun({ config, seed, humanName: 'Arena', humanAbbrev: 'ARN', createdAt: 0 });
  const pool = runPool(run);
  for (;;) {
    const picker = currentPicker(run.draft, run.config);
    if (picker === undefined) break;
    const as = { ...run, humanId: picker }; // draftPick / draftStop act for run.humanId
    const aim = aiRosterTarget(run.config, createRng(deriveSeed(run.seed, 'rosterAim', picker)));
    if (aiWantsToStop(run.draft, picker, run.config, aim)) {
      run = { ...draftStop(as), humanId: run.humanId };
      continue;
    }
    const side = sideOf(picker);
    const rng = createRng(deriveSeed(run.seed, 'pick', run.draft.pickIndex));
    const t = performance.now();
    const species = aiChoosePick(run.draft, picker, run.config, pool, rng, aim, { fit: side.fit, dials: side.dials });
    const k = isA(picker) ? 'a' : 'b';
    ms[k] += performance.now() - t;
    picks[k]++;
    run = { ...draftPick(as, species), humanId: run.humanId };
  }
  return finishDraft(run, engineDeps);
}

async function play(o: Opts): Promise<Tally> {
  const t: Tally = { wins: 0, games: 0, pickMs: { a: 0, b: 0 }, picks: { a: 0, b: 0 }, a: emptyGroup(), b: emptyGroup() };
  const config: LeagueConfig = { ...DEFAULT_LEAGUE_CONFIG, teams: o.teams, playoffTeams: o.teams === 8 ? 4 : 8, megas: o.megas };
  const [shard, of] = o.shard ?? [0, 1];
  for (let d = shard; d < o.drafts; d += of) {
    const seed = deriveSeed(o.seed, 'draftArena', d);
    const isA = (c: string): boolean => (Number(c.slice(1)) + d) % 2 === 0;
    const run = draft(config, seed, (c) => (isA(c) ? o.a : o.b), t.pickMs, t.picks, isA);
    for (const c of run.coaches) {
      const g = isA(c.id) ? t.a : t.b;
      const mons = c.roster.map((r) => getDraftMon(r.species)!);
      g.coaches++;
      g.mons += mons.length;
      g.points += c.pointsSpent;
      for (const r of new Set(mons.flatMap((m) => draftRoles(m)))) g.roles[r] = (g.roles[r] ?? 0) + 1;
      for (const r of setRolesOf(c)) g.setRoles[r] = (g.setRoles[r] ?? 0) + 1;
      if (mons.some(isFast)) g.fast++;
      if (mons.some(isBulky)) g.bulky++;
    }
    const as = run.coaches.filter((c) => isA(c.id));
    const bs = run.coaches.filter((c) => !isA(c.id));
    for (const [i, a] of as.entries()) {
      for (const [j, b] of bs.entries()) {
        const aHome = (i + j) % 2 === 0;
        const res = await engineDeps.simulateMatch(aHome ? a : b, aHome ? b : a, deriveSeed(seed, 'match', i, j));
        t.games++;
        if (res.winner === a.id) t.wins++;
      }
    }
  }
  return t;
}

function wilson(wins: number, n: number): [number, number] {
  const z = 1.96;
  const p = wins / n;
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [c - h, c + h];
}

function runShard(argv: string[], shard: number, of: number): Promise<Tally> {
  const cli = createRequire(import.meta.url).resolve('vite-node/cli');
  const child = spawn(process.execPath, [cli, '--script', fileURLToPath(import.meta.url), ...argv, '--shard', `${shard}/${of}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
  return new Promise((res, rej) => {
    child.on('exit', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('TALLY '));
      if (code !== 0 || !line) rej(new Error(`shard ${shard} failed (${code}): ${out.slice(-500)}`));
      else res(JSON.parse(line.slice(6)) as Tally);
    });
  });
}

function mergeGroup(x: Group, y: Group): Group {
  const roles = { ...x.roles };
  for (const [k, v] of Object.entries(y.roles)) roles[k] = (roles[k] ?? 0) + v;
  const setRoles = { ...x.setRoles };
  for (const [k, v] of Object.entries(y.setRoles)) setRoles[k] = (setRoles[k] ?? 0) + v;
  return { coaches: x.coaches + y.coaches, mons: x.mons + y.mons, points: x.points + y.points, roles, setRoles, fast: x.fast + y.fast, bulky: x.bulky + y.bulky };
}

const sideText = (s: Side): string => [s.fit ? 'fit' : '', ...Object.entries(s.dials).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)].filter(Boolean).join(',') || 'default';
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function groupLine(name: string, g: Group, ms: number, picks: number): string {
  const roles = ROLES.map((r) => `${r} ${pct((g.setRoles[r] ?? 0) / g.coaches)} (pool ${pct((g.roles[r] ?? 0) / g.coaches)})`).join(', ');
  return `${name}: ${(g.mons / g.coaches).toFixed(2)} mons, ${(g.points / g.coaches).toFixed(1)} pts; ${roles}; fast ${pct(g.fast / g.coaches)}, bulky ${pct(g.bulky / g.coaches)}; ${(ms / picks).toFixed(2)} ms/pick`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const o = parseArgs(argv);
  if (o.shard) {
    console.log(`TALLY ${JSON.stringify(await play(o))}`);
    return;
  }
  const t0 = performance.now();
  const jobs = Math.min(o.jobs, o.drafts);
  const parts = jobs > 1 ? await Promise.all(Array.from({ length: jobs }, (_, i) => runShard(argv, i, jobs))) : [await play(o)];
  const t = parts.reduce((s, x) => ({
    wins: s.wins + x.wins, games: s.games + x.games,
    pickMs: { a: s.pickMs.a + x.pickMs.a, b: s.pickMs.b + x.pickMs.b }, picks: { a: s.picks.a + x.picks.a, b: s.picks.b + x.picks.b },
    a: mergeGroup(s.a, x.a), b: mergeGroup(s.b, x.b),
  }));
  const [lo, hi] = wilson(t.wins, t.games);
  console.log(`A (${sideText(o.a)}) vs B (${sideText(o.b)}), ${o.drafts} drafts of ${o.teams}, Megas ${o.megas ? 'on' : 'off'}, seed ${o.seed}`);
  console.log(`A wins ${t.wins}/${t.games} = ${pct(t.wins / t.games)}, 95% CI ${pct(lo)}-${pct(hi)} (matches share rosters, so the real interval is wider)`);
  console.log(groupLine('A', t.a, t.pickMs.a, t.picks.a));
  console.log(groupLine('B', t.b, t.pickMs.b, t.picks.b));
  console.log(`${((performance.now() - t0) / 1000).toFixed(1)} s wall, ${jobs} jobs`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
