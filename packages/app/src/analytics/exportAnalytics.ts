import type { RunState } from '@pdc/engine';
import { humanCoach, priceSuggestions, runSpeciesStats } from '@pdc/engine';
import { downloadText } from '../game/download';

/** Downloads { runId, config, aggregates, suggestions } for the given run. */
export function exportAnalyticsJson(run: RunState): void {
  const aggregates = runSpeciesStats(run);
  const suggestions = priceSuggestions(aggregates, { minGames: 5 });
  const payload = { runId: run.id, config: run.config, aggregates, suggestions };
  downloadText(`pokedraftchamps-${humanCoach(run).abbrev}-analytics-week${run.week}.json`, JSON.stringify(payload, null, 2));
}
