import * as THREE from 'three';
import { sound } from '../shared/audio/Sound.js';
import { COLORS } from '../shared/render/palette.js';

// The shooting gallery in your bar: tin ducks ride two rails, cans stand on a shelf, and you
// have the same revolver as the back room, six shots to a cylinder, 30 seconds a round.
// Coordinates are the booth's own (from bar.glb): the counter is at z = 0, targets behind it.

export const ROUND_TIME = 30;
export const SHOTS = 6;
const RELOAD_TIME = 1.2;
const RAILS = [
  { z: -1.55, y: 1.437, dir: 1, speed: 0.42, count: 5 },
  { z: -1.15, y: 1.137, dir: -1, speed: 0.62, count: 4 },
];
const SHELF = { z: -1.75, y: 1.772, xs: [-0.8, -0.4, 0, 0.4, 0.8] };
const SPAN = 1.15; // ducks ride from -SPAN to SPAN

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** The duck's texture is a silhouette: drop the transparent pixels around it. */
function cutOut(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.alphaTest = 0.5;
    o.material.transparent = false;
    o.material.side = THREE.DoubleSide;
  });
}

function fallbackDuck() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.012), new THREE.MeshStandardMaterial({ color: COLORS.gold }));
  m.position.y = 0.1;
  g.add(m);
  return g;
}
function fallbackCan() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 10), new THREE.MeshStandardMaterial({ color: COLORS.redLight }));
  m.position.y = 0.055;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export class ShootingGallery {
  constructor({ group, models, camera }) {
    this.group = group;
    this.camera = camera;
    this.targets = [];
    const take = (name, fb) => {
      const src = models.bar?.getObjectByName(name);
      const o = src ? src.clone(true) : fb();
      o.position.set(0, 0, 0);
      return o;
    };
    for (const r of RAILS) {
      for (let i = 0; i < r.count; i++) {
        const obj = take('Duck', fallbackDuck);
        cutOut(obj);
        group.add(obj);
        this.targets.push({ kind: 'duck', obj, rail: r, x: -SPAN + (i / r.count) * SPAN * 2, alive: true, down: 0, back: 0 });
      }
    }
    for (const x of SHELF.xs) {
      const obj = take('Can', fallbackCan);
      group.add(obj);
      this.targets.push({ kind: 'can', obj, home: V(x, SHELF.y, SHELF.z), alive: true, vel: null, back: 0 });
    }
    // the revolver and the hand that holds it ride with the camera
    const fp = models.firstperson;
    const part = (name) => {
      const src = fp?.getObjectByName(name);
      const o = src ? src.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a3740 }));
      o.position.set(0, 0, 0);
      return o;
    };
    this.gun = new THREE.Group();
    this.gun.name = 'GalleryGun';
    this.gun.add(part('Revolver'), part('HandGrip'));
    this.gun.visible = false;
    camera.add(this.gun);
    this.flash = new THREE.PointLight(0xffd08a, 0, 3, 2);
    this.flash.position.set(0, 0.06, 0.3);
    this.gun.add(this.flash);
    this.flashMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: COLORS.lampGlow }));
    this.flashMesh.position.set(0, 0.055, 0.25);
    this.flashMesh.visible = false;
    this.gun.add(this.flashMesh);
    this.ray = new THREE.Raycaster();
    this.state = 'idle'; // idle | play | over
    this.score = 0;
    this.time = 0;
    this.ammo = SHOTS;
    this.reload = 0;
    this.kick = 0;
    this.flashT = 0;
    this.aim = new THREE.Vector2(0, 0);
    this._place(0);
  }

  /** Where you stand and look while playing, in world space. */
  standPose(pos, target) {
    pos.copy(this.group.localToWorld(V(0, 1.58, 0.85)));
    target.copy(this.group.localToWorld(V(0, 1.38, -1.4)));
  }

  start() {
    this.state = 'play';
    this.score = 0;
    this.time = ROUND_TIME;
    this.ammo = SHOTS;
    this.reload = 0;
    for (const t of this.targets) { t.alive = true; t.down = 0; t.back = 0; t.vel = null; }
    this.gun.visible = true;
  }

  stop() {
    this.state = 'idle';
    this.gun.visible = false;
    this.flash.intensity = 0;
    this.flashMesh.visible = false;
  }

  startReload() {
    if (this.state !== 'play' || this.reload > 0 || this.ammo === SHOTS) return;
    this.reload = RELOAD_TIME;
    sound.play('cylinderSpin');
  }

  /** Fire at screen point ndc (-1..1). Returns true on a hit. */
  shoot(ndc) {
    if (this.state !== 'play' || this.reload > 0) return false;
    if (this.ammo <= 0) { sound.play('dryFire'); this.startReload(); return false; }
    this.ammo--;
    this.kick = 1;
    this.flashT = 0.06;
    sound.play('gunshot');
    this.ray.setFromCamera(ndc, this.camera);
    let best = null;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const hit = this.ray.intersectObject(t.obj, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { t, d: hit.distance };
    }
    if (best) {
      const t = best.t;
      t.alive = false;
      t.down = 0;
      t.back = t.kind === 'duck' ? 1.6 : 2.6;
      if (t.kind === 'can') t.vel = V((Math.random() - 0.5) * 0.8, 1.6, -0.9);
      this.score++;
      sound.play('knock');
    }
    if (this.ammo === 0) this.startReload();
    return !!best;
  }

  _place(dt) {
    for (const t of this.targets) {
      if (t.kind === 'duck') {
        const r = t.rail;
        t.x += r.dir * r.speed * dt;
        if (t.x > SPAN) t.x -= SPAN * 2;
        if (t.x < -SPAN) t.x += SPAN * 2;
        t.obj.position.set(t.x, r.y, r.z);
        // shot ducks tip over backwards, then pop back up
        t.down += ((t.alive ? 0 : 1) - t.down) * Math.min(1, dt * 14);
        t.obj.rotation.x = -t.down * Math.PI * 0.5;
      } else if (t.alive || !t.vel) {
        t.obj.position.copy(t.home);
        t.obj.rotation.set(0, 0, 0);
      } else {
        t.vel.y -= 6 * dt;
        t.obj.position.addScaledVector(t.vel, dt);
        t.obj.rotation.x += dt * 9;
        if (t.obj.position.y < 0.2) { t.vel.set(0, 0, 0); t.obj.visible = false; }
      }
    }
  }

  update(dt, ndc) {
    this.aim.copy(ndc);
    if (this.state === 'play') {
      this.time -= dt;
      if (this.time <= 0) { this.time = 0; this.state = 'over'; this.gun.visible = false; }
    }
    for (const t of this.targets) {
      if (!t.alive && (t.back -= dt) <= 0) { t.alive = true; t.vel = null; t.obj.visible = true; }
    }
    this._place(dt);
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) { this.reload = 0; this.ammo = SHOTS; }
    }
    // the gun follows your aim, kicks when it fires and tips up while you reload
    if (this.gun.visible) {
      this.kick *= Math.exp(-12 * dt);
      const r = this.reload > 0 ? Math.sin((1 - this.reload / RELOAD_TIME) * Math.PI) : 0;
      this.gun.position.set(0.17 + ndc.x * 0.07, -0.19 + ndc.y * 0.06 - r * 0.06, -0.4 + this.kick * 0.05);
      this.ray.setFromCamera(ndc, this.camera);
      const aimAt = this.ray.ray.at(9, new THREE.Vector3()); // far: the gun lies along your view, side on
      this.gun.lookAt(aimAt);
      this.gun.rotateX(-this.kick * 0.35 - r * 0.9);
      this.gun.rotateZ(r * 0.6);
    }
    this.flashT -= dt;
    this.flash.intensity = this.flashT > 0 ? 3 : 0;
    this.flashMesh.visible = this.flashT > 0;
  }
}
