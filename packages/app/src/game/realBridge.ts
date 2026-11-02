// The real battle bridge: league matches in a Web Worker, the human's match live in BattleScreen,
// scouting from stored logs. The live-battle code and the set builder (@pdc/engine/battle: @pkmn/sim) load on first use.
import type { CoachId, RunState, ScoutLog, ScoutReport } from '@pdc/engine';
import { coachById, scoutFromLogs } from '@pdc/engine';
import { placeholderBridge, setBridge, type BattleBridge } from './bridge';
import { simulateQueued } from './simClient';

/**
 * Which side a coach played in a stored match: the human is always p1 in their own match
 * (createInteractiveBattle), otherwise home is p1 (simulateMatch).
 */
function sideOf(run: RunState, home: CoachId, away: CoachId, coach: CoachId): 'p1' | 'p2' {
  const p1 = home === run.humanId || away === run.humanId ? run.humanId : home;
  return coach === p1 ? 'p1' : 'p2';
}

export function scoutCoach(run: RunState, coach: CoachId): ScoutReport | undefined {
  const logs: ScoutLog[] = [];
  for (const m of run.matches) {
    if (!m.result?.log.length || (m.home !== coach && m.away !== coach)) continue;
    logs.push({ log: m.result.log, coachSide: sideOf(run, m.home, m.away, coach) });
  }
  return logs.length ? scoutFromLogs(coach, logs, coachById(run, coach).roster) : undefined;
}

export const realBridge: BattleBridge = {
  ...placeholderBridge,
  isPlaceholder: false,
  simulateMatch: simulateQueued,
  playHumanMatch: async (args) => (await import('../battle/session')).playLiveMatch(args),
  scout: scoutCoach,
};

export function installRealBridge(): void {
  setBridge(realBridge);
}
