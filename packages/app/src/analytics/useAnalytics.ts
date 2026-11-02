import { useMemo } from 'react';
import type { RunState } from '@pdc/engine';
import { priceSuggestions, runSpeciesStats } from '@pdc/engine';

/** Species aggregates and price suggestions for a run, recomputed only when the run changes. */
export function useAnalytics(run: RunState | null) {
  return useMemo(() => {
    if (!run) return null;
    const aggregates = runSpeciesStats(run);
    return { aggregates, suggestions: priceSuggestions(aggregates, { minGames: 5 }) };
  }, [run]);
}

/** True once any match of the run has a result (the analytics screen has something to show). */
export function hasPlayedMatches(run: RunState): boolean {
  return run.matches.some((m) => m.result);
}
