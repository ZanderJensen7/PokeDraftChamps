# UI style — "Pokemon game, not a spreadsheet" (2026-11-02)

The app should feel like a Pokemon game menu system that happens to run a draft league, not like a
dashboard. References: the mainline games' battle screens and menus, PokeRogue's chunky UI, the Showdown
team-preview feel (feel only: never copy Showdown client code or CSS).

## Tokens (Tailwind 4 theme in `src/index.css` via `@theme`)
- **Surfaces:** deep navy background (`#0f1a2e`), panels `#1b2a47` with a 2px lighter border (`#3a4f7a`)
  and a 3px darker bottom edge (bevelled "game box" look), radius 12px. A light variant for the
  dialogue/text box: cream `#f6f1e4` with dark text and a double border (classic text frame).
- **Accents:** Poke Ball red `#e3350d`, yellow `#ffcb05` (Pokemon yellow, for highlights/titles),
  blue `#3b4cca`. Your side = blue, opponent = red everywhere (matches real prep docs).
- **Type colors** (standard): Normal #A8A77A, Fire #EE8130, Water #6390F0, Electric #F7D02C,
  Grass #7AC74C, Ice #96D9D6, Fighting #C22E28, Poison #A33EA1, Ground #E2BF65, Flying #A98FF3,
  Psychic #F95587, Bug #A6B91A, Rock #B6A136, Ghost #735797, Dragon #6F35FC, Dark #705746,
  Steel #B7B7CE, Fairy #D685AD. Type badges: pill, uppercase, bold, white text with a dark text-shadow.
- **HP bar:** green > 50%, yellow 20–50%, red < 20%, inside a dark rounded track with "HP" label on the
  left, like the games.
- **Fonts:** display "Fredoka" (rounded, bold) for titles/buttons, body "Nunito"; optional pixel font
  "Press Start 2P" ONLY for tiny labels like "Lv100" / "HP" (Google Fonts). Never below 14px body.
- **Buttons:** chunky, 2px border, bottom bevel, press animation (translateY 2px), yellow primary,
  blue secondary, red danger. Focus ring visible.

## Sprites and icons
- `@pkmn/img`: `Sprites.getPokemon(name, {gen: 'gen5ani'})` for animated pixel sprites in battle
  (opponent `side: 'p2'` front, player `side: 'p1'` back), `Icons.getPokemon(name)` for the small
  box icons in lists, rosters, draft board, schedule. Item icons via `Icons.getItem`. These are URLs on
  play.pokemonshowdown.com/sprites (same approach as PokeRogue, free fan use only).
- Poke Ball glyph as the app logo mark (inline SVG, drawn by us).

## Screens (each is a "menu" with a title band)
- **Title:** logo, "NEW LEAGUE", "CONTINUE", "SETTINGS"; a slow parallax of pixel sprites optional.
- **League setup:** cards for 8 / 12 / 16 teams, sliders for weeks, loss cap; team name + 3-letter tag.
- **Draft:** left = pool as a grid of sprite cards with price badge and type pills, filters (type, price,
  search); right = the live draft board (snake order, picks ticker) and your roster with points left.
  AI picks animate in one by one (short delay) so the draft feels like an event.
- **Season hub:** week banner, your next matchup card (two team crests, both rosters as icon rows),
  standings table styled like a league table, schedule strip, free agency button, "PREP" and "PLAY".
- **Prep doc:** tabs: Matchup (type table with STAB/Weak rows, colored cells 0 / ½ / 2 / 4),
  Speed Tiers (merged list, your rows blue, theirs red), Moves (category columns), Scouting (revealed
  info per mon with sprite). Pick your 6 here (drag or tap), confirm Tera captains, "TO BATTLE".
- **Battle:** game layout. Opponent HP box top-left, opponent sprite top-right on a platform; your sprite
  bottom-left, your HP box bottom-right; team-preview strip of icons; dialogue frame at the bottom
  narrating the log in plain words (convert protocol lines to sentences; `@pkmn/view` helps), with the
  4 move buttons (type-colored, PP shown) and "SWITCH" / "TERA" (captains only) replacing the text when
  it is your turn. Keep a collapsible full-log side panel for the Showdown faithful.
- **Results / week recap:** your score, other scores as a list, standings delta, "NEXT WEEK".
- **Playoffs:** bracket with crests; **Champion:** trophy screen; **Eliminated:** run summary.

## Rules
- Mobile-aware: works at 390px wide (stack panels), 16px gutters, no horizontal scroll.
- Motion: short (150–250 ms) and purposeful; HP drains over 400 ms; no decorative loops.
- Text: plain words for the player ("Great Tusk used Headlong Rush! It's super effective!"), ids and
  protocol only in the log panel.
