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
