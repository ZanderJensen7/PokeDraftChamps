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
