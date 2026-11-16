import { secureRng } from './rng.js';

export function newDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** In-place Fisher–Yates shuffle. rng.int(n) must return a uniform integer in [0, n). */
export function shuffle(array, rng = secureRng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = array[i];
    array[i] = array[j];
    array[j] = t;
  }
  return array;
}

export function shuffledDeck(rng = secureRng) {
  return shuffle(newDeck(), rng);
}
