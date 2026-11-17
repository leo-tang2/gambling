import { describe, it, expect } from 'vitest';
import { createGame, startHand, applyAction, legalActions, playerView, totalChips } from '../src/holdem/engine/engine.js';
import { seededRng } from '../src/holdem/engine/rng.js';
import { parseCards } from '../src/holdem/engine/cards.js';
import { estimateEquity } from '../src/holdem/ai/equity.js';
import { decide } from '../src/holdem/ai/decide.js';
import { PERSONALITIES } from '../src/holdem/ai/personalities.js';
import { madeStrength, rangeEquity } from '../src/holdem/ai/range.js';

describe('opponent AI', () => {
  it('estimates equity sensibly', () => {
    const rng = seededRng(7);
    const aa = estimateEquity(parseCards('As Ad'), [], 1, 3000, rng);
    const trash = estimateEquity(parseCards('7c 2d'), [], 1, 3000, rng);
    const nuts = estimateEquity(parseCards('As Ks'), parseCards('Qs Js Ts'), 3, 500, rng);
    expect(aa).toBeGreaterThan(0.8);
    expect(aa).toBeLessThan(0.9);
    expect(trash).toBeGreaterThan(0.28);
    expect(trash).toBeLessThan(0.4);
    expect(nuts).toBe(1);
  });

  it('only ever makes legal decisions and finishes games', () => {
    const styles = [PERSONALITIES.tight, PERSONALITIES.aggressive, PERSONALITIES.loose, PERSONALITIES.aggressive];
    for (let game = 0; game < 4; game++) {
      const rng = seededRng(500 + game);
      const g = createGame({
        players: [0, 1, 2, 3].map((i) => ({ name: `AI${i}` })),
        rng,
      });
      const total = totalChips(g);
      let hands = 0;
      while (g.status === 'playing' && hands < 400) {
        startHand(g);
        hands++;
        while (g.street !== 'done') {
          const seat = g.actionOn;
          const view = playerView(g, seat);
          const d = decide(view, styles[seat], rng);
          const l = legalActions(g);
          if (d.type === 'check') expect(l.canCheck).toBe(true);
          if (d.type === 'call') expect(l.canCall).toBe(true);
          if (d.type === 'bet' || d.type === 'raise') {
            expect(l.canRaise).toBe(true);
            expect(d.amount).toBeGreaterThanOrEqual(l.minRaiseTo);
            expect(d.amount).toBeLessThanOrEqual(l.maxRaiseTo);
          }
          applyAction(g, d);
        }
        expect(totalChips(g)).toBe(total);
      }
      expect(hands).toBeGreaterThan(3);
    }
  });

  it('reads hand strength from the hole cards and board', () => {
    expect(madeStrength(parseCards('As Ks'), parseCards('Kd 7h 2c'))).toBe(3); // top pair
    expect(madeStrength(parseCards('8d 7c'), parseCards('Ks 7h 2c'))).toBe(2); // second pair
    expect(madeStrength(parseCards('Qd Qc'), parseCards('Js 7h 2c'))).toBe(3); // overpair
    expect(madeStrength(parseCards('Ks 7c'), parseCards('Kd 7h 2c'))).toBe(4); // two pair
    expect(madeStrength(parseCards('Ah 5h'), parseCards('Kh 9h 2c'))).toBe(1); // flush draw
    expect(madeStrength(parseCards('9d 8c'), parseCards('Ts 7h 2c'))).toBe(1); // straight draw
    expect(madeStrength(parseCards('4d 3c'), parseCards('Ks Qh 9c'))).toBe(0);
  });

  it('gives a medium hand less equity against a re-raiser than against a caller', () => {
    const rng = seededRng(11);
    const caller = { preRaises: 0, raises: 0, streetRaises: 0, vpip: true };
    const reraiser = { preRaises: 2, raises: 2, streetRaises: 2, vpip: true };
    const vsCaller = rangeEquity(parseCards('Kh Jd'), [], [caller], 3000, rng);
    const vsReraiser = rangeEquity(parseCards('Kh Jd'), [], [reraiser], 3000, rng);
    expect(vsCaller).toBeGreaterThan(0.5);
    expect(vsReraiser).toBeLessThan(0.4);
  });

  const facing = ({ hole, board, toCall, pot, villain, stack = 2000, raises = 1 }) => ({
    seat: 1, hole: parseCards(hole), board: parseCards(board), bigBlind: 20, pot, currentBet: toCall,
    raisesThisStreet: raises,
    legal: { toCall, canCheck: toCall === 0, canCall: toCall > 0, canRaise: true, isBet: toCall === 0, minRaiseTo: toCall * 2 || 20, maxRaiseTo: stack, currentBet: toCall, playerBet: 0, stack },
    players: [
      { seat: 0, folded: false, out: false, ...villain },
      { seat: 1, folded: false, out: false, preRaises: 0, raises: 0, streetRaises: 0, vpip: true },
    ],
  });

  it('folds a weak pair to a big bet from someone who has been betting all hand', () => {
    const rng = seededRng(3);
    const villain = { preRaises: 1, raises: 3, streetRaises: 1, vpip: true };
    let folds = 0;
    for (let i = 0; i < 60; i++) {
      const d = decide(facing({ hole: '8d 7c', board: 'Ks 7h 2c 9d', toCall: 600, pot: 1200, villain }), PERSONALITIES.tight, rng);
      if (d.type === 'fold') folds++;
    }
    expect(folds / 60).toBeGreaterThan(0.8);
  });

  it('calls a small bet with a strong hand and never folds the nuts', () => {
    const rng = seededRng(4);
    const villain = { preRaises: 1, raises: 2, streetRaises: 1, vpip: true };
    for (let i = 0; i < 40; i++) {
      const d = decide(facing({ hole: 'As Ks', board: 'Qs Js Ts', toCall: 100, pot: 400, villain }), PERSONALITIES.tight, rng);
      expect(d.type).not.toBe('fold');
    }
  });

  it('bluffs now and then when checked to with nothing, but not every time', () => {
    const rng = seededRng(5);
    const villain = { preRaises: 0, raises: 0, streetRaises: 0, vpip: true };
    let bluffs = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const d = decide(facing({ hole: '4d 3c', board: 'Ks Qh 9c 8d Ah', toCall: 0, pot: 200, villain }), PERSONALITIES.loose, rng);
      if (d.type === 'bet') { expect(d.bluff).toBe(true); bluffs++; }
    }
    expect(bluffs).toBeGreaterThan(n * 0.1);
    expect(bluffs).toBeLessThan(n * 0.5);
  });

  it('folds junk to a preflop raise and re-raises aces', () => {
    const rng = seededRng(6);
    const villain = { preRaises: 1, raises: 1, streetRaises: 1, vpip: true };
    for (let i = 0; i < 30; i++) {
      expect(decide(facing({ hole: '7c 2d', board: '', toCall: 60, pot: 90, villain }), PERSONALITIES.tight, rng).type).toBe('fold');
      expect(decide(facing({ hole: 'Ac Ad', board: '', toCall: 60, pot: 90, villain }), PERSONALITIES.tight, rng).type).toBe('raise');
    }
  });

  it('personalities play differently (tight folds more than loose)', () => {
    const rng = seededRng(42);
    const foldRate = (style) => {
      let folds = 0, n = 0;
      for (let i = 0; i < 300; i++) {
        const g = createGame({ players: [{}, {}, {}, {}], rng, button: 0 });
        startHand(g);
        const d = decide(playerView(g, g.actionOn), style, rng);
        n++;
        if (d.type === 'fold') folds++;
      }
      return folds / n;
    };
    expect(foldRate(PERSONALITIES.tight)).toBeGreaterThan(foldRate(PERSONALITIES.loose));
  });
});
