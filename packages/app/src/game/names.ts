import type { CoachId, Match, RosterEntry, RunState, SpeciesId } from '@pdc/engine';
import { getDraftMon } from '@pdc/engine';
import type { MonRole } from '../components/ui';
import { dex9 } from './sets';

/**
 * Player-facing name: a Showdown Mega name moves "Mega" to the front and keeps the X/Y suffix
 * ("Charizard-Mega-X" -> "Mega Charizard X", "Venusaur-Mega" -> "Mega Venusaur"). Others are unchanged.
 */
export function displayName(name: string): string {
  const m = /^(.+)-Mega(?:-([A-Z]))?$/.exec(name);
  if (!m) return name;
  return `Mega ${m[1]}${m[2] ? ` ${m[2]}` : ''}`;
}

/** Rewrites Showdown Mega names inside free text ("Mewtwo-Mega-Y outspeeds…" -> "Mega Mewtwo Y outspeeds…"). */
export function displayText(text: string): string {
  return text.replace(/\b([A-Z][\w'.:]*(?:-[A-Z][\w'.]*)*?)-Mega(?:-([XY]))?\b/g, (_, base: string, form?: string) => `Mega ${base}${form ? ` ${form}` : ''}`);
}

/** Display name for a species id (Megas as "Mega X"). Sprites keep the Showdown name (getDraftMon(id).name). */
export function speciesName(id: SpeciesId): string {
  return displayName(getDraftMon(id)?.name ?? dex9.species.get(id).name ?? id);
}

/** The Showdown name (for sprites / icons). */
export function spriteName(id: SpeciesId): string {
  return getDraftMon(id)?.name ?? dex9.species.get(id).name ?? id;
}

export const isMega = (id: SpeciesId): boolean => getDraftMon(id)?.isMega === true;

/** Badges for a roster entry. Old saves may lack isZCaptain. */
export function rolesOf(entry: Pick<RosterEntry, 'species' | 'isTeraCaptain'> & { isZCaptain?: boolean }): MonRole[] {
  const roles: MonRole[] = [];
  if (isMega(entry.species)) roles.push('mega');
  if (entry.isTeraCaptain) roles.push('tera');
  if (entry.isZCaptain) roles.push('z');
  return roles;
}

export function abbrevOf(run: RunState, id: CoachId): string {
  return run.coaches.find((c) => c.id === id)?.abbrev ?? id;
}

export function coachName(run: RunState, id: CoachId): string {
  return run.coaches.find((c) => c.id === id)?.name ?? id;
}

/** "4-0" from the winner's side. */
/** Score as "a-b" (Pokemon left standing). With `from`, that coach's side comes first; otherwise the winner's. */
export function scoreLine(m: Match, from?: CoachId): string {
  const r = m.result;
  if (!r) return '';
  const first = from ?? r.winner;
  const second = first === r.winner ? r.loser : r.winner;
  return `${r.remaining[first] ?? 0}-${r.remaining[second] ?? 0}`;
}

export function leagueCode(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');
}

export function seedFromCode(code: string): number | null {
  const clean = code.trim().toLowerCase();
  if (!/^[0-9a-z]{1,7}$/.test(clean)) return null;
  const n = parseInt(clean, 36);
  return Number.isFinite(n) ? n >>> 0 : null;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
