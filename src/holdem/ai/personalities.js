// Playing styles for the three opponents. Values are 0..1 knobs used by decide().
export const PERSONALITIES = {
  tight: {
    label: 'tight',
    looseness: 0.0, // how far below fair equity they still play
    aggression: 0.45, // chance to bet/raise when strong
    bluff: 0.04, // chance to bet or raise with air
    noise: 0.04, // random wobble on hand strength
    sizing: 0.6, // bet size as fraction of pot
  },
  aggressive: {
    label: 'aggressive',
    looseness: 0.1,
    aggression: 0.8,
    bluff: 0.12,
    noise: 0.07,
    sizing: 0.85,
  },
  loose: {
    label: 'loose',
    looseness: 0.22,
    aggression: 0.4,
    bluff: 0.22,
    noise: 0.12,
    sizing: 0.7,
  },
};
