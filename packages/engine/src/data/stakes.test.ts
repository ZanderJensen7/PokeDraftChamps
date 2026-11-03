import { DEFAULT_LEAGUE_CONFIG, type LeagueConfig } from '../types';
import { validateLeagueConfig } from '../league/config';
import { applyStake, MAX_STAKE, rulesAt, STAKES } from './stakes';

describe('stakes', () => {
  it('numbers the ladder 1..MAX_STAKE with stake 1 the base game', () => {
    expect(STAKES.map((s) => s.stake)).toEqual(Array.from({ length: MAX_STAKE }, (_, i) => i + 1));
    expect(STAKES[0]!.patch).toEqual({});
    for (const s of STAKES) expect(s.label.length && s.rule.length).toBeTruthy();
  });

  it('adds exactly one rule per level and keeps the rest', () => {
    for (let n = 2; n <= MAX_STAKE; n++) {
      const below = rulesAt(n - 1);
      const here = rulesAt(n);
      const changed = (Object.keys(here) as (keyof typeof here)[]).filter((k) => here[k] !== below[k]);
      expect(changed, `stake ${n}`).toHaveLength(1);
    }
  });

  it('clamps out-of-range stakes', () => {
    expect(rulesAt(0)).toEqual(rulesAt(1));
    expect(rulesAt(MAX_STAKE + 5)).toEqual(rulesAt(MAX_STAKE));
  });

  it('applyStake is idempotent, never loosens a setting and keeps the config valid', () => {
    const configs: LeagueConfig[] = [
      DEFAULT_LEAGUE_CONFIG,
      { ...DEFAULT_LEAGUE_CONFIG, teams: 12, playoffTeams: 8 },
      { ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4, lossCap: 1 },
      { ...DEFAULT_LEAGUE_CONFIG, lossCap: 0 },
    ];
    for (const base of configs) {
      for (let stake = 1; stake <= MAX_STAKE; stake++) {
        const cfg = { ...base, stake };
        const once = applyStake(cfg);
        expect(applyStake(once)).toEqual(once);
        expect(once.lossCap).toBeLessThanOrEqual(cfg.lossCap);
        expect(once.playoffTeams).toBeLessThanOrEqual(cfg.playoffTeams);
        expect(validateLeagueConfig(once)).toEqual([]);
        const cap = rulesAt(stake).lossCap;
        if (cap !== null) expect(once.lossCap).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('playoffs take the top quarter from the playoff stake up', () => {
    const at = MAX_STAKE;
    expect(applyStake({ ...DEFAULT_LEAGUE_CONFIG, teams: 16, playoffTeams: 8, stake: at }).playoffTeams).toBe(4);
    expect(applyStake({ ...DEFAULT_LEAGUE_CONFIG, teams: 12, playoffTeams: 8, stake: at }).playoffTeams).toBe(2);
    expect(applyStake({ ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4, stake: at }).playoffTeams).toBe(2);
    expect(applyStake({ ...DEFAULT_LEAGUE_CONFIG, teams: 16, playoffTeams: 8, stake: 1 }).playoffTeams).toBe(8);
  });

  it('validateLeagueConfig wants an integer stake in range', () => {
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, stake: MAX_STAKE })).toEqual([]);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, stake: 0 })[0]).toMatch(/stake/);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, stake: MAX_STAKE + 1 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, stake: 2.5 }).length).toBe(1);
  });
});
