import { COLORS } from '../../shared/render/palette.js';
import { moodWord, moodLine } from './meta.js';
import { wrapText, LINE_H } from '../../shared/ui/font.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const signed = (n) => (n >= 0 ? `+${money(n)}` : `-${money(-n)}`);

/**
 * The end-of-day screen after cashing out: how the night went, your money hand by hand,
 * and how the family feels about you.
 * data: { day, reason, start, end, history[], handsPlayed, handsWon, biggestPot, drinks, cigars,
 *         roulette[{bullets, won}], mood, toBar, stake, t }
 */
export function drawOverview(ui, data, time, onContinue) {
  const W = ui.w, H = ui.h;
  ui.rect(0, 0, W, H, COLORS.black);
  const reveal = Math.min(1, data.t / 1.6);
  const title = data.reason === 'win' ? 'You cleaned out the back room' : 'Cashed out';
  ui.textCentered(title, W / 2, 10, COLORS.lampGlow, { scale: 2, shadow: COLORS.bloodDark });
  ui.textCentered(`Night ${data.day}  -  ${data.handsPlayed} hand${data.handsPlayed === 1 ? '' : 's'} played`, W / 2, 28, COLORS.bone);

  const pad = 10;
  const top = 42;
  const statW = 170;
  const graphX = pad + statW + 10;
  const graphW = W - graphX - pad;
  const midH = Math.max(110, H - top - 120);

  // ---- stats ----
  ui.panel(pad, top, statW, midH, { fill: COLORS.ink, border: COLORS.woodLight });
  const profit = data.end - data.start;
  const rows = [
    ['Sat down with', money(data.start), COLORS.paper],
    ['Walked out with', money(data.end), COLORS.gold],
    ['Profit', signed(profit), profit >= 0 ? COLORS.lampGlow : COLORS.redLight],
    null,
    ['Hands won', `${data.handsWon}`, COLORS.paper],
    ['Biggest pot', data.biggestPot ? money(data.biggestPot) : '-', COLORS.paper],
    ['Drinks', `${data.drinks}`, COLORS.paper],
    ['Cigars', `${data.cigars}`, COLORS.paper],
  ];
  if (data.roulette.length) {
    const best = Math.max(...data.roulette.map((r) => r.bullets));
    rows.push(['Roulette', `lived ${data.roulette.length}x (${best} max)`, COLORS.redLight]);
  }
  let ry = top + 8;
  for (const r of rows) {
    if (!r) { ry += 5; continue; }
    ui.text(r[0], pad + 7, ry, COLORS.bone);
    const vw = ui.textWidth(r[1]);
    ui.text(r[1], pad + statW - 7 - vw, ry, r[2]);
    ry += 11;
  }

  // ---- money hand by hand ----
  ui.panel(graphX, top, graphW, midH, { fill: COLORS.ink, border: COLORS.woodLight });
  ui.text('Your money, hand by hand', graphX + 7, top + 6, COLORS.paper);
  const hist = data.history;
  const gx = graphX + 40, gy = top + 20, gw = graphW - 48, gh = midH - 36;
  const maxV = Math.max(...hist, data.start) * 1.1 || 1;
  ui.rect(gx - 1, gy, 1, gh + 1, COLORS.smoke);
  ui.rect(gx - 1, gy + gh, gw + 1, 1, COLORS.smoke);
  const yOf = (v) => gy + gh - Math.round((v / maxV) * gh);
  ui.text(money(maxV / 1.1), gx - 4 - ui.textWidth(money(maxV / 1.1)), yOf(maxV / 1.1) - 3, COLORS.smoke);
  ui.text('$0', gx - 4 - ui.textWidth('$0'), gy + gh - 3, COLORS.smoke);
  // bars: one per hand (value after that hand), thinned out if there are a lot of hands
  const n = hist.length - 1;
  if (n > 0) {
    const maxBars = Math.max(1, Math.floor(gw / 3));
    const step = Math.ceil(n / maxBars);
    const bars = [];
    for (let i = step; i <= n; i += step) bars.push({ hand: i, v: hist[i] });
    if (bars[bars.length - 1]?.hand !== n) bars.push({ hand: n, v: hist[n] });
    const slot = gw / bars.length;
    const bw = Math.max(1, Math.min(18, Math.floor(slot) - 2));
    const grow = Math.min(1, reveal * 1.2);
    bars.forEach((b, i) => {
      const local = Math.max(0, Math.min(1, grow * bars.length - i * 0.6));
      const h = Math.round(((b.v / maxV) * gh) * local);
      const x = Math.round(gx + i * slot + (slot - bw) / 2);
      const col = b.v >= data.start ? COLORS.gold : COLORS.redLight;
      if (h > 0) {
        ui.rect(x, gy + gh - h, bw, h, col === COLORS.gold ? COLORS.amberDark : COLORS.red);
        ui.rect(x, gy + gh - h, bw, 1, col);
      }
      const isOut = data.cashBar && b.hand === n;
      if (isOut) ui.text('out', x + Math.floor(bw / 2) - 6, gy + gh + 3, COLORS.sage);
      else if (bars.length <= 16 || i % Math.ceil(bars.length / 12) === 0) ui.tinyText(String(b.hand), x + Math.floor(bw / 2) - 1, gy + gh + 3, COLORS.smoke);
    });
  } else {
    ui.textCentered('No hands finished', gx + gw / 2, gy + gh / 2, COLORS.smoke);
  }
  // the line you started at
  const sy = yOf(data.start);
  for (let x = gx; x < gx + gw; x += 4) ui.rect(x, sy, 2, 1, COLORS.cream);
  ui.text('start', gx + gw - ui.textWidth('start') - 1, sy - 8, COLORS.cream);

  // ---- how the family feels ----
  const my = top + midH + 8;
  ui.panel(pad, my, W - pad * 2, 50, { fill: COLORS.ink, border: COLORS.woodLight });
  ui.text('How the family feels about you', pad + 7, my + 6, COLORS.paper);
  const word = moodWord(data.mood);
  ui.text(word, W - pad - 7 - ui.textWidth(word), my + 6, data.mood >= 45 ? COLORS.gold : COLORS.redLight);
  const bx = pad + 7, by = my + 18, bw = W - pad * 2 - 14, bh = 9;
  ui.rect(bx - 1, by - 1, bw + 2, bh + 2, COLORS.woodLight);
  ui.rect(bx, by, bw, bh, COLORS.black);
  const fillW = Math.max(2, Math.round(bw * (data.mood / 100) * Math.min(1, reveal * 1.4)));
  for (let x = 0; x < fillW; x++) {
    const k = x / bw;
    const col = k < 0.25 ? COLORS.red : k < 0.45 ? COLORS.redLight : k < 0.65 ? COLORS.amber : k < 0.85 ? COLORS.gold : COLORS.lampGlow;
    ui.rect(bx + x, by, 1, bh, col);
  }
  for (let i = 1; i < 4; i++) ui.rect(bx + Math.round(bw * i / 4), by, 1, bh, COLORS.black);
  ui.text('angry', bx, by + bh + 2, COLORS.smoke);
  ui.text('happy', bx + bw - ui.textWidth('happy'), by + bh + 2, COLORS.smoke);
  ui.textCentered(`Don Sal: "${moodLine(data.mood)}"`, W / 2, by + bh + 2, COLORS.bone);

  // ---- what happens to the money ----
  const fy = my + 58;
  if (reveal >= 1) {
    const line = `${money(data.toBar)} goes to your bar   -   ${money(data.stake)} comes back with you tomorrow, plus whatever you do not spend`;
    const lines = wrapText(line, W - 40);
    lines.forEach((l, i) => ui.textCentered(l, W / 2, fy + i * LINE_H, COLORS.paper));
    const bwid = 110;
    const go = ui.button('Go to your bar', Math.round(W / 2 - bwid / 2), Math.min(H - 20, fy + lines.length * LINE_H + 4), bwid, 15, { accent: COLORS.gold });
    if (go) onContinue();
  }
}
