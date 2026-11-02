import { Dex } from '@pkmn/dex';
import { Generations, toID } from '@pkmn/data';
import type { SpeciesId } from '../types';

export type MoveCategoryName =
  | 'Entry Hazards' | 'Hazard Removal' | 'Healing' | 'Momentum' | 'Item Removal'
  | 'Status' | 'Priority' | 'Disruption' | 'Screens' | 'Speed Control';

export const MOVE_CATEGORIES: Record<MoveCategoryName, string[]> = {
  'Entry Hazards': ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web', 'Stone Axe', 'Ceaseless Edge'],
  'Hazard Removal': ['Defog', 'Rapid Spin', 'Mortal Spin', 'Tidy Up', 'Court Change'],
  Healing: ['Recover', 'Roost', 'Slack Off', 'Soft-Boiled', 'Milk Drink', 'Moonlight', 'Morning Sun',
    'Synthesis', 'Shore Up', 'Wish', 'Rest', 'Strength Sap', 'Leech Seed', 'Heal Bell', 'Aromatherapy',
    'Jungle Healing', 'Lunar Blessing', 'Life Dew'],
  Momentum: ['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Baton Pass',
    'Chilly Reception', 'Shed Tail'],
  'Item Removal': ['Knock Off', 'Trick', 'Switcheroo', 'Corrosive Gas', 'Covet', 'Thief'],
  Status: ['Thunder Wave', 'Will-O-Wisp', 'Toxic', 'Spore', 'Sleep Powder', 'Hypnosis', 'Yawn', 'Glare',
    'Stun Spore', 'Nuzzle', 'Dark Void', 'Lovely Kiss', 'Sing'],
  Priority: ['Extreme Speed', 'Aqua Jet', 'Bullet Punch', 'Mach Punch', 'Ice Shard', 'Shadow Sneak',
    'Sucker Punch', 'Quick Attack', 'Accelerock', 'Jet Punch', 'Grassy Glide', 'Vacuum Wave',
    'Water Shuriken', 'First Impression', 'Fake Out', 'Upper Hand', 'Thunderclap', 'Feint'],
  Disruption: ['Taunt', 'Encore', 'Haze', 'Roar', 'Whirlwind', 'Dragon Tail', 'Circle Throw',
    'Clear Smog', 'Destiny Bond', 'Perish Song', 'Disable', 'Torment', 'Imprison', 'Spectral Thief',
    'Topsy-Turvy'],
  Screens: ['Reflect', 'Light Screen', 'Aurora Veil', 'Brick Break', 'Psychic Fangs', 'Defog', 'Raging Bull'],
  'Speed Control': ['Tailwind', 'Trick Room', 'Icy Wind', 'Electroweb', 'Bulldoze', 'Rock Tomb',
    'Sticky Web', 'Thunder Wave', 'Glare'],
};

export const MOVE_CATEGORY_NAMES = Object.keys(MOVE_CATEGORIES) as MoveCategoryName[];

export interface NotableMove { move: string; species: SpeciesId[] }
export type NotableMoves = Record<MoveCategoryName, NotableMove[]>;

const gen = new Generations(Dex).get(9);
const learnCache = new Map<SpeciesId, Promise<Set<string>>>();

/** Set of move ids a species can learn in Gen 9 (cached per species). */
export function learnableMoveIds(speciesId: SpeciesId): Promise<Set<string>> {
  let p = learnCache.get(speciesId);
  if (!p) {
    p = gen.learnsets.learnable(speciesId).then((ls) => new Set(Object.keys(ls ?? {})));
    learnCache.set(speciesId, p);
  }
  return p;
}

/** Per category, each notable move that at least one of the species can learn, with who can. */
export async function notableMoves(speciesIds: SpeciesId[]): Promise<NotableMoves> {
  const learn = await Promise.all(speciesIds.map((id) => learnableMoveIds(id)));
  const out = {} as NotableMoves;
  for (const cat of MOVE_CATEGORY_NAMES) {
    const list: NotableMove[] = [];
    const seen = new Set<string>();
    for (const move of MOVE_CATEGORIES[cat]) {
      const mid = toID(move);
      if (seen.has(mid)) continue;
      seen.add(mid);
      const species = speciesIds.filter((_, i) => learn[i]?.has(mid));
      if (species.length) list.push({ move, species });
    }
    out[cat] = list;
  }
  return out;
}

/** For each species, the categories in which it can learn at least one notable move. */
export async function teamMoveMatrix(
  speciesIds: SpeciesId[],
): Promise<Record<SpeciesId, MoveCategoryName[]>> {
  const nm = await notableMoves(speciesIds);
  const out: Record<SpeciesId, MoveCategoryName[]> = {};
  for (const id of speciesIds) {
    out[id] = MOVE_CATEGORY_NAMES.filter((c) => nm[c].some((m) => m.species.includes(id)));
  }
  return out;
}
