import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { DraftMon, PickImpact, PickImpactSync, PrepMoveCategory, SpeciesId, TeamNeeds } from '@pdc/engine';
import { pickImpact, pickImpactSync, rankPool, teamNeeds, warmRoleCategories } from '@pdc/engine';

// teamNeeds / pickImpact read learnsets (async); results are kept per roster snapshot so a revisit is instant.
const needsCache = new Map<string, Promise<TeamNeeds>>();
const impactCache = new Map<string, Promise<PickImpact>>();

/** One key per roster snapshot: length first, then the ids in pick order. */
export const rosterKey = (ids: readonly SpeciesId[]): string => `${ids.length}:${ids.join(',')}`;

function cached<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** The team's needs for the current roster. Keeps the previous result on screen while the next one loads. */
export function useTeamNeeds(rosterIds: readonly SpeciesId[]): { needs: TeamNeeds | null; loading: boolean } {
  const key = rosterKey(rosterIds);
  const [state, setState] = useState<{ key: string; needs: TeamNeeds } | null>(null);
  useEffect(() => {
    if (rosterIds.length === 0) return;
    let live = true;
    cached(needsCache, key, () => teamNeeds([...rosterIds]))
      .then((needs) => { if (live) setState({ key, needs }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [key]);
  if (rosterIds.length === 0) return { needs: null, loading: false };
  return { needs: state?.needs ?? null, loading: state?.key !== key };
}

// Learnset categories for the whole pool are read once, in chunks, right after first paint; every chunk bumps
// `roleVersion` so the FIT badges recompute with the move roles that are known by then.
let roleVersion = 0;
const roleListeners = new Set<() => void>();
const warmed = new Set<string>();
const subscribeRoles = (fn: () => void) => { roleListeners.add(fn); return () => { roleListeners.delete(fn); }; };
const getRoleVersion = () => roleVersion;
const bumpRoles = () => { roleVersion++; roleListeners.forEach((fn) => fn()); };

function warmPool(ids: readonly SpeciesId[]): void {
  if (!ids.length) return;
  const sig = `${ids.length}:${ids[0] ?? ''}:${ids[ids.length - 1] ?? ''}`;
  if (warmed.has(sig)) return;
  warmed.add(sig);
  // Past first paint: the badges render with the quick score and fill in as chunks land.
  setTimeout(() => { void warmRoleCategories(ids, { onProgress: bumpRoles }); }, 0);
}

export interface FitScores {
  scores: Map<SpeciesId, number>;
  /** True while this mon's score still leaves move roles out (the badge shows "…"). */
  pending: (id: SpeciesId) => boolean;
}

/**
 * FIT score (0-100) for every pool mon against the current roster. Sync; the quick score at once, the full one
 * (with move roles, matching the hover note) as the learnset categories load.
 */
export function useFitScores(rosterIds: readonly SpeciesId[], pool: readonly DraftMon[]): FitScores {
  const key = rosterKey(rosterIds);
  const ids = useMemo(() => pool.map((m) => m.id), [pool]);
  const version = useSyncExternalStore(subscribeRoles, getRoleVersion);
  useEffect(() => { warmPool(ids); }, [ids]);
  return useMemo(() => {
    const ranked = rankPool([...rosterIds], ids, undefined, { roles: true });
    const known = new Map(ranked.map((r) => [r.species, r.rolesKnown]));
    return {
      scores: new Map(ranked.map((r) => [r.species, r.fitScore])),
      pending: (id) => known.get(id) === false,
    };
  }, [key, ids, version]);
}

/**
 * Impact of adding one candidate: the sync part (types, speed, weak delta) at once,
 * the full result (with move roles and the final note) once learnsets are read. Lazy: one card at a time.
 */
export function usePickImpact(
  rosterIds: readonly SpeciesId[], candidate: SpeciesId | null, pool: readonly DraftMon[],
): { sync: PickImpactSync | null; full: PickImpact | null } {
  const key = candidate ? `${rosterKey(rosterIds)}|${candidate}` : '';
  const sync = useMemo(
    () => (candidate ? pickImpactSync([...rosterIds], candidate, pool) : null),
    [key, pool],
  );
  const [state, setState] = useState<{ key: string; full: PickImpact } | null>(null);
  useEffect(() => {
    if (!candidate) return;
    let live = true;
    cached(impactCache, key, () => pickImpact([...rosterIds], candidate, pool))
      .then((full) => { if (live) setState({ key, full }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [key, pool]);
  return { sync, full: state?.key === key ? state.full : null };
}

/** Short names for move roles (chips, the needs one-liner). */
export const ROLE_SHORT: Record<PrepMoveCategory, string> = {
  'Entry Hazards': 'Hazards',
  'Hazard Removal': 'Hazard removal',
  Momentum: 'Momentum',
  Healing: 'Recovery',
  Priority: 'Priority',
  Status: 'Status',
  'Item Removal': 'Item removal',
  Disruption: 'Disruption',
  'Speed Control': 'Speed control',
  Screens: 'Screens',
};

const ROLE_NEED: Record<PrepMoveCategory, string> = {
  'Entry Hazards': 'hazards',
  'Hazard Removal': 'hazard removal',
  Momentum: 'a pivot',
  Healing: 'recovery',
  Priority: 'priority',
  Status: 'status',
  'Item Removal': 'item removal',
  Disruption: 'disruption',
  'Speed Control': 'speed control',
  Screens: 'screens',
};

/** "Needs: hazards, a fast mon, Ground answer" for the on-the-clock banner; null when nothing stands out. */
export function needsOneLiner(needs: TeamNeeds | null): string | null {
  if (!needs) return null;
  const parts: string[] = needs.missingRoles.slice(0, 2).map((r) => ROLE_NEED[r]);
  if (needs.speed.fast === 0) parts.push('a fast mon');
  else if (needs.speed.fast === 1) parts.push('another fast mon');
  for (const w of needs.weakTypes.slice(0, 2)) parts.push(`${w.type} answer`);
  return parts.length ? `Needs: ${parts.slice(0, 4).join(', ')}` : null;
}
