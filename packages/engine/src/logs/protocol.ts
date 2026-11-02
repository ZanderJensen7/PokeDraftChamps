// Small helpers for reading Showdown protocol lines. Pure, browser-safe.
import { Dex, toID } from '@pkmn/dex';
import type { SpeciesId } from '../types';
import { randomsSpeciesKeys } from '../data/randoms';

export type SideId = 'p1' | 'p2';

export { toID };

/** Split a protocol line into its parts: '|move|p1a: X|Tackle' → ['move', 'p1a: X', 'Tackle']. */
export function splitLine(line: string): string[] {
  if (!line.startsWith('|')) return [];
  return line.slice(1).split('|');
}

/** 'p2a: Great Tusk' / 'p2: Great Tusk' → { side: 'p2', name: 'Great Tusk' }. */
export function parseIdent(ident: string | undefined): { side: SideId; name: string } | null {
  if (!ident) return null;
  const m = /^(p[12])[a-z]?: ?(.*)$/.exec(ident);
  if (!m) return null;
  return { side: m[1] as SideId, name: m[2] ?? '' };
}

/** 'Great Tusk, L100, M, shiny' → 'Great Tusk'. */
export function speciesNameFromDetails(details: string): string {
  return (details.split(',')[0] ?? '').trim();
}

/** Level from a details string (default 100). */
export function levelFromDetails(details: string): number {
  const m = /, L(\d+)/.exec(details);
  return m ? Number(m[1]) : 100;
}

/**
 * Canonical roster id for a species name seen in the protocol. Keeps ids that are randoms keys
 * (e.g. 'zaciancrowned', 'ogerponwellspring'); maps other battle-only formes back to the
 * out-of-battle forme ('Palafin-Hero' → 'palafin', 'Ogerpon-Wellspring-Tera' → 'ogerponwellspring').
 * Team-preview wildcards ('Urshifu-*') return the base species id.
 */
export function canonicalSpeciesId(name: string): SpeciesId {
  if (name.endsWith('-*')) return toID(name.slice(0, -2));
  const id = toID(name);
  if (randomsSpeciesKeys().has(id)) return id;
  const species = Dex.species.get(name);
  if (!species.exists) return id;
  const bo = species.battleOnly;
  if (typeof bo === 'string') return toID(bo);
  if (Array.isArray(bo) && bo[0]) return toID(bo[0]);
  return id;
}

export function speciesIdFromDetails(details: string): SpeciesId {
  return canonicalSpeciesId(speciesNameFromDetails(details));
}

/** Parse an HP/status condition: '57/100 par' → { hp: 57, maxhp: 100, status: 'par', fainted: false }. */
export function parseCondition(cond: string | undefined): { hp: number; maxhp: number; status: string; fainted: boolean } {
  if (!cond) return { hp: 100, maxhp: 100, status: '', fainted: false };
  const [hpPart = '', status = ''] = cond.trim().split(' ');
  if (status === 'fnt' || hpPart === '0') return { hp: 0, maxhp: 100, status: '', fainted: true };
  const [h, m] = hpPart.split('/');
  const hp = Number(h);
  const maxhp = m !== undefined ? Number(m) : 100;
  return { hp: Number.isFinite(hp) ? hp : 100, maxhp: Number.isFinite(maxhp) && maxhp > 0 ? maxhp : 100, status, fainted: false };
}

/** Find a '[from] kind: Value' tag among the parts; returns Value. */
export function fromTag(parts: string[], kind: 'item' | 'ability' | 'move'): string | undefined {
  for (const p of parts) {
    const m = /^\[from\] ?(item|ability|move): ?(.*)$/.exec(p);
    if (m && m[1] === kind) return m[2];
  }
  return undefined;
}

export function hasFromMove(parts: string[]): boolean {
  return parts.some(p => /^\[from\] ?move:/.test(p));
}

/** '[of] p2a: X' tag → ident. */
export function ofTag(parts: string[]): string | undefined {
  for (const p of parts) {
    const m = /^\[of\] ?(.*)$/.exec(p);
    if (m) return m[1];
  }
  return undefined;
}
