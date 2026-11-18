import * as THREE from 'three';
import { COLORS } from '../shared/render/palette.js';
import { paintTexture, hashNoise } from '../shared/render/textures.js';
import { drawText, textWidth } from '../shared/ui/font.js';
import { makeBartender, makeGlass, makeAshtray, Smoke } from '../holdem/scene/Extras.js';
import { Character } from '../holdem/scene/BackRoom.js';
import { ease } from '../shared/anim/Tweens.js';

/** Up with a snap and a hair of overshoot, hold, then down smoothly: 0..1 over a reach. */
function reachCurve(t, up, hold, down) {
  if (t < up) return ease.outBack(t / up);
  if (t < up + hold) return 1;
  return 1 - ease.inOutCubic(Math.min(1, (t - up - hold) / down));
}
import { HORSES } from './horseRace.js';

// Your own bar, as a room you walk around in. Metres; +z points from the counter to the
// street door. The people, the horse-race table and the shooting gallery come from bar.glb
// (tools/blender/bar.py); the room and the smaller catalog items are built here from boxes in
// palette colours. Everything goes through the same pixel post pass as the back room.

export const ROOM = { x0: -7, x1: 7, z0: -5, z1: 5, h: 3.4 };
export const EYE = 1.6;
export const START = { x: 0, z: 4.1, yaw: 0 };
/** The catalog lies open on the back bar, behind the counter. */
export const BOOK = new THREE.Vector3(1.6, 0.97, -4.74);
/** The door to the back room (and the next night at the table), in the left wall. */
export const BACK_DOOR = new THREE.Vector3(-6.95, 1.0, 3.4);
/** The front counter: x0..x1 along the bar, its top at y, the customer's edge at zFront. */
export const COUNTER = { x0: -5.6, x1: 1.6, z: -2.7, zFront: -2.42, y: 1.075 };
const TAP = new THREE.Vector3(-2.0, 0.945, -4.62);
const BARTENDER_Z = -3.7;
/** Where the horse-race table and the shooting gallery stand once you've bought them. */
export const HORSE_TABLE = { pos: new THREE.Vector3(3.6, 0, -1.4), rotY: 0 };
export const GALLERY = { pos: new THREE.Vector3(5.05, 0, 2.2), rotY: -Math.PI / 2 };
/** Horses run along the track's local x from START_X to FINISH_X, lane k at local z LANES[k]. */
export const TRACK = { y: 0.873, startX: -0.84, finishX: 0.84, lanes: [0.3, 0.1, -0.1, -0.3] };

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

/** A copy of a node from bar.glb, sitting at its own origin, with Blender's ".001" suffixes gone. */
function fromModel(models, name) {
  const src = models.bar?.getObjectByName(name);
  if (!src) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.traverse((c) => {
    const m = /^(Head|UpperArmR|ForeArmR|HandTipR)[_.\d]*$/.exec(c.name);
    if (m) c.name = m[1];
  });
  return o;
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
  t.repeat.set((ROOM.x1 - ROOM.x0) * 2, (ROOM.z1 - ROOM.z0) * 2);
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

/** A painted sign: "DERBY" over the horse table, "SHOOT" over the gallery. */
function signTexture(word, fg, bg) {
  const w = textWidth(word, 1) + 8;
  return paintTexture(w, 12, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 11, w, 1);
    drawText(ctx, word, 4, 3, fg);
  });
}

// ---------------- the things you can buy ----------------
// Each builder fills `g` in the item's own coordinates (front facing +z, floor at y = 0) and
// returns: focus (where the catalog camera zooms to) and view (direction from the focus to the
// camera), both local; dist; solid (blocks walking: its floor box), or colliders (local boxes
// [x0, z0, x1, z1]); update(dt, t) for little animations.

const LAYOUT = {
  stools: { pos: [-2.05, -2.05], rot: 0 },
  plant: { pos: [6.3, -4.3], rot: 0 },
  dartboard: { pos: [6.97, -2.6], rot: -Math.PI / 2 },
  lights: { pos: [0, 0], rot: 0 },
  shelf: { pos: [-2, -4.86], rot: 0 },
  fan: { pos: [1.4, 2.4], rot: 0 },
  neon: { pos: [-0.7, -4.94], rot: 0 },
  portrait: { pos: [-6.97, 1.2], rot: Math.PI / 2 },
  jukebox: { pos: [-6.65, -1.2], rot: Math.PI / 2 },
  horses: { pos: [HORSE_TABLE.pos.x, HORSE_TABLE.pos.z], rot: HORSE_TABLE.rotY },
  piano: { pos: [3.6, 4.62], rot: Math.PI },
  gallery: { pos: [GALLERY.pos.x, GALLERY.pos.z], rot: GALLERY.rotY },
  pool: { pos: [1.4, 2.4], rot: 0 },
  aquarium: { pos: [-4.4, 4.7], rot: Math.PI },
  chandelier: { pos: [-4.4, 0.6], rot: 0 },
};

const BUILDERS = {
  stools(g) {
    const leather = M('redLight'), chrome = M('bone', { roughness: 0.4 }), dark = M('ash');
    const colliders = [];
    for (let i = 0; i < 8; i++) {
      const x = -3.15 + i * 0.9;
      cyl(g, 0.17, 0.16, 0.07, leather, x, 0.78, 0, 12);
      cyl(g, 0.15, 0.15, 0.02, M('red'), x, 0.735, 0, 12);
      cyl(g, 0.028, 0.028, 0.7, chrome, x, 0.38, 0, 6);
      cyl(g, 0.11, 0.11, 0.015, chrome, x, 0.3, 0, 10);
      cyl(g, 0.19, 0.21, 0.03, dark, x, 0.015, 0, 10);
      colliders.push([x - 0.18, -0.18, x + 0.18, 0.18]);
    }
    return { focus: V(0, 0.75, 0), view: V(0.15, 0.75, 1), dist: 5, colliders };
  },

  plant(g) {
    cyl(g, 0.3, 0.22, 0.5, M('leather'), 0, 0.25, 0, 10);
    cyl(g, 0.31, 0.31, 0.04, M('amberDark'), 0, 0.51, 0, 10);
    cyl(g, 0.27, 0.27, 0.02, M('woodDark'), 0, 0.5, 0, 10);
    cyl(g, 0.03, 0.045, 1.2, M('wood'), 0, 1.05, 0, 6);
    const crown = new THREE.Group();
    crown.position.set(0, 1.62, 0);
    g.add(crown);
    const leafA = M('sage'), leafB = M('feltLight');
    for (let i = 0; i < 10; i++) {
      const arm = new THREE.Group();
      arm.rotation.set(0, (i / 10) * Math.PI * 2, 0);
      crown.add(arm);
      const leaf = box(arm, 0.11, 0.02, 0.7, i % 2 ? leafA : leafB, 0, 0, 0.34);
      leaf.rotation.x = 0.45 + (i % 3) * 0.18;
    }
    return {
      focus: V(0, 1.2, 0), view: V(-0.9, 0.5, 1), dist: 2.8, solid: true,
      update: (dt, t) => { crown.rotation.z = Math.sin(t * 0.7) * 0.04; crown.rotation.x = Math.sin(t * 0.5 + 1) * 0.03; },
    };
  },

  dartboard(g) {
    const y = 1.65;
    const disc = (r, mat, dz) => {
      const o = cyl(g, r, r, 0.02, mat, 0, y, dz, 20);
      o.rotation.x = Math.PI / 2;
    };
    box(g, 0.7, 0.7, 0.04, M('woodDark'), 0, y, 0.0);
    disc(0.25, M('ink'), 0.03);
    disc(0.21, M('cream'), 0.04);
    disc(0.17, M('red'), 0.05);
    disc(0.12, M('cream'), 0.06);
    disc(0.07, M('sage'), 0.07);
    disc(0.025, M('redLight'), 0.08);
    for (const [dy, dx] of [[0.05, 0.03], [-0.08, -0.06], [0.1, -0.1]]) {
      const dart = box(g, 0.012, 0.012, 0.14, M('gold'), dx, y + dy, 0.15);
      dart.rotation.x = 0.15;
      box(g, 0.03, 0.03, 0.004, M('redLight'), dx, y + dy + 0.01, 0.21);
    }
    return { focus: V(0, y, 0.05), view: V(0.25, 0.15, 1), dist: 1.6 };
  },

  lights(g) {
    const shade = M('sage', { side: THREE.DoubleSide }), cord = M('ink');
    for (const x of [-4.6, -2.0, 0.6]) {
      const z = COUNTER.z;
      box(g, 0.012, 0.75, 0.012, cord, x, ROOM.h - 0.375, z);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 12, 1, true), shade);
      s.position.set(x, ROOM.h - 0.84, z);
      g.add(s);
      cyl(g, 0.05, 0.05, 0.05, M('ash'), x, ROOM.h - 0.75, z, 8);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow('lampGlow', 2.2));
      b.position.set(x, ROOM.h - 0.93, z);
      g.add(b);
      light(g, 'gold', 3.2, 5, x, ROOM.h - 1.0, z, 1.8);
    }
    return { focus: V(-2, 2.3, COUNTER.z), view: V(0.1, -0.15, 1), dist: 4.6 };
  },

  shelf(g) {
    const plank = M('woodLight'), bracket = M('ash');
    const bottleCols = ['amber', 'sage', 'redLight', 'gold', 'cream', 'blue', 'amberMid', 'feltLight', 'red'];
    const r = hashNoise(5);
    for (const [k, y] of [1.55, 2.1].entries()) {
      box(g, 7.6, 0.04, 0.28, plank, 0, y, 0.12);
      for (let x = -3.6; x <= 3.6; x += 1.2) box(g, 0.03, 0.12, 0.2, bracket, x, y - 0.08, 0.08);
      for (let x = -3.7, i = 0; x < 3.7; x += 0.14 + r() * 0.06, i++) {
        const c = bottleCols[(i * 4 + k * 3) % bottleCols.length];
        const h = 0.2 + r() * 0.12;
        const m = M(c, { emissive: col(c), emissiveIntensity: 0.12, roughness: 0.3 });
        cyl(g, 0.035, 0.04, h, m, x, y + 0.02 + h / 2, 0.14 + (r() - 0.5) * 0.08, 7);
        cyl(g, 0.012, 0.018, 0.07, m, x, y + 0.02 + h + 0.035, 0.14, 6);
        if (i % 3 === 0) box(g, 0.05, 0.05, 0.004, M('paper'), x, y + 0.02 + h * 0.45, 0.18);
      }
    }
    return { focus: V(0, 1.85, 0.1), view: V(0, 0.12, 1), dist: 3.4 };
  },

  fan(g) {
    box(g, 0.025, 0.4, 0.025, M('ash'), 0, ROOM.h - 0.2, 0);
    cyl(g, 0.11, 0.13, 0.12, M('bone', { roughness: 0.5 }), 0, ROOM.h - 0.45, 0, 12);
    const rotor = new THREE.Group();
    rotor.position.set(0, ROOM.h - 0.52, 0);
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
      focus: V(0, ROOM.h - 0.55, 0), view: V(0.35, -0.5, 1), dist: 1.9,
      update: (dt) => { rotor.rotation.y += dt * 4.2; },
    };
  },

  neon(g) {
    const y = 2.8;
    const tex = neonTexture();
    const sign = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0xffffff });
    box(g, 1.06, 0.4, 0.05, M('ink'), 0, y, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.34), sign);
    face.position.set(0, y, 0.03);
    g.add(face);
    const l = light(g, 'redLight', 2.4, 4, 0, y, 0.4, 1.8);
    let off = 0;
    return {
      focus: V(0, y, 0), view: V(0, -0.15, 1), dist: 2.1,
      update: (dt, t) => {
        off -= dt;
        if (off < -3 - Math.random() * 6) off = 0.12 + Math.random() * 0.2;
        const on = off <= 0 || Math.sin(t * 60) > 0.3;
        sign.emissiveIntensity = on ? 1.6 : 0.25;
        l.intensity = on ? 2.4 : 0.3;
      },
    };
  },

  portrait(g) {
    const y = 1.9;
    box(g, 0.64, 0.78, 0.05, M('gold', { roughness: 0.5 }), 0, y, 0);
    box(g, 0.56, 0.7, 0.06, M('amberDark'), 0, y, 0.003);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.64), new THREE.MeshStandardMaterial({ map: portraitTexture(), roughness: 0.9 }));
    pic.position.set(0, y, 0.04);
    g.add(pic);
    box(g, 0.34, 0.03, 0.1, M('gold'), 0, y + 0.47, 0.08);
    light(g, 'lampGlow', 0.8, 1.4, 0, y + 0.42, 0.25, 2);
    return { focus: V(0, y, 0), view: V(0.15, 0.05, 1), dist: 1.4 };
  },

  jukebox(g) {
    const body = M('woodDark'), trim = M('woodLight');
    box(g, 0.62, 1.15, 0.45, body, 0, 0.575, 0);
    const top = cyl(g, 0.31, 0.31, 0.45, trim, 0, 1.15, 0, 14);
    top.rotation.x = Math.PI / 2;
    box(g, 0.46, 0.32, 0.02, glow('amber', 0.9), 0, 0.98, 0.23);
    const bands = [];
    const hues = ['redLight', 'gold', 'sage', 'blue'];
    for (let i = 0; i < 4; i++) {
      const m = glow(hues[i], 1.2);
      bands.push(m);
      box(g, 0.5, 0.05, 0.02, m, 0, 0.72 - i * 0.09, 0.23);
    }
    box(g, 0.4, 0.12, 0.03, M('ink'), 0, 0.2, 0.23);
    const l = light(g, 'amber', 1.6, 3, 0, 0.9, 0.55, 1.8);
    return {
      focus: V(0, 0.9, 0), view: V(0.25, 0.3, 1), dist: 2.0, solid: true,
      update: (dt, t) => {
        const k = Math.floor(t * 4);
        bands.forEach((m, i) => m.emissive.set(COLORS[hues[(i + k) % 4]]));
        l.intensity = 1.4 + Math.sin(t * 3) * 0.25;
      },
    };
  },

  horses(g, ctx) {
    const track = fromModel(ctx.models, 'HorseTrack');
    if (track) g.add(track);
    else {
      box(g, 2.0, 0.05, 1.1, M('wood'), 0, 0.835, 0);
      box(g, 1.86, 0.012, 0.8, M('feltMid'), 0, 0.866, 0);
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.45, 0.45]) box(g, 0.07, 0.8, 0.07, M('woodDark'), sx, 0.4, sz);
    }
    const horses = HORSES.map((_, k) => {
      let h = fromModel(ctx.models, `Horse_${k + 1}`);
      if (!h) {
        h = new THREE.Group();
        box(h, 0.15, 0.065, 0.06, M('bone'), 0, 0.14, 0);
        box(h, 0.06, 0.05, 0.07, M(['redLight', 'blue', 'sage', 'amber'][k]), 0, 0.2, 0);
      }
      h.position.set(TRACK.startX, TRACK.y, TRACK.lanes[k]);
      g.add(h);
      return h;
    });
    const crown = fromModel(ctx.models, 'Crown') ?? (() => {
      const c = new THREE.Group();
      cyl(c, 0.032, 0.032, 0.03, glow('gold', 0.5), 0, 0.015, 0, 8);
      return c;
    })();
    crown.visible = false;
    g.add(crown);
    // a little sign on a post so the table reads from across the room
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.17), new THREE.MeshStandardMaterial({ map: signTexture('DERBY', COLORS.amber, COLORS.ink), roughness: 0.8 }));
    sign.position.set(-1.12, 1.5, -0.3);
    g.add(sign);
    box(g, 0.03, 1.42, 0.03, M('gold'), -1.12, 0.71, -0.33);
    light(g, 'lampGlow', 1.6, 2.6, 0, 1.9, 0, 2);
    ctx.scene.race = { group: g, horses, crown };
    return { focus: V(0, 0.9, 0), view: V(0.0, 1.1, 1.1), dist: 2.4, solid: true };
  },

  piano(g) {
    const black = M('ink', { roughness: 0.45 });
    box(g, 1.5, 1.25, 0.55, black, 0, 0.625, 0);
    box(g, 1.42, 0.06, 0.3, black, 0, 0.72, 0.4);
    box(g, 1.36, 0.03, 0.2, M('cream'), 0, 0.765, 0.42);
    for (let i = 0; i < 18; i++) {
      if (i % 7 === 2 || i % 7 === 6) continue;
      box(g, 0.035, 0.03, 0.1, black, -0.63 + i * 0.075, 0.79, 0.38);
    }
    box(g, 1.3, 0.3, 0.04, M('woodDark'), 0, 0.98, 0.29);
    for (const dx of [-0.65, 0.65]) box(g, 0.08, 0.7, 0.08, black, dx, 0.35, 0.45);
    box(g, 0.85, 0.06, 0.36, M('leather'), 0, 0.48, 0.95);
    for (const dx of [-0.36, 0.36]) for (const dz of [-0.14, 0.14]) box(g, 0.04, 0.45, 0.04, black, dx, 0.225, 0.95 + dz);
    return { focus: V(0, 0.9, 0.3), view: V(0.3, 0.45, 1), dist: 2.6, solid: true };
  },

  gallery(g, ctx) {
    const booth = fromModel(ctx.models, 'Gallery');
    if (booth) g.add(booth);
    else {
      box(g, 2.6, 1.0, 0.36, M('redMid'), 0, 0.5, 0.18);
      box(g, 2.6, 2.3, 0.06, M('navy'), 0, 1.15, -1.9);
    }
    booth?.traverse((o) => {
      if (o.isMesh && o.name.startsWith('GalleryBulbs')) {
        o.material = o.material.clone();
        o.material.emissive = col('lampGlow');
        o.material.emissiveIntensity = 1.6;
        o.castShadow = false;
      }
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshStandardMaterial({ map: signTexture('SHOOT', COLORS.cream, COLORS.red), roughness: 0.8 }));
    sign.position.set(0, 2.62, 0.38);
    g.add(sign);
    light(g, 'lampGlow', 3.0, 4, 0, 2.0, -0.4, 1.8);
    light(g, 'amber', 1.2, 3, 0, 2.0, 0.8, 1.8);
    ctx.scene.galleryGroup = g;
    return { focus: V(0, 1.3, -0.6), view: V(0, 0.25, 1), dist: 3.2, solid: true };
  },

  pool(g) {
    const wood = M('woodDark'), rail = M('wood');
    box(g, 2.24, 0.2, 1.24, wood, 0, 0.7, 0);
    box(g, 2.04, 0.03, 1.04, M('felt'), 0, 0.815, 0);
    for (const s of [-1, 1]) {
      box(g, 2.24, 0.06, 0.1, rail, 0, 0.83, s * 0.57);
      box(g, 0.1, 0.06, 1.24, rail, s * 1.07, 0.83, 0);
    }
    for (const dx of [-1.0, 0, 1.0]) for (const s of [-1, 1]) cyl(g, 0.045, 0.045, 0.02, M('black'), dx, 0.84, s * 0.5, 8);
    for (const dx of [-0.95, 0.95]) for (const s of [-1, 1]) box(g, 0.14, 0.6, 0.14, wood, dx, 0.3, s * 0.48);
    const balls = ['white', 'redLight', 'gold', 'blue', 'ink', 'sage', 'amber', 'red'];
    balls.forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M(c, { roughness: 0.3 }));
      const row = i === 0 ? 0 : Math.floor((i - 1) / 2) + 1;
      b.position.set(i === 0 ? -0.55 : 0.25 + row * 0.055, 0.86, i === 0 ? 0 : ((i - 1) % 2) * 0.065 - 0.03 + (row % 2) * 0.03);
      b.castShadow = true;
      g.add(b);
    });
    const cue = box(g, 1.4, 0.022, 0.022, M('amberMid'), -0.2, 0.86, -0.42);
    cue.rotation.y = 0.12;
    const shade = box(g, 1.1, 0.12, 0.3, M('sage'), 0, 2.2, 0);
    shade.castShadow = false;
    box(g, 0.012, ROOM.h - 2.26, 0.012, M('ink'), 0, (ROOM.h + 2.26) / 2, 0);
    light(g, 'lampGlow', 2.4, 3.2, 0, 2.05, 0, 1.8);
    return { focus: V(0, 0.82, 0), view: V(0.25, 1, 0.85), dist: 3.0, solid: true };
  },

  aquarium(g) {
    box(g, 1.24, 0.7, 0.46, M('woodDark'), 0, 0.35, 0);
    box(g, 1.26, 0.04, 0.48, M('woodLight'), 0, 0.72, 0);
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.38), new THREE.MeshStandardMaterial({
      color: col('blue'), emissive: col('navy'), emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false,
    }));
    water.position.set(0, 0.99, 0);
    g.add(water);
    box(g, 1.12, 0.06, 0.4, M('amberDark'), 0, 0.77, 0);
    box(g, 1.16, 0.03, 0.42, M('ink'), 0, 1.255, 0);
    for (const dx of [-0.56, 0.56]) box(g, 0.03, 0.56, 0.42, M('ash'), dx, 0.99, 0);
    for (const dx of [-0.35, -0.3, 0.38]) { const w = box(g, 0.02, 0.22 + Math.abs(dx) * 0.2, 0.02, M('sage'), dx, 0.9, -0.05); w.castShadow = false; }
    const fish = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Group();
      const c = i % 2 ? 'gold' : 'amber';
      box(f, 0.06, 0.03, 0.015, glow(c, 0.5), 0, 0, 0);
      box(f, 0.02, 0.03, 0.01, glow('redLight', 0.4), -0.04, 0, 0);
      g.add(f);
      fish.push({ f, speed: 0.25 + i * 0.07, phase: i * 1.7, y: 0.86 + i * 0.07, z: 0.1 - (i % 3) * 0.1 });
    }
    light(g, 'blue', 1.4, 2.4, 0, 1.1, 0.5, 1.8);
    return {
      focus: V(0, 0.98, 0), view: V(0.1, 0.25, 1), dist: 1.8, solid: true,
      update: (dt, t) => {
        for (const o of fish) {
          const s = Math.sin(t * o.speed + o.phase);
          o.f.position.set(s * 0.45, o.y + Math.sin(t * 1.3 + o.phase) * 0.02, o.z);
          o.f.rotation.y = Math.cos(t * o.speed + o.phase) > 0 ? 0 : Math.PI;
        }
      },
    };
  },

  chandelier(g) {
    const y = 2.65;
    const gold = M('gold', { roughness: 0.4 });
    box(g, 0.02, ROOM.h - y - 0.1, 0.02, gold, 0, (ROOM.h + y + 0.1) / 2, 0);
    cyl(g, 0.06, 0.1, 0.18, gold, 0, y, 0, 8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 4, 16), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y - 0.04, 0);
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 4, 12), M('amber'));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.set(0, y - 0.14, 0);
    g.add(ring2);
    const flames = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = Math.sin(a) * 0.5, cz = Math.cos(a) * 0.5;
      cyl(g, 0.02, 0.02, 0.1, M('cream'), cx, y + 0.02, cz, 6);
      const f = box(g, 0.016, 0.035, 0.016, new THREE.MeshBasicMaterial({ color: col('lampGlow') }), cx, y + 0.09, cz);
      f.castShadow = false;
      flames.push(f);
      const drop = box(g, 0.02, 0.06, 0.02, M('goldLight', { emissive: col('gold'), emissiveIntensity: 0.4 }), cx, y - 0.1, cz);
      drop.castShadow = false;
    }
    const l = light(g, 'gold', 6, 8, 0, y - 0.1, 0, 1.6);
    return {
      focus: V(0, y, 0), view: V(0.45, -0.35, 1), dist: 2.2,
      update: (dt, t) => {
        flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 13 + i * 2.1) * 0.25; });
        l.intensity = 6 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.15;
      },
    };
  },
};

// ---------------- people ----------------

/** Fallback standing customer if bar.glb is missing: coat, hat, posable right arm. */
function makePatron({ coat = 'navyLight', hat = 'ink', skin = 'skin' } = {}) {
  const g = new THREE.Group();
  const coatM = M(coat), skinM = M(skin);
  for (const s of [-1, 1]) box(g, 0.13, 0.82, 0.14, M('ashDark'), s * 0.08, 0.41, 0);
  box(g, 0.38, 0.62, 0.22, coatM, 0, 1.12, 0);
  box(g, 0.09, 0.56, 0.1, coatM, 0.24, 1.1, 0);
  const up = new THREE.Group(); up.name = 'UpperArmR'; up.position.set(-0.24, 1.4, 0); g.add(up);
  box(up, 0.09, 0.3, 0.1, coatM, 0, -0.15, 0);
  const fo = new THREE.Group(); fo.name = 'ForeArmR'; fo.position.set(0, -0.3, 0); up.add(fo);
  box(fo, 0.085, 0.085, 0.3, coatM, 0, 0, 0.13);
  const tip = new THREE.Object3D(); tip.name = 'HandTipR'; tip.position.set(0, 0, 0.32); fo.add(tip);
  const head = new THREE.Group(); head.name = 'Head'; head.position.set(0, 1.47, 0); g.add(head);
  box(head, 0.18, 0.21, 0.19, skinM, 0, 0.12, 0);
  box(head, 0.3, 0.02, 0.3, M(hat), 0, 0.22, 0);
  box(head, 0.2, 0.1, 0.2, M(hat), 0, 0.28, 0);
  return g;
}

/** A pint (from bar.glb) or a whiskey glass. */
function makePint(models) {
  return fromModel(models, 'Pint') ?? makeGlass();
}

/**
 * Somebody standing at the bar: the seated characters' look-at and arm reach, plus a drink
 * raised to the mouth every few seconds (or, holding a cue, just a glance now and then).
 */
class Regular {
  constructor(root, { holds = 'pint', models, smoke }) {
    this.root = root;
    this.ch = new Character(root, 0, { smoke, id: 'regular' });
    this.ch.nextIdle = 4 + Math.random() * 6;
    this.holds = holds;
    this.next = 2 + Math.random() * 6;
    this.t = 0;
    this.solved = null;
    if (holds === 'pint' && this.ch.handTip) {
      const pint = makePint(models);
      pint.scale.setScalar(0.85);
      pint.position.set(0, -0.06, -0.02);
      this.ch.handTip.add(pint);
    } else if (holds === 'cue' && this.ch.handTip) {
      const cue = box(this.ch.handTip, 0.022, 0.022, 1.4, M('amberMid'), 0, 0, 0.3);
      cue.rotation.x = 0.7;
    }
  }

  update(dt, time, eye) {
    const ch = this.ch;
    ch.lookAt(eye && eye.distanceTo(this.root.position) < 4 ? eye : null);
    ch.update(dt, time);
    if (this.holds !== 'pint' || !ch.armRest) return;
    this.next -= dt;
    if (this.next <= 0 && !this.solved) {
      // bring the glass up to the mouth
      this.root.updateMatrixWorld(true);
      const head = ch.head.getWorldPosition(new THREE.Vector3());
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
      const mouth = head.clone().addScaledVector(fwd, 0.16).add(V(0, 0.02, 0));
      const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.root.quaternion);
      this.solved = ch.solveArm(mouth, head.clone().addScaledVector(right, 0.5).add(V(0, -0.6, 0)));
      this.t = 0;
    }
    if (this.solved) {
      this.t += dt;
      ch.setArm(reachCurve(this.t, 0.55, 1.2, 0.85), this.solved);
      if (this.t >= 2.6) { this.solved = null; ch.setArm(0); this.next = 5 + Math.random() * 8; }
    }
  }
}

/**
 * The bartender: keeps an eye on you, drifts along the bar, and every so often pulls a pint
 * at the tap, carries it down the bar and slides it across to someone (you, if you're standing
 * at the counter).
 */
class Bartender {
  constructor(scene, models, smoke) {
    let root = fromModel(models, 'Bartender');
    this.fallback = !root;
    if (!root) {
      const b = makeBartender();
      b.tray.visible = false;
      root = b.root;
    }
    root.position.set(-1.0, 0, BARTENDER_Z);
    scene.scene.add(root);
    this.root = root;
    this.world = scene;
    this.models = models;
    this.ch = new Character(root, 0, { smoke, id: 'bartender' });
    this.ch.nextIdle = Infinity; // no idle glances: he's watching you
    this.x = -1.0;
    this.goal = -1.0;
    this.facing = 0;
    this.wait = 2;
    this.serveIn = 6;
    this.job = null; // { step, t, ... }
    this.pints = [];
  }

  get head() { return this.ch.head; }

  _walk(dt, x) {
    const d = x - this.x;
    const step = THREE.MathUtils.clamp(d, -1.1 * dt, 1.1 * dt);
    this.x += step;
    this.walking = Math.abs(step) > 1e-4;
    if (this.walking) this.wantFacing = step > 0 ? Math.PI / 2 : -Math.PI / 2;
    return Math.abs(x - this.x) < 0.02;
  }

  _reach(target) {
    this.root.updateMatrixWorld(true);
    const sh = this.ch.upperArm.getWorldPosition(new THREE.Vector3());
    return this.ch.solveArm(target, sh.clone().add(V(0, -0.5, 0)).addScaledVector(new THREE.Vector3(-1, 0, 0).applyQuaternion(this.root.quaternion), 0.4));
  }

  update(dt, time, player) {
    const eye = player?.eye;
    this.walking = false;
    this.wantFacing = this.facing;
    const j = this.job;
    if (!j) {
      // idle: wander a little, face the room (and you)
      this.wait -= dt;
      if (this.wait <= 0 && Math.abs(this.goal - this.x) < 0.02) {
        this.goal = -4.8 + Math.random() * 5.6;
        this.wait = 3 + Math.random() * 4;
      }
      if (!this._walk(dt, this.goal) || !this.walking) {
        this.wantFacing = 0;
        if (eye) this.wantFacing = THREE.MathUtils.clamp(Math.atan2(eye.x - this.x, eye.z - BARTENDER_Z), -1.0, 1.0);
      }
      this.serveIn -= dt;
      if (this.serveIn <= 0 && this.ch.armRest) this._startServe(player);
    } else this._serveStep(dt, j);
    // turn smoothly; Character.update applies baseRotY
    let d = this.wantFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (1 - Math.exp(-6 * dt));
    this.ch.baseRotY = this.facing;
    this.root.position.x = this.x;
    this.ch.lookAt(eye && eye.distanceTo(this.root.position) < 9 ? eye : null);
    this.ch.update(dt, time);
    if (this.walking) this.root.position.y = Math.abs(Math.sin(time * 7)) * 0.018;
    for (const p of this.pints) {
      if (p.slide) {
        p.slide.t = Math.min(1, p.slide.t + dt / 0.7);
        p.obj.position.lerpVectors(p.slide.from, p.slide.to, 1 - (1 - p.slide.t) ** 3);
        if (p.slide.t >= 1) p.slide = null;
      }
    }
  }

  _startServe(player) {
    const atCounter = player && player.z > COUNTER.zFront && player.z < COUNTER.zFront + 1.6
      && player.x > COUNTER.x0 + 0.3 && player.x < COUNTER.x1 - 0.3;
    const x = atCounter ? player.x : -4.75; // you, or the regular at the end of the bar
    this.job = { step: 'toTap', t: 0, x: THREE.MathUtils.clamp(x, COUNTER.x0 + 0.4, COUNTER.x1 - 0.4), forYou: atCounter };
  }

  _serveStep(dt, j) {
    const ch = this.ch;
    j.t += dt;
    switch (j.step) {
      case 'toTap':
        if (this._walk(dt, TAP.x)) { j.step = 'turnBack'; j.t = 0; }
        break;
      case 'turnBack':
        this.wantFacing = Math.PI;
        if (j.t > 0.5) { j.solved = this._reach(TAP.clone().add(V(0, 0.42, 0.12))); j.step = 'pull'; j.t = 0; }
        break;
      case 'pull': {
        this.wantFacing = Math.PI;
        ch.setArm(reachCurve(j.t, 0.5, 0.9, 0.5), j.solved);
        if (j.t > 0.6 && !j.pint) {
          j.pint = makePint(this.models);
          ch.handTip.add(j.pint);
          j.pint.position.set(0, -0.08, -0.02);
          j.pint.scale.setScalar(0.85);
        }
        if (j.t > 1.9) { j.step = 'carry'; j.t = 0; }
        break;
      }
      case 'carry':
        if (this._walk(dt, j.x)) { j.step = 'turnFront'; j.t = 0; }
        break;
      case 'turnFront':
        this.wantFacing = 0;
        if (j.t > 0.45) { j.solved = this._reach(V(j.x, COUNTER.y + 0.1, COUNTER.z - 0.05)); j.step = 'place'; j.t = 0; }
        break;
      case 'place': {
        this.wantFacing = 0;
        ch.setArm(reachCurve(j.t, 0.55, 0.2, 0.5), j.solved);
        if (j.t > 0.6 && j.pint) {
          // let go: the pint stands on the counter and slides over to the customer
          this.world.scene.attach(j.pint);
          j.pint.rotation.set(0, 0, 0);
          j.pint.position.set(j.x, COUNTER.y, COUNTER.z - 0.05);
          const p = { obj: j.pint, slide: { t: 0, from: j.pint.position.clone(), to: V(j.x, COUNTER.y, COUNTER.zFront + 0.06) } };
          this.pints.push(p);
          if (this.pints.length > 4) { const old = this.pints.shift(); old.obj.removeFromParent(); }
          j.pint = null;
          this.world.events.push({ who: 'bartender', text: j.forYou ? 'On the house, boss.' : 'There you go.' });
        }
        if (j.t > 1.3) { ch.setArm(0); this.job = null; this.serveIn = 12 + Math.random() * 10; }
        break;
      }
      default:
        this.job = null;
    }
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
    // the further you get from something, the darker it is
    scene.fog = new THREE.Fog(0x050407, 2.8, 12.5);
    this.scene = scene;
    this.models = models;
    this.colliders = []; // [x0, z0, x1, z1]
    this.dynamic = []; // { pos: Vector3, r }
    this.items = {};
    this.regulars = [];
    this.seated = [];
    this.events = []; // things people say: { who, text }
    this.time = 0;

    this.hemi = new THREE.HemisphereLight(0x8a6448, 0x120c0a, 0.9);
    this.hemi.name = 'Ambient';
    scene.add(this.hemi);
    this.smoke = new Smoke(scene, 50);
    this._buildRoom();
    this._buildCounter();
    this._buildTables();
    this._buildDecor();

    const ctx = { models, scene: this };
    for (const id of Object.keys(BUILDERS)) {
      const g = new THREE.Group();
      g.name = `Item_${id}`;
      const L = LAYOUT[id];
      g.position.set(L.pos[0], 0, L.pos[1]);
      g.rotation.y = L.rot;
      scene.add(g);
      const info = BUILDERS[id](g, ctx);
      g.updateMatrixWorld(true);
      const focus = g.localToWorld(info.focus.clone());
      const view = info.view.clone().applyQuaternion(g.quaternion);
      let colliders = [];
      if (info.solid) {
        const b = new THREE.Box3().setFromObject(g);
        colliders = [[b.min.x, b.min.z, b.max.x, b.max.z]];
      } else if (info.colliders) {
        colliders = info.colliders.map(([x0, z0, x1, z1]) => {
          const a = g.localToWorld(V(x0, 0, z0)), c = g.localToWorld(V(x1, 0, z1));
          return [Math.min(a.x, c.x), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.z, c.z)];
        });
      }
      g.visible = false;
      this.items[id] = { id, group: g, ...info, focus, view, colliders };
    }
    this._buildPeople(models);
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
    for (let x = x0 + 1; x < x1; x += 2) box(this.ceiling, 0.16, D, 0.14, M('woodDark'), x, 0, 0.07); // beams

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

    const door = (parent, x, glowStrip) => {
      box(parent, 1.12, 2.22, 0.06, M('woodDark'), x, 1.11, 0.08);
      box(parent, 0.98, 2.1, 0.06, M('wood'), x, 1.05, 0.11);
      for (const y of [0.55, 1.5]) box(parent, 0.7, 0.6, 0.02, M('woodMid'), x, y, 0.15);
      cyl(parent, 0.03, 0.03, 0.05, M('gold'), x + 0.38, 1.0, 0.16, 6).rotation.x = Math.PI / 2;
      if (glowStrip) box(parent, 0.96, 0.02, 0.02, glow('amber', 1.4), x, 0.01, 0.16).castShadow = false;
    };
    door(this.walls.front, 0, false);
    // windows either side of the street door: night outside
    for (const x of [-2.2, 2.2]) {
      box(this.walls.front, 1.3, 1.1, 0.04, M('woodDark'), x, 1.7, 0.08);
      box(this.walls.front, 1.18, 0.98, 0.03, glow('navy', 0.35), x, 1.7, 0.1).castShadow = false;
      box(this.walls.front, 0.04, 0.98, 0.04, M('woodDark'), x, 1.7, 0.12);
    }
    door(this.walls.left, -BACK_DOOR.z, true); // the left wall's local x runs along world -z
    light(s, 'amber', 1.0, 2.4, BACK_DOOR.x + 0.4, 0.25, BACK_DOOR.z, 2);
    box(this.walls.left, 0.36, 0.1, 0.02, M('gold'), -BACK_DOOR.z, 2.32, 0.12).castShadow = false;

    // two bare bulbs are all you start with
    this.bulbs = [];
    for (const [bx, bz, shadow] of [[-2, -1.4, true], [2.4, 1.6, false]]) {
      box(s, 0.012, 0.55, 0.012, M('ink'), bx, h - 0.275, bz);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow('lampGlow', 2.5));
      bulb.position.set(bx, h - 0.6, bz);
      s.add(bulb);
      const l = light(s, 'lampGlow', 16, 13, bx, h - 0.67, bz, 1.5);
      if (shadow) {
        l.castShadow = true;
        l.shadow.mapSize.set(256, 256);
        l.shadow.bias = -0.004;
        l.shadow.camera.near = 0.1;
        l.shadow.camera.far = 11;
      }
      this.bulbs.push(l);
    }
  }

  _buildCounter() {
    const s = this.scene;
    const g = new THREE.Group();
    g.name = 'Counter';
    s.add(g);
    const cx = (COUNTER.x0 + COUNTER.x1) / 2, cw = COUNTER.x1 - COUNTER.x0, cz = COUNTER.z;
    const t = panelTexture(8, COLORS.woodDark, COLORS.ink, COLORS.wood); t.repeat.set(cw / 0.5, 2);
    box(g, cw, 1.0, 0.5, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), cx, 0.5, cz);
    box(g, cw + 0.1, 0.06, 0.66, M('wood', { roughness: 0.5 }), cx, 1.03, cz + 0.04);
    box(g, cw + 0.12, 0.02, 0.68, M('amberDark'), cx, 1.065, cz + 0.04).castShadow = false;
    box(g, 0.5, 1.06, 0.66, M('woodDark'), COUNTER.x1 - 0.05, 0.53, cz + 0.04); // end cap
    const rail = cyl(g, 0.025, 0.025, cw, M('gold', { roughness: 0.4 }), cx, 0.2, cz + 0.36, 6);
    rail.rotation.z = Math.PI / 2;
    for (let x = COUNTER.x0 + 0.4; x < COUNTER.x1; x += 0.9) cyl(g, 0.02, 0.02, 0.2, M('gold'), x, 0.1, cz + 0.33, 5);
    const glassA = makeGlass(); glassA.position.set(-3.3, COUNTER.y, cz + 0.12); g.add(glassA);
    const tray = makeAshtray(); tray.root.position.set(0.3, COUNTER.y, cz + 0.15); g.add(tray.root);
    this.counterEmber = tray.ember;
    cyl(g, 0.12, 0.12, 0.015, M('bone', { roughness: 0.4 }), -1.0, COUNTER.y + 0.005, cz + 0.05, 10); // a tray of nuts
    this.colliders.push([COUNTER.x0 - 0.05, cz - 0.3, COUNTER.x1 + 0.05, cz + 0.37]);

    // back bar against the back wall
    const bbx0 = -6.0, bbx1 = 2.2, bbx = (bbx0 + bbx1) / 2, bbw = bbx1 - bbx0, bbz = -4.77;
    const t2 = panelTexture(9, COLORS.woodMid, COLORS.ink, COLORS.woodDark); t2.repeat.set(bbw / 0.5, 2);
    box(g, bbw, 0.92, 0.44, new THREE.MeshStandardMaterial({ map: t2, roughness: 0.85 }), bbx, 0.46, bbz);
    box(g, bbw + 0.04, 0.05, 0.48, M('wood'), bbx, 0.945, bbz);
    for (let x = bbx0 + 0.9; x < 0.6; x += 0.28) {
      if (Math.abs(x - TAP.x) < 0.45) continue;
      const c = ['amber', 'sage', 'redLight', 'cream'][Math.floor(Math.abs(x * 7)) % 4];
      cyl(g, 0.03, 0.035, 0.22, M(c, { roughness: 0.3 }), x, 1.08, bbz - 0.08, 7);
    }
    box(g, 0.5, 0.3, 0.32, M('ash', { roughness: 0.5 }), bbx0 + 0.45, 1.12, bbz); // the till
    box(g, 0.42, 0.1, 0.05, M('ink'), bbx0 + 0.45, 1.2, bbz + 0.17);
    const tap = fromModel(this.models, 'BeerTap');
    if (tap) { tap.position.copy(TAP); g.add(tap); }
    else box(g, 0.5, 0.4, 0.08, M('gold'), TAP.x, TAP.y + 0.2, TAP.z);
    this.colliders.push([bbx0 - 0.05, ROOM.z0, bbx1 + 0.05, bbz + 0.25]);

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
    box(book, 0.02, 0.004, 0.12, M('gold'), 0.02, 0.052, 0.18).castShadow = false;
    const lampX = BOOK.x + 0.42, lampZ = BOOK.z - 0.05;
    cyl(g, 0.08, 0.09, 0.03, M('gold'), lampX, 0.985, lampZ, 8);
    cyl(g, 0.012, 0.012, 0.32, M('gold'), lampX, 1.15, lampZ, 5);
    const shade = box(g, 0.3, 0.07, 0.12, glow('sage', 0.25), lampX - 0.08, 1.32, lampZ);
    shade.rotation.z = 0.25;
    light(g, 'lampGlow', 1.8, 2.0, BOOK.x + 0.1, 1.3, BOOK.z + 0.05, 2);
  }

  _buildTables() {
    this.tables = [V(-4.4, 0, 0.6), V(-1.6, 0, 0.7)];
    this.tables.forEach((T, i) => {
      const g = new THREE.Group();
      g.name = `RoundTable${i}`;
      g.position.copy(T);
      this.scene.add(g);
      const wood = M('woodDark');
      cyl(g, 0.5, 0.5, 0.05, M('wood'), 0, 0.74, 0, 16);
      cyl(g, 0.06, 0.08, 0.7, wood, 0, 0.36, 0, 8);
      cyl(g, 0.3, 0.32, 0.04, wood, 0, 0.02, 0, 12);
      const gl = makeGlass(); gl.position.set(0.15, 0.765, -0.1); g.add(gl);
      if (i === 0) { const gl2 = makeGlass(); gl2.position.set(-0.2, 0.765, 0.05); g.add(gl2); }
      const cards = box(g, 0.065, 0.012, 0.09, M('cream'), 0.05, 0.775, 0.18);
      cards.rotation.y = 0.4;
      // a candle in a jar on each table: a little pool of light
      cyl(g, 0.03, 0.03, 0.06, glow('amberDark', 0.4), -0.1, 0.795, -0.15, 6);
      light(g, 'amber', 1.0, 2.2, -0.1, 0.95, -0.15, 2);
      this.colliders.push([T.x - 0.55, T.z - 0.55, T.x + 0.55, T.z + 0.55]);
    });
  }

  /**
   * Fill the room: cafe tables with chairs, booths under the windows, barrels and crates in the
   * back corner, a coat rack by the door, wall lamps, pictures, a rug and a spittoon.
   * All from bar.glb; anything missing is simply left out.
   */
  _buildDecor() {
    const s = this.scene;
    const put = (name, x, z, rotY = 0, y = 0, solid = null) => {
      const o = fromModel(this.models, name);
      if (!o) return null;
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      s.add(o);
      if (solid) this.colliders.push([x - solid, z - solid, x + solid, z + solid]);
      return o;
    };
    // cafe tables, two chairs each, a candle in a jar on top
    const cafes = [
      [-3.9, 2.7, [0.4, Math.PI + 0.4]],
      [0.4, -0.55, [Math.PI / 2, -Math.PI / 2]],
      [6.0, -0.35, [Math.PI * 0.75, -Math.PI * 0.25]],
      [-1.1, 2.75, [0, Math.PI]],
    ];
    for (const [x, z, angles] of cafes) {
      if (!put('CafeTable', x, z, 0, 0, 0.42)) continue;
      put('CandleJar', x + 0.08, z - 0.05, 0, 0.745);
      light(s, 'amber', 0.8, 1.8, x + 0.08, 0.95, z - 0.05, 2);
      for (const a of angles) {
        const cx = x + Math.sin(a) * 0.62, cz = z + Math.cos(a) * 0.62;
        put('CafeChair', cx, cz, Math.atan2(x - cx, z - cz), 0, 0.22);
      }
    }
    // booths along the street wall under the windows, a table in front of each
    for (const x of [-2.2, 1.9]) {
      if (!put('Booth', x, 4.7, Math.PI)) continue;
      this.colliders.push([x - 0.78, 4.42, x + 0.78, ROOM.z1]);
      put('BoothTable', x, 3.95, 0, 0, null);
      this.colliders.push([x - 0.62, 3.63, x + 0.62, 4.27]);
      put('CandleJar', x - 0.3, 3.95, 0, 0.755);
      const gl = makePint(this.models);
      gl.position.set(x + 0.25, 0.755, 3.9);
      gl.scale.setScalar(0.85);
      s.add(gl);
    }
    // the back corner: barrels and crates
    put('Barrel', 2.95, -4.5, 0, 0, 0.3);
    put('Barrel', 3.55, -4.55, 0.6, 0, 0.3);
    put('Barrel', 3.25, -4.5, 1.1, 0.64);
    put('Crate', 4.3, -4.55, 0.1, 0, 0.3);
    put('Crate', 4.3, -4.55, -0.15, 0.38);
    put('Crate', 4.35, -3.95, 0.5, 0, 0.28);
    put('CoatRack', -6.55, 4.55, 0.6, 0, 0.22);
    put('Spittoon', 1.95, -2.15, 0, 0, 0.14);
    // a rug in the middle of the floor, under the cafe table
    put('Rug', 0.4, -0.55, 0, 0.002);
    // wall lamps, each a real little light
    for (const [x, z, rot] of [[-6.97, -3.4, Math.PI / 2], [-6.97, 2.3, Math.PI / 2], [6.97, -0.9, -Math.PI / 2], [-5.6, 4.97, Math.PI]]) {
      if (!put('Sconce', x, z, rot, 2.05)) continue;
      const out = V(Math.sin(rot), 0, Math.cos(rot));
      light(s, 'lampGlow', 1.3, 3.6, x + out.x * 0.25, 2.1, z + out.z * 0.25, 1.8);
    }
    // pictures on the walls
    put('Frame_A', -6.97, -0.1, Math.PI / 2, 1.75);
    put('Frame_B', 6.97, 4.25, -Math.PI / 2, 1.8);
    put('Frame_C', -4.9, 4.97, Math.PI, 1.85);
  }

  _buildPeople(models) {
    const s = this.scene;
    this.bartender = new Bartender(this, models, this.smoke);
    this.dynamic.push({ pos: this.bartender.root.position, r: 0.3 });

    // regulars from the back room, off duty, at the round tables
    const seats = [
      { model: 'enforcer', id: 'enforcer', t: 0, a: Math.PI * 0.75 },
      { model: 'shark', id: 'shark', t: 0, a: -Math.PI * 0.6 },
      { model: 'boss', id: 'boss', t: 1, a: Math.PI * 0.1 },
    ];
    for (const st of seats) {
      const T = this.tables[st.t];
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
      this.seated.push(new Character(body, 0, { smoke: this.smoke, id: st.id }));
    }

    // people standing around: one at the bar always, the others come with what you buy
    const add = (name, fallback, x, z, rotY, holds, needs) => {
      const root = fromModel(models, name) ?? makePatron(fallback);
      root.name = name;
      root.position.set(x, 0, z);
      root.rotation.y = rotY;
      s.add(root);
      const r = new Regular(root, { holds, models, smoke: this.smoke });
      r.needs = needs;
      r.box = [x - 0.25, z - 0.25, x + 0.25, z + 0.25];
      r.name = name;
      this.regulars.push(r);
    };
    add('PatronA', { coat: 'navyLight' }, -4.75, -1.98, Math.PI, 'pint', null);
    add('PatronB', { coat: 'leather', hat: 'woodDark' }, 5.45, -2.45, Math.PI / 2, 'pint', 'dartboard');
    add('PatronC', { coat: 'redMid', hat: 'ink' }, 2.85, 3.25, Math.atan2(1.4 - 2.85, 2.4 - 3.25), 'cue', 'pool');
    add('Bookie', { coat: 'feltMid', hat: 'ink' }, HORSE_TABLE.pos.x, HORSE_TABLE.pos.z - 0.85, 0, 'pint', 'horses');
  }

  /** Show what you own. */
  setOwned(ids) {
    this.owned = new Set(ids);
    for (const it of Object.values(this.items)) it.group.visible = this.owned.has(it.id);
    for (const r of this.regulars) r.root.visible = !r.needs || this.owned.has(r.needs);
    this.preview = null;
    if (this.previewBox) this.previewBox.visible = false;
    if (this.previewLight) this.previewLight.intensity = 0;
  }

  /** Everything you can't walk through right now (furniture, owned items, people). */
  solidBoxes() {
    const out = this.colliders.slice();
    for (const it of Object.values(this.items)) if (this.owned?.has(it.id)) out.push(...it.colliders);
    for (const r of this.regulars) if (r.root.visible) out.push(r.box);
    return out;
  }

  /** Show one item (bought or not) as a preview in the catalog; null for none. */
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
      this.previewLight = new THREE.PointLight(col('lampGlow'), 0, 4, 2);
      this.previewLight.name = 'PreviewLight';
      this.scene.add(this.previewLight);
    }
    this.previewBox.visible = false;
    this.previewLight.intensity = 0;
    if (!it) return;
    it.group.visible = true;
    // a little light from where you're looking, so things in dark corners still read
    this.previewLight.position.copy(it.view).normalize().multiplyScalar(Math.min(1.2, it.dist * 0.5)).add(it.focus);
    this.previewLight.intensity = 2.6;
    if (this.owned.has(it.id)) return;
    // a gold wire box around a thing you don't own yet: "this is what it would look like"
    const b = new THREE.Box3().setFromObject(it.group);
    b.getCenter(this.previewBox.position);
    b.getSize(this.previewBox.scale).addScalar(0.06);
    this.previewBox.visible = true;
  }

  update(dt, player) {
    this.time += dt;
    const t = this.time;
    const eye = player?.eye ?? null;
    for (const it of Object.values(this.items)) if (it.group.visible) it.update?.(dt, t);
    if (this.previewBox?.visible) this.previewBox.material.color.set(Math.sin(t * 6) > -0.3 ? COLORS.gold : COLORS.amberDark);
    this.bulbs[0].intensity = 16 + Math.sin(t * 17) * 0.2 + (Math.random() < 0.004 ? -8 : 0);
    this.counterEmber?.update(dt);
    this.bartender.update(dt, t, player);
    for (const c of this.seated) {
      c.lookAt(eye && eye.distanceTo(c.root.position) < 3.2 ? eye : null);
      c.update(dt, t);
    }
    for (const r of this.regulars) if (r.root.visible) r.update(dt, t, eye);
    this.smoke.update(dt);
  }

  /** World positions of everyone's heads (for speech bubbles). */
  heads() {
    const out = [];
    const add = (who, head) => { if (head) out.push({ who, pos: head.getWorldPosition(new THREE.Vector3()) }); };
    add('bartender', this.bartender.head);
    this.seated.forEach((c, i) => add(`seat${i}`, c.head));
    for (const r of this.regulars) if (r.root.visible) add(r.name, r.ch.head);
    return out;
  }
}
