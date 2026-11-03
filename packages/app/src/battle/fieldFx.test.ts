import { describe, expect, it } from 'vitest';
import { applyLine, emptyView, type FieldView } from './battleView';
import { activeSlots, FIELD_LOOKS, FIELD_SLOTS, fieldState } from './fieldFx';
import { fxEvent } from './vfx';

const play = (lines: string[]): FieldView => {
  const view = emptyView();
  for (const l of lines) applyLine(view, l);
  return view;
};

const OPEN = [
  '|switch|p1a: Charizard|Charizard, L100|100/100',
  '|switch|p2a: Blastoise|Blastoise, L100|100/100',
];

describe('fieldState', () => {
  it('is empty on a bare field', () => {
    const fx = fieldState(play(OPEN));
    expect(fx.weather).toBeNull();
    expect(fx.terrain).toBeNull();
    expect(fx.trickRoom).toBe(false);
    expect(fx.sides.p1).toEqual({ screens: [], tailwind: false, hazards: { rocks: false, spikes: 0, toxicSpikes: 0, web: false } });
    expect(Object.values(fx.mons.p2).some(Boolean)).toBe(false);
    expect(activeSlots(fx)).toEqual([]);
  });

  it('reads weather, terrain and Trick Room, and ends them', () => {
    const view = play([...OPEN, '|-weather|RainDance', '|-fieldstart|move: Grassy Terrain', '|-fieldstart|move: Trick Room']);
    const fx = fieldState(view);
    expect(fx).toMatchObject({ weather: 'RainDance', terrain: 'Grassy Terrain', trickRoom: true });
    expect(activeSlots(fx)).toEqual(['RainDance', 'Grassy Terrain', 'Trick Room']);
    for (const l of ['|-weather|none', '|-fieldend|move: Grassy Terrain', '|-fieldend|move: Trick Room']) applyLine(view, l);
    expect(activeSlots(fieldState(view))).toEqual([]);
  });

  it('a new terrain replaces the old one; an unknown weather shows nothing', () => {
    const view = play([...OPEN, '|-fieldstart|move: Grassy Terrain', '|-fieldstart|move: Electric Terrain', '|-weather|Fog']);
    const fx = fieldState(view);
    expect(fx.terrain).toBe('Electric Terrain');
    expect(fx.weather).toBeNull();
  });

  it('stacks hazard layers on the side they are on, capped at the game maximum', () => {
    const view = play([
      ...OPEN,
      '|-sidestart|p2: Foe|move: Stealth Rock',
      '|-sidestart|p2: Foe|Spikes', '|-sidestart|p2: Foe|Spikes',
      '|-sidestart|p1: You|move: Toxic Spikes', '|-sidestart|p1: You|move: Toxic Spikes', '|-sidestart|p1: You|move: Toxic Spikes',
      '|-sidestart|p1: You|move: Sticky Web',
    ]);
    const fx = fieldState(view);
    expect(fx.sides.p2.hazards).toEqual({ rocks: true, spikes: 2, toxicSpikes: 0, web: false });
    expect(fx.sides.p1.hazards).toEqual({ rocks: false, spikes: 0, toxicSpikes: 2, web: true });
    expect(activeSlots(fx)).toEqual(['p1:Toxic Spikes1', 'p1:Toxic Spikes2', 'p1:Sticky Web', 'p2:Stealth Rock', 'p2:Spikes1', 'p2:Spikes2']);
    applyLine(view, '|-sideend|p2: Foe|move: Stealth Rock|[from] move: Rapid Spin');
    expect(fieldState(view).sides.p2.hazards.rocks).toBe(false);
  });

  it('reads screens and Tailwind per side', () => {
    const fx = fieldState(play([...OPEN, '|-sidestart|p1: You|move: Reflect', '|-sidestart|p1: You|move: Light Screen', '|-sidestart|p2: Foe|move: Aurora Veil', '|-sidestart|p2: Foe|move: Tailwind']));
    expect(fx.sides.p1.screens).toEqual(['Reflect', 'Light Screen']);
    expect(fx.sides.p2).toMatchObject({ screens: ['Aurora Veil'], tailwind: true });
  });

  it('tracks volatiles on the active mon until it switches out or faints', () => {
    const view = play([...OPEN, '|-start|p1a: Charizard|Substitute', '|-start|p2a: Blastoise|move: Leech Seed', '|-start|p2a: Blastoise|move: Taunt', '|-start|p2a: Blastoise|confusion']);
    let fx = fieldState(view);
    expect(fx.mons.p1.substitute).toBe(true);
    expect(fx.mons.p2).toMatchObject({ leechSeed: true, taunt: true, confused: true, substitute: false });
    applyLine(view, '|-end|p1a: Charizard|Substitute');
    applyLine(view, '|-end|p2a: Blastoise|move: Taunt');
    fx = fieldState(view);
    expect(fx.mons.p1.substitute).toBe(false);
    expect(fx.mons.p2.taunt).toBe(false);
    applyLine(view, '|switch|p2a: Venusaur|Venusaur, L100|100/100');
    expect(Object.values(fieldState(view).mons.p2).some(Boolean)).toBe(false);
    applyLine(view, '|-start|p1a: Charizard|Encore');
    applyLine(view, '|faint|p1a: Charizard');
    expect(Object.values(fieldState(view).mons.p1).some(Boolean)).toBe(false);
  });

  it('a volatile does not carry over to the next mon that switches in', () => {
    const view = play([...OPEN, '|-start|p1a: Charizard|Substitute', '|switch|p1a: Pikachu|Pikachu, L100|100/100', '|switch|p1a: Charizard|Charizard, L100|100/100']);
    expect(fieldState(view).mons.p1.substitute).toBe(false);
  });
});

describe('field looks', () => {
  it('has a look for every slot, and slot ids are unique', () => {
    expect(new Set(FIELD_SLOTS.map((s) => s.id)).size).toBe(FIELD_SLOTS.length);
    for (const s of FIELD_SLOTS) expect(FIELD_LOOKS[s.look], s.id).toBeDefined();
  });

  it('every active slot id is a known slot', () => {
    const ids = new Set(FIELD_SLOTS.map((s) => s.id));
    const view = play([...OPEN, '|-weather|SunnyDay', '|-fieldstart|move: Psychic Terrain', '|-sidestart|p1: You|move: Reflect', '|-start|p2a: Blastoise|Substitute']);
    for (const id of activeSlots(fieldState(view))) expect(ids.has(id), id).toBe(true);
  });
});

describe('volatile one-shots', () => {
  const none = () => undefined;
  it('Substitute and Leech Seed starts have an effect now', () => {
    expect(fxEvent('|-start|p1a: Charizard|Substitute', none)).toMatchObject({ kind: 'volatile', to: 'p1', name: 'Substitute', on: true });
    expect(fxEvent('|-start|p2a: Blastoise|move: Leech Seed', none)).toMatchObject({ kind: 'volatile', to: 'p2', name: 'Leech Seed', on: true, from: 'p1' });
    expect(fxEvent('|-end|p1a: Charizard|Substitute', none)).toMatchObject({ kind: 'volatile', name: 'Substitute', on: false });
  });
  it('confusion keeps its swirl', () => {
    expect(fxEvent('|-start|p1a: Charizard|confusion', none)).toMatchObject({ kind: 'status', type: 'Psychic' });
  });
  it('hazards and screens carry the condition for the placement animation', () => {
    expect(fxEvent('|-sidestart|p2: Foe|move: Stealth Rock', none)).toMatchObject({ kind: 'side', to: 'p2', condition: 'Stealth Rock' });
  });
});
