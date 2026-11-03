# Changelog

Semantic versioning while in 0.x: a minor bump for new things the player sees, a patch bump for fixes and
tuning. `npm run bump -- minor|patch` moves the Unreleased notes below into a dated version section and bumps
every package.json. The build stamp shows the version and short commit in the corner of every screen.

## Unreleased

- Daily League: one seeded league per UTC day (8 coaches, 7 weeks, top 4), the same AI picks for everyone, one
  attempt, a score and a share line on the run-end screen, and a leaderboard when the build has a backend.
- Settings > Online: a nickname for the leaderboard and an off-by-default switch to share anonymous run
  results (settings, result, score; never battles or names).
- Backend (`packages/api`): a Cloudflare Worker for the daily leaderboard and the opt-in run summaries, plus
  an optional cookieless page-view beacon. Neither is needed to play.
- Stakes: ten difficulty levels on the setup screen, one added rule each (loss cap, smarter AI drafts, no
  Likely sets tab, +5 AI budget, fog of war, smaller playoffs, drafting last); winning the title at a stake
  unlocks the next.

## v0.3.1 — 2026-11-02

- Mons without a 3D model on Showdown (Iron Valiant, Iron Hands, Iron Moth, Iron Thorns, Miraidon, Terapagos,
  Dialga-Origin) use their animated pixel sprite as the opponent instead of a still image.

## v0.3.0 — 2026-11-02

- Attack effects over the battle field: every move drawn by shape and type, hit flash and shudder, field
  shake on crits and super-effective hits, Tera / Mega / Z flashes, cries and synthesized sound effects.
  Settings toggles for effects and sound.
- Tiny version string in the corner of every screen; `npm run bump` versioning with this changelog.
- Build stamp (version, commit, build day) on the title screen and in Settings; Report a bug dialog that
  prefills a GitHub issue.

## v0.2.0 — 2026-11-02

- Lighter first load: the simulator loads on first use.
- Roster range (9 to 11 by default) and a captain price cap as league settings.
- Showdown-style battle log, open by default, and hover cards on every battle sprite.
- Megas, Tera and Z as league options; Mega Mewtwo X and Y banned.
- Draft helper, performance analytics, balance lab, mobile layouts and installable PWA.

## v0.1.0 — 2026-11-02

- First playable: draft, 9-week season against AI coaches with a prep doc per opponent, top-8 bracket,
  champion screen; runs end on the loss cap, a missed playoff spot or a playoff loss.
