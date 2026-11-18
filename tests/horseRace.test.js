import { describe, it, expect } from 'vitest';
import { HORSES, runRace, leader, settleBet, parseBet } from '../src/bar/horseRace.js';
import { seededRng } from '../src/holdem/engine/rng.js';

describe('horse race', () => {
  it('has the four horses', () => {
    expect(HORSES).toEqual(['Turtle', 'Myrtle', 'Yertle', 'Lurtle']);
  });

  it('ends when the winner crosses the line, and the winner is in front', () => {
    const rng = seededRng(7);
    for (let k = 0; k < 50; k++) {
      const { winner, frames, dt } = runRace(rng.float);
      const last = frames[frames.length - 1];
      expect(winner).toBeGreaterThanOrEqual(0);
      expect(last[winner]).toBe(1);
      expect(leader(last)).toBe(winner);
      // nobody had finished a step earlier
      expect(Math.max(...frames[frames.length - 2])).toBeLessThan(1);
      // a race lasts a few seconds, long enough to watch
      const secs = (frames.length - 1) * dt;
      expect(secs).toBeGreaterThan(3);
      expect(secs).toBeLessThan(16);
    }
  });

  it('gives every horse a fair chance', () => {
    const rng = seededRng(99);
    const wins = [0, 0, 0, 0];
    const N = 4000;
    for (let k = 0; k < N; k++) wins[runRace(rng.float, { dt: 1 / 15 }).winner]++;
    for (const w of wins) {
      expect(w / N).toBeGreaterThan(0.21);
      expect(w / N).toBeLessThan(0.29);
    }
  });

  it('pays double on a win and takes the bet on a loss', () => {
    expect(settleBet(250, 2, 2)).toBe(250);
    expect(settleBet(250, 1, 2)).toBe(-250);
  });

  it('accepts any whole amount you can cover', () => {
    expect(parseBet('500', 500)).toEqual({ ok: true, amount: 500 });
    expect(parseBet('1', 10)).toEqual({ ok: true, amount: 1 });
    expect(parseBet('', 10).ok).toBe(false);
    expect(parseBet('0', 10).ok).toBe(false);
    expect(parseBet('11', 10).ok).toBe(false);
    expect(parseBet('2.5', 10).ok).toBe(false);
  });
});
