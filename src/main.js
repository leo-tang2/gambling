import * as THREE from 'three';
import { PixelRenderer } from './shared/render/PixelRenderer.js';
import { PixelUI } from './shared/ui/PixelUI.js';
import { COLORS } from './shared/render/palette.js';
import { LookController } from './shared/input/LookController.js';
import { Tweens } from './shared/anim/Tweens.js';
import { loadModels } from './shared/render/Assets.js';
import { ChipManager } from './shared/props/ChipManager.js';
import { CardManager } from './shared/props/CardManager.js';
import { buildFallbackProps } from './shared/props/fallbackProps.js';
import { BackRoom } from './holdem/scene/BackRoom.js';
import { EYE_HEIGHT } from './holdem/scene/layout.js';
import { HUD } from './holdem/game/HUD.js';
import { HoldemController } from './holdem/game/HoldemController.js';
import { CAST } from './holdem/game/cast.js';
import { playerView } from './holdem/engine/engine.js';
import { decide } from './holdem/ai/decide.js';
import { PERSONALITIES } from './holdem/ai/personalities.js';

const pr = new PixelRenderer({ targetHeight: 360 });
const ui = new PixelUI(pr);
const tweens = new Tweens();

const scene = new THREE.Scene();
scene.name = 'BackRoomScene';
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 2.4, 5.4);
const ambient = new THREE.HemisphereLight(0x4a3428, 0x050302, 0.12);
ambient.name = 'Ambient';
scene.add(ambient);

const camera = new THREE.PerspectiveCamera(64, pr.width / pr.height, 0.02, 30);
camera.position.set(0, EYE_HEIGHT, 1.02);
pr.onResize = (w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); };
const look = new LookController(camera);

let loadProgress = 0;
let controller = null;
let hud = null;

/** The revolver and your own hands, used by the peek and game-over scenes. */
function firstPerson(model) {
  const group = new THREE.Group();
  group.name = 'FirstPerson';
  scene.add(group);
  const take = (name) => {
    let o = model?.getObjectByName(name);
    if (!o) o = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), new THREE.MeshStandardMaterial({ color: 0x444444 }));
    o = o.clone(true);
    o.name = name;
    o.visible = false;
    group.add(o);
    return o;
  };
  return { scene: group, gun: take('Revolver'), grip: take('HandGrip'), peek: take('HandPeek'), tremble: 0 };
}

async function boot() {
  const models = await loadModels(
    ['room', 'table', 'chair', 'lamp', 'boss', 'enforcer', 'shark', 'props', 'firstperson'],
    (p) => { loadProgress = p; },
  );
  const props = buildFallbackProps(models.props);
  const room = new BackRoom({ scene, models, tweens, cast: CAST });
  room.addDeck(props.card);
  const chips = new ChipManager({ scene, templates: props.chips, tweens });
  const cards = new CardManager({ scene, template: props.card, tweens });
  controller = new HoldemController({ room, chips, cards, hud: null, tweens, look, camera, ui, pr, fp: firstPerson(models.firstperson) });
  hud = new HUD({ ui, camera, controller });
  controller.hud = hud;
  const button = props.dealerButton.clone(true);
  button.name = 'DealerButtonPuck';
  scene.add(button);
  controller.dealerButton = button;

  // hooks for automated checks (Playwright) and the three.js devtools
  window.__holdem = {
    controller,
    get game() { return controller.game; },
    setSpeed(n) { tweens.timeScale = n; },
    start() { return controller.startFromMenu(); },
    /** Let a simple AI play your seat (testing only). */
    autoplay(on = true, style = 'aggressive') {
      clearInterval(window.__holdem._auto);
      if (!on) return;
      window.__holdem._auto = setInterval(() => {
        const p = hud.prompt;
        if (!p || hud.choice) return;
        const d = decide(playerView(controller.game, 0), PERSONALITIES[style]);
        hud._resolve({ type: d.type, amount: d.amount });
      }, 50);
    },
    /** Set stacks before the next hand (testing side pots / endings). Total must stay the same. */
    setStacks(arr) { controller.queueStacks(arr); },
    /** Make the next between-hands offer a specific one: 'drink' | 'roulette' | 'cigar'. */
    forceEvent(kind) { controller.forcedEvent = kind; },
    /** Pick option n (1-based) in an open offer/confirmation box. */
    pick(n) { const ch = hud.choice; if (ch) hud._pick(ch.options[n - 1].value); },
    get hud() { return hud; },
  };
  controller.showMenu();
}

Object.assign(window, { THREE, scene, camera, renderer: pr.renderer, pixel: pr });

function drawLoading() {
  const w = 160;
  const x = Math.round((ui.w - w) / 2);
  const y = Math.round(ui.h / 2);
  ui.textCentered("Back Room Hold'em", ui.w / 2, y - 30, COLORS.gold, { scale: 3 });
  ui.rect(x, y, w, 7, COLORS.amberDark);
  ui.rect(x + 1, y + 1, w - 2, 5, COLORS.ink);
  ui.rect(x + 1, y + 1, Math.round((w - 2) * loadProgress), 5, COLORS.amber);
  ui.textCentered('Loading', ui.w / 2, y + 12, COLORS.bone);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tweens.update(dt);
  if (ui.mouse.inside) look.aim(ui.mouse.x / pr.width, ui.mouse.y / pr.height);
  look.update(dt);
  controller?.room.update(dt);
  controller?.update(dt);

  ui.showCursor = !(controller?.cutscene || controller?.phase === 'black');
  ui.begin();
  if (!controller) drawLoading();
  else {
    hud.draw(dt);
    controller.handleClick();
  }
  ui.end();
  pr.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
boot().catch((e) => console.error(e));
