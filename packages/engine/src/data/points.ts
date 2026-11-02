// Draft pricing + bans. Data tables only; the pool builder applies them.

/** Smogon singles tier -> draft points. Unknown tiers cost UNKNOWN_TIER_POINTS. */
export const POINTS_BY_TIER: Record<string, number> = {
  Uber: 20, OU: 18, UUBL: 16, UU: 15, RUBL: 14, RU: 12, NUBL: 11, NU: 10,
  PUBL: 9, PU: 8, ZUBL: 7, ZU: 5, NFE: 3, LC: 1,
};
export const UNKNOWN_TIER_POINTS = 5;
export const MAX_POINTS = 20;

/** Explicit bans on top of the tag/tier rules (things that break a draft). */
export const BANNED_SPECIES: readonly string[] = [
  'koraidon', 'miraidon', 'arceus',
  'zaciancrowned', 'zamazentacrowned', 'calyrexice', 'calyrexshadow', 'eternatus',
  'mewtwo', 'kyogre', 'groudon', 'rayquaza', 'dialga', 'dialgaorigin', 'palkia', 'palkiaorigin',
  'giratina', 'giratinaorigin', 'reshiram', 'zekrom', 'kyuremwhite', 'kyuremblack', 'xerneas', 'yveltal',
  'zygardecomplete', 'necrozmaduskmane', 'necrozmadawnwings', 'lunala', 'solgaleo', 'terapagos',
  'terapagosterastal', 'terapagosstellar',
  'ogerpontealtera', 'ogerponwellspringtera', 'ogerponhearthflametera', 'ogerponcornerstonetera',
];
/** Megas banned on balance-lab evidence (2026-11-02: score 80+ at the 20-pt cap, every other 20 sits near 55). */
export const BANNED_MEGAS: readonly string[] = ['mewtwomegax', 'mewtwomegay'];
/** Id prefixes banned with every form (Arceus-Fire, ...). */
export const BANNED_PREFIXES: readonly string[] = ['arceus'];
export const BANNED_TAGS: readonly string[] = ['Restricted Legendary'];
export const BANNED_TIERS: readonly string[] = ['AG'];

const bannedIds = new Set(BANNED_SPECIES);
const bannedMegaIds = new Set(BANNED_MEGAS);

export function isBannedSpecies(s: { id: string; tier: string; tags?: readonly string[] }): boolean {
  if (bannedIds.has(s.id)) return true;
  if (BANNED_PREFIXES.some((p) => s.id.startsWith(p))) return true;
  if (BANNED_TIERS.includes(s.tier)) return true;
  return (s.tags ?? []).some((t) => BANNED_TAGS.includes(t));
}

/**
 * Megas: banned by an explicit id (BANNED_SPECIES or BANNED_MEGAS) or a banned National Dex tier
 * (Rayquaza-Mega and Gengar-Mega are AG). The tag rule does not apply: a base species being banned does not
 * ban its Mega on its own; Mega Mewtwo X/Y are banned by BANNED_MEGAS (lab evidence), not by base Mewtwo.
 */
export function isBannedMega(s: { id: string; tier: string }): boolean {
  return bannedIds.has(s.id) || bannedMegaIds.has(s.id) || BANNED_TIERS.includes(s.tier);
}

export function tierPoints(tier: string): number {
  return POINTS_BY_TIER[tier] ?? UNKNOWN_TIER_POINTS;
}

/** '(OU)' -> 'OU' (Smogon parenthesises a tier a mon only sits in by usage). */
const unwrap = (t: string): string => t.replace(/^\((.*)\)$/, '$1');

/**
 * The tier a species is priced by: its singles tier, or its National Dex tier when the singles tier is not a
 * priced one ('Illegal' for Megas and other Past forms, 'Unreleased', ...). Parentheses are dropped.
 */
export function pricingTier(species: { tier: string; natDexTier?: string }): string {
  const t = unwrap(species.tier);
  if (POINTS_BY_TIER[t] !== undefined || !species.natDexTier) return t;
  return unwrap(species.natDexTier);
}

/** Tier price (see pricingTier), +1 for BST >= 600 inside OU/Uber, capped at MAX_POINTS. */
export function priceOf(species: { tier: string; natDexTier?: string; bst: number }): number {
  const tier = pricingTier(species);
  let p = tierPoints(tier);
  if ((tier === 'OU' || tier === 'Uber') && species.bst >= 600) p += 1;
  // The floor tiers are huge (ZU alone is ~200 species): spread them by raw stats so late rounds have a gradient.
  if (tier === 'ZU' || tier === 'PU') {
    if (species.bst >= 520) p += 2;
    else if (species.bst >= 470) p += 1;
  }
  return Math.min(MAX_POINTS, p);
}
