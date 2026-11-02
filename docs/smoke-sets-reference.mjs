import { TeamGenerators } from '@pkmn/randoms';
import { Dex } from '@pkmn/sim';
const gen = TeamGenerators.getTeamGenerator('gen9randombattle', [1,2,3,4]);
console.log('species with random sets:', Object.keys(gen.randomSets).length);
console.log(JSON.stringify(gen.randomSets['greattusk'], null, 0).slice(0, 700));
for (const name of ['Great Tusk', 'Kingambit', 'Pelipper', 'Illumise', 'Palafin']) {
  const s = gen.randomSet(name);
  console.log(name, '->', JSON.stringify({ moves: s.moves, item: s.item, ability: s.ability, nature: s.nature, evs: s.evs, tera: s.teraType, role: s.role, level: s.level }));
}
console.log('has set for Illumise?', !!gen.randomSets['illumise'], 'Slaking?', !!gen.randomSets['slaking']);
