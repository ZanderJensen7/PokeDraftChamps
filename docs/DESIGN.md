# PokeDraftChamps — Design (v0.1, 2026-11-02)

A free, solo, roguelike Pokemon draft league. Think Hearthstone Arena meets a real draft league:
enter a league, draft a roster, play a season against AI coaches, make the playoff bracket, win the title.
Lose too much and the run is over.

Reference for the prep side: Techno's Draft League Teambuilding Doc (Matchup / Moves / Teams tabs).
Reference for the loop: PokeRogue (browser, free, no backend).

## Tech
TypeScript monorepo (npm workspaces). `packages/engine` is pure TypeScript (no DOM): league, draft,
schedule, standings, playoffs, run state, battle runner, heuristic AI, prep doc. `packages/app` is
Vite + React + Tailwind + Zustand. Battles run on `@pkmn/sim` in the browser (Web Worker for AI-vs-AI
league simulation). Saves in IndexedDB/localStorage with JSON export. Static hosting. No server, ever.

Pokemon data: `@pkmn/dex` (Gen 9), learnsets via `@pkmn/data`, damage via `@smogon/calc`, competent
per-species sets and roles from `@pkmn/randoms` (`getTeamGenerator('gen9randombattle').randomSet(name)`,
509 species). Sprites via `@pkmn/img`. All MIT. The Showdown *client* is AGPL: never copy its code.

## The run (one league = one run)
1. **League setup** — size 8 / 12 / 16 coaches (default 16), 9 regular-season weeks (default), playoff
   size 8 (default; half the league, min 4), point budget 120, roster range 9–11 (`rosterMin` /
   `rosterMax`; min = max makes a fixed-size league), Tera captains (default 2, 0 = off), Z captains
   (default 0 = off), captain price cap (`captainMaxPoints`, default 14; 20 = no cap: a mon priced over it
   can't be a Tera or Z captain), Megas on/off (default off), loss cap (default 4: a 5th regular-season
   loss ends the run). All of this is `LeagueConfig`, checked by `validateLeagueConfig`. See DECISIONS
   2026-11-02 for the Mega / Tera / Z rulings and the roster range + captain cap ruling.
2. **Draft** — snake draft, pool = Gen 9 species that have a randoms set and are not restricted
   legendaries / AG. Price by Smogon tier (`POINTS_BY_TIER`, data table). Each coach drafts between
   `rosterMin` and `rosterMax` mons: once at the minimum a coach may stop on their turn ("Done drafting"),
   and a stopped or full coach is skipped by the snake; the draft ends when every coach is stopped or full.
   Budget reserves only cover the picks still required (up to the minimum). AI coaches draft by need
   (role coverage, speed, type balance, stay within budget for remaining picks); each rolls a seeded
   roster aim from `AI_STOP_DIALS` (draft.ts) and stops at it, or earlier when the points left per slot
   get thin, so AI rosters spread across the range. Lineups still bring 6.
3. **Season** — every week: see the schedule and standings, open the **prep doc** for the next
   opponent (their full roster is public, like a real league), choose your 6 and your Tera captains'
   usage plan, play the match (Showdown-style battle UI vs the heuristic AI), then every other match
   of the week simulates instantly (AI vs AI, logs stored). Standings: wins, then differential
   (your remaining mons minus theirs, summed).
4. **Playoffs** — top N seeded single elimination (1v8, 4v5, 3v6, 2v7). Lose = run over.
   Win the final = champion.
5. **Run over** when: regular-season losses exceed the loss cap, you miss the playoffs, or you lose a
   playoff match.

Roguelike layer v0.1 (kept small on purpose): between weeks you may make up to 2 free-agency moves per
season (drop one roster mon, pick up an undrafted one, within budget). The full roguelike and meta
progression design (stakes, perk beats, trades, coach archetypes, optional mutators, career profile, pool
progression, daily / challenge leagues, keepers later) is `docs/ROGUELIKE.md`.

## Match rules (Gen 9 singles)
Level 100, bring 6 of your roster, team preview, Species Clause, Sleep Clause, OHKO/Evasion clauses,
only Tera captains may Terastallize (enforced by the game, not the sim: the sim runs `gen9customgame`
with a custom rule string; the player layer hides the tera option for non-captains).
Sets: the AI builds one set per roster mon per season from randoms roles (level 100, 252/252/4 EVs by
role, nature by role, items from the role). A coach's sets are fixed for the season, so scouting their
earlier battles (stored logs) reveals real information. The human edits their own sets freely
(Showdown import/export text, `@pkmn/sets`).

## Prep doc (streamlined from the sheet)
Per matchup, both rosters side by side:
- Stats: types, BST, base stats, abilities, price, Tera captain flag.
- **Type matchup table** per mon per attacking type (18 columns) with ability immunities applied
  (Levitate, Water/Volt Absorb, Flash Fire, Sap Sipper, Storm Drain, Lightning Rod, Motor Drive,
  Earth Eater, Well-Baked Body, Dry Skin, Thick Fat, Heatproof, Purifying Salt, Fluffy).
  Team rows: **STAB** count per type, **Weak** score per type
  (2x = -1, 4x = -2, 0.5x = +1, 0.25x/0x = +2; extra -2 if the team has zero resists to the type,
  -1 if only one).
- **Speed tiers**: both teams merged, sorted; columns base / 0 EV / 252 / 252+ / Scarf 252 / Scarf 252+
  at level 100.
- **Notable moves** by category from Gen 9 learnsets: Entry Hazards, Hazard Removal, Healing,
  Momentum, Item Removal, Status, Priority, Disruption, Screens, Speed Control.
- **Likely sets**: the randoms roles for each opposing mon (movepool, abilities, tera types).
- **Scouting**: anything revealed in that coach's stored battle logs this season (moves, items,
  abilities, tera types, leads).

## Non-goals for v0.1
Doubles, other gens, NatDex/Megas/Z (the user's real league is Champs NatDex; Gen 9 first, formats
later), animated battles, multiplayer, accounts.
