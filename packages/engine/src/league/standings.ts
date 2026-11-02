// Regular-season standings: wins, differential, head-to-head, coach id.
import type { CoachId, Match, StandingRow } from '../types';

type CoachRef = CoachId | { id: CoachId };
const idOf = (c: CoachRef): CoachId => (typeof c === 'string' ? c : c.id);

/**
 * Only regular-season matches (no playoffRound) with a result count.
 * Differential per match = own remaining - opponent remaining (MatchResult.remaining).
 * Order: wins desc, differential desc, then head-to-head wins inside each tied group
 * (a mini-table over the tied coaches, so 3-way ties are consistent), then coach id asc.
 */
export function computeStandings(coaches: readonly CoachRef[], matches: readonly Match[]): StandingRow[] {
  const rows = new Map<CoachId, StandingRow>();
  for (const c of coaches) rows.set(idOf(c), { coach: idOf(c), wins: 0, losses: 0, differential: 0, rank: 0 });
  const played = matches.filter((m) => m.playoffRound === undefined && m.result);
  for (const m of played) {
    const r = m.result!;
    const w = rows.get(r.winner);
    const l = rows.get(r.loser);
    const wr = r.remaining[r.winner] ?? 0;
    const lr = r.remaining[r.loser] ?? 0;
    if (w) { w.wins += 1; w.differential += wr - lr; }
    if (l) { l.losses += 1; l.differential += lr - wr; }
  }

  const sorted = [...rows.values()].sort((a, b) => b.wins - a.wins || b.differential - a.differential);
  const out: StandingRow[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    const head = sorted[i]!;
    while (j < sorted.length && sorted[j]!.wins === head.wins && sorted[j]!.differential === head.differential) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.coach));
      const h2h = new Map<CoachId, number>();
      for (const m of played) {
        const r = m.result!;
        if (ids.has(r.winner) && ids.has(r.loser)) h2h.set(r.winner, (h2h.get(r.winner) ?? 0) + 1);
      }
      group.sort((a, b) => (h2h.get(b.coach) ?? 0) - (h2h.get(a.coach) ?? 0) || (a.coach < b.coach ? -1 : a.coach > b.coach ? 1 : 0));
    }
    out.push(...group);
    i = j;
  }
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}
