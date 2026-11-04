// Stakes (ascension; "Badges" to players): the difficulty ladder. Win the title at stake N to unlock N+1. Each stake
// adds one rule and keeps every rule below it; stakes never change battle math and never use mutators
// (docs/ROGUELIKE.md). A Badge Run also plays the stake's fixed league format (BADGE_FORMATS); a custom league
// picks its own format, may play any unlocked stake's rules, and never earns or unlocks a stake.
import { DEFAULT_LEAGUE_CONFIG, type AiSkill, type LeagueConfig } from '../types';

export interface StakeRules {
  /** Regular-season losses allowed, or null = the league's own setting. */
  lossCap: number | null;
  /** Extra draft points for every AI coach. */
  aiBudgetBonus: number;
  /** AI coaches add the draft helper's fit score to their picks. */
  aiDraftFit: boolean;
  /** How well the AI facing you in battle plays (Ace also reads your real sets). League AI-vs-AI matches stay Trainer. */
  aiSkill: AiSkill;
  /** Opposing rosters show only mons already brought in a stored battle. */
  fogOfWar: boolean;
  /** The human picks last in round 1 (first in round 2). */
  humanDraftsLast: boolean;
  /** How many mons you bring to each of your matches (the AI still brings 6). */
  bringSize: number;
}

export interface Stake {
  stake: number;
  label: string;
  /** One plain sentence for the setup screen. */
  rule: string;
  patch: Partial<StakeRules>;
}

const BASE_RULES: StakeRules = {
  lossCap: null, aiBudgetBonus: 0, aiDraftFit: false, aiSkill: 'rookie', fogOfWar: false, humanDraftsLast: false,
  bringSize: 6,
};

/** The ladder, cumulative from stake 1 upward: stake N plays every patch from 1 to N, later ones override. */
export const STAKES: readonly Stake[] = [
  { stake: 1, label: 'Rookie AI', rule: 'Standard rules. Your opponents play predictably: their hardest hit, rarely a switch.', patch: {} },
  { stake: 2, label: 'Loss cap 3', rule: 'The fourth regular-season loss ends the run.', patch: { lossCap: 3 } },
  { stake: 3, label: 'Trainer AI', rule: 'Your opponents play well: speed order, setup, hazards, smart switches.', patch: { aiSkill: 'trainer' } },
  { stake: 4, label: 'Stronger rivals', rule: 'AI coaches draft for team fit and get 5 more points than you.', patch: { aiDraftFit: true, aiBudgetBonus: 5 } },
  { stake: 5, label: 'Fog of war', rule: 'You only see opposing mons once they have been brought to a battle.', patch: { fogOfWar: true } },
  { stake: 6, label: 'Ace AI', rule: 'Your opponents know your sets and predict your switches.', patch: { aiSkill: 'ace' } },
  { stake: 7, label: 'You draft last', rule: 'You pick last in round 1.', patch: { humanDraftsLast: true } },
  { stake: 8, label: 'Loss cap 2', rule: 'The third regular-season loss ends the run.', patch: { lossCap: 2 } },
  { stake: 9, label: 'Elite Four', rule: 'You bring 5 Pokemon to each match; your opponent still brings 6.', patch: { bringSize: 5 } },
  { stake: 10, label: 'Champion', rule: 'You bring 4 Pokemon to each match; your opponent still brings 6.', patch: { bringSize: 4 } },
];

export const MAX_STAKE = STAKES.length;

/** The league shape a Badge Run plays at each stake (index 0 = stake 1): the stage grows as the ladder climbs. */
export type BadgeFormat = Pick<LeagueConfig, 'teams' | 'weeks' | 'playoffTeams'>;

export const BADGE_FORMATS: readonly BadgeFormat[] = [
  { teams: 8, weeks: 7, playoffTeams: 4 },
  { teams: 8, weeks: 7, playoffTeams: 4 },
  { teams: 8, weeks: 7, playoffTeams: 4 },
  { teams: 12, weeks: 9, playoffTeams: 8 },
  { teams: 12, weeks: 9, playoffTeams: 8 },
  { teams: 12, weeks: 9, playoffTeams: 4 },
  { teams: 16, weeks: 9, playoffTeams: 8 },
  { teams: 16, weeks: 9, playoffTeams: 8 },
  { teams: 16, weeks: 9, playoffTeams: 8 },
  { teams: 16, weeks: 9, playoffTeams: 8 },
];

/** The config a Badge Run at `stake` plays: standard rules, the stake's format, then the stake's own tightening. */
export function badgeRunConfig(stake: number): LeagueConfig {
  const n = Math.max(1, Math.min(MAX_STAKE, Math.floor(stake) || 1));
  return applyStake({ ...DEFAULT_LEAGUE_CONFIG, ...BADGE_FORMATS[n - 1]!, stake: n });
}

/** The rules in force at `stake` (clamped to 1..MAX_STAKE): every patch up to it, in order. */
export function rulesAt(stake: number): StakeRules {
  const n = Math.max(1, Math.min(MAX_STAKE, Math.floor(stake) || 1));
  return STAKES.slice(0, n).reduce<StakeRules>((r, s) => ({ ...r, ...s.patch }), { ...BASE_RULES });
}

/**
 * The config a run at `config.stake` stores: the stake's loss cap where it is tighter than the league's own. Idempotent, never loosens a setting.
 */
export function applyStake(config: LeagueConfig): LeagueConfig {
  const rules = rulesAt(config.stake);
  const lossCap = rules.lossCap === null ? config.lossCap : Math.min(config.lossCap, rules.lossCap);
  return { ...config, lossCap };
}
