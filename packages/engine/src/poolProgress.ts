// Pool progression (docs/ROGUELIKE.md "Pool progression"): the profile's unlocked species, the scouting packs that
// grow it, and the Pokedex states. Pure and sim-free; profile.ts stores a PoolProgress and calls these. Species are
// the base pool's (Megas off): a Mega form is in a league's pool when its base species is.
import type { DraftMon, SpeciesId } from './types';
import { POOL_PROGRESSION } from './data/progression';
import { buildDraftPool, getDraftMon } from './draft/pool';
import { createRng, deriveSeed } from './league/rng';

/** The profile's share of the draft pool and its pack track. JSON-friendly. */
export interface PoolProgress {
  /** Seeds the starting pool and every pack, so two profiles differ and one profile replays. */
  seed: number;
  /** Unlocked base-pool species ids, sorted. */
  unlocked: SpeciesId[];
  /** Unlocked by a pack and not drafted since: the NEW flair. */
  fresh: SpeciesId[];
  /** First-win points toward the next pack (0..pointsPerPack - 1). */
  points: number;
  /** Packs earned and not opened yet. */
  packs: number;
  /** Packs opened so far: the next pack's index. */
  opened: number;
  /** Packs opened in a row without a star on offer (the pity counter). */
  sinceStar: number;
}

/** Every species the Pokedex lists: the base pool (Megas are forms of these). */
export function dexSpecies(): readonly DraftMon[] {
  return buildDraftPool({ megas: false });
}

const byTier = (mons: readonly DraftMon[]): Map<string, DraftMon[]> => {
  const out = new Map<string, DraftMon[]>();
  for (const m of mons) {
    const list = out.get(m.tier);
    if (list) list.push(m);
    else out.set(m.tier, [m]);
  }
  return out;
};

/** A new profile's pool: startShare of every pricing tier (rounded up), chosen by `seed`; the floor tiers in full. */
export function startingPool(seed: number): SpeciesId[] {
  const out: SpeciesId[] = [];
  for (const [tier, mons] of byTier(dexSpecies())) {
    const ids = mons.map((m) => m.id).sort();
    if (POOL_PROGRESSION.startFullTiers.includes(tier)) {
      out.push(...ids);
      continue;
    }
    const n = Math.ceil(ids.length * POOL_PROGRESSION.startShare);
    out.push(...createRng(deriveSeed(seed, 'startPool', tier)).shuffle(ids).slice(0, n));
  }
  return out.sort();
}

/** The base-pool species `id` stands for (a Mega form's base species), or undefined when it is not in the game. */
function baseId(id: SpeciesId): SpeciesId | undefined {
  const m = getDraftMon(id);
  return m ? (m.isMega ? m.baseSpecies : m.id) : undefined;
}

/** A new pool track: the starting pool from `seed` plus `extra` species (a migrated profile's drafted mons). */
export function newPoolProgress(seed: number, extra: readonly SpeciesId[] = []): PoolProgress {
  const kept = extra.map(baseId).filter((id): id is SpeciesId => !!id);
  return {
    seed: seed >>> 0,
    unlocked: [...new Set([...startingPool(seed), ...kept])].sort(),
    fresh: [],
    points: 0,
    packs: 0,
    opened: 0,
    sinceStar: 0,
  };
}

const ids = (raw: unknown): SpeciesId[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string'))] : [];
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Reads a stored PoolProgress field by field; undefined when it is not one (the caller builds a new pool). */
export function cleanPoolProgress(raw: unknown): PoolProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Partial<PoolProgress>;
  if (typeof p.seed !== 'number' || !Array.isArray(p.unlocked)) return undefined;
  const unlocked = ids(p.unlocked).sort();
  const have = new Set(unlocked);
  return {
    seed: p.seed >>> 0,
    unlocked,
    fresh: ids(p.fresh).filter((id) => have.has(id)),
    points: count(p.points) % POOL_PROGRESSION.pointsPerPack,
    packs: count(p.packs),
    opened: count(p.opened),
    sinceStar: count(p.sinceStar),
  };
}

/** Adds first-win points and packs earned: every pointsPerPack points open a pack. */
export function earnPacks(pool: PoolProgress, points: number, packs: number): PoolProgress {
  const total = pool.points + Math.max(0, points);
  return {
    ...pool,
    points: total % POOL_PROGRESSION.pointsPerPack,
    packs: pool.packs + Math.max(0, packs) + Math.floor(total / POOL_PROGRESSION.pointsPerPack),
  };
}

/** Drops the NEW flair from species just drafted. Returns `pool` itself when nothing changes. */
export function clearFresh(pool: PoolProgress, drafted: readonly SpeciesId[]): PoolProgress {
  const gone = new Set(drafted.map((id) => baseId(id) ?? id));
  if (!pool.fresh.some((id) => gone.has(id))) return pool;
  return { ...pool, fresh: pool.fresh.filter((id) => !gone.has(id)) };
}

const isStar = (m: DraftMon): boolean => m.points >= POOL_PROGRESSION.starPoints;

/** Seeded weighted draw of `n` distinct mons (weights > 0). */
function drawWeighted(mons: readonly DraftMon[], weight: (m: DraftMon) => number, n: number, rng: ReturnType<typeof createRng>): DraftMon[] {
  const left = mons.map((m) => ({ m, w: weight(m) }));
  const out: DraftMon[] = [];
  while (out.length < n && left.length > 0) {
    const total = left.reduce((s, x) => s + x.w, 0);
    let r = rng.next() * total;
    let i = 0;
    while (i < left.length - 1 && r >= left[i]!.w) r -= left[i++]!.w;
    out.push(left.splice(i, 1)[0]!.m);
  }
  return out;
}

/**
 * The next scouting pack: packSize locked species, no duplicates, each weighted by (locked share of its tier) ^
 * tierWeightPower, so the tiers you have opened least come up most. Pity: after pityEvery - 1 packs in a row with
 * no star on offer, the first slot is a star (while any is locked). Seeded by (pool.seed, opened): the offer is the
 * same across reloads until the pack is opened. Empty when nothing is locked.
 */
export function packOffer(pool: PoolProgress): DraftMon[] {
  const have = new Set(pool.unlocked);
  const all = dexSpecies();
  const tiers = byTier(all);
  const lockedShare = new Map<string, number>();
  for (const [tier, mons] of tiers) lockedShare.set(tier, mons.filter((m) => !have.has(m.id)).length / mons.length);
  const locked = all.filter((m) => !have.has(m.id));
  const weight = (m: DraftMon): number => (lockedShare.get(m.tier) ?? 0) ** POOL_PROGRESSION.tierWeightPower;
  const rng = createRng(deriveSeed(pool.seed, 'pack', pool.opened));
  const stars = locked.filter(isStar);
  const pity = pool.sinceStar >= POOL_PROGRESSION.pityEvery - 1 && stars.length > 0;
  const first = pity ? drawWeighted(stars, weight, 1, rng) : [];
  const rest = drawWeighted(locked.filter((m) => !first.includes(m)), weight, POOL_PROGRESSION.packSize - first.length, rng);
  return [...first, ...rest];
}

/**
 * Opens the next pack keeping `keep` (one of packOffer(pool)): it is unlocked and flagged NEW. Throws when no pack
 * is waiting or `keep` was not offered. With nothing left to unlock the pack is spent and `keep` is ignored.
 */
export function openPoolPack(pool: PoolProgress, keep: SpeciesId | null): PoolProgress {
  if (pool.packs <= 0) throw new Error('no scouting pack to open');
  const offer = packOffer(pool);
  const spent = { ...pool, packs: pool.packs - 1, opened: pool.opened + 1 };
  if (offer.length === 0) return spent;
  const kept = offer.find((m) => m.id === keep);
  if (!kept) throw new Error(`${String(keep)} is not in this pack`);
  return {
    ...spent,
    unlocked: [...pool.unlocked, kept.id].sort(),
    fresh: [...pool.fresh, kept.id],
    sinceStar: offer.some(isStar) ? 0 : pool.sinceStar + 1,
  };
}

// ---- Pokedex ----

export type DexState = 'locked' | 'unlocked' | 'drafted' | 'wonWith' | 'champion';
export const DEX_STATES: readonly DexState[] = ['locked', 'unlocked', 'drafted', 'wonWith', 'champion'];

/** What the Pokedex needs from a species' trophy (profile.ts `Trophy`). */
export interface DexTrophy {
  drafted: number;
  wins: number;
  titles: number;
}

export interface DexEntry {
  mon: DraftMon;
  state: DexState;
  wins: number;
  titles: number;
  drafted: number;
  isNew: boolean;
  shiny: boolean;
}

/**
 * Each species' highest state: Champion (a title with it on the roster), Won with (a match won with it brought),
 * Drafted, Unlocked, Locked. A species you have drafted or won with counts as unlocked even if the pool says not
 * (a daily league drafts from the full pool).
 */
export function dexState(t: DexTrophy | undefined, unlocked: boolean): DexState {
  if (t && t.titles > 0) return 'champion';
  if (t && t.wins > 0) return 'wonWith';
  if (t && t.drafted > 0) return 'drafted';
  return unlocked ? 'unlocked' : 'locked';
}

export const hasShiny = (t: Pick<DexTrophy, 'wins'> | undefined): boolean => (t?.wins ?? 0) >= POOL_PROGRESSION.shinyWins;

/** Every species in Dex order (number, then name) with its state for this profile. */
export function pokedex(pool: PoolProgress, trophies: Readonly<Record<SpeciesId, DexTrophy>>): DexEntry[] {
  const have = new Set(pool.unlocked);
  const fresh = new Set(pool.fresh);
  return [...dexSpecies()]
    .sort((a, b) => a.num - b.num || a.name.localeCompare(b.name))
    .map((mon) => {
      const t = trophies[mon.id];
      return {
        mon,
        state: dexState(t, have.has(mon.id)),
        wins: t?.wins ?? 0,
        titles: t?.titles ?? 0,
        drafted: t?.drafted ?? 0,
        isNew: fresh.has(mon.id),
        shiny: hasShiny(t),
      };
    });
}

/** Share of the Pokedex at "Won with" or better, 0..1. */
export function dexCompletion(entries: readonly Pick<DexEntry, 'state'>[]): number {
  if (entries.length === 0) return 0;
  return entries.filter((e) => e.state === 'wonWith' || e.state === 'champion').length / entries.length;
}
