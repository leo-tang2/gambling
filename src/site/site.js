// The Bar Gambling site: draws headings in the game's own "Backroom" pixel font.
import { drawText, textWidth, LINE_H } from '../shared/ui/font.js';

// target height in CSS px of one font pixel, per heading size
const SIZES = {
  hero: (vw) => Math.max(5, Math.min(14, Math.floor((vw * 0.86) / 64))),
  h2: (vw) => (vw < 560 ? 4 : 5),
  num: () => 5,
};

function render(el) {
  const text = el.dataset.px;
  const color = el.dataset.color || '#ffe6a0';
  const shadow = el.dataset.shadow || null;
  const dpr = window.devicePixelRatio || 1;
  const cssScale = SIZES[el.dataset.size || 'h2'](document.documentElement.clientWidth);
  // whole device pixels per font pixel keeps every pixel the same size
  const s = Math.max(1, Math.round(cssScale * dpr));
  const w = textWidth(text) + (shadow ? 1 : 0);
  const h = LINE_H - 1;

  let canvas = el.querySelector('canvas');
  if (!canvas) {
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = text;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    el.append(label, canvas);
    el.classList.add('px--drawn');
  }
  canvas.width = w * s;
  canvas.height = h * s;
  canvas.style.width = `${(w * s) / dpr}px`;
  canvas.style.height = `${(h * s) / dpr}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawText(ctx, text, 0, 0, color, { scale: s, shadow });
}

function renderAll() {
  document.querySelectorAll('.px[data-px]').forEach(render);
}

renderAll();
let t = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(t);
  t = requestAnimationFrame(renderAll);
});
