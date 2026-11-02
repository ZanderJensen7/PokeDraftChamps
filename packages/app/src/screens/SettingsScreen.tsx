import { useState } from 'react';
import { useGame } from '../store/useGame';
import { useSettings } from '../store/settings';
import { exportAnalyticsJson } from '../analytics/exportAnalytics';
import { DialogueBox, GameButton, ResponsiveDialog, Panel, PokeSprite, Segmented } from '../components/ui';

export function SettingsScreen() {
  const closeOverlay = useGame((s) => s.closeOverlay);
  const exportSave = useGame((s) => s.exportSave);
  const clearSave = useGame((s) => s.clearSave);
  const run = useGame((s) => s.run);
  const hasSave = useGame((s) => s.hasSave);
  const spriteSet = useSettings((s) => s.spriteSet);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const update = useSettings((s) => s.update);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="title-band flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold uppercase leading-none">Settings</h1>
        <GameButton variant="ghost" size="sm" onClick={closeOverlay}>Done</GameButton>
      </div>
      <Panel title="Sprites">
        <Segmented
          label="Sprite set"
          value={spriteSet}
          onChange={(v) => update({ spriteSet: v })}
          options={[
            { value: 'ani', label: '3D', sub: 'Showdown models' },
            { value: 'gen5ani', label: 'Pixel', sub: 'Gen 5 style' },
          ]}
        />
        <div className="mt-3 flex justify-center gap-2"><PokeSprite name="Garchomp" size={96} /><PokeSprite name="Ceruledge" size={96} /></div>
      </Panel>
      <Panel title="Motion">
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-poke-yellow" checked={reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
          Reduce motion (no draft animation, no pulsing)
        </label>
      </Panel>
      <Panel title="Save data">
        <p className="mb-3 text-sm text-muted">Your run saves in this browser after every change.</p>
        <div className="flex flex-wrap gap-2">
          <GameButton variant="secondary" disabled={!hasSave} onClick={exportSave}>Export save</GameButton>
          <GameButton variant="secondary" disabled={!run} onClick={() => run && exportAnalyticsJson(run)}>Export analytics JSON</GameButton>
          <GameButton variant="danger" disabled={!hasSave} onClick={() => setConfirm(true)}>Clear save</GameButton>
        </div>
      </Panel>
      {confirm && (
        <ResponsiveDialog
          title="Clear save?"
          onClose={() => setConfirm(false)}
          footer={<><GameButton variant="ghost" onClick={() => setConfirm(false)}>Keep it</GameButton><GameButton variant="danger" onClick={() => { clearSave(); setConfirm(false); }}>Delete run</GameButton></>}
        >
          <DialogueBox>This deletes your current league for good. Export it first if you might want it back.</DialogueBox>
        </ResponsiveDialog>
      )}
    </div>
  );
}
