/** The one way back out of a screen or a step: "‹ Back", top-left of the title band (bottom-left in a stepped flow). */
import { GameButton } from './GameButton';

export function BackButton({ onClick, to, className = '' }: { onClick: () => void; to?: string; className?: string }) {
  return (
    <GameButton variant="ghost" size="sm" onClick={onClick} aria-label={to ? `Back to ${to}` : 'Back'} className={className}>
      <span aria-hidden="true">‹</span> Back
    </GameButton>
  );
}
