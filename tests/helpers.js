import { parseCards } from '../src/holdem/engine/cards.js';
import { nextSeat } from '../src/holdem/engine/engine.js';

/**
 * Build a deckFn that deals the given hole cards and board.
 * holes: { [seat]: 'As Kd' }, board: 'Ah Kh Qh Jh Th' (5 cards).
 */
export function rigged(holes, board) {
  return (g) => {
    const order = [];
    let s = g.button;
    const active = g.players.filter((p) => !p.out).length;
    for (let i = 0; i < active; i++) { s = nextSeat(g, s); order.push(s); }
    const parsed = Object.fromEntries(Object.entries(holes).map(([k, v]) => [k, parseCards(v)]));
    const b = parseCards(board);
    const seq = [];
    for (let r = 0; r < 2; r++) for (const seat of order) seq.push(parsed[seat][r]);
    const used = new Set([...seq, ...b]);
    const rest = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
    const burn = () => rest.shift();
    seq.push(burn(), b[0], b[1], b[2], burn(), b[3], burn(), b[4]);
    return [...rest, ...seq.reverse()];
  };
}

export const players = (n, stacks) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0, stack: stacks?.[i] }));
