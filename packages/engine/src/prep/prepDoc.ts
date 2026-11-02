import type {
  PrepCard, PrepDoc, RosterEntry, ScoutReport, ScoutedMon, SpeciesId,
} from '../types';
import { gen9Dex, teamMatchupTable, ALL_TYPES } from './typeChart';
import { mergedSpeedTiers } from './speedTiers';
import { notableMoves, teamMoveMatrix } from './moves';
import { likelySets } from './likelySets';

export interface PrepDocInput {
  you: RosterEntry[];
  opp: RosterEntry[];
  scout?: ScoutReport;
}

function card(entry: RosterEntry): PrepCard {
  const sp = gen9Dex.species.get(entry.species);
  return {
    species: entry.species,
    name: sp.name,
    types: [...sp.types],
    bst: sp.bst,
    baseStats: { ...sp.baseStats },
    abilities: Object.values(sp.abilities),
    tier: sp.tier,
    isTeraCaptain: entry.isTeraCaptain,
  };
}

export async function buildPrepDoc(input: PrepDocInput): Promise<PrepDoc> {
  const yourIds = input.you.map((e) => e.species);
  const oppIds = input.opp.map((e) => e.species);

  const [youMoves, oppMoves, youMatrix, oppMatrix] = await Promise.all([
    notableMoves(yourIds), notableMoves(oppIds), teamMoveMatrix(yourIds), teamMoveMatrix(oppIds),
  ]);

  const oppLikelySets: PrepDoc['oppLikelySets'] = {};
  const scouted: Record<SpeciesId, ScoutedMon> = {};
  for (const id of oppIds) {
    oppLikelySets[id] = likelySets(id);
    const s = input.scout?.bySpecies[id];
    if (s) scouted[id] = { ...s, moves: [...s.moves] };
  }

  return {
    you: input.you.map(card),
    opp: input.opp.map(card),
    matchup: { you: teamMatchupTable(yourIds), opp: teamMatchupTable(oppIds) },
    speed: mergedSpeedTiers(yourIds, oppIds),
    moves: { you: youMoves, opp: oppMoves },
    moveMatrix: { you: youMatrix, opp: oppMatrix },
    oppLikelySets,
    scouted,
  };
}

const MAX_LINES = 8;

function listNames(doc: PrepDoc, side: 'you' | 'opp', ids: SpeciesId[]): string {
  const cards = doc[side];
  return ids.map((id) => cards.find((c) => c.species === id)?.name ?? id).join(', ');
}

/** Cheap plain-English heuristics, most important first, at most 8 lines. */
export function threatSummary(doc: PrepDoc): string[] {
  const lines: { priority: number; text: string }[] = [];
  const add = (priority: number, text: string) => lines.push({ priority, text });

  // Type pressure: their STAB count against your Weak score, and the reverse.
  for (const t of ALL_TYPES) {
    const oppStab = doc.matchup.opp.stab[t] ?? 0;
    const yourWeak = doc.matchup.you.weak[t] ?? 0;
    if (oppStab >= 2 && yourWeak <= -2) {
      add(100 + oppStab - yourWeak, `Opp has ${oppStab} ${t} STAB users; your team is ${yourWeak} to ${t}.`);
    }
    const yourStab = doc.matchup.you.stab[t] ?? 0;
    const oppWeak = doc.matchup.opp.weak[t] ?? 0;
    if (yourStab >= 2 && oppWeak <= -2) {
      add(60 + yourStab - oppWeak, `You have ${yourStab} ${t} STAB users; opp team is ${oppWeak} to ${t}.`);
    }
  }

  // Speed: who outspeeds the whole other side at 252+.
  const topSpeed = (side: 'you' | 'opp') =>
    Math.max(0, ...doc.speed.filter((r) => r.side === side).map((r) => r.ev252plus));
  const yourTop = topSpeed('you');
  const oppTop = topSpeed('opp');
  const outspeeders = doc.speed.filter((r) => r.side === 'opp' && r.ev252plus > yourTop);
  for (const r of outspeeders.slice(0, 2)) {
    add(90, `${r.name} (opp) outspeeds your whole team at 252+.`);
  }
  const youOutspeed = doc.speed.filter((r) => r.side === 'you' && r.ev252plus > oppTop);
  for (const r of youOutspeed.slice(0, 1)) {
    add(50, `${r.name} (you) outspeeds the whole opp team at 252+.`);
  }

  // Hazards vs removal.
  const hazards = doc.moves.opp['Entry Hazards'];
  const stealthRock = hazards.find((m) => m.move === 'Stealth Rock');
  const yourRemoval = doc.moves.you['Hazard Removal'].length > 0;
  if (hazards.length > 0 && !yourRemoval) {
    add(85, `Opp can set hazards${stealthRock ? ` (Stealth Rock: ${listNames(doc, 'opp', stealthRock.species)})` : ''} and you have no hazard removal.`);
  }
  if (doc.moves.you['Entry Hazards'].length > 0 && doc.moves.opp['Hazard Removal'].length === 0) {
    add(45, 'You can set hazards and the opp has no hazard removal.');
  }

  // Types with no resist at all on your side.
  const noResist = ALL_TYPES.filter((t) => doc.matchup.you.rows.every((r) => (r.byType[t] ?? 1) >= 1));
  if (noResist.length > 0) add(70, `Your team has no resist or immunity to ${noResist.join(', ')}.`);

  // Priority and status flavor.
  const oppPrio = doc.moves.opp.Priority.flatMap((m) => m.species);
  const oppPrioMons = [...new Set(oppPrio)];
  if (oppPrioMons.length >= 3) add(40, `Opp has ${oppPrioMons.length} mons with priority moves (cleanup risk).`);
  const oppTera = doc.opp.filter((c) => c.isTeraCaptain).map((c) => c.name);
  if (oppTera.length) add(30, `Opp Tera captains: ${oppTera.join(', ')}.`);

  return lines.sort((a, b) => b.priority - a.priority).slice(0, MAX_LINES).map((l) => l.text);
}
