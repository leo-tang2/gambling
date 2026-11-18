import * as THREE from 'three';
import { COLORS } from '../shared/render/palette.js';
import { paintTexture, hashNoise } from '../shared/render/textures.js';
import { drawText, textWidth } from '../shared/ui/font.js';
import { makeBartender, makeGlass, makeAshtray, Smoke } from '../holdem/scene/Extras.js';
import { Character } from '../holdem/scene/BackRoom.js';

// Your own bar, as a room you walk around in. Metres; +z points from the counter to the
// street door. Everything is built from boxes and cylinders in palette colours, like the
// back room, so the post pass snaps it to the same pixel look.

export const ROOM = { x0: -4, x1: 4, z0: -3, z1: 3, h: 3 };
export const EYE = 1.6;
export const START = { x: 0, z: 2.2, yaw: 0 };
/** The catalog lies open on the back bar, behind the counter. */
export const BOOK = new THREE.Vector3(1.15, 0.97, -2.74);
/** The door to the back room (and the next night at the table), in the left wall. */
export const BACK_DOOR = new THREE.Vector3(-3.95, 1.0, 1.9);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (name) => new THREE.Color(COLORS[name] ?? name);

function M(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.85, flatShading: true, ...o });
}
function glow(color, intensity = 1, o = {}) {
  return M(color, { emissive: col(color), emissiveIntensity: intensity, ...o });
}
function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, name) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  if (name) o.name = name;
  parent.add(o);
  return o;
}
function cyl(parent, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function light(parent, color, intensity, distance, x, y, z, decay = 2) {
  const l = new THREE.PointLight(col(color), intensity, distance, decay);
  l.position.set(x, y, z);
  parent.add(l);
  return l;
}

// ---------------- painted textures ----------------

function floorTexture() {
  const t = paintTexture(16, 16, (ctx) => {
    const r = hashNoise(11);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dark = ((x >> 3) + (y >> 3)) % 2 === 0;
      const n = r();
      ctx.fillStyle = dark ? (n < 0.15 ? COLORS.shadow : COLORS.ink) : (n < 0.2 ? COLORS.smoke : COLORS.ash);
      ctx.fillRect(x, y, 1, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 6);
  return t;
}

function panelTexture(seed, base = COLORS.wood, line = COLORS.woodDark, grain = COLORS.woodMid) {
  const t = paintTexture(32, 32, (ctx) => {
    const r = hashNoise(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = grain; ctx.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1, 2 + Math.floor(r() * 4)); }
    ctx.fillStyle = line;
    for (let x = 0; x < 32; x += 8) ctx.fillRect(x, 0, 1, 32);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function neonTexture() {
  return paintTexture(64, 22, (ctx) => {
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, 64, 22);
    const word = 'BAR';
    const w = textWidth(word, 2);
    ctx.fillStyle = COLORS.redLight;
    ctx.fillRect(2, 2, 60, 1); ctx.fillRect(2, 19, 60, 1); ctx.fillRect(2, 2, 1, 18); ctx.fillRect(61, 2, 1, 18);
    drawText(ctx, word, Math.round((64 - w) / 2), 5, COLORS.cream, { scale: 2, shadow: COLORS.red });
  });
}

function portraitTexture() {
  return paintTexture(26, 32, (ctx) => {
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    R(0, 0, 26, 32, COLORS.navy);
    R(0, 24, 26, 8, COLORS.navyLight);
    R(9, 10, 8, 9, COLORS.skin);
    R(10, 13, 2, 1, COLORS.ink); R(14, 13, 2, 1, COLORS.ink);
    R(11, 17, 4, 1, COLORS.skinDark);
    R(6, 7, 14, 2, COLORS.ink); // hat brim
    R(8, 3, 10, 4, COLORS.ink);
    R(8, 6, 10, 1, COLORS.red);
    R(6, 19, 14, 13, COLORS.ink);
    R(11, 19, 4, 6, COLORS.paper);
    R(12, 19, 2, 7, COLORS.red);
    R(17, 16, 4, 1, COLORS.wood); // the cigar
    R(21, 16, 1, 1, COLORS.amber);
  });
}

function bookTexture() {
  return paintTexture(32, 24, (ctx) => {
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    R(0, 0, 32, 24, COLORS.paper);
    R(15, 0, 2, 24, COLORS.bone);
    for (let i = 0; i < 7; i++) {
      R(3, 3 + i * 3, 8 + (i * 5) % 4, 1, COLORS.smoke);
      R(19, 3 + i * 3, 9 - (i * 3) % 4, 1, COLORS.smoke);
    }
    R(3, 2, 6, 1, COLORS.red);
  });
}

// ---------------- the things you can buy ----------------
// Each builder fills `g` (the item's group, already in the scene) and returns
//   focus: where the catalog camera zooms to, view: direction from the focus to the camera,
//   dist: how far back, colliders: [x0, z0, x1, z1] boxes you can't walk through,
//   update(dt, t): little animations.

const BUILDERS = {
  stools(g) {
    const leather = M('redLight'), chrome = M('bone', { roughness: 0.4 }), dark = M('ash');
    const colliders = [];
    for (let i = 0; i < 5; i++) {
      const x = -2.4 + i * 0.85, z = -1.02;
      cyl(g, 0.17, 0.16, 0.07, leather, x, 0.78, z, 12);
      cyl(g, 0.15, 0.15, 0.02, M('red'), x, 0.735, z, 12);
      cyl(g, 0.028, 0.028, 0.7, chrome, x, 0.38, z, 6);
      cyl(g, 0.11, 0.11, 0.015, chrome, x, 0.3, z, 10);
      cyl(g, 0.19, 0.21, 0.03, dark, x, 0.015, z, 10);
      colliders.push([x - 0.18, z - 0.18, x + 0.18, z + 0.18]);
    }
    return { focus: V(-0.7, 0.75, -1.05), view: V(0.15, 0.7, 1), dist: 3.4, colliders };
  },

  plant(g) {
    const x = 3.45, z = -2.5;
    cyl(g, 0.24, 0.18, 0.42, M('leather'), x, 0.21, z, 10);
    cyl(g, 0.25, 0.25, 0.04, M('amberDark'), x, 0.43, z, 10);
    cyl(g, 0.21, 0.21, 0.02, M('woodDark'), x, 0.42, z, 10);
    cyl(g, 0.025, 0.035, 0.9, M('wood'), x, 0.85, z, 6);
    const crown = new THREE.Group();
    crown.position.set(x, 1.28, z);
    g.add(crown);
    const leafA = M('sage'), leafB = M('feltLight');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.rotation.set(0, a, 0);
      crown.add(arm);
      const leaf = box(arm, 0.09, 0.02, 0.55, i % 2 ? leafA : leafB, 0, 0, 0.27);
      leaf.rotation.x = 0.45 + (i % 3) * 0.18;
    }
    return {
      focus: V(x, 1.0, z), view: V(-0.9, 0.5, 1), dist: 2.2, colliders: [[x - 0.3, z - 0.3, x + 0.3, z + 0.3]],
      update: (dt, t) => { crown.rotation.z = Math.sin(t * 0.7) * 0.04; crown.rotation.x = Math.sin(t * 0.5 + 1) * 0.03; },
    };
  },

  dartboard(g) {
    const x = 3.97, y = 1.65, z = -1.0;
    const disc = (r, mat, dx) => {
      const o = cyl(g, r, r, 0.02, mat, x - dx, y, z, 20);
      o.rotation.z = Math.PI / 2;
      return o;
    };
    box(g, 0.04, 0.7, 0.7, M('woodDark'), x + 0.005, y, z);
    disc(0.25, M('ink'), 0.03);
    disc(0.21, M('cream'), 0.04);
    disc(0.17, M('red'), 0.05);
    disc(0.12, M('cream'), 0.06);
    disc(0.07, M('sage'), 0.07);
    disc(0.025, M('redLight'), 0.08);
    for (const [dy, dz] of [[0.05, 0.03], [-0.08, -0.06], [0.1, -0.1]]) {
      const dart = box(g, 0.14, 0.012, 0.012, M('gold'), x - 0.15, y + dy, z + dz);
      dart.rotation.z = 0.15;
      box(g, 0.03, 0.03, 0.004, M('redLight'), x - 0.21, y + dy + 0.01, z + dz);
    }
    return { focus: V(x - 0.05, y, z), view: V(-1, 0.15, 0.25), dist: 1.5, colliders: [] };
  },

  lights(g) {
    const shade = M('sage', { side: THREE.DoubleSide }), cord = M('ink');
    const bulbs = [];
    for (const x of [-2.0, -0.7, 0.6]) {
      const z = -1.62;
      box(g, 0.012, 0.65, 0.012, cord, x, ROOM.h - 0.325, z);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 12, 1, true), shade);
      s.position.set(x, ROOM.h - 0.72, z);
      g.add(s);
      cyl(g, 0.05, 0.05, 0.05, M('ash'), x, ROOM.h - 0.64, z, 8);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow('lampGlow', 2.2));
      b.position.set(x, ROOM.h - 0.8, z);
      g.add(b);
      bulbs.push(light(g, 'gold', 2.6, 4.5, x, ROOM.h - 0.88, z, 1.8));
    }
    return { focus: V(-0.7, 2.1, -1.62), view: V(0.1, -0.15, 1), dist: 3.2, colliders: [], lit: true };
  },

  shelf(g) {
    const plank = M('woodLight'), bracket = M('ash');
    const bottleCols = ['amber', 'sage', 'redLight', 'gold', 'cream', 'blue', 'amberMid', 'feltLight', 'red'];
    const r = hashNoise(5);
    for (const [k, y] of [1.45, 1.95].entries()) {
      box(g, 4.6, 0.04, 0.28, plank, -0.6, y, -2.84);
      for (let x = -2.8; x <= 1.6; x += 1.1) box(g, 0.03, 0.12, 0.2, bracket, x, y - 0.08, -2.88);
      for (let x = -2.78, i = 0; x < 1.6; x += 0.14 + r() * 0.06, i++) {
        const c = bottleCols[(i * 4 + k * 3) % bottleCols.length];
        const h = 0.2 + r() * 0.12;
        const m = M(c, { emissive: col(c), emissiveIntensity: 0.12, roughness: 0.3 });
        cyl(g, 0.035, 0.04, h, m, x, y + 0.02 + h / 2, -2.82 + (r() - 0.5) * 0.08, 7);
        cyl(g, 0.012, 0.018, 0.07, m, x, y + 0.02 + h + 0.035, -2.82, 6);
        if (i % 3 === 0) box(g, 0.05, 0.05, 0.004, M('paper'), x, y + 0.02 + h * 0.45, -2.78);
      }
    }
    return { focus: V(-0.6, 1.72, -2.8), view: V(0, 0.12, 1), dist: 2.4, colliders: [] };
  },

  fan(g) {
    const x = 1.4, z = 1.0;
    box(g, 0.025, 0.4, 0.025, M('ash'), x, ROOM.h - 0.2, z);
    cyl(g, 0.11, 0.13, 0.12, M('bone', { roughness: 0.5 }), x, ROOM.h - 0.45, z, 12);
    const rotor = new THREE.Group();
    rotor.position.set(x, ROOM.h - 0.52, z);
    g.add(rotor);
    const blade = M('woodLight');
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i / 4) * Math.PI * 2;
      rotor.add(arm);
      const b = box(arm, 0.14, 0.015, 0.62, blade, 0, 0, 0.42);
      b.rotation.z = 0.12;
      box(arm, 0.04, 0.02, 0.14, M('gold'), 0, 0.005, 0.1);
    }
    return {
      focus: V(x, 2.45, z), view: V(0.35, -0.5, 1), dist: 1.9, colliders: [],
      update: (dt) => { rotor.rotation.y += dt * 4.2; },
    };
  },

  neon(g) {
    const x = -0.05, y = 2.48, z = -2.94; // between two of the hanging lamps
    const tex = neonTexture();
    const sign = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0xffffff });
    box(g, 1.06, 0.4, 0.05, M('ink'), x, y, z - 0.01);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.34), sign);
    face.position.set(x, y, z + 0.02);
    g.add(face);
    const l = light(g, 'redLight', 2.2, 3.5, x, y, z + 0.35, 1.8);
    let off = 0;
    return {
      focus: V(x, y, z), view: V(0, -0.15, 1), dist: 2.1, colliders: [],
      update: (dt, t) => {
        off -= dt;
        if (off < -3 - Math.random() * 6) off = 0.12 + Math.random() * 0.2;
        const on = off <= 0 || Math.sin(t * 60) > 0.3;
        sign.emissiveIntensity = on ? 1.6 : 0.25;
        l.intensity = on ? 2.2 : 0.3;
      },
    };
  },

  portrait(g) {
    const x = -3.96, y = 1.7, z = 0.8;
    box(g, 0.05, 0.78, 0.64, M('gold', { roughness: 0.5 }), x, y, z);
    box(g, 0.06, 0.7, 0.56, M('amberDark'), x + 0.003, y, z);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.64), new THREE.MeshStandardMaterial({ map: portraitTexture(), roughness: 0.9 }));
    pic.position.set(x + 0.04, y, z);
    pic.rotation.y = Math.PI / 2;
    g.add(pic);
    // a little picture lamp over the frame
    box(g, 0.1, 0.03, 0.34, M('gold'), x + 0.08, y + 0.47, z);
    light(g, 'lampGlow', 0.7, 1.4, x + 0.25, y + 0.42, z, 2);
    return { focus: V(x, y, z), view: V(1, 0.05, 0.15), dist: 1.35, colliders: [] };
  },

  jukebox(g) {
    const x = -3.68, z = -0.4;
    const body = M('woodDark'), trim = M('woodLight');
    box(g, 0.45, 1.15, 0.62, body, x, 0.575, z);
    const top = cyl(g, 0.31, 0.31, 0.45, trim, x, 1.15, z, 14);
    top.rotation.z = Math.PI / 2;
    top.scale.set(1, 1, 1);
    box(g, 0.02, 0.32, 0.46, glow('amber', 0.9), x + 0.23, 0.98, z);
    const bands = [];
    const hues = ['redLight', 'gold', 'sage', 'blue'];
    for (let i = 0; i < 4; i++) {
      const m = glow(hues[i], 1.2);
      bands.push(m);
      box(g, 0.02, 0.05, 0.5, m, x + 0.23, 0.72 - i * 0.09, z);
    }
    box(g, 0.03, 0.12, 0.4, M('ink'), x + 0.23, 0.2, z);
    const l = light(g, 'amber', 1.4, 2.6, x + 0.55, 0.9, z, 1.8);
    return {
      focus: V(x, 0.9, z), view: V(1, 0.3, 0.25), dist: 2.0, colliders: [[x - 0.25, z - 0.35, x + 0.26, z + 0.35]],
      update: (dt, t) => {
        const k = Math.floor(t * 4);
        bands.forEach((m, i) => m.emissive.set(COLORS[hues[(i + k) % 4]]));
        l.intensity = 1.2 + Math.sin(t * 3) * 0.25;
      },
    };
  },

  piano(g) {
    const x = 3.68, z = 1.65;
    const black = M('ink', { roughness: 0.45 });
    box(g, 0.55, 1.25, 1.5, black, x, 0.625, z);
    box(g, 0.3, 0.06, 1.42, black, x - 0.4, 0.72, z);
    box(g, 0.2, 0.03, 1.36, M('cream'), x - 0.42, 0.765, z);
    for (let i = 0; i < 18; i++) {
      if (i % 7 === 2 || i % 7 === 6) continue;
      box(g, 0.1, 0.03, 0.035, black, x - 0.38, 0.79, z - 0.63 + i * 0.075);
    }
    box(g, 0.04, 0.3, 1.3, M('woodDark'), x - 0.29, 0.98, z); // music desk
    for (const dz of [-0.65, 0.65]) box(g, 0.08, 0.7, 0.08, black, x - 0.45, 0.35, z + dz);
    // bench
    box(g, 0.36, 0.06, 0.85, M('leather'), x - 0.95, 0.48, z);
    for (const dz of [-0.36, 0.36]) for (const dx of [-0.14, 0.14]) box(g, 0.04, 0.45, 0.04, black, x - 0.95 + dx, 0.225, z + dz);
    return { focus: V(x - 0.3, 0.9, z), view: V(-1, 0.45, 0.3), dist: 2.5, colliders: [[x - 1.15, z - 0.78, x + 0.3, z + 0.78]] };
  },

  pool(g) {
    const x = 1.4, z = 1.0;
    const wood = M('woodDark'), rail = M('wood');
    box(g, 2.24, 0.2, 1.24, wood, x, 0.7, z);
    box(g, 2.04, 0.03, 1.04, M('felt'), x, 0.815, z);
    for (const s of [-1, 1]) {
      box(g, 2.24, 0.06, 0.1, rail, x, 0.83, z + s * 0.57);
      box(g, 0.1, 0.06, 1.24, rail, x + s * 1.07, 0.83, z);
    }
    for (const dx of [-1.0, 0, 1.0]) for (const s of [-1, 1]) cyl(g, 0.045, 0.045, 0.02, M('black'), x + dx, 0.84, z + s * 0.5, 8);
    for (const dx of [-0.95, 0.95]) for (const s of [-1, 1]) box(g, 0.14, 0.6, 0.14, wood, x + dx, 0.3, z + s * 0.48);
    const balls = ['white', 'redLight', 'gold', 'blue', 'ink', 'sage', 'amber', 'red'];
    balls.forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M(c, { roughness: 0.3 }));
      const row = i === 0 ? 0 : Math.floor((i - 1) / 2) + 1;
      b.position.set(i === 0 ? x - 0.55 : x + 0.25 + row * 0.055, 0.86, z + (i === 0 ? 0 : ((i - 1) % 2) * 0.065 - 0.03 + (row % 2) * 0.03));
      b.castShadow = true;
      g.add(b);
    });
    const cue = box(g, 1.4, 0.022, 0.022, M('amberMid'), x - 0.2, 0.86, z - 0.42);
    cue.rotation.y = 0.12;
    return { focus: V(x, 0.82, z), view: V(0.25, 1, 0.85), dist: 2.9, colliders: [[x - 1.15, z - 0.65, x + 1.15, z + 0.65]] };
  },

  aquarium(g) {
    const x = -2.6, z = 2.7;
    box(g, 1.24, 0.7, 0.46, M('woodDark'), x, 0.35, z);
    box(g, 1.26, 0.04, 0.48, M('woodLight'), x, 0.72, z);
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.38), new THREE.MeshStandardMaterial({
      color: col('blue'), emissive: col('navy'), emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false,
    }));
    water.position.set(x, 0.99, z);
    g.add(water);
    box(g, 1.12, 0.06, 0.4, M('amberDark'), x, 0.77, z);
    box(g, 1.16, 0.03, 0.42, M('ink'), x, 1.255, z); // lid
    for (const dx of [-0.56, 0.56]) box(g, 0.03, 0.56, 0.42, M('ash'), x + dx, 0.99, z);
    for (const dx of [-0.35, -0.3, 0.38]) { const w = box(g, 0.02, 0.22 + Math.abs(dx) * 0.2, 0.02, M('sage'), x + dx, 0.9, z + 0.05); w.castShadow = false; }
    const fish = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Group();
      const c = i % 2 ? 'gold' : 'amber';
      box(f, 0.06, 0.03, 0.015, glow(c, 0.5), 0, 0, 0);
      box(f, 0.02, 0.03, 0.01, glow('redLight', 0.4), -0.04, 0, 0);
      f.position.set(x, 0.95, z);
      g.add(f);
      fish.push({ f, speed: 0.25 + i * 0.07, phase: i * 1.7, y: 0.86 + i * 0.07, z: z - 0.1 + (i % 3) * 0.1 });
    }
    light(g, 'blue', 1.2, 2.2, x, 1.1, z - 0.5, 1.8);
    return {
      focus: V(x, 0.98, z), view: V(0.1, 0.25, -1), dist: 1.7, colliders: [[x - 0.64, z - 0.26, x + 0.64, z + 0.3]],
      update: (dt, t) => {
        for (const o of fish) {
          const s = Math.sin(t * o.speed + o.phase);
          o.f.position.set(x + s * 0.45, o.y + Math.sin(t * 1.3 + o.phase) * 0.02, o.z);
          o.f.rotation.y = Math.cos(t * o.speed + o.phase) > 0 ? 0 : Math.PI;
        }
      },
    };
  },

  chandelier(g) {
    const x = -1.9, z = 0.9, y = 2.35;
    const gold = M('gold', { roughness: 0.4 });
    box(g, 0.02, ROOM.h - y - 0.1, 0.02, gold, x, (ROOM.h + y + 0.1) / 2, z);
    cyl(g, 0.06, 0.1, 0.18, gold, x, y, z, 8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 4, 16), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y - 0.04, z);
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 4, 12), M('amber'));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.set(x, y - 0.14, z);
    g.add(ring2);
    const flames = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = x + Math.sin(a) * 0.45, cz = z + Math.cos(a) * 0.45;
      cyl(g, 0.02, 0.02, 0.1, M('cream'), cx, y + 0.02, cz, 6);
      const f = box(g, 0.016, 0.035, 0.016, new THREE.MeshBasicMaterial({ color: col('lampGlow') }), cx, y + 0.09, cz);
      f.castShadow = false;
      flames.push(f);
      const drop = box(g, 0.02, 0.06, 0.02, M('goldLight', { emissive: col('gold'), emissiveIntensity: 0.4 }), cx, y - 0.1, cz);
      drop.castShadow = false;
    }
    const l = light(g, 'gold', 5, 7, x, y - 0.1, z, 1.6);
    return {
      focus: V(x, y, z), view: V(0.45, -0.35, 1), dist: 2.0, colliders: [], lit: true,
      update: (dt, t) => {
        flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 13 + i * 2.1) * 0.25; });
        l.intensity = 5 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.15;
      },
    };
  },
};

// ---------------- people ----------------

/** A standing customer: coat, hat, a glass in the right hand that comes up now and then. */
function makePatron({ coat = 'navyLight', hat = 'ink', skin = 'skin', withCue = false } = {}) {
  const g = new THREE.Group();
  g.name = 'Patron';
  const coatM = M(coat), dark = M('ink'), skinM = M(skin);
  for (const s of [-1, 1]) {
    box(g, 0.13, 0.82, 0.14, M('ashDark'), s * 0.08, 0.41, 0);
    box(g, 0.13, 0.05, 0.22, dark, s * 0.08, 0.025, 0.04);
  }
  box(g, 0.38, 0.62, 0.22, coatM, 0, 1.12, 0);
  box(g, 0.1, 0.3, 0.012, M('paper'), 0, 1.25, 0.112);
  box(g, 0.04, 0.16, 0.014, M('red'), 0, 1.22, 0.118);
  box(g, 0.09, 0.56, 0.1, coatM, -0.24, 1.1, 0); // left arm hanging
  const arm = new THREE.Group(); // right arm: pivots at the shoulder
  arm.position.set(0.24, 1.38, 0);
  g.add(arm);
  box(arm, 0.09, 0.32, 0.1, coatM, 0, -0.16, 0);
  const fore = new THREE.Group();
  fore.position.set(0, -0.3, 0);
  arm.add(fore);
  box(fore, 0.085, 0.085, 0.28, coatM, 0, 0, 0.12);
  box(fore, 0.07, 0.07, 0.07, skinM, 0, 0, 0.28);
  if (withCue) {
    const cue = box(fore, 0.02, 0.02, 1.4, M('amberMid'), 0, -0.02, 0.4);
    cue.rotation.x = 0.9;
  } else {
    const glass = makeGlass();
    glass.position.set(0, 0.0, 0.29);
    glass.scale.setScalar(0.9);
    fore.add(glass);
  }
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.47, 0);
  head.rotation.order = 'YXZ';
  g.add(head);
  box(head, 0.07, 0.06, 0.07, skinM, 0, 0, 0);
  box(head, 0.18, 0.21, 0.19, skinM, 0, 0.12, 0);
  box(head, 0.3, 0.02, 0.3, M(hat), 0, 0.22, 0); // brim
  box(head, 0.2, 0.1, 0.2, M(hat), 0, 0.28, 0);
  box(head, 0.205, 0.025, 0.205, M('red'), 0, 0.245, 0);
  return { root: g, head, arm, fore };
}

/** Somebody standing who glances at you and has a drink (or a shot on the pool table) now and then. */
class Stander {
  constructor(parts, { lift = 'drink' } = {}) {
    Object.assign(this, parts);
    this.lift = lift;
    this.t = Math.random() * 5;
    this.next = 3 + Math.random() * 5;
    this.action = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.arm.rotation.x = 0.6;
    this.fore.rotation.x = -0.9;
  }

  update(dt, eye) {
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) { this.next = 5 + Math.random() * 7; this.action = 2.4; }
    let up = 0;
    if (this.action > 0) {
      this.action -= dt;
      up = Math.sin(Math.min(1, (2.4 - this.action) / 2.4) * Math.PI);
    }
    if (this.lift === 'drink') {
      this.arm.rotation.x = -0.35 - up * 0.9;
      this.fore.rotation.x = -0.9 - up * 0.9;
    } else {
      // a slow stroke of the cue
      this.arm.rotation.x = -0.6 + Math.sin(this.t * 2) * 0.12 * up;
      this.fore.rotation.x = -0.6;
    }
    // look at you when you're close, otherwise into the drink
    let ty = 0, tp = up * -0.25;
    if (eye) {
      const local = this.root.worldToLocal(eye.clone());
      const d = Math.hypot(local.x, local.z);
      if (d < 3.5) {
        ty = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.0, 1.0);
        tp = THREE.MathUtils.clamp(-Math.atan2(local.y - 1.55, d), -0.4, 0.4);
      }
    }
    const k = 1 - Math.exp(-4 * dt);
    this.yaw += (ty - this.yaw) * k;
    this.pitch += (tp - this.pitch) * k;
    this.head.rotation.set(this.pitch, this.yaw, 0);
    this.root.position.y = Math.sin(this.t * 1.5) * 0.004;
  }
}

// ---------------- the room ----------------

/**
 * Builds the bar: room, counter, back bar with the catalog, the bartender, the customers and
 * every catalog item (hidden until bought). `setOwned()` shows what you have.
 */
export class BarScene {
  constructor(models = {}) {
    const scene = new THREE.Scene();
    scene.name = 'BarScene';
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x050407, 9, 16);
    this.scene = scene;
    this.colliders = []; // [x0, z0, x1, z1]
    this.dynamic = []; // { pos: Vector3, r }
    this.items = {};
    this.people = [];
    this.time = 0;

    const hemi = new THREE.HemisphereLight(0x8a6448, 0x120c0a, 1.0);
    this.hemi = hemi;
    hemi.name = 'Ambient';
    scene.add(hemi);
    this._buildRoom();
    this._buildCounter();
    this._buildTable();
    this._buildPeople(models);

    for (const id of Object.keys(BUILDERS)) {
      const g = new THREE.Group();
      g.name = `Item_${id}`;
      g.visible = false;
      scene.add(g);
      const info = BUILDERS[id](g);
      const mats = new Set();
      g.traverse((o) => { if (o.isMesh) mats.add(o.material); });
      for (const m of mats) m.userData.base = { emissive: m.emissive?.clone(), intensity: m.emissiveIntensity ?? 0 };
      this.items[id] = { id, group: g, mats: [...mats], ...info };
    }
  }

  _buildRoom() {
    const s = this.scene, { x0, x1, z0, z1, h } = ROOM;
    const W = x1 - x0, D = z1 - z0;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'Floor';
    s.add(floor);
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M('shadow'));
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.y = h;
    this.ceiling.name = 'Ceiling';
    s.add(this.ceiling);
    for (let x = x0 + 1; x < x1; x += 2) box(this.ceiling, 0.14, D, 0.12, M('woodDark'), x, 0, 0.06); // beams

    const wallTex = panelTexture(3);
    const lowTex = panelTexture(4, COLORS.woodMid, COLORS.ink, COLORS.woodDark);
    const wall = (name, len, rotY, px, pz) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(px, 0, pz);
      g.rotation.y = rotY;
      s.add(g);
      const t = wallTex.clone(); t.repeat.set(len / 0.5, (h - 0.95) / 0.5); t.needsUpdate = true;
      const up = box(g, len, h - 0.95, 0.1, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), 0, 0.95 + (h - 0.95) / 2, 0);
      up.castShadow = false;
      const t2 = lowTex.clone(); t2.repeat.set(len / 0.5, 2); t2.needsUpdate = true;
      const low = box(g, len, 0.95, 0.12, new THREE.MeshStandardMaterial({ map: t2, roughness: 0.9 }), 0, 0.475, 0.01);
      low.castShadow = false;
      box(g, len, 0.05, 0.16, M('woodLight'), 0, 0.96, 0.02).castShadow = false; // chair rail
      box(g, len, 0.12, 0.14, M('woodDark'), 0, h - 0.06, 0.02).castShadow = false; // crown
      return g;
    };
    // each wall's +z (its inner face) points into the room
    this.walls = {
      back: wall('BackWall', W, 0, 0, z0 - 0.05),
      front: wall('FrontWall', W, Math.PI, 0, z1 + 0.05),
      left: wall('LeftWall', D, Math.PI / 2, x0 - 0.05, 0),
      right: wall('RightWall', D, -Math.PI / 2, x1 + 0.05, 0),
    };

    // the street door (front wall) and the door to the back room (left wall)
    const door = (parent, x, glowStrip) => {
      box(parent, 1.12, 2.22, 0.06, M('woodDark'), x, 1.11, 0.08);
      box(parent, 0.98, 2.1, 0.06, M('wood'), x, 1.05, 0.11);
      for (const y of [0.55, 1.5]) box(parent, 0.7, 0.6, 0.02, M('woodMid'), x, y, 0.15);
      cyl(parent, 0.03, 0.03, 0.05, M('gold'), x + 0.38, 1.0, 0.16, 6).rotation.x = Math.PI / 2;
      if (glowStrip) {
        const strip = box(parent, 0.96, 0.02, 0.02, glow('amber', 1.4), x, 0.01, 0.16);
        strip.castShadow = false;
      }
    };
    door(this.walls.front, 0, false);
    box(this.walls.front, 0.5, 0.35, 0.03, M('ink'), 0, 2.45, 0.1); // a little "open" board over it
    door(this.walls.left, -BACK_DOOR.z, true); // the left wall's local x runs along world -z
    this.doorLight = light(s, 'amber', 0.9, 2.2, BACK_DOOR.x + 0.4, 0.25, BACK_DOOR.z, 2);
    const plate = box(this.walls.left, 0.36, 0.1, 0.02, M('gold'), -BACK_DOOR.z, 2.32, 0.12);
    plate.castShadow = false;

    // the one bare bulb you start with
    const bx = -0.6, bz = -0.3;
    box(s, 0.012, 0.5, 0.012, M('ink'), bx, h - 0.25, bz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow('lampGlow', 2.5));
    bulb.position.set(bx, h - 0.55, bz);
    s.add(bulb);
    this.bulb = light(s, 'lampGlow', 14, 12, bx, h - 0.62, bz, 1.5);
    this.bulb.castShadow = true;
    this.bulb.shadow.mapSize.set(256, 256);
    this.bulb.shadow.bias = -0.004;
    this.bulb.shadow.camera.near = 0.1;
    this.bulb.shadow.camera.far = 9;
  }

  _buildCounter() {
    const s = this.scene;
    const g = new THREE.Group();
    g.name = 'Counter';
    s.add(g);
    // front counter: x -2.85..1.45, open at the right end so you can walk behind it
    const cx = -0.7, cw = 4.3, cz = -1.62;
    const t = panelTexture(8, COLORS.woodDark, COLORS.ink, COLORS.wood); t.repeat.set(cw / 0.5, 2);
    box(g, cw, 1.0, 0.5, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), cx, 0.5, cz);
    box(g, cw + 0.1, 0.06, 0.66, M('wood', { roughness: 0.5 }), cx, 1.03, cz + 0.04);
    box(g, cw + 0.12, 0.02, 0.68, M('amberDark'), cx, 1.065, cz + 0.04).castShadow = false;
    box(g, 0.5, 1.06, 0.66, M('woodDark'), cx + cw / 2 - 0.05, 0.53, cz + 0.04); // end cap
    const rail = cyl(g, 0.025, 0.025, cw, M('gold', { roughness: 0.4 }), cx, 0.2, cz + 0.36, 6);
    rail.rotation.z = Math.PI / 2;
    for (let x = cx - cw / 2 + 0.4; x < cx + cw / 2; x += 0.9) cyl(g, 0.02, 0.02, 0.2, M('gold'), x, 0.1, cz + 0.33, 5);
    // things on the counter
    const glassA = makeGlass(); glassA.position.set(-2.3, 1.075, -1.5); g.add(glassA);
    const glassB = makeGlass(); glassB.position.set(-1.05, 1.075, -1.58); g.add(glassB);
    const tray = makeAshtray(); tray.root.position.set(0.3, 1.075, -1.55); g.add(tray.root);
    this.counterEmber = tray.ember;
    cyl(g, 0.12, 0.12, 0.015, M('bone', { roughness: 0.4 }), -0.1, 1.08, -1.65, 10); // a tray of nuts
    this.colliders.push([cx - cw / 2 - 0.05, cz - 0.3, cx + cw / 2 + 0.05, cz + 0.37]);

    // back bar against the back wall: x -3.0..1.8
    const bbx = -0.6, bbw = 4.8, bbz = -2.77;
    const t2 = panelTexture(9, COLORS.woodMid, COLORS.ink, COLORS.woodDark); t2.repeat.set(bbw / 0.5, 2);
    box(g, bbw, 0.92, 0.44, new THREE.MeshStandardMaterial({ map: t2, roughness: 0.85 }), bbx, 0.46, bbz);
    box(g, bbw + 0.04, 0.05, 0.48, M('wood'), bbx, 0.945, bbz);
    for (let x = bbx - bbw / 2 + 0.3; x < bbx + bbw / 2 - 1.4; x += 0.28) {
      const c = ['amber', 'sage', 'redLight', 'cream'][Math.floor(Math.abs(x * 7)) % 4];
      cyl(g, 0.03, 0.035, 0.22, M(c, { roughness: 0.3 }), x, 1.08, bbz - 0.08, 7); // a few bottles even without the shelf
    }
    box(g, 0.5, 0.3, 0.32, M('ash', { roughness: 0.5 }), -2.5, 1.12, bbz); // the till
    box(g, 0.42, 0.1, 0.05, M('ink'), -2.5, 1.2, bbz + 0.17);
    this.colliders.push([bbx - bbw / 2 - 0.05, ROOM.z0, bbx + bbw / 2 + 0.05, bbz + 0.25]);

    // the catalog: an open book on the back bar under a green desk lamp
    const book = new THREE.Group();
    book.name = 'CatalogBook';
    book.position.copy(BOOK);
    book.rotation.y = Math.PI - 0.25;
    g.add(book);
    box(book, 0.46, 0.025, 0.32, M('red'), 0, 0.0125, 0);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.03, 0.29), [
      M('paper'), M('paper'), new THREE.MeshStandardMaterial({ map: bookTexture(), roughness: 0.9 }), M('paper'), M('bone'), M('bone'),
    ]);
    pages.position.y = 0.035;
    pages.castShadow = true;
    book.add(pages);
    const ribbon = box(book, 0.02, 0.004, 0.12, M('gold'), 0.02, 0.052, 0.18);
    ribbon.castShadow = false;
    this.bookMesh = book;
    const lampX = BOOK.x + 0.42, lampZ = BOOK.z - 0.05;
    cyl(g, 0.08, 0.09, 0.03, M('gold'), lampX, 0.985, lampZ, 8);
    cyl(g, 0.012, 0.012, 0.32, M('gold'), lampX, 1.15, lampZ, 5);
    const shade = box(g, 0.3, 0.07, 0.12, glow('sage', 0.25), lampX - 0.08, 1.32, lampZ);
    shade.rotation.z = 0.25;
    this.bookLight = light(g, 'lampGlow', 1.6, 1.8, BOOK.x + 0.1, 1.3, BOOK.z + 0.05, 2);
  }

  _buildTable() {
    const g = new THREE.Group();
    g.name = 'RoundTable';
    g.position.set(-1.9, 0, 0.9);
    this.scene.add(g);
    const wood = M('woodDark');
    cyl(g, 0.5, 0.5, 0.05, M('wood'), 0, 0.74, 0, 16);
    cyl(g, 0.06, 0.08, 0.7, wood, 0, 0.36, 0, 8);
    cyl(g, 0.3, 0.32, 0.04, wood, 0, 0.02, 0, 12);
    const gl = makeGlass(); gl.position.set(0.15, 0.765, -0.1); g.add(gl);
    const gl2 = makeGlass(); gl2.position.set(-0.2, 0.765, 0.05); g.add(gl2);
    const cards = box(g, 0.065, 0.012, 0.09, M('cream'), 0.05, 0.775, 0.18);
    cards.rotation.y = 0.4;
    this.colliders.push([-1.9 - 0.55, 0.9 - 0.55, -1.9 + 0.55, 0.9 + 0.55]);
  }

  _buildPeople(models) {
    const s = this.scene;
    this.smoke = new Smoke(s, 40);
    // the bartender, behind the counter
    const bt = makeBartender();
    bt.root.position.set(-1.0, 0, -2.2);
    bt.tray.visible = false; // working the bar tonight, not carrying drinks
    s.add(bt.root);
    this.bartender = { ...bt, x: -1.0, goal: -1.0, wait: 2, yaw: 0, pos: bt.root.position };
    this.dynamic.push({ pos: bt.root.position, r: 0.3 });

    // two regulars at the round table (the back-room mob, off duty), in better light
    const seats = [
      { model: 'enforcer', id: 'enforcer', a: Math.PI * 0.75 },
      { model: 'shark', id: 'shark', a: -Math.PI * 0.6 },
    ];
    const T = { x: -1.9, z: 0.9 };
    for (const st of seats) {
      const px = T.x + Math.sin(st.a) * 0.98, pz = T.z + Math.cos(st.a) * 0.98;
      const rot = Math.atan2(T.x - px, T.z - pz);
      if (models.chair) {
        const chair = models.chair.clone(true);
        chair.position.set(px, 0, pz);
        chair.rotation.y = rot;
        s.add(chair);
      }
      this.colliders.push([px - 0.3, pz - 0.3, px + 0.3, pz + 0.3]);
      const model = models[st.model];
      if (!model) continue;
      const body = model.clone(true);
      body.name = `Customer_${st.id}`;
      body.position.set(px, 0, pz);
      body.rotation.y = rot;
      body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.8); } });
      s.add(body);
      this.people.push({ kind: 'seated', ch: new Character(body, 0, { smoke: this.smoke, id: st.id }) });
    }

    // standing customers: one at the counter always, one at the darts and one at the pool table
    // when you own them
    const add = (opts, x, z, rotY, lift, needs) => {
      const p = makePatron(opts);
      p.root.position.set(x, 0, z);
      p.root.rotation.y = rotY;
      s.add(p.root);
      const st = new Stander(p, { lift });
      this.people.push({ kind: 'standing', st, needs, root: p.root, box: [x - 0.25, z - 0.25, x + 0.25, z + 0.25] });
    };
    add({ coat: 'navyLight', hat: 'ink' }, -2.85, -0.98, Math.PI + 0.35, 'drink', null);
    add({ coat: 'leather', hat: 'woodDark', skin: 'skinLight' }, 2.75, -0.7, Math.PI / 2 - 0.2, 'drink', 'dartboard');
    add({ coat: 'redMid', hat: 'ink', skin: 'skinMid', withCue: true }, 0.05, 1.75, Math.PI / 2 + 0.5, 'cue', 'pool');
  }

  /** Show what you own. */
  setOwned(ids) {
    this.owned = new Set(ids);
    for (const it of Object.values(this.items)) it.group.visible = this.owned.has(it.id);
    for (const p of this.people) if (p.kind === 'standing') p.root.visible = !p.needs || this.owned.has(p.needs);
    this.preview = null;
  }

  /** Everything you can't walk through right now (furniture, owned items, people). */
  solidBoxes() {
    const out = this.colliders.slice();
    for (const it of Object.values(this.items)) if (this.owned?.has(it.id)) out.push(...it.colliders);
    for (const p of this.people) if (p.kind === 'standing' && p.root.visible) out.push(p.box);
    return out;
  }

  /** Light up one item (bought or not) as a preview in the catalog; null for none. */
  setPreview(id) {
    if (this.preview === id) return;
    const old = this.preview && this.items[this.preview];
    if (old) old.group.visible = this.owned.has(old.id);
    this.preview = id;
    const it = id && this.items[id];
    if (!this.previewBox) {
      this.previewBox = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: col('gold'), fog: false }),
      );
      this.previewBox.name = 'PreviewBox';
      this.scene.add(this.previewBox);
    }
    this.previewBox.visible = false;
    if (!this.previewLight) {
      this.previewLight = new THREE.PointLight(col('lampGlow'), 0, 3.5, 2);
      this.previewLight.name = 'PreviewLight';
      this.scene.add(this.previewLight);
    }
    this.previewLight.intensity = 0;
    if (!it) return;
    it.group.visible = true;
    // a little light from where you're looking, so things in dark corners still read
    this.previewLight.position.copy(it.view).normalize().multiplyScalar(Math.min(1, it.dist * 0.5)).add(it.focus);
    this.previewLight.intensity = 2.2;
    if (this.owned.has(it.id)) return;
    // a gold wire box around a thing you don't own yet: "this is what it would look like"
    const b = new THREE.Box3().setFromObject(it.group);
    b.getCenter(this.previewBox.position);
    b.getSize(this.previewBox.scale).addScalar(0.06);
    this.previewBox.visible = true;
  }

  update(dt, eye) {
    this.time += dt;
    const t = this.time;
    for (const it of Object.values(this.items)) if (it.group.visible) it.update?.(dt, t);
    // the preview's wire box blinks so you can tell it isn't yours yet
    if (this.previewBox?.visible) this.previewBox.material.color.set(Math.sin(t * 6) > -0.3 ? COLORS.gold : COLORS.amberDark);
    this.bulb.intensity = 14 + Math.sin(t * 17) * 0.2 + (Math.random() < 0.004 ? -7 : 0);
    this.counterEmber?.update(dt);
    // the bartender drifts along the bar between jobs and keeps an eye on you
    const b = this.bartender;
    b.wait -= dt;
    if (b.wait <= 0 && Math.abs(b.goal - b.x) < 0.01) {
      b.goal = -2.2 + Math.random() * 2.6;
      b.wait = 3 + Math.random() * 5;
    }
    const step = THREE.MathUtils.clamp(b.goal - b.x, -0.6 * dt, 0.6 * dt);
    b.x += step;
    b.root.position.x = b.x;
    b.root.position.y = Math.abs(step) > 1e-4 ? Math.abs(Math.sin(t * 7)) * 0.015 : 0;
    if (eye) {
      const local = b.root.worldToLocal(eye.clone());
      const ty = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.0, 1.0);
      b.yaw += (ty - b.yaw) * (1 - Math.exp(-3 * dt));
      b.head.rotation.y = b.yaw;
    }
    for (const p of this.people) {
      if (p.kind === 'seated') {
        p.ch.lookAt(eye && eye.distanceTo(p.ch.root.position) < 3.2 ? eye : null);
        p.ch.update(dt, t);
      } else if (p.root.visible) p.st.update(dt, eye);
    }
    this.smoke.update(dt);
  }

  /** World positions of everyone's heads (for speech bubbles). */
  heads() {
    const out = [{ who: 'bartender', pos: this.bartender.head.getWorldPosition(new THREE.Vector3()) }];
    this.people.forEach((p, i) => {
      const h = p.kind === 'seated' ? p.ch.head : p.st.head;
      if (p.kind === 'standing' && !p.root.visible) return;
      if (h) out.push({ who: i, pos: h.getWorldPosition(new THREE.Vector3()) });
    });
    return out;
  }
}
