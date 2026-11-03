import { useState } from 'react';
import { useGame } from '../store/useGame';
import { useSettings } from '../store/settings';
import { exportAnalyticsJson } from '../analytics/exportAnalytics';
import { APP_VERSION, REPO_URL } from '../app/version';
import { BugReport } from '../components/BugReport';
import { NicknameField } from '../components/DailyBits';
import { apiEnabled, apiHost } from '../game/api';
import { DialogueBox, GameButton, ResponsiveDialog, Panel, PokeSprite, Segmented } from '../components/ui';

export function SettingsScreen() {
  const closeOverlay = useGame((s) => s.closeOverlay);
  const exportSave = useGame((s) => s.exportSave);
  const clearSave = useGame((s) => s.clearSave);
  const run = useGame((s) => s.run);
  const hasSave = useGame((s) => s.hasSave);
  const hasDaily = useGame((s) => s.hasDaily);
  const spriteSet = useSettings((s) => s.spriteSet);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const battleEffects = useSettings((s) => s.battleEffects);
  const sound = useSettings((s) => s.sound);
  const shareRuns = useSettings((s) => s.shareRuns);
  const update = useSettings((s) => s.update);
  // Clear save acts on the active run's slot (the league slot when no run is loaded).
  const clearsDaily = run?.daily !== undefined;
  const canClear = clearsDaily ? hasDaily : hasSave;
  const clearLabel = clearsDaily ? 'Delete daily run' : 'Delete league';
  const [confirm, setConfirm] = useState(false);
  const [bug, setBug] = useState(false);
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
      <Panel title="Battle">
        <div className="space-y-2">
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-poke-yellow" checked={battleEffects} onChange={(e) => update({ battleEffects: e.target.checked })} />
            Attack effects (hits, beams, Tera flashes over the field)
          </label>
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-poke-yellow" checked={sound} onChange={(e) => update({ sound: e.target.checked })} />
            Sound (cries and battle effects)
          </label>
        </div>
      </Panel>
      <Panel title="Motion">
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-poke-yellow" checked={reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
          Reduce motion (no draft animation, no pulsing, no attack effects)
        </label>
      </Panel>
      <Panel title="Save data">
        <p className="mb-3 text-sm text-muted">Your run saves in this browser after every change.</p>
        <div className="flex flex-wrap gap-2">
          <GameButton variant="secondary" disabled={!run && !hasSave} onClick={exportSave}>Export save</GameButton>
          <GameButton variant="secondary" disabled={!run} onClick={() => run && exportAnalyticsJson(run)}>Export analytics JSON</GameButton>
          <GameButton variant="danger" disabled={!canClear} onClick={() => setConfirm(true)}>{clearLabel}</GameButton>
        </div>
      </Panel>
      <Panel title="Online">
        <div className="space-y-3">
          <NicknameField hint="Shown on the daily leaderboard." />
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-poke-yellow" checked={shareRuns} onChange={(e) => update({ shareRuns: e.target.checked })} />
            Share anonymous run results (helps balance the game: league settings, result and score; never your battles or name)
          </label>
          <p className="text-sm text-muted">
            {apiEnabled() ? `Leaderboard: connected to ${apiHost()}` : 'Leaderboard: not configured in this build'}
          </p>
        </div>
      </Panel>
      <Panel title="About">
        <p className="font-semibold">{APP_VERSION.label}</p>
        <p className="mb-3 text-sm text-muted">
          Early build: expect rough edges, and your save may not survive an update. Built {APP_VERSION.builtAt}.
        </p>
        <div className="flex flex-wrap gap-2">
          <GameButton variant="secondary" onClick={() => setBug(true)}>Report a bug</GameButton>
          <a className="game-btn btn-ghost px-4 py-2 text-base" href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </Panel>
      {bug && <BugReport onClose={() => setBug(false)} />}
      {confirm && (
        <ResponsiveDialog
          title={clearsDaily ? 'Delete daily run?' : 'Delete league?'}
          onClose={() => setConfirm(false)}
          footer={<><GameButton variant="ghost" onClick={() => setConfirm(false)}>Keep it</GameButton><GameButton variant="danger" onClick={() => { clearSave(); setConfirm(false); }}>{clearLabel}</GameButton></>}
        >
          <DialogueBox>
            {clearsDaily
              ? 'This deletes your daily run for good. Your league save is not touched.'
              : 'This deletes your current league for good. Export it first if you might want it back.'}
          </DialogueBox>
        </ResponsiveDialog>
      )}
    </div>
  );
}
