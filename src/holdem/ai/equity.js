import { evaluate } from '../engine/evaluator.js';

/**
 * Monte Carlo win probability for `hole` against `opponents` random hands.
 * Only uses cards the player can see (own hole + board); all other cards are unknown.
 */
export function estimateEquity(hole, board, opponents, iterations, rng) {
  const known = new Set([...hole, ...board]);
  const unknown = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) unknown.push(c);
  const need = 5 - board.length;
  const draws = need + opponents * 2;
  let score = 0;
  const pool = unknown.slice();
  for (let it = 0; it < iterations; it++) {
    // partial Fisher–Yates: take `draws` random cards from the pool
    for (let i = 0; i < draws; i++) {
      const j = i + rng.int(pool.length - i);
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const fullBoard = board.concat(pool.slice(0, need));
    const mine = evaluate(hole.concat(fullBoard));
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < opponents; o++) {
      const k = need + o * 2;
      const theirs = evaluate([pool[k], pool[k + 1], ...fullBoard]);
      if (theirs > mine) { lost = true; break; }
      if (theirs === mine) ties++;
      if (theirs > best) best = theirs;
    }
    if (!lost) score += ties ? 1 / (ties + 1) : 1;
  }
  return score / iterations;
}
