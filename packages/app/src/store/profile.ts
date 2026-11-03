// The player's career across runs (engine `Profile`): the stakes ladder, every finished run's summary and the
// trophy case. Lives in its own localStorage key so a new league, an import or a daily run never touches it;
// the engine's recordRunEnd is idempotent by run id, so a reload of a finished run never counts twice.
import { create } from 'zustand';
import { mergeProfiles, migrateProfile, recordRunEnd, type Profile, type RunState } from '@pdc/engine';

const KEY = 'pdc.profile.v1';

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return migrateProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return migrateProfile(null);
  }
}

function save(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: the profile stays in memory */
  }
}

const pick = (p: Profile): Profile => ({ version: p.version, stakeUnlocked: p.stakeUnlocked, runs: p.runs, trophies: p.trophies });

interface ProfileStore extends Profile {
  /** The run id whose title unlocked a stake this session (the end screen says so). */
  justUnlockedBy: string | null;
  /** Counts a finished run once (league or daily): career list, trophies, and the next stake on a title. */
  recordRunEnd(run: RunState): void;
  /** Folds an imported profile in by run id; returns how many runs it added. */
  mergeImported(raw: unknown): number;
  /** The plain profile, for export. */
  snapshot(): Profile;
}

export const useProfile = create<ProfileStore>((set, get) => ({
  ...load(),
  justUnlockedBy: null,
  recordRunEnd(run) {
    const before = pick(get());
    const next = recordRunEnd(before, run);
    if (next === before) return;
    set({ ...next, ...(next.stakeUnlocked > before.stakeUnlocked ? { justUnlockedBy: run.id } : {}) });
    save(next);
  },
  mergeImported(raw) {
    const before = pick(get());
    const next = mergeProfiles(before, migrateProfile(raw));
    if (next === before) return 0;
    set(next);
    save(next);
    return next.runs.length - before.runs.length;
  },
  snapshot() {
    return pick(get());
  },
}));
