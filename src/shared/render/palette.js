// The one limited palette everything on screen snaps to (sRGB hex).
// Named entries are used by the UI and the procedural textures.
export const COLORS = {
  black: '#050407',
  ink: '#0b090d',
  shadow: '#141017',
  dusk: '#1d171c',
  woodDark: '#2a1d17',
  wood: '#3d2a1e',
  woodLight: '#573b26',
  leather: '#7a5232',
  amberDark: '#a8692e',
  amber: '#d4923f',
  gold: '#f2c062',
  lampGlow: '#ffe6a0',
  feltDark: '#0f1f17',
  felt: '#173226',
  feltLight: '#23483a',
  sage: '#346052',
  bloodDark: '#2b0b0f',
  blood: '#4a1218',
  red: '#74202a',
  redLight: '#a3333a',
  skinDark: '#6e4e3e',
  skin: '#a07658',
  skinLight: '#c9a084',
  ash: '#3a3740',
  smoke: '#625d66',
  bone: '#9a949a',
  paper: '#d8d0c4',
  cream: '#f4ecdc',
  navy: '#1f2c4a',
  blue: '#3a5288',
  // in-between shades so dark gradients stay smooth at the higher resolution
  ashDark: '#2a2830',
  duskLight: '#262027',
  woodMid: '#33241b',
  feltMid: '#1c3d30',
  bloodMid: '#3a0e14',
  redMid: '#8c2a32',
  skinMid: '#865f4a',
  amberMid: '#bd7d37',
  goldLight: '#f8d78a',
  smokeLight: '#7f7a82',
  boneLight: '#b8b1b2',
  navyLight: '#2c3c62',
  white: '#fff8ea',
};

export const PALETTE = Object.values(COLORS);

export function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
