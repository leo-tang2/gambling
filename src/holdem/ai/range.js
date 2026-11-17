import { evaluate } from '../engine/evaluator.js';
import { preflopScore } from './preflop.js';

// Reading opponents: instead of comparing a hand to random cards, the AI only counts the
// hands an opponent could plausibly hold given what they did this hand (public actions only).

const B5 = 13 ** 5;
const categoryOf = (score) => Math.floor(score / B5);

/** Rank counts -> rough category of the board alone (pair 1, two pair 2, trips 3, quads 7). */
function boardCategory(board) {
  if (board.length >= 5) return categoryOf(evaluate(board));
  const counts = {};
  for (const c of board) counts[c % 13] = (counts[c % 13] ?? 0) + 1;
  const v = Object.values(counts).sort((a, b) => b - a);
  if (v[0] === 4) return 7;
  if (v[0] === 3) return 3;
  if (v[0] === 2) return v[1] === 2 ? 2 : 1;
  return 0;
}

function hasFlushDraw(hole, board) {
  if (board.length >= 5) return false;
  for (let s = 0; s < 4; s++) {
    const n = [...hole, ...board].filter((c) => Math.floor(c / 13) === s).length;
    if (n === 4 && hole.some((c) => Math.floor(c / 13) === s)) return true;
  }
  return false;
}

function hasStraightDraw(hole, board) {
  if (board.length >= 5) return false;
  // bit r+1 for each rank, and bit 0 for an ace played low
  const bits = (cards) => cards.reduce((m, c) => m | (1 << ((c % 13) + 1)) | (c % 13 === 12 ? 1 : 0), 0);
  const all = bits([...hole, ...board]);
  const mine = bits(hole);
  for (let lo = 0; lo <= 10; lo++) {
    // four ranks in a row, at least one of them from the hole cards
    if (((all >> lo) & 15) === 15 && ((mine >> lo) & 15)) return true;
  }
  return false;
}

/**
 * How strong a hand is from its owner's side: 0 nothing, 1 a draw, 2 a weak pair,
 * 3 top pair / overpair, 4 two pair or better that uses the hole cards.
 */
export function madeStrength(hole, board) {
  if (board.length < 3) return 0;
  const cat = categoryOf(evaluate([...hole, ...board]));
  const bcat = boardCategory(board);
  if (cat > bcat) {
    if (cat >= 2) return 4;
    // one pair that uses a hole card
    const top = Math.max(...board.map((c) => c % 13));
    const [a, b] = hole.map((c) => c % 13);
    if (a === b) return a > top ? 3 : 2; // pocket pair: overpair or underpair
    if (a === top || b === top) return 3;
    return 2;
  }
  return hasFlushDraw(hole, board) || hasStraightDraw(hole, board) ? 1 : 0;
}

/**
 * How likely is it that an opponent who acted like `o` (a playerView entry) holds `hole`?
 * 1 = right in their range. Below 1 = only if they're bluffing or playing badly, which
 * happens now and then, so nothing is ruled out completely.
 */
export function handFit(o, hole, board) {
  let p = 1;
  const pre = preflopScore(hole[0], hole[1]);
  let need = -Infinity;
  if (o.preRaises >= 2) need = 10; // re-raised: big pairs, big aces
  else if (o.preRaises === 1) need = 6.5;
  else if (o.vpip) need = 4; // called: anything halfway playable
  if (pre < need) p = 0.1;
  const postBets = o.raises - o.preRaises;
  if (board.length >= 3 && postBets > 0) {
    const st = madeStrength(hole, board);
    if (st === 0) p = Math.min(p, 0.3); // betting with nothing: a bluff
    if (postBets >= 2 && st < 3) p = Math.min(p, 0.2); // kept firing: usually a real hand
    if (o.streetRaises >= 2 && st < 4) p = Math.min(p, 0.15); // re-raised this street
  }
  return p;
}

/**
 * Monte Carlo win probability against the hands each opponent could plausibly have.
 * `opponents` are playerView entries for everyone still in the hand except me.
 */
export function rangeEquity(hole, board, opponents, iterations, rng) {
  const known = new Set([...hole, ...board]);
  const pool = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) pool.push(c);
  const need = 5 - board.length;
  // fit of each two-card combo for each opponent, worked out once per call
  const fits = opponents.map(() => new Map());
  const fitOf = (k, o, a, b) => {
    const key = a < b ? a * 52 + b : b * 52 + a;
    let f = fits[k].get(key);
    if (f === undefined) { f = handFit(o, [a, b], board); fits[k].set(key, f); }
    return f;
  };
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    const used = new Set();
    const pickCard = () => {
      let c;
      do c = pool[rng.int(pool.length)]; while (used.has(c));
      return c;
    };
    const hands = opponents.map((o, k) => {
      // one roll per opponent per deal: is this the time they're off their range?
      const u = rng.float();
      let h;
      for (let tries = 0; tries < 120; tries++) {
        const a = pickCard();
        used.add(a);
        const b = pickCard();
        used.delete(a);
        h = [a, b];
        if (u < fitOf(k, o, a, b)) break;
      }
      used.add(h[0]);
      used.add(h[1]);
      return h;
    });
    const full = board.slice();
    for (let i = 0; i < need; i++) { const c = pickCard(); used.add(c); full.push(c); }
    const mine = evaluate(hole.concat(full));
    let ties = 0, lost = false;
    for (const h of hands) {
      const theirs = evaluate(h.concat(full));
      if (theirs > mine) { lost = true; break; }
      if (theirs === mine) ties++;
    }
    if (!lost) score += ties ? 1 / (ties + 1) : 1;
  }
  return score / iterations;
}
