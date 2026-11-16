// World layout for the back room, in metres. Seat 0 is you; seats go clockwise (to your left).
export const TABLE_HEIGHT = 0.76;
export const TABLE_RADIUS = 0.8;
export const FELT_RADIUS = 0.7;
export const SEAT_RADIUS = 1.12;
export const EYE_HEIGHT = 1.17;

// angle around the table; position = (sin a, cos a) * r
// Opponents sit at roughly 120° either side of you so all three face you across the felt.
export const SEAT_ANGLES = [0, -2.1, Math.PI, 2.1];

export function polar(angle, r, y = TABLE_HEIGHT) {
  return { x: Math.sin(angle) * r, y, z: Math.cos(angle) * r };
}

/** Where things sit on the felt in front of each seat. */
export function seatSpots(seat) {
  const a = SEAT_ANGLES[seat];
  // "right" of the seat as seen by the person sitting there (they face the centre)
  const right = { x: Math.cos(a), z: -Math.sin(a) };
  const at = (r, side) => {
    const p = polar(a, r);
    return { x: p.x + right.x * side, y: TABLE_HEIGHT, z: p.z + right.z * side };
  };
  return {
    angle: a,
    right,
    // your own cards and chips sit closer to the table centre so they're in view while seated
    cards: seat === 0 ? at(0.38, -0.1) : at(0.5, -0.06),
    chips: seat === 0 ? at(0.36, 0.27) : at(0.56, 0.24),
    bet: at(0.36, 0.05),
    dealerButton: seat === 0 ? at(0.42, -0.3) : at(0.5, -0.24),
    face: polar(a, SEAT_RADIUS - 0.1, EYE_HEIGHT + 0.02),
  };
}

export const POT_SPOT = { x: 0.0, y: TABLE_HEIGHT, z: -0.22 };
export const BOARD_SPOT = { x: 0, y: TABLE_HEIGHT, z: 0.16 };
export const BOARD_CARD_SCALE = 1.35;
export const DECK_SPOT = { x: 0.3, y: TABLE_HEIGHT, z: -0.32 };
