// Starting-hand strength, shared by the opponent AI and the hidden drink luck.

/**
 * Rough preflop strength of two cards (0..20), Chen-formula style.
 * AA 20, KK 16, QQ 14, AKs 12, JJ 12, TT 10, AKo 10, AQo 8.5, KQs 9, 72o 0.
 */
export function preflopScore(a, b) {
  const ra = a % 13, rb = b % 13;
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  const val = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let s = val(hi);
  if (ra === rb) return Math.max(5, s * 2);
  if (Math.floor(a / 13) === Math.floor(b / 13)) s += 2;
  const gap = hi - lo - 1;
  s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 10) s += 1;
  return s;
}
