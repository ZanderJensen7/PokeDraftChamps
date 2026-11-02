/** The app's logo mark: a Poke Ball drawn by us. */
export function PokeBallLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="PokeDraftChamps" className={className}>
      <circle cx="50" cy="50" r="46" fill="var(--color-cream)" stroke="var(--color-edge-dark)" strokeWidth="6" />
      <path d="M4 50 A46 46 0 0 1 96 50 Z" fill="var(--color-poke-red)" stroke="var(--color-edge-dark)" strokeWidth="6" strokeLinejoin="round" />
      <path d="M18 30 A36 36 0 0 1 40 14" fill="none" stroke="var(--color-cream)" strokeOpacity="0.55" strokeWidth="6" strokeLinecap="round" />
      <rect x="4" y="46" width="92" height="8" fill="var(--color-edge-dark)" />
      <circle cx="50" cy="50" r="15" fill="var(--color-cream)" stroke="var(--color-edge-dark)" strokeWidth="6" />
      <circle cx="50" cy="50" r="6" fill="var(--color-cream)" stroke="var(--color-edge-dark)" strokeWidth="3" />
    </svg>
  );
}
