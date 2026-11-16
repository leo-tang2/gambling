import * as THREE from 'three';
import { COLORS } from '../render/palette.js';
import { DENOMS } from './chipMath.js';
import { findMesh } from '../render/Assets.js';

const CHIP_COLORS = { 1: COLORS.cream, 5: COLORS.red, 25: COLORS.sage, 100: COLORS.ink, 500: COLORS.amber };

/** Pull chip/card/button templates out of props.glb, or make simple ones if it failed to load. */
export function buildFallbackProps(props) {
  const chips = {};
  for (const d of DENOMS) {
    const m = props && findMesh(props, `Chip_${d}`);
    if (m) {
      chips[d] = { geometry: m.geometry, material: m.material };
    } else {
      const g = new THREE.CylinderGeometry(0.027, 0.027, 0.0048, 12);
      g.translate(0, 0.0024, 0);
      chips[d] = { geometry: g, material: new THREE.MeshStandardMaterial({ color: CHIP_COLORS[d], flatShading: true }) };
    }
  }
  let card = props?.getObjectByName('Card');
  if (card) {
    card = card.clone(true);
    card.position.set(0, 0, 0);
  } else {
    card = new THREE.Group();
    const front = new THREE.MeshStandardMaterial({ color: COLORS.cream, name: 'CardFront' });
    const back = new THREE.MeshStandardMaterial({ color: COLORS.red, name: 'CardBack' });
    const geo = new THREE.BoxGeometry(0.075, 0.0012, 0.105);
    card.add(new THREE.Mesh(geo, [back, back, front, back, back, back]));
  }
  let dealerButton = props?.getObjectByName('DealerButton');
  if (dealerButton) {
    dealerButton = dealerButton.clone(true);
    dealerButton.position.set(0, 0, 0);
  } else {
    dealerButton = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.009, 12), new THREE.MeshStandardMaterial({ color: COLORS.cream }));
  }
  return { chips, card, dealerButton };
}
