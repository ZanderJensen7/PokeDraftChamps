# PokeDraftChamps

A free, solo, roguelike Pokemon draft league that runs in your browser.

Enter a league, snake-draft a roster against AI coaches, prep for each week's opponent with a built-in
prep doc (type matchups, speed tiers, notable moves, scouting from their earlier games), play your match
on a real Pokemon Showdown battle engine, watch the standings shift as the rest of the league plays,
make the playoff bracket, win the title. Lose too much and the run is over.

Built on the open-source Pokemon Showdown simulator via the [pkmn](https://pkmn.cc) packages.
Fan project, not affiliated with Nintendo, Game Freak or The Pokemon Company. Never monetized.

**Play it:** https://zanderjensen7.github.io/PokeDraftChamps/ (GitHub Pages, redeployed by `.github/workflows/deploy-pages.yml` on every push to `main`).

## Develop

```bash
npm install
npm run dev        # app at http://localhost:5173
npm test           # engine tests
npm run build      # typecheck + production build (static site in packages/app/dist)
```

See `docs/DESIGN.md` for the game design, `docs/ROGUELIKE.md` for the meta layer and `CLAUDE.md` for the code map.

## Online bits (optional)

The game is a static site and plays fully offline. Two optional pieces sit beside it, both free-tier Cloudflare:

- **Daily leaderboard + opt-in run summaries**: the Worker in `packages/api` (see its README to deploy). The app
  reads its URL from `VITE_PDC_API_URL`; without it the Daily League still plays and shows a share line instead
  of a board.
- **Page views**: Cloudflare Web Analytics, a cookieless beacon injected only when `VITE_CF_BEACON_TOKEN` is set.

Both are GitHub Actions repository *variables* (`PDC_API_URL`, `CF_BEACON_TOKEN`) for the Pages build, and the
Worker deploy needs the *secrets* `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Locally, copy
`packages/app/.env.example` to `packages/app/.env.local`.
