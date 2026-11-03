// Sets up the human's live battle (human = p1, HeuristicPlayer = p2), hands it to BattleScreen through the
// game store, and resolves with the MatchResult once the player presses CONTINUE on the result banner.
import type { BattleSet, Coach, MatchResult, SpeciesId } from '@pdc/engine';
import { deriveSeed, humanCoach, nextHumanMatch, opponentOf } from '@pdc/engine';
import type { InteractiveBattle } from '@pdc/engine/battle';
import { BattleRng, buildSetFor, chooseLineup, createInteractiveBattle, humanMatchResult } from '@pdc/engine/battle';
import type { PlayHumanMatchArgs } from '../game/bridge';
import { speciesName } from '../game/names';
import { useGame } from '../store/useGame';

/** Protocol nickname -> roster display name, per side ("Charizard" -> "Mega Charizard X" for a Mega pick). */
export type BattleNames = Record<'p1' | 'p2', Record<string, string>>;

export interface LiveBattle {
  battle: InteractiveBattle;
  human: Coach;
  opp: Coach;
  humanLineup: SpeciesId[];
  oppLineup: SpeciesId[];
  /** The roster name behind each nickname the protocol uses (the sim lists a Mega as its base species). */
  names: BattleNames;
  /** Settles when the battle ends (or rejects if the sim fails). */
  result: Promise<MatchResult>;
  /** CONTINUE on the result banner: hands the result back to the store. */
  finish(): void;
  /** FORFEIT: ends the battle as a loss with none of the human's Pokemon counted as remaining. */
  forfeit(): void;
}

function teamFor(coach: Coach, lineup: SpeciesId[], seed: number): BattleSet[] {
  return lineup.map((id) => {
    const set = coach.sets[id];
    if (set) return set;
    const entry = coach.roster.find((r) => r.species === id);
    return buildSetFor(id, { seed, isTeraCaptain: !!entry?.isTeraCaptain, isZCaptain: !!entry?.isZCaptain });
  });
}

/**
 * Nicknames the sim will print for a team mapped to the roster entry's display name. A nickname two roster
 * entries share (Mega X and Y of one base) is left out so neither claims it.
 */
export function namesFor(lineup: SpeciesId[], team: BattleSet[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  team.forEach((set, i) => {
    const id = lineup[i];
    const nick = set.name || set.species;
    if (!id || !nick) return;
    if (seen.has(nick)) { delete out[nick]; return; }
    seen.add(nick);
    out[nick] = speciesName(id);
  });
  return out;
}

function captainsIn(coach: Coach, lineup: SpeciesId[]): SpeciesId[] {
  return coach.roster.filter((r) => r.isTeraCaptain && lineup.includes(r.species)).map((r) => r.species);
}

export function playLiveMatch(args: PlayHumanMatchArgs): Promise<MatchResult> {
  const { run, humanLineup } = args;
  const match = nextHumanMatch(run);
  if (!match) return Promise.reject(new Error('no match to play this week'));
  const human = humanCoach(run);
  const opp = opponentOf(run, match);
  const base = deriveSeed(run.seed, 'human', run.week, match.id);
  const oppLineup = args.oppLineup ?? chooseLineup(opp.roster, opp.sets, human.roster, deriveSeed(base, 'lineup'));

  const humanTeam = teamFor(human, humanLineup, base);
  const oppTeam = teamFor(opp, oppLineup, base);
  const names: BattleNames = { p1: namesFor(humanLineup, humanTeam), p2: namesFor(oppLineup, oppTeam) };
  const battle = createInteractiveBattle({
    p1: { name: human.name, team: humanTeam, teraCaptains: captainsIn(human, humanLineup) },
    p2: { name: opp.name, team: oppTeam, teraCaptains: captainsIn(opp, oppLineup) },
    seed: new BattleRng(base).seed4(),
    aiSeed: deriveSeed(base, 'ai'),
  });
  const lineups = { [human.id]: humanLineup, [opp.id]: oppLineup };
  let forfeited = false;
  const result = battle.outcome.then((o) => {
    const r = humanMatchResult(o, human, opp, lineups, deriveSeed(base, 'tiebreak'));
    return forfeited ? { ...r, remaining: { ...r.remaining, [human.id]: 0 } } : r;
  });

  return new Promise<MatchResult>((resolve, reject) => {
    result.catch(reject);
    const live: LiveBattle = {
      battle, human, opp, humanLineup, oppLineup, names, result,
      finish: () => { result.then(resolve, reject); },
      forfeit: () => { forfeited = true; battle.abort(); },
    };
    if (useGame.getState().battle !== args) {
      battle.abort();
      reject(new Error('battle screen closed')); // matched by useGame (BATTLE_CLOSED): no toast
      return;
    }
    useGame.setState({ battle: { ...args, live } });
  });
}
