# Balance lab: price-override input (2026-11-03)

The lab report `npm run prices` read to write the first `PRICE_OVERRIDES` table (see `docs/balance/prices.md`). Run at tier prices, before any override and before the draft AI's overpay guard (which reads `LAB_SCORES`, written from this same report), with `npm run balance -w @pdc/engine -- --leagues 40 --teams 12 --megas --seed 11`. Kept as provenance; `latest.md` moves on with every run.


2026-11-03T08:27:52.652Z - 40 AI-only leagues of 12 teams, 9 weeks, Megas on, Z captains 0, seed 11 (91.8 s).

## Sample

- Matches played: 2297
- Species drafted: 336; brought at least once: 310; with 15+ games: 217
- Mon-games: 27564
- Fit: score = 44.2 + 0.46 x price (217 species)
- Measured baseline: win 50%, 0.81 KO/game, 85.6 damage/game, 19% survival (score uses 0.79 KO/game, 83 damage/game)
- Measured per-species spread (SD): win 0.090, KO/g 0.24, dmg/g 26.3, survival 0.082

## Top 15 over-performers (score above the price line)

| # | Species | Price | Games | Win% | KO/g | Dmg/g | Surv | Score | Expected | Suggest |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Diancie | 12 | 49 | 65% | 1.53 | 148.1 | 33% | 68.0 | 49.8 | 15 (+3) |
| 2 | Kingambit | 18 | 52 | 65% | 1.48 | 137.9 | 37% | 67.7 | 52.5 | 20 (+2) |
| 3 | Mudsdale | 6 | 83 | 69% | 1.00 | 103.3 | 28% | 62.0 | 47.0 | 9 (+3) |
| 4 | Tauros-Paldea-Combat | 4 | 23 | 65% | 1.17 | 87.9 | 43% | 60.7 | 46.1 | 7 (+3) |
| 5 | Indeedee | 9 | 31 | 71% | 0.87 | 83.4 | 52% | 62.0 | 48.4 | 12 (+3) |
| 6 | Manaphy | 16 | 147 | 61% | 1.45 | 128.7 | 19% | 64.1 | 51.6 | 19 (+3) |
| 7 | Flutter Mane | 20 | 196 | 65% | 1.17 | 146.4 | 17% | 64.1 | 53.5 | - |
| 8 | Maushold | 12 | 165 | 58% | 1.07 | 117.4 | 29% | 60.0 | 49.8 | 15 (+3) |
| 9 | Gyarados | 14 | 64 | 56% | 1.38 | 133.6 | 20% | 60.9 | 50.7 | 17 (+3) |
| 10 | Salamence-Mega | 20 | 379 | 56% | 1.39 | 157.7 | 16% | 63.4 | 53.5 | - |
| 11 | Greninja | 15 | 87 | 64% | 0.98 | 103.9 | 31% | 60.6 | 51.2 | 18 (+3) |
| 12 | Iron Hands | 16 | 38 | 66% | 1.26 | 115.6 | 13% | 60.4 | 51.6 | 19 (+3) |
| 13 | Ogerpon-Cornerstone | 16 | 64 | 58% | 1.20 | 131.9 | 22% | 60.1 | 51.6 | 19 (+3) |
| 14 | Iron Boulder | 16 | 191 | 62% | 1.01 | 117.0 | 21% | 60.0 | 51.6 | 19 (+3) |
| 15 | Zebstrika | 4 | 28 | 61% | 0.68 | 69.6 | 39% | 54.4 | 46.1 | 7 (+3) |

## Top 15 under-performers (score below the price line)

| # | Species | Price | Games | Win% | KO/g | Dmg/g | Surv | Score | Expected | Suggest |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Glalie-Mega | 12 | 161 | 31% | 0.40 | 34.7 | 20% | 34.5 | 49.8 | 9 (-3) |
| 2 | Weavile | 15 | 18 | 17% | 0.61 | 91.0 | 6% | 37.7 | 51.2 | 12 (-3) |
| 3 | Moltres | 18 | 15 | 27% | 0.67 | 63.4 | 7% | 40.4 | 52.5 | 15 (-3) |
| 4 | Wugtrio | 3 | 27 | 19% | 0.33 | 61.4 | 11% | 33.6 | 45.6 | 1 (-2) |
| 5 | Banette-Mega | 12 | 156 | 37% | 0.39 | 39.6 | 24% | 37.8 | 49.8 | 9 (-3) |
| 6 | Sableye-Mega | 15 | 17 | 41% | 0.12 | 17.3 | 29% | 40.9 | 51.2 | 12 (-3) |
| 7 | Lilligant-Hisui | 14 | 41 | 32% | 0.63 | 67.4 | 17% | 40.5 | 50.7 | 11 (-3) |
| 8 | Cyclizar | 12 | 44 | 41% | 0.27 | 32.4 | 27% | 40.0 | 49.8 | 9 (-3) |
| 9 | Gastrodon | 12 | 83 | 36% | 0.69 | 59.4 | 13% | 40.6 | 49.8 | 9 (-3) |
| 10 | Brambleghast | 10 | 79 | 43% | 0.33 | 33.3 | 22% | 39.7 | 48.9 | 7 (-3) |
| 11 | Charizard | 5 | 108 | 36% | 0.51 | 54.4 | 8% | 37.5 | 46.5 | 2 (-3) |
| 12 | Hawlucha | 14 | 27 | 22% | 0.93 | 96.4 | 15% | 41.8 | 50.7 | 11 (-3) |
| 13 | Dusknoir | 5 | 69 | 26% | 0.74 | 75.7 | 9% | 37.6 | 46.5 | 2 (-3) |
| 14 | Zoroark-Hisui | 14 | 380 | 52% | 0.33 | 31.8 | 21% | 42.1 | 50.7 | 11 (-3) |
| 15 | Galvantula | 4 | 93 | 37% | 0.44 | 41.0 | 16% | 37.5 | 46.1 | 1 (-3) |

## Mean score per price

| Price | Species | Games | Mean score | Fit | Mean win% | Mean KO/g |
|---|---|---|---|---|---|---|
| 3 | 7 | 235 | 43.6 | 45.6 | 42% | 0.50 |
| 4 | 18 | 886 | 47.3 | 46.1 | 49% | 0.64 |
| 5 | 14 | 1260 | 46.4 | 46.5 | 45% | 0.71 |
| 6 | 11 | 917 | 48.6 | 47.0 | 52% | 0.57 |
| 7 | 13 | 817 | 47.8 | 47.5 | 48% | 0.71 |
| 9 | 3 | 444 | 55.5 | 48.4 | 58% | 0.84 |
| 10 | 25 | 3130 | 48.2 | 48.9 | 49% | 0.71 |
| 11 | 8 | 718 | 48.5 | 49.3 | 48% | 0.74 |
| 12 | 33 | 4312 | 49.5 | 49.8 | 50% | 0.81 |
| 14 | 13 | 1794 | 48.7 | 50.7 | 47% | 0.79 |
| 15 | 22 | 3097 | 48.6 | 51.2 | 49% | 0.74 |
| 16 | 17 | 3268 | 52.9 | 51.6 | 51% | 0.97 |
| 18 | 10 | 1876 | 53.4 | 52.5 | 53% | 0.94 |
| 19 | 8 | 1533 | 52.3 | 53.0 | 49% | 1.01 |
| 20 | 15 | 2621 | 56.1 | 53.5 | 55% | 0.99 |

## Draft quality

Per round: mean price paid, and for picks of species with 15+ games their lab score and residual to the price line
(negative = paid more than the mon played like). Points per score = price / score (lower is better value).

| Round | Picks | Mean price | Scored | Mean score | Residual | Points per score |
|---|---|---|---|---|---|---|
| 1 | 480 | 18.4 | 479 | 54.2 | +1.5 | 0.340 |
| 2 | 480 | 16.8 | 477 | 51.4 | -0.6 | 0.328 |
| 3 | 480 | 15.5 | 475 | 50.8 | -0.6 | 0.307 |
| 4 | 480 | 14.8 | 453 | 51.4 | +0.3 | 0.290 |
| 5 | 480 | 12.9 | 428 | 50.6 | +0.4 | 0.259 |
| 6 | 480 | 11.4 | 416 | 48.9 | -0.6 | 0.235 |
| 7 | 480 | 10.7 | 430 | 48.7 | -0.5 | 0.221 |
| 8 | 480 | 8.4 | 412 | 48.3 | +0.2 | 0.174 |
| 9 | 480 | 6.4 | 375 | 47.6 | +0.4 | 0.138 |
| 10 | 284 | 5.2 | 180 | 46.2 | -0.5 | 0.117 |
| 11 | 130 | 4.2 | 78 | 45.9 | -0.3 | 0.094 |

Roster shape over 480 rosters: a role counts when a rolled season set carries one of its moves
(MOVE_CATEGORIES); "could roll" counts any drafted species whose randoms movepool has one (what the draft AI sees).

| Role | In the sets | Could roll |
|---|---|---|
| Entry Hazards | 75% | 95% |
| Hazard Removal | 39% | 56% |
| Healing | 92% | 98% |
| Priority | 76% | 90% |
| A fast mon (base Spe >= 100) | 100% | |
| A bulky mon (HP + Def + SpD >= 290) | 100% | |

- Roster sizes: 9 mons 41%, 10 mons 32%, 11 mons 27%
- Draft time: 0.30 ms per pick (whole draft, all coaches)

## All suggestions (168)

| Species | Price | Suggested | Delta | Games | Score | Reason |
|---|---|---|---|---|---|---|
| Diancie | 12 | 15 | +3 | 49 | 68.0 | Won 65% when brought and 1.5 KOs/game at 12 pts; plays like a 19. |
| Mudsdale | 6 | 9 | +3 | 83 | 62.0 | Won 69% when brought and 1.0 KOs/game at 6 pts; plays like a 12. |
| Tauros-Paldea-Combat | 4 | 7 | +3 | 23 | 60.7 | Won 65% when brought and 1.2 KOs/game at 4 pts; plays like a 10. |
| Indeedee | 9 | 12 | +3 | 31 | 62.0 | Won 71% when brought and 0.9 KOs/game at 9 pts; plays like a 14. |
| Manaphy | 16 | 19 | +3 | 147 | 64.1 | Won 61% when brought and 1.4 KOs/game at 16 pts; plays like a 20. |
| Maushold | 12 | 15 | +3 | 165 | 60.0 | Won 58% when brought and 1.1 KOs/game at 12 pts; plays like a 16. |
| Gyarados | 14 | 17 | +3 | 64 | 60.9 | Won 56% when brought and 1.4 KOs/game at 14 pts; plays like a 18. |
| Greninja | 15 | 18 | +3 | 87 | 60.6 | Won 64% when brought and 1.0 KOs/game at 15 pts; plays like a 19. |
| Iron Hands | 16 | 19 | +3 | 38 | 60.4 | Won 66% when brought and 1.3 KOs/game at 16 pts; plays like a 20. |
| Ogerpon-Cornerstone | 16 | 19 | +3 | 64 | 60.1 | Won 58% when brought and 1.2 KOs/game at 16 pts; plays like a 19. |
| Iron Boulder | 16 | 19 | +3 | 191 | 60.0 | Won 62% when brought and 1.0 KOs/game at 16 pts; plays like a 19. |
| Zebstrika | 4 | 7 | +3 | 28 | 54.4 | Won 61% when brought and 0.7 KOs/game at 4 pts; plays like a 7. |
| Incineroar | 10 | 13 | +3 | 22 | 56.8 | Won 64% when brought and 0.8 KOs/game at 10 pts; plays like a 13. |
| Vikavolt | 4 | 7 | +3 | 50 | 53.7 | Won 64% when brought and 0.7 KOs/game at 4 pts; plays like a 7. |
| Emboar | 7 | 10 | +3 | 40 | 55.0 | Won 60% when brought and 0.9 KOs/game at 7 pts; plays like a 10. |
| Meloetta | 10 | 13 | +3 | 120 | 56.4 | Won 61% when brought and 0.9 KOs/game at 10 pts; plays like a 13. |
| Magnezone | 12 | 15 | +3 | 89 | 57.1 | Won 54% when brought and 1.1 KOs/game at 12 pts; plays like a 15. |
| Houndstone | 10 | 13 | +3 | 162 | 56.2 | Won 53% when brought and 1.0 KOs/game at 10 pts; plays like a 13. |
| Ludicolo | 4 | 7 | +3 | 20 | 52.6 | Won 65% when brought and 0.6 KOs/game at 4 pts; plays like a 7. |
| Kingambit | 18 | 20 | +2 | 52 | 67.7 | Won 65% when brought and 1.5 KOs/game at 18 pts; plays like a 20. |
| Raging Bolt | 18 | 20 | +2 | 18 | 59.7 | Won 67% when brought and 1.2 KOs/game at 18 pts; plays like a 20. |
| Suicune | 12 | 14 | +2 | 29 | 55.9 | Won 55% when brought and 1.2 KOs/game at 12 pts; plays like a 14. |
| Sceptile | 5 | 7 | +2 | 21 | 52.3 | Won 62% when brought and 0.7 KOs/game at 5 pts; plays like a 7. |
| Tentacruel | 6 | 8 | +2 | 53 | 52.7 | Won 60% when brought and 0.7 KOs/game at 6 pts; plays like a 8. |
| Ogerpon-Wellspring | 18 | 20 | +2 | 173 | 58.1 | Won 57% when brought and 1.1 KOs/game at 18 pts; plays like a 20. |
| Regieleki | 12 | 14 | +2 | 312 | 55.2 | Won 52% when brought and 0.9 KOs/game at 12 pts; plays like a 14. |
| Camerupt | 3 | 5 | +2 | 28 | 50.9 | Won 57% when brought and 0.7 KOs/game at 3 pts; plays like a 5. |
| Qwilfish-Hisui | 5 | 7 | +2 | 119 | 51.7 | Won 57% when brought and 0.7 KOs/game at 5 pts; plays like a 7. |
| Toxicroak | 4 | 6 | +2 | 29 | 51.1 | Won 55% when brought and 0.7 KOs/game at 4 pts; plays like a 6. |
| Ambipom | 6 | 8 | +2 | 200 | 51.8 | Won 56% when brought and 0.7 KOs/game at 6 pts; plays like a 8. |
| Heracross | 6 | 8 | +2 | 60 | 51.5 | Won 53% when brought and 0.7 KOs/game at 6 pts; plays like a 8. |
| Basculegion-F | 12 | 14 | +2 | 48 | 54.2 | Won 56% when brought and 1.0 KOs/game at 12 pts; plays like a 14. |
| Feraligatr | 11 | 13 | +2 | 71 | 53.7 | Won 52% when brought and 1.0 KOs/game at 11 pts; plays like a 13. |
| Oricorio-Pom-Pom | 14 | 16 | +2 | 32 | 55.1 | Won 66% when brought and 0.6 KOs/game at 14 pts; plays like a 16. |
| Electrode-Hisui | 7 | 9 | +2 | 58 | 51.7 | Won 52% when brought and 0.7 KOs/game at 7 pts; plays like a 9. |
| Inteleon | 9 | 11 | +2 | 314 | 52.6 | Won 53% when brought and 0.8 KOs/game at 9 pts; plays like a 11. |
| Blissey | 12 | 14 | +2 | 56 | 53.8 | Won 59% when brought and 0.8 KOs/game at 12 pts; plays like a 14. |
| Goodra-Hisui | 12 | 14 | +2 | 92 | 53.8 | Won 52% when brought and 1.0 KOs/game at 12 pts; plays like a 14. |
| Metagross | 15 | 17 | +2 | 172 | 55.1 | Won 56% when brought and 0.9 KOs/game at 15 pts; plays like a 17. |
| Arcanine | 7 | 9 | +2 | 22 | 51.4 | Won 50% when brought and 0.9 KOs/game at 7 pts; plays like a 9. |
| Iron Valiant | 18 | 20 | +2 | 188 | 56.3 | Won 59% when brought and 0.9 KOs/game at 18 pts; plays like a 20. |
| Dragapult | 19 | 20 | +1 | 189 | 57.1 | Won 57% when brought and 1.0 KOs/game at 19 pts; plays like a 20. |
| Scizor-Mega | 19 | 20 | +1 | 240 | 57.1 | Won 55% when brought and 1.1 KOs/game at 19 pts; plays like a 20. |
| Mew | 12 | 13 | +1 | 217 | 53.5 | Won 59% when brought and 0.8 KOs/game at 12 pts; plays like a 13. |
| Shaymin | 7 | 8 | +1 | 37 | 51.1 | Won 51% when brought and 0.8 KOs/game at 7 pts; plays like a 8. |
| Mabosstiff | 4 | 5 | +1 | 26 | 49.8 | Won 50% when brought and 0.8 KOs/game at 4 pts; plays like a 5. |
| Iron Leaves | 14 | 15 | +1 | 79 | 54.3 | Won 62% when brought and 0.8 KOs/game at 14 pts; plays like a 15. |
| Rotom-Heat | 9 | 10 | +1 | 99 | 52.0 | Won 51% when brought and 0.9 KOs/game at 9 pts; plays like a 10. |
| Gardevoir | 12 | 13 | +1 | 20 | 53.3 | Won 55% when brought and 1.0 KOs/game at 12 pts; plays like a 13. |
| Pecharunt | 19 | 20 | +1 | 31 | 56.5 | Won 55% when brought and 1.3 KOs/game at 19 pts; plays like a 20. |
| Flygon | 10 | 11 | +1 | 107 | 52.1 | Won 54% when brought and 0.8 KOs/game at 10 pts; plays like a 11. |
| Tauros-Paldea-Blaze | 6 | 7 | +1 | 22 | 50.2 | Won 59% when brought and 0.5 KOs/game at 6 pts; plays like a 7. |
| Noivern | 12 | 13 | +1 | 21 | 53.0 | Won 57% when brought and 1.0 KOs/game at 12 pts; plays like a 13. |
| Entei | 12 | 13 | +1 | 287 | 53.0 | Won 53% when brought and 1.0 KOs/game at 12 pts; plays like a 13. |
| Hoopa | 7 | 8 | +1 | 299 | 50.5 | Won 51% when brought and 0.8 KOs/game at 7 pts; plays like a 8. |
| Golduck | 4 | 5 | +1 | 44 | 49.1 | Won 52% when brought and 0.6 KOs/game at 4 pts; plays like a 5. |
| Terrakion | 12 | 13 | +1 | 62 | 52.7 | Won 58% when brought and 0.7 KOs/game at 12 pts; plays like a 13. |
| Scizor | 15 | 16 | +1 | 129 | 54.1 | Won 48% when brought and 1.1 KOs/game at 15 pts; plays like a 16. |
| Walking Wake | 18 | 19 | +1 | 345 | 55.2 | Won 57% when brought and 1.0 KOs/game at 18 pts; plays like a 19. |
| Weezing-Galar | 12 | 13 | +1 | 19 | 52.4 | Won 58% when brought and 1.1 KOs/game at 12 pts; plays like a 13. |
| Tauros | 4 | 5 | +1 | 52 | 48.6 | Won 50% when brought and 0.7 KOs/game at 4 pts; plays like a 5. |
| Muk-Alola | 12 | 13 | +1 | 127 | 52.3 | Won 51% when brought and 1.0 KOs/game at 12 pts; plays like a 13. |
| Iron Crown | 16 | 17 | +1 | 244 | 54.0 | Won 52% when brought and 0.9 KOs/game at 16 pts; plays like a 17. |
| Slaking | 5 | 6 | +1 | 329 | 48.9 | Won 51% when brought and 0.9 KOs/game at 5 pts; plays like a 6. |
| Charizard-Mega-X | 16 | 17 | +1 | 333 | 53.9 | Won 50% when brought and 1.1 KOs/game at 16 pts; plays like a 17. |
| Electivire | 5 | 6 | +1 | 156 | 48.8 | Won 54% when brought and 0.7 KOs/game at 5 pts; plays like a 6. |
| Cetitan | 11 | 12 | +1 | 48 | 51.5 | Won 52% when brought and 0.9 KOs/game at 11 pts; plays like a 12. |
| Clodsire | 15 | 16 | +1 | 21 | 53.2 | Won 62% when brought and 0.7 KOs/game at 15 pts; plays like a 16. |
| Typhlosion-Hisui | 7 | 8 | +1 | 18 | 49.5 | Won 56% when brought and 0.7 KOs/game at 7 pts; plays like a 8. |
| Tyranitar-Mega | 19 | 20 | +1 | 71 | 55.0 | Won 54% when brought and 1.1 KOs/game at 19 pts; plays like a 20. |
| Volcanion | 14 | 15 | +1 | 147 | 52.4 | Won 47% when brought and 1.1 KOs/game at 14 pts; plays like a 15. |
| Garchomp | 16 | 17 | +1 | 326 | 53.3 | Won 54% when brought and 1.0 KOs/game at 16 pts; plays like a 17. |
| Latios | 15 | 16 | +1 | 112 | 52.8 | Won 52% when brought and 1.0 KOs/game at 15 pts; plays like a 16. |
| Arbok | 3 | 4 | +1 | 30 | 47.3 | Won 57% when brought and 0.4 KOs/game at 3 pts; plays like a 4. |
| Kingdra | 7 | 8 | +1 | 25 | 49.1 | Won 56% when brought and 0.6 KOs/game at 7 pts; plays like a 8. |
| Raikou | 10 | 11 | +1 | 273 | 50.4 | Won 50% when brought and 0.8 KOs/game at 10 pts; plays like a 11. |
| Chandelure | 10 | 11 | +1 | 89 | 50.4 | Won 49% when brought and 0.8 KOs/game at 10 pts; plays like a 11. |
| Regigigas | 5 | 6 | +1 | 75 | 48.0 | Won 52% when brought and 0.6 KOs/game at 5 pts; plays like a 6. |
| Lumineon | 3 | 4 | +1 | 17 | 47.0 | Won 47% when brought and 0.5 KOs/game at 3 pts; plays like a 4. |
| Typhlosion | 5 | 6 | +1 | 18 | 47.9 | Won 44% when brought and 0.7 KOs/game at 5 pts; plays like a 6. |
| Moltres-Galar | 16 | 17 | +1 | 59 | 52.9 | Won 53% when brought and 1.1 KOs/game at 16 pts; plays like a 17. |
| Basculegion | 10 | 11 | +1 | 91 | 50.1 | Won 47% when brought and 1.0 KOs/game at 10 pts; plays like a 11. |
| Venomoth | 7 | 6 | -1 | 77 | 43.8 | Won 44% when brought and 0.4 KOs/game at 7 pts; plays like a 6. |
| Diancie-Mega | 19 | 18 | -1 | 282 | 49.4 | Won 44% when brought and 1.0 KOs/game at 19 pts; plays like a 18. |
| Overqwil | 10 | 9 | -1 | 336 | 45.3 | Won 46% when brought and 0.7 KOs/game at 10 pts; plays like a 9. |
| Azelf | 11 | 10 | -1 | 50 | 45.8 | Won 44% when brought and 0.6 KOs/game at 11 pts; plays like a 10. |
| Forretress | 12 | 11 | -1 | 226 | 46.3 | Won 53% when brought and 0.6 KOs/game at 12 pts; plays like a 11. |
| Iron Treads | 18 | 17 | -1 | 210 | 49.1 | Won 51% when brought and 0.7 KOs/game at 18 pts; plays like a 17. |
| Samurott | 5 | 4 | -1 | 44 | 43.2 | Won 36% when brought and 0.7 KOs/game at 5 pts; plays like a 4. |
| Gardevoir-Mega | 16 | 15 | -1 | 368 | 48.4 | Won 46% when brought and 0.8 KOs/game at 16 pts; plays like a 15. |
| Regidrago | 11 | 10 | -1 | 23 | 46.2 | Won 43% when brought and 0.7 KOs/game at 11 pts; plays like a 10. |
| Deoxys-Defense | 11 | 10 | -1 | 32 | 46.3 | Won 47% when brought and 0.7 KOs/game at 11 pts; plays like a 10. |
| Iron Jugulis | 15 | 14 | -1 | 168 | 48.1 | Won 47% when brought and 0.9 KOs/game at 15 pts; plays like a 14. |
| Lucario | 11 | 10 | -1 | 27 | 46.3 | Won 48% when brought and 0.5 KOs/game at 11 pts; plays like a 10. |
| Luxray | 5 | 4 | -1 | 70 | 43.5 | Won 39% when brought and 0.8 KOs/game at 5 pts; plays like a 4. |
| Thundurus-Therian | 15 | 14 | -1 | 373 | 48.2 | Won 49% when brought and 0.8 KOs/game at 15 pts; plays like a 14. |
| Zoroark | 6 | 5 | -1 | 53 | 44.1 | Won 53% when brought and 0.2 KOs/game at 6 pts; plays like a 5. |
| Golurk | 6 | 5 | -1 | 26 | 44.1 | Won 46% when brought and 0.4 KOs/game at 6 pts; plays like a 5. |
| Florges | 7 | 6 | -1 | 61 | 44.6 | Won 43% when brought and 0.6 KOs/game at 7 pts; plays like a 6. |
| Latias | 16 | 15 | -1 | 334 | 48.8 | Won 46% when brought and 0.9 KOs/game at 16 pts; plays like a 15. |
| Shaymin-Sky | 20 | 19 | -1 | 119 | 50.7 | Won 51% when brought and 0.8 KOs/game at 20 pts; plays like a 19. |
| Revavroom | 15 | 14 | -1 | 19 | 48.7 | Won 53% when brought and 0.7 KOs/game at 15 pts; plays like a 14. |
| Fezandipiti | 15 | 14 | -1 | 246 | 48.7 | Won 52% when brought and 0.7 KOs/game at 15 pts; plays like a 14. |
| Espeon | 10 | 9 | -1 | 35 | 46.5 | Won 46% when brought and 0.5 KOs/game at 10 pts; plays like a 9. |
| Misdreavus | 3 | 2 | -1 | 23 | 43.3 | Won 35% when brought and 0.7 KOs/game at 3 pts; plays like a 2. |
| Copperajah | 10 | 9 | -1 | 21 | 46.6 | Won 43% when brought and 0.9 KOs/game at 10 pts; plays like a 9. |
| Mimikyu | 12 | 11 | -1 | 243 | 47.6 | Won 47% when brought and 0.8 KOs/game at 12 pts; plays like a 11. |
| Whiscash | 3 | 2 | -1 | 91 | 43.5 | Won 49% when brought and 0.5 KOs/game at 3 pts; plays like a 2. |
| Dudunsparce | 10 | 9 | -1 | 18 | 46.8 | Won 44% when brought and 0.7 KOs/game at 10 pts; plays like a 9. |
| Gyarados-Mega | 16 | 15 | -1 | 196 | 49.8 | Won 46% when brought and 0.9 KOs/game at 16 pts; plays like a 15. |
| Chien-Pao | 20 | 19 | -1 | 48 | 52.0 | Won 48% when brought and 0.9 KOs/game at 20 pts; plays like a 19. |
| Thundurus | 14 | 13 | -1 | 377 | 49.2 | Won 53% when brought and 0.6 KOs/game at 14 pts; plays like a 13. |
| Roaring Moon | 20 | 19 | -1 | 116 | 52.0 | Won 49% when brought and 0.9 KOs/game at 20 pts; plays like a 19. |
| Swampert | 10 | 9 | -1 | 288 | 47.4 | Won 48% when brought and 0.8 KOs/game at 10 pts; plays like a 9. |
| Salazzle | 6 | 5 | -1 | 71 | 45.6 | Won 49% when brought and 0.5 KOs/game at 6 pts; plays like a 5. |
| Porygon-Z | 11 | 10 | -1 | 296 | 48.0 | Won 47% when brought and 0.7 KOs/game at 11 pts; plays like a 10. |
| Wugtrio | 3 | 1 | -2 | 27 | 33.6 | Won 19% when brought and 0.3 KOs/game at 3 pts; plays like a 1. |
| Banette | 3 | 1 | -2 | 19 | 39.3 | Won 32% when brought and 0.4 KOs/game at 3 pts; plays like a 1. |
| Klefki | 10 | 8 | -2 | 31 | 42.8 | Won 45% when brought and 0.5 KOs/game at 10 pts; plays like a 8. |
| Registeel | 12 | 10 | -2 | 34 | 43.8 | Won 41% when brought and 0.8 KOs/game at 12 pts; plays like a 10. |
| Kommo-o | 16 | 14 | -2 | 28 | 46.0 | Won 43% when brought and 0.7 KOs/game at 16 pts; plays like a 14. |
| Slowbro-Mega | 14 | 12 | -2 | 20 | 45.3 | Won 35% when brought and 0.9 KOs/game at 14 pts; plays like a 12. |
| Enamorus | 18 | 16 | -2 | 313 | 47.2 | Won 48% when brought and 0.7 KOs/game at 18 pts; plays like a 16. |
| Heracross-Mega | 14 | 12 | -2 | 88 | 45.5 | Won 44% when brought and 0.7 KOs/game at 14 pts; plays like a 12. |
| Meowscarada | 16 | 14 | -2 | 17 | 46.5 | Won 41% when brought and 0.6 KOs/game at 16 pts; plays like a 14. |
| Tauros-Paldea-Aqua | 10 | 8 | -2 | 57 | 43.8 | Won 39% when brought and 0.7 KOs/game at 10 pts; plays like a 8. |
| Gallade-Mega | 16 | 14 | -2 | 316 | 46.6 | Won 42% when brought and 0.8 KOs/game at 16 pts; plays like a 14. |
| Scream Tail | 10 | 8 | -2 | 34 | 43.9 | Won 41% when brought and 0.6 KOs/game at 10 pts; plays like a 8. |
| Quagsire | 12 | 10 | -2 | 23 | 45.1 | Won 43% when brought and 0.7 KOs/game at 12 pts; plays like a 10. |
| Houndoom-Mega | 12 | 10 | -2 | 338 | 45.2 | Won 44% when brought and 0.6 KOs/game at 12 pts; plays like a 10. |
| Raichu | 4 | 2 | -2 | 18 | 41.7 | Won 39% when brought and 0.3 KOs/game at 4 pts; plays like a 2. |
| Electrode | 4 | 2 | -2 | 27 | 41.8 | Won 41% when brought and 0.4 KOs/game at 4 pts; plays like a 2. |
| Blastoise-Mega | 20 | 18 | -2 | 75 | 49.1 | Won 52% when brought and 0.6 KOs/game at 20 pts; plays like a 18. |
| Sceptile-Mega | 12 | 10 | -2 | 88 | 45.5 | Won 48% when brought and 0.5 KOs/game at 12 pts; plays like a 10. |
| Camerupt-Mega | 12 | 10 | -2 | 174 | 45.5 | Won 47% when brought and 0.7 KOs/game at 12 pts; plays like a 10. |
| Ribombee | 10 | 8 | -2 | 170 | 44.8 | Won 45% when brought and 0.5 KOs/game at 10 pts; plays like a 8. |
| Zapdos | 18 | 16 | -2 | 296 | 48.6 | Won 46% when brought and 0.9 KOs/game at 18 pts; plays like a 16. |
| Tornadus | 10 | 8 | -2 | 205 | 45.1 | Won 45% when brought and 0.6 KOs/game at 10 pts; plays like a 8. |
| Glalie-Mega | 12 | 9 | -3 | 161 | 34.5 | Won 31% when brought and 0.4 KOs/game at 12 pts; plays like a 6. |
| Weavile | 15 | 12 | -3 | 18 | 37.7 | Won 17% when brought and 0.6 KOs/game at 15 pts; plays like a 10. |
| Moltres | 18 | 15 | -3 | 15 | 40.4 | Won 27% when brought and 0.7 KOs/game at 18 pts; plays like a 13. |
| Banette-Mega | 12 | 9 | -3 | 156 | 37.8 | Won 37% when brought and 0.4 KOs/game at 12 pts; plays like a 7. |
| Sableye-Mega | 15 | 12 | -3 | 17 | 40.9 | Won 41% when brought and 0.1 KOs/game at 15 pts; plays like a 11. |
| Lilligant-Hisui | 14 | 11 | -3 | 41 | 40.5 | Won 32% when brought and 0.6 KOs/game at 14 pts; plays like a 10. |
| Cyclizar | 12 | 9 | -3 | 44 | 40.0 | Won 41% when brought and 0.3 KOs/game at 12 pts; plays like a 8. |
| Gastrodon | 12 | 9 | -3 | 83 | 40.6 | Won 36% when brought and 0.7 KOs/game at 12 pts; plays like a 8. |
| Brambleghast | 10 | 7 | -3 | 79 | 39.7 | Won 43% when brought and 0.3 KOs/game at 10 pts; plays like a 6. |
| Charizard | 5 | 2 | -3 | 108 | 37.5 | Won 36% when brought and 0.5 KOs/game at 5 pts; plays like a 1. |
| Hawlucha | 14 | 11 | -3 | 27 | 41.8 | Won 22% when brought and 0.9 KOs/game at 14 pts; plays like a 10. |
| Dusknoir | 5 | 2 | -3 | 69 | 37.6 | Won 26% when brought and 0.7 KOs/game at 5 pts; plays like a 1. |
| Zoroark-Hisui | 14 | 11 | -3 | 380 | 42.1 | Won 52% when brought and 0.3 KOs/game at 14 pts; plays like a 11. |
| Galvantula | 4 | 1 | -3 | 93 | 37.5 | Won 37% when brought and 0.4 KOs/game at 4 pts; plays like a 1. |
| Mienshao | 14 | 11 | -3 | 44 | 42.4 | Won 43% when brought and 0.3 KOs/game at 14 pts; plays like a 11. |
| Charizard-Mega-Y | 19 | 16 | -3 | 344 | 44.9 | Won 47% when brought and 0.6 KOs/game at 19 pts; plays like a 16. |
| Pawmot | 6 | 3 | -3 | 23 | 39.0 | Won 30% when brought and 0.3 KOs/game at 6 pts; plays like a 3. |
| Gengar | 12 | 9 | -3 | 199 | 41.9 | Won 44% when brought and 0.5 KOs/game at 12 pts; plays like a 9. |
| Comfey | 12 | 9 | -3 | 182 | 42.0 | Won 39% when brought and 0.6 KOs/game at 12 pts; plays like a 9. |
| Rotom-Mow | 7 | 4 | -3 | 25 | 39.8 | Won 32% when brought and 0.6 KOs/game at 7 pts; plays like a 4. |
| Oricorio | 7 | 4 | -3 | 92 | 39.9 | Won 37% when brought and 0.6 KOs/game at 7 pts; plays like a 4. |
| Skarmory | 15 | 12 | -3 | 38 | 43.9 | Won 34% when brought and 0.8 KOs/game at 15 pts; plays like a 12. |
| Sandy Shocks | 15 | 12 | -3 | 133 | 44.0 | Won 52% when brought and 0.5 KOs/game at 15 pts; plays like a 12. |
| Floatzel | 4 | 1 | -3 | 34 | 39.1 | Won 26% when brought and 0.7 KOs/game at 4 pts; plays like a 1. |
| Landorus-Therian | 19 | 16 | -3 | 15 | 46.2 | Won 33% when brought and 1.0 KOs/game at 19 pts; plays like a 16. |
| Mismagius | 4 | 1 | -3 | 257 | 39.3 | Won 41% when brought and 0.4 KOs/game at 4 pts; plays like a 1. |
| Greninja-Bond | 15 | 12 | -3 | 111 | 44.4 | Won 49% when brought and 0.4 KOs/game at 15 pts; plays like a 12. |
| Heatran | 15 | 12 | -3 | 303 | 44.6 | Won 47% when brought and 0.7 KOs/game at 15 pts; plays like a 12. |
| Swampert-Mega | 15 | 12 | -3 | 239 | 44.7 | Won 41% when brought and 0.9 KOs/game at 15 pts; plays like a 12. |
| Talonflame | 15 | 12 | -3 | 172 | 44.8 | Won 49% when brought and 0.5 KOs/game at 15 pts; plays like a 12. |
