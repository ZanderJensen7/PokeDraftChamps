// The `@pdc/engine/battle` entry: everything that loads @pkmn/sim / @pkmn/randoms / @smogon/calc (sets, players, the
// battle runner, AI, lineups, scouting, match simulation, and the league's bound engineDeps). The main entry
// (`@pdc/engine`, src/index.ts) stays sim-free so the app's first load never pulls the simulator.
export { buildSetFor, buildSeasonSets, setSpeciesId, spreadFor, type BuildSetOptions } from './sets';
export {
  RandomPlayer, switchableSlots, usableMoves,
  type BattlePlayer, type ParsedRequest, type PlayerContext, type RequestActive, type RequestMove, type RequestPokemon,
} from './player';
export {
  runBattle, createInteractiveBattle, outcomeFromLog, BATTLE_FORMAT, FALLBACK_FORMAT, DEFAULT_MAX_TURNS,
  type BattleOutcome, type BattleSideOptions, type InteractiveBattle, type InteractiveBattleOptions, type RunBattleOptions,
} from './runner';
export { HeuristicPlayer, type HeuristicOptions } from './heuristicPlayer';
export { chooseLineup, LINEUP_SIZE } from './lineup';
export { simulateMatch, humanMatchResult } from './simulateMatch';
export { viewOf, viewTypes, type BattleView, type MonView, type SideView } from './view';
export { Rng as BattleRng } from './rng';
export * from '../game';
