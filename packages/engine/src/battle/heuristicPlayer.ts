// A seeded rule-based AI: damage calcs (@smogon/calc) for moves and switches, a status/setup/hazard table, Tera for captains,
// Mega Evolution on the first move a stone holder makes, a Z-move when it buys a KO or a big hit nothing else gets.
import { calculate, Field, Generations, Move, Pokemon } from '@smogon/calc';
import { Dex } from '@pkmn/sim';
import type { BattleSet } from '../types';
import { attackTypesOfSet, pairScore, stabAttacks, stat100, typeMultiplier } from './matchup';
import { switchableSlots, usableMoves, type BattlePlayer, type ParsedRequest, type PlayerContext, type RequestPokemon } from './player';
import { levelFromDetails, parseCondition, parseIdent, speciesNameFromDetails, toID, type SideId } from '../logs/protocol';
import { Rng } from './rng';
import { setSpeciesId } from './sets';
import { viewOf, viewTypes, type BattleView, type MonView, type SideView } from './view';

const GEN = Generations.get(9);

/** Representative STAB moves assumed for an opponent whose moves are not revealed yet. */
const PHYSICAL_STAB: Record<string, string> = {
  Normal: 'Body Slam', Fire: 'Fire Lash', Water: 'Liquidation', Electric: 'Wild Charge', Grass: 'Seed Bomb',
  Ice: 'Icicle Crash', Fighting: 'Sacred Sword', Poison: 'Poison Jab', Ground: 'Earthquake', Flying: 'Drill Peck',
  Psychic: 'Zen Headbutt', Bug: 'X-Scissor', Rock: 'Stone Edge', Ghost: 'Spirit Shackle', Dragon: 'Dragon Claw',
  Dark: 'Crunch', Steel: 'Iron Head', Fairy: 'Play Rough',
};
const SPECIAL_STAB: Record<string, string> = {
  Normal: 'Hyper Voice', Fire: 'Flamethrower', Water: 'Surf', Electric: 'Thunderbolt', Grass: 'Energy Ball',
  Ice: 'Ice Beam', Fighting: 'Aura Sphere', Poison: 'Sludge Bomb', Ground: 'Earth Power', Flying: 'Air Slash',
  Psychic: 'Psychic', Bug: 'Bug Buzz', Rock: 'Power Gem', Ghost: 'Shadow Ball', Dragon: 'Dragon Pulse',
  Dark: 'Dark Pulse', Steel: 'Flash Cannon', Fairy: 'Moonblast',
};

const PROTECT = new Set(['protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct']);
const PIVOT = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail']);
const HAZARD_REMOVAL = new Set(['rapidspin', 'defog', 'mortalspin', 'tidyup', 'courtchange']);
const SELF_KO = new Set(['explosion', 'selfdestruct', 'mistyexplosion', 'memento', 'healingwish', 'lunardance', 'finalgambit']);
const STATUS_BLOCKING_ABILITIES = new Set(['magicbounce', 'goodasgold', 'purifyingsalt', 'comatose']);
const boostMult = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));

type DexMove = ReturnType<typeof Dex.moves.get>;
interface Threat { pct: number; prio: number }
interface MoveEval { slot: number; score: number; tera: boolean; /** Average damage % of the target's max HP (0 for status). */ pct: number }
interface SwitchPick { slot: number; value: number; survives: boolean }

interface Situation {
  req: ParsedRequest;
  ctx: PlayerContext;
  view: BattleView;
  me: SideView;
  them: SideView;
  oppMon: MonView;
  active: RequestPokemon;
  activeSet: BattleSet;
  /** Mega forme the active becomes this turn (it Mega Evolves before moving), else undefined. */
  megaForme?: string;
}

/** A Z-move is used when it KOs and no plain move does, or hits this hard (% max HP) while no plain move reaches Z_PLAIN_WEAK. */
const Z_BIG_HIT = 60;
const Z_PLAIN_WEAK = 40;

/**
 * Rule-based AI. Moves are scored from damage calcs against an assumed opponent spread
 * (252 HP + its higher attacking stat, neutral nature, revealed item/ability), KO first,
 * with speed-order awareness, plus a small table for status, setup, hazards and recovery.
 * Seeded: the same seed and the same battle give the same choices.
 */
export class HeuristicPlayer implements BattlePlayer {
  private rng: Rng;
  private lastWasSwitch = false;
  /** Chance of picking one of the top three moves instead of the best. */
  epsilon = 0.04;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  choose(req: ParsedRequest, ctx: PlayerContext): string {
    if (req.teamPreview) return this.teamPreview(req, ctx);
    if (req.side.pokemon.some(p => p.reviving)) return 'default';
    const view = viewOf(ctx.log);
    const oppSide: SideId = ctx.side === 'p1' ? 'p2' : 'p1';
    const them = view.sides[oppSide];
    const oppMon = them.active ? them.mons.get(them.active) : undefined;
    const bench = switchableSlots(req);

    if (req.forceSwitch?.[0]) {
      if (!bench.length) return 'pass';
      this.lastWasSwitch = true;
      if (!oppMon) return `switch ${this.rng.pick(bench)}`;
      return `switch ${this.bestSwitch(req, ctx, view, oppMon, bench).slot}`;
    }
    const activeReq = req.active?.[0];
    const active = req.side.pokemon[0];
    const moves = usableMoves(req);
    if (!activeReq || !active || !moves.length) return 'default';
    const activeSet = findSet(ctx.ownTeam, active);
    if (!oppMon || !activeSet) return `move ${this.rng.pick(moves)}${activeReq.canMegaEvo ? ' mega' : ''}`;

    const megaForme = activeReq.canMegaEvo ? megaFormeOf(active) : undefined;
    const sit: Situation = { req, ctx, view, me: view.sides[ctx.side], them, oppMon, active, activeSet, megaForme };
    // Mega Evolution and Tera never share a turn.
    const canTera = !megaForme && !!activeReq.canTerastallize && ctx.teraCaptains.has(setSpeciesId(activeSet));
    const plain = this.evaluateMoves(sit, false);
    let evals = plain.evals;
    if (canTera) {
      const tera = this.evaluateMoves(sit, true);
      const bestPlain = plain.evals[0]?.score ?? 0;
      const bestTera = tera.evals[0]?.score ?? 0;
      const flipsKo = bestPlain < 900 && bestTera >= 900;
      const removesLethal = plain.koFirst && !tera.koFirst && bestTera > 40;
      if (flipsKo || removesLethal) evals = tera.evals;
    }
    const best = evals[0];

    // Voluntary switch: about to be KO'd before acting (and no KO of our own), or nothing useful to do.
    const canSwitch = bench.length > 0 && !activeReq.trapped && !activeReq.maybeTrapped;
    const danger = plain.koFirst && (best?.score ?? 0) < 900;
    const useless = (best?.score ?? 0) < 15;
    if (canSwitch && !this.lastWasSwitch && hpOf(active) >= 35 && (danger || useless)) {
      const cand = this.bestSwitch(req, ctx, view, oppMon, bench);
      const stay = this.monValue(ctx, view, oppMon, active, activeSet, false, megaForme).value;
      if (cand.survives && cand.value > stay + 25) {
        this.lastWasSwitch = true;
        return `switch ${cand.slot}`;
      }
    }
    this.lastWasSwitch = false;
    if (!best) return `move ${this.rng.pick(moves)}`;
    let pick = best;
    if (evals.length > 1 && this.rng.next() < this.epsilon) pick = this.rng.pick(evals.slice(0, 3));
    if (activeReq.canMegaEvo) return `move ${pick.slot} mega`;
    const z = this.zMoveSlot(sit, evals);
    if (z !== undefined) return `move ${z} zmove`;
    return `move ${pick.slot}${pick.tera ? ' terastallize' : ''}`;
  }

  // ---------- Z-moves ----------

  /** The slot to fire as a Z-move this turn, or undefined. Damaging Z-moves only; status Z effects are skipped. */
  private zMoveSlot(sit: Situation, evals: MoveEval[]): number | undefined {
    const zs = sit.req.active?.[0]?.canZMove;
    if (!zs || !zs.some(Boolean)) return undefined;
    const { view, me, them, oppMon, active, activeSet } = sit;
    const ourMon = ownCalcMon(activeSet, active, me.boosts, false);
    const oppCalc = oppCalcMon(oppMon, them.boosts);
    if (!ourMon || !oppCalc) return undefined;
    const field = makeField(view, me, them);
    const oppTypes = viewTypes(oppMon);
    let best: { slot: number; pct: number } | undefined;
    for (const slot of usableMoves(sit.req)) {
      if (!zs[slot - 1]) continue;
      const rm = sit.req.active?.[0]?.moves[slot - 1];
      const dm = rm ? Dex.moves.get(rm.id) : undefined;
      if (!dm?.exists || dm.category === 'Status') continue;
      if (typeMultiplier(dm.type, oppTypes, oppMon.ability) === 0) continue;
      const pct = damagePct(ourMon, oppCalc, dm.name, field, true).avg;
      if (!best || pct > best.pct) best = { slot, pct };
    }
    if (!best) return undefined;
    // A plain move that already KOs keeps the Z-move for later.
    const bestPlainPct = Math.max(0, ...evals.map(e => e.pct));
    if ((evals[0]?.score ?? 0) >= 900 || bestPlainPct >= oppMon.hpPct) return undefined;
    if (best.pct >= oppMon.hpPct) return best.slot;
    if (best.pct >= Z_BIG_HIT && bestPlainPct < Z_PLAIN_WEAK) return best.slot;
    return undefined;
  }

  // ---------- team preview ----------

  private teamPreview(req: ParsedRequest, ctx: PlayerContext): string {
    const n = req.side.pokemon.length;
    const opp = ctx.opponentTeam.map(id => Dex.species.get(id)).filter(s => s.exists);
    let bestIdx = 0;
    let bestScore = -Infinity;
    req.side.pokemon.forEach((p, i) => {
      const set = findSet(ctx.ownTeam, p);
      const sp = Dex.species.get(speciesNameFromDetails(p.details));
      if (!sp.exists) return;
      const ours = {
        types: sp.types, attacks: set ? attackTypesOfSet(set, sp.types) : stabAttacks(sp.types),
        spe: p.stats?.spe ?? stat100(sp.baseStats.spe), ability: set?.ability,
      };
      let score = 0;
      for (const o of opp) score += pairScore(ours, { types: o.types, attacks: stabAttacks(o.types), spe: stat100(o.baseStats.spe) });
      if (set?.moves.some(m => toID(m) === 'stealthrock')) score += 0.6;
      score += this.rng.next() * 0.3;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    const order = [bestIdx + 1, ...Array.from({ length: n }, (_, i) => i + 1).filter(i => i !== bestIdx + 1)];
    return `team ${order.join('')}`;
  }

  // ---------- moves ----------

  private evaluateMoves(sit: Situation, tera: boolean): { evals: MoveEval[]; koFirst: boolean } {
    const { req, view, me, them, oppMon, active, activeSet, megaForme } = sit;
    const ourMon = ownCalcMon(activeSet, active, me.boosts, tera, megaForme);
    const oppCalc = oppCalcMon(oppMon, them.boosts);
    if (!ourMon || !oppCalc) return { evals: [], koFirst: false };
    const ourHp = hpOf(active);
    const threats = threatsAgainst(oppMon, oppCalc, ourMon, makeField(view, them, me));
    const bestThreat = Math.max(0, ...threats.map(t => t.pct));
    const ourSpe = effectiveSpeed(megaForme ? ourMon.stats.spe : (active.stats?.spe ?? 100), me.boosts.spe ?? 0, active.item, parseCondition(active.condition).status);
    const theirSpe = oppSpeed(oppMon, them.boosts.spe ?? 0);
    const weOutspeed = view.trickRoom ? ourSpe < theirSpe : ourSpe > theirSpe;
    const koFirstAt = (prio: number) => threats.some(t => t.pct >= ourHp && (t.prio > prio || (t.prio === prio && !weOutspeed)));
    const oppTypes = viewTypes(oppMon);
    const oppHp = oppMon.hpPct;
    const field = makeField(view, me, them);
    const badMatchup = bestThreat >= 50 && switchableSlots(req).length > 0;

    const evals: MoveEval[] = [];
    for (const slot of usableMoves(req)) {
      const rm = req.active?.[0]?.moves[slot - 1];
      if (!rm) continue;
      const dm = Dex.moves.get(rm.id);
      if (!dm.exists) { evals.push({ slot, score: 1, tera, pct: 0 }); continue; }
      const acc = dm.accuracy === true ? 1 : dm.accuracy / 100;
      const koFirst = koFirstAt(dm.priority);
      let score: number;
      let dealt = 0;

      if (dm.category !== 'Status') {
        const r = damagePct(ourMon, oppCalc, dm.name, field);
        let pct = r.avg;
        // An unrevealed ability might still make the target immune to this type.
        if (!oppMon.ability && mayAbilityImmune(oppMon, dm.type)) pct *= 0.6;
        if (typeMultiplier(dm.type, oppTypes, oppMon.ability) === 0 && dm.id !== 'thousandarrows') pct = 0;
        const koChance = r.max >= oppHp ? (r.min >= oppHp ? 1 : Math.max(0.3, (r.max - oppHp) / Math.max(1, r.max - r.min))) : 0;
        if (koChance > 0 && pct > 0) score = (koFirst ? 150 : 1000) * acc * (0.7 + 0.3 * koChance) + dm.priority * 10;
        else score = Math.min(pct, oppHp) * acc * (koFirst ? 0.2 : 1);
        if (dm.flags.charge && !(dm.id === 'solarbeam' && view.weather === 'Sun') && toID(active.item) !== 'powerherb') score *= 0.5;
        if (dm.flags.recharge && score < 900) score *= 0.6;
        if (SELF_KO.has(dm.id) && ourHp > 35) score *= 0.3;
        if (dm.id === 'fakeout' || dm.id === 'firstimpression') score = me.turnsActive > 1 ? 0 : score + 15;
        if (HAZARD_REMOVAL.has(dm.id) && hasHazards(me)) score += 40;
        if (PIVOT.has(dm.id) && badMatchup) score += 30;
        if (pct === 0) score = 0;
        dealt = pct;
      } else {
        score = this.statusScore(sit, dm, ourHp, bestThreat, koFirst, oppTypes) * acc;
      }
      evals.push({ slot, score: score + this.rng.next() * 2, tera, pct: dealt });
    }
    evals.sort((a, b) => b.score - a.score);
    return { evals, koFirst: koFirstAt(0) };
  }

  private statusScore(sit: Situation, dm: DexMove, ourHp: number, bestThreat: number, koFirst: boolean, oppTypes: string[]): number {
    const { me, them, oppMon, ctx } = sit;
    const id = dm.id;
    const oppAlive = Math.max(1, ctx.opponentTeam.length - [...them.mons.values()].filter(m => m.fainted).length);
    const subbed = them.volatiles.has('substitute');

    if (PROTECT.has(id)) return me.lastMove && PROTECT.has(me.lastMove) ? 0 : 8;
    if (id === 'stealthrock') return them.conditions.has('stealthrock') || oppAlive < 2 ? 0 : 60;
    if (id === 'spikes') return (them.conditions.get('spikes') ?? 0) >= 3 || oppAlive < 2 ? 0 : 35;
    if (id === 'toxicspikes') return (them.conditions.get('toxicspikes') ?? 0) >= 2 || oppAlive < 2 ? 0 : 25;
    if (id === 'stickyweb') return them.conditions.has('stickyweb') || oppAlive < 2 ? 0 : 35;
    if (HAZARD_REMOVAL.has(id)) return hasHazards(me) ? 50 : 0;
    if (PIVOT.has(id)) return bestThreat >= 50 && switchableSlots(sit.req).length ? 40 : 5;
    if (id === 'haze' || id === 'clearsmog') return sumBoosts(them) >= 2 ? 70 : 0;
    if (SELF_KO.has(id)) return ourHp < 30 ? 25 : 0;
    if (id === 'substitute') return ourHp > 60 && bestThreat < 25 && !me.volatiles.has('substitute') ? 30 : 0;
    if (id === 'wish') return ourHp < 70 ? 30 : 5;
    if (id === 'taunt') return them.volatiles.has('taunt') ? 0 : 15;
    if (id === 'leechseed') return oppTypes.includes('Grass') || them.volatiles.has('leechseed') || subbed ? 0 : 30;
    if (id === 'trick' || id === 'switcheroo') return toID(sit.active.item).startsWith('choice') && me.turnsActive <= 1 ? 30 : 3;
    if (id === 'yawn') return oppMon.status || them.volatiles.has('yawn') || subbed ? 0 : 25;

    if (dm.heal || dm.flags.heal || id === 'rest' || id === 'strengthsap') {
      if (ourHp >= 75) return 0;
      if (ourHp < 50 && bestThreat < 50 + ourHp * 0.5) return 70;
      return ourHp < 60 ? 25 : 8;
    }

    const selfBoosts = dm.target === 'self' || dm.target === 'adjacentAllyOrSelf' ? (dm.boosts ?? dm.self?.boosts) : dm.self?.boosts;
    if (selfBoosts && Object.values(selfBoosts).some(v => (v ?? 0) > 0)) {
      if (bestThreat < 40 && sumBoosts(me) < 2 && ourHp > 50 && !koFirst) return 80;
      return 4;
    }

    if (dm.status) {
      if (oppMon.status || subbed || statusBlocked(oppMon)) return 0;
      if (!Dex.getImmunity(dm.status, oppTypes) || !Dex.getImmunity(dm.type, oppTypes)) return 0;
      if (dm.flags.powder && oppTypes.includes('Grass')) return 0;
      if ((dm.status === 'psn' || dm.status === 'tox') && (oppTypes.includes('Poison') || oppTypes.includes('Steel'))) return 0;
      // Sleep Clause: only one opposing mon asleep at a time.
      if (dm.status === 'slp' && [...them.mons.values()].some(m => m.status === 'slp')) return 0;
      const sp = Dex.species.get(oppMon.forme);
      const physical = sp.exists && sp.baseStats.atk > sp.baseStats.spa;
      switch (dm.status) {
        case 'slp': return 65;
        case 'brn': return physical ? 55 : 22;
        case 'par': return oppSpeed(oppMon, them.boosts.spe ?? 0) > (sit.active.stats?.spe ?? 0) ? 45 : 20;
        case 'tox': return 45;
        default: return 25;
      }
    }
    return 10;
  }

  // ---------- switching ----------

  private bestSwitch(req: ParsedRequest, ctx: PlayerContext, view: BattleView, oppMon: MonView, bench: number[]): SwitchPick {
    let best: SwitchPick = { slot: bench[0] ?? 1, value: -Infinity, survives: false };
    for (const slot of bench) {
      const p = req.side.pokemon[slot - 1];
      if (!p) continue;
      const set = findSet(ctx.ownTeam, p);
      if (!set) continue;
      const v = this.monValue(ctx, view, oppMon, p, set, true);
      const value = v.value + this.rng.next() * 3;
      if (value > best.value) best = { slot, value, survives: v.survives };
    }
    return best;
  }

  /** How well one of our mons fares against the opponent's active right now (higher is better). */
  private monValue(ctx: PlayerContext, view: BattleView, oppMon: MonView, p: RequestPokemon, set: BattleSet, entering: boolean, megaForme?: string): { value: number; survives: boolean } {
    const me = view.sides[ctx.side];
    const them = view.sides[ctx.side === 'p1' ? 'p2' : 'p1'];
    const boosts = entering ? {} : me.boosts;
    const ours = ownCalcMon(set, p, boosts, false, megaForme);
    const opp = oppCalcMon(oppMon, them.boosts);
    if (!ours || !opp) return { value: -50, survives: false };
    let hp = hpOf(p);
    if (entering) hp -= hazardCost(me, ours, toID(p.item));
    const incoming = Math.max(0, ...threatsAgainst(oppMon, opp, ours, makeField(view, them, me)).map(t => t.pct));
    const field = makeField(view, me, them);
    let out = 0;
    for (const name of set.moves) {
      const m = Dex.moves.get(name);
      if (!m.exists || m.category === 'Status') continue;
      out = Math.max(out, Math.min(damagePct(ours, opp, m.name, field).avg, oppMon.hpPct));
    }
    const ourSpe = effectiveSpeed(p.stats?.spe ?? 100, boosts.spe ?? 0, p.item, parseCondition(p.condition).status);
    const theirSpe = oppSpeed(oppMon, them.boosts.spe ?? 0);
    const faster = view.trickRoom ? ourSpe < theirSpe : ourSpe > theirSpe;
    const survives = incoming < hp;
    // A mon switching in takes the hit before acting, so incoming damage weighs more.
    const value = out * (faster ? 1.3 : 1) - incoming * (entering ? 1.2 : 1) + (survives ? 0 : -80) + hp * 0.2;
    return { value, survives };
  }
}

// ---------- calc helpers ----------

function hpOf(p: RequestPokemon): number {
  const c = parseCondition(p.condition);
  return c.fainted || !c.maxhp ? 0 : (c.hp / c.maxhp) * 100;
}

function findSet(team: BattleSet[], p: RequestPokemon): BattleSet | undefined {
  const name = parseIdent(p.ident)?.name ?? '';
  return team.find(s => s.name === name) ?? team.find(s => toID(s.species) === toID(speciesNameFromDetails(p.details)));
}

function calcBoosts(b: Record<string, number>) {
  return { atk: b.atk ?? 0, def: b.def ?? 0, spa: b.spa ?? 0, spd: b.spd ?? 0, spe: b.spe ?? 0 };
}

type CalcStatus = '' | 'slp' | 'psn' | 'brn' | 'frz' | 'par' | 'tox';
function calcStatus(s: string): CalcStatus {
  return (['slp', 'psn', 'brn', 'frz', 'par', 'tox'] as const).find(x => x === s) ?? '';
}

/** The Mega forme a stone holder becomes ('Charizard-Mega-X'), from its held stone. */
function megaFormeOf(p: RequestPokemon): string | undefined {
  const stone = Dex.items.get(p.item).megaStone;
  if (!stone) return undefined;
  return stone[speciesNameFromDetails(p.details)] ?? Object.values(stone)[0];
}

/** Calc mon for one of our own. `megaForme` calcs it as that Mega (stats, typing, ability) before it has evolved. */
function ownCalcMon(set: BattleSet, p: RequestPokemon, boosts: Record<string, number>, tera: boolean, megaForme?: string): Pokemon | undefined {
  const c = parseCondition(p.condition);
  const mega = megaForme ? Dex.species.get(megaForme) : undefined;
  const ability = mega?.exists ? (mega.abilities[0] ?? '') : Dex.abilities.get(p.ability || p.baseAbility).name;
  const teraType = p.terastallized || (tera ? p.teraType : undefined);
  const opts = {
    level: levelFromDetails(p.details), evs: set.evs, ivs: set.ivs, nature: set.nature,
    item: p.item ? Dex.items.get(p.item).name : undefined, ability: ability || undefined,
    boosts: calcBoosts(boosts), status: calcStatus(c.status), curHP: Math.max(1, c.hp),
    teraType: (teraType || undefined) as Pokemon['teraType'],
  };
  for (const name of [...(mega?.exists ? [mega.name] : []), speciesNameFromDetails(p.details), set.species]) {
    try { return new Pokemon(GEN, name, opts); } catch { /* try the next name */ }
  }
  return undefined;
}

function speciesOf(m: MonView) {
  const byForme = Dex.species.get(m.forme);
  return byForme.exists ? byForme : Dex.species.get(m.speciesId);
}

function oppCalcMon(m: MonView, boosts: Record<string, number>): Pokemon | undefined {
  const sp = speciesOf(m);
  if (!sp.exists) return undefined;
  const evs = sp.baseStats.atk >= sp.baseStats.spa ? { hp: 252, atk: 252 } : { hp: 252, spa: 252 };
  try {
    const p = new Pokemon(GEN, sp.name, {
      level: 100, evs, nature: 'Hardy', ability: m.ability ?? sp.abilities[0], item: m.item || undefined,
      boosts: calcBoosts(boosts), status: calcStatus(m.status), teraType: (m.teraType || undefined) as Pokemon['teraType'],
    });
    p.originalCurHP = Math.max(1, Math.round(p.maxHP() * m.hpPct / 100));
    return p;
  } catch {
    return undefined;
  }
}

function threatsAgainst(oppMon: MonView, oppCalc: Pokemon, ourMon: Pokemon, field: Field): Threat[] {
  const names = new Set<string>();
  for (const id of oppMon.moves) {
    const m = Dex.moves.get(id);
    if (m.exists && m.category !== 'Status') names.add(m.name);
  }
  const sp = speciesOf(oppMon);
  const physical = !sp.exists || sp.baseStats.atk >= sp.baseStats.spa;
  const types = new Set(viewTypes(oppMon));
  if (sp.exists) for (const t of sp.types) types.add(t);
  for (const t of types) {
    const n = (physical ? PHYSICAL_STAB : SPECIAL_STAB)[t];
    if (n) names.add(n);
  }
  return [...names].map(n => ({ pct: damagePct(oppCalc, ourMon, n, field).avg, prio: Dex.moves.get(n).priority }));
}

/** Damage as % of the defender's max HP: min, max and average roll. */
function damagePct(attacker: Pokemon, defender: Pokemon, moveName: string, field: Field, useZ = false): { min: number; max: number; avg: number } {
  try {
    const r = calculate(GEN, attacker, defender, new Move(GEN, moveName, useZ ? { useZ: true } : undefined), field);
    const [lo, hi] = r.range();
    const max = defender.maxHP();
    return { min: (lo / max) * 100, max: (hi / max) * 100, avg: ((lo + hi) / 2 / max) * 100 };
  } catch {
    return { min: 0, max: 0, avg: 0 };
  }
}

function makeField(view: BattleView, attacker: SideView, defender: SideView): Field {
  const side = (s: SideView) => ({
    isReflect: s.conditions.has('reflect'), isLightScreen: s.conditions.has('lightscreen'),
    isAuroraVeil: s.conditions.has('auroraveil'), isSR: s.conditions.has('stealthrock'),
    spikes: s.conditions.get('spikes') ?? 0,
  });
  return new Field({
    weather: (view.weather || undefined) as Field['weather'],
    terrain: (view.terrain || undefined) as Field['terrain'],
    attackerSide: side(attacker), defenderSide: side(defender),
  });
}

function effectiveSpeed(stat: number, stage: number, item: string, status: string): number {
  let s = stat * boostMult(stage);
  if (toID(item) === 'choicescarf') s *= 1.5;
  if (status === 'par') s *= 0.5;
  return s;
}

function oppSpeed(m: MonView, stage: number): number {
  return effectiveSpeed(stat100(speciesOf(m).baseStats.spe), stage, m.item ?? '', m.status);
}

function mayAbilityImmune(m: MonView, type: string): boolean {
  const sp = speciesOf(m);
  return sp.exists && Object.values(sp.abilities).some(a => !!a && typeMultiplier(type, ['Normal'], a) === 0 && type !== 'Ghost');
}

function statusBlocked(m: MonView): boolean {
  if (m.ability) return STATUS_BLOCKING_ABILITIES.has(toID(m.ability));
  const sp = speciesOf(m);
  return sp.exists && Object.values(sp.abilities).some(a => STATUS_BLOCKING_ABILITIES.has(toID(a)));
}

function sumBoosts(s: SideView): number {
  return Object.values(s.boosts).reduce((a, b) => a + Math.max(0, b), 0);
}

function hasHazards(s: SideView): boolean {
  return ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].some(h => s.conditions.has(h));
}

function hazardCost(me: SideView, mon: Pokemon, item: string): number {
  if (item === 'heavydutyboots') return 0;
  let cost = 0;
  if (me.conditions.has('stealthrock')) cost += 12.5 * typeMultiplier('Rock', mon.types);
  const grounded = !mon.types.includes('Flying') && toID(mon.ability ?? '') !== 'levitate';
  const layers = Math.min(3, me.conditions.get('spikes') ?? 0);
  if (grounded && layers) cost += [0, 12.5, 16.67, 25][layers] ?? 0;
  return cost;
}
