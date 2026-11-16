import * as THREE from 'three';
import { TABLE_HEIGHT, TABLE_RADIUS, FELT_RADIUS, SEAT_ANGLES, SEAT_RADIUS, polar } from './layout.js';

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...extra });

/** Primitive stand-ins used until (or if) the Blender models are missing. */
export function buildGrayBox() {
  const root = new THREE.Group();
  root.name = 'GrayBox';

  const room = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), mat(0x2a1d17, { side: THREE.BackSide }));
  room.position.y = 1.5;
  room.receiveShadow = true;
  room.name = 'Room';
  root.add(room);

  const table = new THREE.Group();
  table.name = 'Table';
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, 0.06, 16), mat(0x3d2a1e));
  top.position.y = TABLE_HEIGHT - 0.035;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(FELT_RADIUS, FELT_RADIUS, 0.012, 16), mat(0x173226));
  felt.position.y = TABLE_HEIGHT - 0.006;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, TABLE_HEIGHT - 0.06, 8), mat(0x2a1d17));
  post.position.y = (TABLE_HEIGHT - 0.06) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.05, 8), mat(0x2a1d17));
  foot.position.y = 0.025;
  for (const m of [top, felt, post, foot]) { m.castShadow = true; m.receiveShadow = true; table.add(m); }
  root.add(table);

  SEAT_ANGLES.forEach((a, i) => {
    const chair = new THREE.Group();
    chair.name = `Chair${i}`;
    const p = polar(a, SEAT_RADIUS + 0.05, 0);
    chair.position.set(p.x, 0, p.z);
    chair.rotation.y = a;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), mat(0x573b26));
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.05), mat(0x573b26));
    back.position.set(0, 0.75, 0.21);
    chair.add(seat, back);
    chair.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(chair);

    if (i === 0) return;
    const body = new THREE.Group();
    body.name = `Opponent${i}`;
    body.position.set(p.x * 0.97, 0, p.z * 0.97);
    body.rotation.y = a;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.26), mat([0, 0x1f2c4a, 0x4a1218, 0x3a3740][i]));
    torso.position.y = 0.82;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(0xa07658));
    head.position.y = 1.23;
    body.add(torso, head);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(body);
  });

  return root;
}

export function buildGrayLampVisuals() {
  const g = new THREE.Group();
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 8, 1, true), mat(0x346052, { side: THREE.DoubleSide }));
  shade.position.y = 0.0;
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffd08a, emissiveIntensity: 2.5 });
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), bulbMat);
  bulb.position.y = -0.07;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), mat(0x050407));
  cord.position.y = 0.5;
  cord.scale.y = 0.9;
  g.add(shade, bulb, cord);
  return { group: g, bulbMat };
}
