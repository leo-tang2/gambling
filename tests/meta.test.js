import { describe, it, expect } from 'vitest';
import { createGame, startHand } from '../src/holdem/engine/engine.js';
import {
  mafiaMood, rouletteWinnings, ROULETTE_BONUS, rouletteFires, splitCashOut, humanHoleIndexes,
  makeLuckyDeckFn, preflopScore, nextEventGap, BAR_ITEMS, nextNight, newRun,
  holeIndexes, livelyDeck, LIVELY_CHANCE,
} from '../src/holdem/game/meta.js';

describe('next night', () => {
  it('brings whatever was not spent in the bar back to the table', () => {
    const run = { ...newRun(), day: 2, stake: 600, barFund: 450, items: ['stools'] };
    const next = nextNight(run);
    expect(next.day).toBe(3);
    expect(next.stake).toBe(1050);
    expect(next.barFund).toBe(0);
    expect(next.items).toEqual(['stools']);
    expect(run.barFund).toBe(450); // the old run is untouched
  });
});

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

  it('knows where every seat\'s hole cards come from', () => {
    for (let t = 0; t < 20; t++) {
      const g = createGame({ players: players() });
      let idx = null;
      let deckSeen = null;
      g.deckFn = (game) => {
        idx = holeIndexes(game);
        deckSeen = Array.from({ length: 52 }, (_, i) => i).sort(() => Math.random() - 0.5);
        return deckSeen.slice();
      };
      startHand(g);
      g.players.forEach((p, seat) => expect(p.hole).toEqual([deckSeen[idx[seat][0]], deckSeen[idx[seat][1]]]));
    }
  });

  it('makes the weakest starting hand at the table stronger on a lively deal', () => {
    const avgWeakest = (fn) => {
      let total = 0;
      for (let i = 0; i < 600; i++) {
        const g = createGame({ players: players() });
        let idx = null;
        g.deckFn = (game) => { idx = holeIndexes(game); return fn(game); };
        startHand(g);
        total += Math.min(...g.players.map((p) => preflopScore(p.hole[0], p.hole[1])));
        expect(Object.keys(idx)).toHaveLength(4);
      }
      return total / 600;
    };
    const plain = avgWeakest(makeLuckyDeckFn(() => 0, () => 0.99));
    const lively = avgWeakest(livelyDeck);
    expect(lively).toBeGreaterThan(plain + 1.5);
  });

  it('deals lively only when the roll comes up under one in ten', () => {
    expect(LIVELY_CHANCE).toBe(0.1);
    const avgWeakest = (roll) => {
      let total = 0;
      for (let i = 0; i < 400; i++) {
        const g = createGame({ players: players() });
        g.deckFn = makeLuckyDeckFn(() => 0, () => roll);
        startHand(g);
        total += Math.min(...g.players.map((p) => preflopScore(p.hole[0], p.hole[1])));
      }
      return total / 400;
    };
    expect(avgWeakest(0.09)).toBeGreaterThan(avgWeakest(0.1) + 1.5);
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
