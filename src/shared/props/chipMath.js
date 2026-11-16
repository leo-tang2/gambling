// Pure chip arithmetic (no three.js) so it can be unit tested.
export const DENOMS = [500, 100, 25, 5, 1];

/** Fewest chips for an amount. */
export function greedyBreakdown(amount) {
  const out = [];
  let rem = amount;
  for (const d of DENOMS) {
    while (rem >= d) { out.push(d); rem -= d; }
  }
  return out;
}

/** A stack that looks like a real player's: mostly 100s and 25s, 500s only for big stacks. */
export function stackBreakdown(amount) {
  let rem = amount;
  const out = [];
  const take = (d, n) => { for (let i = 0; i < n; i++) out.push(d); rem -= d * n; };
  take(500, Math.max(0, Math.floor((rem - 800) / 500)));
  take(100, Math.max(0, Math.floor((rem - 150) / 100)));
  take(25, Math.max(0, Math.floor((rem - 25) / 25)));
  take(5, Math.floor(rem / 5));
  take(1, rem);
  return out;
}

/**
 * Take chips worth exactly `amount` out of `chips` (array of {value}).
 * If exact change isn't possible, one bigger chip is taken and change values are returned
 * so the caller can put new chips back. Returns { taken, change }.
 */
export function takeValue(chips, amount) {
  const sorted = [...chips].sort((a, b) => b.value - a.value);
  const taken = [];
  let rem = amount;
  for (const c of sorted) {
    if (rem <= 0) break;
    if (c.value <= rem) { taken.push(c); rem -= c.value; }
  }
  let change = [];
  if (rem > 0) {
    const big = sorted.filter((c) => !taken.includes(c) && c.value > rem).sort((a, b) => a.value - b.value)[0];
    if (!big) throw new Error(`cannot take ${amount} from chips worth ${chips.reduce((s, c) => s + c.value, 0)}`);
    taken.push(big);
    change = greedyBreakdown(big.value - rem);
  }
  return { taken, change };
}

export const sumValue = (chips) => chips.reduce((s, c) => s + c.value, 0);

/** One chip broken into chips of the next smaller denomination (how a dealer makes change). */
export const NEXT_DOWN = { 500: 100, 100: 25, 25: 5, 5: 1 };

/**
 * Take exactly `amount` out of a collection, breaking bigger chips into smaller ones when
 * the exact amount can't be made. hooks.make(value, fromChip) creates a chip,
 * hooks.destroy(chip) disposes one that was broken. Returns { taken, remaining }.
 */
export function takeExact(chips, amount, hooks = {}) {
  const make = hooks.make ?? ((value) => ({ value }));
  let pool = [...chips];
  for (let guard = 0; guard < 200; guard++) {
    const { taken, change } = takeValue(pool, amount);
    if (!change.length) return { taken, remaining: pool.filter((c) => !taken.includes(c)) };
    const big = taken[taken.length - 1];
    const d = NEXT_DOWN[big.value];
    pool = pool.filter((c) => c !== big);
    hooks.destroy?.(big);
    for (let i = 0; i < big.value / d; i++) pool.push(make(d, big));
  }
  throw new Error(`could not take ${amount}`);
}
