// Unbiased random integers from crypto.getRandomValues (browser and Node 19+).

const buf = new Uint32Array(1);

/** Uniform integer in [0, n). Rejection sampling removes modulo bias. */
export function secureRandomInt(n) {
  if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) throw new RangeError(`bad bound ${n}`);
  const limit = 0x100000000 - (0x100000000 % n); // largest multiple of n that fits in 2^32
  let x;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

/** Uniform float in [0, 1) with 32 bits of entropy. */
export function secureRandom() {
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

/** Default randomness source used by the engine. Tests can pass their own. */
export const secureRng = { int: secureRandomInt, float: secureRandom };

/** Small seeded PRNG (mulberry32) — for tests and AI simulations only, never for dealing. */
export function seededRng(seed) {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { float, int: (n) => Math.floor(float() * n) };
}
