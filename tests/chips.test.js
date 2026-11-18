import { describe, it, expect } from 'vitest';
import { pipLayout } from '../src/shared/props/CardManager.js';
import { stackBreakdown, greedyBreakdown, takeValue, takeExact, sumValue } from '../src/shared/props/chipMath.js';

describe('chip arithmetic', () => {
  it('stack and greedy breakdowns always add up exactly', () => {
    for (let v = 0; v <= 4000; v += 7) {
      expect(stackBreakdown(v).reduce((a, b) => a + b, 0)).toBe(v);
      expect(greedyBreakdown(v).reduce((a, b) => a + b, 0)).toBe(v);
    }
  });

  it('a $1,000 starting stack is a readable mix of chips', () => {
    const b = stackBreakdown(1000);
    expect(new Set(b).size).toBeGreaterThanOrEqual(3);
    expect(b.length).toBeLessThan(30);
  });

  it('takeValue removes exactly the amount, making change when needed', () => {
    for (let i = 0; i < 2000; i++) {
      const total = 20 + Math.floor(Math.random() * 3000);
      const chips = stackBreakdown(total).map((value) => ({ value }));
      const amount = 1 + Math.floor(Math.random() * total);
      const { taken, change } = takeValue(chips, amount);
      expect(sumValue(taken) - change.reduce((a, b) => a + b, 0)).toBe(amount);
      for (const c of taken) expect(chips).toContain(c);
    }
  });

  it('takeExact removes exactly the amount and keeps the rest', () => {
    for (let i = 0; i < 2000; i++) {
      const total = 20 + Math.floor(Math.random() * 3000);
      const chips = stackBreakdown(total).map((value) => ({ value }));
      const amount = 1 + Math.floor(Math.random() * total);
      const { taken, remaining } = takeExact(chips, amount);
      expect(sumValue(taken)).toBe(amount);
      expect(sumValue(remaining)).toBe(total - amount);
    }
  });
});

describe('card faces', () => {
  it('shows as many pips as the card is worth, 2 to 10', () => {
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 0; rank <= 8; rank++) expect(pipLayout(suit * 13 + rank)).toHaveLength(rank + 2);
      for (let rank = 9; rank <= 12; rank++) expect(pipLayout(suit * 13 + rank)).toHaveLength(0); // J Q K A are drawn differently
    }
  });
});
