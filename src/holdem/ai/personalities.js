// Playing styles for the three opponents, used by decide().
// Preflop thresholds are preflopScore() values (AA 20, KK 16, QQ 14, JJ/AKs 12, TT/AKo 10,
// KQs 9, AJo 7, 99 9, 66 6, 87s 7). Lower = plays more hands.
// All three are on the daring side: they see a lot of flops and sometimes look up an all-in.
export const PERSONALITIES = {
  tight: {
    label: 'tight',
    open: 7, // raise first in with this or better
    limp: 5.5, // just call the big blind
    call: 7, // call a raise
    threeBet: 11.5, // re-raise
    fourBet: 14, // re-raise a re-raise / get it all in preflop
    gamble: 8.5, // facing an all-in (or most of its stack): calls with this or better, sometimes
    callDown: 0.4, // how often it gambles: calls a shove / huge bet it isn't sure about
    curious: 0.3, // how often it pays to see a flop (or a card) with a so-so hand
    aggression: 0.55, // how often a strong hand bets or raises instead of calling/checking
    bluff: 0.07, // how often it bets or raises with nothing
    margin: 1.05, // >1 needs better than pot odds to call
    raiseCap: 2, // raises per street it will take part in without a monster
    sizing: 0.6, // bet size as a fraction of the pot
    noise: 0.8, // wobble on preflop judgement
  },
  aggressive: {
    label: 'aggressive',
    open: 5,
    limp: 4.5,
    call: 6,
    threeBet: 9.5,
    fourBet: 12,
    gamble: 6.5,
    callDown: 0.55,
    curious: 0.35,
    aggression: 0.8,
    bluff: 0.15,
    margin: 0.95,
    raiseCap: 3,
    sizing: 0.75,
    noise: 1.2,
  },
  loose: {
    label: 'loose',
    open: 6,
    limp: 3,
    call: 4.5,
    threeBet: 10.5,
    fourBet: 13.5,
    gamble: 5,
    callDown: 0.65,
    curious: 0.55,
    aggression: 0.45,
    bluff: 0.2,
    margin: 0.85,
    raiseCap: 2,
    sizing: 0.6,
    noise: 1.5,
  },
};
