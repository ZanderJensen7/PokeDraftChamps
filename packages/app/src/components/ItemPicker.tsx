// Held-item picker: a button showing the current item and its effect, opening a searchable list (common competitive
// items first, then every item) with each item's one-line effect.
import { useMemo, useState } from 'react';
import { GameButton, ItemIcon, ResponsiveDialog } from './ui';
import { itemShortDesc, pickableItems } from '../game/sets';

export function ItemPicker({ value, onChange }: { value: string; onChange: (item: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => pickableItems(), []);
  const q = query.trim().toLowerCase();
  const match = (n: string) => !q || n.toLowerCase().includes(q) || itemShortDesc(n).toLowerCase().includes(q);
  const common = groups.common.filter(match);
  const rest = groups.rest.filter((n) => match(n) && !groups.common.includes(n));
  const pick = (item: string) => { onChange(item); setOpen(false); setQuery(''); };

  const row = (name: string) => (
    <li key={name}>
      <button
        type="button"
        onClick={() => pick(name)}
        aria-current={name === value}
        className={`focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg border-2 bg-panel-inset px-2 py-1 text-left hover:border-edge ${name === value ? 'border-poke-yellow' : 'border-transparent'}`}
      >
        <ItemIcon name={name} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{name}</span>
          <span className="block text-xs text-muted">{itemShortDesc(name)}</span>
        </span>
      </button>
    </li>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Item: ${value || 'none'}. Change item`}
        className="focus-ring field flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {value && <ItemIcon name={value} />}
        <span className="min-w-0 flex-1 truncate">{value || 'No item'}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && (
        <ResponsiveDialog
          title="Pick an item"
          onClose={() => { setOpen(false); setQuery(''); }}
          full
          wide
          footer={<GameButton variant="ghost" onClick={() => pick('')}>No item</GameButton>}
        >
          <input
            autoFocus
            type="search"
            className="field mb-2 w-full"
            placeholder="Search items by name or effect"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search items"
          />
          <div className="max-h-[55vh] space-y-2 overflow-y-auto" aria-label="Items">
            {common.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Common</h3>
                <ul className="space-y-1">{common.map(row)}</ul>
              </section>
            )}
            {rest.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">All items</h3>
                <ul className="space-y-1">{rest.map(row)}</ul>
              </section>
            )}
            {!common.length && !rest.length && <p className="py-3 text-center text-sm text-muted">No item matches.</p>}
          </div>
        </ResponsiveDialog>
      )}
    </>
  );
}
