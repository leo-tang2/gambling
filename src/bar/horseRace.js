// The mechanical horse race in your bar: pure rules, no three.js.
// Four tin horses; you bet some of your bar fund on one. Win and you get your bet back doubled,
// lose and the bookie keeps it. Every horse has the same chances: speeds are random each race.

export const HORSES = ['Turtle', 'Myrtle', 'Yertle', 'Lurtle'];

const MIN_SPEED = 0.07; // track lengths per second
const MAX_SPEED = 0.2;

/**
 * Run one race. Returns { winner, frames, dt }: frames[i] holds each horse's progress (0..1)
 * after i steps of dt seconds, ending on the step someone crosses the line.
 */
export function runRace(rand = Math.random, { dt = 1 / 30, surgeEvery = 0.45 } = {}) {
  const n = HORSES.length;
  const pos = new Array(n).fill(0);
  const speed = HORSES.map(() => 0.11 + rand() * 0.04);
  const frames = [pos.slice()];
  let winner = -1;
  for (let step = 0; step < 60 / dt && winner < 0; step++) {
    for (let i = 0; i < n; i++) {
      // now and then a horse surges or flags
      if (rand() < dt / surgeEvery) speed[i] = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed[i] + (rand() - 0.5) * 0.09));
      pos[i] += speed[i] * dt;
    }
    let best = -1;
    for (let i = 0; i < n; i++) if (pos[i] >= 1 && (best < 0 || pos[i] > pos[best])) best = i;
    winner = best;
    // on a photo finish only the winner is drawn on the line
    frames.push(pos.map((p, i) => (i === best ? 1 : Math.min(0.999, p))));
  }
  return { winner, frames, dt };
}

/** Index of the horse in front in one frame (lowest index on a tie). */
export function leader(frame) {
  let best = 0;
  for (let i = 1; i < frame.length; i++) if (frame[i] > frame[best]) best = i;
  return best;
}

/** What a bet does to your money: +amount if your horse won (paid double), -amount if not. */
export function settleBet(amount, pick, winner) {
  return pick === winner ? amount : -amount;
}

/**
 * Read a typed bet. Any whole amount from $1 up to what you have.
 * Returns { ok: true, amount } or { ok: false, error }.
 */
export function parseBet(text, available) {
  const amount = Number(String(text).trim());
  if (!String(text).trim() || !Number.isInteger(amount)) return { ok: false, error: 'Enter an amount' };
  if (amount <= 0) return { ok: false, error: 'Bet at least $1' };
  if (amount > available) return { ok: false, error: 'You don\'t have that much' };
  return { ok: true, amount };
}
