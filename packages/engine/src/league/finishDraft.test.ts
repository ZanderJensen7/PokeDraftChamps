import { DEFAULT_LEAGUE_CONFIG, type LeagueConfig } from '../types';
import { legalPicks } from '../draft/draft';
import { buildSets } from '../game';
import { createRng } from './rng';
import {
  captainQuota, createRun, draftPick, draftStop, finishDraft, humanCoach, runAiDraftUntilHuman, runPool, setCaptains,
} from './run';

/** Drafts the human to rosterMin (then stops) or to the end, then names captains and finishes with the REAL set builder. */
function draftAndFinish(seed: number, config: LeagueConfig, stopAtMin: boolean, mode: 'cheap' | 'rich' | 'rand') {
  let run = runAiDraftUntilHuman(createRun({ config, seed, humanName: 'Me', humanAbbrev: 'ME', createdAt: 1 }));
  const pool = runPool(run);
  const price = new Map(pool.map((m) => [m.id, m.points]));
  const rng = createRng(seed);
  while (!run.draft.complete) {
    if (stopAtMin && humanCoach(run).roster.length >= config.rosterMin) {
      run = draftStop(run);
    } else {
      const legal = legalPicks(run.draft, run.humanId, run.config, pool).sort((a, b) => price.get(b)! - price.get(a)!);
      run = draftPick(run, mode === 'rich' ? legal[0]! : mode === 'cheap' ? legal[legal.length - 1]! : rng.pick(legal));
    }
    run = runAiDraftUntilHuman(run);
  }
  const roster = humanCoach(run).roster;
  const quota = captainQuota(run.config, roster);
  const eligible = roster.map((r) => r.species).filter((s) => !pool.find((m) => m.id === s)!.isMega && price.get(s)! <= run.config.captainMaxPoints);
  const named = setCaptains(run, { tera: eligible.slice(0, quota.tera), z: eligible.slice(quota.tera, quota.tera + quota.z) });
  return finishDraft(named, { buildSets });
}

describe('finishing the draft with the real set builder', () => {
  const league = (over: Partial<LeagueConfig>): LeagueConfig => ({ ...DEFAULT_LEAGUE_CONFIG, ...over });
  const configs = [
    league({ megas: true, teraCaptains: 2, zCaptains: 2 }),
    league({ megas: false, teraCaptains: 2, zCaptains: 0, captainMaxPoints: 20 }),
    league({ megas: true, teraCaptains: 1, zCaptains: 3, rosterMin: 6, rosterMax: 9, teams: 8, weeks: 7, playoffTeams: 4 }),
  ];

  it.each(configs.flatMap((c, i) => [true, false].map((stop) => [i, stop] as const)))(
    'config %i, stop at the minimum: %s', (i, stop) => {
      for (const mode of ['cheap', 'rich', 'rand'] as const) {
        const run = draftAndFinish(11 + i, configs[i]!, stop, mode);
        expect(run.phase).toBe('season');
        for (const c of run.coaches) expect(Object.keys(c.sets).length).toBe(c.roster.length);
      }
    }, 60000);
});
