# PokeDraftChamps — CLAUDE.md

Free, solo, roguelike Pokemon draft league in the browser (PokeRogue-style: static site, no accounts, never
monetized; no server the game needs to run: the optional `packages/api` Worker only takes what the player
sends on purpose). Design source of truth: `docs/DESIGN.md`
(roguelike / meta layer: `docs/ROGUELIKE.md`). Decisions log: `docs/DECISIONS.md`.

## Stack
- npm workspaces. `packages/engine` (pure TypeScript, no DOM, vitest) and `packages/app` (Vite + React 19 +
  Tailwind 4 + Zustand). Node 24. TypeScript ~5.9 (not 7).
- Pokemon: `@pkmn/sim` (battles, runs in the browser: verified 2026-11-02, ~50 ms per AI battle),
  `@pkmn/dex` + `@pkmn/data` (Gen 9 data, learnsets), `@smogon/calc` (damage), `@pkmn/randoms`
  (509 species with role-based sets: the AI's set source and the draft pool filter), `@pkmn/sets`
  (team import/export), `@pkmn/img` (sprites). All MIT. The Showdown client is AGPL: never copy its code.
- Commands: `npm run dev` (app on :5173), `npm test` (engine), `npm run typecheck`, `npm run build`,
  `npm run bump -- patch|minor|major` (bumps every package.json + lockfile, dates the Unreleased section of
  `CHANGELOG.md`; then commit and `git tag vX.Y.Z`). Player-visible changes get a line under Unreleased.

## Engine layout (`packages/engine/src/`)
- Engine entries: `@pdc/engine` (`src/index.ts`) is sim-free (@pkmn/dex/@pkmn/data only) so the app's first load
  stays small; `@pdc/engine/battle` (`src/battle/index.ts`, plus `game.ts`'s `buildSets`/`engineDeps`) holds
  everything that loads @pkmn/sim / @pkmn/randoms / @smogon/calc, and the app imports it lazily. `entries.test.ts`
  fails if the main entry reaches the sim. The randoms species table is precomputed into `data/randomsSets.json`:
  after bumping @pkmn/randoms run `npm run gen:randoms -w @pdc/engine` (`data/randomsData.test.ts` fails while stale).
- `types.ts` — shared types; every module imports from it, it imports nothing.
- `data/` — point prices by tier, bans, AI coach identities, the precomputed randoms species table.
- `setText.ts` / `setImport.ts` / `spreads.ts` — Showdown text for sets (export; roster import = parse, match, validate; `fillSet`), the role EV table (`spreadFor`, `SPREAD_PRESETS`); `prep/sampleSets.ts` — Smogon sample sets via `@pkmn/smogon` (lazy, fetched from data.pkmn.cc, fails soft) plus the randoms role sets. All sim-free.
- `forms.ts` — Mega / Z-Crystal helpers (`megaInfo`, `battleSpeciesId`, `zCrystalFor`); `logs/` — Showdown
  protocol helpers + `scoutFromLogs` (both sim-free).
- `draft/` — draft pool (Dex ∩ randoms sets − bans), snake draft, AI drafting.
- `league/` — seeded rng, schedule, standings, playoffs, `run.ts` (the RunState + transitions; battle
  functions are INJECTED as `deps` so league stays pure and testable), `daily.ts` (one seed + config per UTC
  date), `summary.ts` (`runScore` from the `DAILY_SCORE` table, `summarizeRun` -> `RunSummary`, `shareString`).
- `battle/` — set building from randoms roles, battle runner over `BattleStreams`, `HeuristicPlayer`
  (damage-calc driven AI), lineup choice (bring 6), `simulateMatch`, battle view over the live log.
- `prep/` — the prep doc: type matchup table + STAB/Weak scores, speed tiers, notable moves by category,
  likely sets, threat summary.
- App battle UI (`packages/app/src`): `battle/battleView.ts` reduces the live log into per-mon view state
  (hp, status, boosts, revealed moves/item/ability); `battle/narrate.ts` `parseLog` turns protocol lines into
  typed Showdown-style log entries for `components/battle/BattleLog.tsx`; `battle/monInfo.ts` builds the
  hover-card data (seen / scouted / likely moves, speed tiers vs your active mon) for
  `components/battle/MonHoverCard.tsx`. The engine's `MatchResult.log` stays raw protocol.
- Attack effects: `battle/vfx.ts` (pure: protocol line -> `FxEvent`, plus the shape / type / weather / status
  tables), `battle/fxCanvas.ts` (the particle stage: six shape templates, glyph drawing, overlays),
  `battle/sound.ts` (synthesized per-type and per-event blips, Showdown-hosted cries), `components/battle/FxLayer.tsx`
  (the canvas inside `.battle-field`; sprites to hit carry `data-fx="p1|p2"`). Effects never move a sprite beyond
  the hit shudder (user ruling); Showdown / PokeRogue animation code is AGPL, so all of it is our own.
- Persistent field effects (drawn for as long as they last, from the battle view not the log): `battle/fieldFx.ts`
  (pure: `fieldState(view)` -> weather / terrain / Trick Room / per-side screens, Tailwind, hazards / per-mon
  volatiles, the `FIELD_LOOKS` table, `FIELD_SLOTS` / `activeSlots`; the view tracks `MonView.volatiles` for
  `TRACKED_VOLATILES`), `battle/fieldCanvas.ts` (`FieldPainter`: fades slots in and out, draws each style under the
  one-shot particles, allocation-free per frame; modes off / static (reduced motion) / full), `battle/glyphs.ts`
  (shared glyph drawing). Platforms carry `data-fx-ground="p1|p2"`; a Substitute dims its sprite with `.fx-subbed`.

- App build stamp + bug reports: `packages/app/src/app/version.ts` (`APP_VERSION`, values injected by `define` in `vite.config.ts` via `scripts/build-stamp.mjs`; versions move together through `npm run bump`), shown as the `VersionBadge` corner string in `App.tsx`, on the title screen and in Settings About; `src/app/errorLog.ts` (last 5 uncaught errors), `src/components/BugReport.tsx` (prefilled GitHub issue / copy, never auto-sends); template in `.github/ISSUE_TEMPLATE/`.

## Online (`packages/api`, optional)
- Cloudflare Worker + KV: `GET/POST /daily/:date` (leaderboard, client-reported scores, one entry per run id),
  `POST /runs` (opt-in `RunSummary` upload, counters at `GET /runs/stats`). The app client is
  `app/src/game/api.ts`; URL from `VITE_PDC_API_URL`, page-view beacon from `VITE_CF_BEACON_TOKEN`
  (`app/.env.example`; GitHub Actions variables `PDC_API_URL` / `CF_BEACON_TOKEN`). Nothing leaves the browser
  unless the player posts a score or turns on Settings > Online > share run results (default off).
- Saves: the league in `pdc.run.v1`, the daily run in `pdc.daily.v1` (one attempt per UTC day).

## Rules of the house
- Pure functions, seeded randomness (`league/rng.ts`, sim seeds), JSON-friendly state (arrays, not Set/Map)
  so saves and the worker boundary stay trivial.
- Battles for the league (AI vs AI) run in a Web Worker; the human's battle runs on the main thread via
  `createInteractiveBattle`.
- Only Tera captains may Terastallize: enforced in the player layer, not the sim.
- One data table per tunable system (prices, move categories, EV spreads by role). Tests assert
  invariants, not specific values.
- No speculative abstraction; one concrete type until a second consumer exists.
- Store every battle log (`MatchResult.log`); replays and scouting both read it.

## Tools
- Subagents: never on Fable; sonnet for mechanical work, opus for AI/algorithms/cross-cutting.
  Hand them the API facts inline; they grep `.d.ts` files, never read node_modules end to end.
- Browser check: `npm run dev` then open http://localhost:5173 in the built-in browser.
