# PokeDraftChamps — Roguelike & meta progression (design, 2026-11-02)

What sits on top of the league loop in `DESIGN.md`: what makes one league different from the next (the
in-run layer) and why the tenth league is worth starting (the across-run layer). References: PokeRogue
(unlocks, daily runs, challenges), Balatro (stakes, optional modifiers, seeds), Slay the Spire (ascension,
pick-1-of-3 rewards), Hearthstone Arena (12-3 gauntlet, mid-run redrafts), TFT (augments at fixed beats),
FIFA Ultimate Team (seasonal objectives), and real fantasy / Pokemon draft leagues (keepers, trades).

## The one rule

**Break the league's rules, never the game's.** Battles stay real Showdown. Nothing here changes damage,
stats, or move effects: the sim is a black box behind `@pkmn/sim`, and a "+10% damage relic" would be both
the hardest thing to build and the first thing a draft-league player screenshots. Every element below
changes what you draft, what you know, what you may bring, or what the league demands.

The same rule across runs: unlocks widen options (Balatro decks and vouchers), never raise power
(PokeRogue candies). Difficulty comes from stakes, not from a thin profile.

One exception, used very rarely and only as a one-match treat: anything the sim already supports but the
league forbids. A rental legendary from the ban list for the final. A Mega Stone in a Megas-off league.
Tera for every mon in one match. A Z-Crystal on your ace. Each is one line of set data and the battle is
still Showdown. A flat damage or stat bonus is never on the table.

## Priorities

1. **Stakes** — the spine. Solves the open "loss cap 4 vs equal-strength AI eliminates most runs" problem
   by making difficulty a ladder, and gives the player a reason to be champion at every level.
2. **Career profile, Hall of Fame, run-end screen** — every finished league is recorded and the end screen
   is worth looking at whether you won or lost.
3. **Perk beats** (pick 1 of 3 at fixed points in the season) and the trade screen.
4. **Pool progression** — a shared league pool that grows through play, with a scouting pack at run end.
5. **Coach archetypes** — one data table driving how each AI coach drafts, picks lineups and battles.
6. **Daily league** (seeded, share string) and **challenge leagues** (fixed seed + mutators).
7. **Mutators** as an optional setup toggle (off by default) and as the body of challenge leagues.
8. Later: **keeper / dynasty campaigns**, the Arena-style **gauntlet** mode, between-week events.

## In-run layer: the season as the Spire

### Stakes (ascension)
A run is played at a stake. Win the title at stake N to unlock stake N+1. Each stake adds exactly one
rule and keeps every rule below it. Stakes never use mutators: the ladder is about skill, not variance.
The exact rules are a data table and will be tuned against humans; this is the shape:

| Stake | Added rule |
|---|---|
| 1 | Base game |
| 2 | Loss cap 3 |
| 3 | AI drafts with fit scoring (`prep/draftHelper` `rankPool`) |
| 4 | AI switches on predicted KOs (battle AI lookahead) |
| 5 | Prep doc loses the Likely Sets tab |
| 6 | AI coaches get +5 budget |
| 7 | Opposing rosters hidden until week 1; scouting only |
| 8 | Playoffs take 6, not 8 |
| 9 | Rival coaches get Mega / Z on top of your settings |
| 10 | Loss cap 2 |

Needs: a difficulty knob in `battle/heuristicPlayer.ts` and one in `draft/draft.ts` `aiChoosePick`
(neither exists today), prep-doc gating, and `RunState.stake`.

### Perk beats ("front office")
At fixed beats — after the draft, after week 3, after week 6, and on making the playoffs — the player
picks one of three perks (TFT augments, Hearthstone's mid-arena redraft). Offers derive from
`deriveSeed(seed, 'perk', week)` so a run replays. Perks are a data table with trade-offs, Balatro-style,
in four families:

- **Economy** — an extra free-agency move; a plain roster add (no drop) within budget; a waiver bump that
  lets one pickup exceed budget by 2.
- **Information** — the next opponent's fixed sets in full (sets are locked for the season, so this is
  real); their six revealed before you commit yours; a tape room that opens their last match as a replay.
  Information perks reveal *facts*, never recommendations (user line on hand-holding: the prep is the fun).
- **Roster rules** — a third Tera captain; captain cap +2; one Z captain in a Z-off league; one extra
  roster slot filled from the free-agent pool.
- **Structure** — a mulligan that forgives one loss against the cap; a bye that skips one match with no
  result; choice of home / away in the playoffs once home field means something.

### Trades
A negotiation screen, not a punishment. You can see an AI coach's needs (`teamNeeds`) before offering. The
AI accepts when its fit score improves, or when a point sweetener closes the gap. A lopsided trade still
costs something so it stays a choice, but it is never a trap: single-player, the player's agency comes
first. Trades count against the free-agency move budget (or their own small budget; decide in the lab).

### Coach archetypes
One data table per AI coach identity (`data/coaches.ts`): archetype (Balance, Stall, Hyper Offense,
Weather, Trick Room, Hazard Stack, ...), a risk dial, and a flavor line. The same record drives three things:
draft weights (Stall weights bulk and hazards; HO weights speed and never drafts for Toxic; Weather drafts
a setter early and builds around it), lineup habits (lead tendencies), and battle style (switch aggression,
sack timing, when to Tera). **Not explicitly player-facing** (user ruling): no "Stall coach" label. You find
out because they lead Torkoal, or because every game has Trick Room in it, and the prep doc's scouting
shows it because the data made it true. Coach portraits: Showdown's trainer sprites are Game Freak's, so
any art is our own, one look per archetype.

### Mutators ("commissioner rulings")
Optional. A setup toggle, off by default, rolls one to three from a data table, shown on the setup screen
before the draft (Balatro boss blinds, PokeRogue challenge rules). Each is a `LeagueConfig` delta and / or
a pool predicate. Examples: Budget Crunch (100 pts), Mega Season, Double Tera, Hazard-Free (hazard moves
banned from the pool), Monotype Draft (each roster shares 3+ of one type), Fog of War (rosters hidden until
week 1), Speed League (roster min 11), and the draft rulings (pick first for −5 budget; +10 budget with
roster max 9; see every AI coach's needs during the draft). Mutators are the body of challenge leagues.

### Between-week events (later)
Seeded one-offs: an injury benches a mon for one week, the commissioner reprices a species, a coach offers
a trade. Flavor; build perks and mutators first.

## Across-run layer: why play again

### Career profile and Hall of Fame
A second store beside the run (`pdc.profile.v1`) holding `Profile { version, stakeUnlocked, pool,
runs: RunSummary[], trophies, achievements }`, written by a pure `recordRunEnd(profile, run)` in a new
`engine/src/profile.ts`. `RunState` already carries everything a summary needs and `engine/src/stats`
already computes MVPs. Exported and imported together with the run save.

Surfaces: career record and titles per stake; a per-species trophy case (drafted, won a playoff match with,
league MVP); seasonal objectives in the FIFA Ultimate Team shape (a track of goals such as "win a league
with three or fewer OU mons" with cosmetic rewards, titles, portraits).

### Run-end screen
The same screen whether you won or lost: final record and seed, the bracket, your MVP and worst signing by
the stats module, the match that decided it, points per win, the perks you took, and a share string. A
lost run that ends on a good screen is what starts the next one.

### Pool progression
The draft pool grows through play. Two rules keep it honest:

1. **The pool is the league's, not yours.** Every coach drafts from the same pool, so the AI never has
   mons you don't.
2. **Start with half of every tier, not the cheap tiers.** A draft with no 15–20 pointers has no stars,
   no captain decisions and no budget tension. Half of every tier gives a full draft on day one and makes
   each unlock a new name in a tier you already understand. Which half is seeded per profile so two players'
   first pools differ.

Unlock paths: **scouting packs** at the end of every run, won or lost — three species revealed, keep one
(the Slay the Spire card reward), weighted toward tiers you have drafted least, no currency, no duplicates,
a pity rule that guarantees a 15+ pointer every few packs; and **earned unlocks** through play ("any mon
you beat in a playoff match", "the opposing MVP of a league you won"), so a player who wants Dragapult has
a way to earn Dragapult instead of hoping. Never moves, never sets: species only.

### Daily league
Seed from the date, one fixed config and mutator set, one attempt. The run is already deterministic from
seed + inputs, so every player drafts against the same AI picks. Result = a share string (score, seed,
stake) plus a **leaderboard** (user ruling 2026-11-02: a fixed-seed format needs one). The leaderboard is
the one piece of the plan that needs a server, so it amends DESIGN's "no server, ever" to "no server the
game needs to run": the static site stays playable offline and the backend only receives what the player
sends on purpose.

Backend shape (see also Analytics below): a Cloudflare Worker + KV / D1 on the free tier, one endpoint for
`POST /daily/{date}` with `{ nickname, score, seed, version }` and `GET /daily/{date}` for the top N. The game
runs client-side, so a bare score can be faked; v1 accepts that (honor system, nickname only, no accounts).
v2 can carry the run's input log and replay-verify it server-side: that needs the sim (the 8 MB battle
chunk), which likely won't fit a Worker's size limit, so verification would run on a small always-on VM
(Oracle Cloud's always-free ARM tier is the usual pick; note it is a real server to maintain and idle
free-tier instances get reclaimed). Decide v2 only if faked scores become a problem.

### Analytics (who is playing)
Today: nothing. GitHub Pages reports no site traffic, and DECISIONS forbids telemetry leaving the browser
without opt-in. Two layers, in order:

1. **Page views, now.** A cookieless, privacy-respecting beacon on the static site: Cloudflare Web
   Analytics (free, no cookies, no custom events) or GoatCounter (free for non-commercial, open source,
   supports custom events). Minutes to add; answers "how many people, how often, which screens".
2. **Gameplay events, opt-in, later.** The same Worker as the leaderboard takes anonymous run summaries
   (`RunSummary`: config, stake, result, weeks played, version; never a nickname unless they post a score)
   behind an explicit Settings opt-in, default off. That is the cross-player data the balance lab wants
   (DECISIONS: "cross-player data would need an explicit opt-in export"). Posting a daily score is itself
   the opt-in for that run.

### Challenge leagues
Fixed seed + fixed mutators + a badge on completion: Budget 80, No OU, Draft Last in 16, Loss Cap 1, Mega
Madness. Each is a `LeagueConfig` preset plus a pool filter. Unlocks (perks, mutators, coach identities,
titles, portraits) hang off these and off achievements, Balatro-style. Formats (Megas, Z, Champs NatDex) are
never gated: a locked format reads as a paywall even in a free game.

### Keeper / dynasty campaigns (later)
From fantasy sports, copied by real Pokemon draft leagues: the same coaches play season after season, and
before each draft every coach may keep a few mons from last year at a premium (+2 points, or the pick they
were taken with). For us: a campaign where the same AI coaches return, you carry up to two mons at a rising
premium, they carry theirs (chosen by fit score), standings history and rivalries pile up, and the dynasty
ends when you are eliminated. The "go again" loop that fits the fantasy-draft identity best; parked until the
single-league loop is tuned.

### Gauntlet (later)
Hearthstone Arena's 12-3: no schedule, a random coach each game, play until 12 wins or 3 losses, with a
redraft after game 6 (drop two, pick two from a fresh offer). Reuses the draft and battle layers whole.

## Fit with the code

- `LeagueConfig` + `validateLeagueConfig` absorb stakes and mutators as config deltas; pool predicates sit
  in a data table in `engine/src/data` next to `POINTS_BY_TIER`. Pool restriction = one more predicate in
  `draft/pool.ts` fed by the profile.
- `RunState` gains `stake`, `mutators`, `perks`, and a `pendingOffer` the hub renders. Save version → 4 with
  a migration that fills empties (v2 → v3 pattern).
- `resolveWeek` sets `pendingOffer` after perk weeks; offers from `deriveSeed(seed, 'perk', week)`.
- `engine/src/profile.ts`: `Profile`, `recordRunEnd`, `openScoutingPack` (seeded), `unlockedPool`.
- Coach archetypes extend `data/coaches.ts`; `aiChoosePick`, `chooseLineup` and `HeuristicPlayer` read the
  same record. Difficulty knobs in the same two places.
- Daily league: `seed = hash(date)`, config preset, share string built from `RunSummary`.

Build order: stakes → profile + run-end screen → perks + trades → pool progression → archetypes →
daily + challenge leagues → mutator toggle → keepers / gauntlet.
