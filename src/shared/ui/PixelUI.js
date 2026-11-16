import { COLORS } from '../render/palette.js';
import { drawText, drawTextCentered, textWidth } from './font.js';

// 3x5 digits for button badges
const TINY = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
};

/**
 * Immediate-mode pixel UI drawn on the renderer's low-res UI canvas.
 * Call begin() each frame, draw widgets, then end(). Widgets register hit areas so
 * clicks can be routed; everything is hard-edged and on the pixel grid.
 */
export class PixelUI {
  constructor(pixelRenderer) {
    this.pr = pixelRenderer;
    this.canvas = pixelRenderer.uiCanvas;
    this.ctx = this.canvas.getContext('2d');
    this.mouse = { x: -1, y: -1, down: false, inside: false };
    this.clicked = null; // {x,y} for the frame after a click
    this.hits = [];
    this.hot = null;
    this.capture = null; // id of widget being dragged
    this.showCursor = true;

    const c = this.pr.canvas;
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerdown', (e) => {
      this._move(e);
      this.mouse.down = true;
      this._pressAt = { x: this.mouse.x, y: this.mouse.y };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointerup', (e) => {
      this._move(e);
      this.mouse.down = false;
      if (this._pressAt) this.clicked = { x: this.mouse.x, y: this.mouse.y, button: e.button };
      this._pressAt = null;
      this.capture = null;
    });
    c.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _move(e) {
    const p = this.pr.toPixel(e.clientX, e.clientY);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.mouse.inside = true;
  }

  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }

  begin() {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.prevHits = this.hits;
    this.hits = [];
  }

  /** True if the pointer is over any UI widget drawn last frame (so 3D picking can skip). */
  get pointerOverUI() {
    const { x, y } = this.mouse;
    return (this.prevHits ?? []).some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
  }

  end() {
    if (this.showCursor && this.mouse.inside) this.drawCursor(this.mouse.x, this.mouse.y);
    this.clicked = null;
  }

  over(x, y, w, h) {
    const m = this.mouse;
    return m.inside && m.x >= x && m.y >= y && m.x < x + w && m.y < y + h;
  }

  clickedIn(x, y, w, h) {
    const c = this.clicked;
    return c && c.x >= x && c.y >= y && c.x < x + w && c.y < y + h;
  }

  /** Consume the click so later widgets / 3D picking don't also react. */
  consumeClick() { this.clicked = null; }

  /** Ordered-dither fill: `amount` 0..1 of the pixels are painted (fake transparency). */
  ditherRect(x, y, w, h, color, amount = 0.5) {
    const level = Math.max(0, Math.min(16, Math.round(amount * 16)));
    if (level === 0) return;
    this._patterns ??= new Map();
    const key = `${color}|${level}`;
    let pat = this._patterns.get(key);
    if (!pat) {
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const c = document.createElement('canvas');
      c.width = 4; c.height = 4;
      const cx = c.getContext('2d');
      cx.fillStyle = color;
      for (let i = 0; i < 16; i++) if (B[i] < level) cx.fillRect(i % 4, Math.floor(i / 4), 1, 1);
      pat = this.ctx.createPattern(c, 'repeat');
      this._patterns.set(key, pat);
    }
    this.ctx.fillStyle = pat;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Hard-edged panel: dark fill, 1px light border, 1px inner shadow line. */
  panel(x, y, w, h, { fill = COLORS.ink, border = COLORS.amberDark, inner = COLORS.dusk } = {}) {
    this.rect(x, y, w, h, border);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
    if (inner) {
      this.rect(x + 1, y + h - 2, w - 2, 1, inner);
      this.rect(x + w - 2, y + 1, 1, h - 2, inner);
    }
    this.hits.push({ x, y, w, h });
  }

  text(str, x, y, color = COLORS.paper, opts) { return drawText(this.ctx, str, x, y, color, opts); }
  textCentered(str, cx, y, color = COLORS.paper, opts) { return drawTextCentered(this.ctx, str, cx, y, color, opts); }
  textWidth(str, scale) { return textWidth(str, scale); }

  /** A 3x5 digit, smaller than the main font; used for the number badges on buttons. */
  tinyText(str, x, y, color) {
    let cx = Math.round(x);
    for (const ch of String(str)) {
      const rows = TINY[ch];
      if (!rows) { cx += 2; continue; }
      this.ctx.fillStyle = color;
      rows.forEach((row, r) => [...row].forEach((b, c) => { if (b === '#') this.ctx.fillRect(cx + c, Math.round(y) + r, 1, 1); }));
      cx += 4;
    }
    return cx - x - 1;
  }

  /** Button; returns true on the frame it is clicked. `badge` puts a small number bottom-left. */
  button(label, x, y, w, h, { enabled = true, accent = COLORS.amber, hotkey = null, badge = null } = {}) {
    const hover = enabled && this.over(x, y, w, h);
    const pressed = hover && this.mouse.down;
    const border = !enabled ? COLORS.ash : hover ? COLORS.gold : accent;
    const fill = !enabled ? COLORS.ink : pressed ? COLORS.woodDark : hover ? COLORS.wood : COLORS.shadow;
    this.rect(x, y, w, h, border);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
    if (!pressed) this.rect(x + 1, y + h - 2, w - 2, 1, COLORS.black); // bottom lip
    const color = !enabled ? COLORS.smoke : hover ? COLORS.lampGlow : COLORS.paper;
    const ty = y + Math.floor((h - 6) / 2) + (pressed ? 1 : 0);
    this.textCentered(label, x + w / 2, ty, color);
    if (hotkey && enabled) {
      this.text(hotkey, x + 2, y + 2, COLORS.smoke);
    }
    if (badge != null) {
      this.tinyText(badge, x + 2, y + h - 7 + (pressed ? 1 : 0), !enabled ? COLORS.ash : hover ? COLORS.gold : COLORS.amberDark);
    }
    this.hits.push({ x, y, w, h });
    if (enabled && this.clickedIn(x, y, w, h)) {
      this.consumeClick();
      return true;
    }
    return false;
  }

  /**
   * Horizontal slider. Returns the new value. `steps` snaps to multiples.
   */
  slider(id, value, min, max, x, y, w, { step = 1, enabled = true } = {}) {
    const h = 9;
    this.hits.push({ x: x - 2, y: y - 2, w: w + 4, h: h + 4 });
    if (enabled && this.mouse.down && (this.capture === id || (!this.capture && this.over(x - 2, y - 2, w + 4, h + 4)))) {
      this.capture = id;
      const t = Math.min(1, Math.max(0, (this.mouse.x - x) / (w - 1)));
      value = min + t * (max - min);
      value = Math.round(value / step) * step;
      value = Math.min(max, Math.max(min, value));
    }
    const t = max > min ? (value - min) / (max - min) : 0;
    this.rect(x, y + 3, w, 3, enabled ? COLORS.woodLight : COLORS.ash);
    this.rect(x, y + 6, w, 1, COLORS.black);
    const kx = Math.round(x + t * (w - 5));
    const hover = enabled && this.over(kx - 1, y - 1, 7, h + 2);
    this.rect(kx, y, 5, h, enabled ? (hover || this.capture === id ? COLORS.lampGlow : COLORS.gold) : COLORS.smoke);
    this.rect(kx + 1, y + 1, 3, h - 2, enabled ? COLORS.amber : COLORS.ash);
    return value;
  }

  drawCursor(x, y) {
    // 7x10 arrow, outlined, on the pixel grid
    const shape = [
      'X.........',
      'XX........',
      'XOX.......',
      'XOOX......',
      'XOOOX.....',
      'XOOOOX....',
      'XOOOOOX...',
      'XOOXXXX...',
      'XOX.......',
      'XX........',
    ];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        const ch = shape[r][c];
        if (ch === 'X') this.rect(x + c, y + r, 1, 1, COLORS.black);
        else if (ch === 'O') this.rect(x + c, y + r, 1, 1, COLORS.cream);
      }
    }
  }
}
