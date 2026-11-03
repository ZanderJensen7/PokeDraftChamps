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
  /** Opposing mons left out of `opp` (fog of war shows only the ones seen in a battle). */
  oppHidden?: number;
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
    oppHidden: input.oppHidden ?? 0,
  };
}

const MAX_LINES = 8;

function listNames(doc: PrepDoc, side: 'you' | 'opp', ids: SpeciesId[]): string {
  const cards = doc[side];
  return ids.map((id) => cards.find((c) => c.species === id)?.name ?? id).join(', ');
}

/** "a", "a or b", "a, b or c". */
function joinOr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * Cheap plain-English heuristics, most important first, at most 8 lines. Move claims are learnset based ("can"). When
 * part of the opposing roster is hidden (`doc.oppHidden`, fog of war), nothing claims what the opp lacks or that a
 * mon outspeeds all of them: only what the seen mons show.
 */
export function threatSummary(doc: PrepDoc): string[] {
  const noResist = ALL_TYPES.filter((t) => doc.matchup.you.rows.every((r) => (r.byType[t] ?? 1) >= 1));
  const noResistLine = `Nothing on your team resists or is immune to ${joinOr(noResist)}.`;
  // An empty opposing roster only happens under fog of war (stake 7): claim nothing about it, only about your team.
  if (doc.opp.length === 0) {
    return [
      'Opp roster unknown under fog of war: you see their mons once they have been brought to a battle.',
      ...(noResist.length > 0 ? [noResistLine] : []),
    ];
  }
  const partial = doc.oppHidden > 0;
  const oppTeam = partial ? `the ${doc.opp.length} opp mons seen so far` : 'the opp team';

  const lines: { priority: number; text: string }[] = [];
  const add = (priority: number, text: string) => lines.push({ priority, text });
  if (partial) add(1000, `Fog of war: ${doc.opp.length} opp mons seen so far, ${doc.oppHidden} not yet. Lines about the opp cover only the seen ones.`);

  // Type pressure: their STAB count against your Weak score (the matchup sheet's score), and the reverse.
  for (const t of ALL_TYPES) {
    const oppStab = doc.matchup.opp.stab[t] ?? 0;
    const yourWeak = doc.matchup.you.weak[t] ?? 0;
    if (oppStab >= 2 && yourWeak <= -2) {
      add(100 + oppStab - yourWeak, `${oppStab} opp mons have ${t} STAB, and your team is weak to ${t} (Weak score ${yourWeak}).`);
    }
    const yourStab = doc.matchup.you.stab[t] ?? 0;
    const oppWeak = doc.matchup.opp.weak[t] ?? 0;
    if (yourStab >= 2 && oppWeak <= -2) {
      add(60 + yourStab - oppWeak, `${yourStab} of your mons have ${t} STAB, and ${oppTeam} ${partial ? 'are' : 'is'} weak to ${t} (Weak score ${oppWeak}).`);
    }
  }

  // Speed: who outspeeds the whole other side at 252+.
  const topSpeed = (side: 'you' | 'opp') =>
    Math.max(0, ...doc.speed.filter((r) => r.side === side).map((r) => r.ev252plus));
  const yourTop = topSpeed('you');
  const oppTop = topSpeed('opp');
  const outspeeders = doc.speed.filter((r) => r.side === 'opp' && r.ev252plus > yourTop);
  for (const r of outspeeders.slice(0, 2)) {
    add(90, `Their ${r.name} outspeeds your whole team at max Speed.`);
  }
  if (!partial) {
    const youOutspeed = doc.speed.filter((r) => r.side === 'you' && r.ev252plus > oppTop);
    for (const r of youOutspeed.slice(0, 1)) {
      add(50, `Your ${r.name} outspeeds their whole team at max Speed.`);
    }
  }

  // Hazards vs removal.
  const hazards = doc.moves.opp['Entry Hazards'];
  const stealthRock = hazards.find((m) => m.move === 'Stealth Rock');
  const yourRemoval = doc.moves.you['Hazard Removal'].length > 0;
  if (hazards.length > 0 && !yourRemoval) {
    add(85, `The opp can set hazards${stealthRock ? ` (Stealth Rock: ${listNames(doc, 'opp', stealthRock.species)})` : ''}, and none of your mons can remove them.`);
  }
  if (!partial && doc.moves.you['Entry Hazards'].length > 0 && doc.moves.opp['Hazard Removal'].length === 0) {
    add(45, 'You can set hazards, and none of their mons can remove them.');
  }

  // Types with no resist at all on your side.
  if (noResist.length > 0) add(70, noResistLine);

  // Priority and status flavor.
  const oppPrio = doc.moves.opp.Priority.flatMap((m) => m.species);
  const oppPrioMons = [...new Set(oppPrio)];
  if (oppPrioMons.length >= 3) add(40, `${oppPrioMons.length} opp mons can use priority moves (cleanup risk).`);
  const oppTera = doc.opp.filter((c) => c.isTeraCaptain).map((c) => c.name);
  if (oppTera.length) add(30, `Opp Tera captain${oppTera.length > 1 ? 's' : ''}: ${oppTera.join(', ')}.`);

  return lines.sort((a, b) => b.priority - a.priority).slice(0, MAX_LINES).map((l) => l.text);
}
