// Snake draft. All functions are pure: DraftState is never mutated, applyPick returns a new state.
import { Dex } from '@pkmn/dex';
import type { CoachId, DraftMon, DraftState, LeagueConfig, SpeciesId, TypeName } from '../types';
import type { Rng } from '../league/rng';
import { buildDraftPool } from './pool';
import { FIT_WEIGHTS, rankPool } from '../prep/draftHelper';

type DraftConfig = Pick<LeagueConfig, 'budget' | 'rosterMin' | 'rosterMax'>;
type Pool = readonly DraftMon[];

const ATTACK_TYPES: readonly TypeName[] = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

/** Thresholds the AI drafter uses for its role needs. */
export const AI_DRAFT_DIALS = {
  fastSpeed: 100,       // base Speed counted as a fast mon
  bulkyTotal: 290,      // base HP + Def + SpD counted as a bulky mon
  wantFast: 3,
  wantBulky: 3,
  noise: 2,             // max random score added per candidate
  fitWeight: 0.25,      // with the fit option (stake 3+): score += (fitScore - FIT_WEIGHTS.base) * fitWeight
} as const;

/**
 * How big an AI coach drafts its roster when the league allows a range (rosterMin..rosterMax). Read by
 * aiRosterTarget (the seeded aim, rolled once per coach) and aiWantsToStop (checked on the coach's turn).
 */
export const AI_STOP_DIALS = {
  /**
   * Relative odds of aiming for the minimum, a size strictly between, and the maximum. The middle weight is
   * shared evenly by every in-between size; with rosterMax = rosterMin + 1 only the two ends count.
   */
  aimWeights: { min: 3, between: 4, max: 3 },
  /** At or above the minimum, stop before the aim when the points left per slot still to fill fall under this. */
  minPointsPerOpenSlot: 3,
} as const;

/**
 * Default pool for the lookup-style helpers below: the FULL pool (Megas included). Legality always comes from
 * draft.available, so a superset is correct for any league; createDraft is the one place that picks contents.
 */
const lookupPool = (): Pool => buildDraftPool({ megas: true });

const poolMaps = new WeakMap<Pool, Map<SpeciesId, DraftMon>>();
function indexPool(pool: Pool): Map<SpeciesId, DraftMon> {
  let m = poolMaps.get(pool);
  if (!m) {
    m = new Map(pool.map((d) => [d.id, d]));
    poolMaps.set(pool, m);
  }
  return m;
}

/** `pool` decides what is draftable: pass buildDraftPool({ megas: config.megas }) for a league. */
export function createDraft(coachIds: readonly CoachId[], rng: Rng, pool: Pool = buildDraftPool()): DraftState {
  if (coachIds.length < 2) throw new Error('a draft needs at least 2 coaches');
  if (new Set(coachIds).size !== coachIds.length) throw new Error('duplicate coach ids');
  return {
    order: rng.shuffle(coachIds),
    round: 1,
    pickIndex: 0,
    picks: [],
    available: pool.map((m) => m.id),
    complete: false,
    turn: 0,
    done: [],
  };
}

const ownedCount = (draft: DraftState, coach: CoachId): number => draft.picks.reduce((s, p) => (p.coach === coach ? s + 1 : s), 0);

/** The coach in snake slot `turn` (round 1 forward, round 2 reversed, ...). */
function coachAtTurn(draft: DraftState, turn: number): CoachId {
  const n = draft.order.length;
  const pos = turn % n;
  return (Math.floor(turn / n) % 2 === 0 ? draft.order[pos] : draft.order[n - 1 - pos]) as CoachId;
}

/** True when `coach` takes no more picks: the draft is over, or they stopped, ran out of affordable mons, or are full. */
export function isDoneDrafting(draft: DraftState, coach: CoachId, config: DraftConfig): boolean {
  return draft.complete || draft.done.includes(coach) || ownedCount(draft, coach) >= config.rosterMax;
}

/** The most picks the draft can still make: every coach still drafting fills up to rosterMax. */
export function maxPicksLeft(draft: DraftState, config: DraftConfig): number {
  if (draft.complete) return 0;
  return draft.order.reduce((s, c) => (draft.done.includes(c) ? s : s + Math.max(0, config.rosterMax - ownedCount(draft, c))), 0);
}

/** Whose pick it is, or undefined once the draft is complete. */
export function currentPicker(draft: DraftState, config: DraftConfig): CoachId | undefined {
  if (draft.complete || draft.turn >= draft.order.length * config.rosterMax) return undefined;
  return coachAtTurn(draft, draft.turn);
}

export function coachPicks(draft: DraftState, coach: CoachId): SpeciesId[] {
  return draft.picks.filter((p) => p.coach === coach).map((p) => p.species);
}

export function coachPointsSpent(draft: DraftState, coach: CoachId): number {
  return draft.picks.reduce((s, p) => (p.coach === coach ? s + p.points : s), 0);
}

/** A coach's whole draft budget: draft.budgets[coach] when set (stake AI bonus), else config.budget. */
export function budgetOf(draft: DraftState, coach: CoachId, config: Pick<LeagueConfig, 'budget'>): number {
  return draft.budgets?.[coach] ?? config.budget;
}

/**
 * Points a coach must keep back per roster slot still to fill after this pick. It is the price of
 * the (remaining-draft-picks)-th cheapest available mon: even if every later pick took the cheapest
 * mons, one at this price stays available, so a legal pick always exists (the draft can never strand
 * a coach). "Remaining picks" counts every open slot up to rosterMax (maxPicksLeft), an upper bound, so the
 * guarantee holds however many coaches stop early. At the start of a 16x11 draft this is 5 (ZU).
 */
export function reservePerSlot(draft: DraftState, config: DraftConfig, pool: Pool): number {
  const byId = indexPool(pool);
  const prices = draft.available.map((id) => byId.get(id)?.points ?? Infinity).sort((a, b) => a - b);
  if (prices.length === 0) return 0;
  const remaining = maxPicksLeft(draft, config);
  return prices[Math.min(prices.length - 1, Math.max(0, remaining))] ?? 0;
}

/**
 * The most a coach could spend on their next pick right now. Points are held back only for the slots still
 * REQUIRED (up to rosterMin): above the minimum a coach may spend everything on one more mon and stop there.
 */
export function maxAffordable(draft: DraftState, coach: CoachId, config: DraftConfig, pool: Pool): number {
  const slotsAfter = Math.max(0, config.rosterMin - ownedCount(draft, coach) - 1);
  return budgetOf(draft, coach, config) - coachPointsSpent(draft, coach) - slotsAfter * reservePerSlot(draft, config, pool);
}

function legalMons(draft: DraftState, coach: CoachId, config: DraftConfig, pool: Pool): DraftMon[] {
  if (isDoneDrafting(draft, coach, config)) return [];
  const cap = maxAffordable(draft, coach, config, pool);
  const byId = indexPool(pool);
  const ownedNums = ownedDexNumbers(draft.picks.filter((p) => p.coach === coach).map((p) => p.species), pool);
  const out: DraftMon[] = [];
  for (const id of draft.available) {
    const m = byId.get(id);
    if (m && m.points <= cap && !ownedNums.has(m.num)) out.push(m);
  }
  return out;
}

/** Dex numbers of the given species (forms share a number). */
export function ownedDexNumbers(owned: SpeciesId[], pool: Pool = lookupPool()): Set<number> {
  const byId = indexPool(pool);
  const nums = new Set<number>();
  for (const id of owned) { const m = byId.get(id); if (m) nums.add(m.num); }
  return nums;
}

/** True when `candidate` is another form of a species already in `owned` (Species Clause would block bringing both; a Mega shares its base's number). */
export function conflictsWithRoster(owned: SpeciesId[], candidate: SpeciesId, pool: Pool = lookupPool()): boolean {
  const m = indexPool(pool).get(candidate);
  return !!m && ownedDexNumbers(owned, pool).has(m.num);
}

/** Species the coach may take now: undrafted, affordable, and leaves enough budget for the remaining slots. */
export function legalPicks(draft: DraftState, coach: CoachId, config: DraftConfig, pool: Pool = lookupPool()): SpeciesId[] {
  return legalMons(draft, coach, config, pool).map((m) => m.id);
}

/**
 * Moves the clock past `draft.turn` to the next coach still drafting. A coach with no legal pick (out of
 * affordable mons; the reserve keeps this from happening below rosterMin) is marked done on the way. With
 * nobody left, or after rosterMax rounds, the draft is complete (round stays at the last round played).
 */
function advanceTurn(draft: DraftState, config: DraftConfig, pool: Pool): DraftState {
  const n = draft.order.length;
  const lastTurn = n * config.rosterMax;
  let cur = draft;
  for (let t = draft.turn + 1; t < lastTurn; t++) {
    const coach = coachAtTurn(cur, t);
    if (cur.done.includes(coach) || ownedCount(cur, coach) >= config.rosterMax) continue;
    const onClock: DraftState = { ...cur, turn: t, round: Math.floor(t / n) + 1 };
    if (legalMons(onClock, coach, config, pool).length > 0) return onClock;
    cur = { ...cur, done: [...cur.done, coach] };
  }
  return { ...cur, turn: lastTurn, complete: true };
}

/**
 * Returns a NEW DraftState where `coach` (on the clock, holding at least rosterMin mons) stops drafting; later
 * rounds skip them. Throws if it is not their turn or they hold fewer than rosterMin.
 */
export function stopDrafting(
  draft: DraftState, coach: CoachId, config: DraftConfig, pool: Pool = lookupPool(),
): DraftState {
  const picker = currentPicker(draft, config);
  if (picker !== coach) throw new Error(`not ${coach}'s turn (current: ${picker ?? 'none, draft complete'})`);
  const owned = ownedCount(draft, coach);
  if (owned < config.rosterMin) throw new Error(`${coach} needs at least ${config.rosterMin} mons before stopping (has ${owned})`);
  return advanceTurn({ ...draft, done: [...draft.done, coach] }, config, pool);
}

/** Returns a NEW DraftState with the pick applied. Throws if it is not `coach`'s turn or the pick is illegal. */
export function applyPick(
  draft: DraftState, coach: CoachId, species: SpeciesId, config: DraftConfig, pool: Pool = lookupPool(),
): DraftState {
  const picker = currentPicker(draft, config);
  if (picker !== coach) throw new Error(`not ${coach}'s pick (current: ${picker ?? 'none, draft complete'})`);
  const mon = indexPool(pool).get(species);
  if (!mon) throw new Error(`${species} is not in the draft pool`);
  if (!draft.available.includes(species)) throw new Error(`${species} is already drafted`);
  if (mon.points > maxAffordable(draft, coach, config, pool)) {
    throw new Error(`${species} (${mon.points}) does not fit ${coach}'s remaining budget`);
  }
  if (conflictsWithRoster(draft.picks.filter((p) => p.coach === coach).map((p) => p.species), species, pool)) {
    throw new Error(`${species} is another form of a species ${coach} already owns`);
  }
  const picked: DraftState = {
    ...draft,
    pickIndex: draft.pickIndex + 1,
    picks: [...draft.picks, {
      coach, species, points: mon.points, overall: draft.pickIndex + 1, round: draft.round,
    }],
    available: draft.available.filter((id) => id !== species),
  };
  return advanceTurn(picked, config, pool);
}

/**
 * The roster size an AI coach aims for, rolled from AI_STOP_DIALS.aimWeights. Pass an rng seeded per coach (the
 * same every call) so the aim holds for the whole draft. rosterMin === rosterMax returns it without drawing.
 */
export function aiRosterTarget(config: DraftConfig, rng: Rng): number {
  const { rosterMin: lo, rosterMax: hi } = config;
  if (hi <= lo) return hi;
  const w = AI_STOP_DIALS.aimWeights;
  const inner = hi - lo - 1;
  const weights = Array.from({ length: hi - lo + 1 }, (_, i) => (i === 0 ? w.min : i === hi - lo ? w.max : w.between / inner));
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return lo + i;
  }
  return hi;
}

/**
 * Whether AI `coach`, on the clock, stops drafting now instead of picking: it reached its aim (aiRosterTarget),
 * or it holds at least rosterMin and the points left per slot up to the aim fall under
 * AI_STOP_DIALS.minPointsPerOpenSlot. Never below rosterMin.
 */
export function aiWantsToStop(draft: DraftState, coach: CoachId, config: DraftConfig, target: number): boolean {
  const owned = ownedCount(draft, coach);
  if (owned < config.rosterMin || owned >= config.rosterMax) return false;
  if (owned >= target) return true;
  return (budgetOf(draft, coach, config) - coachPointsSpent(draft, coach)) / (target - owned) < AI_STOP_DIALS.minPointsPerOpenSlot;
}

// ---- AI drafter ----

const weaknessCache = new Map<SpeciesId, { weak: TypeName[]; resist: TypeName[] }>();
function matchupOf(mon: DraftMon): { weak: TypeName[]; resist: TypeName[] } {
  let r = weaknessCache.get(mon.id);
  if (!r) {
    const dex = Dex.forGen(9);
    const weak: TypeName[] = [];
    const resist: TypeName[] = [];
    for (const t of ATTACK_TYPES) {
      if (!dex.getImmunity(t, mon.types)) { resist.push(t); continue; }
      const eff = dex.getEffectiveness(t, mon.types);
      if (eff > 0) weak.push(t);
      else if (eff < 0) resist.push(t);
    }
    r = { weak, resist };
    weaknessCache.set(mon.id, r);
  }
  return r;
}

const isFast = (m: DraftMon): boolean => m.baseStats.spe >= AI_DRAFT_DIALS.fastSpeed;
const isBulky = (m: DraftMon): boolean => m.baseStats.hp + m.baseStats.def + m.baseStats.spd >= AI_DRAFT_DIALS.bulkyTotal;
const isPhysical = (m: DraftMon): boolean => m.baseStats.atk > m.baseStats.spa + 10;
const isSpecial = (m: DraftMon): boolean => m.baseStats.spa > m.baseStats.atk + 10;

/**
 * Heuristic AI pick. Score = tier strength (points) minus distance from a per-round target price
 * (early rounds aim high, late rounds fill cheap; overshooting costs more than undershooting),
 * plus role needs (a few fast mons, a few bulky ones, physical/special balance), a type-diversity
 * bonus, a penalty for stacking a shared weakness, a bonus for patching one, and seeded noise.
 * Prices are planned for a roster of `aim` mons (aiRosterTarget; default rosterMax). With `opts.fit` (stake 3+)
 * each candidate also gets the draft helper's fit score (rankPool) above its base, times AI_DRAFT_DIALS.fitWeight.
 */
export function aiChoosePick(
  draft: DraftState, coach: CoachId, config: DraftConfig, pool: Pool, rng: Rng, aim: number = config.rosterMax,
  opts: { fit?: boolean } = {},
): SpeciesId {
  const legal = legalMons(draft, coach, config, pool);
  if (legal.length === 0) throw new Error(`${coach} has no legal pick`);
  const byId = indexPool(pool);
  const roster = coachPicks(draft, coach).map((id) => byId.get(id)).filter((m): m is DraftMon => !!m);
  const plan = Math.max(roster.length + 1, Math.min(config.rosterMax, aim));
  const slotsLeft = plan - roster.length; // including this pick
  const budgetLeft = budgetOf(draft, coach, config) - coachPointsSpent(draft, coach);
  const cap = maxAffordable(draft, coach, config, pool);
  const earlyBoost = 1 + 0.5 * (slotsLeft - 1) / Math.max(1, plan - 1);
  const target = Math.min(cap, (budgetLeft / slotsLeft) * earlyBoost);

  const fast = roster.filter(isFast).length;
  const bulky = roster.filter(isBulky).length;
  const phys = roster.filter(isPhysical).length;
  const spec = roster.filter(isSpecial).length;
  const typeCount = new Map<TypeName, number>();
  const weakCount = new Map<TypeName, number>();
  for (const m of roster) {
    for (const t of m.types) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
    for (const t of matchupOf(m).weak) weakCount.set(t, (weakCount.get(t) ?? 0) + 1);
  }

  const fit = new Map<SpeciesId, number>();
  if (opts.fit) {
    for (const r of rankPool(roster.map((m) => m.id), legal.map((m) => m.id), budgetLeft)) fit.set(r.species, r.fitScore);
  }

  let best: DraftMon | undefined;
  let bestScore = -Infinity;
  for (const m of legal) {
    let s = m.points + (m.bst - 500) / 100;
    const f = fit.get(m.id);
    if (f !== undefined) s += (f - FIT_WEIGHTS.base) * AI_DRAFT_DIALS.fitWeight;
    const diff = m.points - target;
    s -= diff > 0 ? diff * 1.3 : -diff * 0.5;
    if (isFast(m)) s += fast < AI_DRAFT_DIALS.wantFast ? 2.5 : fast < AI_DRAFT_DIALS.wantFast + 1 ? 1 : 0;
    if (isBulky(m)) s += bulky < AI_DRAFT_DIALS.wantBulky ? 2 : 0;
    if (isPhysical(m)) s += phys < spec ? 0.8 : phys > spec + 2 ? -1 : 0;
    if (isSpecial(m)) s += spec < phys ? 0.8 : spec > phys + 2 ? -1 : 0;
    for (const t of m.types) {
      const c = typeCount.get(t) ?? 0;
      s += c === 0 ? 1 : -1.2 * c;
    }
    const mu = matchupOf(m);
    for (const t of mu.weak) {
      const c = weakCount.get(t) ?? 0;
      s -= 0.6 * c + (c >= 2 ? 1 : 0);
    }
    for (const t of mu.resist) if ((weakCount.get(t) ?? 0) >= 2) s += 0.7;
    s += rng.next() * AI_DRAFT_DIALS.noise;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return (best as DraftMon).id;
}
