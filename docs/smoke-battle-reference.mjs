import { BattleStreams, Teams, Dex, PRNG } from '@pkmn/sim';
import { TeamGenerators } from '@pkmn/randoms';
Teams.setGeneratorFactory(TeamGenerators);
const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
const spec = { formatid: 'gen9customgame', seed: [1,2,3,4] };
const p1 = { name: 'Alice', team: Teams.pack(Teams.generate('gen9randombattle')) };
const p2 = { name: 'Bob', team: Teams.pack(Teams.generate('gen9randombattle')) };
const rng = new PRNG([5,6,7,8]);
let turns = 0; let winner = null;
async function drive(side, stream) {
  for await (const chunk of stream) {
    for (const line of chunk.split('\n')) {
      if (line.startsWith('|request|')) {
        const req = JSON.parse(line.slice(9));
        if (req.wait) continue;
        if (req.teamPreview) { void streams[side].write("team 123456"); continue; }
        if (req.forceSwitch) {
          const idx = req.side.pokemon.findIndex((p,i)=> !p.active && !p.condition.endsWith(' fnt'));
          void streams[side].write(`switch ${idx+1}`);
        } else if (req.active) {
          const moves = req.active[0].moves.map((m,i)=>({m,i})).filter(x=>!x.m.disabled);
          const pick = moves[Math.floor(rng.random()*moves.length)];
          void streams[side].write(`move ${pick.i+1}`);
        }
      }
    }
  }
}
(async () => {
  for await (const chunk of streams.omniscient) {
    for (const line of chunk.split('\n')) {
      if (line.startsWith('|turn|')) turns = +line.slice(6);
      if (line.startsWith('|win|')) winner = line.slice(5);
    }
  }
  console.log('winner', winner, 'turns', turns);
})();
drive('p1', streams.p1); drive('p2', streams.p2);
void streams.omniscient.write(`>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1)}\n>player p2 ${JSON.stringify(p2)}`);
