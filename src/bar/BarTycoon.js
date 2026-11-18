import * as THREE from 'three';
import { COLORS } from '../shared/render/palette.js';
import { wrapText } from '../shared/ui/font.js';
import { BAR_ITEMS } from '../holdem/game/meta.js';
import { BarScene, ROOM, EYE, START, BOOK, BACK_DOOR } from './BarScene.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RADIUS = 0.22; // you, for bumping into things
const WALK = 2.3; // m/s
const BOOK_W = 196; // width of the open catalog on screen

/** One line about each thing, shown while you look at it in the catalog. */
const BLURBS = {
  stools: 'Red leather, chrome. Somewhere for the regulars to sit.',
  plant: 'A palm in the corner. Makes the place look legitimate.',
  dartboard: 'For the quiet nights. Mind the bartender.',
  lights: 'Three green lamps over the counter.',
  shelf: 'A full back bar. Bottles catch the light.',
  fan: 'Pushes the cigar smoke around.',
  neon: 'BAR, in red. Flickers when it rains.',
  portrait: 'Don Sal, in oils. The family will hear about it.',
  jukebox: 'Every record the regulars ask for.',
  piano: 'Nobody here can play it. Yet.',
  pool: 'Green felt, a full rack, a cue.',
  aquarium: 'Five goldfish who have seen too much.',
  chandelier: 'Gold and candlelight. The whole room glows.',
};

const GREETINGS = ['Evening, boss.', 'Back from the table? The catalog is on the back bar.', 'Quiet night. Have a look in the book.'];
const CHATTER = [
  ['Nice place you got.', 'They say you play cards with Don Sal.', 'Another round when you get a minute.'],
  ['Hey, it is the owner.', 'You win tonight, or what?', 'This is the only bar in town I like.'],
  ['Evening.', 'Good drink.', 'You hear what happened at the docks?'],
  ['Bullseye. Almost.', 'You want a game?', 'These darts are crooked.'],
  ['Eight ball, corner pocket.', 'Felt plays fast.', 'Rack them up again?'],
];

/**
 * Your own bar between nights, in 3D: walk around (WASD + mouse), talk past the regulars,
 * open the catalog on the back bar to see the room from above and buy things, and go through
 * the back-room door to the next night. Nothing in the bar earns money: it's just yours.
 * Whatever is left in the bar fund comes back to the table with you.
 */
export class BarTycoon {
  constructor({ ui, pr, models, onBuy, onNextDay }) {
    this.ui = ui;
    this.pr = pr;
    this.onBuy = onBuy;
    this.onNextDay = onNextDay;
    this.world = new BarScene(models);
    this.camera = new THREE.PerspectiveCamera(62, pr.width / pr.height, 0.05, 40);
    this.camera.rotation.order = 'YXZ';
    this.camera.name = 'BarCamera';
    this.active = false;
    this.mode = 'walk'; // walk | catalog | closing | door
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
    this.speech = { who: 'bartender', text: GREETINGS[(run.day - 1) % GREETINGS.length], t: 4 };
    this.spoken.add('bartender');
  }

  leave() {
    this.active = false;
    this.keys.clear();
    this.world.setPreview(null);
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
    if (this.mode === 'walk') {
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this._use(); }
    } else if (this.mode === 'catalog') {
      if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Tab') { e.preventDefault(); this.closeCatalog(); }
    } else if (this.mode === 'door') {
      if (e.code === 'Enter' || e.code === 'KeyE') this._goThrough();
      else if (e.code === 'Escape') this.mode = 'walk';
    }
  }

  /** The thing in front of you that E would use, if any. */
  _target() {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const near = (pt, r) => {
      const dx = pt.x - p.x, dz = pt.z - p.z;
      const d = Math.hypot(dx, dz);
      return d < r && (d < 0.5 || (dx * fx + dz * fz) / d > 0.6);
    };
    if (near(BOOK, 1.35)) return { kind: 'book', label: 'Read the catalog' };
    if (near(BACK_DOOR, 1.5)) return { kind: 'door', label: `Back room: night ${this.run.day + 1}` };
    return null;
  }

  _use() {
    const t = this._target();
    if (t?.kind === 'book') this.openCatalog();
    else if (t?.kind === 'door') this.mode = 'door';
  }

  openCatalog() {
    if (this.mode !== 'walk') return;
    this.mode = 'catalog';
    this.keys.clear();
    this.hover = null;
    if (document.pointerLockElement === this.pr.canvas) document.exitPointerLock?.();
  }

  closeCatalog() {
    if (this.mode !== 'catalog') return;
    this.mode = 'closing';
    this.hover = null;
    this.world.setPreview(null);
  }

  _goThrough() {
    this.mode = 'black';
    this.onNextDay();
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
    // turn with the arrow keys, or by holding the pointer near the screen edge (no mouse capture)
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
      if (Math.floor(p.bob / Math.PI) !== Math.floor((p.bob - dt * 9) / Math.PI)) this._step();
    } else p.bob += (Math.round(p.bob / Math.PI) * Math.PI - p.bob) * Math.min(1, dt * 8);
  }

  _step() { /* sound.play('footsteps') when there is sound */ }

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

  /** Where the catalog camera wants to be: over the whole room, or close on the hovered thing. */
  _catalogGoal(pos, target) {
    const it = this.hover && this.world.items[this.hover];
    if (it) {
      target.copy(it.focus);
      pos.copy(it.view).normalize().multiplyScalar(it.dist).add(it.focus);
    } else {
      target.set(0, 0.2, 0.1);
      pos.set(0.5, 6.6, 5.6);
    }
  }

  _updateCamera(dt) {
    const cam = this.camera;
    const goalPos = V(0, 0, 0), goalTarget = V(0, 0, 0);
    if (this.mode === 'walk' || this.mode === 'door' || this.mode === 'black') {
      this._eyePose(goalPos, goalTarget);
      this.cam.pos.copy(goalPos);
      this.cam.target.copy(goalTarget);
    } else {
      if (this.mode === 'catalog') this._catalogGoal(goalPos, goalTarget);
      else this._eyePose(goalPos, goalTarget);
      // ease toward the goal: this is the zoom when you hover something in the book
      const k = 1 - Math.exp(-(this.mode === 'closing' ? 4 : 3.2) * dt);
      this.cam.pos.lerp(goalPos, k);
      this.cam.target.lerp(goalTarget, k);
      if (this.mode === 'closing' && this.cam.pos.distanceTo(goalPos) < 0.03 && this.cam.target.distanceTo(goalTarget) < 0.03) {
        this.mode = 'walk';
      }
    }
    const want = this.mode === 'catalog' ? 1 : 0;
    this.offset += (want - this.offset) * (1 - Math.exp(-5 * dt));
    this.world.hemi.intensity = 1.0 + this.offset * 0.9; // a little more light to shop by
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
  }

  _chatter() {
    if (this.speech && this.speech.t > 0) return;
    const eye = this.camera.position;
    for (const h of this.world.heads()) {
      if (this.spoken.has(h.who)) continue;
      if (h.pos.distanceTo(eye) > 1.9) continue;
      const lines = h.who === 'bartender' ? GREETINGS : CHATTER[h.who % CHATTER.length];
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
    this._updateCamera(dt);
    this.world.update(dt, this.mode === 'walk' ? this.camera.position : null);
    if (this.mode === 'walk') this._chatter();

    const ui = this.ui;
    ui.showCursor = this.mode !== 'walk' || document.pointerLockElement !== this.pr.canvas;
    if (this.mode === 'catalog' || this.mode === 'closing') this._drawCatalog(dt);
    else this._drawWalk();
    if (this.mode === 'door') this._drawDoor();
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

  _drawWalk() {
    const ui = this.ui, W = ui.w, H = ui.h;
    this._drawHeader();
    // crosshair
    const cx = Math.round(W / 2), cy = Math.round(H / 2);
    ui.rect(cx - 1, cy, 3, 1, COLORS.paper);
    ui.rect(cx, cy - 1, 1, 3, COLORS.paper);
    // speech
    if (this.speech && this.speech.t > 0) {
      const h = this.world.heads().find((x) => x.who === this.speech.who);
      const p = h && this._toScreen(h.pos.clone().add(V(0, 0.38, 0)));
      if (p) {
        const w = ui.textWidth(this.speech.text) + 8;
        const x = THREE.MathUtils.clamp(p.x - w / 2, 4, W - w - 4);
        const y = THREE.MathUtils.clamp(p.y - 12, 26, H - 40);
        ui.rect(x, y, w, 11, COLORS.ink);
        ui.rect(x, y + 11, w, 1, COLORS.amberDark);
        ui.text(this.speech.text, x + 4, y + 3, COLORS.cream);
      }
    }
    // what E would do
    const t = this.mode === 'walk' ? this._target() : null;
    if (t) {
      const label = `E  ${t.label}`;
      const w = ui.textWidth(label) + 12;
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
    const goal = 'The catalog is on the back bar. The back room door is on the left.';
    if (!this.run.items.length) ui.text(goal, 8, H - 22, COLORS.smoke, { shadow: COLORS.black });
  }

  _drawDoor() {
    const ui = this.ui, W = ui.w, H = ui.h;
    const pw = 236, ph = 76, x = Math.round((W - pw) / 2), y = Math.round((H - ph) / 2);
    ui.panel(x, y, pw, ph, { fill: COLORS.ink, border: COLORS.gold });
    ui.textCentered(`Back to the table: night ${this.run.day + 1}?`, W / 2, y + 8, COLORS.gold);
    const left = this.run.barFund;
    const line = left > 0 ? `${money(left)} left in the bar fund comes with you.` : 'The bar fund is empty.';
    ui.textCentered(line, W / 2, y + 22, COLORS.paper);
    ui.textCentered(`You sit down with ${money(this.tomorrowStake())}.`, W / 2, y + 33, COLORS.bone);
    if (ui.button('Go', x + 14, y + ph - 22, 96, 15, { accent: COLORS.gold, badge: 1 })) this._goThrough();
    if (ui.button('Stay a while', x + pw - 110, y + ph - 22, 96, 15, { badge: 2 })) this.mode = 'walk';
    if (this.keys.has('Digit1')) this._goThrough();
    else if (this.keys.has('Digit2')) this.mode = 'walk';
  }

  _drawCatalog(dt) {
    const ui = this.ui, W = ui.w, H = ui.h;
    const slide = Math.round((1 - this.offset) * -(BOOK_W + 20));
    const bx = 6 + slide, by = 6, bw = BOOK_W, bh = H - 12;
    // the open book: red cover, paper page, a stitched spine on the right
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
        const label = money(it.price);
        const w = 44;
        if (ui.button(label, px + pw - w, y + 1, w, rowH - 2, { enabled: afford && this.mode === 'catalog', accent: COLORS.amberDark })) {
          this.onBuy(it);
        }
      }
    });
    // keep the last thing in view for a moment when the pointer slips off the list
    if (hover) { this.hover = hover; this.hoverLeft = 0.35; }
    else if (this.hover && (this.hoverLeft -= dt) <= 0) this.hover = null;
    if (this.mode === 'catalog') this.world.setPreview(this.hover);

    const fy = top + BAR_ITEMS.length * rowH + 4;
    ui.rect(px, fy, pw, 1, COLORS.bone);
    ui.text('Bar fund', px, fy + 5, COLORS.woodDark);
    ui.text(money(this.run.barFund), px + pw - ui.textWidth(money(this.run.barFund)), fy + 5, COLORS.amberDark);
    ui.text('Left over comes to the table:', px, fy + 15, COLORS.smoke);
    const ts = `tomorrow you sit down with ${money(this.tomorrowStake())}`;
    ui.text(ts, px, fy + 25, COLORS.woodDark);
    if (ui.button('Close the book', px, by + bh - 22, pw, 14, { accent: COLORS.red }) && this.mode === 'catalog') this.closeCatalog();

    // label over the 3D view for whatever you're looking at
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
        const blurb = wrapText(BLURBS[it.id] ?? '', vw - 12)[0] ?? '';
        ui.text(blurb, vx + 6, 22, COLORS.bone);
      } else {
        const msg = 'Point at something in the book to see it in your bar.';
        ui.textCentered(msg, vx + vw / 2, 12, COLORS.bone, { shadow: COLORS.black });
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
