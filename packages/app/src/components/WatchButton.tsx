import type { Match } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { GameButton } from './ui';

/** Whether a match has a stored log to replay. */
export function canWatch(m: Match | undefined): boolean {
  return !!m?.result?.log?.length;
}

/** WATCH: opens the replay of a played match. Nothing for a match with no stored log. */
export function WatchButton({ match, className = '' }: { match: Match; className?: string }) {
  const watch = useGame((s) => s.watch);
  if (!canWatch(match)) return null;
  return (
    <GameButton size="sm" variant="ghost" className={`shrink-0 ${className}`} onClick={() => watch(match.id)} aria-label={`Watch the replay`}>
      WATCH
    </GameButton>
  );
}
