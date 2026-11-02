# PokeDraftChamps

A free, solo, roguelike Pokemon draft league that runs in your browser.

Enter a league, snake-draft a roster against AI coaches, prep for each week's opponent with a built-in
prep doc (type matchups, speed tiers, notable moves, scouting from their earlier games), play your match
on a real Pokemon Showdown battle engine, watch the standings shift as the rest of the league plays,
make the playoff bracket, win the title. Lose too much and the run is over.

Built on the open-source Pokemon Showdown simulator via the [pkmn](https://pkmn.cc) packages.
Fan project, not affiliated with Nintendo, Game Freak or The Pokemon Company. Never monetized.

## Develop

```bash
npm install
npm run dev        # app at http://localhost:5173
npm test           # engine tests
npm run build      # typecheck + production build (static site in packages/app/dist)
```

See `docs/DESIGN.md` for the game design and `CLAUDE.md` for the code map.
