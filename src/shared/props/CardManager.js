import * as THREE from 'three';
import { COLORS } from '../render/palette.js';
import { paintTexture } from '../render/textures.js';
import { drawText, textWidth } from '../ui/font.js';
import { ease } from '../anim/Tweens.js';
import { sound } from '../audio/Sound.js';

const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_GLYPH = ['♣', '♦', '♥', '♠']; // c d h s
const RED = [false, true, true, false];

/** 40×56 pixel card face painted with the bitmap font (ranks at double size). */
export function cardFaceTexture(card) {
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const tex = paintTexture(40, 56, (ctx, w, h) => {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
    const col = RED[suit] ? COLORS.red : COLORS.ink;
    const label = RANK_LABEL[rank];
    // corner indices top-left and bottom-right, so a peeked corner always shows one
    drawText(ctx, label, 3, 3, col, { scale: 2 });
    drawText(ctx, SUIT_GLYPH[suit], 3, 18, col, { scale: 2 });
    const lw = textWidth(label, 2);
    drawText(ctx, label, w - 3 - lw, h - 15, col, { scale: 2 });
    drawText(ctx, SUIT_GLYPH[suit], w - 13, h - 29, col, { scale: 2 });
    // big pip in the middle
    drawText(ctx, SUIT_GLYPH[suit], 15, 22, col, { scale: 2 });
    if (rank >= 9 && rank <= 11) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(13, 19, 14, 1); ctx.fillRect(13, 36, 14, 1);
      ctx.fillRect(13, 19, 1, 18); ctx.fillRect(26, 19, 1, 18);
    }
  });
  tex.flipY = false; // match the glTF UV convention of the card mesh
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
      delay, duration, easing: ease.outCubic,
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
  async flip(obj, faceUp = true, { duration = 0.28, delay = 0 } = {}) {
    const flipNode = obj.getObjectByName('flip');
    const axis = obj.userData.flipAxis ?? 'z';
    const start = flipNode.rotation[axis];
    const end = faceUp ? 0 : Math.PI;
    const y0 = obj.position.y;
    await this.tweens.add({
      delay, duration, easing: ease.inOutQuad,
      update: (t) => {
        flipNode.rotation[axis] = start + (end - start) * t;
        obj.position.y = y0 + Math.sin(Math.PI * t) * 0.04;
      },
    });
    obj.position.y = y0;
    obj.userData.faceUp = faceUp;
    sound.play('cardFlip');
  }
}
