import * as THREE from 'three';
import { COLORS } from '../shared/render/palette.js';
import { wrapText } from '../shared/ui/font.js';
import { sound } from '../shared/audio/Sound.js';
import { BAR_ITEMS } from '../holdem/game/meta.js';
import { BarScene, ROOM, EYE, START, BOOK, BACK_DOOR, HORSE_TABLE, TRACK } from './BarScene.js';
import { HORSES, runRace, leader, settleBet, parseBet } from './horseRace.js';
import { ShootingGallery, SHOTS } from './ShootingGallery.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RADIUS = 0.22; // you, for bumping into things
const WALK = 2.6; // m/s
const BOOK_W = 196; // width of the open catalog on screen
const HORSE_NAME = COLORS.amber; // the horses' names are always orange
/** The bar's 3D scene is drawn with pixels this many times bigger than the UI's. */
export const BAR_PIXEL_SIZE = 2;

/** One line about each thing, shown while you look at it in the catalog. */
const BLURBS = {
  stools: 'Red leather, chrome. Somewhere for the regulars to sit.',
  plant: 'A palm in the corner. Makes the place look legitimate.',
  dartboard: 'For the quiet nights. Brings in a darts player.',
  lights: 'Three green lamps over the counter.',
  shelf: 'A full back bar. Bottles catch the light.',
  fan: 'Pushes the cigar smoke around.',
  neon: 'BAR, in red. Flickers when it rains.',
  portrait: 'Don Sal, in oils. The family will hear about it.',
  jukebox: 'Every record the regulars ask for.',
  horses: 'Tin horses on a crank. Lou takes bets: win and it pays double.',
  piano: 'Nobody here can play it. Yet.',
  gallery: 'Tin ducks and cans. Six shots, thirty seconds.',
  pool: 'Green felt, a full rack, a cue.',
  aquarium: 'Five goldfish who have seen too much.',
  chandelier: 'Gold and candlelight. The whole room glows.',
};

const LINES = {
  bartender: ['Evening, boss.', 'Back from the table? The catalog is on the back bar.', 'Quiet night. Have a look in the book.'],
  seat0: ['Hey, it is the owner.', 'You win tonight, or what?'],
  seat1: ['Nice place you got.', 'They say you play cards with Don Sal.'],
  seat2: ['Don\'t mind me. Just having a drink.', 'You run a good room, kid.'],
  PatronA: ['Evening.', 'Good drink.', 'You hear what happened at the docks?'],
  PatronB: ['Bullseye. Almost.', 'These darts are crooked.'],
  PatronC: ['Eight ball, corner pocket.', 'Rack them up again?'],
  Bookie: ['Lou. I take bets on the tin horses.', 'Pick a horse, any horse.', 'Yertle has been running hot.'],
};

/**
 * Your own bar between nights, in 3D: walk around (WASD + mouse), open the catalog on the back
 * bar to see the room from above and buy things, bet on the tin horses, shoot at the gallery,
 * and go through the back-room door to the next night. Whatever is left in the bar fund comes
 * back to the table with you.
 */
export class BarTycoon {
  constructor({ ui, pr, models, onBuy, onNextDay, onMoney }) {
    this.ui = ui;
    this.pr = pr;
    this.onBuy = onBuy;
    this.onNextDay = onNextDay;
    this.onMoney = onMoney ?? (() => {});
    this.world = new BarScene(models);
    this.camera = new THREE.PerspectiveCamera(62, pr.width / pr.height, 0.03, 40);
    this.camera.rotation.order = 'YXZ';
    this.camera.name = 'BarCamera';
    this.world.scene.add(this.camera); // so the gallery gun can ride along with it
    this.gallery = this.world.galleryGroup
      ? new ShootingGallery({ group: this.world.galleryGroup, models, camera: this.camera }) : null;
    this.active = false;
    this.mode = 'walk'; // walk | catalog | closing | horses | race | gallery | black
    this.player = { x: START.x, z: START.z, yaw: START.yaw, pitch: -0.05, bob: 0 };
    this.keys = new Set();
    this.flash = null;
    this.hover = null;
    this.hoverLeft = 0;
    this.speech = null; // { who, text, t }
    this.spoken = new Set();
    this.cam = { pos: V(0, EYE, 2), target: V(0, EYE, 0) };
    this.offset = 0; // 0..1: how far the 3D view is pushed right to make room for the book
    this.time = 0;
    this.bet = { pick: 0, text: '', error: null, result: null };
    this.race = null;

    window.addEventListener('keydown', (e) => this._keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = pr.canvas;
    canvas.addEventListener('pointerdown', () => {
      if (this.active && this.mode === 'walk' && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed here */ }
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.active || this.mode !== 'walk' || document.pointerLockElement !== canvas) return;
      this.player.yaw -= e.movementX * 0.0024;
      this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - e.movementY * 0.0024, -1.2, 1.0);
    });
  }

  /** What main.js should render while you're in the bar. */
  get view() { return { scene: this.world.scene, camera: this.camera }; }

  enter(run) {
    this.run = run;
    this.active = true;
    this.mode = 'walk';
    this.world.setOwned(run.items);
    Object.assign(this.player, { x: START.x, z: START.z, yaw: START.yaw, pitch: -0.05, bob: 0 });
    this._eyePose(this.cam.pos, this.cam.target);
    this.offset = 0;
    this.hover = null;
    this.flash = null;
    this.spoken.clear();
    this.speech = { who: 'bartender', text: LINES.bartender[(run.day - 1) % LINES.bartender.length], t: 4 };
    this.spoken.add('bartender');
  }

  leave() {
    this.active = false;
    this.keys.clear();
    this.world.setPreview(null);
    this.gallery?.stop();
    if (document.pointerLockElement === this.pr.canvas) document.exitPointerLock?.();
  }

  bought(item, msg) {
    this.world.setOwned(this.run.items);
    this.world.setPreview(this.hover);
    this.note(msg);
  }

  note(text, color = COLORS.lampGlow) { this.flash = { text, t: 2.6, color }; }

  /** Tomorrow's stake: what you brought out plus whatever is left in the bar fund. */
  tomorrowStake() { return this.run.stake + this.run.barFund; }

  // ---------------- input ----------------

  _keyDown(e) {
    if (!this.active) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    const m = this.mode;
    if (m === 'walk') {
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this._use(); }
    } else if (m === 'catalog') {
      if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Tab') { e.preventDefault(); this.closeCatalog(); }
    } else if (m === 'horses' && !this.bet.result) {
      const b = this.bet;
      if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) { b.text = (b.text + e.code.slice(-1)).replace(/^0+/, '').slice(0, 9); b.error = null; }
      else if (e.code === 'Backspace') { b.text = b.text.slice(0, -1); b.error = null; }
      else if (e.code === 'ArrowLeft') b.pick = (b.pick + 3) % 4;
      else if (e.code === 'ArrowRight') b.pick = (b.pick + 1) % 4;
      else if (e.code === 'Enter') this.placeBet();
      else if (e.code === 'Escape') this._backToWalk();
    } else if (m === 'horses' && this.bet.result) {
      if (e.code === 'Enter') this._againBet();
      else if (e.code === 'Escape') this._backToWalk();
    } else if (m === 'gallery') {
      if (e.code === 'KeyR') this.gallery.startReload();
      else if (e.code === 'Escape') this._backToWalk();
      else if (e.code === 'Enter' && this.gallery.state === 'over') this.gallery.start();
    }
  }

  /** The thing in front of you that E would use, if any. */
  _target() {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const near = (pt, r) => {
      const dx = pt.x - p.x, dz = pt.z - p.z;
      const d = Math.hypot(dx, dz);
      return d < r && (d < 0.5 || (dx * fx + dz * fz) / d > 0.55);
    };
    const owned = (id) => this.run.items.includes(id);
    if (near(BOOK, 1.4)) return { kind: 'book', label: 'Read the catalog' };
    if (near(BACK_DOOR, 1.6)) return { kind: 'door', label: `Back room: night ${this.run.day + 1}` };
    if (owned('horses') && near(HORSE_TABLE.pos, 1.7)) return { kind: 'horses', label: 'Bet on the horses' };
    if (owned('gallery') && this.gallery) {
      const at = this.gallery.group.localToWorld(V(0, 0, 0.3));
      if (near(at, 1.7)) return { kind: 'gallery', label: 'Shooting gallery' };
    }
    return null;
  }

  _use() {
    const t = this._target();
    if (!t) return;
    if (t.kind === 'book') this.openCatalog();
    else if (t.kind === 'door') this._goThrough();
    else if (t.kind === 'horses') this._openBet();
    else if (t.kind === 'gallery') this._openGallery();
  }

  _releasePointer() {
    this.keys.clear();
    if (document.pointerLockElement === this.pr.canvas) document.exitPointerLock?.();
  }

  openCatalog() {
    if (this.mode !== 'walk') return;
    this.mode = 'catalog';
    this.hover = null;
    this._releasePointer();
  }

  closeCatalog() {
    if (this.mode !== 'catalog') return;
    this.hover = null;
    this.world.setPreview(null);
    this._backToWalk();
  }

  _backToWalk() {
    if (this.mode === 'race') return;
    this.gallery?.stop();
    this.mode = 'closing';
  }

  /** Straight through the door: the screen fades and the next night starts. */
  _goThrough() {
    this.mode = 'black';
    this._releasePointer();
    this.onNextDay();
  }

  // ---------------- the horse race ----------------

  _openBet() {
    this.mode = 'horses';
    this._releasePointer();
    this.bet.result = null;
    this.bet.error = null;
    if (!this.bet.text || Number(this.bet.text) > this.run.barFund) this.bet.text = String(Math.min(this.run.barFund, 100) || '');
    this._resetHorses();
    this.speech = { who: 'Bookie', text: 'Pick a horse. Win and I pay double.', t: 3 };
  }

  _againBet() {
    this.bet.result = null;
    this.bet.error = null;
    if (Number(this.bet.text) > this.run.barFund) this.bet.text = String(this.run.barFund || '');
    this._resetHorses();
  }

  _resetHorses() {
    const r = this.world.race;
    if (!r) return;
    r.horses.forEach((h, k) => { h.position.set(TRACK.startX, TRACK.y, TRACK.lanes[k]); h.rotation.set(0, 0, 0); });
    r.crown.visible = false;
  }

  placeBet() {
    if (this.mode !== 'horses' || this.bet.result) return;
    const p = parseBet(this.bet.text, this.run.barFund);
    if (!p.ok) { this.bet.error = p.error; return; }
    this.race = { ...runRace(), t: 0, amount: p.amount, pick: this.bet.pick };
    this.mode = 'race';
    this._resetHorses();
    sound.play('slide');
  }

  _updateRace(dt) {
    const r = this.race, w = this.world.race;
    r.t += dt;
    const i = Math.min(r.frames.length - 1, Math.floor(r.t / r.dt));
    const f0 = r.frames[i], f1 = r.frames[Math.min(r.frames.length - 1, i + 1)];
    const k = Math.min(1, r.t / r.dt - i);
    const prog = f0.map((p, n) => p + (f1[n] - p) * k);
    r.prog = prog;
    w.horses.forEach((h, n) => {
      h.position.x = TRACK.startX + prog[n] * (TRACK.finishX - TRACK.startX);
      // rocking-horse gallop on its peg
      h.rotation.z = Math.sin(r.t * 14 + n * 1.7) * 0.12;
      h.position.y = TRACK.y + Math.abs(Math.sin(r.t * 14 + n * 1.7)) * 0.012;
    });
    const lead = leader(prog);
    r.lead = lead;
    w.crown.visible = true;
    const lh = w.horses[lead].position;
    w.crown.position.lerp(V(lh.x, TRACK.y + 0.34 + Math.sin(r.t * 5) * 0.01, lh.z), r.t < 0.2 ? 1 : 1 - Math.exp(-12 * dt));
    w.crown.rotation.y += dt * 2.5;
    if (i >= r.frames.length - 1 && !r.done) {
      r.done = true;
      const net = settleBet(r.amount, r.pick, r.winner);
      this.run.barFund += net;
      this.onMoney();
      sound.play(net > 0 ? 'win' : 'chipThrow');
      this.bet.result = { winner: r.winner, net, amount: r.amount, pick: r.pick };
      this.speech = {
        who: 'Bookie',
        text: net > 0 ? `${HORSES[r.winner]} it is. Here's your ${money(r.amount * 2)}.` : `${HORSES[r.winner]} takes it. Better luck next time.`,
        t: 4,
      };
    }
    if (r.done && r.t > (r.frames.length - 1) * r.dt + 1.2) {
      this.mode = 'horses';
      w.horses.forEach((h) => { h.rotation.z = 0; h.position.y = TRACK.y; });
    }
  }

  // ---------------- the shooting gallery ----------------

  _openGallery() {
    this.mode = 'gallery';
    this._releasePointer();
    this.gallery.start();
  }

  _ndc() {
    const m = this.ui.mouse;
    return new THREE.Vector2((m.x / this.ui.w) * 2 - 1, -((m.y / this.ui.h) * 2 - 1));
  }

  // ---------------- per frame ----------------

  _eyePose(pos, target) {
    const p = this.player;
    pos.set(p.x, EYE + Math.sin(p.bob) * 0.025, p.z);
    const cp = Math.cos(p.pitch);
    target.set(p.x - Math.sin(p.yaw) * cp, pos.y + Math.sin(p.pitch), p.z - Math.cos(p.yaw) * cp);
  }

  _walk(dt) {
    const p = this.player, k = this.keys;
    if (k.has('ArrowLeft')) p.yaw += dt * 2.0;
    if (k.has('ArrowRight')) p.yaw -= dt * 2.0;
    if (document.pointerLockElement !== this.pr.canvas && this.ui.mouse.inside) {
      const u = this.ui.mouse.x / this.ui.w, e = 0.1;
      if (u < e) p.yaw += dt * 2.2 * (e - u) / e;
      else if (u > 1 - e) p.yaw -= dt * 2.2 * (u - (1 - e)) / e;
    }
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD')) s += 1;
    if (k.has('KeyA')) s -= 1;
    const len = Math.hypot(f, s);
    if (len > 0) {
      const sp = (WALK * dt) / len * (k.has('ShiftLeft') ? 1.5 : 1);
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      this._move(p, (fx * f - fz * s) * sp, (fz * f + fx * s) * sp);
      p.bob += dt * 9;
    } else p.bob += (Math.round(p.bob / Math.PI) * Math.PI - p.bob) * Math.min(1, dt * 8);
  }

  /** Move with sliding collisions against the room's boxes and the bartender. */
  _move(p, dx, dz) {
    const boxes = this.world.solidBoxes();
    const blocked = (x, z) => {
      if (x < ROOM.x0 + RADIUS || x > ROOM.x1 - RADIUS || z < ROOM.z0 + RADIUS || z > ROOM.z1 - RADIUS) return true;
      for (const [x0, z0, x1, z1] of boxes) {
        const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
        if ((x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS) return true;
      }
      for (const d of this.world.dynamic) if ((x - d.pos.x) ** 2 + (z - d.pos.z) ** 2 < (RADIUS + d.r) ** 2) return true;
      return false;
    };
    if (!blocked(p.x + dx, p.z)) p.x += dx;
    if (!blocked(p.x, p.z + dz)) p.z += dz;
  }

  /** Where the camera wants to be in the modes that glide it around. */
  _goal(pos, target) {
    const m = this.mode;
    if (m === 'catalog') {
      const it = this.hover && this.world.items[this.hover];
      if (it) {
        target.copy(it.focus);
        pos.copy(it.view).normalize().multiplyScalar(it.dist).add(it.focus);
      } else {
        target.set(0, 0.2, 0.4);
        pos.set(0.8, 11.0, 10.2);
      }
    } else if (m === 'horses' || m === 'race') {
      const g = this.world.race.group;
      // during the race the camera rides alongside the leader
      const lx = m === 'race' && this.race?.prog ? TRACK.startX + this.race.prog[this.race.lead] * (TRACK.finishX - TRACK.startX) : 0;
      const follow = m === 'race' ? lx * 0.7 : 0;
      pos.copy(g.localToWorld(V(follow, m === 'race' ? 1.7 : 1.75, m === 'race' ? 0.95 : 1.55)));
      target.copy(g.localToWorld(V(follow + (m === 'race' ? 0.15 : 0), 0.88, -0.05)));
    } else if (m === 'gallery') {
      this.gallery.standPose(pos, target);
    } else this._eyePose(pos, target);
  }

  _updateCamera(dt) {
    const cam = this.camera;
    const goalPos = V(0, 0, 0), goalTarget = V(0, 0, 0);
    if (this.mode === 'walk' || this.mode === 'black') {
      this._eyePose(goalPos, goalTarget);
      this.cam.pos.copy(goalPos);
      this.cam.target.copy(goalTarget);
    } else {
      this._goal(goalPos, goalTarget);
      const rate = this.mode === 'closing' ? 4 : this.mode === 'race' ? 2.6 : this.mode === 'gallery' ? 5 : 3.2;
      const k = 1 - Math.exp(-rate * dt);
      this.cam.pos.lerp(goalPos, k);
      this.cam.target.lerp(goalTarget, k);
      if (this.mode === 'closing' && this.cam.pos.distanceTo(goalPos) < 0.03 && this.cam.target.distanceTo(goalTarget) < 0.03) {
        this.mode = 'walk';
      }
    }
    const want = this.mode === 'catalog' ? 1 : 0;
    this.offset += (want - this.offset) * (1 - Math.exp(-5 * dt));
    this.world.hemi.intensity = 0.9 + this.offset * 1.0; // a little more light to shop by
    cam.position.copy(this.cam.pos);
    cam.lookAt(this.cam.target);
    const w = this.pr.width, h = this.pr.height;
    if (cam.aspect !== w / h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const shift = Math.round(this.offset * (BOOK_W + 8) / 2);
    if (shift > 0) cam.setViewOffset(w, h, -shift, 0, w, h);
    else if (cam.view?.enabled) cam.clearViewOffset();
    // dollhouse: lift the ceiling and the street wall away when the camera is above or outside
    this.world.ceiling.visible = cam.position.y < ROOM.h - 0.05;
    this.world.walls.front.visible = cam.position.z < ROOM.z1 - 0.05;
    // looking down from above the room, the fog would black everything out
    this.world.scene.fog.far = 12.5 + this.offset * 14;
    this.world.scene.fog.near = 2.8 + this.offset * 9;
  }

  _chatter() {
    for (const ev of this.world.events.splice(0)) this.speech = { ...ev, t: 3 };
    if (this.speech && this.speech.t > 0) return;
    const eye = this.camera.position;
    for (const h of this.world.heads()) {
      if (this.spoken.has(h.who)) continue;
      if (h.pos.distanceTo(eye) > 2.0) continue;
      const lines = LINES[h.who] ?? LINES.PatronA;
      this.speech = { who: h.who, text: lines[Math.floor(Math.random() * lines.length)], t: 3.2 };
      this.spoken.add(h.who);
      return;
    }
  }

  // ---------------- drawing ----------------

  draw(run, dt, time) {
    this.run = run;
    this.time = time;
    if (!this.active) this.enter(run);
    if (this.flash && (this.flash.t -= dt) <= 0) this.flash = null;
    if (this.speech) this.speech.t -= dt;
    if (this.mode === 'walk') this._walk(dt);
    if (this.mode === 'race') this._updateRace(dt);
    const ndc = this._ndc();
    if (this.gallery && this.gallery.state !== 'idle') this.gallery.update(dt, ndc);
    this._updateCamera(dt);
    const p = this.player;
    this.world.update(dt, { x: p.x, z: p.z, eye: this.mode === 'black' ? null : this.camera.position });
    this._chatter();

    const ui = this.ui;
    ui.showCursor = !(this.mode === 'walk' && document.pointerLockElement === this.pr.canvas) && this.mode !== 'gallery';
    if (this.mode === 'catalog' || (this.mode === 'closing' && this.offset > 0.05)) this._drawCatalog(dt);
    else if (this.mode === 'horses' || this.mode === 'race') this._drawRace();
    else if (this.mode === 'gallery') this._drawGallery(ndc);
    else this._drawWalk();
    this._drawSpeech();
  }

  _drawHeader() {
    const ui = this.ui, W = ui.w;
    ui.text('Your Bar', 8, 7, COLORS.lampGlow, { shadow: COLORS.black });
    ui.text(`after night ${this.run.day}`, 12 + ui.textWidth('Your Bar'), 7, COLORS.bone, { shadow: COLORS.black });
    const fund = `Bar fund ${money(this.run.barFund)}`;
    const stake = `Tomorrow ${money(this.tomorrowStake())}`;
    ui.text(fund, W - 8 - ui.textWidth(fund), 7, COLORS.gold, { shadow: COLORS.black });
    ui.text(stake, W - 8 - ui.textWidth(stake), 17, COLORS.bone, { shadow: COLORS.black });
  }

  _drawSpeech() {
    if (!this.speech || this.speech.t <= 0 || this.mode === 'catalog') return;
    const ui = this.ui, W = ui.w, H = ui.h;
    const h = this.world.heads().find((x) => x.who === this.speech.who);
    const p = h && this._toScreen(h.pos.clone().add(V(0, 0.4, 0)));
    if (!p) return;
    const w = ui.textWidth(this.speech.text) + 8;
    const x = THREE.MathUtils.clamp(p.x - w / 2, 4, W - w - 4);
    const y = THREE.MathUtils.clamp(p.y - 12, 26, H - 40);
    ui.rect(x, y, w, 11, COLORS.ink);
    ui.rect(x, y + 11, w, 1, COLORS.amberDark);
    ui.text(this.speech.text, x + 4, y + 3, COLORS.cream);
  }

  _drawWalk() {
    const ui = this.ui, W = ui.w, H = ui.h;
    this._drawHeader();
    const cx = Math.round(W / 2), cy = Math.round(H / 2);
    ui.rect(cx - 1, cy, 3, 1, COLORS.paper);
    ui.rect(cx, cy - 1, 1, 3, COLORS.paper);
    const t = this.mode === 'walk' ? this._target() : null;
    if (t) {
      const w = ui.textWidth(`E  ${t.label}`) + 12;
      const x = Math.round(W / 2 - w / 2), y = cy + 16;
      ui.rect(x, y, w, 13, COLORS.ink);
      ui.rect(x, y + 12, w, 1, COLORS.gold);
      ui.text('E', x + 6, y + 4, COLORS.gold);
      ui.text(t.label, x + 6 + ui.textWidth('E  '), y + 4, COLORS.paper);
      if (ui.clicked) { ui.consumeClick(); this._use(); }
    }
    if (this.flash) ui.textCentered(this.flash.text, W / 2, H - 30, this.flash.color, { shadow: COLORS.black });
    const locked = document.pointerLockElement === this.pr.canvas;
    const hint = locked ? 'WASD walk   mouse look   E use' : 'WASD walk   click to look with the mouse   E use';
    ui.text(hint, 8, H - 12, COLORS.smoke, { shadow: COLORS.black });
    if (!this.run.items.length) ui.text('The catalog is on the back bar. The back room door is on the left.', 8, H - 22, COLORS.smoke, { shadow: COLORS.black });
  }

  _drawRace() {
    const ui = this.ui, W = ui.w, H = ui.h;
    this._drawHeader();
    const w = this.world.race;
    // each horse's name, in orange, over its head; the leader wears the crown
    w.horses.forEach((h, n) => {
      const p = this._toScreen(h.getWorldPosition(new THREE.Vector3()).add(V(0, 0.3, 0)));
      if (!p) return;
      const name = HORSES[n];
      const lead = this.mode === 'race' && this.race?.lead === n;
      const x = Math.round(p.x - ui.textWidth(name) / 2);
      ui.rect(x - 2, p.y - 2, ui.textWidth(name) + 4, 10, COLORS.ink);
      ui.text(name, x, p.y, lead ? COLORS.gold : HORSE_NAME);
    });
    if (this.mode === 'race') {
      const r = this.race;
      const line = `Your ${money(r.amount)} on `;
      const lw = ui.textWidth(line) + ui.textWidth(HORSES[r.pick]);
      const x = Math.round(W / 2 - lw / 2);
      ui.rect(x - 6, H - 26, lw + 12, 14, COLORS.ink);
      ui.text(line, x, H - 22, COLORS.paper);
      ui.text(HORSES[r.pick], x + ui.textWidth(line), H - 22, HORSE_NAME);
      return;
    }
    // the betting slip
    const b = this.bet;
    const pw = 300, ph = b.result ? 70 : 100, px = Math.round((W - pw) / 2), py = H - ph - 8;
    ui.panel(px, py, pw, ph, { fill: COLORS.ink, border: COLORS.amber });
    if (b.result) {
      const r = b.result;
      const won = r.net > 0;
      const head = `${HORSES[r.winner]} wins!`;
      ui.text(HORSES[r.winner], Math.round(W / 2 - ui.textWidth(head, 2) / 2), py + 8, HORSE_NAME, { scale: 2 });
      ui.text(' wins!', Math.round(W / 2 - ui.textWidth(head, 2) / 2) + ui.textWidth(HORSES[r.winner], 2), py + 8, COLORS.cream, { scale: 2 });
      ui.textCentered(won ? `You win ${money(r.amount * 2)} (${money(r.net)} profit)` : `You lose ${money(r.amount)}`, W / 2, py + 26, won ? COLORS.gold : COLORS.redLight);
      ui.textCentered(`Bar fund ${money(this.run.barFund)}`, W / 2, py + 37, COLORS.bone);
      if (ui.button('Bet again', px + 12, py + ph - 20, 130, 14, { accent: COLORS.amber, enabled: this.run.barFund > 0 })) this._againBet();
      if (ui.button('Walk away', px + pw - 142, py + ph - 20, 130, 14)) this._backToWalk();
      return;
    }
    ui.text('Mechanical Derby', px + 8, py + 6, COLORS.gold);
    const sub = 'Lou takes the bet. Win and it pays double.';
    ui.text(sub, px + pw - 8 - ui.textWidth(sub), py + 6, COLORS.smoke);
    // pick a horse
    const bw = Math.floor((pw - 16 - 9) / 4);
    HORSES.forEach((name, n) => {
      const bx = px + 8 + n * (bw + 3), by = py + 18;
      const sel = b.pick === n;
      const over = ui.over(bx, by, bw, 16);
      ui.rect(bx, by, bw, 16, sel ? COLORS.gold : over ? COLORS.amberDark : COLORS.woodLight);
      ui.rect(bx + 1, by + 1, bw - 2, 14, sel ? COLORS.wood : COLORS.shadow);
      ui.textCentered(name, bx + bw / 2, by + 5, HORSE_NAME);
      ui.hits.push({ x: bx, y: by, w: bw, h: 16 });
      if (ui.clickedIn(bx, by, bw, 16)) { ui.consumeClick(); b.pick = n; }
    });
    // the amount
    const fy = py + 42;
    ui.text('Bet', px + 8, fy + 4, COLORS.paper);
    const fx = px + 30, fw = 96;
    ui.rect(fx, fy, fw, 14, b.error ? COLORS.redLight : COLORS.gold);
    ui.rect(fx + 1, fy + 1, fw - 2, 12, COLORS.black);
    const caret = Math.floor(this.time * 2) % 2 ? '_' : '';
    ui.text(`$${b.text}${caret}`, fx + 4, fy + 4, COLORS.cream);
    if (ui.button('Half', fx + fw + 4, fy, 34, 14, { enabled: this.run.barFund > 1 })) { b.text = String(Math.floor(this.run.barFund / 2)); b.error = null; }
    if (ui.button('All', fx + fw + 41, fy, 30, 14, { enabled: this.run.barFund > 0 })) { b.text = String(this.run.barFund); b.error = null; }
    ui.text(`of ${money(this.run.barFund)}`, fx + fw + 76, fy + 4, COLORS.smoke);
    if (b.error) ui.text(b.error, px + 8, fy + 19, COLORS.redLight);
    else ui.text('Type an amount. Left and right pick a horse.', px + 8, fy + 19, COLORS.smoke);
    const label = `Bet on ${HORSES[b.pick]}`;
    if (ui.button(label, px + 8, py + ph - 20, 150, 14, { accent: COLORS.amber, enabled: this.run.barFund > 0 })) this.placeBet();
    if (ui.button('Walk away', px + pw - 108, py + ph - 20, 100, 14)) this._backToWalk();
    if (this.run.barFund <= 0) ui.textCentered('Nothing left in the bar fund to bet.', W / 2, py - 12, COLORS.redLight, { shadow: COLORS.black });
  }

  _drawGallery(ndc) {
    const ui = this.ui, W = ui.w, H = ui.h;
    const g = this.gallery;
    // crosshair where you aim
    const mx = Math.round((ndc.x + 1) / 2 * W), my = Math.round((1 - ndc.y) / 2 * H);
    ui.rect(mx - 6, my, 4, 1, COLORS.cream); ui.rect(mx + 3, my, 4, 1, COLORS.cream);
    ui.rect(mx, my - 6, 1, 4, COLORS.cream); ui.rect(mx, my + 3, 1, 4, COLORS.cream);
    ui.rect(mx, my, 1, 1, COLORS.redLight);
    const best = this.run.galleryBest ?? 0;
    ui.text(`Score ${g.score}`, 8, 7, COLORS.gold, { scale: 2, shadow: COLORS.black });
    ui.text(`Best ${best}`, 8, 23, COLORS.bone, { shadow: COLORS.black });
    const tl = `${Math.ceil(g.time)}`;
    ui.text(tl, W - 8 - ui.textWidth(tl, 2), 7, g.time < 5 ? COLORS.redLight : COLORS.cream, { scale: 2, shadow: COLORS.black });
    // bullets left in the cylinder
    for (let i = 0; i < SHOTS; i++) {
      const bx = W - 10 - i * 7, by = H - 18;
      ui.rect(bx, by, 4, 9, i < g.ammo ? COLORS.gold : COLORS.ash);
      ui.rect(bx, by, 4, 2, i < g.ammo ? COLORS.amberDark : COLORS.ashDark);
    }
    if (g.reload > 0) ui.textCentered('Reloading', W - 30, H - 30, COLORS.amber, { shadow: COLORS.black });
    ui.text('Click shoot   R reload   Esc leave', 8, H - 12, COLORS.smoke, { shadow: COLORS.black });
    if (g.state === 'play') {
      if (ui.clicked) { ui.consumeClick(); g.shoot(ndc); }
      return;
    }
    if (g.state === 'over') {
      if (!this._galleryScored) {
        this._galleryScored = true;
        if (g.score > best) { this.run.galleryBest = g.score; this.onMoney(); }
      }
      const pw = 180, ph = 64, px = Math.round((W - pw) / 2), py = Math.round(H / 2 - ph / 2);
      ui.panel(px, py, pw, ph, { fill: COLORS.ink, border: COLORS.gold });
      ui.textCentered('Time!', W / 2, py + 7, COLORS.gold, { scale: 2 });
      const rec = g.score >= best && g.score > 0 ? '  New best!' : '';
      ui.textCentered(`${g.score} hits${rec}`, W / 2, py + 25, COLORS.cream);
      if (ui.button('Again', px + 10, py + ph - 20, 74, 14, { accent: COLORS.gold })) { g.start(); }
      if (ui.button('Leave', px + pw - 84, py + ph - 20, 74, 14)) this._backToWalk();
    } else this._galleryScored = false;
    if (g.state === 'play') this._galleryScored = false;
  }

  _drawCatalog(dt) {
    const ui = this.ui, W = ui.w, H = ui.h;
    const slide = Math.round((1 - this.offset) * -(BOOK_W + 20));
    const bx = 6 + slide, by = 6, bw = BOOK_W, bh = H - 12;
    ui.rect(bx, by, bw, bh, COLORS.red);
    ui.rect(bx + 1, by + 1, bw - 2, bh - 2, COLORS.redMid);
    ui.rect(bx + 4, by + 4, bw - 8, bh - 8, COLORS.paper);
    ui.rect(bx + bw - 9, by + 4, 2, bh - 8, COLORS.bone);
    for (let yy = by + 10; yy < by + bh - 10; yy += 8) ui.rect(bx + bw - 6, yy, 1, 3, COLORS.goldLight);
    ui.hits.push({ x: bx, y: by, w: bw, h: bh });
    const px = bx + 10, pw = bw - 26;
    ui.text('Catalog', px, by + 10, COLORS.red, { scale: 2 });
    ui.text('for your bar', px + ui.textWidth('Catalog', 2) + 6, by + 16, COLORS.smoke);
    ui.rect(px, by + 27, pw, 1, COLORS.bone);

    const top = by + 32;
    const footer = 64;
    const rowH = Math.max(11, Math.min(16, Math.floor((bh - (top - by) - footer) / BAR_ITEMS.length)));
    let hover = null;
    BAR_ITEMS.forEach((it, i) => {
      const y = top + i * rowH;
      const owned = this.run.items.includes(it.id);
      const afford = this.run.barFund >= it.price;
      const over = this.mode === 'catalog' && ui.over(px - 2, y, pw + 4, rowH);
      if (over) hover = it.id;
      if (over || this.hover === it.id) ui.ditherRect(px - 2, y, pw + 4, rowH, COLORS.amber, over ? 0.45 : 0.25);
      const ty = y + Math.floor((rowH - 6) / 2);
      ui.text(it.name, px, ty, owned ? COLORS.sage : COLORS.woodDark);
      if (owned) {
        ui.text('Yours', px + pw - ui.textWidth('Yours'), ty, COLORS.sage);
      } else {
        const w = 44;
        if (ui.button(money(it.price), px + pw - w, y + 1, w, rowH - 2, { enabled: afford && this.mode === 'catalog', accent: COLORS.amberDark })) {
          this.onBuy(it);
        }
      }
    });
    if (hover) { this.hover = hover; this.hoverLeft = 0.35; }
    else if (this.hover && (this.hoverLeft -= dt) <= 0) this.hover = null;
    if (this.mode === 'catalog') this.world.setPreview(this.hover);

    const fy = top + BAR_ITEMS.length * rowH + 4;
    ui.rect(px, fy, pw, 1, COLORS.bone);
    ui.text('Bar fund', px, fy + 5, COLORS.woodDark);
    ui.text(money(this.run.barFund), px + pw - ui.textWidth(money(this.run.barFund)), fy + 5, COLORS.amberDark);
    ui.text('Left over comes to the table:', px, fy + 15, COLORS.smoke);
    ui.text(`tomorrow you sit down with ${money(this.tomorrowStake())}`, px, fy + 25, COLORS.woodDark);
    if (ui.button('Close the book', px, by + bh - 22, pw, 14, { accent: COLORS.red }) && this.mode === 'catalog') this.closeCatalog();

    const vx = bx + bw + 10, vw = W - vx - 8;
    if (this.mode === 'catalog' && vw > 60) {
      const it = this.hover && BAR_ITEMS.find((b) => b.id === this.hover);
      if (it) {
        const owned = this.run.items.includes(it.id);
        const tag = owned ? 'In your bar' : `Preview  ${money(it.price)}`;
        ui.rect(vx, 8, vw, 24, COLORS.ink);
        ui.rect(vx, 31, vw, 1, owned ? COLORS.sage : COLORS.gold);
        ui.text(it.name, vx + 6, 12, COLORS.cream);
        ui.text(tag, vx + vw - 6 - ui.textWidth(tag), 12, owned ? COLORS.sage : COLORS.gold);
        ui.text(wrapText(BLURBS[it.id] ?? '', vw - 12)[0] ?? '', vx + 6, 22, COLORS.bone);
      } else {
        ui.textCentered('Point at something in the book to see it in your bar.', vx + vw / 2, 12, COLORS.bone, { shadow: COLORS.black });
      }
      if (this.flash) ui.textCentered(this.flash.text, vx + vw / 2, H - 16, this.flash.color, { shadow: COLORS.black });
    }
  }

  _toScreen(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return null;
    return { x: Math.round((p.x + 1) / 2 * this.ui.w), y: Math.round((1 - p.y) / 2 * this.ui.h) };
  }
}
