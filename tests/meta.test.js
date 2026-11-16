import { describe, it, expect } from 'vitest';
import { createGame, startHand } from '../src/holdem/engine/engine.js';
import {
  mafiaMood, rouletteWinnings, ROULETTE_BONUS, rouletteFires, splitCashOut, humanHoleIndexes,
  makeLuckyDeckFn, preflopScore, nextEventGap, BAR_ITEMS,
} from '../src/holdem/game/meta.js';

const players = () => [
  { id: 'you', isHuman: true }, { id: 'a' }, { id: 'b' }, { id: 'c' },
];

describe('mafia mood', () => {
  it('is happier when you lose money and angrier when you win it', () => {
    const lost = mafiaMood(1000, 400);
    const even = mafiaMood(1000, 1000);
    const won = mafiaMood(1000, 2500);
    expect(lost).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(won);
    expect(mafiaMood(1000, 0)).toBeLessThanOrEqual(100);
    expect(mafiaMood(1000, 100000)).toBe(0);
  });
});

describe('russian roulette', () => {
  it('pays more per bullet the more bullets you load', () => {
    for (let b = 2; b <= 5; b++) {
      const step = ROULETTE_BONUS[b] - ROULETTE_BONUS[b - 1];
      const prev = ROULETTE_BONUS[b - 1] - ROULETTE_BONUS[b - 2];
      expect(step).toBeGreaterThan(prev);
    }
    expect(rouletteWinnings(1000, 1)).toBe(250);
    expect(rouletteWinnings(1000, 5)).toBe(6000);
  });
  it('fires with probability bullets/6', () => {
    let fired = 0;
    let seed = 1;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 6000; i++) if (rouletteFires(3, 0, rand)) fired++;
    expect(fired / 6000).toBeGreaterThan(0.46);
    expect(fired / 6000).toBeLessThan(0.54);
  });
});

describe('cash out split', () => {
  it('sends half to the bar and half to tomorrow, nothing lost', () => {
    for (const cash of [0, 1, 999, 1000, 4321]) {
      const { toBar, stake } = splitCashOut(cash);
      expect(toBar + stake).toBe(cash);
      expect(Math.abs(toBar - stake)).toBeLessThanOrEqual(1);
    }
  });
});

describe('hidden luck', () => {
  it('knows which deck positions become the human hole cards', () => {
    for (let t = 0; t < 20; t++) {
      const g = createGame({ players: players() });
      let idx = null;
      let deckSeen = null;
      g.deckFn = (game) => {
        idx = humanHoleIndexes(game);
        deckSeen = Array.from({ length: 52 }, (_, i) => i).sort(() => Math.random() - 0.5);
        return deckSeen.slice();
      };
      startHand(g);
      expect(g.players[0].hole).toEqual([deckSeen[idx[0]], deckSeen[idx[1]]]);
    }
  });
  it('deals the human better starting hands on average when lucky', () => {
    const avg = (luck) => {
      let total = 0;
      for (let i = 0; i < 1200; i++) {
        const g = createGame({ players: players() });
        g.deckFn = makeLuckyDeckFn(() => luck);
        startHand(g);
        const [a, b] = g.players[0].hole;
        total += preflopScore(a, b);
      }
      return total / 1200;
    };
    expect(avg(3)).toBeGreaterThan(avg(0));
  });
});

describe('misc', () => {
  it('spaces offers 2 or 3 hands apart', () => {
    for (let i = 0; i < 50; i++) expect([2, 3]).toContain(nextEventGap());
  });
  it('has a bar catalog with unique ids', () => {
    expect(new Set(BAR_ITEMS.map((i) => i.id)).size).toBe(BAR_ITEMS.length);
  });
});
