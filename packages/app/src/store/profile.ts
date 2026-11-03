// The player's profile across runs: how far up the stakes ladder they have unlocked. Lives in its own
// localStorage key so a new league, an import or a daily run never touches it.
import { create } from 'zustand';
import { MAX_STAKE, type RunState } from '@pdc/engine';

export interface Profile {
  version: 1;
  /** Highest stake the setup screen offers (1 = only the base game). */
  stakeUnlocked: number;
}

const KEY = 'pdc.profile.v1';
/** Run ids already counted, so a reload of a finished run never unlocks twice. */
const SEEN_KEY = 'pdc.profileSeen.v1';
const SEEN_CAP = 200;
const DEFAULTS: Profile = { version: 1, stakeUnlocked: 1 };

const clampStake = (n: unknown): number =>
  typeof n === 'number' && Number.isInteger(n) ? Math.max(1, Math.min(MAX_STAKE, n)) : 1;

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return { version: 1, stakeUnlocked: clampStake(parsed.stakeUnlocked) };
  } catch {
    return DEFAULTS;
  }
}

function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the profile stays in memory */
  }
}

interface ProfileStore extends Profile {
  /** The run id whose title unlocked a stake this session (the end screen says so). */
  justUnlockedBy: string | null;
  /** Counts a finished league run once: a title at the highest unlocked stake opens the next one. */
  recordRunEnd(run: RunState): void;
}

/** Run ids counted this session (storage may be blocked). */
const counted = new Set<string>();

export const useProfile = create<ProfileStore>((set, get) => ({
  ...load(),
  justUnlockedBy: null,
  recordRunEnd(run) {
    if (run.daily || (run.phase !== 'champion' && run.phase !== 'eliminated')) return;
    if (counted.has(run.id)) return;
    counted.add(run.id);
    const seen = readSeen();
    if (seen.includes(run.id)) return;
    save(SEEN_KEY, [...seen, run.id].slice(-SEEN_CAP));
    const { stakeUnlocked } = get();
    const stake = run.config.stake;
    if (run.phase !== 'champion' || stake < stakeUnlocked || stake >= MAX_STAKE) return;
    const next: Profile = { version: 1, stakeUnlocked: stake + 1 };
    set({ ...next, justUnlockedBy: run.id });
    save(KEY, next);
  },
}));
