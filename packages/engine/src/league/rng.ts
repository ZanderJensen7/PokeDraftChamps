// Tiny deterministic PRNG (mulberry32) + seed derivation. No Math.random anywhere in the league core.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). Returns 0 when maxExclusive <= 0. */
  int(maxExclusive: number): number;
  /** Uniform element. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Fisher-Yates shuffle into a NEW array (input untouched). */
  shuffle<T>(arr: readonly T[]): T[];
  /** Derives a fresh 32-bit seed from this stream (advances it). */
  fork(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number =>
    maxExclusive <= 0 ? 0 : Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('rng.pick on empty array');
      return arr[int(arr.length)] as T;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    fork(): number {
      return Math.floor(next() * 4294967296) >>> 0;
    },
  };
}

/** Deterministically mixes a seed with labels/numbers into a new 32-bit seed (FNV-1a + murmur finalizer). */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  const feed = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // part separator
    h = Math.imul(h, 0x01000193);
  };
  for (const p of parts) feed(String(p));
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
