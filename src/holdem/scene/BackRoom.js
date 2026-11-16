import * as THREE from 'three';
import { buildGrayBox, buildGrayLampVisuals } from './GrayBox.js';
import { Lamp } from './Lamp.js';
import { SEAT_ANGLES, SEAT_RADIUS, polar, seatSpots, DECK_SPOT, TABLE_HEIGHT } from './layout.js';
import { ease } from '../../shared/anim/Tweens.js';
import { Smoke, Ember, addCigarette } from './Extras.js';

// opponents sit a little further back from the light than the chairs' original spot
const SIT_BACK = 0.14;

/** Where each mouth holds its smoke (head-local; +z is the face). Don Sal smokes his cigar. */
const SMOKES = {
  boss: { cigar: true, tip: [0.135, 0.045, 0.2] },
  enforcer: { at: [0.03, 0.03, 0.105], yaw: 0.45 },
  shark: { at: [-0.03, 0.03, 0.1], yaw: -0.4 },
};

/** A seated opponent: body + head node with breathing, look-at, and idle habits in the dark. */
class Character {
  constructor(root, seat, { smoke, id }) {
    this.root = root;
    this.seat = seat;
    this.smoke = smoke;
    this.head = root.getObjectByName('Head');
    if (this.head) this.head.rotation.order = 'YXZ';
    this.headRest = this.head ? this.head.rotation.clone() : null;
    this.baseY = root.position.y;
    this.baseRotY = root.rotation.y;
    this.phase = Math.random() * 10;
    this.lookTarget = null;
    this.yaw = 0;
    this.pitch = 0;
    this.nod = 0;
    this.gone = false;
    // idle habits
    this.idle = null; // { kind, t, dur, ... }
    this.nextIdle = 2 + Math.random() * 6;
    this.idleYaw = 0;
    this.idlePitch = 0;
    this.lean = 0;
    this.wisp = Math.random();
    const s = SMOKES[id];
    if (this.head && s) {
      if (s.cigar) {
        this.ember = new Ember(this.head,new THREE.Vector3(...s.tip), { radius: 0.55 });
      } else {
        this.ember = addCigarette(this.head, { at: s.at, yaw: s.yaw });
      }
    }
  }

  lookAt(worldPoint) { this.lookTarget = worldPoint?.clone() ?? null; }

  /** Start an idle habit now (also used by tests): 'smoke' | 'glance' | 'shift'. */
  startIdle(kind) {
    if (this.gone) return;
    if (kind === 'smoke' && this.ember) this.idle = { kind, t: 0, dur: 3.4, puffed: false };
    else if (kind === 'glance') this.idle = { kind, t: 0, dur: 2.2, dir: Math.random() < 0.5 ? -1 : 1 };
    else this.idle = { kind: 'shift', t: 0, dur: 1.8, dir: Math.random() < 0.5 ? -1 : 1 };
  }

  _updateIdle(dt) {
    if (!this.idle) {
      this.nextIdle -= dt;
      if (this.nextIdle <= 0) {
        const r = Math.random();
        this.startIdle(r < 0.6 ? 'smoke' : r < 0.85 ? 'glance' : 'shift');
        this.nextIdle = 5 + Math.random() * 9;
      }
    }
    let gy = 0, gp = 0, lean = 0, glow = 0;
    const it = this.idle;
    if (it) {
      it.t += dt;
      const t = it.t;
      if (it.kind === 'smoke') {
        // drag: tip flares and lights the face, chin lifts; then a slow exhale
        if (t < 1.2) { glow = Math.min(1, t / 0.5); gp = -0.12 * Math.min(1, t / 0.8); }
        else if (t < 1.6) { glow = 1 - (t - 1.2) / 0.4; gp = -0.12; }
        else { gp = -0.12 * Math.max(0, 1 - (t - 1.6) / 1.2); }
        if (t >= 1.7 && !it.puffed && this.head) {
          it.puffed = true;
          const mouth = this.head.localToWorld(new THREE.Vector3(0, 0.03, 0.13));
          const fwd = this.head.localToWorld(new THREE.Vector3(0, 0.06, 1)).sub(this.head.getWorldPosition(new THREE.Vector3())).normalize();
          this.smoke.puff(mouth, { dir: fwd.multiplyScalar(0.16).add(new THREE.Vector3(0, 0.04, 0)), count: 7, size: 0.05, grow: 0.32, life: 3.2, opacity: 0.22, spread: 0.06 });
        }
      } else if (it.kind === 'glance') {
        const k = Math.sin(Math.min(1, t / it.dur) * Math.PI);
        gy = it.dir * 0.55 * Math.min(1, k * 1.6);
        gp = 0.08 * k;
      } else {
        lean = Math.sin(Math.min(1, t / it.dur) * Math.PI) * it.dir;
      }
      if (t >= it.dur) this.idle = null;
    }
    const k = 1 - Math.exp(-5 * dt);
    this.idleYaw += (gy - this.idleYaw) * k;
    this.idlePitch += (gp - this.idlePitch) * k;
    this.lean += (lean - this.lean) * k;
    if (this.ember) {
      this.ember.glow = glow;
      this.ember.update(dt);
      // a thin wisp curls off the tip now and then
      this.wisp -= dt;
      if (this.wisp <= 0) {
        this.wisp = 0.5 + Math.random() * 0.6;
        this.smoke.puff(this.ember.worldPos(), { count: 1, size: 0.012, grow: 0.05, life: 2.4, opacity: 0.12, dir: new THREE.Vector3(0, 0.06, 0) });
      }
    }
  }

  update(dt, t) {
    if (this.gone) return;
    this._updateIdle(dt);
    this.root.position.y = this.baseY + Math.sin(t * 1.6 + this.phase) * 0.004;
    this.root.rotation.y = this.baseRotY + this.lean * 0.06;
    this.root.rotation.z = this.lean * 0.025;
    if (!this.head) return;
    let ty = 0, tp = 0;
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      const hp = this.head.position;
      const dx = local.x - hp.x, dy = local.y - hp.y, dz = local.z - hp.z;
      ty = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.9, 0.9);
      tp = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.5);
    }
    const k = 1 - Math.exp(-4 * dt);
    this.yaw += (ty - this.yaw) * k;
    this.pitch += (tp - this.pitch) * k;
    this.nod *= Math.exp(-6 * dt);
    this.head.rotation.set(
      this.headRest.x + this.pitch + this.idlePitch + Math.sin(this.nod * 20) * this.nod * 0.3,
      this.headRest.y + this.yaw + this.idleYaw,
      this.headRest.z,
    );
  }

  /** Little nod (used for checks and calls). */
  knock() { this.nod = 0.6; }
}

/**
 * Builds the back room around the table from the Blender models (falling back to gray-box
 * primitives for anything that fails to load).
 */
export class BackRoom {
  constructor({ scene, models, tweens, cast }) {
    this.scene = scene;
    this.tweens = tweens;
    this.characters = [];
    this.root = new THREE.Group();
    this.root.name = 'BackRoom';
    scene.add(this.root);

    const haveAll = models.room && models.table && models.chair;
    if (!haveAll) this.root.add(buildGrayBox());
    if (models.room) { models.room.name = 'Room'; this.root.add(models.room); }
    if (models.table) { models.table.name = 'Table'; this.root.add(models.table); }
    this.smoke = new Smoke(scene);

    SEAT_ANGLES.forEach((a, seat) => {
      const back = seat === 0 ? 0 : SIT_BACK;
      const p = polar(a, SEAT_RADIUS + 0.06 + back, 0);
      if (models.chair) {
        const chair = models.chair.clone(true);
        chair.name = `Chair${seat}`;
        chair.position.set(p.x, 0, p.z);
        chair.rotation.y = a + Math.PI;
        this.root.add(chair);
      }
      const member = cast[seat];
      if (seat === 0 || !member) return;
      const model = models[member.model];
      if (!model) return;
      const body = model.clone(true);
      body.name = `Opponent_${member.id}`;
      body.position.set(p.x, 0, p.z);
      body.rotation.y = a + Math.PI;
      // keep them in the shadows: darker cloth and skin, only the lamp's edge reaches them
      body.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color.multiplyScalar(0.38);
        }
      });
      this.root.add(body);
      this.characters[seat] = new Character(body, seat, { smoke: this.smoke, id: member.id });
    });

    // the lamp
    this.lamp = new Lamp();
    if (models.lamp) {
      const vis = models.lamp;
      let bulbMat = null;
      vis.traverse((o) => {
        if (o.isMesh && o.name.startsWith('Bulb')) {
          bulbMat = o.material;
          bulbMat.emissive = new THREE.Color(0xffd08a);
          bulbMat.emissiveIntensity = 2.5;
          o.castShadow = false;
          o.receiveShadow = false;
        }
        if (o.isMesh && o.name.startsWith('LampBody')) o.castShadow = false; // the spot sits inside it
      });
      this.lamp.attachVisuals(vis, bulbMat);
    } else {
      const g = buildGrayLampVisuals();
      this.lamp.attachVisuals(g.group, g.bulbMat);
    }
    this.scene.add(this.lamp.pivot);
    // tighter cone: the felt stays bright, the faces around it fall into the dark
    this.lamp.spot.angle = 0.93;
    this.lamp.spot.penumbra = 0.4;
    this.lamp.fill.intensity = this.lamp.baseFill = 0.55;

    // a faint cone of light under the lamp, like smoke catching the beam
    const hazeH = 1.9;
    const haze = new THREE.Mesh(
      new THREE.ConeGeometry(1.05, hazeH, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc58a, transparent: true, opacity: 0.014, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    haze.name = 'LightHaze';
    haze.position.y = -0.08 - hazeH / 2;
    this.lamp.head.add(haze);

    // glowing strip under the door
    this.root.traverse((o) => {
      if (o.isMesh && o.name.startsWith('DoorGlow')) {
        o.material.emissive = new THREE.Color(0xffc27a);
        o.material.emissiveIntensity = 0.6;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });

    this.time = 0;
  }

  /** A face-down deck sitting by the dealer spot. */
  addDeck(cardTemplate) {
    const deck = cardTemplate.clone(true);
    deck.name = 'Deck';
    deck.position.set(DECK_SPOT.x, TABLE_HEIGHT + 0.012, DECK_SPOT.z);
    deck.rotation.set(0, 0.4, Math.PI);
    deck.scale.set(1, 20, 1);
    this.scene.add(deck);
    this.deck = deck;
  }

  headPosition(seat) {
    const c = this.characters[seat];
    if (c?.head) return c.head.getWorldPosition(new THREE.Vector3());
    return new THREE.Vector3().copy(seatSpots(seat).face);
  }

  update(dt) {
    this.time += dt;
    this.lamp.update(dt);
    for (const c of this.characters) c?.update(dt, this.time);
    this.smoke.update(dt);
  }

  /** An eliminated player pushes back from the table and disappears into the dark. */
  async leave(seat) {
    const c = this.characters[seat];
    if (!c || c.gone) return;
    const a = SEAT_ANGLES[seat];
    const from = c.root.position.clone();
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.9);
    c.lookAt(null);
    await this.tweens.add({
      duration: 1.4, easing: ease.inOutQuad,
      update: (t) => {
        c.root.position.copy(from).addScaledVector(out, t);
        c.root.position.y = from.y + Math.sin(Math.min(1, t * 2) * Math.PI / 2) * 0.25;
      },
    });
    c.gone = true;
    c.root.visible = false;
  }

  /** Bring everyone back (restart). */
  reset() {
    SEAT_ANGLES.forEach((a, seat) => {
      const c = this.characters[seat];
      if (!c) return;
      const p = polar(a, SEAT_RADIUS + 0.06 + SIT_BACK, 0);
      c.root.position.set(p.x, 0, p.z);
      c.baseY = 0;
      c.idle = null;
      c.root.visible = true;
      c.gone = false;
    });
  }
}
