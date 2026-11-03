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

## Next (the queue, top first)
Each line is one job. Sessions are started from the top; three at a time at most, never two on the same files.

1. **Stakes (ascension).** `docs/ROGUELIKE.md`. `LeagueConfig.stake` + a `STAKES` data table of one added rule
   per level; AI difficulty knobs in `battle/heuristicPlayer.ts` (switch on predicted KOs) and `draft/draft.ts`
   `aiChoosePick` (fit scoring via `prep/draftHelper`); loss cap, AI budget, prep-doc gating, playoff size;
   stake picker on the setup screen; win at N unlocks N+1 in a profile store. Also answers "loss cap 4 vs
   equal-strength AI eliminates most runs".
   SHIPPED 2026-11-02 (branch `claude/stakes-85a96b`): `data/stakes.ts` (10 levels), `applyStake`, save v4,
   `DraftState.budgets`, fit-scored AI picks, `visibleRoster` fog, `pdc.profile.v1`, setup Stake panel, top bar /
   end screen. Stake 4 is now "AI knows your sets" (`PlayerContext.opponentSets`): 116/200 and 118/200 wins vs
   the default AI, against 96/200 and 104/200 for identical AIs (the first stake 4, switch on predicted KOs,
   measured ~50% and was removed). Season weeks default to min(coaches − 1, 9). The prep threat summary says
   "roster unknown under fog of war" for an empty fogged roster; `docs/ROGUELIKE.md` matches the shipped
   ladder. Open: fog during the draft screen (all AI picks still shown; the mobile session owns that file);
   `exportSave` leaves the profile out (item 6 covers profile export); with a partly scouted roster the threat
   summary still reads absences ("opp has no hazard removal") from the mons seen so far.
2. **Battle polish bundle.** SHIPPED 2026-11-02 (branch `claude/reverent-mirzakhani-692141`, see the done log). A Mega shows its base name in the lead picker / after fainting (map by roster id);
   weather label prints raw ids ("SunnyDay"); export writes a Tera Type line for non-captains.
3. **Mobile bundle.** SHIPPED 2026-11-02 except the real-phone install check (see the done log). The "what everyone drafted" view cannot scroll all the way; landscape battle HP boxes
   overlap the sprites; lineup reorder on phones is tap-to-swap (no drag); AI-pick ticker lags the header during
   the draft animation; prove home-screen install on a real phone.
4. **Setup + draft options (user notes).** SHIPPED 2026-11-02 (branch `claude/setup-options-b227b9`): budget slider
   (step 5, floor = `minBudget(rosterMin, megas)` rounded up, max 200) and free-agency stepper (0..6) on the setup
   screen; `draftHelper` setting (default on) with a switch in the draft header and Settings > Draft; no fit score
   before the human's first pick. Original note: League setup: number of free-agency moves and total point budget
   (tier prices unchanged). Draft: a toggle for the recommendations (FIT badges, needs panel); no fit score
   before the first pick. Keep the line between hand-holding and the prep/draft being part of the fun.
5. **Free agency plain add.** SHIPPED 2026-11-02 (branch `claude/stakes-85a96b`): `freeAgency(run, null, add)` signs
   without a drop when the human is under `rosterMax` (one move, within budget, Species Clause, no captain flags);
   the hub dialog has "Keep everyone" and a roster count. AI stop-early measured over 12 seeds x (16 and 8 teams),
   264 AI coaches: 20 ended below their rolled aim (7.6 %), all by the `minPointsPerOpenSlot` dial (under 3 points per
   open slot); 0 ended below aim with 3+ points per open slot left. Under the 10 % bar, so `AI_STOP_DIALS` is unchanged.
6. **Career profile + Hall of Fame.** `engine/src/profile.ts` (`Profile`, `recordRunEnd` over `summarizeRun`),
   `pdc.profile.v1` beside the saves, export/import with them; career record, titles per stake, trophy case;
   the run-end screen gains the decisive match and the perks taken (`docs/ROGUELIKE.md`).
   SHIPPED 2026-11-02 (branch `claude/career-profile-522c7c`): `profile.ts` (`Profile` v2 with `runs` capped at
   200 and per-species `trophies`; `recordRunEnd` idempotent by run id; `mergeProfiles`; `careerStats`;
   v1 migration), `decisiveMatch` in `league/summary.ts`, the app store over it (same `pdc.profile.v1` key),
   `exportSave` writes `{ run, profile }` once the career has runs and `importSave` takes both shapes,
   `screens/HallOfFameScreen.tsx` (route `hall`, title-screen button), end-screen decisive match + career strip.
   Open: the perks taken (no perks exist yet); pool, achievements and seasonal objectives from the ROGUELIKE
   profile sketch.
7. **Draft helper follow-ups.** SHIPPED 2026-11-02 (branch `claude/sleepy-greider-aa96f3`): FIT badge and hover note
   share one score (`warmRoleCategories` reads the pool's learnset categories in chunks after first paint,
   `pickImpactSync` / `rankPool(..., { roles: true })` include `newRoles` once cached, the badge shows "…" until then;
   `rankPool` without the option stays role-free so AI picks never depend on the cache); `CardPeek` popover flips above
   near the viewport bottom, clamps horizontally, closes on scroll / Escape; the MY TEAM resistances are a 9 + 9 type
   grid of team weak scores (the 18-column table stays in the prep doc).
8. **Replay viewer** for stored logs (watch any league match); the tape-room perk needs it. SHIPPED 2026-11-02
   (branch `claude/replay-viewer-0db5c4`): `app/src/battle/replay.ts` (log cut into the live battle's beats,
   `useReplay` transport), `screens/ReplayScreen.tsx` (route `replay`, `watch(matchId)` in the store), the field +
   log + hover cards shared with the live battle as `BattleStage`; WATCH in the hub schedule (yours and the rest of
   the league), the week recap and the bracket.
9. DONE 2026-11-02: set editor polish. `engine/src/setImport.ts` (parse, match, validate, `importRosterSets`, `fillSet`), `prep/sampleSets.ts` (`@pkmn/smogon` fetched lazily from data.pkmn.cc, randoms fallback), `spreads.ts` (`spreadFor` moved out of the battle layer + `SPREAD_PRESETS`); app `components/TeamSetTools.tsx`. Follow-ups: none known.
10. **AI quality + pricing.** SHIPPED 2026-11-03 (branch `claude/ai-quality-07001e`).
    - Battle AI: `npm run arena`. The default beats RandomPlayer 95.9% and itself 50.6%. No variant cleared 55%; smarter sacking was best at 53–55%. Stake 4 beats the default 57.6%. Log: `docs/balance/ai-tuning.md`.
    - Draft AI: `npm run draft-arena`. The overpay guard is on and wins 53.7% and 54.5%. The role bonus (roles from the randoms movepools) is off: it doubles hazard removal coverage but wins only 48–49%. Fit mode stays a stake 3 rule (49.5%, 2.3 ms per pick).
    - The lab report gains a draft-quality section: price and residual by round, and role coverage.
    - The lab rerun with Megas on found no new ban. The top 20-pointer is Flutter Mane, at 65.5 against a median of 57.
    - `PRICE_OVERRIDES` run 1 (`npm run prices`, `docs/balance/prices.md`): 83 species, at most 2 points each. The slope went from 0.46 to 0.51 (0.45 to 0.50 on a fresh seed), still short of 0.66. The residual SD is not better out of sample: 4.71 to 5.40.
    - Prep threat summary: no claims about the opp's absences under partial fog.
    - Open: further `npm run prices` passes; smarter sacking as the next battle AI candidate.
11. **Roguelike layer, rest of the build order** (`docs/ROGUELIKE.md`): perk beats + trades → pool progression +
    scouting packs → coach archetypes → challenge leagues → mutator toggle → keepers / gauntlet.
12. **Online follow-ups.** Cloudflare account steps (KV id, Worker deploy, repo variables / secrets, Web
    Analytics token) are the user's; then `ALLOWED_ORIGINS` to the Pages origin; replay-verified daily scores
    only if faking becomes a problem.
13. **Formats**: Champs NatDex (Megas, Z), other gens; doubles never. **Optional** bring-your-own-key LLM
    opponent mode.
14. Checks by hand: the "Done drafting" button in a league with points to spare (covered by `run.test.ts`);
    Tera/Mega pills in the battle log; the phone hover tap-sheet; attack-effect sizes and sound levels live.

## Done log (from the old Next section)
- DONE 2026-11-03: draft fixes. ZU base 3 / PU base 5 (pool floor 3, was 5; histogram in DECISIONS.md); budget hint on
  the draft screen (`maxAffordable` / `reservePerSlot`); Modal and Sheet portal to document.body so the bug report
  opens above the draft UI (the top bar's backdrop-blur made it the containing block of the fixed dialog); "Finish draft"
  error not reproduced (see `league/finishDraft.test.ts`, a guard that finishes drafts with the real set builder).
- DONE 2026-11-02: mon detail sheet. Engine `prep/monDetail.ts` (card with ability descriptions, defensive type row
  + grouped lists, Lv100 speed, randoms roles, notable moves, full Gen 9 learnset; Megas read their base form);
  app `components/MonDetail.tsx` (one dialog mounted in App, `useMonDetail().open(species, { coachId })`, tabs
  Overview / Matchups / Moves / Likely sets / Scouting) opened from the draft (pick card "Full details", roster,
  board, all teams), hub rosters, free agency, prep (rosters, matchup rows, sets, scouting), team editor, analytics.
- DONE 2026-11-02: Daily League (one seed per UTC day, own save slot, score + share line, leaderboard via
  `packages/api`), Settings > Online (nickname, opt-in run summaries), Cloudflare Web Analytics beacon hook,
  Worker deploy workflow. Answers the traffic note.
- Sprites without a 3D model (2026-11-02): Showdown has none for 20 pool species (Future Paradox line, all Ogerpon
  forms, Dialga/Palkia-Origin, Miraidon, Terapagos, Pecharunt, Greninja-Bond). `spriteFor` in `ui/SpriteCard.tsx`
  falls back to the animated pixel front sprite where one exists (7 of them); the other 13 stay still images, and
  no animated backs exist for any of the 20. Recheck after bumping @pkmn/img.
- Showdown look: default sprite set `ani` (3D-model animated sprites, front + back) with `gen5ani` pixel as
  the option; larger battle sprites; Gen 9 mons fall back automatically via @pkmn/img (user ruling 2026-11-02).
- DONE 2026-11-02: mobile bundle (branch `claude/epic-greider-0abe10`): the draft Pool / Board / All-teams views pad
  for the pinned DRAFT bar (it publishes its height); landscape battle HP boxes are compact and the field and action
  column size to the viewport at 812x375 and 667x375; lineup drag on phones (pointer-event drag on the name strip,
  tap-to-swap kept); the draft header and the AI-pick ticker both read `draftShown`, reduced motion reveals every
  pick at once. Home-screen install on a real phone is STILL UNCHECKED (a desktop session cannot).
- DONE 2026-11-02: Mega Mewtwo X/Y banned (`BANNED_MEGAS`); see DECISIONS. Rerun the lab with Megas on to
  find the next outlier now that the top is gone.
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
- DONE 2026-11-03: persistent field effects (user note: Sub / Leech Seed had no visuals, "persistent effects need visuals"). `battle/fieldFx.ts` reads the battle view (new `MonView.volatiles`) into weather / terrain / Trick Room / screens / Tailwind / hazard layers / Substitute, Leech Seed, confusion, Taunt, Encore & co; `fieldCanvas.ts` draws each for as long as it lasts under the one-shot particles, with a fade in / out (rain, sun rays, sand, snow, hail, wind, terrain floor glow, shimmering screen walls, gusts, rocks / spikes / toxic spikes / web on the platform, a plush Substitute doll in front of a dimmed sprite, vine + bulb, orbiting stars, feet badges). One-shot starts added: Substitute / Leech Seed / other volatiles, hazards dropping into place. Reduced motion keeps the still parts, Attack effects off hides all. App now has vitest (`npm test` runs `packages/app` too). Checked in the built-in browser through a scripted harness driving the real stage (not committed); a real replay was not driven end to end. Open: the look is untuned by feel (colors, sizes, density), phone layout not seen, Magic / Wonder Room and Gravity have no look.
- DONE 2026-11-02: team editor at Showdown-teambuilder usefulness (user ask: recommended sets up front, more detail on
  what moves do). Engine `prep/moveRows.ts` (`moveRows(species)` = every legal move as a row: type, category, power,
  accuracy, PP / max PP, priority, shortDesc / desc, flags that matter, secondary chance, STAB) and `prep/calcStats.ts`
  (`calcStats`, `natureMultipliers`, `speedStanding`; sim-free, `stat100` is sim-side), tests in `moveRows.test.ts`.
  App: `components/MoveTable.tsx` (pinned slots, sort / filter chips, expandable details; phone list + bottom sheet),
  `ItemPicker.tsx` (searchable, common first, effect per row), `TeamStats.tsx` (base / EVs / calculated stat per row,
  nature marks, EVs left, speed line), `SampleSets` in `TeamSetTools.tsx` as cards (randoms at once, Smogon when they
  arrive; open until the player closes it, remembered per browser session). Decision: every mon starts on a generated
  default set, so "open while the set is still default" is just "open"; there is no untouched-set flag. Checked in the
  built-in browser, desktop and mobile preset. Open: IV editing (presets still set them), Scarf / item boosts in the
  speed line, a Z-Move / Tera preview in the table.
