# Changelog

Semantic versioning while in 0.x: a minor bump for new things the player sees, a patch bump for fixes and
tuning. `npm run bump -- minor|patch` moves the Unreleased notes below into a dated version section and bumps
every package.json. The build stamp shows the version and short commit in the corner of every screen.

## Unreleased

- Free agency: a coach under the roster maximum can sign a free agent without dropping anyone ("Keep everyone" at
  the top of the drop list; it still counts as a move and must fit the budget). The dialog shows the roster count.
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
- The season length now follows the league size: 7 weeks with 8 coaches, 9 with 12 or 16, and never more weeks
  than there are other coaches, so nobody plays the same coach twice in the regular season.

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
