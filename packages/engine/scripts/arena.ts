// Battle AI arena: two HeuristicPlayer configurations play N seeded games head to head. By default every game is a
// mirror (both sides bring the same six sets) and each team is played twice, A on p1 then A on p2, so only the play
// differs. `--pairs` plays two different teams instead: A takes team 1 on p1, then team 2 on p2.
// Node-only.
//
//   npm run arena -w @pdc/engine -- --games 300 --seed 1 --b epsilon=0.02
//
// Options: --games N (200, rounded up to even) --seed S (1) --a k=v,k=v --b k=v,k=v (HeuristicDials overrides; A is the
//          challenger, B the default unless given; `--b random` plays B as RandomPlayer) --know a|b (that side reads the other's real sets, stake 4)
//          --tera N (Tera captains per team, 1) --pairs (two different teams per game pair, not mirrors) --jobs J (parallel processes, min(cpus - 2, 16))
//          --shard i/J (internal: play only pairs i, i + J, ...)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Dex } from '@pkmn/sim';
import type { BattleSet, SpeciesId } from '../src/types';
import { HeuristicPlayer, HEURISTIC_DIALS, RandomPlayer, runBattle, BattleRng, buildSetFor, type HeuristicDials } from '../src/battle';
import { randomsSpeciesKeys } from '../src/battle/randoms';

interface Opts {
  games: number; seed: number; a: Partial<HeuristicDials>; b: Partial<HeuristicDials>; bRandom: boolean;
  know?: 'a' | 'b'; tera: number; pairs: boolean; jobs: number; shard?: [number, number];
}

function parseDials(s: string): Partial<HeuristicDials> {
  const out: Record<string, number | boolean | string> = {};
  for (const kv of s.split(',').filter(Boolean)) {
    const [k, v = 'true'] = kv.split('=');
    if (!k || !(k in HEURISTIC_DIALS)) throw new Error(`unknown dial ${k}; dials: ${Object.keys(HEURISTIC_DIALS).join(', ')}`);
    const def = HEURISTIC_DIALS[k as keyof HeuristicDials];
    out[k] = typeof def === 'boolean' ? v === 'true' || v === '1' : typeof def === 'number' ? Number(v) : v;
    if (typeof out[k] === 'number' && !Number.isFinite(out[k])) throw new Error(`${k} needs a number`);
  }
  return out as Partial<HeuristicDials>;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { games: 200, seed: 1, a: {}, b: {}, bRandom: false, tera: 1, pairs: false, jobs: Math.max(1, Math.min(cpus().length - 2, 16)) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = (): number => {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error(`${a} needs a number`);
      return v;
    };
    switch (a) {
      case '--games': o.games = Math.max(2, Math.ceil(num() / 2) * 2); break;
      case '--seed': o.seed = Math.floor(num()); break;
      case '--a': o.a = parseDials(argv[++i] ?? ''); break;
      case '--b': {
        const v = argv[++i] ?? '';
        if (v === 'random') o.bRandom = true;
        else o.b = parseDials(v);
        break;
      }
      case '--know': {
        const k = argv[++i];
        if (k !== 'a' && k !== 'b') throw new Error('--know must be a or b');
        o.know = k;
        break;
      }
      case '--tera': o.tera = Math.max(0, Math.floor(num())); break;
      case '--pairs': o.pairs = true; break;
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

const POOL = [...randomsSpeciesKeys()].sort();

/** Six distinct-base-species sets, seeded; the first `tera` are Tera captains. */
function team(seed: number, tera: number): { sets: BattleSet[]; captains: SpeciesId[] } {
  const rng = new BattleRng(seed);
  const ids: SpeciesId[] = [];
  const bases = new Set<string>();
  while (ids.length < 6) {
    const id = rng.pick(POOL);
    const base = Dex.species.get(id).baseSpecies;
    if (bases.has(base)) continue;
    bases.add(base);
    ids.push(id);
  }
  const captains = ids.slice(0, tera);
  return { sets: ids.map(id => buildSetFor(id, { seed, isTeraCaptain: captains.includes(id) })), captains };
}

interface Tally { wins: number; ties: number; games: number; ms: number; turns: number }

async function play(o: Opts): Promise<Tally> {
  const t: Tally = { wins: 0, ties: 0, games: 0, ms: 0, turns: 0 };
  const pairs = o.games / 2;
  const [shard, of] = o.shard ?? [0, 1];
  for (let p = shard; p < pairs; p += of) {
    const s = o.seed * 100_003 + p;
    const t1 = team(s * 2 + 1, o.tera);
    const t2 = o.pairs ? team(s * 2 + 2, o.tera) : t1;
    for (const aOnP1 of [true, false]) {
      const a = new HeuristicPlayer(s * 7 + 1, 'trainer', o.a);
      const b = o.bRandom ? new RandomPlayer(s * 7 + 2) : new HeuristicPlayer(s * 7 + 2, 'trainer', o.b);
      const started = performance.now();
      const out = await runBattle({
        p1: { name: 'Alpha', team: t1.sets, teraCaptains: t1.captains, player: aOnP1 ? a : b, knowsOpponentSets: o.know === (aOnP1 ? 'a' : 'b') },
        p2: { name: 'Beta', team: t2.sets, teraCaptains: t2.captains, player: aOnP1 ? b : a, knowsOpponentSets: o.know === (aOnP1 ? 'b' : 'a') },
        seed: new BattleRng(s).seed4(),
      });
      t.ms += performance.now() - started;
      t.turns += out.turns;
      t.games++;
      if (out.winner === 'tie') t.ties++;
      else if (out.winner === (aOnP1 ? 'p1' : 'p2')) t.wins++;
    }
  }
  return t;
}

/** Wilson 95% interval for a win rate (ties count half). */
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
    child.on('exit', code => {
      const line = out.split('\n').find(l => l.startsWith('TALLY '));
      if (code !== 0 || !line) rej(new Error(`shard ${shard} failed (${code}): ${out.slice(-500)}`));
      else res(JSON.parse(line.slice(6)) as Tally);
    });
  });
}

const dialText = (d: Partial<HeuristicDials>): string => Object.entries(d).map(([k, v]) => `${k}=${v}`).join(',') || 'default';

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter(a => a !== '--');
  const o = parseArgs(argv);
  if (o.shard) {
    console.log(`TALLY ${JSON.stringify(await play(o))}`);
    return;
  }
  const t0 = performance.now();
  const jobs = Math.min(o.jobs, o.games / 2);
  const parts = jobs > 1 ? await Promise.all(Array.from({ length: jobs }, (_, i) => runShard(argv, i, jobs))) : [await play(o)];
  const t = parts.reduce((s, x) => ({ wins: s.wins + x.wins, ties: s.ties + x.ties, games: s.games + x.games, ms: s.ms + x.ms, turns: s.turns + x.turns }));
  const score = t.wins + t.ties / 2;
  const [lo, hi] = wilson(score, t.games);
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  console.log(`A (${dialText(o.a)}${o.know === 'a' ? ', knows sets' : ''}) vs B (${o.bRandom ? 'RandomPlayer' : dialText(o.b)}${o.know === 'b' ? ', knows sets' : ''}), seed ${o.seed}, Tera captains ${o.tera}, ${o.pairs ? 'team pairs' : 'mirror teams'}`);
  console.log(`A wins ${t.wins}/${t.games} (+${t.ties} ties) = ${pct(score / t.games)}, 95% CI ${pct(lo)}-${pct(hi)}`);
  console.log(`${(t.ms / t.games).toFixed(0)} ms per battle, ${(t.turns / t.games).toFixed(1)} turns; ${((performance.now() - t0) / 1000).toFixed(1)} s wall, ${jobs} jobs`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
