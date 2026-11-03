// The team editor's move table: the four chosen moves pinned on top, then every legal move of the mon with Showdown-style
// columns (type, category, power, accuracy, PP, effect), sortable, filterable, with the full description one tap away.
// Phones get the same data as a list and a bottom sheet for the details.
import { Fragment, useMemo, useState } from 'react';
import type { MoveRow } from '@pdc/engine';
import { ALL_TYPES, moveRow } from '@pdc/engine';
import { GameButton, ResponsiveDialog, TypePill } from './ui';
import { useIsMobile } from '../hooks/useIsMobile';

const CATEGORIES = ['Physical', 'Special', 'Status'] as const;
type SortKey = 'name' | 'type' | 'category' | 'power' | 'accuracy' | 'pp' | 'effect';
const SORT_OPTIONS: [SortKey, string][] = [['name', 'Name'], ['type', 'Type'], ['category', 'Category'], ['power', 'Power'], ['accuracy', 'Accuracy'], ['pp', 'PP']];

const CATEGORY_COLOR: Record<string, string> = {
  Physical: 'var(--color-type-fighting)',
  Special: 'var(--color-type-water)',
  Status: 'var(--color-faint)',
};

/** Our own category glyphs: a burst (Physical), rings (Special), a swirl (Status). */
export function CategoryIcon({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? 'var(--color-faint)';
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" role="img" aria-label={category} className="inline-block shrink-0">
      <title>{category}</title>
      {category === 'Physical' && (
        <path d="M12 1.5l2.6 5.6 6-1.2-2.2 5.7 4.6 4-6 .8-.6 6-4.4-4.2-4.4 4.2-.6-6-6-.8 4.6-4-2.2-5.7 6 1.2z" fill={color} stroke="#0b1426" strokeWidth="1.2" strokeLinejoin="round" />
      )}
      {category === 'Special' && (
        <g stroke="#0b1426" strokeWidth="1.2">
          <circle cx="12" cy="12" r="10" fill={color} />
          <circle cx="12" cy="12" r="6.2" fill="none" stroke="#eef2ff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.4" fill="#eef2ff" />
        </g>
      )}
      {category === 'Status' && (
        <g stroke="#0b1426" strokeWidth="1.2">
          <ellipse cx="12" cy="12" rx="10" ry="7" fill={color} transform="rotate(-25 12 12)" />
          <path d="M6.5 13c3-6 8-6 11-2" fill="none" stroke="#eef2ff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

const powerText = (r: MoveRow) => (r.category === 'Status' ? '—' : r.variablePower ? 'Var.' : String(r.power));
const accText = (r: MoveRow) => (r.accuracy === null ? '—' : String(r.accuracy));

function sortValue(r: MoveRow, key: SortKey): string | number {
  switch (key) {
    case 'name': return r.name;
    case 'type': return r.type;
    case 'category': return r.category;
    case 'power': return r.category === 'Status' ? -1 : r.power;
    case 'accuracy': return r.accuracy ?? 101;
    case 'pp': return r.maxPp;
    case 'effect': return r.shortDesc;
  }
}

/** The long form: full description, priority, flags and secondary chance. */
export function MoveDetails({ row }: { row: MoveRow }) {
  return (
    <div className="space-y-2 text-sm">
      <p>{row.desc || row.shortDesc}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {row.priority !== 0 && <span className="rounded-full bg-panel-hi px-2 py-0.5 font-bold">Priority {row.priority > 0 ? `+${row.priority}` : row.priority}</span>}
        {row.secondaryChance !== undefined && <span className="rounded-full bg-panel-hi px-2 py-0.5 font-bold">{row.secondaryChance}% secondary effect</span>}
        {row.variablePower && <span className="rounded-full bg-panel-hi px-2 py-0.5 font-bold">Power varies</span>}
        {row.flags.map((f) => <span key={f} className="rounded-full bg-panel-hi px-2 py-0.5 font-semibold text-muted">{f}</span>)}
        <span className="text-muted">PP {row.pp} (max {row.maxPp})</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <span className="text-xs text-muted">{label} <span className="font-bold tabular-nums text-ink">{value}</span></span>;
}

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={on && color ? { background: color } : undefined}
      className={`focus-ring min-h-8 shrink-0 rounded-full border-2 px-2.5 text-xs font-bold ${on ? `border-poke-yellow ${color ? 'text-white' : 'bg-panel-hi'}` : 'border-edge bg-panel-inset text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

interface MoveTableProps {
  /** Legal moves of the mon; null while loading. */
  rows: MoveRow[] | null;
  /** Four slots (empty string = free). */
  chosen: string[];
  /** The mon's types, for STAB on a chosen move that is not in the learnset. */
  types: readonly string[];
  onChange: (moves: string[]) => void;
}

export function MoveTable({ rows, chosen, types, onChange }: MoveTableProps) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [stabOnly, setStabOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<MoveRow | null>(null);

  const byName = useMemo(() => new Map((rows ?? []).map((r) => [r.name.toLowerCase(), r])), [rows]);
  const slots = chosen.map((name) => {
    if (!name) return null;
    const row = byName.get(name.toLowerCase()) ?? moveRow(name, types);
    return { name, row, legal: !rows || byName.has(name.toLowerCase()) };
  });
  const taken = new Set(chosen.filter(Boolean).map((m) => m.toLowerCase()));
  const full = taken.size >= 4 || chosen.every(Boolean);
  const present = useMemo(() => new Set((rows ?? []).map((r) => r.type)), [rows]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = (rows ?? []).filter((r) => !taken.has(r.name.toLowerCase())
      && (!typeFilter || r.type === typeFilter)
      && (!catFilter || r.category === catFilter)
      && (!stabOnly || r.stab)
      && (!q || r.name.toLowerCase().includes(q) || r.shortDesc.toLowerCase().includes(q) || r.type.toLowerCase().startsWith(q) || r.category.toLowerCase().startsWith(q)));
    return out.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return (c || a.name.localeCompare(b.name)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, typeFilter, catFilter, stabOnly, sort, chosen.join('|')]);

  const add = (name: string) => {
    const i = chosen.findIndex((m) => !m);
    if (i < 0) return;
    const next = [...chosen];
    next[i] = name;
    onChange(next);
  };
  const remove = (i: number) => {
    const next = [...chosen];
    next[i] = '';
    onChange(next);
  };
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key
    ? { key, dir: s.dir === 1 ? -1 : 1 }
    : { key, dir: key === 'power' || key === 'accuracy' || key === 'pp' ? -1 : 1 }));

  const head = (key: SortKey, label: string, cls = '') => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`sticky top-0 z-10 bg-panel px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-muted ${cls}`}>
      <button type="button" onClick={() => toggleSort(key)} className="focus-ring inline-flex items-center gap-1 rounded uppercase hover:text-ink">
        {label}
        <span aria-hidden className={sort.key === key ? 'text-poke-yellow' : 'opacity-30'}>{sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-bold uppercase tracking-wide text-muted">Moves {rows === null && '(loading…)'}</span>
          <span className="text-xs text-muted">{full ? 'All four slots filled: remove a move to add another.' : 'Tap a move below to fill the next slot.'}</span>
        </div>
        <ol className="grid grid-cols-1 gap-1.5 md:grid-cols-2" aria-label="Chosen moves">
          {slots.map((s, i) => (
            <li key={i} className={`flex min-h-12 items-center gap-2 rounded-lg border-2 px-2 py-1 ${s ? (s.legal ? 'border-poke-yellow bg-panel-hi' : 'border-loss bg-panel-hi') : 'border-dashed border-edge bg-panel-inset'}`}>
              <span className="w-4 shrink-0 text-xs font-bold text-faint">{i + 1}</span>
              {s ? (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-semibold">{s.name}</span>
                      {s.row && <TypePill type={s.row.type} size="xs" />}
                      {s.row && <CategoryIcon category={s.row.category} />}
                      {s.row && <Stat label="Pow" value={powerText(s.row)} />}
                      {s.row && <Stat label="Acc" value={accText(s.row)} />}
                      {s.row?.stab && <span className="rounded bg-poke-yellow px-1 text-[10px] font-extrabold text-cream-ink">STAB</span>}
                      {!s.legal && <span className="text-xs font-bold text-loss">Not learnable</span>}
                    </div>
                    {s.row && <div className="truncate text-xs text-muted">{s.row.shortDesc}</div>}
                  </div>
                  <GameButton variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Remove ${s.name}`} className="min-h-11 min-w-11 md:min-h-0 md:min-w-0">✕</GameButton>
                </>
              ) : (
                <span className="text-sm text-faint">Empty</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <input
          type="search"
          className="field w-full"
          placeholder="Search moves by name, type or effect"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search moves"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {CATEGORIES.map((c) => <Chip key={c} on={catFilter === c} onClick={() => setCatFilter(catFilter === c ? null : c)}>{c}</Chip>)}
          <Chip on={stabOnly} onClick={() => setStabOnly(!stabOnly)}>STAB only</Chip>
        </div>
        {isMobile && (
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              Sort
              <select className="field min-w-0 flex-1 normal-case" value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: sort.dir })} aria-label="Sort moves by">
                {SORT_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <GameButton variant="ghost" size="sm" onClick={() => setSort({ key: sort.key, dir: sort.dir === 1 ? -1 : 1 })} aria-label={sort.dir === 1 ? 'Ascending, tap for descending' : 'Descending, tap for ascending'} className="min-h-11 min-w-11">
              {sort.dir === 1 ? '▲' : '▼'}
            </GameButton>
          </div>
        )}
        <div className="no-scrollbar flex gap-1.5 max-md:overflow-x-auto md:flex-wrap" role="group" aria-label="Filter by type">
          {ALL_TYPES.filter((t) => present.has(t)).map((t) => (
            <Chip key={t} on={typeFilter === t} color={`var(--color-type-${t.toLowerCase()})`} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>{t}</Chip>
          ))}
        </div>
      </div>

      {rows === null ? <p className="text-sm text-muted">Loading moves…</p> : isMobile ? (
        <ul className="space-y-1" aria-label="Legal moves">
          {list.map((r) => (
            <li key={r.id} className="flex items-stretch gap-1">
              <button
                type="button"
                disabled={full}
                onClick={() => add(r.name)}
                className={`focus-ring min-h-12 min-w-0 flex-1 rounded-lg border-2 bg-panel-inset px-2 py-1 text-left disabled:opacity-60 ${r.stab ? 'border-poke-yellow-dark' : 'border-transparent'}`}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}{r.stab && <span className="ml-1.5 rounded bg-poke-yellow px-1 align-middle text-[10px] font-extrabold text-cream-ink">STAB</span>}</span>
                  <TypePill type={r.type} size="xs" />
                  <CategoryIcon category={r.category} />
                </span>
                <span className="mt-0.5 flex gap-3">
                  <Stat label="Pow" value={powerText(r)} />
                  <Stat label="Acc" value={accText(r)} />
                  <Stat label="PP" value={String(r.maxPp)} />
                </span>
                <span className="block text-xs text-muted">{r.shortDesc}</span>
              </button>
              <GameButton variant="ghost" size="sm" onClick={() => setSheet(r)} aria-label={`Details for ${r.name}`} className="min-h-12 min-w-14">Info</GameButton>
            </li>
          ))}
          {!list.length && <li className="py-3 text-center text-sm text-muted">No legal move matches.</li>}
        </ul>
      ) : (
        <div className="max-h-[30rem] overflow-y-auto rounded-lg border-2 border-edge bg-panel-inset">
          <table className="w-full border-collapse text-sm" aria-label="Legal moves">
            <thead>
              <tr>
                {head('name', 'Move')}
                {head('type', 'Type')}
                {head('category', 'Cat.', 'text-center')}
                {head('power', 'Pow.', 'text-right')}
                {head('accuracy', 'Acc.', 'text-right')}
                {head('pp', 'PP', 'text-right')}
                {head('effect', 'Effect')}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const expanded = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => !full && add(r.name)}
                      className={`border-t border-edge/60 ${full ? '' : 'cursor-pointer hover:bg-panel-hi'} ${r.stab ? 'shadow-[inset_3px_0_0_var(--color-poke-yellow)]' : ''}`}
                    >
                      <td className="px-2 py-1 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? 'Hide' : 'Show'} details for ${r.name}`}
                            onClick={(e) => { e.stopPropagation(); setOpen(expanded ? null : r.id); }}
                            className="focus-ring -ml-1 w-5 shrink-0 rounded text-muted hover:text-ink"
                          >
                            {expanded ? '▾' : '▸'}
                          </button>
                          <button
                            type="button"
                            disabled={full}
                            onClick={(e) => { e.stopPropagation(); add(r.name); }}
                            className="focus-ring rounded text-left disabled:cursor-default"
                            aria-label={`Add ${r.name}`}
                          >
                            {r.name}
                          </button>
                          {r.stab && <span className="rounded bg-poke-yellow px-1 text-[10px] font-extrabold text-cream-ink" title="Same-type attack bonus">STAB</span>}
                        </span>
                      </td>
                      <td className="px-2 py-1"><TypePill type={r.type} size="xs" /></td>
                      <td className="px-2 py-1 text-center"><CategoryIcon category={r.category} /></td>
                      <td className="px-2 py-1 text-right tabular-nums">{powerText(r)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{accText(r)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.maxPp}</td>
                      <td className="px-2 py-1 text-xs text-muted">{r.shortDesc}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-panel">
                        <td colSpan={7} className="px-3 py-2"><MoveDetails row={r} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!list.length && <tr><td colSpan={7} className="py-4 text-center text-sm text-muted">No legal move matches.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {rows !== null && <p className="text-xs text-muted">{list.length} of {rows.length} legal moves shown. PP is what a battle starts with (full PP Ups).</p>}

      {sheet && (
        <ResponsiveDialog
          title={sheet.name}
          onClose={() => setSheet(null)}
          footer={(
            <>
              <GameButton variant="ghost" onClick={() => setSheet(null)}>Close</GameButton>
              <GameButton disabled={full || taken.has(sheet.name.toLowerCase())} onClick={() => { add(sheet.name); setSheet(null); }}>Add to set</GameButton>
            </>
          )}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TypePill type={sheet.type} size="sm" />
            <CategoryIcon category={sheet.category} />
            <span className="text-sm text-muted">{sheet.category}</span>
            {sheet.stab && <span className="rounded bg-poke-yellow px-1 text-[10px] font-extrabold text-cream-ink">STAB</span>}
          </div>
          <div className="mb-2 flex gap-4">
            <Stat label="Power" value={powerText(sheet)} />
            <Stat label="Accuracy" value={accText(sheet)} />
            <Stat label="PP" value={String(sheet.maxPp)} />
          </div>
          <MoveDetails row={sheet} />
        </ResponsiveDialog>
      )}
    </div>
  );
}
