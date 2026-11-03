// Battle sound: species cries from the same Showdown host the sprites come from, and short effects synthesized
// with Web Audio (oscillators + filtered noise: no audio files, nothing copied). Two tables: one blip per type
// (played when a move of that type is used) and one per battle event. Everything is gated by the Sound setting.
import { Dex, toID } from '@pkmn/dex';
import { useSettings } from '../store/settings';

const dex = Dex.forGen(9);

type Wave = OscillatorType | 'noise';

/** One synth voice: a wave at `f0` sliding to `f1` over `ms`, starting `at` ms in, through optional low/high-pass filters. */
interface Voice {
  w: Wave;
  f0: number;
  f1?: number;
  ms: number;
  at?: number;
  gain?: number;
  lp?: number;
  hp?: number;
}

/** The blip a move of each type makes. */
export const TYPE_SFX: Record<string, Voice[]> = {
  Normal: [{ w: 'triangle', f0: 240, f1: 90, ms: 130, gain: 0.5 }],
  Fire: [{ w: 'noise', f0: 0, ms: 340, gain: 0.45, lp: 1800 }, { w: 'sawtooth', f0: 170, f1: 90, ms: 300, gain: 0.12, lp: 600 }],
  Water: [{ w: 'sine', f0: 720, f1: 240, ms: 260, gain: 0.4 }, { w: 'sine', f0: 900, f1: 520, ms: 140, at: 120, gain: 0.25 }],
  Electric: [{ w: 'square', f0: 1400, f1: 1050, ms: 190, gain: 0.14 }, { w: 'noise', f0: 0, ms: 160, gain: 0.3, hp: 2500 }],
  Grass: [{ w: 'triangle', f0: 520, f1: 780, ms: 180, gain: 0.3 }, { w: 'triangle', f0: 660, f1: 980, ms: 160, at: 100, gain: 0.25 }],
  Ice: [{ w: 'sine', f0: 1800, f1: 2600, ms: 160, gain: 0.22 }, { w: 'sine', f0: 2400, f1: 3200, ms: 140, at: 90, gain: 0.18 }],
  Fighting: [{ w: 'triangle', f0: 180, f1: 60, ms: 110, gain: 0.6 }, { w: 'noise', f0: 0, ms: 90, gain: 0.4, lp: 900 }],
  Poison: [{ w: 'sine', f0: 300, f1: 180, ms: 260, gain: 0.35 }, { w: 'sine', f0: 420, f1: 260, ms: 200, at: 140, gain: 0.25 }],
  Ground: [{ w: 'noise', f0: 0, ms: 360, gain: 0.55, lp: 400 }, { w: 'sine', f0: 70, f1: 40, ms: 360, gain: 0.5 }],
  Flying: [{ w: 'noise', f0: 0, ms: 260, gain: 0.35, hp: 1200, lp: 5000 }],
  Psychic: [{ w: 'sine', f0: 600, f1: 1200, ms: 320, gain: 0.28 }, { w: 'sine', f0: 604, f1: 1210, ms: 320, gain: 0.28 }],
  Bug: [{ w: 'sawtooth', f0: 900, f1: 700, ms: 90, gain: 0.12 }, { w: 'sawtooth', f0: 900, f1: 700, ms: 90, at: 110, gain: 0.12 }, { w: 'sawtooth', f0: 900, f1: 700, ms: 90, at: 220, gain: 0.12 }],
  Rock: [{ w: 'noise', f0: 0, ms: 200, gain: 0.5, lp: 700 }, { w: 'triangle', f0: 140, f1: 60, ms: 200, gain: 0.4 }],
  Ghost: [{ w: 'sine', f0: 400, f1: 150, ms: 420, gain: 0.3 }, { w: 'triangle', f0: 1200, f1: 300, ms: 420, gain: 0.1 }],
  Dragon: [{ w: 'sawtooth', f0: 110, f1: 220, ms: 360, gain: 0.25, lp: 1200 }, { w: 'noise', f0: 0, ms: 300, gain: 0.3, lp: 2200 }],
  Dark: [{ w: 'sawtooth', f0: 200, f1: 60, ms: 220, gain: 0.25, lp: 900 }],
  Steel: [{ w: 'square', f0: 2200, f1: 1800, ms: 90, gain: 0.1 }, { w: 'sine', f0: 3100, f1: 2900, ms: 260, gain: 0.18 }],
  Fairy: [{ w: 'sine', f0: 1200, f1: 1500, ms: 120, gain: 0.22 }, { w: 'sine', f0: 1600, f1: 2000, ms: 120, at: 90, gain: 0.22 }, { w: 'sine', f0: 2000, f1: 2400, ms: 160, at: 180, gain: 0.18 }],
  Stellar: [{ w: 'sine', f0: 900, f1: 1800, ms: 300, gain: 0.22 }, { w: 'triangle', f0: 1350, f1: 2700, ms: 300, gain: 0.12 }],
};

export type SfxName =
  | 'hit' | 'hitStrong' | 'hitWeak' | 'chip' | 'heal' | 'boost' | 'unboost' | 'status' | 'shield'
  | 'tera' | 'mega' | 'zpower' | 'faint' | 'weather' | 'hazard' | 'screen';

/** The sound each battle event makes. */
export const EVENT_SFX: Record<SfxName, Voice[]> = {
  hit: [{ w: 'noise', f0: 0, ms: 110, gain: 0.5, lp: 1400 }, { w: 'triangle', f0: 200, f1: 70, ms: 110, gain: 0.4 }],
  hitStrong: [{ w: 'noise', f0: 0, ms: 200, gain: 0.7, lp: 2200 }, { w: 'triangle', f0: 260, f1: 50, ms: 220, gain: 0.6 }, { w: 'square', f0: 1200, f1: 400, ms: 120, gain: 0.08 }],
  hitWeak: [{ w: 'noise', f0: 0, ms: 70, gain: 0.25, lp: 1000 }, { w: 'triangle', f0: 160, f1: 90, ms: 80, gain: 0.2 }],
  chip: [{ w: 'triangle', f0: 320, f1: 200, ms: 70, gain: 0.2 }],
  heal: [{ w: 'sine', f0: 660, ms: 90, gain: 0.2 }, { w: 'sine', f0: 880, ms: 90, at: 80, gain: 0.2 }, { w: 'sine', f0: 1320, ms: 160, at: 160, gain: 0.2 }],
  boost: [{ w: 'square', f0: 400, f1: 900, ms: 180, gain: 0.08 }, { w: 'sine', f0: 600, f1: 1300, ms: 180, gain: 0.2 }],
  unboost: [{ w: 'square', f0: 900, f1: 400, ms: 200, gain: 0.08 }, { w: 'sine', f0: 1300, f1: 600, ms: 200, gain: 0.2 }],
  status: [{ w: 'sine', f0: 500, f1: 380, ms: 140, gain: 0.22 }, { w: 'sine', f0: 500, f1: 380, ms: 140, at: 150, gain: 0.22 }],
  shield: [{ w: 'sine', f0: 1000, f1: 1500, ms: 120, gain: 0.18 }, { w: 'triangle', f0: 1500, ms: 200, at: 100, gain: 0.12 }],
  tera: [{ w: 'sine', f0: 523, ms: 160, gain: 0.2 }, { w: 'sine', f0: 659, ms: 160, at: 100, gain: 0.2 }, { w: 'sine', f0: 784, ms: 160, at: 200, gain: 0.2 }, { w: 'sine', f0: 1046, ms: 420, at: 300, gain: 0.25 }, { w: 'noise', f0: 0, ms: 500, at: 250, gain: 0.12, hp: 4000 }],
  mega: [{ w: 'sawtooth', f0: 110, f1: 440, ms: 500, gain: 0.12, lp: 1500 }, { w: 'sine', f0: 440, f1: 880, ms: 500, gain: 0.2 }, { w: 'noise', f0: 0, ms: 400, at: 300, gain: 0.18, hp: 3000 }],
  zpower: [{ w: 'sawtooth', f0: 80, f1: 160, ms: 700, gain: 0.14, lp: 900 }, { w: 'sine', f0: 330, f1: 660, ms: 600, at: 100, gain: 0.18 }, { w: 'sine', f0: 990, ms: 300, at: 500, gain: 0.15 }],
  faint: [{ w: 'sawtooth', f0: 420, f1: 70, ms: 380, gain: 0.18, lp: 1200 }],
  weather: [{ w: 'noise', f0: 0, ms: 600, gain: 0.25, lp: 2500, hp: 300 }],
  hazard: [{ w: 'triangle', f0: 500, f1: 300, ms: 80, gain: 0.2 }, { w: 'triangle', f0: 450, f1: 260, ms: 80, at: 110, gain: 0.2 }, { w: 'triangle', f0: 400, f1: 220, ms: 100, at: 220, gain: 0.2 }],
  screen: [{ w: 'sine', f0: 800, f1: 1600, ms: 260, gain: 0.18 }, { w: 'sine', f0: 1200, f1: 2400, ms: 260, at: 60, gain: 0.12 }],
};

const MASTER_GAIN = 0.22;
const CRY_VOLUME = 0.35;
const CRY_HOST = 'https://play.pokemonshowdown.com/audio/cries/';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const enabled = (): boolean => useSettings.getState().sound;

function audio(): AudioContext | null {
  try {
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function voice(ctx: AudioContext, v: Voice, delayMs: number): void {
  const t0 = ctx.currentTime + (delayMs + (v.at ?? 0)) / 1000;
  const dur = v.ms / 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v.gain ?? 0.3, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let src: AudioScheduledSourceNode;
  if (v.w === 'noise') {
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    s.loop = true;
    src = s;
  } else {
    const o = ctx.createOscillator();
    o.type = v.w;
    o.frequency.setValueAtTime(v.f0, t0);
    if (v.f1) o.frequency.exponentialRampToValueAtTime(v.f1, t0 + dur);
    src = o;
  }
  let node: AudioNode = src;
  if (v.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = v.lp;
    node.connect(f);
    node = f;
  }
  if (v.hp) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = v.hp;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master!);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function playVoices(voices: Voice[] | undefined, delayMs: number): void {
  if (!voices || !enabled()) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    for (const v of voices) voice(ctx, v, delayMs);
  } catch {
    /* an audio graph hiccup never breaks the battle */
  }
}

/** The blip for a move of this type. */
export function playTypeSfx(type: string, delayMs = 0): void {
  playVoices(TYPE_SFX[type] ?? TYPE_SFX.Normal, delayMs);
}

/** The sound for a battle event. */
export function playSfx(name: SfxName, delayMs = 0): void {
  playVoices(EVENT_SFX[name], delayMs);
}

/** Showdown's cry file id: base species, then the forme ("charizard-megax", "urshifu-rapidstrike"). */
export function cryId(species: string): string {
  const s = dex.species.get(species);
  if (!s.exists) return toID(species);
  const base = toID(s.baseSpecies);
  return s.forme ? `${base}-${toID(s.forme)}` : base;
}

const cries = new Map<string, HTMLAudioElement>();

/** Play a species' cry (on switch-in and faint). A forme without its own file falls back to the base cry. */
export function playCry(species: string): void {
  if (!enabled()) return;
  const id = cryId(species);
  const play = (file: string, onFail?: () => void): void => {
    let a = cries.get(file);
    if (!a) {
      a = new Audio(`${CRY_HOST}${file}.mp3`);
      a.preload = 'auto';
      cries.set(file, a);
    }
    a.volume = CRY_VOLUME;
    a.onerror = onFail ?? null;
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  };
  const base = id.split('-')[0]!;
  play(id, base !== id ? () => { cries.delete(id); play(base); } : undefined);
}
