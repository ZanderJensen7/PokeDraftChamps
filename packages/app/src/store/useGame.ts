// The one game store: current run, screen state machine, prep doc, week recap. The run is saved to
// localStorage on every change (two slots: the league run and the daily run); the battle itself only goes
// through the bridge (src/game/bridge.ts).
import { create } from 'zustand';
import type {
  BattleSet, BuildSets, LeagueConfig, Match, PrepDoc, RunPhase, RunState, SpeciesId, StandingRow,
} from '@pdc/engine';
import {
  buildPrepDoc, computeStandings, createRun, dailyDate, dailyInfo, deserializeRun, draftPick, draftStop,
  finishDraft, freeAgency, humanCoach, nextHumanMatch, opponentOf, playoffRoundName, resolveWeek, resultLabel,
  runAiDraftUntilHuman, serializeRun, setCaptains, summarizeRun, visibleRoster,
} from '@pdc/engine';
import { downloadText } from '../game/download';
import { getBridge, type PlayHumanMatchArgs } from '../game/bridge';
import { isZCrystal, updateHumanSet } from '../game/sets';
import { apiEnabled, postDailyScore, postRunSummary } from '../game/api';
import { cleanNickname, motionReduced, useSettings } from './settings';
import { useProfile } from './profile';

export type Screen =
  | 'title' | 'setup' | 'draft' | 'hub' | 'team' | 'prep' | 'battle' | 'recap' | 'end' | 'settings' | 'analytics'
  | 'daily' | 'hall' | 'replay';

/** The league slot (any run without `daily`). */
export const RUN_KEY = 'pdc.run.v1';
/** The daily slot: one daily run at a time, overwritten by the next day's. */
export const DAILY_KEY = 'pdc.daily.v1';
/** Daily scores posted from this browser: { [runId]: { score, rank?, at } }. */
export const POSTED_KEY = 'pdc.posted.v1';
/** Run ids whose summary was uploaded (opt-in sharing), newest last, capped. */
export const UPLOADED_KEY = 'pdc.uploaded.v1';
const UPLOADED_CAP = 200;

export interface PostedScore {
  score: number;
  rank?: number;
  at: number;
}

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
  /** A league save exists (RUN_KEY). */
  hasSave: boolean;
  /** A daily save exists (DAILY_KEY), for any date. */
  hasDaily: boolean;
  /** The saved daily run's date, or null. */
  dailySaveDate: string | null;
  /** Daily scores posted from this browser, by run id. */
  posted: Record<string, PostedScore>;
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
  /** The match the replay screen shows, and the screen its Back button returns to. */
  replayMatchId: string | null;
  replayFrom: Screen;
  toast: string | null;
}

interface GameActions {
  go(screen: Screen): void;
  /** Opens the replay of a played match; Back returns to the current screen. */
  watch(matchId: string): void;
  openOverlay(screen: 'settings' | 'team'): void;
  closeOverlay(): void;
  newLeague(opts: NewLeagueOptions): void;
  continueRun(): void;
  /** Today's daily league: continues today's save when there is one (one attempt per day), else starts it. */
  startDaily(): void;
  /** Loads the daily slot (any date). */
  continueDaily(): void;
  /** Posts the daily run's score (the active run when it is a daily, else the daily save). */
  postScore(): Promise<boolean>;
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
  doFreeAgency(drop: SpeciesId | null, add: SpeciesId): Promise<boolean>;
  saveSet(species: SpeciesId, set: BattleSet): void;
  exportSave(): void;
  importSave(file: File): Promise<void>;
  clearSave(): void;
  setToast(msg: string | null): void;
}

export type GameStore = GameState & GameActions;

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readSave(): string | null {
  return readKey(RUN_KEY);
}

/** The save slot a run belongs to. */
export function slotOf(run: Pick<RunState, 'daily'>): string {
  return run.daily ? DAILY_KEY : RUN_KEY;
}

/** The date of a serialized daily run, without parsing the whole save. */
function dailyDateOf(raw: string | null): string | null {
  if (!raw) return null;
  return /"daily":\{"date":"(\d{4}-\d{2}-\d{2})"\}/.exec(raw)?.[1] ?? null;
}

/** The saved daily run, parsed, or null (none / unreadable). */
export function loadDailySave(): RunState | null {
  const raw = readKey(DAILY_KEY);
  if (!raw) return null;
  try {
    return deserializeRun(raw);
  } catch {
    return null;
  }
}

/** Coach name and tag for a daily run from the settings nickname. */
function dailyIdentity(): { name: string; abbrev: string } {
  const nick = cleanNickname(useSettings.getState().nickname);
  const abbrev = nick.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  return { name: nick || 'Daily Challenger', abbrev: abbrev || 'YOU' };
}

function readJson<T>(key: string, fallback: T, ok: (x: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return ok(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: kept in memory only */
  }
}

const isRecord = (x: unknown): boolean => !!x && typeof x === 'object' && !Array.isArray(x);
const readPosted = (): Record<string, PostedScore> => readJson(POSTED_KEY, {}, isRecord);
const readUploaded = (): string[] => readJson<string[]>(UPLOADED_KEY, [], Array.isArray).filter((x) => typeof x === 'string');

const isFinished = (run: RunState): boolean => run.phase === 'champion' || run.phase === 'eliminated';

/** Run ids with an upload in flight (so a burst of run changes sends one request). */
const uploading = new Set<string>();

/**
 * Opt-in anonymous run-summary upload, once per run id, fire-and-forget. Only when the player turned
 * sharing on and the build has an API; the run must be over.
 */
function maybeUploadSummary(run: RunState): void {
  if (!isFinished(run) || !useSettings.getState().shareRuns || !apiEnabled()) return;
  if (uploading.has(run.id) || readUploaded().includes(run.id)) return;
  uploading.add(run.id);
  void postRunSummary(summarizeRun(run)).then((res) => {
    uploading.delete(run.id);
    if (!res.ok) return;
    const list = readUploaded().filter((id) => id !== run.id);
    list.push(run.id);
    writeJson(UPLOADED_KEY, list.slice(-UPLOADED_CAP));
  });
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

/** AI picks reveal one at a time from `shown`; under reduced motion they all show at once (no animation to skip). */
function revealedAfter(run: RunState, shown: number): number {
  return motionReduced() ? run.draft.picks.length : shown;
}

/** A new draft: every AI pick before the human's first turn animates in (or shows at once under reduced motion). */
function revealedAtStart(run: RunState): number {
  return revealedAfter(run, 0);
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

const initialDaily = readKey(DAILY_KEY);

export const useGame = create<GameStore>((set, get) => ({
  run: null,
  screen: 'title',
  returnTo: 'title',
  hasSave: readSave() !== null,
  hasDaily: initialDaily !== null,
  dailySaveDate: dailyDateOf(initialDaily),
  posted: readPosted(),
  draftShown: 0,
  prep: null,
  prepKey: null,
  prepLoading: false,
  lineup: [],
  battle: null,
  leaveBattleTo: null,
  simulatingWeek: false,
  lastWeekResults: null,
  replayMatchId: null,
  replayFrom: 'hub',
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

  watch(matchId) {
    set({ replayMatchId: matchId, replayFrom: get().screen, screen: 'replay' });
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
      set({ ...freshRunState(run), draftShown: revealedAtStart(run), toast: null });
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

  startDaily() {
    const date = dailyDate();
    const { run } = get();
    // Already playing today's daily: just go back to it.
    if (run?.daily?.date === date) {
      set({ screen: screenFor(run) });
      return;
    }
    // One attempt per day: today's save is continued, never restarted.
    if (get().dailySaveDate === date) {
      get().continueDaily();
      return;
    }
    try {
      const info = dailyInfo(date);
      const { name, abbrev } = dailyIdentity();
      let next = createRun({ config: info.config, seed: info.seed, humanName: name, humanAbbrev: abbrev, daily: { date } });
      next = runAiDraftUntilHuman(next);
      set({ ...freshRunState(next), draftShown: revealedAtStart(next), toast: null });
    } catch (e) {
      set({ toast: errText(e) });
    }
  },

  continueDaily() {
    const raw = readKey(DAILY_KEY);
    if (!raw) return;
    try {
      set(freshRunState(deserializeRun(raw)));
    } catch (e) {
      set({ toast: `Could not load the daily save: ${errText(e)}` });
    }
  },

  async postScore() {
    const { run } = get();
    const target = run?.daily ? run : loadDailySave();
    if (!target?.daily) {
      set({ toast: 'No daily run to post.' });
      return false;
    }
    if (!apiEnabled()) {
      set({ toast: 'Leaderboard not configured in this build.' });
      return false;
    }
    if (!isFinished(target)) {
      set({ toast: 'Finish the daily league first.' });
      return false;
    }
    const nickname = cleanNickname(useSettings.getState().nickname);
    if (!nickname) {
      set({ toast: 'Set a nickname first: it is the name on the leaderboard.' });
      return false;
    }
    const summary = summarizeRun(target);
    const res = await postDailyScore(target.daily.date, {
      nickname,
      score: summary.score,
      seed: target.seed >>> 0,
      runId: target.id,
      abbrev: summary.humanAbbrev,
      result: resultLabel(summary),
    });
    if (!res.ok) {
      set({ toast: `Could not post the score: ${res.error}` });
      return false;
    }
    const posted = { ...readPosted(), ...get().posted, [target.id]: { score: summary.score, rank: res.data.rank, at: Date.now() } };
    writeJson(POSTED_KEY, posted);
    set({ posted, toast: `Posted: rank #${res.data.rank}` });
    return true;
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
      set({ run: next, draftShown: revealedAfter(next, picked.draft.picks.length) });
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
      set({ run: next, draftShown: revealedAfter(next, stopped.draft.picks.length) });
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
      // Fog of war (stake 7+): the doc only covers the opposing mons already seen in a stored battle.
      const doc = await buildPrepDoc({ you: human.roster, opp: visibleRoster(run, opp.id, scout), scout });
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
    const profile = useProfile.getState().snapshot();
    const withCareer = profile.runs.length > 0;
    if (!raw && !withCareer) return;
    const tag = run ? (run.daily ? `daily-${run.daily.date}` : humanCoach(run).abbrev) : raw ? 'run' : 'career';
    // With a career to keep, the file carries both: { run, profile }. Otherwise the bare run, as before.
    const text = withCareer ? JSON.stringify({ run: raw ? JSON.parse(raw) as unknown : null, profile }) : raw!;
    downloadText(`pokedraftchamps-${tag}-week${run?.week ?? 0}.json`, text);
  },

  async importSave(file) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // New files are { run, profile }; older ones are the bare run.
      const bundle = parsed && typeof parsed === 'object' && 'profile' in parsed
        ? parsed as { run?: unknown; profile: unknown }
        : null;
      const added = bundle ? useProfile.getState().mergeImported(bundle.profile) : 0;
      const career = added > 0 ? ` ${added} run${added === 1 ? '' : 's'} added to your career.` : '';
      const runJson = bundle ? bundle.run : parsed;
      if (bundle && runJson == null) {
        set({ toast: `Career imported.${career || ' Nothing new to add.'}` });
        return;
      }
      const run = deserializeRun(JSON.stringify(runJson));
      set({ ...freshRunState(run), toast: `Save imported.${career}` });
    } catch (e) {
      set({ toast: `Import failed: ${errText(e)}` });
    }
  },

  clearSave() {
    const { run } = get();
    const key = run ? slotOf(run) : RUN_KEY;
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage blocked: nothing to clear */
    }
    set({
      ...(key === DAILY_KEY ? { hasDaily: false, dailySaveDate: null } : { hasSave: false }),
      run: null, screen: 'title', returnTo: 'title', prep: null, prepKey: null,
      lastWeekResults: null, battle: null, simulatingWeek: false, leaveBattleTo: null,
    });
  },

  setToast(t) {
    set({ toast: t });
  },
}));

// Persist the run on every change, in its slot (daily or league); a run that just ended may upload its summary
// and goes into the career profile (once per run id), which may unlock the next stake.
useGame.subscribe((s, prev) => {
  if (s.run === prev.run || !s.run) return;
  const run = s.run;
  try {
    localStorage.setItem(slotOf(run), serializeRun(run));
    if (run.daily) {
      if (!s.hasDaily || s.dailySaveDate !== run.daily.date) useGame.setState({ hasDaily: true, dailySaveDate: run.daily.date });
    } else if (!s.hasSave) {
      useGame.setState({ hasSave: true });
    }
  } catch {
    useGame.setState({ toast: 'Could not save to this browser (storage full or blocked). Use Export save.' });
  }
  maybeUploadSummary(run);
  useProfile.getState().recordRunEnd(run);
});
