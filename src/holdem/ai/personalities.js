// Playing styles for the three opponents, used by decide().
// Preflop thresholds are preflopScore() values (AA 20, KK 16, QQ 14, JJ/AKs 12, TT/AKo 10,
// KQs 9, AJo 7, 99 9, 66 6, 87s 7). Lower = plays more hands.
export const PERSONALITIES = {
  tight: {
    label: 'tight',
    open: 8, // raise first in with this or better
    limp: 99, // just call the big blind (never)
    call: 9, // call a raise
    threeBet: 12, // re-raise
    fourBet: 14, // re-raise a re-raise / get it all in preflop
    aggression: 0.5, // how often a strong hand bets or raises instead of calling/checking
    bluff: 0.05, // how often it bets or raises with nothing
    margin: 1.15, // >1 needs better than pot odds to call
    raiseCap: 2, // raises per street it will take part in without a monster
    sizing: 0.6, // bet size as a fraction of the pot
    noise: 0.5, // wobble on preflop judgement
  },
  aggressive: {
    label: 'aggressive',
    open: 6,
    limp: 99,
    call: 7.5,
    threeBet: 10,
    fourBet: 13,
    aggression: 0.8,
    bluff: 0.14,
    margin: 1.0,
    raiseCap: 3,
    sizing: 0.75,
    noise: 1,
  },
  loose: {
    label: 'loose',
    open: 6.5,
    limp: 4.5,
    call: 6,
    threeBet: 11,
    fourBet: 14,
    aggression: 0.45,
    bluff: 0.2,
    margin: 0.92,
    raiseCap: 2,
    sizing: 0.6,
    noise: 1.5,
  },
};
