import { describe, it, expect } from 'vitest';
import { createGame, startHand, applyAction, legalActions, playerView, totalChips } from '../src/holdem/engine/engine.js';
import { seededRng } from '../src/holdem/engine/rng.js';
import { parseCards } from '../src/holdem/engine/cards.js';
import { estimateEquity } from '../src/holdem/ai/equity.js';
import { decide } from '../src/holdem/ai/decide.js';
import { PERSONALITIES } from '../src/holdem/ai/personalities.js';

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
