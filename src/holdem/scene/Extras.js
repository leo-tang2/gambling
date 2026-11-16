import * as THREE from 'three';

// Small procedural props for the side events: smoke, the bartender, a whiskey glass,
// an ashtray with a cigar, and the cigarettes the opponents smoke in the dark.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  // a lumpy, soft-edged puff rather than a disc
  for (const [cx, cy, r, a] of [[16, 16, 15, 0.55], [11, 13, 9, 0.35], [21, 18, 9, 0.35], [15, 21, 8, 0.3]]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

/** Pooled smoke puffs: rise, spread and fade. */
export class Smoke {
  constructor(scene, size = 90) {
    this.items = [];
    const tex = puffTexture();
    this.group = new THREE.Group();
    this.group.name = 'Smoke';
    scene.add(this.group);
    for (let i = 0; i < size; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0x7f7a82, transparent: true, fog: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.group.add(s);
      this.items.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0, op: 0 });
    }
    this.next = 0;
    this.dark = new THREE.Color(0x1d171c);
    this.lit = new THREE.Color(0xb8b1b2);
  }

  /** Emit `count` puffs at `pos`, pushed along `dir` (world units per second). */
  puff(pos, { dir = new THREE.Vector3(0, 0.08, 0), count = 6, spread = 0.01, size = 0.03, grow = 0.09, life = 2.2, opacity = 0.32, tone = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const it = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      it.s.visible = true;
      it.s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      it.vel.copy(dir).multiplyScalar(0.6 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.02 + Math.random() * 0.02, (Math.random() - 0.5) * 0.02));
      it.size = size * (0.7 + Math.random() * 0.6);
      it.grow = grow;
      it.life = 0;
      it.max = life * (0.7 + Math.random() * 0.5);
      it.op = opacity;
      it.delay = i * 0.04;
      it.tone = tone;
    }
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.s.visible) continue;
      if (it.delay > 0) { it.delay -= dt; it.s.material.opacity = 0; continue; }
      it.life += dt;
      const k = it.life / it.max;
      if (k >= 1) { it.s.visible = false; continue; }
      it.s.position.addScaledVector(it.vel, dt);
      it.vel.multiplyScalar(Math.exp(-0.9 * dt));
      it.vel.y += 0.03 * dt;
      it.s.scale.setScalar(it.size + it.grow * k);
      it.s.material.opacity = it.op * Math.min(1, k * 4) * (1 - k);
      // smoke only shows where the lamp catches it; out in the dark it's a faint shape
      const p = it.s.position;
      const reach = 0.25 + Math.max(0, 2.0 - p.y) * 0.55; // the cone widens toward the floor
      const lit = Math.max(it.tone, Math.min(1, 1.2 - Math.hypot(p.x, p.z) / reach));
      it.s.material.color.copy(this.dark).lerp(this.lit, lit * 0.9 + 0.05);
    }
  }
}

/** A glowing tip: emissive bead + a small warm light that flares on a drag. */
export class Ember {
  constructor(parent, pos, { radius = 0.55 } = {}) {
    this.mesh = box(0.012, 0.012, 0.012, new THREE.MeshStandardMaterial({ color: 0x3a0e14, emissive: 0xff7a2a, emissiveIntensity: 0.6 }));
    this.mesh.castShadow = false;
    this.mesh.position.copy(pos);
    this.light = new THREE.PointLight(0xff8a3a, 0, radius, 2);
    this.light.position.copy(pos);
    parent.add(this.mesh, this.light);
    this.glow = 0; // 0 idle .. 1 full drag
    this.t = Math.random() * 10;
  }

  update(dt) {
    this.t += dt;
    const flick = 0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7.3) * 0.07;
    const g = 0.18 + this.glow * 0.82;
    this.mesh.material.emissiveIntensity = (0.5 + g * 3.5) * flick;
    this.light.intensity = (0.01 + g * 0.1) * flick;
  }

  worldPos() { return this.mesh.getWorldPosition(new THREE.Vector3()); }
}

/** A cigarette held in the mouth of a head model (head-local coordinates, +z is the face). */
export function addCigarette(head, { at = [0.035, 0.035, 0.11], yaw = 0.35 } = {}) {
  const g = new THREE.Group();
  g.name = 'Cigarette';
  g.position.set(...at);
  g.rotation.y = yaw;
  g.rotation.x = 0.18;
  const stick = box(0.009, 0.009, 0.07, mat(0xd8d0c4), 0, 0, 0.035);
  stick.castShadow = false;
  g.add(stick);
  head.add(g);
  return new Ember(g, new THREE.Vector3(0, 0, 0.072), { radius: 0.5 });
}

/** The bartender: white shirt, black vest, bow tie, a tray with a glass. */
export function makeBartender() {
  const g = new THREE.Group();
  g.name = 'Bartender';
  const shirt = mat(0xd8d0c4), vest = mat(0x141017), pants = mat(0x0b090d), skin = mat(0xa07658), hair = mat(0x2a1d17);
  for (const s of [-1, 1]) {
    g.add(box(0.13, 0.82, 0.14, pants, s * 0.09, 0.41, 0));
    g.add(box(0.13, 0.05, 0.22, mat(0x050407), s * 0.09, 0.025, 0.04));
  }
  g.add(box(0.36, 0.5, 0.2, shirt, 0, 1.07, 0));
  g.add(box(0.37, 0.4, 0.21, vest, 0, 1.03, 0.002));
  g.add(box(0.12, 0.42, 0.012, shirt, 0, 1.08, 0.104)); // shirt front showing under the vest
  g.add(box(0.07, 0.03, 0.02, mat(0x74202a), 0, 1.29, 0.11)); // bow tie
  // arms: left down, right bent holding the tray
  g.add(box(0.09, 0.48, 0.1, shirt, -0.23, 1.05, 0));
  g.add(box(0.08, 0.08, 0.08, skin, -0.23, 0.79, 0));
  g.add(box(0.09, 0.28, 0.1, shirt, 0.23, 1.15, 0));
  g.add(box(0.09, 0.09, 0.28, shirt, 0.23, 1.0, 0.13));
  const tray = new THREE.Group();
  tray.name = 'Tray';
  tray.position.set(0.23, 1.06, 0.3);
  tray.add(box(0.26, 0.012, 0.26, mat(0x9a949a, { metalness: 0.6, roughness: 0.4 })));
  // a stub of candle on the tray so you can see him coming out of the dark
  const candle = box(0.02, 0.05, 0.02, mat(0xf4ecdc, { emissive: 0xffe6a0, emissiveIntensity: 0.3 }), -0.08, 0.03, -0.06);
  candle.castShadow = false;
  const flame = box(0.008, 0.014, 0.008, new THREE.MeshBasicMaterial({ color: 0xffe6a0 }), -0.08, 0.063, -0.06);
  const glow = new THREE.PointLight(0xffb070, 0.22, 1.6, 2);
  glow.position.set(-0.08, 0.1, -0.02);
  tray.add(candle, flame, glow);
  g.add(tray);
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.36, 0);
  head.add(box(0.07, 0.06, 0.07, skin, 0, 0.0, 0));
  head.add(box(0.18, 0.21, 0.19, skin, 0, 0.12, 0));
  head.add(box(0.19, 0.06, 0.2, hair, 0, 0.24, -0.005));
  head.add(box(0.13, 0.015, 0.01, mat(0x2a1d17), 0, 0.09, 0.098)); // moustache
  g.add(head);
  return { root: g, tray, head };
}

/** A short whiskey glass with a drink in it. */
export function makeGlass() {
  const g = new THREE.Group();
  g.name = 'WhiskeyGlass';
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.028, 0.075, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xb8b1b2, transparent: true, opacity: 0.45, roughness: 0.1, side: THREE.DoubleSide, emissive: 0x262027 }),
  );
  glass.position.y = 0.0375;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x7f7a82, transparent: true, fog: true, opacity: 0.7 }));
  base.position.y = 0.005;
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.027, 0.035, 8), new THREE.MeshStandardMaterial({ color: 0xbd7d37, emissive: 0x4a1218, emissiveIntensity: 0.6, roughness: 0.2 }));
  drink.name = 'Drink';
  drink.position.y = 0.028;
  g.add(base, drink, glass);
  return g;
}

/** An ashtray with a lit cigar resting on it. `cigar` can be picked up and moved. */
export function makeAshtray() {
  const g = new THREE.Group();
  g.name = 'Ashtray';
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.02, 10), mat(0x3a3740, { metalness: 0.4 }));
  tray.position.y = 0.01;
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 10), mat(0x625d66));
  ash.position.y = 0.019;
  g.add(tray, ash);
  const cigar = new THREE.Group();
  cigar.name = 'Cigar';
  const body = box(0.016, 0.016, 0.13, mat(0x573b26), 0, 0, 0);
  const band = box(0.018, 0.018, 0.012, mat(0xf2c062), 0, 0, -0.035);
  body.castShadow = band.castShadow = false;
  cigar.add(body, band);
  const ember = new Ember(cigar, new THREE.Vector3(0, 0, 0.066), { radius: 0.6 });
  cigar.userData.rest = { pos: new THREE.Vector3(0.0, 0.028, 0.02), rot: new THREE.Euler(0.08, 0.5, 0) };
  cigar.position.copy(cigar.userData.rest.pos);
  cigar.rotation.copy(cigar.userData.rest.rot);
  g.add(cigar);
  return { root: g, cigar, ember };
}
