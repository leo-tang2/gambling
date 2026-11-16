import { describe, it, expect } from 'vitest';
import { evaluate, bestFive, describeScore, categoryOf, CATEGORY } from '../src/holdem/engine/evaluator.js';
import { parseCards } from '../src/holdem/engine/cards.js';
import { shuffledDeck } from '../src/holdem/engine/deck.js';

const ev = (s) => evaluate(parseCards(s));

describe('hand rankings', () => {
  it('orders the nine categories correctly', () => {
    const hands = [
      'As Kd 9h 7c 3s 2d 4h', // high card
      'As Ad 9h 7c 3s 2d 6h', // pair
      'As Ad 9h 9c 3s 2d 6h', // two pair
      'As Ad Ah 9c 3s 2d 6h', // trips
      'As Kd Qh Jc Ts 2d 6h', // straight
      'As 9s 7s 4s 2s Kd Qh', // flush
      'As Ad Ah 9c 9s 2d 6h', // full house
      'As Ad Ah Ac 9s 2d 6h', // quads
      '9s 8s 7s 6s 5s Ad Ah', // straight flush
    ];
    const scores = hands.map(ev);
    hands.forEach((h, i) => expect(categoryOf(scores[i])).toBe(i));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
  });

  it('treats the wheel as a five-high straight', () => {
    expect(categoryOf(ev('As 2d 3h 4c 5s Kd 9h'))).toBe(CATEGORY.STRAIGHT);
    expect(ev('As 2d 3h 4c 5s')).toBeLessThan(ev('2d 3h 4c 5s 6d'));
    expect(ev('Ts Jd Qh Kc As')).toBeGreaterThan(ev('9s Td Jh Qc Ks'));
    expect(describeScore(ev('As 2s 3s 4s 5s'))).toBe('Straight Flush, Five high');
    expect(describeScore(ev('As Ks Qs Js Ts'))).toBe('Royal Flush');
  });

  it('does not wrap straights around the ace', () => {
    expect(categoryOf(ev('Qs Kd Ah 2c 3s'))).toBe(CATEGORY.HIGH_CARD);
  });

  it('breaks ties with kickers', () => {
    expect(ev('As Ad Kh 9c 4s')).toBeGreaterThan(ev('Ac Ah Qh 9d 4c'));
    expect(ev('As Ad Kh 9c 5s')).toBeGreaterThan(ev('Ac Ah Kd 9d 4c'));
    expect(ev('Ks Kd 4h 4c As')).toBeGreaterThan(ev('Kc Kh 4d 4s Qc'));
    expect(ev('Ks Kd 5h 5c 2s')).toBeGreaterThan(ev('Kc Kh 4d 4s Ac'));
    expect(ev('As Js 9s 6s 3s')).toBeGreaterThan(ev('Ad Jd 9d 6d 2d'));
    expect(ev('As Ad Ah Kc 2s')).toBeGreaterThan(ev('Ac Ah Ad Qc Js'));
  });

  it('compares full houses by trips first, then pair', () => {
    expect(ev('3s 3d 3h 2c 2s')).toBeGreaterThan(ev('2c 2h 2d As Ad'));
    expect(ev('Ks Kd Kh 5c 5s')).toBeGreaterThan(ev('Kc Kh Kd 4c 4s'));
    // two sets of trips: best full house uses the higher trips
    expect(describeScore(ev('9s 9d 9h 4c 4s 4d 2h'))).toBe('Full House, Nines over Fours');
  });

  it('recognises exact ties and the board playing', () => {
    expect(ev('2s 3d As Ks Qs Js Ts')).toBe(ev('4h 5h As Ks Qs Js Ts')); // royal on board
    expect(ev('As Kd Qh Jc 9s 3d 2h')).toBe(ev('Ac Kh Qd Jd 9h 3c 2s'));
    expect(ev('2c 3d 9s 9h Kd Kc Ad')).toBe(ev('4c 5d 9s 9h Kd Kc Ad'));
  });

  it('picks the best five of seven', () => {
    const cards = parseCards('2s 3d 4h 5c 6s 7d 9h');
    const best = bestFive(cards);
    expect(best.cards).toHaveLength(5);
    expect(describeScore(best.score)).toBe('Straight, Seven high');
    expect(best.score).toBe(evaluate(cards));
  });

  it('7-card score always equals the best 5-card subset', () => {
    for (let i = 0; i < 3000; i++) {
      const cards = shuffledDeck().slice(0, 7);
      let max = 0;
      for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        max = Math.max(max, evaluate(cards.filter((_, k) => k !== a && k !== b)));
      }
      expect(evaluate(cards)).toBe(max);
    }
  });

  it('names hands', () => {
    expect(describeScore(ev('Ks Kd 7h 4c 2s'))).toBe('Pair of Kings');
    expect(describeScore(ev('Ks Kd 7h 7c 2s'))).toBe('Two Pair, Kings and Sevens');
    expect(describeScore(ev('Ks Qd 7h 4c 2s'))).toBe('King High');
  });
});
