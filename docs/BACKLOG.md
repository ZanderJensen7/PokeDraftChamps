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
- User notes 2026-11-02 (evening):
  - Draft: a toggle for the draft recommendations (FIT badges, needs panel); no fit score before the first pick
    (nothing to fit yet). Keep the line between hand-holding and the prep/draft being part of the fun.
  - League setup: options for the number of free-agency moves and the total point budget (tier prices unchanged).
  - Mobile: the "what everyone drafted" view is rough, it cannot scroll all the way.
  - Traffic: a way to see how many people play (privacy-respecting analytics on the static site; decide what, see
    DECISIONS on no telemetry leaving the browser without opt-in).
- Roster range follow-ups (2026-11-02): free agency is still drop-one/add-one, so a coach under `rosterMax`
  cannot pick up a mon without dropping one; decide whether to allow a plain add (counts as a move, within
  budget). The AI may also end a little below its rolled aim when its budget runs thin after the minimum.
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
- DONE 2026-11-02: polish from the first play-test. A Mega pick goes by its Mega name in the lead picker, bench,
  HP box and the log's switch / faint lines (`session.ts` maps each protocol nickname to the roster entry by
  roster id, `narrate` and the battle screen read the map); weather / terrain chips and log lines use the
  `battle/conditions.ts` name table ("Sun", never "SunnyDay"); the Showdown export (`exportSetText`, engine,
  tested) writes a Tera Type line only for Tera captains. Still open from that play-test: loss cap 4 vs
  equal-strength AI eliminates most runs (tune AI difficulty tiers or default cap once humans play).
- DONE 2026-11-02: first commit pushed, live at https://zanderjensen7.github.io/PokeDraftChamps/ (service worker registers there, so the PWA install gap from the mobile pass is half proven; home-screen install on a phone still unchecked).
- DONE 2026-11-02: startup bundle. The engine has two entries: `@pdc/engine` (sim-free: draft, league, prep, stats,
  scouting, form helpers over @pkmn/dex + a checked-in randoms JSON) and `@pdc/engine/battle` (sim, randoms, calc,
  set builder, `engineDeps`), loaded on first use (captain confirm / free agency / battle / worker). First load
  (index.html script + modulepreloads) went from 10.6 MB raw / 1.87 MB gzip (a 10.1 MB `src` chunk) to 2.57 MB raw /
  0.54 MB gzip; the largest preloaded chunk is now the 2.0 MB @pkmn/dex data (0.37 MB gzip). The sim sits in an
  8.2 MB lazy `battle` chunk + the 10.2 MB worker. Guard: `engine/src/entries.test.ts`.
- Sprites without a 3D model (2026-11-02): Showdown has none for 20 pool species (Future Paradox line, all Ogerpon
  forms, Dialga/Palkia-Origin, Miraidon, Terapagos, Pecharunt, Greninja-Bond). `spriteFor` in `ui/SpriteCard.tsx`
  falls back to the animated pixel front sprite where one exists (7 of them); the other 13 stay still images, and
  no animated backs exist for any of the 20. Recheck after bumping @pkmn/img.
- Showdown look: default sprite set `ani` (3D-model animated sprites, front + back) with `gen5ani` pixel as
  the option; larger battle sprites; Gen 9 mons fall back automatically via @pkmn/img. One-line setting change
  plus layout sizing (user ruling 2026-11-02: match the Showdown Champs NatDex look).
- DONE 2026-11-02: battle log restyle (user ask): open by default on desktop / tablet / landscape phones
  (`battleLogOpen` setting), typed entries from `app/src/battle/narrate.ts` `parseLog` rendered by
  `components/battle/BattleLog.tsx` in Showdown's shape (turn dividers, your names blue / theirs orange, exact HP
  for you and % for them, muted effect lines, Tera/Mega/Z pills, win banner), follow-while-at-bottom scroll with
  "Jump to latest". Seen in a live battle. Open: Tera/Mega pills never came up in the sample logs.
- DONE 2026-11-02: battle hover cards (user ask, "like Showdown's tooltips"): `components/battle/MonHoverCard.tsx`
  + pure `battle/monInfo.ts` over the per-mon reveal tracking in `battleView.ts`; your mons show set + PP,
  theirs show seen / scouted / likely moves, scouted item / ability / Tera, four speed tiers vs your active mon
  (boosts, para, Tailwind, Trick Room, Scarf applied) and base stats; hover on desktop, tap-sheet on phones.
  Seen on the bench at preview and on both active mons. Open: a hovered sprite that unmounts on a switch
  leaves the card up until Escape / scroll / next hover; bench mons show moves without PP (the request only
  carries PP for the active mon); the phone tap-sheet is unchecked by hand.
- DONE 2026-11-02: "Edit sets" button in the prep screen's lineup panel header (both layouts) opens the Team
  editor; discoverability note from the user not finding the set editor.
- DONE 2026-11-02: Early-build stamp (v0.2.0 · early build · short SHA, Vite `define`) on title, header and Settings About, plus an in-game "Report a bug" dialog that prefills a GitHub issue (never auto-sends) and a bug issue template.
- Roster range: the "Done drafting" button was not seen by hand (the test draft auto-finished at 9 with 1 point
  left); covered by run.test.ts. Check it in a league with points to spare.
- DONE 2026-11-02: attack effects (user ruling: no mon animation, the `ani` sprites already move; effects for the
  attacks only). `app/src/battle/vfx.ts` (pure) turns each narrated protocol line into an effect event with
  data tables for the shape per move (contact / projectile / beam / self / status / field from dex flags +
  `MOVE_SHAPE_OVERRIDES`), the glyph + color per type (`TYPE_FX`), and the type each weather / terrain / hazard /
  status / chip-damage source borrows; `fxCanvas.ts` draws them as particles and overlays on a canvas over the
  field (`components/battle/FxLayer.tsx`), with a white hit flash + small shudder on the sprite, field shake on
  crits / super-effective hits, Tera / Mega / Z-Power washes and glows, cries (Showdown audio host, like the
  sprites) on switch-in and faint, and synthesized Web Audio blips per type and event (`sound.ts`, no audio
  files). The move line gets its own 520 ms beat so the attack crosses before the HP drains; your HP number
  counts down with the bar. Settings: Attack effects, Sound; reduced motion turns the visuals off. Checked in
  the built-in browser by sampling the effect canvas (the pane was hidden, so animation frames were sparse):
  open: look at it live and tune sizes / sound levels by feel; the phone layout was not seen. Bespoke top-100
  move effects only if replay / watch time proves worth it.
- Draft AI quality pass (role coverage, not overpaying), battle AI strength tuning (measure vs random and
  vs itself across seeds), prep threat summary wording.
- Replay viewer for stored logs (watch any league match).
- Roguelike layer beyond free agency: designed in `docs/ROGUELIKE.md` (2026-11-02). Build order: stakes →
  career profile + run-end screen → perk beats + trades → pool progression → coach archetypes → daily +
  challenge leagues → mutator toggle → keepers / gauntlet. Daily leaderboard + opt-in analytics need the
  small backend described there (Cloudflare Worker first; page-view beacon can go in now).
- Human set editor polish: Showdown text import/export (`@pkmn/sets`), sample sets from `@pkmn/smogon`.
- Formats: Champs NatDex (Megas, Z), other gens; doubles never.
- Optional bring-your-own-key LLM opponent mode.
- Deploy: GitHub Pages / Cloudflare Pages static build.
