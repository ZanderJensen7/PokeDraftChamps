// Runs league matches in one Web Worker, one at a time (a FIFO queue). Falls back to the main thread
// (lazy-loaded engine) when Worker is missing or the worker dies.
import type { Coach, MatchResult, SimRules } from '@pdc/engine';

interface Pending {
  home: Coach;
  away: Coach;
  seed: number;
  rules?: SimRules;
  resolve: (r: MatchResult) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();
let queue: Promise<unknown> = Promise.resolve();

function runLocal(home: Coach, away: Coach, seed: number, rules?: SimRules): Promise<MatchResult> {
  return import('../battle/localSim').then((m) => m.simulateLeagueMatch(home, away, seed, rules));
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    const w = new Worker(new URL('../workers/leagueSim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; result?: MatchResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.result) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? 'simulation failed'));
    };
    w.onerror = () => {
      // The worker is gone: finish everything in flight on the main thread from now on.
      worker = null;
      w.terminate();
      for (const [id, p] of pending) {
        pending.delete(id);
        runLocal(p.home, p.away, p.seed, p.rules).then(p.resolve, p.reject);
      }
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function runOne(home: Coach, away: Coach, seed: number, rules?: SimRules): Promise<MatchResult> {
  const w = getWorker();
  if (!w) return runLocal(home, away, seed, rules);
  return new Promise<MatchResult>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { home, away, seed, rules, resolve, reject });
    w.postMessage({ id, home, away, seed, rules });
  });
}

/** SimulateMatch for the league: queued, off the main thread when possible. */
export function simulateQueued(home: Coach, away: Coach, seed: number, rules?: SimRules): Promise<MatchResult> {
  const p = queue.then(() => runOne(home, away, seed, rules));
  queue = p.catch(() => undefined);
  return p;
}
