/// <reference lib="webworker" />
// League simulation off the main thread: one AI-vs-AI match per message, answered with its MatchResult.
import type { Coach, SimRules } from '@pdc/engine';
import { simulateLeagueMatch } from '@pdc/engine/battle';

export interface SimRequest {
  id: number;
  home: Coach;
  away: Coach;
  seed: number;
  rules?: SimRules;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<SimRequest>) => {
  const { id, home, away, seed, rules } = e.data;
  try {
    const result = await simulateLeagueMatch(home, away, seed, rules);
    ctx.postMessage({ id, result });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
