import { rankOf, suitOf, RANK_NAMES, RANK_PLURALS } from './cards.js';

export const CATEGORY = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};
export const CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

const B = 13;
const B5 = B ** 5;

/** Pack a category plus up to five tiebreak ranks into one comparable integer. */
function pack(category, ranks) {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * B + (ranks[i] ?? 0);
  return category * B5 + v;
}

/** Highest rank of a 5-long run in a rank bitmask, or -1. The wheel (A2345) returns 3 (a five). */
function straightHigh(mask) {
  const m = (mask << 1) | ((mask >> 12) & 1); // bit 0 = ace played low
  for (let h = 13; h >= 4; h--) {
    if (((m >> (h - 4)) & 31) === 31) return h - 1;
  }
  return -1;
}

function topRanks(mask, n, exclude = -1) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (r !== exclude && mask & (1 << r)) out.push(r);
  }
  return out;
}

/**
 * Evaluate the best poker hand that can be made from 5 to 7 cards.
 * Returns an integer: higher is better, equal means a tie.
 */
export function evaluate(cards) {
  const counts = new Array(13).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = rankOf(c), s = suitOf(c);
    counts[r]++;
    suitCount[s]++;
    suitMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  let flushMask = 0;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushMask = suitMask[s];
  if (flushMask) {
    const sf = straightHigh(flushMask);
    if (sf >= 0) return pack(CATEGORY.STRAIGHT_FLUSH, [sf]);
  }

  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quads.length) return pack(CATEGORY.QUADS, [quads[0], ...topRanks(rankMask, 1, quads[0])]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pairRank = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return pack(CATEGORY.FULL_HOUSE, [trips[0], pairRank]);
  }
  if (flushMask) return pack(CATEGORY.FLUSH, topRanks(flushMask, 5));
  const st = straightHigh(rankMask);
  if (st >= 0) return pack(CATEGORY.STRAIGHT, [st]);
  if (trips.length) {
    const kick = topRanks(rankMask & ~(1 << trips[0]), 2);
    return pack(CATEGORY.TRIPS, [trips[0], ...kick]);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    const kick = topRanks(rankMask & ~(1 << p1) & ~(1 << p2), 1);
    return pack(CATEGORY.TWO_PAIR, [p1, p2, ...kick]);
  }
  if (pairs.length === 1) {
    return pack(CATEGORY.PAIR, [pairs[0], ...topRanks(rankMask & ~(1 << pairs[0]), 3)]);
  }
  return pack(CATEGORY.HIGH_CARD, topRanks(rankMask, 5));
}

export const categoryOf = (score) => Math.floor(score / B5);

function tiebreakRanks(score) {
  let v = score % B5;
  const out = [];
  for (let i = 0; i < 5; i++) { out.unshift(v % B); v = Math.floor(v / B); }
  return out;
}

/** Human-readable hand name, e.g. "Full House, Kings over Fives". */
export function describeScore(score) {
  const cat = categoryOf(score);
  const r = tiebreakRanks(score);
  switch (cat) {
    case CATEGORY.STRAIGHT_FLUSH: return r[0] === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[r[0]]} high`;
    case CATEGORY.QUADS: return `Four ${RANK_PLURALS[r[0]]}`;
    case CATEGORY.FULL_HOUSE: return `Full House, ${RANK_PLURALS[r[0]]} over ${RANK_PLURALS[r[1]]}`;
    case CATEGORY.FLUSH: return `Flush, ${RANK_NAMES[r[0]]} high`;
    case CATEGORY.STRAIGHT: return `Straight, ${RANK_NAMES[r[0]]} high`;
    case CATEGORY.TRIPS: return `Three ${RANK_PLURALS[r[0]]}`;
    case CATEGORY.TWO_PAIR: return `Two Pair, ${RANK_PLURALS[r[0]]} and ${RANK_PLURALS[r[1]]}`;
    case CATEGORY.PAIR: return `Pair of ${RANK_PLURALS[r[0]]}`;
    default: return `${RANK_NAMES[r[0]]} High`;
  }
}

/** Best 5-card subset of up to 7 cards (used for showdown highlighting). */
export function bestFive(cards) {
  if (cards.length <= 5) return { score: evaluate(cards), cards: [...cards] };
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    if (n === 7) {
      const s = evaluate(five);
      if (!best || s > best.score) best = { score: s, cards: five };
    } else {
      // n === 6: drop one card instead of two
      break;
    }
  }
  if (n === 6) {
    for (let a = 0; a < 6; a++) {
      const five = cards.filter((_, i) => i !== a);
      const s = evaluate(five);
      if (!best || s > best.score) best = { score: s, cards: five };
    }
  }
  return best;
}
