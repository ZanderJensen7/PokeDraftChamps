/** How well a pool mon fits your roster (0-100): green 65+, yellow 45-64, grey below. */
export function FitBadge({ score }: { score: number }) {
  const tone = score >= 65
    ? 'border-win bg-win text-cream-ink'
    : score >= 45
      ? 'border-poke-yellow-dark bg-poke-yellow text-cream-ink'
      : 'border-edge-dark bg-panel-inset text-muted';
  return (
    <span
      title={`Team fit ${score} of 100`}
      className={`inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 font-display text-[11px] font-extrabold leading-none tabular-nums ${tone}`}
    >
      <span className="opacity-75">FIT</span>{score}
    </span>
  );
}
