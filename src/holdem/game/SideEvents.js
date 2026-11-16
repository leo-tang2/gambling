import * as THREE from 'three';
import { COLORS } from '../../shared/render/palette.js';
import { ease } from '../../shared/anim/Tweens.js';
import { sound } from '../../shared/audio/Sound.js';
import { TABLE_HEIGHT, polar } from '../scene/layout.js';
import { makeBartender, makeGlass, makeAshtray } from '../scene/Extras.js';
import { ROULETTE_BONUS, rouletteWinnings, rouletteFires } from './meta.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// where the bartender stops (to your right, just off the table edge) and where things land
const BARTENDER_STOP = polar(1.2, 1.2, 0);
const BARTENDER_FROM = polar(1.15, 3.4, 0);
const GLASS_SPOT = V(0.46, TABLE_HEIGHT, 0.5);
const ASHTRAY_SPOT = V(-0.34, TABLE_HEIGHT, 0.4);

/**
 * The offers that interrupt the game every couple of hands: a drink from the bartender,
 * a round of Russian roulette with the Don, or a cigar. Each is a short scripted scene.
 */
export class SideEvents {
  constructor(c) {
    this.c = c;
    this.last = null;
    this.bartender = null;
    this.cigarRig = null;
  }

  /** Pick an offer that isn't the same as last time (and no second cigar while one burns). */
  choose() {
    let kinds = ['drink', 'roulette', 'cigar'].filter((k) => k !== this.last);
    if (this.c.cigar) kinds = kinds.filter((k) => k !== 'cigar');
    return pick(kinds);
  }

  async run(kind) {
    this.last = kind;
    if (kind === 'drink') return this.drink();
    if (kind === 'roulette') return this.roulette();
    return this.offerCigar();
  }

  _seatOf(preferred) {
    const out = this.c.shown.out;
    return [preferred, 2, 3, 1].find((s) => !out[s]) ?? 2;
  }

  _lookAtPoint(p, pitchBias = 0) {
    const d = p.clone().sub(this.c.playerEye);
    this.c.look.override = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) + pitchBias };
  }

  _begin() {
    const c = this.c;
    c.cutscene = true;
    c.look.locked = true;
  }

  _end() {
    const c = this.c;
    c.cutscene = false;
    c.look.override = null;
    c.look.locked = false;
    c.extraSpeech = null;
    for (let s = 1; s < 4; s++) c.room.characters[s]?.lookAt(null);
  }

  // ---------------- the bartender ----------------

  _ensureBartender() {
    if (this.bartender) return this.bartender;
    const b = makeBartender();
    b.root.visible = false;
    this.c.room.scene.add(b.root);
    b.glass = makeGlass();
    b.tray.add(b.glass);
    b.glass.position.set(0.03, 0.006, 0.02);
    this.bartender = b;
    return b;
  }

  async _walk(root, from, to, duration) {
    const dir = V(to.x - from.x, 0, to.z - from.z);
    root.rotation.y = Math.atan2(dir.x, dir.z);
    await this.c.tweens.add({
      duration, easing: ease.inOutQuad,
      update: (t, raw) => {
        root.position.set(from.x + (to.x - from.x) * t, Math.abs(Math.sin(raw * duration * 7)) * 0.018, from.z + (to.z - from.z) * t);
      },
    });
    root.position.y = 0;
  }

  async drink() {
    const c = this.c;
    const b = this._ensureBartender();
    this._begin();
    b.root.visible = true;
    b.glass.visible = true;
    b.tray.attach(b.glass);
    b.glass.position.set(0.03, 0.006, 0.02);
    b.glass.rotation.set(0, 0, 0);
    b.glass.getObjectByName('Drink').visible = true;
    const from = V(BARTENDER_FROM.x, 0, BARTENDER_FROM.z);
    const stop = V(BARTENDER_STOP.x, 0, BARTENDER_STOP.z);
    b.root.position.copy(from);
    this._lookAtPoint(V(stop.x, 1.25, stop.z), -0.05);
    for (let s = 1; s < 4; s++) c.room.characters[s]?.lookAt(V(stop.x, 1.4, stop.z));
    sound.play('footsteps');
    await this._walk(b.root, from, stop, 2.2);
    // turn to face you
    const face = Math.atan2(c.playerEye.x - stop.x, c.playerEye.z - stop.z);
    const r0 = b.root.rotation.y;
    await c.tweens.add({ duration: 0.35, update: (t) => { b.root.rotation.y = r0 + (face - r0) * t; } });
    const headPos = () => b.head.getWorldPosition(V(0, 0, 0)).add(V(0, 0.32, 0));
    c.extraSpeech = { text: pick(['Something to take the edge off?', 'On the house. Long night, huh?', 'A little whiskey for the gentleman?']), pos: headPos() };
    await c.tweens.wait(0.6);
    const take = await c.hud.choose({
      title: 'The bartender offers you a drink',
      options: [
        { label: 'Take the drink', value: true, accent: COLORS.amber },
        { label: 'No thanks', value: false },
      ],
      cancel: false,
    });
    if (take) {
      c.extraSpeech = { text: pick(['Atta boy.', 'Easy does it.', 'Salute.']), pos: headPos() };
      // the glass goes from the tray to the felt in front of you...
      const g = b.glass;
      c.room.scene.attach(g);
      const p0 = g.position.clone();
      await c.tweens.add({ duration: 0.5, easing: ease.inOutQuad, update: (t) => { g.position.lerpVectors(p0, GLASS_SPOT, t); g.position.y += Math.sin(Math.PI * t) * 0.06; } });
      sound.play('glassDown');
      this._lookAtPoint(GLASS_SPOT, 0.1);
      await c.tweens.wait(0.5);
      // ...and up to your lips
      const lips = c.playerEye.clone().add(V(0.03, -0.12, -0.2));
      const p1 = g.position.clone();
      this._lookAtPoint(c.playerEye.clone().add(V(0, -0.02, -1)), 0);
      await c.tweens.add({ duration: 0.55, easing: ease.inOutQuad, update: (t) => { g.position.lerpVectors(p1, lips, t); g.rotation.x = -1.1 * t; } });
      sound.play('gulp');
      c.look.shake = 0.01;
      await c.tweens.wait(0.5);
      g.getObjectByName('Drink').visible = false;
      await c.tweens.add({ duration: 0.45, easing: ease.inOutQuad, update: (t) => { g.position.lerpVectors(lips, GLASS_SPOT, t); g.rotation.x = -1.1 * (1 - t); } });
      sound.play('glassDown');
      c.dayStats.drinks++;
      c.drunk = Math.min(1, c.drunk + 0.5);
      c.hud.message('You knock it back. The room tilts a little.', COLORS.amber, 3);
      this._lookAtPoint(V(stop.x, 1.25, stop.z), -0.05);
      await c.tweens.wait(0.4);
      // he takes the empty glass with him
      b.tray.attach(g);
      g.position.set(0.03, 0.006, 0.02);
      g.rotation.set(0, 0, 0);
    } else {
      c.extraSpeech = { text: pick(['Suit yourself.', 'Your loss, pal.', 'More for me.']), pos: headPos() };
      await c.tweens.wait(0.9);
    }
    c.extraSpeech = null;
    this.c.look.override = { yaw: 0, pitch: c.look.pitchRest };
    await this._walk(b.root, stop, from, 2.0);
    b.root.visible = false;
    this._end();
  }

  // ---------------- Russian roulette ----------------

  async roulette() {
    const c = this.c;
    this._begin();
    const seat = this._seatOf(2);
    const head = c.room.headPosition(seat);
    this._lookAtPoint(head, -0.14);
    for (let s = 1; s < 4; s++) c.room.characters[s]?.lookAt(c.playerEye);
    c.hud.say(seat, seat === 2 ? 'You like to gamble, kid? Let\'s play a real game.' : 'The boss wants to see if you got guts.', 3.5);
    await c.tweens.wait(1.6);
    const stack = c.game.players[0].stack;
    const options = [1, 2, 3, 4, 5].map((b) => ({
      label: `${b} bullet${b > 1 ? 's' : ''}`,
      note: `+${money(rouletteWinnings(stack, b))} (+${Math.round(ROULETTE_BONUS[b] * 100)}%)   death ${b}/6`,
      value: b,
      accent: b >= 4 ? COLORS.redLight : b >= 2 ? COLORS.amber : COLORS.amberDark,
    }));
    options.push({ label: 'Walk away', value: 0 });
    const bullets = await c.hud.choose({
      title: 'Russian roulette',
      text: 'Pick how many bullets go in the six chambers. Survive and your money grows - more bullets, bigger bonus.',
      options,
      cancel: 0,
    });
    if (!bullets) {
      c.hud.say(seat, pick(['Smart. Or yellow. Hard to tell.', 'Heh. Maybe next time.', 'A careful man. I respect that.']), 2.6);
      c.respect -= 2;
      await c.tweens.wait(1.6);
      this._end();
      return 'declined';
    }
    c.hud.say(seat, bullets >= 4 ? 'Madonna... you\'re crazy.' : bullets === 1 ? 'One. Go on.' : `${bullets}. Now we\'re talking.`, 2.4);
    await c._gunSlide(seat);
    await c._gunPickUp();
    sound.play('cylinderSpin');
    c.hud.message(`${bullets} in the cylinder. You give it a spin.`, COLORS.paper, 2.4);
    c.look.shake = 0.012;
    await c.tweens.wait(0.9);
    await c._gunToHead();
    await c.tweens.wait(1.2 + Math.random() * 0.8);
    if (rouletteFires(bullets, Math.min(3, c.dayStats.drinks))) {
      c.dayStats.roulette.push({ bullets, won: false });
      await c._gunFire(`Russian roulette. ${bullets} of 6 chambers were loaded.`);
      return 'dead';
    }
    // *click*
    sound.play('dryFire');
    c.look.shake = 0.06;
    c.fp.tremble = 0;
    c.hud.message('*click*', COLORS.cream, 1.6);
    await c.tweens.wait(0.8);
    const win = rouletteWinnings(c.game.players[0].stack, bullets);
    c.game.players[0].stack += win;
    c.stacks[0].setValue(c.game.players[0].stack);
    c.dayStats.roulette.push({ bullets, won: true, win });
    c.respect += 3 * bullets;
    sound.play('chipStack');
    c.hud.message(`You live. The Don pushes ${money(win)} across the table.`, COLORS.lampGlow, 3.5);
    c.hud.say(seat, pick(['Ha! Lucky. Very lucky.', 'You\'ve got guts. Take your money.', 'Well, well. Fortune likes you tonight.']), 3);
    await c._gunPutDown();
    await c.tweens.wait(0.6);
    this._end();
    return 'survived';
  }

  // ---------------- the cigar ----------------

  _ensureCigarRig() {
    if (this.cigarRig) return this.cigarRig;
    const rig = makeAshtray();
    rig.root.visible = false;
    this.c.room.scene.add(rig.root);
    this.cigarRig = rig;
    return rig;
  }

  async offerCigar() {
    const c = this.c;
    this._begin();
    const seat = this._seatOf(Math.random() < 0.5 ? 3 : 2);
    const head = c.room.headPosition(seat);
    this._lookAtPoint(head, -0.16);
    c.room.characters[seat]?.lookAt(c.playerEye);
    c.hud.say(seat, seat === 2 ? 'A cigar. Cuban. A gift from the family.' : 'Cigar? Fell off a truck. Don\'t ask.', 3);
    await c.tweens.wait(1.1);
    const take = await c.hud.choose({
      title: `${c.cast[seat].label} offers you a cigar`,
      options: [
        { label: 'Take it', value: true, accent: COLORS.amber },
        { label: 'No thanks', value: false },
      ],
      cancel: false,
    });
    if (!take) {
      c.hud.say(seat, pick(['Your loss.', 'More for me, then.', 'Hmph. Suit yourself.']), 2.4);
      if (seat === 2) c.respect -= 2;
      await c.tweens.wait(1.3);
      this._end();
      return;
    }
    const rig = this._ensureCigarRig();
    const from = c.room.headPosition(seat).setY(TABLE_HEIGHT);
    from.lerp(V(0, TABLE_HEIGHT, 0), 0.45);
    rig.root.position.copy(from);
    rig.root.visible = true;
    rig.cigar.position.copy(rig.cigar.userData.rest.pos);
    rig.cigar.rotation.copy(rig.cigar.userData.rest.rot);
    this._lookAtPoint(ASHTRAY_SPOT, 0.12);
    sound.play('slide');
    await c.tweens.add({ duration: 0.8, easing: ease.outCubic, update: (t) => rig.root.position.lerpVectors(from, ASHTRAY_SPOT, t) });
    c.hud.say(seat, pick(['Enjoy.', 'Smoke up, kid.', 'Go on. It won\'t bite.']), 2);
    c.hud.message('[Q] to take a puff', COLORS.amber, 3);
    c.dayStats.cigars++;
    c.respect += seat === 2 ? 5 : 3;
    c.cigar = { puffs: 0, hands: 0, busy: false };
    await c.tweens.wait(0.8);
    this._end();
  }

  /** Q: bring the cigar up, draw on it, breathe the smoke out over the table. */
  async puff() {
    const c = this.c;
    const cig = c.cigar;
    const rig = this.cigarRig;
    if (!cig || cig.busy || !rig || c.cutscene || c.peeking || c.topView || c.look.blend > 0.05) return;
    cig.busy = true;
    const cigar = rig.cigar;
    const cam = c.camera;
    const fwd = cam.getWorldDirection(V(0, 0, 0));
    const right = V(1, 0, 0).applyQuaternion(cam.quaternion);
    const down = V(0, -1, 0).applyQuaternion(cam.quaternion);
    const mouthW = cam.getWorldPosition(V(0, 0, 0)).addScaledVector(fwd, 0.11).addScaledVector(down, 0.1).addScaledVector(right, 0.03);
    const restPos = cigar.userData.rest.pos.clone();
    const restQ = new THREE.Quaternion().setFromEuler(cigar.userData.rest.rot);
    const mouthL = rig.root.worldToLocal(mouthW.clone());
    const aim = new THREE.Object3D();
    rig.root.add(aim);
    aim.position.copy(mouthL);
    aim.lookAt(mouthW.clone().addScaledVector(fwd, 1).addScaledVector(right, 0.4).addScaledVector(down, -0.1));
    const mouthQ = aim.quaternion.clone();
    rig.root.remove(aim);
    await c.tweens.add({
      duration: 0.5, easing: ease.inOutQuad,
      update: (t) => { cigar.position.lerpVectors(restPos, mouthL, t); cigar.position.y += Math.sin(Math.PI * t) * 0.05; cigar.quaternion.copy(restQ).slerp(mouthQ, t); },
    });
    sound.play('puff');
    await c.tweens.add({ duration: 1.0, update: (t) => { rig.ember.glow = t; } });
    await c.tweens.add({
      duration: 0.5, easing: ease.inOutQuad,
      update: (t) => { cigar.position.lerpVectors(mouthL, restPos, t); cigar.position.y += Math.sin(Math.PI * t) * 0.05; cigar.quaternion.copy(mouthQ).slerp(restQ, t); rig.ember.glow = 1 - t; },
    });
    // breathe it out across the felt
    const out = cam.getWorldPosition(V(0, 0, 0)).addScaledVector(fwd, 0.12).addScaledVector(down, 0.06);
    c.room.smoke.puff(out, { dir: fwd.clone().multiplyScalar(0.28).add(V(0, 0.04, 0)), count: 9, size: 0.06, grow: 0.45, life: 3.4, opacity: 0.3, spread: 0.07, tone: 0.45 });
    c.haze = Math.min(1, c.haze + 0.35);
    cig.puffs++;
    cig.busy = false;
    if (cig.puffs >= 7) this.burnOut();
  }

  burnOut() {
    const c = this.c;
    if (!c.cigar) return;
    c.cigar = null;
    if (this.cigarRig) this.cigarRig.root.visible = false;
    c.hud.message('Your cigar burns down to nothing.', COLORS.smoke, 2.5);
  }

  clear() {
    this.c.cigar = null;
    if (this.cigarRig) this.cigarRig.root.visible = false;
    if (this.bartender) this.bartender.root.visible = false;
  }

  update(dt) {
    const rig = this.cigarRig;
    if (rig?.root.visible) {
      rig.ember.update(dt);
      rig.wisp = (rig.wisp ?? 0) - dt;
      if (rig.wisp <= 0) {
        rig.wisp = 0.35 + Math.random() * 0.4;
        this.c.room.smoke.puff(rig.ember.worldPos(), { count: 1, size: 0.012, grow: 0.06, life: 2.6, opacity: 0.2, dir: V(0, 0.07, 0) });
      }
    }
  }
}
