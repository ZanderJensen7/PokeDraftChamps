import type {
  DraftMon, PickImpact, PickImpactSync, PrepMoveCategory, SpeciesId, TeamNeeds, TypeName, WeakDelta,
} from '../types';
import { getDraftMon } from '../draft/pool';
import { ALL_TYPES, gen9Dex, monMatchupRow, teamMatchupTable, weakScore } from './typeChart';
import { MOVE_CATEGORY_NAMES, teamMoveMatrix } from './moves';

/** Role importance order used for `missingRoles` and for weighting `newRoles`. */
export const ROLE_PRIORITY: readonly PrepMoveCategory[] = [
  'Entry Hazards', 'Hazard Removal', 'Momentum', 'Healing', 'Priority',
  'Status', 'Item Removal', 'Disruption', 'Speed Control', 'Screens',
];

/**
 * fitScore weights (base 40, clamped to 0-100):
 *  + weak fixes: 5 per point of score improvement on a weak type (max 3 points per type), cap +30
 *  - weak worsened: 4 per point lost on a type that ends weak (max 3 per type), cap -25
 *  + new roles (pickImpact, and pickImpactSync / rankPool once the role cache is warm): 8 each for Entry Hazards / Hazard Removal / Momentum / Healing,
 *    4 each for the rest, cap +24
 *  + new STAB: 4 per attacking type the roster has no STAB in, cap +8
 *  + speed need: fast slot +8 if roster has < 2 fast mons, +3 if exactly 2; mid slot +2 if roster has < 2 mid
 *  - type stacking: per candidate type, -6 if the roster already has 2+ of it, -2 if it has 1; cap -12
 */
export const FIT_WEIGHTS = {
  base: 40, fixPerPoint: 5, fixCap: 30, worsenPerPoint: 4, worsenCap: 25,
  roleTop: 8, roleRest: 4, roleCap: 24, stabEach: 4, stabCap: 8,
  fastNeedLow: 8, fastNeedMid: 3, midNeed: 2, stackHeavy: 6, stackLight: 2, stackCap: 12,
} as const;

interface MonInfo { id: SpeciesId; types: TypeName[]; spe: number; row: Record<TypeName, number> }

const infoCache = new Map<SpeciesId, MonInfo>();

function monInfo(id: SpeciesId, mon?: DraftMon): MonInfo {
  const hit = infoCache.get(id);
  if (hit) return hit;
  const sp = gen9Dex.species.get(id);
  const info: MonInfo = {
    id,
    types: mon ? mon.types : [...sp.types],
    spe: mon ? mon.baseStats.spe : sp.baseStats.spe,
    // Same ability rule as teamMatchupTable: slot 0.
    row: monMatchupRow(id, sp.abilities[0] ?? ''),
  };
  infoCache.set(id, info);
  return info;
}

type Slot = 'fast' | 'mid' | 'slow';
const slotOf = (spe: number): Slot => (spe >= 100 ? 'fast' : spe >= 70 ? 'mid' : 'slow');

interface RosterCtx {
  infos: MonInfo[];
  weak: Record<TypeName, number>;
  sums: Record<TypeName, number>;
  resisters: Record<TypeName, number>;
  stab: Record<TypeName, number>;
  speed: { fast: number; mid: number; slow: number };
}

function weakFrom(
  sums: Record<TypeName, number>, res: Record<TypeName, number>, t: TypeName, extraSum = 0, extraRes = 0,
): number {
  const r = (res[t] ?? 0) + extraRes;
  return (sums[t] ?? 0) + extraSum - (r === 0 ? 2 : r === 1 ? 1 : 0);
}

function buildCtx(rosterIds: SpeciesId[]): RosterCtx {
  const infos = rosterIds.map((id) => monInfo(id));
  const sums: Record<TypeName, number> = {};
  const resisters: Record<TypeName, number> = {};
  const stab: Record<TypeName, number> = {};
  for (const t of ALL_TYPES) { sums[t] = 0; resisters[t] = 0; stab[t] = 0; }
  const speed = { fast: 0, mid: 0, slow: 0 };
  for (const m of infos) {
    for (const t of ALL_TYPES) {
      const mult = m.row[t] ?? 1;
      sums[t] = (sums[t] ?? 0) + weakScore(mult);
      if (mult < 1) resisters[t] = (resisters[t] ?? 0) + 1;
    }
    for (const t of m.types) stab[t] = (stab[t] ?? 0) + 1;
    speed[slotOf(m.spe)]++;
  }
  const weak: Record<TypeName, number> = {};
  for (const t of ALL_TYPES) weak[t] = infos.length ? weakFrom(sums, resisters, t) : 0;
  return { infos, weak, sums, resisters, stab, speed };
}

const baseOf = (id: SpeciesId): SpeciesId => getDraftMon(id)?.baseSpecies ?? id;

const categoryCache = new Map<SpeciesId, Promise<PrepMoveCategory[]>>();
/** The resolved half of `categoryCache`, so the synchronous scorers can use roles once they are read. */
const knownCategories = new Map<SpeciesId, PrepMoveCategory[]>();

/** Notable-move categories a species can cover (Megas use their base species' learnset). Cached. */
function categoriesFor(id: SpeciesId): Promise<PrepMoveCategory[]> {
  const base = baseOf(id);
  let p = categoryCache.get(base);
  if (!p) {
    p = teamMoveMatrix([base]).then((m) => {
      const cats = m[base] ?? [];
      knownCategories.set(base, cats);
      return cats;
    });
    categoryCache.set(base, p);
    p.catch(() => categoryCache.delete(base));
  }
  return p;
}

/** True when the learnset categories of every species in `ids` are already cached. */
export function roleCategoriesReady(ids: readonly SpeciesId[]): boolean {
  return ids.every((id) => knownCategories.has(baseOf(id)));
}

/**
 * Reads the learnset categories for `ids` into the cache a chunk at a time, yielding to the event loop between
 * chunks so a caller can start it right after first paint. `onProgress` fires after every chunk.
 */
export async function warmRoleCategories(
  ids: readonly SpeciesId[], opts: { chunk?: number; onProgress?: () => void } = {},
): Promise<void> {
  const chunk = opts.chunk ?? 24;
  const todo = [...new Set(ids.map(baseOf))].filter((b) => !knownCategories.has(b));
  for (let i = 0; i < todo.length; i += chunk) {
    await Promise.all(todo.slice(i, i + chunk).map((b) => categoriesFor(b).catch(() => undefined)));
    opts.onProgress?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** Categories some roster mon can cover, or null while any roster mon's learnset is unread. */
function knownRosterRoles(rosterIds: readonly SpeciesId[]): Set<PrepMoveCategory> | null {
  const have = new Set<PrepMoveCategory>();
  for (const id of rosterIds) {
    const cats = knownCategories.get(baseOf(id));
    if (!cats) return null;
    for (const c of cats) have.add(c);
  }
  return have;
}

/** Roles the candidate adds to the roster, or null while either side's learnsets are unread. */
function knownNewRoles(have: Set<PrepMoveCategory> | null, candidate: SpeciesId): PrepMoveCategory[] | null {
  const cats = knownCategories.get(baseOf(candidate));
  if (!have || !cats) return null;
  return ROLE_PRIORITY.filter((r) => cats.includes(r) && !have.has(r));
}

async function rolesFor(ids: SpeciesId[]): Promise<Record<PrepMoveCategory, SpeciesId[]>> {
  const roles = {} as Record<PrepMoveCategory, SpeciesId[]>;
  for (const c of MOVE_CATEGORY_NAMES) roles[c] = [];
  const cats = await Promise.all(ids.map((id) => categoriesFor(id)));
  ids.forEach((id, i) => { for (const c of cats[i] ?? []) roles[c].push(id); });
  return roles;
}

const ROLE_TEXT: Record<PrepMoveCategory, string> = {
  'Entry Hazards': 'No entry hazards yet',
  'Hazard Removal': 'No hazard removal yet',
  Momentum: 'No pivot or momentum move yet',
  Healing: 'No recovery yet',
  Priority: 'No priority moves yet',
  Status: 'No status moves yet',
  'Item Removal': 'No item removal yet',
  Disruption: 'No disruption (Taunt, Encore, phazing) yet',
  'Speed Control': 'No speed control yet',
  Screens: 'No screens yet',
};

const joinList = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export async function teamNeeds(rosterIds: SpeciesId[]): Promise<TeamNeeds> {
  const matchup = teamMatchupTable(rosterIds);
  const ctx = buildCtx(rosterIds);
  if (!rosterIds.length) for (const t of ALL_TYPES) matchup.weak[t] = 0;
  const weakTypes = ALL_TYPES.map((type) => ({ type, score: ctx.weak[type] ?? 0 }))
    .filter((w) => w.score < 0)
    .sort((a, b) => a.score - b.score);
  const uncoveredStab = ALL_TYPES.filter((t) => (ctx.stab[t] ?? 0) === 0);
  const roles = await rolesFor(rosterIds);
  const missingRoles = ROLE_PRIORITY.filter((c) => roles[c].length === 0);

  const summary: string[] = [];
  if (!rosterIds.length) {
    summary.push('Roster is empty');
  } else {
    if (weakTypes.length) {
      summary.push(`Weak to ${joinList(weakTypes.slice(0, 3).map((w) => `${w.type} (${w.score})`))}`);
    }
    if (ctx.speed.fast === 0) summary.push('No mon at or above base 100 Speed');
    else if (ctx.speed.fast === 1) summary.push('Only one mon at or above base 100 Speed');
    for (const r of missingRoles.slice(0, 3)) summary.push(ROLE_TEXT[r]);
    if (rosterIds.length >= 4 && uncoveredStab.length >= 8) {
      summary.push(`No STAB for ${uncoveredStab.length} of 18 attacking types`);
    }
  }
  return {
    matchup, weakTypes, uncoveredStab, speed: { ...ctx.speed }, roles, missingRoles,
    summary: summary.slice(0, 6),
  };
}

function sumRoleScore(newRoles: PrepMoveCategory[]): number {
  let s = 0;
  for (const r of newRoles) s += ROLE_PRIORITY.indexOf(r) < 4 ? FIT_WEIGHTS.roleTop : FIT_WEIGHTS.roleRest;
  return Math.min(s, FIT_WEIGHTS.roleCap);
}

function composeNote(
  fixed: WeakDelta[], newStab: TypeName[], roles: PrepMoveCategory[], slot: Slot, speedNeed: boolean,
): string {
  const parts: string[] = [];
  if (fixed.length) parts.push(`Patches ${joinList(fixed.slice(0, 2).map((f) => f.type))}`);
  const adds: string[] = [...roles.slice(0, 2)];
  if (!adds.length && newStab.length) adds.push(`${newStab[0]} STAB`);
  if (speedNeed && slot === 'fast') adds.push('speed');
  if (adds.length) parts.push(`${parts.length ? 'adds' : 'Adds'} ${joinList(adds)}`);
  return parts.length ? parts.join(', ') : 'Overlaps what the roster already does';
}

type SyncRaw = PickImpactSync & { raw: number; speedNeed: boolean };

function impactFromCtx(ctx: RosterCtx, candidate: SpeciesId, mon?: DraftMon): SyncRaw {
  const c = monInfo(candidate, mon);
  const fixed: WeakDelta[] = [];
  const worse: WeakDelta[] = [];
  let fixPts = 0;
  let worsePts = 0;
  if (ctx.infos.length) {
    for (const t of ALL_TYPES) {
      const mult = c.row[t] ?? 1;
      const before = ctx.weak[t] ?? 0;
      const after = weakFrom(ctx.sums, ctx.resisters, t, weakScore(mult), mult < 1 ? 1 : 0);
      if (after > before && before < 0) {
        fixed.push({ type: t, before, after });
        fixPts += Math.min(after - before, 3) * FIT_WEIGHTS.fixPerPoint;
      } else if (after < before && after < 0) {
        worse.push({ type: t, before, after });
        worsePts += Math.min(before - after, 3) * FIT_WEIGHTS.worsenPerPoint;
      }
    }
    fixed.sort((a, b) => (b.after - b.before) - (a.after - a.before));
    worse.sort((a, b) => (a.after - a.before) - (b.after - b.before));
  }
  const newStab = [...new Set(c.types)].filter((t) => (ctx.stab[t] ?? 0) === 0);
  const slot = slotOf(c.spe);
  let speedPts = 0;
  if (slot === 'fast') {
    speedPts = ctx.speed.fast < 2 ? FIT_WEIGHTS.fastNeedLow : ctx.speed.fast === 2 ? FIT_WEIGHTS.fastNeedMid : 0;
  } else if (slot === 'mid') {
    speedPts = ctx.speed.mid < 2 ? FIT_WEIGHTS.midNeed : 0;
  }
  let stackPts = 0;
  for (const t of new Set(c.types)) {
    const n = ctx.stab[t] ?? 0;
    stackPts += n >= 2 ? FIT_WEIGHTS.stackHeavy : n === 1 ? FIT_WEIGHTS.stackLight : 0;
  }
  const raw = FIT_WEIGHTS.base
    + Math.min(fixPts, FIT_WEIGHTS.fixCap) - Math.min(worsePts, FIT_WEIGHTS.worsenCap)
    + Math.min(newStab.length * FIT_WEIGHTS.stabEach, FIT_WEIGHTS.stabCap)
    + speedPts - Math.min(stackPts, FIT_WEIGHTS.stackCap);
  const speedNeed = slot === 'fast' && speedPts > 0;
  return {
    candidate, weakFixed: fixed, weakWorsened: worse, newStab, speedSlot: slot,
    outspeeds: ctx.infos.filter((m) => m.spe < c.spe).length,
    fitScore: Math.max(0, Math.min(100, Math.round(raw))),
    raw, speedNeed,
    note: composeNote(fixed, newStab, [], slot, speedNeed),
  };
}

function strip(s: SyncRaw): PickImpactSync {
  const { raw: _raw, speedNeed: _need, ...rest } = s;
  return rest;
}

/** The sync result with the move roles folded in: the same numbers `pickImpact` returns. */
function withRoles(sync: SyncRaw, newRoles: PrepMoveCategory[]): PickImpact {
  return {
    ...strip(sync),
    newRoles,
    fitScore: Math.max(0, Math.min(100, Math.round(sync.raw + sumRoleScore(newRoles)))),
    note: composeNote(sync.weakFixed, sync.newStab, newRoles, sync.speedSlot, sync.speedNeed),
  };
}

const findMon = (pool: readonly DraftMon[] | undefined, id: SpeciesId): DraftMon | undefined =>
  pool?.find((m) => m.id === id);

/**
 * Synchronous pickImpact: types, STAB, speed and the weak-score delta, plus `newRoles` (and the full score and
 * note) once the learnset categories of the roster and the candidate are cached (`warmRoleCategories`). Until then
 * `newRoles` is absent and the score leaves roles out. `{ roles: false }` forces the quick score.
 */
export function pickImpactSync(
  rosterIds: SpeciesId[], candidate: SpeciesId, pool?: readonly DraftMon[], opts: { roles?: boolean } = {},
): PickImpactSync {
  const sync = impactFromCtx(buildCtx(rosterIds), candidate, findMon(pool, candidate));
  const newRoles = opts.roles === false ? null : knownNewRoles(knownRosterRoles(rosterIds), candidate);
  return newRoles ? withRoles(sync, newRoles) : strip(sync);
}

export async function pickImpact(
  rosterIds: SpeciesId[], candidate: SpeciesId, pool?: readonly DraftMon[],
): Promise<PickImpact> {
  const sync = impactFromCtx(buildCtx(rosterIds), candidate, findMon(pool, candidate));
  const [roster, cand] = await Promise.all([rolesFor(rosterIds), categoriesFor(candidate)]);
  const newRoles = ROLE_PRIORITY.filter((r) => cand.includes(r) && roster[r].length === 0);
  return withRoles(sync, newRoles);
}

/**
 * Ranks candidates by the synchronous fit score (desc, ties by species id). Skips roster mons and picks costing
 * more than `budgetLeft`. Roles are left out by default so the AI's picks never depend on what the cache holds;
 * `{ roles: true }` (the draft screen) adds them per candidate once cached, and `rolesKnown` says which did.
 */
export function rankPool(
  rosterIds: SpeciesId[], candidates: SpeciesId[], budgetLeft?: number, opts: { roles?: boolean } = {},
): { species: SpeciesId; fitScore: number; rolesKnown: boolean }[] {
  const ctx = buildCtx(rosterIds);
  const owned = new Set(rosterIds);
  const have = opts.roles ? knownRosterRoles(rosterIds) : null;
  const out: { species: SpeciesId; fitScore: number; rolesKnown: boolean }[] = [];
  for (const id of candidates) {
    if (owned.has(id)) continue;
    const mon = getDraftMon(id);
    if (budgetLeft !== undefined && mon && mon.points > budgetLeft) continue;
    const sync = impactFromCtx(ctx, id, mon);
    const newRoles = opts.roles ? knownNewRoles(have, id) : null;
    out.push({ species: id, fitScore: newRoles ? withRoles(sync, newRoles).fitScore : sync.fitScore, rolesKnown: !!newRoles });
  }
  return out.sort((a, b) => b.fitScore - a.fitScore || (a.species < b.species ? -1 : a.species > b.species ? 1 : 0));
}
