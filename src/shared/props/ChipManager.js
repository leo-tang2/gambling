import * as THREE from 'three';
import { DENOMS, stackBreakdown, takeExact, sumValue, greedyBreakdown } from './chipMath.js';
import { ease } from '../anim/Tweens.js';
import { sound } from '../audio/Sound.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * Every chip on the table is a real object with a value, drawn through one InstancedMesh per
 * denomination. Stacks and the pot are collections of those chips, so what you see always adds
 * up to the real amounts.
 */
export class ChipManager {
  constructor({ scene, templates, tweens, chipHeight = 0.0048, chipRadius = 0.027, capacity = 900 }) {
    this.tweens = tweens;
    this.h = chipHeight;
    this.r = chipRadius;
    this.chips = new Set();
    this.meshes = {};
    for (const d of DENOMS) {
      const t = templates[d];
      const mesh = new THREE.InstancedMesh(t.geometry, t.material, capacity);
      mesh.name = `Chips_${d}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      this.meshes[d] = mesh;
    }
    this.rng = Math.random;
  }

  make(value, pos) {
    const c = { value, pos: pos.clone(), quat: new THREE.Quaternion(), lift: 0 };
    this.chips.add(c);
    return c;
  }

  remove(c) { this.chips.delete(c); }

  update() {
    const counts = Object.fromEntries(DENOMS.map((d) => [d, 0]));
    for (const c of this.chips) {
      const mesh = this.meshes[c.value];
      const i = counts[c.value]++;
      if (i >= mesh.instanceMatrix.count) continue;
      const p = c.lift ? c.pos.clone().add(new THREE.Vector3(0, c.lift, 0)) : c.pos;
      tmpM.compose(p, c.quat, ONE);
      mesh.setMatrixAt(i, tmpM);
    }
    for (const d of DENOMS) {
      this.meshes[d].count = counts[d];
      this.meshes[d].instanceMatrix.needsUpdate = true;
    }
  }

  /** Fly chips along arcs to their targets with a tumble; returns when all have landed. */
  async throwChips(chips, targets, { stagger = 0.045, height = 0.16, duration = 0.5 } = {}) {
    const jobs = chips.map((c, i) => {
      const from = c.pos.clone();
      const to = targets[i].pos;
      const endQuat = targets[i].quat;
      const axis = new THREE.Vector3(this.rng() - 0.5, 0, this.rng() - 0.5).normalize();
      const spins = 1 + Math.floor(this.rng() * 3);
      const startQuat = c.quat.clone();
      const h = height * (0.8 + this.rng() * 0.4);
      const tumble = new THREE.Quaternion();
      return this.tweens.add({
        delay: i * stagger,
        duration: duration * (0.85 + this.rng() * 0.3),
        easing: ease.linear,
        update: (t) => {
          c.pos.lerpVectors(from, to, t);
          c.pos.y += Math.sin(Math.PI * t) * h;
          tumble.setFromAxisAngle(axis, t * spins * Math.PI * 2);
          c.quat.copy(startQuat).slerp(endQuat, t).premultiply(tumble);
          if (t >= 1) {
            c.pos.copy(to);
            c.quat.copy(endQuat);
            if (i % 3 === 0) sound.play('chipThrow');
          }
        },
      });
    });
    await Promise.all(jobs);
  }

  /** Slide chips flat across the felt to their targets. */
  async slideChips(chips, targets, { stagger = 0.012, duration = 0.55 } = {}) {
    sound.play('potSlide');
    await Promise.all(chips.map((c, i) => {
      const from = c.pos.clone();
      const to = targets[i].pos;
      const q0 = c.quat.clone();
      return this.tweens.add({
        delay: i * stagger,
        duration,
        easing: ease.inOutQuad,
        update: (t) => {
          c.pos.lerpVectors(from, to, t);
          c.pos.y = Math.max(from.y, to.y) + Math.sin(Math.PI * t) * 0.01;
          if (t >= 1) c.pos.copy(to);
          c.quat.copy(q0).slerp(targets[i].quat, t);
        },
      });
    }));
  }
}

/** A player's stack: neat columns of chips at a spot on the felt. */
export class ChipStack {
  constructor(manager, { origin, right, tableY, name }) {
    this.m = manager;
    this.origin = new THREE.Vector3(origin.x, tableY, origin.z);
    this.right = new THREE.Vector3(right.x, 0, right.z).normalize();
    this.forward = new THREE.Vector3().crossVectors(UP, this.right).normalize(); // toward the table centre... or away
    this.tableY = tableY;
    this.name = name;
    this.chips = [];
    this.columns = []; // [{x, z, top, value}] for picking
  }

  get value() { return sumValue(this.chips); }

  /** Replace all chips with a fresh breakdown of `amount` (instant). */
  setValue(amount) {
    for (const c of this.chips) this.m.remove(c);
    this.chips = stackBreakdown(amount).map((v) => this.m.make(v, this.origin));
    this.layout(true);
  }

  /** Column layout: one or more columns per denomination, max 10 chips each. */
  targets() {
    const sorted = [...this.chips].sort((a, b) => b.value - a.value);
    const out = new Map();
    const cols = [];
    let col = null;
    for (const c of sorted) {
      if (!col || col.value !== c.value || col.n >= 10) {
        col = { value: c.value, n: 0, index: cols.length };
        cols.push(col);
      }
      out.set(c, { col: col.index, level: col.n++ });
    }
    const gap = this.m.r * 2.15;
    const width = (cols.length - 1) * gap;
    this.columns = cols.map((cc, i) => {
      const offset = i * gap - width / 2;
      // stagger alternate columns slightly forward so the stack reads as a cluster
      const depth = (i % 2) * this.m.r * 0.9;
      const p = this.origin.clone().addScaledVector(this.right, offset).addScaledVector(this.forward, depth);
      return { x: p.x, z: p.z, value: cc.value, top: this.tableY + cc.n * this.m.h, n: cc.n };
    });
    const res = new Map();
    for (const [c, { col: ci, level }] of out) {
      const cp = this.columns[ci];
      const yaw = ((level * 37 + ci * 11) % 17) / 17 * Math.PI;
      res.set(c, {
        pos: new THREE.Vector3(cp.x, this.tableY + level * this.m.h + 0.0004, cp.z),
        quat: new THREE.Quaternion().setFromAxisAngle(UP, yaw),
      });
    }
    return res;
  }

  async layout(instant = false) {
    if (this.chips.length > 45) this._colourUp();
    const t = this.targets();
    if (instant) {
      for (const [c, tr] of t) { c.pos.copy(tr.pos); c.quat.copy(tr.quat); }
      return;
    }
    const chips = [...t.keys()];
    await this.m.slideChips(chips, chips.map((c) => t.get(c)), { stagger: 0.004, duration: 0.25 });
  }

  /** Trade a messy pile of small chips for bigger ones (like a dealer colouring up). */
  _colourUp() {
    const v = this.value;
    for (const c of this.chips) this.m.remove(c);
    this.chips = stackBreakdown(v).map((val) => this.m.make(val, this.origin));
  }

  /** Remove chips worth exactly `amount` (breaking bigger chips for change) and return them. */
  take(amount) {
    const { taken, remaining } = takeExact(this.chips, amount, {
      make: (v, from) => this.m.make(v, from.pos),
      destroy: (c) => this.m.remove(c),
    });
    this.chips = remaining;
    return taken;
  }

  add(chips) {
    this.chips.push(...chips);
  }
}

/** The pot: a scattered pile of real chips around a spot in the middle of the table. */
export class PotPile {
  constructor(manager, { center, tableY, radius = 0.11 }) {
    this.m = manager;
    this.center = new THREE.Vector3(center.x, tableY, center.z);
    this.tableY = tableY;
    this.radius = radius;
    this.chips = [];
    this.heights = new Map(); // grid cell -> chip count, so landed chips pile up
  }

  get value() { return sumValue(this.chips); }

  _cell(x, z) { return `${Math.round(x / 0.03)},${Math.round(z / 0.03)}`; }

  /** A landing spot with a little random scatter. */
  landing() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.radius;
    const x = this.center.x + Math.cos(a) * r;
    const z = this.center.z + Math.sin(a) * r * 0.8;
    const key = this._cell(x, z);
    const n = this.heights.get(key) ?? 0;
    this.heights.set(key, n + 1);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.12, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12));
    return { pos: new THREE.Vector3(x, this.tableY + n * this.m.h + 0.0005, z), quat: tilt };
  }

  async receive(chips) {
    const targets = chips.map(() => this.landing());
    this.chips.push(...chips);
    await this.m.throwChips(chips, targets);
  }

  /** Remove chips worth exactly `amount` (breaking chips in the pile for change). */
  take(amount) {
    const { taken, remaining } = takeExact(this.chips, amount, {
      make: (v, from) => {
        const c = this.m.make(v, from.pos);
        c.quat.copy(from.quat);
        return c;
      },
      destroy: (c) => this.m.remove(c),
    });
    this.chips = remaining;
    if (!this.chips.length) this.heights.clear();
    return taken;
  }

  clear() {
    for (const c of this.chips) this.m.remove(c);
    this.chips = [];
    this.heights.clear();
  }
}

export { greedyBreakdown, stackBreakdown };
