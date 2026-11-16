// Tiny promise-based tween runner. Game-time scale lets tests fast-forward animations.
export const ease = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t) => 1 - (1 - t) ** 3,
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
};

export class Tweens {
  constructor() {
    this.items = [];
    this.timeScale = 1;
  }

  /** Run update(e) for `duration` seconds, e eased 0→1. Resolves when finished. */
  add({ duration = 0.3, delay = 0, update = () => {}, easing = ease.outQuad }) {
    return new Promise((resolve) => {
      this.items.push({ t: -delay, duration: Math.max(1e-4, duration), update, easing, resolve });
    });
  }

  wait(seconds) {
    return this.add({ duration: seconds, update: () => {}, easing: ease.linear });
  }

  update(dt) {
    dt *= this.timeScale;
    const done = [];
    for (const it of this.items) {
      it.t += dt;
      if (it.t < 0) continue;
      const k = Math.min(1, it.t / it.duration);
      it.update(it.easing(k), k);
      if (k >= 1) done.push(it);
    }
    if (done.length) {
      this.items = this.items.filter((i) => !done.includes(i));
      for (const it of done) it.resolve();
    }
  }
}
