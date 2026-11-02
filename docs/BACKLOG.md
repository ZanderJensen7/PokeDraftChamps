# Backlog / work queue

Status: TODO · RUNNING · DONE. Keep this short; details live in the job reports and DESIGN.md.

## Now (v0.1 vertical slice)
1. DONE — Repo, workspaces, design doc, shared types, browser sim verified (2026-11-02).
2. DONE — Engine: league core (data / draft / league), 28 tests.
3. DONE — Engine: prep doc (type table, speed tiers, moves, likely sets, threat summary), 11 tests.
4. DONE — Engine: battle layer (17 tests; AI 19/20 vs random, 52 ms per battle) (sets from randoms roles, runner, HeuristicPlayer, lineup, scout, simulateMatch).
5. RUNNING — App job 1: Pokemon-style shell + every screen except the live battle (title, league setup,
   draft, season hub, prep doc, team/set editor, week recap, playoffs, champion/eliminated), Zustand store,
   localStorage save + JSON export/import. All battle calls go through ONE seam, `src/game/bridge.ts`,
   with a placeholder that fakes results so the loop is playable end to end.
6. DONE — Engine facade (`engine/src/game.ts`, `engineDeps`); `resolveWeek` is async (2026-11-02).
7. DONE — App job 2: live battle screen (game layout per UI_STYLE.md) on `createInteractiveBattle`, league
   simulation in a Web Worker, replace the bridge placeholder, store logs on every match.
8. DONE — Engine: Megas / Tera / Z league options (config, pool, prices, draft rule, captains; battle sets, AI mega/Z use, scouting fold). 83 tests.
9. DONE — App: setup toggles + presets, captain pickers, MEGA/Z buttons, 3D sprite default, small fixes.
10. DONE — Play-test 2026-11-02: three headless full leagues (8/16/12 teams, Megas+Z, Tera off) ran season → loss cap / playoffs cleanly with logs on every match (16-team season sims in ~2 s, save ~0.5 MB); browser pass through hub → prep → lead pick → live battle with MEGA. Open polish from it listed under Next.

11. DONE — Performance analytics: engine/src/stats (per-mon stats from logs, aggregates, score, price
    suggestions), balance lab script (docs/balance), app Analytics screen + end-screen MVPs + JSON export.

12. DONE — Mobile pass: bottom nav, draft Pool/Board tabs, prep + battle phone layouts, tables → cards,
    installable PWA (manifest, icons, service worker with sprite cache).

13. DONE — Draft helper (engine 103 tests; MY TEAM panel + FIT badges + pick impact, desktop and phone) (user ask 2026-11-02): engine prep/draftHelper (teamNeeds, pickImpact, rankPool) now;
    then a MY TEAM panel on the draft screen (resistances + STAB/Weak, speed tiers, role coverage, plain-sentence
    needs) and a "what this adds" line + fit badge on pool cards, with a "Sort by fit" option.

## Next
- Draft helper follow-ups: FIT badge uses the quick score (roles excluded) while the hover note uses the full one;
  hover popover covers the next card row; resistances table scrolls sideways in the narrow rail.
- Mobile follow-ups from the pass: prove home-screen install on a real phone / desktop Chrome (service worker
  did not register in the test pane); landscape battle HP boxes overlap the sprites; lineup reorder on phones
  is tap-to-swap (no drag); AI-pick ticker lags the header during the draft animation.
- DONE 2026-11-02: Mega Mewtwo X/Y banned (`BANNED_MEGAS`); see DECISIONS. Rerun the lab with Megas on to
  find the next outlier now that the top is gone.
- Lab findings 2026-11-02 (40 leagues, 12 teams, Megas): fit score = 41.9 + 0.66 x price, i.e. tier price
  barely predicts performance under the current AI; candidates up: Electrode, Tauros-Paldea forms, Passimian,
  Araquanid, Inteleon, Iron Hands/Boulder; down: Quagsire, Chi-Yu, Mega Charizard Y, Mega Diancie, Mega Glalie,
  Talonflame, Zoroark-Hisui. Treat as AI-vs-AI evidence (the AI never plays stall), rerun after AI tuning.
- Price overrides table: once the balance lab has thousands of games, add a per-species override layer on top
  of POINTS_BY_TIER (data table, shrink/grow by evidence) and re-run the lab to confirm scores flatten by price.
- Polish from the first play-test: a Mega shows its base name in the lead picker / after fainting (map by
  roster id); weather label prints raw ids ("SunnyDay"); export writes a Tera Type line for non-captains;
  loss cap 4 vs equal-strength AI eliminates most runs (tune AI difficulty tiers or default cap once humans play).
- First commit + push → GitHub Pages live (repo creation pending the user's gh login).
- Startup bundle: a 10 MB engine chunk still preloads because the draft pool / sets / scouting read data through
  @pkmn/sim and @pkmn/randoms (randoms depends on the sim). Fix: precompute the randoms species-id list into
  a small JSON in engine/src/data, read species via @pkmn/dex only, and dynamic-import the sim + randoms in
  sets.ts / simulateMatch so only finishDraft and battles pay for them. Target < 1 MB before the first battle.
- Showdown look: default sprite set `ani` (3D-model animated sprites, front + back) with `gen5ani` pixel as
  the option; larger battle sprites; Gen 9 mons fall back automatically via @pkmn/img. One-line setting change
  plus layout sizing (user ruling 2026-11-02: match the Showdown Champs NatDex look).
- Battle animations, tier 1: template system keyed by move type x shape (contact / projectile / beam / self /
  status / field) + universal beats (lunge, shake, flash, HP drain, faint fade, Tera/Mega flash), own code
  (Showdown + PokeRogue animation code is AGPL), cries on switch-in/faint, type-to-SFX table. 2-4 days.
  Tier 2 (bespoke top-100 moves) only if replay/watch time proves worth it.
- Draft AI quality pass (role coverage, not overpaying), battle AI strength tuning (measure vs random and
  vs itself across seeds), prep threat summary wording.
- Replay viewer for stored logs (watch any league match).
- Roguelike layer beyond free agency: perks / relics between weeks, league modifiers.
- Human set editor polish: Showdown text import/export (`@pkmn/sets`), sample sets from `@pkmn/smogon`.
- Formats: Champs NatDex (Megas, Z), other gens; doubles never.
- Optional bring-your-own-key LLM opponent mode.
- Deploy: GitHub Pages / Cloudflare Pages static build.
