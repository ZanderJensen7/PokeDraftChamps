/**
 * How well a pool mon fits your roster (0-100): green 65+, yellow 45-64, grey below. `pending` marks the quick
 * score (move roles not read yet): a faint "…" after the number until the learnsets load and the score settles.
 */
export function FitBadge({ score, pending = false }: { score: number; pending?: boolean }) {
  const tone = score >= 65
    ? 'border-win bg-win text-cream-ink'
    : score >= 45
      ? 'border-poke-yellow-dark bg-poke-yellow text-cream-ink'
      : 'border-edge-dark bg-panel-inset text-muted';
  return (
    <span
      title={pending ? `Team fit ${score} of 100 so far; move roles are still loading` : `Team fit ${score} of 100`}
      className={`inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 font-display text-[11px] font-extrabold leading-none tabular-nums ${tone}`}
    >
      <span className="opacity-75">FIT</span>{score}
      {pending && <span className="opacity-60" aria-label="roles loading">…</span>}
    </span>
  );
}
