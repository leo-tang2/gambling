import { COLORS } from '../shared/render/palette.js';
import { BAR_ITEMS } from '../holdem/game/meta.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Your own bar, between nights at the back room. Half of every cash-out lands in the bar fund;
 * you spend it on things for the bar. Nothing here earns money: it's just yours.
 * Drawn as a side-on pixel picture that fills in as you buy things, plus a catalog.
 */
export class BarTycoon {
  constructor({ ui, onBuy, onNextDay }) {
    this.ui = ui;
    this.onBuy = onBuy;
    this.onNextDay = onNextDay;
    this.flash = null; // { text, t, color }
    this.hover = null;
  }

  note(text, color = COLORS.lampGlow) { this.flash = { text, t: 2.2, color }; }

  draw(run, dt, time) {
    const ui = this.ui;
    const W = ui.w, H = ui.h;
    if (this.flash && (this.flash.t -= dt) <= 0) this.flash = null;
    ui.rect(0, 0, W, H, COLORS.black);

    // header
    ui.text('Your Bar', 10, 8, COLORS.lampGlow, { scale: 2, shadow: COLORS.bloodDark });
    ui.text(`After night ${run.day}`, 12 + ui.textWidth('Your Bar', 2) + 8, 13, COLORS.bone);
    const fund = `Bar fund ${money(run.barFund)}`;
    const stake = `Tomorrow's stake ${money(run.stake)}`;
    ui.text(fund, W - 10 - ui.textWidth(fund), 6, COLORS.gold);
    ui.text(stake, W - 10 - ui.textWidth(stake), 16, COLORS.bone);

    const catW = 200;
    const sx = 10, sy = 30, sw = W - catW - 28, sh = H - 30 - 44;
    this._drawScene(run, sx, sy, sw, sh, time);

    // catalog
    const cx = W - catW - 10;
    ui.panel(cx, sy, catW, sh, { fill: COLORS.ink, border: COLORS.woodLight });
    ui.text('Catalog', cx + 7, sy + 6, COLORS.paper);
    ui.text('owned', cx + catW - 7 - ui.textWidth('owned'), sy + 6, COLORS.smoke);
    this.hover = null;
    const rowH = Math.min(16, Math.floor((sh - 22) / BAR_ITEMS.length));
    BAR_ITEMS.forEach((it, i) => {
      const y = sy + 18 + i * rowH;
      const owned = run.items.includes(it.id);
      const afford = run.barFund >= it.price;
      if (ui.over(cx + 2, y, catW - 4, rowH)) this.hover = it.id;
      ui.text(it.name, cx + 7, y + Math.floor((rowH - 6) / 2), owned ? COLORS.smoke : COLORS.paper);
      if (owned) {
        const t = 'Owned';
        ui.text(t, cx + catW - 8 - ui.textWidth(t), y + Math.floor((rowH - 6) / 2), COLORS.sage);
      } else {
        const label = money(it.price);
        const bw = 46;
        if (ui.button(label, cx + catW - 6 - bw, y + 1, bw, rowH - 2, { enabled: afford, accent: COLORS.amberDark })) {
          this.onBuy(it);
        }
      }
    });

    // footer
    const fy = H - 38;
    const tip = this.flash ? this.flash.text : 'Nothing in the bar earns money. It is just yours.';
    ui.text(tip, 10, fy + 4, this.flash ? this.flash.color : COLORS.smoke);
    ui.text('Half of every cash-out goes to the bar, half comes back to the table with you.', 10, fy + 15, COLORS.smoke);
    const label = `Night ${run.day + 1}: back to the table`;
    const bw = ui.textWidth(label) + 20;
    if (ui.button(label, W - 10 - bw, fy + 8, bw, 17, { accent: COLORS.gold })) this.onNextDay();
  }

  // ---------------- the picture ----------------

  _drawScene(run, x, y, w, h, time) {
    const ui = this.ui;
    const has = (id) => run.items.includes(id);
    const hov = this.hover && !has(this.hover) ? this.hover : null;
    const X = (f) => Math.round(x + f * w);
    const Y = (f) => Math.round(y + f * h);
    const lit = has('lights') || has('chandelier');

    ui.rect(x - 1, y - 1, w + 2, h + 2, COLORS.woodLight);
    // wall: dark wood paneling, a little warmer when there's light to see it by
    const wallH = Math.round(h * 0.64);
    ui.rect(x, y, w, wallH, lit ? COLORS.wood : COLORS.woodDark);
    for (let px = x + 6; px < x + w; px += 14) ui.rect(px, y, 1, wallH, lit ? COLORS.woodMid : COLORS.shadow);
    ui.rect(x, y, w, 6, COLORS.shadow); // ceiling beam
    ui.rect(x, y + wallH - 18, w, 2, COLORS.woodLight); // chair rail
    ui.rect(x, y + wallH - 16, w, 16, lit ? COLORS.woodMid : COLORS.dusk);
    // floor: checkered tiles
    for (let fy = y + wallH, r = 0; fy < y + h; fy += 6, r++) {
      for (let fx = x, c = 0; fx < x + w; fx += 12, c++) {
        ui.rect(fx, fy, Math.min(12, x + w - fx), Math.min(6, y + h - fy), (r + c) % 2 ? COLORS.ink : (lit ? COLORS.ash : COLORS.shadow));
      }
    }
    // a bare bulb is all you start with
    if (!lit) {
      ui.rect(X(0.5), y + 6, 1, 14, COLORS.ash);
      ui.ditherRect(X(0.5) - 10, y + 16, 21, 12, COLORS.amberDark, 0.25);
      ui.rect(X(0.5) - 1, y + 20, 3, 3, COLORS.lampGlow);
    }

    // the counter, on the right
    const cL = X(0.52), cR = X(0.96), cTop = y + wallH - 4;
    ui.rect(cL, cTop, cR - cL, 2, COLORS.amberDark);
    ui.rect(cL, cTop + 2, cR - cL, 26, COLORS.woodDark);
    for (let px = cL + 8; px < cR; px += 16) ui.rect(px, cTop + 5, 10, 19, COLORS.wood);
    ui.rect(cL, cTop + 28, cR - cL, 1, COLORS.black);

    const outline = (bx, by, bw, bh) => {
      for (let i = 0; i < bw; i += 3) { ui.rect(bx + i, by, 1, 1, COLORS.gold); ui.rect(bx + i, by + bh - 1, 1, 1, COLORS.gold); }
      for (let i = 0; i < bh; i += 3) { ui.rect(bx, by + i, 1, 1, COLORS.gold); ui.rect(bx + bw - 1, by + i, 1, 1, COLORS.gold); }
    };

    // liquor shelf behind the counter
    {
      const sx0 = X(0.56), sw = X(0.92) - sx0, sy0 = Y(0.16);
      if (has('shelf')) {
        const cols = [COLORS.amber, COLORS.sage, COLORS.redLight, COLORS.gold, COLORS.cream, COLORS.blue, COLORS.amberMid];
        for (let r = 0; r < 2; r++) {
          const by = sy0 + 16 + r * 20;
          ui.rect(sx0, by, sw, 2, COLORS.woodLight);
          for (let bx = sx0 + 3, k = r * 3; bx < sx0 + sw - 4; bx += 7, k++) {
            const bh = 8 + ((k * 5) % 5);
            ui.rect(bx, by - bh, 4, bh, cols[k % cols.length]);
            ui.rect(bx + 1, by - bh - 3, 2, 3, cols[k % cols.length]);
            ui.rect(bx + 1, by - bh + 2, 1, 3, COLORS.white);
          }
        }
      } else if (hov === 'shelf') outline(sx0, sy0, sw, 40);
    }

    // neon sign
    {
      const nx = X(0.6), ny = Y(0.04) + 4, nw = 40, nh = 14;
      if (has('neon')) {
        const on = Math.sin(time * 9) > -0.85 || Math.floor(time * 3) % 7 !== 0;
        ui.ditherRect(nx - 4, ny - 3, nw + 8, nh + 6, COLORS.redLight, on ? 0.3 : 0.08);
        ui.rect(nx, ny, nw, nh, COLORS.ink);
        ui.textCentered('BAR', nx + nw / 2, ny + 4, on ? COLORS.cream : COLORS.red);
        ui.rect(nx, ny, nw, 1, on ? COLORS.redLight : COLORS.red);
        ui.rect(nx, ny + nh - 1, nw, 1, on ? COLORS.redLight : COLORS.red);
      } else if (hov === 'neon') outline(nx, ny, nw, nh);
    }

    // portrait of Don Sal
    {
      const px = X(0.38), py = Y(0.12), pw = 26, ph = 32;
      if (has('portrait')) {
        ui.rect(px, py, pw, ph, COLORS.gold);
        ui.rect(px + 2, py + 2, pw - 4, ph - 4, COLORS.navy);
        ui.rect(px + 9, py + 10, 8, 9, COLORS.skin);
        ui.rect(px + 6, py + 7, 14, 2, COLORS.ink); // hat brim
        ui.rect(px + 8, py + 3, 10, 4, COLORS.ink);
        ui.rect(px + 7, py + 19, 12, ph - 21, COLORS.navyLight);
        ui.rect(px + 12, py + 19, 2, 6, COLORS.red);
        ui.rect(px + 17, py + 16, 4, 1, COLORS.wood); // the cigar
        ui.rect(px + 21, py + 16, 1, 1, COLORS.amber);
      } else if (hov === 'portrait') outline(px, py, pw, ph);
    }

    // dartboard
    {
      const dx = X(0.08) + 12, dy = Y(0.2) + 12;
      if (has('dartboard')) {
        this._disc(dx, dy, 12, COLORS.ink);
        this._disc(dx, dy, 10, COLORS.cream);
        this._disc(dx, dy, 8, COLORS.red);
        this._disc(dx, dy, 6, COLORS.cream);
        this._disc(dx, dy, 3, COLORS.sage);
        this._disc(dx, dy, 1, COLORS.red);
        ui.rect(dx + 4, dy - 3, 5, 1, COLORS.gold);
      } else if (hov === 'dartboard') outline(dx - 12, dy - 12, 25, 25);
    }

    // fish tank
    {
      const ax = X(0.2), ay = Y(0.27), aw = 40, ah = 22;
      if (has('aquarium')) {
        ui.rect(ax - 1, ay - 1, aw + 2, ah + 2, COLORS.ash);
        ui.rect(ax, ay, aw, ah, COLORS.navy);
        ui.ditherRect(ax, ay, aw, 4, COLORS.blue, 0.6);
        ui.rect(ax, ay + ah - 3, aw, 3, COLORS.amberDark);
        for (let i = 0; i < 3; i++) {
          const fx = ax + 4 + ((time * (8 + i * 3) + i * 13) % (aw - 10));
          const fy = ay + 7 + i * 4 + Math.round(Math.sin(time * 2 + i) * 1.5);
          ui.rect(fx, fy, 4, 2, i === 1 ? COLORS.gold : COLORS.amber);
          ui.rect(fx - 1, fy, 1, 2, i === 1 ? COLORS.amber : COLORS.redLight);
        }
        ui.rect(ax + aw - 6, ay + ah - 10, 1, 7, COLORS.sage);
        ui.rect(ax + aw - 9, ay + ah - 8, 1, 5, COLORS.sage);
        ui.rect(ax - 2, ay + ah + 1, aw + 4, 12, COLORS.woodDark); // stand
      } else if (hov === 'aquarium') outline(ax, ay, aw, ah + 13);
    }

    // piano against the left wall
    {
      const px = X(0.03), pw = 44, ph = 34, py = y + wallH + 6 - ph;
      if (has('piano')) {
        ui.rect(px, py, pw, ph, COLORS.ink);
        ui.rect(px + 2, py + 2, pw - 4, 10, COLORS.woodDark);
        ui.rect(px, py + 14, pw, 4, COLORS.cream);
        for (let k = 2; k < pw; k += 4) ui.rect(px + k, py + 14, 1, 4, COLORS.ash);
        for (let k = 3; k < pw - 2; k += 8) { ui.rect(px + k, py + 14, 2, 2, COLORS.black); ui.rect(px + k + 4, py + 14, 2, 2, COLORS.black); }
        ui.rect(px + 3, py + 18, 3, ph - 18, COLORS.ink);
        ui.rect(px + pw - 6, py + 18, 3, ph - 18, COLORS.ink);
      } else if (hov === 'piano') outline(px, py, pw, ph);
    }

    // jukebox
    {
      const jx = X(0.3), jw = 22, jh = 34, jy = y + wallH + 8 - jh;
      if (has('jukebox')) {
        ui.rect(jx, jy + 6, jw, jh - 6, COLORS.woodDark);
        this._disc(jx + jw / 2, jy + 9, 10, COLORS.woodLight);
        ui.rect(jx + 1, jy + 9, jw - 2, jh - 9, COLORS.woodLight);
        ui.rect(jx + 3, jy + 10, jw - 6, 8, COLORS.amber);
        const hue = [COLORS.redLight, COLORS.gold, COLORS.sage, COLORS.blue];
        for (let i = 0; i < 4; i++) ui.rect(jx + 3, jy + 20 + i * 3, jw - 6, 2, hue[(i + Math.floor(time * 4)) % 4]);
        ui.rect(jx + 4, jy + jh - 4, jw - 8, 3, COLORS.ink);
      } else if (hov === 'jukebox') outline(jx, jy, jw, jh);
    }

    // stools along the counter
    {
      if (has('stools')) {
        for (let i = 0; i < 4; i++) {
          const sx1 = X(0.56) + i * Math.round((cR - cL) / 4.3);
          const sy1 = cTop + 12;
          ui.rect(sx1, sy1, 14, 3, COLORS.redLight);
          ui.rect(sx1, sy1 + 3, 14, 1, COLORS.red);
          ui.rect(sx1 + 6, sy1 + 4, 2, 20, COLORS.bone);
          ui.rect(sx1 + 2, sy1 + 24, 10, 2, COLORS.bone);
        }
      } else if (hov === 'stools') outline(X(0.56), cTop + 12, cR - X(0.56), 26);
    }

    // pool table in the middle of the floor
    {
      const tx = X(0.18), tw = Math.round(w * 0.3), ty = y + wallH + Math.round((h - wallH) * 0.4), th = 14;
      if (has('pool')) {
        ui.rect(tx, ty, tw, th, COLORS.woodDark);
        ui.rect(tx + 3, ty + 2, tw - 6, th - 5, COLORS.felt);
        ui.rect(tx + 3, ty + 2, tw - 6, 1, COLORS.feltLight);
        for (const px of [tx + 2, tx + Math.floor(tw / 2) - 1, tx + tw - 4]) ui.rect(px, ty + 1, 2, 2, COLORS.black);
        const balls = [COLORS.white, COLORS.redLight, COLORS.gold, COLORS.blue, COLORS.ink];
        balls.forEach((c, i) => ui.rect(tx + 12 + i * 9 + (i % 2) * 3, ty + 4 + (i % 2) * 3, 2, 2, c));
        ui.rect(tx + 6, ty + th, 3, 10, COLORS.woodDark);
        ui.rect(tx + tw - 9, ty + th, 3, 10, COLORS.woodDark);
      } else if (hov === 'pool') outline(tx, ty, tw, th + 10);
    }

    // potted palm, right corner
    {
      const px = X(0.97) - 8, py = y + h - 16;
      if (has('plant')) {
        ui.rect(px - 5, py, 11, 12, COLORS.leather);
        ui.rect(px - 6, py, 13, 2, COLORS.amberDark);
        const sway = Math.round(Math.sin(time * 0.8) * 1);
        for (const [dx, dy, len] of [[-8, -10, 9], [3, -12, 9], [-4, -16, 6], [1, -6, 8], [-10, -4, 7]]) {
          ui.rect(px + dx + sway, py + dy, len, 2, COLORS.sage);
          ui.rect(px + dx + sway + 1, py + dy + 2, len - 3, 1, COLORS.feltLight);
        }
        ui.rect(px, py - 14, 1, 14, COLORS.wood);
      } else if (hov === 'plant') outline(px - 12, py - 18, 24, 30);
    }

    // hanging lamps over the counter
    if (has('lights')) {
      for (let i = 0; i < 3; i++) {
        const lx = X(0.6) + i * Math.round((cR - X(0.6)) / 3) + 10;
        ui.rect(lx, y + 6, 1, 18, COLORS.ash);
        ui.rect(lx - 4, y + 24, 9, 3, COLORS.sage);
        ui.ditherRect(lx - 9, y + 27, 19, 30, COLORS.amber, 0.15);
        ui.rect(lx - 1, y + 27, 3, 2, COLORS.lampGlow);
      }
    } else if (hov === 'lights') outline(X(0.6), y + 6, cR - X(0.6), 26);

    // ceiling fan
    {
      const fx = X(0.68), fy = y + 10;
      if (has('fan')) {
        ui.rect(fx, y + 6, 1, 4, COLORS.ash);
        const a = time * 6;
        const len = Math.round(16 * Math.abs(Math.cos(a)));
        ui.rect(fx - len, fy, len * 2 + 1, 2, COLORS.woodLight);
        ui.rect(fx - 2, fy - 1, 5, 4, COLORS.bone);
      } else if (hov === 'fan') outline(fx - 16, fy - 2, 33, 7);
    }

    // chandelier
    {
      const cx = X(0.3), cy = y + 6;
      if (has('chandelier')) {
        ui.rect(cx, cy, 1, 8, COLORS.gold);
        ui.ditherRect(cx - 22, cy + 6, 45, 28, COLORS.goldLight, 0.18);
        ui.rect(cx - 14, cy + 12, 29, 2, COLORS.gold);
        ui.rect(cx - 9, cy + 16, 19, 2, COLORS.amber);
        for (const dx of [-14, -7, 0, 7, 14]) {
          ui.rect(cx + dx, cy + 8, 1, 4, COLORS.cream);
          ui.rect(cx + dx, cy + 6 + (Math.floor(time * 5 + dx) % 2), 1, 2, COLORS.lampGlow);
        }
        ui.rect(cx - 1, cy + 18, 3, 4, COLORS.gold);
      } else if (hov === 'chandelier') outline(cx - 15, cy, 31, 22);
    }

    if (!run.items.length) {
      ui.textCentered('An empty room, a counter, one bulb.', x + w / 2, y + h - 12, COLORS.smoke);
    }
  }

  _disc(cx, cy, r, color) {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      this.ui.rect(Math.round(cx - dx), Math.round(cy + dy), dx * 2 + 1, 1, color);
    }
  }
}
