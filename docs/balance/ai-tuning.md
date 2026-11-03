# Battle AI tuning log

Every change to `HeuristicPlayer` is measured head to head before it ships. Run it with:

```
npm run arena -w @pdc/engine -- --games 2000 --seed 11 --a smartSack
```

Each game is a **mirror**: both sides bring the same six randoms sets, and each team is played twice, with A on p1 and then on p2. Only the play differs. With `--pairs`, two different teams play instead (A takes team 1 on p1, then team 2 on p2). That is noisier, because team strength dominates. The 95% intervals are Wilson intervals.

**The bar:** a variant is kept only if it wins at least 55% over 300+ games, confirmed on a fresh seed.

**The arena code:** every variant below is in commit `6ccc869`, in `HeuristicDials` there. The commit after it removes the variants that missed the bar. Today `HEURISTIC_DIALS` holds only `epsilon`.

## Result (2026-11-03)

**No variant cleared the bar. The default AI is unchanged.**

The closest was smarter sacking (`smartSack`), at 53–55% over 8,000 mirror games. That is a real but small edge. Its parts on their own reached 51–52%, which is weaker than the whole. Against different teams (`--pairs`) it vanished (50.9%). It stays a candidate for the next tuning pass. It is not a default under this rule.

Stake 4's knowledge bonus (`aiKnowsSets`: the AI reads your real sets) was re-run against this default. It wins 57.6% [55.5–59.8] over 2,000 mirror games, so it still clearly beats 50%. The stake 4 test in `battle.test.ts` is green.

## Runs

Mirror teams, 1 Tera captain per side unless noted. B is the default AI.

| A (challenger) | Seed | Games | Tera | A wins | 95% CI |
|---|---|---|---|---|---|
| default (sanity) | 11 | 2000 | 1 | 50.6% | 48.5–52.8 |
| epsilon 0.02 | 12 | 2000 | 1 | 50.1% | 48.0–52.3 |
| one-turn lookahead | 13 | 2000 | 1 | 50.1% | 47.9–52.3 |
| smartSack | 14 | 2000 | 1 | 54.9% | 52.8–57.1 |
| smartSack (confirm) | 22 | 4000 | 1 | 53.1% | 51.5–54.6 |
| smartSack (confirm) | 23 | 4000 | 2 | 53.3% | 51.8–54.9 |
| smartSack, `--pairs` | 26 | 2000 | 1 | 50.9% | 48.8–53.1 |
| freeEntry (sack split) | 30 | 3000 | 2 | 51.2% | 49.4–53.0 |
| holdSack (sack split) | 31 | 3000 | 2 | 50.7% | 48.9–52.5 |
| holdSack, sackHp 100 | 32 | 3000 | 2 | 51.5% | 49.7–53.3 |
| holdSack, sackHit 10 | 33 | 3000 | 2 | 50.8% | 49.0–52.6 |
| holdSack, sackHp 100, sackHit 10 | 34 | 3000 | 2 | 49.2% | 47.4–51.0 |
| freeEntry + holdSack, sackHp 100, sackHit 10 | 35 | 3000 | 2 | 52.3% | 50.5–54.1 |
| freeEntry + holdSack, sackHp 60, sackHit 40 | 36 | 3000 | 2 | 52.4% | 50.6–54.2 |
| hazard + status valuation | 15 | 2000 | 1 | 50.2% | 48.0–52.4 |
| Tera: defensive | 16 | 2000 | 1 | 50.0% | 47.8–52.1 |
| Tera: defensive | 18 | 2000 | 3 | 51.6% | 49.5–53.8 |
| Tera: eager | 17 | 2000 | 1 | 49.4% | 47.2–51.5 |
| Tera: eager | 19 | 2000 | 3 | 54.0% | 51.8–56.2 |
| Tera: eager | 24 | 2000 | 2 | 53.1% | 51.0–55.3 |
| smartSack + Tera eager vs smartSack | 25 | 2000 | 2 | 49.8% | 47.6–51.9 |
| smartSack + hazards + Tera eager + lookahead | 20 | 2000 | 1 | 53.4% | 51.3–55.6 |
| default, knows B's sets (stake 4) | 21 | 2000 | 1 | 57.6% | 55.5–59.8 |

An earlier pass used `--pairs` (different teams, 2,000 games each). Every variant landed between 49.5% and 52.8% there, and the knowledge bonus came out at 56.2%.

## What each variant did

- **One-turn lookahead (`lookahead`).** The top two moves were re-ranked by a short damage race: this move now, then each side's best attack every turn, for up to 6 turns, with speed order and the first turn's priority. Self-boosting status moves were raced at their boosted stats. A swap needed a 5-point margin.
  - Result: no gain. The one-ply ranking already picks the race winner almost every time.
- **Smarter sacking (`smartSack` = `freeEntry` + `holdSack`).**
  - `freeEntry`: after a faint, the AI may send in a faster mon that KOs, without the 1.2× incoming-damage penalty. That penalty assumes the switch-in takes a hit, but after a faint it comes in for free.
  - `holdSack`: when the AI is already in KO range, its active is under `sackHp`% HP, and the best switch-in would take at least `sackHit`% on the way in, it stays in and attacks.
  - Result: together they reach about 53–54%; apart, about 51%.
- **Hazard and status valuation (`hazardValue`).**
  - Hazards were scored by the opponent's unseen or alive bench: Stealth Rock by Rock effectiveness, Spikes and Toxic Spikes by grounded, non-immune mons, and Heavy-Duty Boots counting as immune.
  - Status moves were scaled by the target's HP left.
  - Result: no gain.
- **Tera timing (`tera`).**
  - `defensive`: Tera when the opponent's best hit KOs us now and the Tera type survives it.
  - `eager`: Tera as soon as it adds 30% damage.
  - Result: eager helps a little with 2–3 Tera captains. It adds nothing on top of smartSack (seed 25).
- **Epsilon 0.02** (default 0.04): no measurable difference.
