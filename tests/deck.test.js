import { describe, it, expect, vi } from 'vitest';
import { newDeck, shuffle, shuffledDeck } from '../src/holdem/engine/deck.js';
import { secureRandomInt } from '../src/holdem/engine/rng.js';
import { createGame, startHand, applyAction } from '../src/holdem/engine/engine.js';
import { players } from './helpers.js';

const chiSquare = (counts, expected) => counts.reduce((a, c) => a + (c - expected) ** 2 / expected, 0);

describe('deck', () => {
  it('has 52 distinct cards', () => {
    const d = newDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
    expect(Math.min(...d)).toBe(0);
    expect(Math.max(...d)).toBe(51);
  });

  it('shuffles into a permutation of the same 52 cards', () => {
    for (let i = 0; i < 500; i++) {
      const d = shuffledDeck();
      expect(d).toHaveLength(52);
      expect([...d].sort((a, b) => a - b)).toEqual(newDeck());
    }
  });

  it('secureRandomInt stays in range and is roughly uniform', () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) {
      const x = secureRandomInt(6);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(6);
      counts[x]++;
    }
    expect(chiSquare(counts, 10000)).toBeLessThan(30); // df=5, p ≈ 1e-5
  });

  it('Fisher–Yates produces every permutation equally often', () => {
    const counts = {};
    for (let i = 0; i < 60000; i++) {
      const k = shuffle([0, 1, 2]).join('');
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(6);
    expect(chiSquare(Object.values(counts), 10000)).toBeLessThan(30);
  });

  it('every card lands in every position at a similar rate', () => {
    const pos = new Array(52).fill(0); // where the ace of spades ends up
    for (let i = 0; i < 26000; i++) pos[shuffledDeck().indexOf(51)]++;
    expect(chiSquare(pos, 500)).toBeLessThan(110); // df=51, p ≈ 1e-6
  });

  it('uses crypto.getRandomValues and reshuffles every hand', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const g = createGame({ players: players(4) });
    startHand(g);
    expect(spy).toHaveBeenCalled();
    const snapshot = () => g.players.map((p) => p.hole.join(',')).join('|') + '/' + g.deck.join(',');
    const first = snapshot();
    while (g.street !== 'done') applyAction(g, { type: 'fold' });
    startHand(g);
    expect(snapshot()).not.toEqual(first);
    spy.mockRestore();
  });
});
