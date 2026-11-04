/** The one way to dismiss a layer (dialog, sheet, Settings, Team editor): a ✕ at its top-right. */
import { GameButton } from './GameButton';

export function CloseButton({ onClick, label = 'Close', className = '' }: { onClick: () => void; label?: string; className?: string }) {
  return <GameButton variant="ghost" size="sm" onClick={onClick} aria-label={label} title={label} className={className}>✕</GameButton>;
}
