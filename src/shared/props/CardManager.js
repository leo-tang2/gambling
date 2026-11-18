import * as THREE from 'three';
import { COLORS } from '../render/palette.js';
import { paintTexture } from '../render/textures.js';
import { ease } from '../anim/Tweens.js';
import { sound } from '../audio/Sound.js';

const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RED = [false, true, true, false]; // suits: clubs, diamonds, hearts, spades

/** Fill one suit symbol centred on (cx, cy), `s` pixels tall. */
export function drawSuit(ctx, suit, cx, cy, s) {
  const circle = (x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); };
  ctx.beginPath();
  if (suit === 1) { // diamond
    ctx.moveTo(cx, cy - s / 2); ctx.lineTo(cx + s * 0.38, cy); ctx.lineTo(cx, cy + s / 2); ctx.lineTo(cx - s * 0.38, cy);
    ctx.closePath();
  } else if (suit === 2) { // heart
    circle(cx - s * 0.235, cy - s * 0.17, s * 0.26);
    circle(cx + s * 0.235, cy - s * 0.17, s * 0.26);
    ctx.moveTo(cx - s * 0.48, cy - s * 0.08); ctx.lineTo(cx + s * 0.48, cy - s * 0.08); ctx.lineTo(cx, cy + s * 0.48);
    ctx.closePath();
  } else if (suit === 3) { // spade
    circle(cx - s * 0.235, cy + s * 0.08, s * 0.25);
    circle(cx + s * 0.235, cy + s * 0.08, s * 0.25);
    ctx.moveTo(cx - s * 0.47, cy + s * 0.0); ctx.lineTo(cx + s * 0.47, cy + s * 0.0); ctx.lineTo(cx, cy - s * 0.48);
    ctx.closePath();
    ctx.moveTo(cx, cy + s * 0.1); ctx.lineTo(cx + s * 0.17, cy + s * 0.5); ctx.lineTo(cx - s * 0.17, cy + s * 0.5);
    ctx.closePath();
  } else { // club
    circle(cx, cy - s * 0.24, s * 0.22);
    circle(cx - s * 0.25, cy + s * 0.07, s * 0.22);
    circle(cx + s * 0.25, cy + s * 0.07, s * 0.22);
    circle(cx, cy + s * 0.02, s * 0.12);
    ctx.moveTo(cx, cy + s * 0.05); ctx.lineTo(cx + s * 0.16, cy + s * 0.5); ctx.lineTo(cx - s * 0.16, cy + s * 0.5);
    ctx.closePath();
  }
  ctx.fill();
}

// where the pips go on number cards: [x, y] as fractions of the card (L/C/R columns)
const L = 0.38, C = 0.5, R = 0.62;
const PIPS = {
  2: [[C, 0.24], [C, 0.76]],
  3: [[C, 0.24], [C, 0.5], [C, 0.76]],
  4: [[L, 0.24], [R, 0.24], [L, 0.76], [R, 0.76]],
  5: [[L, 0.24], [R, 0.24], [C, 0.5], [L, 0.76], [R, 0.76]],
  6: [[L, 0.24], [R, 0.24], [L, 0.5], [R, 0.5], [L, 0.76], [R, 0.76]],
  7: [[L, 0.24], [R, 0.24], [C, 0.37], [L, 0.5], [R, 0.5], [L, 0.76], [R, 0.76]],
  8: [[L, 0.24], [R, 0.24], [C, 0.37], [L, 0.5], [R, 0.5], [C, 0.63], [L, 0.76], [R, 0.76]],
  9: [[L, 0.22], [R, 0.22], [L, 0.407], [R, 0.407], [C, 0.5], [L, 0.593], [R, 0.593], [L, 0.78], [R, 0.78]],
  10: [[L, 0.22], [R, 0.22], [C, 0.315], [L, 0.407], [R, 0.407], [L, 0.593], [R, 0.593], [C, 0.685], [L, 0.78], [R, 0.78]],
};

/** How many pips (and where) a card shows: exported so tests can check it matches the rank. */
export function pipLayout(card) {
  const n = (card % 13) + 2;
  return PIPS[n] ?? [];
}

/**
 * A 160x224 card face: big corner indices (rank over suit, top-left and bottom-right, both
 * upright so a peeked corner reads), the right number of pips for 2-10, a framed letter for
 * J/Q/K and one big pip for the ace. Smooth-filtered so it stays readable when small.
 */
export function cardFaceTexture(card) {
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const tex = paintTexture(160, 224, (ctx, w, h) => {
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.bone;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    // deep red: under the warm lamp a lighter red drifts toward orange
    const col = RED[suit] ? COLORS.red : COLORS.ink;
    const label = RANK_LABEL[rank];
    ctx.fillStyle = col;
    ctx.textBaseline = 'top';
    const index = (x, y, align) => {
      ctx.save();
      ctx.font = 'bold 58px Georgia, "Times New Roman", serif';
      ctx.textAlign = align;
      const squeeze = label.length > 1 ? 0.7 : 1;
      ctx.translate(x, y);
      ctx.scale(squeeze, 1);
      // filled and outlined in the same colour: thick strokes survive being small on screen
      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.strokeText(label, 0, 0);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    };
    index(27, 6, 'center');
    drawSuit(ctx, suit, 27, 84, 36);
    index(w - 27, h - 106, 'center');
    drawSuit(ctx, suit, w - 27, h - 24, 36);
    if (rank <= 8) {
      for (const [x, y] of PIPS[rank + 2]) drawSuit(ctx, suit, x * w, y * h, 27);
    } else if (rank === 12) {
      drawSuit(ctx, suit, w / 2, h / 2, 84);
    } else {
      // J, Q, K: a gold frame with the letter and its suit
      const fx = 48, fy = 40, fw = w - 96, fh = h - 80;
      ctx.fillStyle = COLORS.cream;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 5;
      ctx.strokeRect(fx, fy, fw, fh);
      ctx.strokeStyle = COLORS.amberDark;
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 6, fy + 6, fw - 12, fh - 12);
      ctx.fillStyle = col;
      ctx.font = 'bold 66px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, h / 2 - 50);
      drawSuit(ctx, suit, w / 2, h / 2 + 40, 34);
    }
  });
  tex.flipY = false; // match the glTF UV convention of the card mesh
  // smooth, mipmapped: the faces are small on screen and must stay legible
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Physical cards: the card mesh from props.glb with a per-card face texture.
 * Cards lie flat with their face up when `faceUp` (rotation about their long axis flips them).
 */
export class CardManager {
  constructor({ scene, template, tweens }) {
    this.scene = scene;
    this.tweens = tweens;
    this.template = template; // Object3D whose meshes use materials named CardFront / CardBack
    this.faceMats = new Map();
    this.cards = new Set();
    template.traverse((o) => {
      if (o.isMesh && o.material.name === 'CardFront') this.frontTemplate = o.material;
    });
  }

  faceMaterial(card) {
    if (!this.faceMats.has(card)) {
      const m = this.frontTemplate.clone();
      m.map = cardFaceTexture(card);
      m.color = new THREE.Color(0xffffff);
      // a faint self-glow keeps faces readable in the dark room
      m.emissiveMap = m.map;
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 0.22;
      this.faceMats.set(card, m);
    }
    return this.faceMats.get(card);
  }

  /**
   * Create a card object (value may be null for an unknown face-down card).
   * flipAxis 'z' turns it over sideways; 'x' end-over-end (used for your own cards so a
   * peeked corner reads the right way up).
   */
  create(value, pos, { flipAxis = 'z' } = {}) {
    const obj = this.template.clone(true);
    obj.position.copy(pos);
    obj.userData.value = value;
    obj.userData.faceUp = false;
    // inner pivot so we can flip without fighting the yaw
    const flip = new THREE.Group();
    flip.name = 'flip';
    while (obj.children.length) flip.add(obj.children[0]);
    obj.add(flip);
    obj.userData.flipAxis = flipAxis;
    flip.rotation[flipAxis] = Math.PI; // start face down
    this.setValue(obj, value);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(obj);
    this.cards.add(obj);
    return obj;
  }

  setValue(obj, value) {
    obj.userData.value = value;
    obj.traverse((o) => {
      if (o.isMesh && (o.material.name === 'CardFront' || o.userData.isFront)) {
        o.userData.isFront = true;
        o.material = value == null ? this.frontTemplate : this.faceMaterial(value);
      }
    });
  }

  remove(obj) {
    this.scene.remove(obj);
    this.cards.delete(obj);
  }

  clear() {
    for (const c of [...this.cards]) this.remove(c);
  }

  /** Slide/fly a card to a position and yaw, spinning a little on the way. */
  async deal(obj, to, { yaw = 0, duration = 0.32, lift = 0.07, delay = 0, tilt = 0 } = {}) {
    const from = obj.position.clone();
    const yaw0 = obj.rotation.y;
    const spin = (Math.random() - 0.5) * 1.5;
    await this.tweens.add({
      delay, duration, easing: ease.outBack, // slides in, a hair past, and settles
      update: (t) => {
        obj.position.lerpVectors(from, to, t);
        obj.position.y += Math.sin(Math.PI * t) * lift;
        obj.rotation.y = yaw0 + (yaw - yaw0) * t + spin * (1 - t) * t;
        obj.rotation.x = tilt * t;
        if (t >= 1) { obj.position.copy(to); obj.rotation.y = yaw; }
      },
    });
    sound.play('cardDeal');
  }

  /** Flip a card over (face up or down) with a little hop. */
  async flip(obj, faceUp = true, { duration = 0.34, delay = 0 } = {}) {
    const flipNode = obj.getObjectByName('flip');
    const axis = obj.userData.flipAxis ?? 'z';
    const start = flipNode.rotation[axis];
    const end = faceUp ? 0 : Math.PI;
    const y0 = obj.position.y;
    await this.tweens.add({
      delay, duration, easing: ease.anticipate, // a little wind-up, then a snap over
      update: (t) => {
        flipNode.rotation[axis] = start + (end - start) * t;
        obj.position.y = y0 + Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 0.04;
      },
    });
    obj.position.y = y0;
    obj.userData.faceUp = faceUp;
    sound.play('cardFlip');
  }
}
