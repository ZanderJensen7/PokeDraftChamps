// Badges: what players call the stakes ladder (engine `STAKES`, `config.stake`). Badge N is stake N; winning the
// title at Badge N earns it and opens Badge N+1. Presentation only: names, colors and emblem shapes, one per stake.
// Names are our own (never the games' official badge names).

import type { AiSkill } from '@pdc/engine';

export interface BadgeLook {
  name: string;
  /** Emblem fill: a CSS color. */
  color: string;
  /** Emblem outline in a 100x100 box. */
  shape: string;
}

const SHAPES = {
  hex: 'M50 4L90 27V73L50 96L10 73V27Z',
  shield: 'M50 4L92 16V50C92 75 72 90 50 97C28 90 8 75 8 50V16Z',
  leaf: 'M50 4C70 30 88 48 88 64A38 38 0 0 1 12 64C12 48 30 30 50 4Z',
  diamond: 'M50 3L97 50L50 97L3 50Z',
  octagon: 'M30 5H70L95 30V70L70 95H30L5 70V30Z',
  star5: 'M50 6L61.8 35.8L93.7 37.8L69 58.2L77 89.2L50 72L23 89.2L31 58.2L6.3 37.8L38.2 35.8Z',
  cross: 'M36 4H64V36H96V64H64V96H36V64H4V36H36Z',
  triangle: 'M50 6L95 88H5Z',
  spark: 'M50 3L62 38L97 50L62 62L50 97L38 62L3 50L38 38Z',
  star8: 'M50 3L61.5 22.3L83.2 16.8L77.7 38.5L97 50L77.7 61.5L83.2 83.2L61.5 77.7L50 97L38.5 77.7L16.8 83.2L22.3 61.5L3 50L22.3 38.5L16.8 16.8L38.5 22.3Z',
} as const;

/** Index 0 = Badge 1 (stake 1). Same length as STAKES (badges.test.ts). */
export const BADGES: readonly BadgeLook[] = [
  { name: 'Rookie', color: 'var(--color-type-steel)', shape: SHAPES.hex },
  { name: 'Grit', color: 'var(--color-type-fighting)', shape: SHAPES.shield },
  { name: 'Rival', color: 'var(--color-type-grass)', shape: SHAPES.leaf },
  { name: 'Tycoon', color: 'var(--color-poke-yellow)', shape: SHAPES.star5 },
  { name: 'Mist', color: 'var(--color-type-ice)', shape: SHAPES.cross },
  { name: 'Mind', color: 'var(--color-type-psychic)', shape: SHAPES.diamond },
  { name: 'Underdog', color: 'var(--color-type-fire)', shape: SHAPES.spark },
  { name: 'Summit', color: 'var(--color-type-ground)', shape: SHAPES.triangle },
  { name: 'Elite', color: 'var(--color-type-ghost)', shape: SHAPES.octagon },
  { name: 'Crown', color: 'var(--color-type-dragon)', shape: SHAPES.star8 },
];

export const badgeOf = (stake: number): BadgeLook => BADGES[Math.max(1, Math.min(BADGES.length, stake)) - 1]!;

/** What players call each rival AI level (stake rule aiSkill). */
export const AI_SKILL_NAMES: Record<AiSkill, string> = { rookie: 'Rookie', trainer: 'Trainer', ace: 'Ace' };

/** The ladder's last two steps, named like the games' challenge after the eight gym badges. */
const FINAL_LABELS: Record<number, string> = { 9: 'Elite Four', 10: 'Champion' };

/** "Badge 4", "Elite Four", "Champion" (the short form every screen uses). */
export const badgeLabel = (stake: number): string => FINAL_LABELS[stake] ?? `Badge ${stake}`;

/** "Mind Badge". */
export const badgeName = (stake: number): string => `${badgeOf(stake).name} Badge`;
