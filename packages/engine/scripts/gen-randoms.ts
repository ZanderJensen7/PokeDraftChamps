// Regenerates src/data/randomsSets.json: the gen9randombattle species table (level + role sets) from @pkmn/randoms.
// The draft pool, prep likely sets and protocol id folding read the JSON so the app's main bundle never loads the sim.
// Run after bumping @pkmn/randoms: `npm run gen:randoms -w @pdc/engine` (randomsData.test.ts fails while stale).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TeamGenerators } from '@pkmn/randoms';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, '../../node_modules/@pkmn/randoms/package.json'), 'utf8')) as { version: string };
const gen = TeamGenerators.getTeamGenerator('gen9randombattle', 'gen5,0000000000000001') as unknown as {
  randomSets: Record<string, unknown>;
};

const ids = Object.keys(gen.randomSets).sort();
const lines = ids.map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(gen.randomSets[id])}`);
const out =
  `{\n  "source": ${JSON.stringify(`@pkmn/randoms ${pkg.version} gen9randombattle`)},\n  "species": {\n${lines.join(',\n')}\n  }\n}\n`;
const file = resolve(root, 'src/data/randomsSets.json');
writeFileSync(file, out);
console.log(`wrote ${ids.length} species (${(out.length / 1024).toFixed(0)} KB) from @pkmn/randoms ${pkg.version} -> ${file}`);
