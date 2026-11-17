import { secureRng } from '../engine/rng.js';
import { preflopScore } from './preflop.js';
import { rangeEquity, madeStrength } from './range.js';

const round5 = (x) => Math.round(x / 5) * 5;

/**
 * Choose an action from a player view (engine.playerView) — never the full game state.
 * Returns { type, amount?, bluff, equity }.
 *
 * Preflop it plays a starting-hand chart (open, call, re-raise thresholds per personality).
 * After the flop it weighs its hand against what each opponent's betting says they hold,
 * so a big bet or a re-raise makes it fold medium hands instead of calling off its stack.
 * It also bluffs: steals, semi-bluffs with draws, and the odd bet into a passive table.
 */
export function decide(view, style, rng = secureRng) {
  const legal = view.legal;
  if (!legal) throw new Error('not this player\'s turn');
  const r = () => rng.float();
  const bb = view.bigBlind;
  const pot = view.pot; // everything committed so far, this street's bets included
  const toCall = legal.toCall;
  const stack = legal.stack;
  const opps = view.players.filter((p) => p.seat !== view.seat && !p.folded && !p.out);

  /** Raise (or bet) to `to`, kept legal; shove instead of leaving a sliver behind. */
  const raiseTo = (to, bluff, equity) => {
    if (!legal.canRaise) return toCall > 0 ? { type: 'call', bluff: false, equity } : { type: 'check', bluff: false, equity };
    let amt = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, round5(to)));
    if (legal.maxRaiseTo - amt < bb * 2 || amt > legal.maxRaiseTo * 0.8) amt = legal.maxRaiseTo;
    return { type: legal.isBet ? 'bet' : 'raise', amount: amt, bluff, equity };
  };
  const call = (equity) => (toCall > 0 ? { type: 'call', bluff: false, equity } : { type: 'check', bluff: false, equity });
  const passive = (equity) => (toCall > 0 ? { type: 'fold', bluff: false, equity } : { type: 'check', bluff: false, equity });

  // ---------------- preflop: a starting-hand chart ----------------
  if (view.board.length === 0) {
    const s = preflopScore(view.hole[0], view.hole[1]) + (r() * 2 - 1) * style.noise;
    const raises = view.raisesThisStreet; // 0 = nobody has raised the blinds yet
    const limpers = opps.filter((p) => p.vpip && p.preRaises === 0).length;
    const cost = toCall / Math.max(1, stack);

    if (raises === 0) {
      if (s >= style.open) return raiseTo((3 + limpers) * bb, false);
      if (toCall === 0) {
        // big blind, limped to: an occasional raise to take it down
        if (limpers <= 1 && r() < style.bluff * 0.6) return raiseTo(4 * bb, true);
        return passive();
      }
      if (limpers === 0 && r() < style.bluff * 0.7) return raiseTo(2.5 * bb, true); // steal the blinds
      if (s >= style.limp && toCall <= bb) return call();
      return passive();
    }
    if (raises === 1) {
      if (s >= style.threeBet) return raiseTo(view.currentBet * 3 + limpers * bb, false);
      if (s >= style.call && cost <= 0.25) return call();
      if (s >= 5 && cost <= 0.12 && r() < style.bluff * 0.35) return raiseTo(view.currentBet * 3, true); // light re-raise
      // already in for a blind and it's cheap: defend with something playable
      if (s >= style.call - 2 && toCall <= 2 * bb) return call();
      return passive();
    }
    // facing a re-raise or more
    if (s >= style.fourBet) return cost > 0.3 ? { type: 'allin', bluff: false } : raiseTo(view.currentBet * 2.3, false);
    if (s >= style.threeBet && cost <= 0.3) return call();
    return passive();
  }

  // ---------------- after the flop: equity against what they've shown ----------------
  const iterations = view.board.length === 5 ? 300 : 350;
  const equity = rangeEquity(view.hole, view.board, opps, iterations, rng);
  const st = madeStrength(view.hole, view.board);
  const river = view.board.length === 5;
  const betSize = (frac) => pot * frac * (0.85 + r() * 0.3);

  if (toCall === 0) {
    // value: bet good hands (a few slow-play)
    const strong = equity > 0.62 || (opps.length === 1 && equity > 0.55);
    if (strong && r() < style.aggression + 0.2) return raiseTo(betSize(style.sizing), false, equity);
    // semi-bluff a draw
    if (st === 1 && r() < style.aggression * 0.45) return raiseTo(betSize(0.55), true, equity);
    // a bluff when nobody seems interested
    if (opps.length <= 2 && equity < 0.35 && r() < style.bluff * (river ? 1.3 : 0.8)) return raiseTo(betSize(0.6), true, equity);
    return { type: 'check', bluff: false, equity };
  }

  // facing a bet
  const potOdds = toCall / (pot + toCall);
  const required = Math.min(0.95, potOdds * style.margin);
  const raisesHere = view.raisesThisStreet;
  if (legal.canRaise && equity > 0.8 && raisesHere < 4) return raiseTo(view.currentBet * 2.5 + pot * 0.2, false, equity); // monster
  if (legal.canRaise && equity > 0.68 && raisesHere < style.raiseCap && r() < style.aggression) {
    return raiseTo(view.currentBet * 2.5 + pot * 0.15, false, equity);
  }
  if (legal.canRaise && !river && st === 1 && raisesHere === 1 && toCall < stack * 0.2 && r() < style.bluff * 0.6) {
    return raiseTo(view.currentBet * 2.7, true, equity); // semi-bluff raise with a draw
  }
  if (equity >= required) {
    // calling most of the stack anyway: just put it in
    if (toCall >= stack * 0.7 && legal.canRaise && equity > 0.5) return { type: 'allin', bluff: false, equity };
    return call(equity);
  }
  // a cheap look with something
  if (toCall <= pot * 0.2 && st >= 1 && r() < 0.5) return call(equity);
  return { type: 'fold', bluff: false, equity };
}
