# Changelog

Semantic versioning while in 0.x: a minor bump for new things the player sees, a patch bump for fixes and
tuning. `npm run bump -- minor|patch` moves the Unreleased notes below into a dated version section and bumps
every package.json. The build stamp shows the version and short commit in the corner of every screen.

## Unreleased

- One way back, one way out: every screen you open from somewhere else (Badge Run, Custom League, Daily, Hall of
  Fame, Analytics, Prep, Replays) has "‹ Back" at the top left of its title. Dialogs, sheets, Settings and the
  Team editor close with the ✕ at their top right, and the extra Close / Back buttons in dialog footers are gone
  ("Cancel" stays only next to a button that commits something). Guided prep steps and the battle switch panel use
  the same "‹ Back". The hub's "Title" button says "Title screen", like everywhere else.
- Title screen: "End this run" under Continue deletes your league after a confirm, so you can start fresh (it does
  not count in the Hall of Fame; your daily run and career stay). Daily now comes before Custom.
- Guided prep: before each match, prep now walks you through steps: Scout (threats and their roster), Lineup (pick
  your six, or "Suggest lineup"), Moves, EVs, Battle. Moves shows which of their Pokemon your six hit super
  effectively and suggests up to three legal swaps to cover the gaps (it never drops a status move, your last STAB
  attack or anyone's only answer); one tap applies a swap. EVs shows each of your six with every preset spread and
  how many of their Pokemon it outspeeds. Moves and EVs are optional ("Skip to battle"). The full prep doc is a tap
  away ("Full prep doc"), and Settings > Prep remembers which one you use.
- Badge Run is the main way to play: pick a badge, name your team, draft. Each badge sets the whole league, from
  8 coaches over 7 weeks at the Rookie Badge up to 16 coaches with a top-8 bracket, and the title screen leads
  with it, showing your next badge and how many you have earned. Every setting now lives in the new Custom League,
  which plays any unlocked badge's rules, counts in the Hall of Fame and never earns or unlocks a badge. Custom
  unlocks once you earn the Rookie Badge (it stays open if you have played before). The badge card says "Losses
  allowed" in place of "Loss cap".
- Stakes are now Badges: ten badges (Rookie to Legend), each with its own emblem. The setup screen shows them as a
  badge case on a track, earned ones in gold and locked ones as padlocked ghosts. Hover, focus or click any badge,
  locked ones too, to see the rule it adds, the rules already in force and the loss cap, playoffs and budgets it
  means; only unlocked badges can be picked. The Hall of Fame, run-end screen and header say Badge N too, and a
  title shows the badge you earned.
- Analytics: the Price watch panel is internal balance tooling and no longer shows to players; Performance stays.
- Title screen: a menu instead of a stack of buttons. Continue is a card with your team crest, week and record;
  New League and Daily sit side by side (Daily says whether today's league is new, in progress or played); Hall
  of Fame gets a trophy row; How to play, Settings, Import and Bug report move to a small icon row.
- League setup: the point budget is a slider (steps of 5, from the least that fills your roster minimum up to 200;
  the hint says how many points a roster of cheapest mons needs) and free-agency moves a stepper (0 to 6). Tier
  prices are unchanged, presets leave both alone, and stake 6 shows what the AI coaches get on top of your budget.
- Draft: a "Recommendations" switch (draft header, and Settings > Draft) hides the FIT badges, the needs sentences,
  "Sort by fit" and the "what this adds" note. Your team's resistances, speed tiers and roles stay. Before your
  first pick there is nothing to fit, so no fit score shows and "Sort by fit" waits for it.
- Draft helper: the FIT badge and the hover note now agree. The move roles of the whole pool are read in the background
  after the draft screen opens (the badge shows a faint "…" until its score settles, the note says roles are loading);
  the "what this adds" popover flips above a card near the bottom of the screen, stays inside the window and closes on
  scroll or Escape; the MY TEAM resistances are a two-row type grid with the team's weak score under each type, with
  no sideways scrolling (the full table stays in the prep doc).
- Battle: effects that last now stay on the field for as long as they last. Weather tints the field and brings
  sun rays, rain, sand, snow, hail or wind; terrains glow under both platforms; Trick Room shows its room outline;
  Reflect, Light Screen and Aurora Veil shimmer around the side that has them, Tailwind blows across it; Stealth
  Rock, Spikes layers, Toxic Spikes layers and Sticky Web sit on the ground of the side they are on and drop in when
  set. A Substitute is a plush in front of its dimmed mon, Leech Seed a vine and bulb at its feet, confusion circles
  the head, and Taunt, Encore, Torment, Yawn, Curse, Ingrain, Aqua Ring and Attract get a badge at the feet.
  Substitute and Leech Seed starts have their own effect now. Reduced motion keeps the still parts (tints, glows,
  hazards, markers, the doll) and drops the particles; turning Attack effects off hides all of it.
- Free agency: a coach under the roster maximum can sign a free agent without dropping anyone ("Keep everyone" at
  the top of the drop list; it still counts as a move and must fit the budget). The dialog shows the roster count.
- Team editor: "Import sets" takes Showdown text for one or many Pokemon and applies each set to the roster Pokemon
  of the same species (a Mega pick by its Mega name or its stone). Illegal moves, over-cap EVs, Z-Crystals on
  non-Z captains and stray Mega Stones are skipped and listed by name; level is forced to 100; a Tera Type on a
  non-captain is kept but flagged. "Export all" copies the whole roster as Showdown text.
- Team editor, Showdown-teambuilder style: recommended sets open up front (Smogon's first, then the randoms
  roles; "Use this set" or "Merge moves only"); a sortable, filterable move table with type, category, power,
  accuracy, PP and effect, STAB marked and the full description, priority and flags one tap away (a list with a
  bottom sheet on phones); ability and item effects shown, the item picker searchable; and a live Level 100 stats
  panel with the nature's +/-, the EVs left and where your Speed lands against the league.
- Team editor: sample sets per Pokemon (Smogon's Gen 9 sets when online, the randoms role sets always), a searchable
  legal-move picker, EV presets by role with the EVs left to spend, the nature's +/- stats, and common
  competitive items first in the item list.
- Daily League: one seeded league per UTC day (8 coaches, 7 weeks, top 4), the same AI picks for everyone, one
  attempt, a score and a share line on the run-end screen, and a leaderboard when the build has a backend.
- Settings > Online: a nickname for the leaderboard and an off-by-default switch to share anonymous run
  results (settings, result, score; never battles or names).
- Backend (`packages/api`): a Cloudflare Worker for the daily leaderboard and the opt-in run summaries, plus
  an optional cookieless page-view beacon. Neither is needed to play.
- Battle: a Mega pick goes by its Mega name ("Mega Charizard X") in the lead picker, on the bench, on its HP box
  and in the log's switch and faint lines, instead of its base species until it Mega Evolves.
- Battle: weather and terrain chips and log lines show names ("Sun", "Rain", "Electric Terrain") instead of
  protocol ids ("SunnyDay").
- Team editor: the Showdown export carries a Tera Type line only for Tera captains; an imported Tera type on
  anyone else is kept on the set but left out of the text.
- Phones: drag a Pokemon's name strip onto another lineup slot to swap them (tap-two-slots still works).
- Phone layout fixes: the draft Pool, Board and All-teams views scroll clear of the pinned DRAFT bar; landscape
  battles fit the screen with compact HP boxes that no longer overlap the sprites; the draft header and the
  AI-pick ticker name the same pick while picks reveal, and reduced motion shows them all at once.
- Mon detail sheet: tap a mon's icon or name on the draft board, hub rosters, prep doc, team editor, free agency
  or analytics for its abilities, base stats, speed tiers, type matchups, notable moves, full learnset (with a
  filter), likely sets and, for a league coach's mon, what their battles have revealed.
- Stakes: ten difficulty levels on the setup screen, one added rule each (loss cap, smarter AI drafts, an AI
  that knows your sets in battle, no Likely sets tab, +5 AI budget, fog of war, smaller playoffs, drafting
  last); winning the title at a stake unlocks the next.
- Hall of Fame (title screen): your career across runs (runs, titles, best stake won, win rate, best score,
  longest title streak, a badge per stake you have won), every finished league and daily run newest first with
  its record, score, MVP and share line, and a trophy case of every species you finished a run with (titles,
  MVPs, playoff wins). The run-end screen adds the match that decided the run and a career-so-far strip.
  Export save now carries the career too, and importing merges it run by run (older bare-run saves still import).
- The season length now follows the league size: 7 weeks with 8 coaches, 9 with 12 or 16, and never more weeks
  than there are other coaches, so nobody plays the same coach twice in the regular season.
- Draft: the cheapest Pokemon cost less. The bottom of the pool now runs 3-5 points (ZU) and 5-7 (PU), so a budget
  stretches to a late star. Everything from ZUBL up is priced as before.
- Draft: on your pick the screen says why the cap is what it is ("8 more required after this at 5+ -> up to 80 now"),
  on desktop and phone.
- Fixed: Report a bug opened behind the draft screen (and could not be used); dialogs and sheets now open above
  every screen.
- Replays: WATCH any played league match (your schedule, the rest of the league, the week recap, a playoff
  bracket game) on the battle field with the log open: play / pause, step, step back, 1x / 2x / 4x, a turn
  slider and restart. Both sides' HP is exact; on phones the controls sit at the bottom.

## v0.3.1 — 2026-11-02

- Mons without a 3D model on Showdown (Iron Valiant, Iron Hands, Iron Moth, Iron Thorns, Miraidon, Terapagos,
  Dialga-Origin) use their animated pixel sprite as the opponent instead of a still image.

## v0.3.0 — 2026-11-02

- Attack effects over the battle field: every move drawn by shape and type, hit flash and shudder, field
  shake on crits and super-effective hits, Tera / Mega / Z flashes, cries and synthesized sound effects.
  Settings toggles for effects and sound.
- Tiny version string in the corner of every screen; `npm run bump` versioning with this changelog.
- Build stamp (version, commit, build day) on the title screen and in Settings; Report a bug dialog that
  prefills a GitHub issue.

## v0.2.0 — 2026-11-02

- Lighter first load: the simulator loads on first use.
- Roster range (9 to 11 by default) and a captain price cap as league settings.
- Showdown-style battle log, open by default, and hover cards on every battle sprite.
- Megas, Tera and Z as league options; Mega Mewtwo X and Y banned.
- Draft helper, performance analytics, balance lab, mobile layouts and installable PWA.

## v0.1.0 — 2026-11-02

- First playable: draft, 9-week season against AI coaches with a prep doc per opponent, top-8 bracket,
  champion screen; runs end on the loss cap, a missed playoff spot or a playoff loss.
