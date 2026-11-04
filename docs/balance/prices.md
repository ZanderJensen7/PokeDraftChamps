# Price overrides log

`PRICE_OVERRIDES` (`packages/engine/src/data/points.ts`) sets absolute prices for species whose balance-lab record says the tier price is wrong. `priceOf` reads it, and so does every price in the game: the pool, the budget checks and the captain cap.

The table is generated, never edited by hand:

```
npm run balance -w @pdc/engine -- --leagues 40 --teams 12 --megas --seed <S>
npm run prices -w @pdc/engine        (--dry prints the moves without writing)
```

`npm run prices` reads `docs/balance/latest.json`. It rewrites the generated blocks of `points.ts` (`PRICE_OVERRIDES`) and `data/labScores.ts` (`LAB_FIT`, `LAB_SCORES`, which the draft AI's overpay guard reads).

**The rule** (`PRICE_RULE` in `scripts/prices.ts`), step by step:
1. A species moves only with 60+ lab games.
2. Its "plays like" price is its price plus its gap to the score-by-price line, divided by the slope.
3. That price is shrunk toward the tier price by games / (games + 60).
4. The result is rounded, kept within 2 points of the current price, and kept within 1..20.

A species that lands back on its tier price loses its override. One with too few games keeps whatever it had.

## Run 1 (2026-11-03)

The input was a lab at tier prices with Megas on, seed 11, 40 leagues × 12 teams. The report is kept in `prices-2026-11-03-input.md`.
- The fit was score = 44.2 + 0.46 × price over 217 species, and 127 species had 60+ games.
- The run wrote 83 overrides: 38 raises and 45 cuts. 33 of them moved the full 2 points.

The fit, before and after. "SD" is the residual SD of the species scores around the fitted line. "15+" and "60+" are the species included, by games.

| Lab | Prices | Fit (15+ games) | SD (15+) | R² (15+) | Slope (60+) | SD (60+) |
|---|---|---|---|---|---|---|
| seed 11 (the input) | tier | 44.2 + 0.46 × price | 5.63 | 0.15 | 0.60 | 5.21 |
| seed 11 | overrides | 43.4 + 0.51 × price | 5.21 | 0.20 | 0.66 | 4.62 |
| seed 12 (fresh) | tier | 44.0 + 0.45 × price | 4.71 | 0.19 | 0.56 | 4.43 |
| seed 12 (fresh) | overrides | 43.7 + 0.50 × price | 5.40 | 0.18 | 0.69 | 5.09 |

The reference slope is 0.66, from the lab of 2026-11-02 (no Megas). Read honestly:
- **The slope rose** by about 0.05 on both seeds, from 0.45–0.46 to 0.50–0.51. That is still short of 0.66 across all species. Only the 60+ game species reach it.
- **The residual SD did not improve out of sample.** On the input seed it fell from 5.63 to 5.21, but that is in-sample. On a fresh seed it rose from 4.71 to 5.40.
- **That SD is a noisy number.** At the same tier prices it swings from 5.63 to 4.71 between two seeds, which is more than either change above. One rerun can neither confirm nor reject the table.
- **The signal is real.** A species' residual on seed 11 predicts its residual on seed 12: r = 0.51 at 15+ games, 0.58 at 60+, and 0.69 at 150+. The regression slope at 60+ games is 0.52, which matches the half weight the rule gives at 60 games.
- **Raises worked better than cuts.** On seed 12, the raised species' mean residual went from +2.2 to +1.3, and the cut species stayed near −3.1. A 2-point cut moves the expected score only about 1 point, so the cuts need more runs to land.
- **Next:** run the lab again and `npm run prices` again. Each run moves a species at most 2 points, so the table converges over passes rather than in one. Judge it by a fresh seed run twice, at tier prices and with the overrides (point `priceOf` at `tierPriceOf` for the first; `--out` keeps `latest.md`), not by one SD.

**Outlier check after run 1** (seed 11, overrides on): at the 20-point cap, Flutter Mane scores 65.5 over 293 games against a median of 56.9 for the 20s. It is the next outlier, but nowhere near Mega Mewtwo's 80+ (the bar for `BANNED_MEGAS`), so no ban. Below the cap the top scorers are Registeel (12 points, 62.7), Kommo-o (16, 62.4) and Raging Bolt (18, 62.4); the next `npm run prices` pass is for them.
