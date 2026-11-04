// The player's career across runs (engine `Profile`): the stakes ladder, every finished run's summary and the
// trophy case. Lives in its own localStorage key so a new league, an import or a daily run never touches it;
// the engine's recordRunEnd is idempotent by run id, so a reload of a finished run never counts twice. It also holds
// the pool progression: the unlocked species a Badge Run drafts from and the scouting packs waiting to be opened.
import { create } from 'zustand';
import {
  markDrafted, mergeProfiles, migrateProfile, openPack, recordRunEnd, type Profile, type RunState, type SpeciesId,
} from '@pdc/engine';

const KEY = 'pdc.profile.v1';

/** A new profile's pool seed: random, so two players start from different halves of the pool. */
function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

function load(): Profile {
  let p: Profile;
  try {
    const raw = localStorage.getItem(KEY);
    p = migrateProfile(raw ? JSON.parse(raw) : null, randomSeed());
  } catch {
    p = migrateProfile(null, randomSeed());
  }
  // Store a fresh or migrated pool at once, so a reload never re-rolls its seed.
  save(p);
  return p;
}

function save(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: the profile stays in memory */
  }
}

const pick = (p: Profile): Profile => ({ version: p.version, stakeUnlocked: p.stakeUnlocked, runs: p.runs, trophies: p.trophies, pool: p.pool });

interface ProfileStore extends Profile {
  /** The run id whose title unlocked a stake this session (the end screen says so). */
  justUnlockedBy: string | null;
  /** Counts a finished run once (league or daily): career list, trophies, and the next stake on a title. */
  recordRunEnd(run: RunState): void;
  /** Opens the next scouting pack, keeping `keep` (one of the engine's packOffer). */
  openPack(keep: SpeciesId | null): void;
  /** Drops the NEW flair from a species the player just drafted. */
  markDrafted(species: SpeciesId): void;
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
  openPack(keep) {
    const next = openPack(pick(get()), keep);
    set(next);
    save(next);
  },
  markDrafted(species) {
    const before = pick(get());
    const next = markDrafted(before, [species]);
    if (next === before) return;
    set(next);
    save(next);
  },
  mergeImported(raw) {
    const before = pick(get());
    // An import from before pool progression gets this profile's seed, so it adds no second random half.
    const next = mergeProfiles(before, migrateProfile(raw, before.pool.seed));
    if (next === before) return 0;
    set(next);
    save(next);
    return next.runs.length - before.runs.length;
  },
  snapshot() {
    return pick(get());
  },
}));
