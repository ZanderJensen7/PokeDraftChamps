// The one game store: current run, screen state machine, prep doc, week recap. The run is saved to
// localStorage on every change; the battle itself only goes through the bridge (src/game/bridge.ts).
import { create } from 'zustand';
import type {
  BattleSet, BuildSets, LeagueConfig, Match, PrepDoc, RunPhase, RunState, SpeciesId, StandingRow,
} from '@pdc/engine';
import {
  buildPrepDoc, computeStandings, createRun, deserializeRun, draftPick, draftStop, finishDraft, freeAgency,
  humanCoach, nextHumanMatch, opponentOf, playoffRoundName, resolveWeek, runAiDraftUntilHuman,
  serializeRun, setCaptains,
} from '@pdc/engine';
import { downloadText } from '../game/download';
import { getBridge, type PlayHumanMatchArgs } from '../game/bridge';
import { isZCrystal, updateHumanSet } from '../game/sets';

export type Screen =
  | 'title' | 'setup' | 'draft' | 'hub' | 'team' | 'prep' | 'battle' | 'recap' | 'end' | 'settings' | 'analytics';

export const RUN_KEY = 'pdc.run.v1';

export interface WeekRecap {
  week: number;
  label: string;
  match: Match;
  others: Match[];
  before: StandingRow[];
  after: StandingRow[];
  phaseAfter: RunPhase;
  placeholder: boolean;
}

export interface NewLeagueOptions {
  name: string;
  abbrev: string;
  seed: number;
  config: LeagueConfig;
}

interface GameState {
  run: RunState | null;
  screen: Screen;
  /** Where Settings / Team return to. */
  returnTo: Screen;
  hasSave: boolean;
  /** Draft picks revealed so far (AI picks animate in one at a time). */
  draftShown: number;
  prep: PrepDoc | null;
  prepKey: string | null;
  prepLoading: boolean;
  lineup: SpeciesId[];
  /** Set while the bridge plays the human's match; BattleScreen is mounted meanwhile. */
  battle: PlayHumanMatchArgs | null;
  /** Where the player asked to go while a live battle was running (a forfeit confirm is open). */
  leaveBattleTo: Screen | null;
  /** True while the rest of the week's matches simulate after the human match resolves. */
  simulatingWeek: boolean;
  lastWeekResults: WeekRecap | null;
  toast: string | null;
}

interface GameActions {
  go(screen: Screen): void;
  openOverlay(screen: 'settings' | 'team'): void;
  closeOverlay(): void;
  newLeague(opts: NewLeagueOptions): void;
  continueRun(): void;
  revealNextPick(): void;
  skipDraftAnimation(): void;
  humanPick(species: SpeciesId): void;
  /** The human stops drafting (allowed on the clock at or above config.rosterMin); the AI finishes the draft. */
  stopDrafting(): void;
  /**
   * Sets the human's Tera / Z captains; ends the draft if it is still open. Resolves false on a refusal.
   * Async: the set builder loads with the battle engine on first use.
   */
  setCaptainsWith(captains: { tera: SpeciesId[]; z: SpeciesId[] }): Promise<boolean>;
  /** Answer to the leave-battle confirm: forfeit and go, or stay. */
  confirmLeaveBattle(leave: boolean): void;
  loadPrep(): Promise<void>;
  setLineup(lineup: SpeciesId[]): void;
  playMatch(): Promise<void>;
  /** Async like setCaptainsWith (the new mon's set comes from the lazily loaded set builder). */
  doFreeAgency(drop: SpeciesId, add: SpeciesId): Promise<boolean>;
  saveSet(species: SpeciesId, set: BattleSet): void;
  exportSave(): void;
  importSave(file: File): Promise<void>;
  clearSave(): void;
  setToast(msg: string | null): void;
}

export type GameStore = GameState & GameActions;

function readSave(): string | null {
  try {
    return localStorage.getItem(RUN_KEY);
  } catch {
    return null;
  }
}

function screenFor(run: RunState): Screen {
  if (run.phase === 'draft') return 'draft';
  if (run.phase === 'season' || run.phase === 'playoffs') return 'hub';
  return 'end';
}

function defaultLineup(run: RunState): SpeciesId[] {
  return humanCoach(run).roster.slice(0, 6).map((r) => r.species);
}

export function validLineup(run: RunState, lineup: SpeciesId[]): boolean {
  const roster = new Set(humanCoach(run).roster.map((r) => r.species));
  return lineup.length === 6 && new Set(lineup).size === 6 && lineup.every((s) => roster.has(s));
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const BATTLE_CLOSED = 'battle screen closed';

/**
 * After captains change mid-season, held items follow the role: a new Z captain without a crystal and a
 * former Z captain still holding one take the item a fresh default set would carry. Moves, EVs etc. stay.
 */
function syncCaptainItems(before: RunState, after: RunState, buildSets: BuildSets): RunState {
  const was = new Map(humanCoach(before).roster.map((r) => [r.species, !!r.isZCaptain]));
  const human = humanCoach(after);
  const changed = human.roster.filter((r) => {
    const item = human.sets[r.species]?.item ?? '';
    return (was.get(r.species) ?? false) !== !!r.isZCaptain && !!r.isZCaptain !== isZCrystal(item);
  });
  if (changed.length === 0) return after;
  const fresh = buildSets(human, after.seed);
  const sets = { ...human.sets };
  for (const r of changed) {
    const cur = sets[r.species];
    const item = fresh[r.species]?.item ?? '';
    if (cur) sets[r.species] = { ...cur, item: !!r.isZCaptain === isZCrystal(item) ? item : '' };
  }
  return { ...after, coaches: after.coaches.map((c) => (c.id === after.humanId ? { ...c, sets } : c)) };
}

/** "Week 3 of 9", or the playoff round name. */
export function weekLabel(run: RunState, week = run.week, match?: Match): string {
  const m = match ?? run.matches.find((x) => x.week === week);
  if (m?.playoffRound !== undefined) return playoffRoundName(m.playoffRound, run.config.playoffTeams);
  if (week > run.config.weeks) return 'Playoffs';
  return `Week ${week} of ${run.config.weeks}`;
}

function freshRunState(run: RunState) {
  return {
    run,
    screen: screenFor(run),
    draftShown: run.draft.picks.length,
    prep: null,
    prepKey: null,
    lineup: run.draft.complete ? defaultLineup(run) : [],
    lastWeekResults: null,
    battle: null,
    simulatingWeek: false,
  };
}

export const useGame = create<GameStore>((set, get) => ({
  run: null,
  screen: 'title',
  returnTo: 'title',
  hasSave: readSave() !== null,
  draftShown: 0,
  prep: null,
  prepKey: null,
  prepLoading: false,
  lineup: [],
  battle: null,
  leaveBattleTo: null,
  simulatingWeek: false,
  lastWeekResults: null,
  toast: null,

  go(screen) {
    const { battle, screen: cur, simulatingWeek } = get();
    if (cur === 'battle' && screen !== 'battle' && battle && !simulatingWeek) {
      // A live battle: confirm first (forfeit). Still loading: drop it, playLiveMatch rejects quietly.
      if (battle.live) set({ leaveBattleTo: screen });
      else set({ battle: null, screen });
      return;
    }
    set({ screen });
  },

  confirmLeaveBattle(leave) {
    const { battle, leaveBattleTo } = get();
    set({ leaveBattleTo: null });
    if (!leave || !battle?.live || !leaveBattleTo) return;
    // Settle the match as a forfeit loss so playMatch resolves the week instead of waiting on CONTINUE.
    battle.live.forfeit();
    battle.live.finish();
    set({ screen: leaveBattleTo });
  },

  openOverlay(screen) {
    const cur = get().screen;
    set({ returnTo: cur === 'settings' || cur === 'team' ? get().returnTo : cur, screen });
  },

  closeOverlay() {
    set({ screen: get().returnTo });
  },

  newLeague({ name, abbrev, seed, config }) {
    try {
      let run = createRun({ config, seed, humanName: name, humanAbbrev: abbrev });
      run = runAiDraftUntilHuman(run);
      set({ ...freshRunState(run), draftShown: 0, toast: null });
    } catch (e) {
      set({ toast: errText(e) });
    }
  },

  continueRun() {
    const raw = readSave();
    if (!raw) return;
    try {
      set(freshRunState(deserializeRun(raw)));
    } catch (e) {
      set({ toast: `Could not load the save: ${errText(e)}` });
    }
  },

  revealNextPick() {
    const { run, draftShown } = get();
    if (!run) return;
    set({ draftShown: Math.min(draftShown + 1, run.draft.picks.length) });
  },

  skipDraftAnimation() {
    const { run } = get();
    if (run) set({ draftShown: run.draft.picks.length });
  },

  humanPick(species) {
    const { run } = get();
    if (!run) return;
    try {
      const picked = draftPick(run, species);
      const next = runAiDraftUntilHuman(picked);
      set({ run: next, draftShown: picked.draft.picks.length });
    } catch (e) {
      set({ toast: errText(e) });
    }
  },

  stopDrafting() {
    const { run } = get();
    if (!run) return;
    try {
      const stopped = draftStop(run);
      const next = runAiDraftUntilHuman(stopped);
      set({ run: next, draftShown: stopped.draft.picks.length });
    } catch (e) {
      set({ toast: errText(e) });
    }
  },

  async setCaptainsWith(captains) {
    try {
      const buildSets = await getBridge().loadBuildSets();
      const { run } = get();
      if (!run) return false;
      const withCaps = setCaptains(run, captains);
      if (run.phase === 'draft') {
        const next = finishDraft(withCaps, { buildSets });
        set({ run: next, screen: 'hub', lineup: defaultLineup(next), prep: null, prepKey: null });
      } else {
        set({ run: syncCaptainItems(run, withCaps, buildSets), prep: null, prepKey: null });
      }
      return true;
    } catch (e) {
      set({ toast: errText(e) });
      return false;
    }
  },

  async loadPrep() {
    const { run, prepKey, prepLoading } = get();
    if (!run) return;
    const match = nextHumanMatch(run);
    if (!match) return;
    const opp = opponentOf(run, match);
    const human = humanCoach(run);
    const key = `${match.id}|${human.roster.map((r) => `${r.species}${r.isTeraCaptain ? '*' : ''}${r.isZCaptain ? 'z' : ''}`).join(',')}`;
    if (!validLineup(run, get().lineup)) set({ lineup: defaultLineup(run) });
    if (prepKey === key || prepLoading) return;
    set({ prepLoading: true });
    try {
      const scout = getBridge().scout?.(run, opp.id);
      const doc = await buildPrepDoc({ you: human.roster, opp: opp.roster, scout });
      set({ prep: doc, prepKey: key, prepLoading: false });
    } catch (e) {
      set({ prepLoading: false, toast: `Prep failed: ${errText(e)}` });
    }
  },

  setLineup(lineup) {
    set({ lineup });
  },

  async playMatch() {
    const { run, lineup } = get();
    if (!run) return;
    const match = nextHumanMatch(run);
    if (!match) {
      set({ toast: 'No match to play this week.' });
      return;
    }
    if (!validLineup(run, lineup)) {
      set({ toast: 'Pick exactly 6 of your roster.' });
      return;
    }
    const bridge = getBridge();
    const args: PlayHumanMatchArgs = { run, humanLineup: [...lineup] };
    set({ battle: args, screen: 'battle' });
    try {
      const result = await bridge.playHumanMatch(args);
      const before = computeStandings(run.coaches, run.matches);
      set({ simulatingWeek: true });
      const next = await resolveWeek(run, result, { simulateMatch: bridge.simulateMatch });
      const after = computeStandings(next.coaches, next.matches);
      const played = next.matches.filter((m) => m.week === run.week && m.result);
      const mine = played.find((m) => m.id === match.id) ?? { ...match, result };
      // Left mid-battle (forfeit): stay where the player went; otherwise show the recap.
      const stayed = get().screen === 'battle';
      set({
        run: next,
        battle: null,
        simulatingWeek: false,
        prep: null,
        prepKey: null,
        screen: stayed ? 'recap' : get().screen,
        toast: stayed ? get().toast : `Battle forfeited: ${weekLabel(run, run.week, match)} counted as a loss.`,
        lastWeekResults: {
          week: run.week,
          label: weekLabel(run, run.week, match),
          match: mine,
          others: played.filter((m) => m.id !== match.id),
          before,
          after,
          phaseAfter: next.phase,
          placeholder: bridge.isPlaceholder === true,
        },
      });
    } catch (e) {
      if (errText(e) === BATTLE_CLOSED) set({ battle: null, simulatingWeek: false });
      else set({ battle: null, simulatingWeek: false, screen: 'prep', toast: `Battle failed: ${errText(e)}` });
    }
  },

  async doFreeAgency(drop, add) {
    try {
      const buildSets = await getBridge().loadBuildSets();
      const { run } = get();
      if (!run) return false;
      const next = freeAgency(run, drop, add, { buildSets });
      const lineup = get().lineup.map((s) => (s === drop ? add : s));
      set({ run: next, lineup, prep: null, prepKey: null });
      return true;
    } catch (e) {
      set({ toast: errText(e) });
      return false;
    }
  },

  saveSet(species, battleSet) {
    const { run } = get();
    if (!run) return;
    set({ run: updateHumanSet(run, species, battleSet) });
  },

  exportSave() {
    const { run } = get();
    const raw = run ? serializeRun(run) : readSave();
    if (!raw) return;
    const tag = run ? humanCoach(run).abbrev : 'run';
    downloadText(`pokedraftchamps-${tag}-week${run?.week ?? 0}.json`, raw);
  },

  async importSave(file) {
    try {
      const run = deserializeRun(await file.text());
      set({ ...freshRunState(run), toast: 'Save imported.' });
    } catch (e) {
      set({ toast: `Import failed: ${errText(e)}` });
    }
  },

  clearSave() {
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {
      /* storage blocked: nothing to clear */
    }
    set({
      run: null, hasSave: false, screen: 'title', returnTo: 'title', prep: null, prepKey: null,
      lastWeekResults: null, battle: null, simulatingWeek: false, leaveBattleTo: null,
    });
  },

  setToast(t) {
    set({ toast: t });
  },
}));

// Persist the run on every change.
useGame.subscribe((s, prev) => {
  if (s.run === prev.run || !s.run) return;
  try {
    localStorage.setItem(RUN_KEY, serializeRun(s.run));
    if (!s.hasSave) useGame.setState({ hasSave: true });
  } catch {
    useGame.setState({ toast: 'Could not save to this browser (storage full or blocked). Use Export save.' });
  }
});
