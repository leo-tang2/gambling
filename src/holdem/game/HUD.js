import * as THREE from 'three';
import { COLORS } from '../../shared/render/palette.js';
import { wrapText, LINE_H } from '../../shared/ui/font.js';
import { evaluate, describeScore } from '../engine/evaluator.js';
import { RANKS } from '../engine/cards.js';
import { drawOverview } from './Overview.js';

const SUIT_GLYPH = ['♣', '♦', '♥', '♠'];
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const cardLabel = (c) => `${RANKS[c % 13] === 'T' ? '10' : RANKS[c % 13]}${SUIT_GLYPH[Math.floor(c / 13)]}`;

/** Everything drawn on the pixel UI layer: menu, table HUD, raise box, offers, end screens. */
export class HUD {
  constructor({ ui, camera, controller }) {
    this.ui = ui;
    this.camera = camera;
    this.c = controller;
    this.plates = [0, 1, 2, 3].map(() => ({ status: '', statusColor: COLORS.bone, speech: null, speechT: 0 }));
    this.messages = [];
    this.prompt = null;
    this.raiseInput = null; // { text, fresh, error }
    this.choice = null; // { title, text, options, resolve, cancel }
    this.time = 0;
    window.addEventListener('keydown', (e) => this._key(e));
  }

  reset() {
    for (const p of this.plates) { p.status = ''; p.speech = null; }
    this.messages = [];
    this.prompt = null;
    this.raiseInput = null;
    this.choice = null;
  }

  say(seat, text, seconds = 2.8) {
    const p = this.plates[seat];
    p.speech = text;
    p.speechT = seconds;
  }

  setStatus(seat, text, color = COLORS.bone) {
    this.plates[seat].status = text;
    this.plates[seat].statusColor = color;
  }

  message(text, color = COLORS.paper, seconds = 3.5) {
    this.messages.push({ text, color, t: seconds });
    if (this.messages.length > 3) this.messages.shift();
  }

  // ---------------- human input ----------------

  requestAction(legal) {
    this.raiseInput = null;
    this.c.clearChipSelection();
    return new Promise((resolve) => { this.prompt = { legal, resolve }; });
  }

  /**
   * A small numbered menu in the middle of the screen (offers, confirmations).
   * options: [{ label, value, accent, note }]; press the option's number or click it.
   * Resolves with the chosen value (or `cancel` on Esc, if given).
   */
  choose({ title, text, options, cancel }) {
    return new Promise((resolve) => { this.choice = { title, text, options, cancel, resolve }; });
  }

  _pick(value) {
    const ch = this.choice;
    if (!ch) return;
    this.choice = null;
    ch.resolve(value);
  }

  _resolve(action) {
    if (!this.prompt || !action) return;
    const r = this.prompt.resolve;
    this.prompt = null;
    this.raiseInput = null;
    r(action);
  }

  openRaise(amount) {
    const l = this.prompt?.legal;
    if (!l?.canRaise) return;
    this.c.clearChipSelection();
    this.raiseInput = { text: String(amount ?? l.minRaiseTo), fresh: true, error: 0 };
  }

  /** Validate the typed amount ("raise to" total). */
  _raiseCheck() {
    const l = this.prompt.legal;
    const v = parseInt(this.raiseInput.text || '0', 10);
    if (!v) return { ok: false, msg: 'Type an amount' };
    if (v >= l.maxRaiseTo) return { ok: true, value: l.maxRaiseTo, action: { type: 'allin' }, label: `All in ${money(l.stack)}` };
    if (v < l.minRaiseTo) return { ok: false, msg: `Minimum is ${money(l.minRaiseTo)}` };
    return { ok: true, value: v, action: { type: l.isBet ? 'bet' : 'raise', amount: v }, label: `${l.isBet ? 'Bet' : 'Raise to'} ${money(v)}` };
  }

  _confirmRaise() {
    const r = this._raiseCheck();
    if (r.ok) this._resolve(r.action);
    else this.raiseInput.error = 1.2;
  }

  _key(e) {
    const k = e.key;
    // offers and confirmations take the number keys first
    if (this.choice) {
      const n = parseInt(k, 10);
      if (n >= 1 && n <= this.choice.options.length) { e.preventDefault(); this._pick(this.choice.options[n - 1].value); }
      else if (k === 'Escape' && this.choice.cancel !== undefined) this._pick(this.choice.cancel);
      return;
    }
    if (this.c.phase === 'over' && k === 'Enter') { this.c.cashOut('win'); return; }
    if (this.c.phase === 'overview' && k === 'Enter' && this.c.overview?.t > 1.6) { this.c.toBar(); return; }
    if (this.c.phase === 'bar' && k === 'Enter') { this.c.nextDay(); return; }
    if (!this.prompt || this.c.phase !== 'playing' || this.c.cutscene) return;
    if (this.raiseInput) {
      const ri = this.raiseInput;
      if (/^[0-9]$/.test(k)) {
        ri.text = ri.fresh ? k : (ri.text + k).slice(0, 7);
        ri.fresh = false;
      } else if (k === 'Backspace') { ri.text = ri.fresh ? '' : ri.text.slice(0, -1); ri.fresh = false; }
      else if (k === 'Enter') this._confirmRaise();
      else if (k === 'Escape') this.raiseInput = null;
      else return;
      e.preventDefault();
      return;
    }
    const l = this.prompt.legal;
    const lk = k.toLowerCase();
    if (k === '1' || lk === 'f') this._resolve({ type: 'fold' });
    else if (k === '2' || lk === 'c') this._resolve(l.canCheck ? { type: 'check' } : { type: 'call' });
    else if (k === '3' || lk === 'r') { e.preventDefault(); this.openRaise(); }
    else if (k === '4' || lk === 'a') this._resolve({ type: 'allin' });
    else if (k === '5') this.c.requestCashOut();
    else if ((k === 'Enter' || k === ' ') && this.c.selectedValue() > 0) {
      e.preventDefault();
      this._resolve(this._chipAction().action);
    } else if (k === 'Escape') this.c.clearChipSelection();
  }

  onChipsSelected() { this.raiseInput = null; }

  /** What throwing the currently selected chips would do. */
  _chipAction() {
    const l = this.prompt.legal;
    const v = this.c.selectedValue();
    if (v >= l.stack) return { label: `All in ${money(l.stack)}`, action: { type: 'allin' } };
    if (v < l.toCall) return { label: `Need ${money(l.toCall)}`, action: null };
    if (v === l.toCall) return { label: l.toCall ? `Call ${money(v)}` : 'Check', action: { type: l.toCall ? 'call' : 'check' } };
    const to = l.playerBet + v;
    if (!l.canRaise) return { label: `Call ${money(l.toCall)}`, action: { type: 'call' } };
    if (to < l.minRaiseTo) return { label: `Min ${money(l.minRaiseTo)}`, action: null };
    return { label: `${l.isBet ? 'Bet' : 'Raise to'} ${money(to)}`, action: { type: l.isBet ? 'bet' : 'raise', amount: to } };
  }

  // ---------------- drawing ----------------

  toScreen(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return null;
    return { x: Math.round((p.x + 1) / 2 * this.ui.w), y: Math.round((1 - p.y) / 2 * this.ui.h) };
  }

  draw(dt) {
    this.time += dt;
    const ph = this.c.phase;
    if (ph === 'menu') return this._drawMenu();
    if (ph === 'gameover') return this._drawGameOver();
    if (ph === 'overview') {
      this.c.overview.t += dt;
      return drawOverview(this.ui, this.c.overview, this.time, () => this.c.toBar());
    }
    if (ph === 'bar') return this.c.bar.draw(this.c.run, dt, this.time);
    if (!this.c.game || ph === 'black') return;

    for (const p of this.plates) if (p.speech && (p.speechT -= dt) <= 0) p.speech = null;
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter((m) => m.t > 0);
    if (this.raiseInput?.error > 0) this.raiseInput.error -= dt;
    if (this.c.cutscene) {
      this._drawSpeech();
      this._drawMessages();
      if (this.choice) this._drawChoice();
      return;
    }

    const ui = this.ui;
    const head = `Night ${this.c.run.day}`;
    const hand = `Hand ${this.c.shown.hand}`;
    ui.ditherRect(4, 4, ui.textWidth(head) + ui.textWidth(hand) + 22, 12, COLORS.black, 0.75);
    ui.text(head, 8, 7, COLORS.gold);
    ui.text(hand, 16 + ui.textWidth(head), 7, COLORS.bone);
    const hint = this.c.topView ? '[V] Back to your seat' : '[V] Look down at the table';
    ui.text(hint, 8, 19, COLORS.smoke);
    if (this.c.cigar) ui.text(this.c.cigar.busy ? 'Puffing...' : `[Q] Puff on your cigar`, 8, 29, COLORS.amber);

    this._drawPot();
    this._drawSpeech();
    this._drawMessages();
    if (ph === 'over') return this._drawWin();
    this._drawBottom();
    this._drawTable();
    if (this.choice) this._drawChoice();
  }

  _drawPot() {
    const pot = this.c.potValue();
    if (pot <= 0 || (this.c.look.blend > 0.5 && !this.c.topView)) return;
    const s = this.toScreen(new THREE.Vector3(this.c.potSpot.x, this.c.potSpot.y + 0.08, this.c.potSpot.z));
    if (!s) return;
    const label = `Pot ${money(pot)}`;
    const w = this.ui.textWidth(label) + 8;
    this.ui.rect(s.x - w / 2, s.y - 5, w, 11, COLORS.black);
    this.ui.textCentered(label, s.x, s.y - 2, COLORS.gold);
  }

  /** Speech still comes from the person's head; everything else is in the table list. */
  _drawSpeech() {
    if (this.c.look.blend > 0.5 && !this.c.cutscene && !this.c.topView) return;
    for (let seat = 1; seat < 4; seat++) {
      const sp = this.plates[seat].speech;
      if (!sp) continue;
      const s = this.toScreen(this.c.room.headPosition(seat).add(new THREE.Vector3(0, 0.2, 0)));
      if (!s) continue;
      this._bubble(sp, s.x, Math.max(40, s.y), this.c.cast[seat].color);
    }
    const ex = this.c.extraSpeech; // the bartender, during his visit
    if (ex?.text) {
      const s = this.toScreen(ex.pos);
      if (s) this._bubble(ex.text, s.x, Math.max(40, s.y), COLORS.cream);
    }
  }

  /** Bottom-right, above your hand: everyone at the table, their money and what they just did. */
  _drawTable() {
    const ui = this.ui;
    const sh = this.c.shown;
    const barH = this.prompt ? 36 : 18;
    const rows = [0, 1, 2, 3].map((seat) => {
      const info = this.c.cast[seat];
      const out = sh.out[seat];
      const folded = !out && sh.folded[seat];
      let status = out ? 'Out' : this.plates[seat].status;
      let sc = out ? COLORS.smoke : this.plates[seat].statusColor;
      const acting = sh.actor === seat && this.c.phase === 'playing';
      if (acting && this.c.thinking === seat) { status = `thinking${'.'.repeat(1 + (Math.floor(this.time * 3) % 3))}`; sc = COLORS.bone; }
      else if (acting && seat === 0 && this.prompt) { status = 'your move'; sc = COLORS.lampGlow; }
      return {
        seat, acting, out, folded,
        name: seat === 0 ? 'You' : info.label,
        nameColor: out || folded ? COLORS.smoke : info.color,
        money: out ? '-' : money(this.c.stacks[seat].value),
        status, sc,
      };
    });
    const nameW = 44, moneyW = 50;
    const statusW = Math.max(56, ...rows.map((r) => ui.textWidth(r.status)));
    const w = 8 + nameW + moneyW + 8 + statusW + 6;
    const rowH = 10;
    const h = rows.length * rowH + 7;
    const x = ui.w - w - 3;
    const y = ui.h - barH - h - 3;
    ui.ditherRect(x, y, w, h, COLORS.black, 0.88);
    ui.rect(x, y, w, 1, COLORS.amberDark);
    ui.rect(x, y + h - 1, w, 1, COLORS.woodDark);
    ui.rect(x, y, 1, h, COLORS.woodDark);
    ui.rect(x + w - 1, y, 1, h, COLORS.woodDark);
    rows.forEach((r, i) => {
      const ry = y + 4 + i * rowH;
      if (r.acting) {
        ui.ditherRect(x + 1, ry - 2, w - 2, rowH, COLORS.amberDark, 0.25);
        if (Math.floor(this.time * 3) % 2 === 0) ui.text('▶', x + 2, ry, COLORS.gold);
      }
      ui.text(r.name, x + 8, ry, r.nameColor);
      if (sh.button === r.seat && !r.out) {
        const dx = x + 8 + ui.textWidth(r.name) + 3;
        ui.rect(dx, ry - 1, 7, 8, COLORS.cream);
        ui.text('D', dx + 1, ry, COLORS.ink);
      }
      const mw = ui.textWidth(r.money);
      ui.text(r.money, x + 8 + nameW + moneyW - mw, ry, r.out ? COLORS.smoke : r.seat === 0 ? COLORS.gold : COLORS.paper);
      if (r.status) ui.text(r.status, x + 8 + nameW + moneyW + 8, ry, r.sc);
    });
  }

  _bubble(text, cx, bottom, color) {
    const ui = this.ui;
    const lines = wrapText(text, 130);
    const w = Math.max(...lines.map((l) => ui.textWidth(l))) + 10;
    const h = lines.length * LINE_H + 4;
    const x = Math.round(Math.max(2, Math.min(ui.w - w - 2, cx - w / 2)));
    const y = Math.round(Math.max(30, bottom - h - 4));
    ui.rect(x, y, w, h, color);
    ui.rect(x + 1, y + 1, w - 2, h - 2, COLORS.white);
    const tx = Math.round(Math.max(x + 3, Math.min(x + w - 6, cx)));
    ui.rect(tx, y + h, 3, 1, color);
    ui.rect(tx + 1, y + h + 1, 1, 2, color);
    lines.forEach((l, i) => ui.text(l, x + 5, y + 4 + i * LINE_H, COLORS.ink));
  }

  _drawMessages() {
    const ui = this.ui;
    const base = ui.h - (this.prompt ? 36 : 18) - 66 - (this.raiseInput ? 20 : 0);
    const cx = Math.round((ui.w - 190) / 2);
    [...this.messages].reverse().forEach((m, i) => {
      const w = ui.textWidth(m.text) + 12;
      const y = base - i * 13;
      ui.ditherRect(Math.round(cx - w / 2), y, w, 12, COLORS.black, 0.85);
      ui.textCentered(m.text, cx, y + 3, m.color);
    });
  }

  _drawBottom() {
    const ui = this.ui;
    const sh = this.c.shown;
    const P = this.prompt;
    const barH = P ? 36 : 18;
    const y0 = ui.h - barH;
    ui.ditherRect(0, y0, ui.w, barH, COLORS.black, 0.9);
    ui.rect(0, y0, ui.w, 1, COLORS.amberDark);

    let x = 6;
    x += ui.text('You', x, y0 + 6, COLORS.cream) + 6;
    x += ui.text(money(this.c.stacks[0].value), x, y0 + 6, COLORS.gold) + 10;
    if (sh.bets[0] > 0) ui.text(`in ${money(sh.bets[0])}`, x, y0 + 6, COLORS.bone);

    // right side: what you know about your hand
    if (sh.hole.length === 2 && !sh.out[0]) {
      let rx = ui.w - 6;
      const rt = (t, c) => { rx -= ui.textWidth(t); ui.text(t, rx, y0 + 6, c); rx -= 8; };
      if (sh.folded[0]) rt('Folded', COLORS.smoke);
      else if (!this.c.peeked && !this.c.topView) rt('[E] Look at your cards', Math.floor(this.time * 2) % 2 ? COLORS.gold : COLORS.lampGlow);
      else {
        if (this.c.peeking) rt('[E] Put them down', COLORS.bone);
        const hand = this._handText(sh.hole, sh.board);
        if (hand) rt(hand, COLORS.paper);
        for (const c of [...sh.hole].reverse()) {
          const lab = cardLabel(c);
          const w = ui.textWidth(lab);
          rx -= w + 2;
          ui.rect(rx - 2, y0 + 3, w + 4, 12, COLORS.white);
          ui.text(lab, rx, y0 + 6, Math.floor(c / 13) % 3 === 0 ? COLORS.ink : COLORS.red);
          rx -= 6;
        }
      }
    }
    if (!P) return;

    const l = P.legal;
    const rowB = y0 + 18;
    const btns = [];
    btns.push({ label: 'Fold', badge: 1, act: () => this._resolve({ type: 'fold' }), accent: COLORS.red });
    btns.push(l.canCheck
      ? { label: 'Check', badge: 2, act: () => this._resolve({ type: 'check' }) }
      : { label: `Call ${money(l.toCall)}`, badge: 2, act: () => this._resolve({ type: 'call' }) });
    if (l.canRaise) {
      btns.push(this.raiseInput
        ? { label: 'Confirm', act: () => this._confirmRaise(), accent: COLORS.gold, raise: true }
        : { label: l.isBet ? 'Bet...' : 'Raise...', badge: 3, act: () => this.openRaise(), raise: true });
    } else {
      btns.push({ label: l.isBet ? 'Bet...' : 'Raise...', badge: 3, act: () => {}, enabled: false });
    }
    btns.push({ label: `All in ${money(l.stack)}`, badge: 4, act: () => this._resolve({ type: 'allin' }), accent: COLORS.redLight });
    btns.push({ label: 'Cash out', badge: 5, act: () => this.c.requestCashOut(), accent: COLORS.sage });
    if (this.c.selectedValue() > 0) {
      const ca = this._chipAction();
      btns.push({ label: `Throw: ${ca.label}`, act: () => this._resolve(ca.action), accent: COLORS.gold, enabled: !!ca.action });
    }
    let bx = 6;
    let raiseX = ui.w / 2;
    for (const b of btns) {
      const w = ui.textWidth(b.label) + 20;
      if (bx + w > ui.w - 4) break;
      if (b.raise) raiseX = bx;
      if (ui.button(b.label, bx, rowB, w, 14, { accent: b.accent, enabled: b.enabled !== false && !this.choice, badge: b.badge })) b.act();
      bx += w + 4;
    }
    if (this.raiseInput) this._drawRaiseBox(l, raiseX, y0);
  }

  _drawRaiseBox(l, ax, y0) {
    const ui = this.ui;
    const ri = this.raiseInput;
    const w = 236;
    const h = 52;
    const x = Math.max(4, Math.min(ui.w - w - 4, ax - 10));
    const y = y0 - h - 4;
    ui.panel(x, y, w, h, { fill: COLORS.ink, border: COLORS.gold });
    ui.text(l.isBet ? 'Bet' : 'Raise to', x + 7, y + 8, COLORS.lampGlow);
    const bx = x + 58;
    ui.rect(bx, y + 4, 86, 14, ri.error > 0 ? COLORS.redLight : COLORS.amber);
    ui.rect(bx + 1, y + 5, 84, 12, COLORS.black);
    const shown = `$${ri.text}`;
    ui.text(shown, bx + 5, y + 8, ri.fresh ? COLORS.smoke : COLORS.white);
    if (Math.floor(this.time * 2.5) % 2 === 0) ui.rect(bx + 6 + ui.textWidth(shown), y + 7, 1, 8, COLORS.gold);
    ui.text(`max ${money(l.maxRaiseTo)}`, bx + 92, y + 8, COLORS.smoke);

    const pot = this.c.potValue();
    const presets = [
      ['Min', l.minRaiseTo],
      ['1/2 Pot', l.isBet ? pot / 2 : l.currentBet + (pot + l.toCall) / 2],
      ['Pot', l.isBet ? pot : l.currentBet + pot + l.toCall],
      ['All in', l.maxRaiseTo],
    ];
    let px = x + 7;
    for (const [label, amt] of presets) {
      const pw = ui.textWidth(label) + 10;
      if (ui.button(label, px, y + 22, pw, 12)) {
        const v = Math.max(l.minRaiseTo, Math.min(l.maxRaiseTo, Math.round(amt / 5) * 5));
        ri.text = String(v);
        ri.fresh = false;
      }
      px += pw + 3;
    }
    const check = this._raiseCheck();
    const msg = ri.error > 0 && !check.ok ? check.msg : 'Type an amount - Enter to confirm - Esc to cancel';
    ui.text(msg, x + 7, y + 40, ri.error > 0 && !check.ok ? COLORS.redLight : COLORS.smoke);
  }

  _drawChoice() {
    const ui = this.ui;
    const ch = this.choice;
    const textLines = ch.text ? wrapText(ch.text, 260) : [];
    const optW = Math.max(120, ...ch.options.map((o) => ui.textWidth(o.label) + 24 + (o.note ? ui.textWidth(o.note) + 10 : 0)));
    const w = Math.min(ui.w - 16, Math.max(optW + 20, ...textLines.map((l) => ui.textWidth(l) + 20), ch.title ? ui.textWidth(ch.title) + 20 : 0));
    const h = 10 + (ch.title ? 12 : 0) + textLines.length * LINE_H + 4 + ch.options.length * 17 + 6;
    const x = Math.round((ui.w - w) / 2);
    const y = Math.round(Math.max(30, ui.h - h - 26)); // low, so the person offering stays in view
    ui.panel(x, y, w, h, { fill: COLORS.ink, border: COLORS.gold });
    let cy = y + 8;
    if (ch.title) { ui.textCentered(ch.title, ui.w / 2, cy, COLORS.lampGlow); cy += 12; }
    for (const l of textLines) { ui.textCentered(l, ui.w / 2, cy, COLORS.paper); cy += LINE_H; }
    cy += 4;
    ch.options.forEach((o, i) => {
      const bx = x + 10, bw = w - 20;
      if (o.note) {
        // label on the left, details on the right
        if (ui.button('', bx, cy, bw, 14, { accent: o.accent ?? COLORS.amber, badge: i + 1 })) this._pick(o.value);
        const hot = ui.over(bx, cy, bw, 14);
        ui.text(o.label, bx + 10, cy + 4, hot ? COLORS.lampGlow : COLORS.paper);
        ui.text(o.note, bx + bw - 6 - ui.textWidth(o.note), cy + 4, hot ? COLORS.gold : COLORS.bone);
      } else if (ui.button(o.label, bx, cy, bw, 14, { accent: o.accent ?? COLORS.amber, badge: i + 1 })) this._pick(o.value);
      cy += 17;
    });
  }

  _handText(hole, board) {
    if (board.length < 3) {
      const [a, b] = hole;
      if (a % 13 === b % 13) return 'Pocket pair';
      return Math.floor(a / 13) === Math.floor(b / 13) ? 'Suited' : '';
    }
    return describeScore(evaluate([...hole, ...board]));
  }

  _drawMenu() {
    const ui = this.ui;
    ui.ditherRect(0, 0, ui.w, ui.h, COLORS.black, 0.4);
    const cy = Math.round(ui.h * 0.42);
    ui.textCentered("Back Room Hold'em", ui.w / 2, cy - 34, COLORS.lampGlow, { scale: 3, shadow: COLORS.bloodDark });
    ui.textCentered('Bar Gambling  -  Game 1', ui.w / 2, cy - 4, COLORS.bone);
    const saved = this.c.savedRun;
    if (saved) {
      const label = `Continue - night ${saved.day}`;
      const bw = ui.textWidth(label) + 24;
      if (ui.button(label, ui.w / 2 - bw / 2, cy + 14, bw, 17, { accent: COLORS.gold })) this.c.startFromMenu(true);
      const info = `Stake ${money(saved.stake)}  -  ${saved.items.length} thing${saved.items.length === 1 ? '' : 's'} in your bar`;
      ui.rect(ui.w / 2 - ui.textWidth(info) / 2 - 4, cy + 34, ui.textWidth(info) + 8, 10, COLORS.black);
      ui.textCentered(info, ui.w / 2, cy + 36, COLORS.bone);
      if (ui.button('New game', ui.w / 2 - 36, cy + 48, 72, 15)) this.c.startFromMenu(false);
    } else if (ui.button('Start', ui.w / 2 - 36, cy + 16, 72, 17, { accent: COLORS.gold })) this.c.startFromMenu(false);
    ui.textCentered('Play chips only. No real money.', ui.w / 2, ui.h - 16, COLORS.smoke);
  }

  _drawWin() {
    const ui = this.ui;
    const title = 'The back room is yours';
    const w = Math.min(ui.w - 8, ui.textWidth(title, 2) + 40);
    const h = 74;
    const x = Math.round((ui.w - w) / 2);
    const y = Math.round((ui.h - h) / 2);
    ui.panel(x, y, w, h, { fill: COLORS.ink, border: COLORS.gold });
    ui.textCentered(title, ui.w / 2, y + 9, COLORS.lampGlow, { scale: 2 });
    ui.textCentered('You took every chip on the table.', ui.w / 2, y + 28, COLORS.paper);
    ui.textCentered(`Hands played: ${this.c.shown.hand}`, ui.w / 2, y + 39, COLORS.bone);
    if (ui.button('Cash out', ui.w / 2 - 36, y + h - 22, 72, 15, { accent: COLORS.gold })) this.c.cashOut('win');
  }

  _drawGameOver() {
    const ui = this.ui;
    const go = this.c.gameOverState;
    if (!go || go.reveal <= 0) return;
    ui.textCentered('GAME OVER', ui.w / 2, Math.round(ui.h / 2 - 20), COLORS.paper, { scale: 4, reveal: go.reveal });
    if (go.ready) {
      ui.textCentered(go.reason ?? 'You ran out of chips.', ui.w / 2, Math.round(ui.h / 2 + 14), COLORS.bone, { reveal: Math.min(1, go.ready) });
      if (go.ready >= 1 && ui.button('Play again', ui.w / 2 - 36, Math.round(ui.h / 2 + 32), 72, 15, { accent: COLORS.redLight })) this.c.backToMenu();
    }
  }
}
