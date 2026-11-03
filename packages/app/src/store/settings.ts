import { create } from 'zustand';

/** 'ani' = Showdown's animated 3D models (default); 'gen5ani' = animated Gen 5 pixel sprites. */
export type SpriteSet = 'ani' | 'gen5ani';

export interface Settings {
  spriteSet: SpriteSet;
  reducedMotion: boolean;
  /** Battle log panel open (desktop, tablet, landscape phone). Portrait phones open it as a sheet on demand. */
  battleLogOpen: boolean;
  /** Attack effects over the battle field (always off under reduced motion). */
  battleEffects: boolean;
  /** Cries and battle sound effects. */
  sound: boolean;
  /** Shown on the daily leaderboard; also the daily run's coach name. Stored trimmed, at most 20 chars. */
  nickname: string;
  /** Opt-in anonymous run-summary upload when a run ends (off by default). */
  shareRuns: boolean;
  /** Draft recommendations: FIT badges, the needs sentences, Sort by fit, the "what this adds" note. */
  draftHelper: boolean;
}

export const NICKNAME_MAX = 20;

/** The nickname as it is stored and posted: trimmed, at most NICKNAME_MAX characters. */
export function cleanNickname(s: string): string {
  return s.trim().slice(0, NICKNAME_MAX).trim();
}

const KEY = 'pdc.settings.v2';
const OLD_KEY = 'pdc.settings.v1';
const DEFAULTS: Settings = {
  spriteSet: 'ani', reducedMotion: false, battleLogOpen: true, battleEffects: true, sound: true, nickname: '', shareRuns: false, draftHelper: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // v1 stored only pixel sets; carry the motion preference over and take the new 3D default.
      const old = localStorage.getItem(OLD_KEY);
      const prev = old ? (JSON.parse(old) as { reducedMotion?: unknown }) : {};
      return { ...DEFAULTS, reducedMotion: prev.reducedMotion === true };
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      spriteSet: parsed.spriteSet === 'gen5ani' ? 'gen5ani' : 'ani',
      reducedMotion: parsed.reducedMotion === true,
      battleLogOpen: parsed.battleLogOpen !== false,
      battleEffects: parsed.battleEffects !== false,
      sound: parsed.sound !== false,
      nickname: typeof parsed.nickname === 'string' ? cleanNickname(parsed.nickname) : '',
      shareRuns: parsed.shareRuns === true,
      draftHelper: parsed.draftHelper !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

/** The setting or the OS preference, read outside React (store actions): with it on, reveals happen at once. */
export function motionReduced(): boolean {
  if (useSettings.getState().reducedMotion) return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface SettingsStore extends Settings {
  update(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  update(patch) {
    // In memory the nickname keeps what is being typed (inner spaces need a trailing one first); storage trims.
    set(patch.nickname === undefined ? patch : { ...patch, nickname: patch.nickname.slice(0, NICKNAME_MAX) });
    const { spriteSet, reducedMotion, battleLogOpen, battleEffects, sound, nickname, shareRuns, draftHelper } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({
        spriteSet, reducedMotion, battleLogOpen, battleEffects, sound, nickname: cleanNickname(nickname), shareRuns, draftHelper,
      }));
    } catch {
      /* storage full or blocked: settings stay in memory */
    }
  },
}));
