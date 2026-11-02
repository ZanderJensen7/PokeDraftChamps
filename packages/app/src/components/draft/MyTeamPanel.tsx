import { useMemo, type ReactNode } from 'react';
import type { SpeciesId, TeamNeeds } from '@pdc/engine';
import { ROLE_PRIORITY, getDraftMon, teamMatchupTable } from '@pdc/engine';
import { DialogueBox, Panel, PokeIcon } from '../ui';
import { MatchupTable } from '../prep/MatchupTable';
import { displayText, speciesName, spriteName } from '../../game/names';

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-poke-yellow">{title}</h3>
        {aside && <span className="text-xs font-semibold text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const BUCKETS = [
  { id: 'fast', label: 'Fast', range: '100+', test: (s: number) => s >= 100 },
  { id: 'mid', label: 'Mid', range: '70–99', test: (s: number) => s >= 70 && s < 100 },
  { id: 'slow', label: 'Slow', range: 'under 70', test: (s: number) => s < 70 },
] as const;

function SpeedBuckets({ rosterIds }: { rosterIds: readonly SpeciesId[] }) {
  const mons = rosterIds
    .map((id) => ({ id, spe: getDraftMon(id)?.baseStats.spe ?? 0 }))
    .sort((a, b) => b.spe - a.spe);
  return (
    <div className="space-y-1">
      {BUCKETS.map((b) => {
        const inBucket = mons.filter((m) => b.test(m.spe));
        return (
          <div key={b.id} className="flex items-start gap-2 rounded-lg bg-panel-inset px-2 py-1">
            <div className="w-16 shrink-0 pt-1 leading-tight">
              <div className="font-display text-sm font-bold uppercase">{b.label}</div>
              <div className="text-[11px] font-semibold text-muted">{b.range}</div>
            </div>
            <div className="flex min-h-8 flex-1 flex-wrap items-center gap-1">
              {inBucket.length === 0 && <span className="text-xs text-faint">none yet</span>}
              {inBucket.map((m) => (
                <span key={m.id} className="flex items-center rounded-md bg-panel pr-1.5" title={`${speciesName(m.id)}: base ${m.spe} Speed`}>
                  <PokeIcon name={spriteName(m.id)} title={speciesName(m.id)} />
                  <span className="font-display text-sm font-bold tabular-nums">{m.spe}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoleChips({ needs }: { needs: TeamNeeds | null }) {
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {ROLE_PRIORITY.map((c) => {
        const who = needs?.roles[c] ?? [];
        const names = who.map(speciesName).join(', ');
        if (!needs) {
          return (
            <li key={c} className="rounded-lg border-2 border-edge-dark px-2 py-1">
              <div className="font-display text-sm font-bold leading-tight text-muted">{c}</div>
              <div className="text-xs text-faint">checking…</div>
            </li>
          );
        }
        return who.length > 0 ? (
          <li key={c} className="min-w-0 rounded-lg border-2 border-you bg-you-soft px-2 py-1" title={`${c}: ${names}`}>
            <div className="font-display text-sm font-bold leading-tight">{c}</div>
            <div className="truncate text-xs font-semibold text-muted">{names}</div>
          </li>
        ) : (
          <li key={c} className="min-w-0 rounded-lg border-2 border-dashed border-edge px-2 py-1" title={`Nobody covers ${c} yet`}>
            <div className="font-display text-sm font-bold leading-tight text-muted">{c}</div>
            <div className="text-xs text-faint">missing</div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * MY TEAM: what your roster looks like so far. Needs (engine summary), the compact resistances
 * chart, speed buckets and move-role coverage. Stays usable while the AI coaches pick.
 */
export function MyTeamPanel({ rosterIds, sizeText, needs, loading, className = '' }: {
  rosterIds: readonly SpeciesId[]; sizeText: string; needs: TeamNeeds | null; loading: boolean; className?: string;
}) {
  const key = rosterIds.join(',');
  // The type chart is sync, so it renders before the learnset-backed needs arrive.
  const table = useMemo(() => teamMatchupTable(key ? key.split(',') : []), [key]);
  const empty = rosterIds.length === 0;
  return (
    <Panel title="My team" aside={<span className="font-display font-bold">{sizeText}</span>} className={className}>
      {empty ? (
        <DialogueBox>Draft your first pick to see your team's shape.</DialogueBox>
      ) : (
        <div className="space-y-4">
          <Section title="Needs" aside={loading ? 'updating…' : undefined}>
            <DialogueBox className="!px-3 !py-2 !text-sm">
              {!needs ? (
                <p>Reading your team's movesets…</p>
              ) : needs.summary.length === 0 ? (
                <p>No big holes right now. Nice shape!</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4">
                  {needs.summary.map((s) => <li key={s}>{displayText(s)}</li>)}
                </ul>
              )}
            </DialogueBox>
          </Section>
          <Section title="Resistances" aside="damage taken">
            <MatchupTable table={table} compact />
          </Section>
          <Section title="Speed" aside="base Speed">
            <SpeedBuckets rosterIds={rosterIds} />
          </Section>
          <Section title="Roles" aside={needs ? `${ROLE_PRIORITY.length - needs.missingRoles.length} of ${ROLE_PRIORITY.length} covered` : undefined}>
            <RoleChips needs={needs} />
          </Section>
        </div>
      )}
    </Panel>
  );
}
