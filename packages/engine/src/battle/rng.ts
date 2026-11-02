// Tiny seeded RNG (mulberry32). Deterministic, browser-safe.
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) ^ 0x5bd1e995;
  }
  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)] as T;
  }
  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
  /** Four 16-bit words for a sim battle seed. */
  seed4(): [number, number, number, number] {
    return [this.int(65536), this.int(65536), this.int(65536), this.int(65536)];
  }
}
