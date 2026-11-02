# PokeDraftChamps — CLAUDE.md

Free, solo, roguelike Pokemon draft league in the browser (PokeRogue-style: static site, no backend,
no accounts, never monetized). Design source of truth: `docs/DESIGN.md`. Decisions log: `docs/DECISIONS.md`.

## Stack
- npm workspaces. `packages/engine` (pure TypeScript, no DOM, vitest) and `packages/app` (Vite + React 19 +
  Tailwind 4 + Zustand). Node 24. TypeScript ~5.9 (not 7).
- Pokemon: `@pkmn/sim` (battles, runs in the browser: verified 2026-11-02, ~50 ms per AI battle),
  `@pkmn/dex` + `@pkmn/data` (Gen 9 data, learnsets), `@smogon/calc` (damage), `@pkmn/randoms`
  (509 species with role-based sets: the AI's set source and the draft pool filter), `@pkmn/sets`
  (team import/export), `@pkmn/img` (sprites). All MIT. The Showdown client is AGPL: never copy its code.
- Commands: `npm run dev` (app on :5173), `npm test` (engine), `npm run typecheck`, `npm run build`.

## Engine layout (`packages/engine/src/`)
- Engine entries: `@pdc/engine` (`src/index.ts`) is sim-free (@pkmn/dex/@pkmn/data only) so the app's first load
  stays small; `@pdc/engine/battle` (`src/battle/index.ts`, plus `game.ts`'s `buildSets`/`engineDeps`) holds
  everything that loads @pkmn/sim / @pkmn/randoms / @smogon/calc, and the app imports it lazily. `entries.test.ts`
  fails if the main entry reaches the sim. The randoms species table is precomputed into `data/randomsSets.json`:
  after bumping @pkmn/randoms run `npm run gen:randoms -w @pdc/engine` (`data/randomsData.test.ts` fails while stale).
- `types.ts` — shared types; every module imports from it, it imports nothing.
- `data/` — point prices by tier, bans, AI coach identities, the precomputed randoms species table.
- `forms.ts` — Mega / Z-Crystal helpers (`megaInfo`, `battleSpeciesId`, `zCrystalFor`); `logs/` — Showdown
  protocol helpers + `scoutFromLogs` (both sim-free).
- `draft/` — draft pool (Dex ∩ randoms sets − bans), snake draft, AI drafting.
- `league/` — seeded rng, schedule, standings, playoffs, `run.ts` (the RunState + transitions; battle
  functions are INJECTED as `deps` so league stays pure and testable).
- `battle/` — set building from randoms roles, battle runner over `BattleStreams`, `HeuristicPlayer`
  (damage-calc driven AI), lineup choice (bring 6), `simulateMatch`, battle view over the live log.
- `prep/` — the prep doc: type matchup table + STAB/Weak scores, speed tiers, notable moves by category,
  likely sets, threat summary.
- App battle UI (`packages/app/src`): `battle/battleView.ts` reduces the live log into per-mon view state
  (hp, status, boosts, revealed moves/item/ability); `battle/narrate.ts` `parseLog` turns protocol lines into
  typed Showdown-style log entries for `components/battle/BattleLog.tsx`; `battle/monInfo.ts` builds the
  hover-card data (seen / scouted / likely moves, speed tiers vs your active mon) for
  `components/battle/MonHoverCard.tsx`. The engine's `MatchResult.log` stays raw protocol.

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
