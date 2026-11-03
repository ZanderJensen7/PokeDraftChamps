# Decisions

- **2026-11-02 — Engine choice.** TypeScript web app (Vite + React), not Unity/Godot: the simulator,
  data, calc and sprites are all TypeScript; static hosting like PokeRogue; UI-heavy game.
- **2026-11-02 — Showdown integration.** No live-server API exists or is needed. `@pkmn/sim` runs the
  battles locally (browser verified). Battle logs are stored in Showdown protocol format so replays and
  scouting come for free later.
- **2026-11-02 — First format.** Gen 9 singles, level 100, Paldea dex + DLC (species that have a randoms
  set), 120-point budget, 11-mon rosters, 2 Tera captains, bring 6. The user's real league is Champs
  NatDex (Megas + Z); other formats come after the loop is fun.
- **2026-11-02 — League shape.** 8 / 12 / 16 coaches, 9 weeks, top 8 single-elimination bracket with a
  final (champion screen required). Run ends on loss cap (default 4), missing playoffs, or a playoff loss.
- **2026-11-02 — AI.** Heuristic, damage-calc driven, shipped at launch. A bring-your-own-key LLM
  opponent is a later optional mode, never the default (a free game cannot pay for API calls).
- **2026-11-02 — Prep doc scope.** Start with the sheet's essentials: potential moves by category,
  speed tiers, team type-resistance breakdown (STAB / Weak scores), likely sets, and scouting from logs.
- **2026-11-02 — Megas / Tera / Z as league options.** `LeagueConfig.megas` (default off), `teraCaptains`
  (default 2; 0 = Tera off), `zCaptains` (default 0; 0 = Z off). Verified: Mega Stones and Z-Crystals work in
  plain `gen9customgame` (no National Dex ruleset needed). Megas are their own draft entries priced by
  `natDexTier` (Mega Rayquaza AG = banned); one coach may own one form per dex number, so never a base and
  its Mega. Mega forms cannot be Tera or Z captains. A Mega set is the base species holding its stone;
  a Z captain's set holds the Z-Crystal of its best STAB move. Non-captains simply hold no stone/crystal,
  so the sim itself enforces the rule.
- **2026-11-02 — Mega Mewtwo X and Y banned.** User ruling on balance-lab evidence (40 leagues, 12 teams,
  Megas on): both scored 80+ at the 20-point cap with 64-68 % win rate when brought and ~2 KOs a game, while
  every other 20-pointer sits near 55. Real draft leagues ban them too. They live in `BANNED_MEGAS`
  (`engine/src/data/points.ts`), a data table like every other ban; base Mewtwo stays banned by id. Any
  future Mega that breaks the lab the same way goes in that table, never a special case in the pool code.
- **2026-11-02 — Performance analytics for pricing.** Prices are tuned from data, not feel: every stored
  battle log is mined into per-mon stats (brought, led, KOs, fainted, damage dealt/taken, turns active,
  Tera/Mega/Z used, won) in `engine/src/stats`, aggregated per league and across leagues, scored 0-100 with
  shrinkage for small samples, and compared against the price tier to produce suggestions. The **balance
  lab** (`npm run balance`) simulates AI-only leagues headlessly and writes `docs/balance/latest.{json,md}`;
  the in-game Analytics screen shows the same numbers for the player's league. No telemetry leaves the
  browser (no backend); cross-player data would need an explicit opt-in export.
- **2026-11-02 — Roster range + captain price cap.** User ruling: rosters are a range, not a fixed size,
  and the strongest mons can't also be captains. `rosterSize` became `rosterMin` (default 9) + `rosterMax`
  (default 11): a coach may stop drafting on their turn once at the minimum, stopped or full coaches are
  skipped, budget reserves only cover required picks. Why: a coach who spends big on a few stars should be
  able to stop short instead of buying filler, and lineups only bring 6. AI stopping is one data table
  (`AI_STOP_DIALS`: aim weights 3 / 4 / 3 for min / in-between / max, stop early under 3 points per open
  slot), seeded per coach, measured at about 38 % / 40 % / 22 % for 9 / 10 / 11 mons with ~0.4 points left.
  `captainMaxPoints` (default 14, 20 = no cap) bars mons priced over it from Tera and Z captaincy, so a
  captain is a mid-price pick made scary, not a top pick made scarier; the captain count drops when a
  roster has too few eligible mons. Saves bumped to v3; v2 saves migrate as min = max = their old size with
  no cap, so an old league keeps its rules.
- **2026-11-02 — Attack effects, not Pokemon animations.** User ruling: the `ani` sprites already move, so the
  battle gets effects for the attacks only (a template per shape: contact / projectile / beam / self / status /
  field, colored and glyphed per type) plus a hit flash and a small shudder on the sprite that was hit, field
  shake on crits / super-effective hits, and Tera / Mega / Z flashes. All of it is our own canvas code with data
  tables (`app/src/battle/vfx.ts`); the Showdown client and PokeRogue animation code are AGPL and are never
  copied. Sounds are synthesized with Web Audio (no audio files); cries are hot-linked from the same Showdown
  host as the sprites. Both are settings (Attack effects, Sound) and reduced motion turns the visuals off.
- **2026-11-02 — Versioning.** Semantic versions while in 0.x: minor for new player-visible things, patch for
  fixes and tuning. One command, `npm run bump -- minor|patch`, moves every package.json (root, app, engine)
  and the lockfile together and dates the Unreleased section of `CHANGELOG.md`; the user commits and tags
  (`git tag vX.Y.Z`). The build stamp (version · short commit) sits as a tiny string in the bottom-right corner
  of every screen except the live battle, where the action panel owns the bottom edge.
- **2026-11-02 — Roguelike / meta layer.** Design in `docs/ROGUELIKE.md`. User rulings: battles never
  change damage, stats or move effects (one-match treats may break *league* rules the sim already supports:
  a rental legendary, a Mega Stone in a Megas-off league); stakes (ascension) are the spine and never use
  mutators; mutators are an optional setup toggle (off by default) and the body of challenge leagues; trades
  are a negotiation, never a trap (single-player, agency first); AI coach archetypes drive draft, lineup and
  battle style from one data table but are not labelled to the player (you learn it when they lead Torkoal);
  pool progression is shared by the whole league and starts with half of every tier, with scouting packs
  (keep 1 of 3, no currency) and earned unlocks, species only; keeper / dynasty campaigns and the Arena-style
  gauntlet come later. The daily league needs a leaderboard, which amends "no server, ever" to "no server
  the game needs to run": a small Worker-style backend that only receives what the player sends on purpose
  (scores, opt-in run summaries), plus a cookieless page-view beacon for traffic.
- **2026-11-03 — Season length per league size.** User ruling: "9 weeks with 8 coaches makes no sense; end
  after 7, everyone once". The setup screen defaults weeks to min(coaches − 1, 9) (8 → 7, 12 → 9, 16 → 9), the
  weeks slider stops at coaches − 1 (no regular-season rematches), and changing the league size re-applies the
  default unless the player moved the slider. `MAX_WEEKS` validation is unchanged; the daily league is already
  8 coaches / 7 weeks.
- **2026-11-03 — Stake 4 is "AI knows your sets".** The first stake 4 (the AI switches out of predicted KOs)
  measured at ~50% against the default AI, so it was not a difficulty step. The replacement gives the AI side
  the human's real sets (`PlayerContext.opponentSets`): real moves for its threat estimate, real item, ability
  and spread for its damage calcs (a Tera type still counts only once it Terastallizes), instead of STAB
  stand-ins and a guessed set. Measured 116/200 and 118/200 wins against the default AI over two seed ranges (sides alternated, identical teams), against
  96/200 and 104/200 for two identical AIs. Dropping the AI's random-move epsilon on top added little
  (119/200), so it stays at the default. It never changes the sim, only what the AI knows.
