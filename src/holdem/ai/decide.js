import { estimateEquity } from './equity.js';
import { secureRng } from '../engine/rng.js';

const roundTo = (x, step) => Math.round(x / step) * step;

/**
 * Choose an action from a player view (engine.playerView) — never the full game state.
 * Returns { type, amount?, bluff, equity }.
 */
export function decide(view, style, rng = secureRng) {
  const legal = view.legal;
  if (!legal) throw new Error('not this player\'s turn');
  const opponents = view.players.filter((p) => p.seat !== view.seat && !p.folded && !p.out).length;
  const iterations = view.board.length === 0 ? 250 : 400;
  const equity = estimateEquity(view.hole, view.board, Math.max(1, opponents), iterations, rng);

  const fair = 1 / (opponents + 1);
  const noise = (rng.float() * 2 - 1) * style.noise;
  const strength = equity + noise; // perceived strength
  const rel = strength / fair; // >1 means better than an average hand at this table
  const pot = view.pot;
  const toCall = legal.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const stack = legal.stack;
  const postflop = view.board.length > 0;

  const sizeTo = (fraction) => {
    const bet = Math.max(view.bigBlind, roundTo((pot + toCall) * fraction, 5));
    let to = view.currentBet + bet;
    if (legal.isBet) to = bet;
    to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
    // shove instead of leaving a tiny stack behind
    if (legal.maxRaiseTo - to < view.bigBlind * 2) to = legal.maxRaiseTo;
    return to;
  };
  const raise = (fraction, bluff = false) =>
    ({ type: legal.isBet ? 'bet' : 'raise', amount: sizeTo(fraction), bluff, equity });
  const r = () => rng.float();

  // Monster hands: build the pot (sometimes slow-play when checking is free).
  if (legal.canRaise && rel > 2.2 && strength > 0.6) {
    if (legal.canCheck && r() < 0.25 * (1 - style.aggression)) return { type: 'check', bluff: false, equity };
    return raise(style.sizing + r() * 0.4);
  }

  if (legal.canCheck) {
    if (legal.canRaise && rel > 1.35 - style.aggression * 0.3 && r() < style.aggression + 0.15) {
      return raise(style.sizing * (0.7 + r() * 0.5));
    }
    const bluffChance = style.bluff * (postflop ? 1 : 0.4) * (opponents <= 2 ? 1 : 0.5);
    if (legal.canRaise && r() < bluffChance) return raise(style.sizing * 0.8, true);
    return { type: 'check', bluff: false, equity };
  }

  // Facing a bet.
  const required = potOdds * (1.05 - style.looseness) + (view.raisesThisStreet > 1 ? 0.05 : 0);
  const commitment = toCall / Math.max(1, stack); // share of my stack this call costs

  if (legal.canRaise && rel > 1.6 && r() < style.aggression * (commitment > 0.5 ? 1.3 : 1)) {
    return raise(style.sizing + 0.3 * r());
  }
  if (strength >= required || (commitment < 0.04 && strength > fair * (0.55 - style.looseness))) {
    // short stacks often just go all-in when they're calling most of it anyway
    if (legal.canRaise && commitment > 0.65 && strength > 0.45) {
      return { type: 'allin', bluff: false, equity };
    }
    return { type: 'call', bluff: false, equity };
  }
  if (legal.canRaise && postflop && r() < style.bluff * 0.35 && commitment < 0.3) {
    return raise(style.sizing + 0.2, true);
  }
  return { type: 'fold', bluff: false, equity };
}
