// Display names for field conditions. The protocol names weather by id ("SunnyDay") and terrains / rooms by
// move name ("Electric Terrain"); the field chips and the log show these instead. Pure: no React, no DOM.

/** Condition id (or protocol name) -> what the player reads. */
export const CONDITION_NAMES: Readonly<Record<string, string>> = Object.freeze({
  SunnyDay: 'Sun', RainDance: 'Rain', Sandstorm: 'Sandstorm', Snow: 'Snow', Snowscape: 'Snow', Hail: 'Hail',
  DesolateLand: 'Harsh Sun', PrimordialSea: 'Heavy Rain', DeltaStream: 'Strong Winds',
  'Electric Terrain': 'Electric Terrain', 'Grassy Terrain': 'Grassy Terrain', 'Misty Terrain': 'Misty Terrain',
  'Psychic Terrain': 'Psychic Terrain', 'Trick Room': 'Trick Room', 'Magic Room': 'Magic Room',
  'Wonder Room': 'Wonder Room', Gravity: 'Gravity', 'Mud Sport': 'Mud Sport', 'Water Sport': 'Water Sport',
});

/** The display name of a condition; an id outside the table is split at its capitals ("MagmaStorm" -> "Magma Storm"). */
export function conditionName(id: string): string {
  const known = CONDITION_NAMES[id];
  if (known) return known;
  const spaced = id.replace(/^(move|ability|item):\s*/, '').replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').trim();
  return spaced ? spaced[0]!.toUpperCase() + spaced.slice(1) : id;
}
