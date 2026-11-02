import { create } from 'zustand';

/** 'ani' = Showdown's animated 3D models (default); 'gen5ani' = animated Gen 5 pixel sprites. */
export type SpriteSet = 'ani' | 'gen5ani';

export interface Settings {
  spriteSet: SpriteSet;
  reducedMotion: boolean;
  /** Battle log panel open (desktop, tablet, landscape phone). Portrait phones open it as a sheet on demand. */
  battleLogOpen: boolean;
}

const KEY = 'pdc.settings.v2';
const OLD_KEY = 'pdc.settings.v1';
const DEFAULTS: Settings = { spriteSet: 'ani', reducedMotion: false, battleLogOpen: true };

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
    };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsStore extends Settings {
  update(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  update(patch) {
    set(patch);
    const { spriteSet, reducedMotion, battleLogOpen } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ spriteSet, reducedMotion, battleLogOpen }));
    } catch {
      /* storage full or blocked: settings stay in memory */
    }
  },
}));
