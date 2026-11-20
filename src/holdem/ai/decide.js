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
 * It's a daring table: so-so hands often pay to see a flop (style.curious), and an all-in
 * gets looked up now and then by anything decent (style.gamble / style.callDown).
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
  // someone has put a real stack in: at least ten big blinds, all in
  const shoveIn = toCall > 0 && opps.some((p) => p.allIn && p.committed >= 10 * bb);

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

    // facing an all-in, or a raise that would cost most of the stack: sometimes they look you up
    if (raises >= 1 && (cost >= 0.35 || shoveIn)) {
      if (s >= style.fourBet && toCall < stack && legal.canRaise) return { type: 'allin', bluff: false };
      if (s >= style.threeBet) return call();
      if (s >= style.gamble && r() < style.callDown) return call();
      if (s >= style.gamble - 3 && r() < style.callDown * 0.3) return call(); // a hunch
      return passive();
    }

    if (raises === 0) {
      if (s >= style.open) return raiseTo((3 + limpers) * bb, false);
      if (toCall === 0) {
        // big blind, limped to: an occasional raise to take it down
        if (limpers <= 1 && r() < style.bluff * 0.6) return raiseTo(4 * bb, true);
        return passive();
      }
      if (limpers === 0 && r() < style.bluff * 0.7) return raiseTo(2.5 * bb, true); // steal the blinds
      if (s >= style.limp && toCall <= bb) return call();
      if (s >= style.limp - 3 && toCall <= bb && r() < style.curious) return call(); // just to see a flop
      return passive();
    }
    if (raises === 1) {
      if (s >= style.threeBet) return raiseTo(view.currentBet * 3 + limpers * bb, false);
      if (s >= style.call && cost <= 0.3) return call();
      if (s >= 5 && cost <= 0.12 && r() < style.bluff * 0.35) return raiseTo(view.currentBet * 3, true); // light re-raise
      // already in for a blind and it's cheap: defend with something playable
      if (s >= style.call - 2 && toCall <= 2 * bb) return call();
      // tag along with a so-so hand when the price is small
      if (s >= style.call - 3 && cost <= 0.15 && r() < style.curious) return call();
      return passive();
    }
    // facing a re-raise or more
    if (s >= style.fourBet) return cost > 0.3 ? { type: 'allin', bluff: false } : raiseTo(view.currentBet * 2.3, false);
    if (s >= style.threeBet && cost <= 0.3) return call();
    if (s >= style.call && cost <= 0.12 && r() < style.curious) return call();
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
  // an all-in or a huge bet: a pair (or a big draw) sometimes calls anyway, they don't like being pushed around
  const bigBet = toCall >= stack * 0.4 || shoveIn;
  if (bigBet && st >= 2 && equity >= required * 0.5 && r() < style.callDown) return call(equity);
  if (bigBet && st === 1 && !river && equity >= required * 0.6 && r() < style.callDown * 0.5) return call(equity);
  // a cheap look with something
  if (toCall <= pot * 0.35 && st >= 1 && r() < 0.35 + style.curious * 0.5) return call(equity);
  return { type: 'fold', bluff: false, equity };
}
