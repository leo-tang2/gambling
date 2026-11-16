import { COLORS } from '../render/palette.js';
import { wrapText, LINE_H } from './font.js';
import { sound } from '../audio/Sound.js';

/**
 * Pixel dialogue box with typewriter text. Click / Space / Enter advances (or completes the
 * current line), Esc skips the whole sequence.
 */
export class DialogueBox {
  constructor(ui, { charsPerSecond = 45 } = {}) {
    this.ui = ui;
    this.cps = charsPerSecond;
    this.lines = [];
    this.index = 0;
    this.shown = 0;
    this.active = false;
    this.blink = 0;
    this._resolve = null;
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.advance(); }
      if (e.code === 'Escape') this.skip();
    });
  }

  /** lines: [{ speaker, text, color? }]. Resolves when finished or skipped. */
  play(lines) {
    this.lines = lines;
    this.index = 0;
    this.shown = 0;
    this.active = true;
    return new Promise((r) => { this._resolve = r; });
  }

  get current() { return this.lines[this.index]; }

  advance() {
    if (!this.active) return;
    const line = this.current;
    if (this.shown < line.text.length) { this.shown = line.text.length; return; }
    this.index++;
    this.shown = 0;
    if (this.index >= this.lines.length) this._finish();
  }

  skip() { if (this.active) this._finish(); }

  _finish() {
    this.active = false;
    this._resolve?.();
    this._resolve = null;
  }

  /** Draw and handle clicks. Call once per frame between ui.begin() and ui.end(). */
  draw(dt) {
    if (!this.active) return;
    const ui = this.ui;
    const line = this.current;
    const before = Math.floor(this.shown);
    this.shown = Math.min(line.text.length, this.shown + dt * this.cps);
    if (Math.floor(this.shown) > before && line.text[before] !== ' ') sound.play('typewriter');
    this.blink += dt;

    const w = Math.min(ui.w - 16, 360);
    const x = Math.floor((ui.w - w) / 2);
    const lines = wrapText(line.text, w - 16);
    const h = 22 + lines.length * LINE_H + 8;
    const y = ui.h - h - 8;

    // dim the scene a little behind the box so text pops
    ui.panel(x, y, w, h, { fill: COLORS.ink, border: COLORS.amber });
    // speaker tag
    const name = line.speaker.toUpperCase();
    const tw = ui.textWidth(name) + 8;
    ui.rect(x + 6, y - 6, tw, 11, COLORS.amber);
    ui.rect(x + 7, y - 5, tw - 2, 9, COLORS.woodDark);
    ui.text(name, x + 10, y - 4, line.color ?? COLORS.gold);

    let remaining = Math.floor(this.shown);
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, remaining));
      remaining -= l.length + 1;
      ui.text(part, x + 8, y + 12 + i * LINE_H, COLORS.paper);
    });
    const done = this.shown >= line.text.length;
    if (done && Math.floor(this.blink * 2.5) % 2 === 0) ui.text('▶', x + w - 13, y + h - 11, COLORS.gold);
    const hint = 'CLICK/SPACE: NEXT   ESC: SKIP';
    const hy = y + h + 2 > ui.h - 8 ? y - 17 : y + h + 2;
    const hx = x + w - ui.textWidth(hint) - 8;
    ui.rect(hx - 3, hy - 2, ui.textWidth(hint) + 6, 11, COLORS.black);
    ui.text(hint, hx, hy, COLORS.smoke);
    ui.text(`${this.index + 1}/${this.lines.length}`, x + 8, y + h - 10, COLORS.smoke);

    if (ui.clicked) { ui.consumeClick(); this.advance(); }
  }
}
