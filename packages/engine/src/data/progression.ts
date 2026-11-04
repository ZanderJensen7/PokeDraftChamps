// Pool progression knobs (docs/ROGUELIKE.md "Pool progression"): one table, read by poolProgress.ts.

export const POOL_PROGRESSION = {
  /** Share of every pricing tier a new profile starts with (rounded up, so a one-species tier starts open). */
  startShare: 0.5,
  /**
   * Pricing tiers a new profile starts with in full. The floor is the draft's filler: a 16-team league of 11
   * needs ~177 mons at the floor price for the draft's reserve rule to stay at 5 points a slot, and the full
   * pool holds only ~188 (DECISIONS 2026-11-04 "Pool progression: the floor starts open").
   */
  startFullTiers: ['ZU', 'NFE', 'LC'] as readonly string[],
  /** First-win points that open one scouting pack. */
  pointsPerPack: 3,
  /** Locked species a pack reveals; the player keeps one. */
  packSize: 3,
  /** Every finished run with at least one played match opens this many packs, won or lost. */
  floorPacksPerRun: 1,
  /** A species' weight in a pack is (locked share of its tier) ^ this: higher pushes harder toward thin tiers. */
  tierWeightPower: 2,
  /** Pity: a star is on offer at least once every this many packs (while any star is locked). */
  pityEvery: 3,
  /** A star, for the pity rule: draft price at or above this. */
  starPoints: 15,
  /** Match wins with a species that unlock its shiny sprite. */
  shinyWins: 10,
} as const;
