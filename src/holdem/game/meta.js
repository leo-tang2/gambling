// Rules for everything around the poker itself: days, the mafia's mood, the side offers
// (drink, roulette, cigar), the hidden luck from drinks, and the bar you run after cashing out.
// Pure functions + plain data so they can be unit tested.

import { shuffledDeck } from '../engine/deck.js';
import { nextSeat, activeCount } from '../engine/engine.js';
import { preflopScore } from '../ai/preflop.js';

export const FIRST_STAKE = 1000;

/** Opponents come back each day a little richer. */
export const opponentStack = (day) => 1000 + 250 * (day - 1);

/** A random offer happens every 2 or 3 hands. */
export const nextEventGap = (rand = Math.random) => 2 + (rand() < 0.5 ? 1 : 0);

// ---------------- russian roulette ----------------

/** Bonus on your current money for each number of bullets (1-5): grows faster per bullet. */
export const ROULETTE_BONUS = [0, 0.25, 0.6, 1.2, 2.5, 6];

export function rouletteWinnings(stack, bullets) {
  return Math.round(stack * ROULETTE_BONUS[bullets]);
}

/** True if the chamber under the hammer is loaded. Luck (hidden) can save you, rarely. */
export function rouletteFires(bullets, luck = 0, rand = Math.random) {
  const fires = rand() < bullets / 6;
  if (fires && luck > 0 && rand() < 0.06 * luck) return false;
  return fires;
}

// ---------------- hidden luck from drinks ----------------

/** Chance that a hand is dealt "lucky" for a given luck level (drinks today, capped). */
export const luckChance = (luck) => Math.min(0.4, 0.14 * Math.min(3, luck));

/**
 * Where in the deck each seat's two hole cards will come from (cards are popped from the end):
 * { seat: [i, j] } for every player still in the game.
 */
export function holeIndexes(g) {
  // mirrors startHand(): the button has already moved when the deck is built
  const order = [];
  let s = g.button;
  const n = activeCount(g);
  for (let i = 0; i < n; i++) { s = nextSeat(g, s); order.push(s); }
  const out = {};
  order.forEach((seat, k) => { out[seat] = [52 - 1 - k, 52 - 1 - (n + k)]; });
  return out;
}

/** Where in the deck the human's two hole cards will come from. */
export function humanHoleIndexes(g) {
  const human = g.players.findIndex((p) => p.isHuman);
  return holeIndexes(g)[human] ?? null;
}

export { preflopScore };

/**
 * About one hand in ten is dealt "lively": everyone at the table gets something worth playing,
 * so more people stay in and pots go to a real showdown. Nine in ten are a plain shuffle.
 */
export const LIVELY_CHANCE = 0.1;
const LIVELY_TRIES = 12;

/** The weakest starting hand anyone is dealt from this deck. */
export function weakestHand(deck, idx) {
  let min = Infinity;
  for (const [i, j] of Object.values(idx)) min = Math.min(min, preflopScore(deck[i], deck[j]));
  return min;
}

/** Shuffle a few decks and keep the one whose weakest starting hand is the strongest. */
export function livelyDeck(g) {
  const idx = holeIndexes(g);
  let best = shuffledDeck(g.rng);
  let bestScore = weakestHand(best, idx);
  for (let i = 1; i < LIVELY_TRIES; i++) {
    const d = shuffledDeck(g.rng);
    const sc = weakestHand(d, idx);
    if (sc > bestScore) { best = d; bestScore = sc; }
  }
  return best;
}

/**
 * Deck builder for the engine. Normally a plain fair shuffle. One hand in ten everyone is dealt
 * something playable (livelyDeck). With drink luck, now and then it shuffles a few decks and
 * keeps the one that deals the human the best starting hand. Nothing tells the player either
 * happened.
 */
export function makeLuckyDeckFn(getLuck, rand = Math.random) {
  return (g) => {
    if (rand() < LIVELY_CHANCE) return livelyDeck(g);
    const luck = getLuck();
    const deck = shuffledDeck(g.rng);
    if (!luck || rand() >= luckChance(luck)) return deck;
    const idx = humanHoleIndexes(g);
    if (!idx) return deck;
    let best = deck;
    let bestScore = preflopScore(deck[idx[0]], deck[idx[1]]);
    for (let i = 0; i < 2; i++) {
      const d = shuffledDeck(g.rng);
      const sc = preflopScore(d[idx[0]], d[idx[1]]);
      if (sc > bestScore) { best = d; bestScore = sc; }
    }
    return best;
  };
}

// ---------------- the mafia's mood ----------------

/**
 * 0 (furious) .. 100 (delighted). Losing money keeps the family happy; taking theirs doesn't.
 * `respect` is a small bonus from accepting their hospitality.
 */
export function mafiaMood(startMoney, endMoney, respect = 0) {
  const r = (endMoney - startMoney) / Math.max(1, startMoney);
  const base = 60 - 30 * r;
  return Math.round(Math.max(0, Math.min(100, base + respect)));
}

export function moodWord(m) {
  if (m >= 85) return 'Delighted';
  if (m >= 65) return 'Pleased';
  if (m >= 45) return 'Watching you';
  if (m >= 25) return 'Annoyed';
  return 'Furious';
}

export function moodLine(m) {
  if (m >= 85) return 'Come back any time, friend. Bring your wallet.';
  if (m >= 65) return 'A pleasure doing business with you.';
  if (m >= 45) return 'You play a careful game. We noticed.';
  if (m >= 25) return 'You took a lot of the family\'s money tonight, kid.';
  return 'Walk carefully on your way home.';
}

// ---------------- your bar ----------------

/** Things you can put in your bar. Nothing earns money by itself; the horse table and the shooting
 * gallery are games you can play there. */
export const BAR_ITEMS = [
  { id: 'stools', name: 'Bar stools', price: 60 },
  { id: 'plant', name: 'Potted palm', price: 80 },
  { id: 'dartboard', name: 'Dartboard', price: 90 },
  { id: 'lights', name: 'Hanging lamps', price: 120 },
  { id: 'shelf', name: 'Liquor shelf', price: 150 },
  { id: 'fan', name: 'Ceiling fan', price: 200 },
  { id: 'neon', name: 'Neon sign', price: 300 },
  { id: 'portrait', name: 'Portrait of Don Sal', price: 400 },
  { id: 'jukebox', name: 'Jukebox', price: 500 },
  { id: 'horses', name: 'Horse race table', price: 600 },
  { id: 'piano', name: 'Upright piano', price: 900 },
  { id: 'gallery', name: 'Shooting gallery', price: 1000 },
  { id: 'pool', name: 'Pool table', price: 1200 },
  { id: 'aquarium', name: 'Fish tank', price: 1500 },
  { id: 'chandelier', name: 'Chandelier', price: 2500 },
];

/** Half of what you cash out goes to the bar (rounded down), the rest is tomorrow's stake. */
export function splitCashOut(cash) {
  const toBar = Math.floor(cash / 2);
  return { toBar, stake: cash - toBar };
}

/**
 * Leave the bar for the next night: whatever is left in the bar fund comes back to the table
 * with you, added to the stake.
 */
export function nextNight(run) {
  return { ...run, items: [...run.items], day: run.day + 1, stake: run.stake + run.barFund, barFund: 0 };
}

export function newRun() {
  return { day: 1, stake: FIRST_STAKE, barFund: 0, items: [], bestCashOut: 0 };
}

const SAVE_KEY = 'bargambling.run.v1';

export function saveRun(run) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch { /* storage unavailable */ }
}

export function loadRun() {
  try {
    const r = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (r && Number.isInteger(r.day) && r.stake > 0) return { ...newRun(), ...r, items: [...(r.items || [])] };
  } catch { /* ignore */ }
  return null;
}

export function clearRun() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
