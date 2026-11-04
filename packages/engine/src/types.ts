// Shared engine types. Every module imports from here; nothing here imports a module.
import type { PokemonSet } from '@pkmn/sim';

/** Showdown ID form of a species name, e.g. 'greattusk', 'ironvaliant', 'ogerponwellspring'. */
export type SpeciesId = string;
export type CoachId = string;
export type StatName = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StatsTable = Record<StatName, number>;
export type TypeName = string;

export interface LeagueConfig {
  teams: 8 | 12 | 16;
  weeks: number;            // regular-season weeks, default 9
  playoffTeams: number;     // default 8 (half the league, min 4)
  budget: number;           // draft points, default 120
  /** A coach may stop drafting once they hold this many mons. Default 9 (at least 6: a match brings 6). */
  rosterMin: number;
  /** The most mons a roster may hold; the draft runs at most this many rounds. Default 11. */
  rosterMax: number;
  teraCaptains: number;     // default 2; 0 = Tera off
  /** Mons per roster allowed to use a Z-move (needs a Z-Crystal). Default 0 = Z-moves off. */
  zCaptains: number;
  /** Mega forms are draftable (each holds its own stone). Default false. */
  megas: boolean;
  /** Highest draft price a Tera or Z captain may have. Default 14; MAX_POINTS (20) = no cap. */
  captainMaxPoints: number;
  lossCap: number;          // regular-season losses allowed before the run ends, default 4
  freeAgencyMoves: number;  // per season, default 2
  /** Difficulty ladder level, 1..MAX_STAKE (data/stakes.ts). Default 1 = the base game. */
  stake: number;
  /** A custom league: the player's own format. Plays its stake's rules but never earns or unlocks a badge. */
  custom?: boolean;
}

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = {
  teams: 16, weeks: 9, playoffTeams: 8, budget: 120, rosterMin: 9, rosterMax: 11,
  teraCaptains: 2, zCaptains: 0, megas: false, captainMaxPoints: 14, lossCap: 4, freeAgencyMoves: 2, stake: 1,
};

/** One draftable species as it appears in the pool / on a roster card. */
export interface DraftMon {
  id: SpeciesId;
  name: string;
  points: number;
  types: TypeName[];
  baseStats: StatsTable;
  abilities: string[];
  tier: string;
  bst: number;
  /** National dex number; forms share it. One coach may own one form per number (Species Clause). */
  num: number;
  /** A Mega form, drafted as itself: it battles holding `requiredItem` and Mega Evolves from `baseSpecies`. */
  isMega: boolean;
  /** Megas only: id of the base form ('charizard' for 'charizardmegax'), the species the battle team lists. */
  baseSpecies?: SpeciesId;
  /** Megas only: the Mega Stone's display name ('Charizardite X'). */
  requiredItem?: string;
}

export interface RosterEntry {
  species: SpeciesId;
  isTeraCaptain: boolean;
  /**
   * May use a Z-move. The league module always writes it (and migrates old saves); it is optional only so
   * hand-built rosters (battle/prep tests) need not name it. Absent = false. Never true together with
   * isTeraCaptain, never true on a Mega.
   */
  isZCaptain?: boolean;
}

export interface Coach {
  id: CoachId;
  name: string;      // "Oakhaven Ravens"
  abbrev: string;    // "OHA"
  isHuman: boolean;
  roster: RosterEntry[];
  pointsSpent: number;
  /** The coach's fixed sets for the season, keyed by species id. Built once after the draft. */
  sets: Record<SpeciesId, BattleSet>;
}

/** A battle-ready set. Same shape the sim packs; level 100, moves as display names or ids. */
export type BattleSet = PokemonSet;

export interface MatchResult {
  winner: CoachId;
  loser: CoachId;
  /** Full Showdown protocol log (omniscient), one line per entry. Replayable. */
  log: string[];
  turns: number;
  /** Mons left standing per coach, 0-6. */
  remaining: Record<CoachId, number>;
  /** Species ids each coach brought (6). */
  lineups: Record<CoachId, SpeciesId[]>;
}

export interface Match {
  id: string;
  week: number;            // 1-based; playoff rounds continue the count
  home: CoachId;
  away: CoachId;
  result?: MatchResult;
  playoffRound?: number;   // undefined = regular season
}

export interface StandingRow {
  coach: CoachId;
  wins: number;
  losses: number;
  differential: number;
  rank: number;
}

export type RunPhase =
  | 'draft'
  | 'season'       // between matches: prep / free agency / schedule
  | 'playoffs'
  | 'champion'
  | 'eliminated';

export type EliminationReason = 'lossCap' | 'missedPlayoffs' | 'playoffLoss';

/** What a coach's stored battle logs have revealed about their sets this season. */
export interface ScoutedMon {
  moves: string[];        // display names, as the protocol prints them
  item?: string;
  ability?: string;
  teraType?: string;
  timesBrought: number;
  timesLed: number;
}

export interface ScoutReport {
  coach: CoachId;
  matchesScouted: number;
  bySpecies: Record<SpeciesId, ScoutedMon>;
}

// ---- Prep doc (appended by the prep module) ----

export type PrepMoveCategory =
  | 'Entry Hazards' | 'Hazard Removal' | 'Healing' | 'Momentum' | 'Item Removal'
  | 'Status' | 'Priority' | 'Disruption' | 'Screens' | 'Speed Control';

export interface PrepCard {
  species: SpeciesId;
  name: string;
  types: TypeName[];
  bst: number;
  baseStats: StatsTable;
  abilities: string[];
  tier: string;
  isTeraCaptain: boolean;
}

export interface PrepMatchupRow { species: SpeciesId; ability: string; byType: Record<TypeName, number> }

export interface PrepTeamMatchup {
  rows: PrepMatchupRow[];
  stab: Record<TypeName, number>;
  weak: Record<TypeName, number>;
  immunityNotes: { species: SpeciesId; ability: string; type: TypeName }[];
}

export interface PrepSpeedRow {
  species: SpeciesId;
  name: string;
  base: number;
  ev0: number;
  ev252: number;
  ev252plus: number;
  scarf252: number;
  scarf252plus: number;
  side: 'you' | 'opp';
}

export interface PrepNotableMove { move: string; species: SpeciesId[] }
export type PrepNotableMoves = Record<PrepMoveCategory, PrepNotableMove[]>;

export interface PrepLikelyRole { role: string; movepool: string[]; abilities: string[]; teraTypes: string[] }
export interface PrepLikelySets { roles: PrepLikelyRole[] }

export interface PrepDoc {
  you: PrepCard[];
  opp: PrepCard[];
  matchup: { you: PrepTeamMatchup; opp: PrepTeamMatchup };
  speed: PrepSpeedRow[];
  moves: { you: PrepNotableMoves; opp: PrepNotableMoves };
  /** Categories each species can cover, per side. */
  moveMatrix: { you: Record<SpeciesId, PrepMoveCategory[]>; opp: Record<SpeciesId, PrepMoveCategory[]> };
  oppLikelySets: Record<SpeciesId, PrepLikelySets>;
  /** Present only for opposing species the scout report has data on. */
  scouted: Record<SpeciesId, ScoutedMon>;
}

// ---- League core: draft + run state (appended by the league module) ----

/** One completed draft pick. `overall` is the 1-based overall pick number, `round` 1-based. */
export interface DraftPick {
  coach: CoachId;
  species: SpeciesId;
  points: number;
  overall: number;
  round: number;
}

/** Snake draft state. JSON-friendly (arrays only). Treated as immutable: draft functions return a new object. */
export interface DraftState {
  /** Round-1 pick order; even rounds run it in reverse. */
  order: CoachId[];
  /** Current round, 1-based (at most config.rosterMax rounds). */
  round: number;
  /** 0-based index of the NEXT overall pick (== picks.length). */
  pickIndex: number;
  /**
   * 0-based slot in the snake sequence (order, then order reversed, ...) of the coach on the clock. Slots of
   * coaches who are done (stopped, full, or out of affordable mons) are skipped, so it can run ahead of pickIndex.
   */
  turn: number;
  /** Coaches who stopped drafting (at or above config.rosterMin) or ran out of affordable picks. Full rosters need no entry. */
  done: CoachId[];
  picks: DraftPick[];
  /** Species still undrafted (also the free-agent pool after the draft). */
  available: SpeciesId[];
  complete: boolean;
  /** Per-coach draft budgets where they differ from config.budget (stake AI bonus). Absent coach = config.budget. */
  budgets?: Record<CoachId, number>;
}

/** The whole run (one league). JSON-friendly; every run function returns a new object. */
export interface RunState {
  /** Save-format version, bump on breaking shape changes. */
  version: number;
  id: string;
  seed: number;
  config: LeagueConfig;
  phase: RunPhase;
  /** Human first (isHuman true). */
  coaches: Coach[];
  humanId: CoachId;
  draft: DraftState;
  /** Current week, 1-based. Playoff rounds continue the count after config.weeks. */
  week: number;
  /** Regular season first, playoff rounds appended as they are seeded. */
  matches: Match[];
  freeAgencyUsed: number;
  eliminationReason?: EliminationReason;
  createdAt: number;
  /** Human-readable event log lines. */
  log: string[];
  /** Set on a daily league: everyone who plays that date gets the same seed and config (league/daily.ts). */
  daily?: { date: string };
}

/**
 * One finished (or in-progress) run boiled down for the run-end screen, the daily leaderboard and the opt-in
 * run-summary upload. JSON-friendly; built by summarizeRun (league/summary.ts). Never holds battle logs.
 */
export interface RunSummary {
  version: 1;
  runId: string;
  seed: number;
  config: LeagueConfig;
  /** The daily league's date when this was a daily run. */
  daily?: string;
  humanName: string;
  humanAbbrev: string;
  phase: RunPhase;
  eliminationReason?: EliminationReason;
  wins: number;
  losses: number;
  differential: number;
  playoffWins: number;
  /** Final standings rank, 1-based; 0 before any match is played. */
  rank: number;
  /** Matches the human has played (regular season + playoffs). */
  matchesPlayed: number;
  /** runScore: wins, differential, playoff wins and the title, weighted by DAILY_SCORE. */
  score: number;
  roster: SpeciesId[];
  mvp?: { species: SpeciesId; name: string; winRate: number; kos: number };
  createdAt: number;
  finishedAt: number;
}

// ---- Performance analytics (appended by the stats module) ----

/** One roster mon's line in one played match, mined from the stored omniscient log. */
export interface SpeciesMatchStats {
  /** ROSTER id (the Mega id when the roster entry is a Mega). */
  species: SpeciesId;
  coach: CoachId;
  matchId: string;
  brought: boolean;
  led: boolean;
  /** The coach won the match (true even for a mon left home; aggregates only count it when brought). */
  won: boolean;
  kos: number;
  fainted: boolean;
  /** Sum over the match of % of max HP removed from foes by this mon (its moves, or indirect damage naming it as [of]). */
  damageDealtPct: number;
  /** Sum over the match of % of its own max HP lost, from any source. */
  damageTakenPct: number;
  turnsActive: number;
  teraUsed: boolean;
  megaEvolved: boolean;
  zUsed: boolean;
}

/** One species summed over many matches (and leagues). Counts are sums; rates are recomputed from them. */
export interface SpeciesAggregate {
  species: SpeciesId;
  name: string;
  price: number;
  /** Times brought. */
  games: number;
  leads: number;
  /** Team won when this mon was brought. */
  wins: number;
  winRate: number;
  kos: number;
  faints: number;
  koPerGame: number;
  survivalRate: number;
  damagePerGame: number;
  damageTakenPerGame: number;
  teraRate: number;
  megaRate: number;
  zRate: number;
  /** Composite 0-100 performance score (performanceScore). 50 = an average mon. */
  score: number;
  /** Who owned it (usually one per league). */
  coaches: CoachId[];
}

export interface PriceSuggestion {
  species: SpeciesId;
  name: string;
  price: number;
  suggested: number;
  delta: number;
  games: number;
  score: number;
  reason: string;
}

// ---- Draft helper (appended by the prep module) ----

export interface WeakDelta { type: TypeName; before: number; after: number }

export interface TeamNeeds {
  matchup: PrepTeamMatchup;
  /** Types with a team weak score below 0, worst first. */
  weakTypes: { type: TypeName; score: number }[];
  /** Attacking types no roster mon has STAB in. */
  uncoveredStab: TypeName[];
  /** Roster mons by base Speed: fast >= 100, mid 70-99, slow < 70. */
  speed: { fast: number; mid: number; slow: number };
  /** Who can cover each notable-move category. */
  roles: Record<PrepMoveCategory, SpeciesId[]>;
  /** Categories nobody covers, most important first. */
  missingRoles: PrepMoveCategory[];
  /** At most 6 plain sentences. */
  summary: string[];
}

export interface PickImpactSync {
  candidate: SpeciesId;
  weakFixed: WeakDelta[];
  weakWorsened: WeakDelta[];
  newStab: TypeName[];
  speedSlot: 'fast' | 'mid' | 'slow';
  outspeeds: number;
  /** 0-100. Roles are included only when `newRoles` is present (the learnset cache was warm). */
  fitScore: number;
  note: string;
  /** Categories the candidate can cover that no roster mon can; absent while learnsets are unread. */
  newRoles?: PrepMoveCategory[];
}

export interface PickImpact extends PickImpactSync {
  newRoles: PrepMoveCategory[];
}
