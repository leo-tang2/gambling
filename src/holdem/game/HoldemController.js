import * as THREE from 'three';
import { createGame, startHand, applyAction, legalActions, playerView, potTotal } from '../engine/engine.js';
import { decide } from '../ai/decide.js';
import { evaluate, describeScore } from '../engine/evaluator.js';
import { CAST, SMALL_BLIND, BIG_BLIND } from './cast.js';
import { seatSpots, POT_SPOT, BOARD_SPOT, BOARD_CARD_SCALE, DECK_SPOT, TABLE_HEIGHT, EYE_HEIGHT, SEAT_ANGLES } from '../scene/layout.js';
import { ChipStack, PotPile } from '../../shared/props/ChipManager.js';
import { ease } from '../../shared/anim/Tweens.js';
import { sound } from '../../shared/audio/Sound.js';
import { COLORS } from '../../shared/render/palette.js';
import { SideEvents } from './SideEvents.js';
import {
  newRun, loadRun, saveRun, clearRun, opponentStack, nextEventGap, makeLuckyDeckFn, mafiaMood, splitCashOut, nextNight,
} from './meta.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const CARD_Y = TABLE_HEIGHT + 0.002;
const CARD_LEN = 0.105;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** The revolver lying on its side on the felt. */
// (roll 90 degrees onto its side so the cylinder faces up, then turn the barrel off to your left)
const GUN_REST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 + 0.4)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));

export class HoldemController {
  constructor({ room, chips, cards, hud, tweens, look, camera, ui, pr, fp }) {
    Object.assign(this, { room, chips, cards, hud, tweens, look, camera, ui, pr, fp });
    this.cast = CAST;
    this.phase = 'menu'; // menu | black | playing | over | gameover
    this.thinking = null;
    this.endResult = null;
    this.cutscene = false;
    this.peeking = false;
    this.peeked = false;
    this.gameOverState = null;
    this.potSpot = V(POT_SPOT.x, TABLE_HEIGHT, POT_SPOT.z);
    this.pot = new PotPile(chips, { center: POT_SPOT, tableY: TABLE_HEIGHT });
    this.stacks = CAST.map((c, seat) => {
      const s = seatSpots(seat);
      return new ChipStack(chips, { origin: s.chips, right: s.right, tableY: TABLE_HEIGHT, name: c.short });
    });
    this.hole = [[], [], [], []];
    this.board = [];
    this.selected = [];
    this.playerEye = V(0, EYE_HEIGHT, 1.02);
    this.menuT = 0;
    // camera and hand placement for peeking at your cards (relative to the two cards' centre)
    this.peekCfg = {
      cam: [0.0, 0.075, 0.24], look: [0.0, 0.025, -0.01], fov: 46, tilt: 0.78,
      handFrom: [0.35, -0.02, 0.06], hand: [0.125, 0.0, 0.035], handRot: [0, -Math.PI / 2 + 0.25, 0.0],
    };
    // a little bounce light that fills the undersides of your cards while you peek
    this.peekLight = new THREE.PointLight(0xffd9a8, 0, 0.7, 2);
    this.peekLight.name = 'PeekLight';
    this.room.scene.add(this.peekLight);
    this.resetShown();
    // the run: which night it is, the stake you bring to the table, your bar
    this.run = newRun();
    this.savedRun = loadRun();
    this.respect = 0;
    this.drunk = 0;
    this.haze = 0;
    this.cigar = null;
    this.topView = false;
    this.extraSpeech = null;
    this.side = new SideEvents(this);
    this.bar = null; // your bar between nights (BarTycoon), set up by main.js once the models load
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (this.hud?.choice) return;
      if (k === 'e' && !e.repeat) this.togglePeek();
      if (k === 'v' && !e.repeat) this.toggleTopView();
      if (k === 'q' && !e.repeat) this.side.puff();
      if (k === 'f' && !e.repeat) this.fastForward();
      if (e.key === 'Enter' && this.phase === 'menu') this.startFromMenu(!!this.savedRun);
    });
  }

  // ---------------- what the player has seen so far ----------------
  // The engine finishes a batch of events instantly; the HUD only shows what the animations
  // have revealed, so it reads this state instead of the engine's.

  resetShown() {
    this.shown = {
      hand: 0, button: -1, actor: -1,
      bets: [0, 0, 0, 0], out: [false, false, false, false], folded: [false, false, false, false],
      board: [], hole: [],
    };
  }

  // ---------------- menu & lifecycle ----------------

  newGame() {
    if (this.ff) { this.tweens.timeScale = this.ff.prevScale; this.ff = null; }
    const day = this.run.day;
    this.game = createGame({
      players: CAST.map((c) => ({ id: c.id, name: c.short, isHuman: !!c.isHuman, stack: c.isHuman ? this.run.stake : opponentStack(day) })),
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
    });
    // drinks make you a little luckier; nothing on screen says so
    this.game.deckFn = makeLuckyDeckFn(() => this.dayStats?.drinks ?? 0);
    this.game.players.forEach((p, i) => this.stacks[i].setValue(p.stack));
    this.dayStats = { start: this.run.stake, history: [this.run.stake], handsWon: 0, biggestPot: 0, drinks: 0, cigars: 0, roulette: [] };
    this.respect = 0;
    this.drunk = 0;
    this.haze = 0;
    this.topView = false;
    this.cashOutRequested = false;
    this.nextEventHand = nextEventGap();
    this.side?.clear();
    this.pot.clear();
    this.cards.clear();
    this.hole = [[], [], [], []];
    this.board = [];
    this.selected = [];
    this.endResult = null;
    this.peeking = false;
    this.peeked = false;
    this.cutscene = false;
    this.gameOverState = null;
    this.resetShown();
    this.hud.reset();
    this.room.reset();
    this._hideFirstPerson();
    this._placeDealerButton(this.game.button, true);
  }

  /** Title menu: the camera drifts around the dark room behind a single Start button. */
  showMenu() {
    if (!this.game) this.newGame();
    this.phase = 'menu';
    this.look.locked = true;
    this.look.override = null;
    this.look.blend = 1;
    this.menuT = 0;
    this._menuShot(0);
  }

  _menuShot(t) {
    const a = 0.65 + Math.sin(t * 0.07) * 0.35;
    this.look.setShot(V(Math.sin(a) * 2.1, 1.75 + Math.sin(t * 0.13) * 0.05, Math.cos(a) * 2.1), V(0, 0.85, 0), 55);
  }

  async _fade(key, to, duration) {
    const u = this.pr.post.uniforms[key];
    const from = u.value;
    await this.tweens.add({ duration, easing: ease.linear, update: (t) => { u.value = from + (to - from) * t; } });
  }

  /** Start: the screen goes black and you're simply in your seat when it comes back. */
  async startFromMenu(continueRun = false) {
    if (this.phase !== 'menu') return;
    if (continueRun && this.savedRun) this.run = { ...this.savedRun, items: [...this.savedRun.items] };
    else { this.run = newRun(); clearRun(); }
    this.savedRun = null;
    this.phase = 'black';
    await this._fade('fadeAll', 1, 0.5);
    await this._sitDown();
  }

  /** Fade in at the table for tonight's game. */
  async _sitDown() {
    saveRun(this.run);
    this.newGame();
    this.look.blend = 0;
    this.look.locked = false;
    this.look.override = null;
    this.look.yaw = 0;
    this.look.pitch = this.look.pitchRest;
    await this.tweens.wait(0.45);
    this.phase = 'playing';
    this._fade('fadeAll', 0, 0.8);
    this.hud.message(`Night ${this.run.day}. You sit down with ${money(this.run.stake)}.`, COLORS.gold, 4);
    this._loop();
  }

  async backToMenu() {
    if (this.phase !== 'over' && this.phase !== 'gameover') return;
    this.phase = 'black';
    await this._fade('fadeAll', 1, 0.5);
    const u = this.pr.post.uniforms;
    u.fade.value = 0;
    u.tintAmount.value = 0;
    this.gameOverState = null;
    this.game = null;
    this.savedRun = loadRun();
    this.newGame();
    this.showMenu();
    await this._fade('fadeAll', 0, 0.7);
  }

  // ---------------- F: skip to the end of a hand you've folded ----------------

  /** True while you've folded and two or more others are still playing the hand out. */
  canFastForward() {
    const g = this.game;
    if (!g || this.phase !== 'playing' || this.cutscene || this.ff || g.street === 'done') return false;
    if (!this.shown.folded[0]) return false;
    return g.players.filter((p) => !p.folded && !p.out).length >= 2;
  }

  /**
   * F after folding: the screen snaps to black, the rest of the hand plays out unseen at high
   * speed, and the lights come back up just as the winner turns their cards over.
   */
  async fastForward() {
    if (!this.canFastForward()) return;
    if (this.topView) this._exitTopViewNow();
    const ff = { prevScale: this.tweens.timeScale };
    this.ff = ff;
    ff.fading = this._fade('fadeAll', 1, 0.16);
    await ff.fading;
    if (this.ff === ff) this.tweens.timeScale = Math.max(40, ff.prevScale * 40);
  }

  /** The hand reached its end: back to normal speed and fade in on the result. */
  async _endFastForward() {
    const ff = this.ff;
    if (!ff) return;
    this.ff = null;
    await ff.fading;
    this.tweens.timeScale = ff.prevScale;
    // nothing said in the dark lingers on screen
    this.hud.messages.length = 0;
    for (const p of this.hud.plates) p.speech = null;
    this.look.blend = 0;
    await this._fade('fadeAll', 0, 0.35);
  }

  // ---------------- cashing out, the overview, your bar ----------------

  /** 5 / the Cash out button: confirm, then leave with what's in front of you. */
  async requestCashOut() {
    if (!this.hud.prompt || this.hud.choice || this.cutscene || this.phase !== 'playing') return;
    const p = this.game.players[0];
    const inPot = p.committed > 0 ? ` The ${money(p.committed)} you already put in the pot stays there.` : '';
    const yes = await this.hud.choose({
      title: 'Cash out?',
      text: `Get up and leave with ${money(p.stack)}.${inPot}`,
      options: [
        { label: `Cash out ${money(p.stack)}`, value: true, accent: COLORS.sage },
        { label: 'Keep playing', value: false },
      ],
      cancel: false,
    });
    if (!yes || !this.hud.prompt) return;
    this.cashOutRequested = true;
    this.hud._resolve({ type: 'fold' }); // the loop sees the request and stops before applying it
  }

  /** Leave the table: build the overview, split the money between the bar and tomorrow. */
  async cashOut(reason = 'cashout') {
    if (this.phase !== 'playing' && this.phase !== 'over') return;
    this.phase = 'black';
    this.hud.prompt = null;
    this.hud.raiseInput = null;
    if (this.topView) this._exitTopViewNow();
    await this._fade('fadeAll', 1, 0.6);
    const end = this.game.players[0].stack;
    const st = this.dayStats;
    const history = st.history.slice();
    const cashBar = history[history.length - 1] !== end; // money changed since the last hand (roulette, an abandoned hand)
    if (cashBar) history.push(end);
    const { toBar, stake } = splitCashOut(end);
    this.overview = {
      day: this.run.day, reason, start: st.start, end, history, cashBar,
      handsPlayed: st.history.length - 1, handsWon: st.handsWon, biggestPot: st.biggestPot,
      drinks: st.drinks, cigars: st.cigars, roulette: st.roulette.filter((r) => r.won),
      mood: mafiaMood(st.start, end, this.respect + (this.run.items.includes('portrait') ? 8 : 0)),
      toBar, stake, t: 0,
    };
    this.run.barFund += toBar;
    this.run.stake = stake;
    this.run.bestCashOut = Math.max(this.run.bestCashOut, end);
    this._saveForTomorrow();
    this.side.clear();
    this.drunk = 0;
    this.haze = 0;
    this.cards.clear();
    this.pot.clear();
    this.hole = [[], [], [], []];
    this.board = [];
    this.cutscene = false;
    this.look.locked = true;
    this.phase = 'overview';
    sound.play('cashOut');
    await this._fade('fadeAll', 0, 0.6);
  }

  _saveForTomorrow() { saveRun(nextNight(this.run)); }

  async toBar() {
    if (this.phase !== 'overview') return;
    this.phase = 'black';
    await this._fade('fadeAll', 1, 0.4);
    this.bar.enter(this.run);
    this.phase = 'bar';
    sound.play('footsteps');
    await this._fade('fadeAll', 0, 0.6);
  }

  buy(item) {
    if (this.phase !== 'bar' || this.run.items.includes(item.id) || this.run.barFund < item.price) return;
    this.run.barFund -= item.price;
    this.run.items.push(item.id);
    this._saveForTomorrow();
    sound.play('buy');
    this.bar.bought(item, item.id === 'portrait' ? 'The family will hear you hung the Don on your wall.' : `${item.name} - it's in.`);
  }

  /** Through the back-room door: the money left in the bar fund comes to the table with you. */
  async nextDay() {
    if (this.phase !== 'bar') return;
    this.phase = 'black';
    await this._fade('fadeAll', 1, 0.5);
    this.bar.leave();
    this.run = nextNight(this.run);
    this.room.reset();
    await this._sitDown();
  }

  async _loop() {
    const g = this.game;
    while (g.status === 'playing') {
      if (this.pendingStacks) this._applyStacks();
      await this.present(startHand(g));
      if (this.topView) this._showMyCardsTop();
      while (g.street !== 'done') {
        const seat = g.actionOn;
        const action = seat === 0 ? await this._humanTurn() : await this._aiTurn(seat);
        if (this.game !== g) return; // reset mid-hand
        if (this.cashOutRequested) return this.cashOut('cashout');
        await this.present(applyAction(g, action));
      }
      this.dayStats.history.push(g.players[0].stack);
      await this.tweens.wait(1.1);
      if (this.peeking) await this._unpeek();
      await this._clearCards();
      this._checkSync();
      this._afterHand();
      if (g.status === 'playing' && (this.forcedEvent || g.handNumber >= this.nextEventHand)) {
        const kind = this.forcedEvent ?? this.side.choose();
        this.forcedEvent = null;
        this.nextEventHand = g.handNumber + nextEventGap();
        if (this.topView) await this._exitTopView();
        const r = await this.side.run(kind);
        if (r === 'dead' || this.game !== g) return;
      }
    }
    if (this.game !== g) return;
    this.endResult = g.players[0].out ? 'lose' : 'win';
    if (this.endResult === 'lose') await this._gameOverScene();
    else { this.phase = 'over'; sound.play('win'); }
  }

  /** Between hands: the drink wears off a bit, the cigar burns down. */
  _afterHand() {
    this.drunk = Math.max(0, this.drunk - 0.18);
    if (this.cigar && ++this.cigar.hands >= 6) this.side.burnOut();
  }

  async _humanTurn() {
    const legal = legalActions(this.game);
    for (let s = 1; s < 4; s++) this.room.characters[s]?.lookAt(this.playerEye);
    return this.hud.requestAction(legal);
  }

  async _aiTurn(seat) {
    for (let s = 1; s < 4; s++) if (s !== seat) this.room.characters[s]?.lookAt(this.room.headPosition(seat));
    this.room.characters[seat]?.lookAt(this.potSpot);
    this.thinking = seat;
    const view = playerView(this.game, seat); // the AI only ever sees this
    const d = decide(view, this.cast[seat].style);
    const think = 0.6 + Math.random() * 1.0 + (d.type === 'fold' ? 0 : 0.3) + (d.bluff ? 0.4 : 0);
    await this.tweens.wait(think);
    this.thinking = null;
    return { type: d.type, amount: d.amount };
  }

  // ---------------- event presentation ----------------

  async present(events) {
    let i = 0;
    while (i < events.length) {
      const e = events[i];
      if (e.type === 'deal') {
        const batch = [];
        while (i < events.length && events[i].type === 'deal') batch.push(events[i++]);
        await this._dealHole(batch);
        continue;
      }
      await this._event(e);
      i++;
    }
    this._checkSync();
  }

  async _event(e) {
    const hud = this.hud;
    const sh = this.shown;
    switch (e.type) {
      case 'handStart':
        sh.hand = e.hand;
        sh.button = e.button;
        sh.bets = [0, 0, 0, 0];
        sh.folded = sh.out.slice();
        sh.board = [];
        sh.hole = [];
        sh.actor = -1;
        this.peeked = false;
        this.revealed = new Set();
        for (let s = 0; s < 4; s++) hud.setStatus(s, '');
        await this._placeDealerButton(e.button);
        break;
      case 'blind':
        sh.bets[e.seat] += e.amount;
        hud.setStatus(e.seat, `${e.blind === 'small' ? 'Small blind' : 'Big blind'} ${money(e.amount)}`, COLORS.bone);
        await this._throw(e.seat, e.amount);
        break;
      case 'turn':
        sh.actor = e.seat;
        break;
      case 'action':
        sh.actor = -1;
        if (e.action === 'fold') sh.folded[e.seat] = true;
        else sh.bets[e.seat] = e.to;
        await this._action(e);
        break;
      case 'return':
        sh.bets[e.seat] = Math.max(0, sh.bets[e.seat] - e.amount);
        hud.message(e.seat === 0 ? `Your uncalled ${money(e.amount)} comes back` : `${this.cast[e.seat].label} takes back ${money(e.amount)}`, COLORS.bone, 2.5);
        await this._slideFromPot(e.seat, e.amount);
        break;
      case 'streetEnd':
        sh.bets = [0, 0, 0, 0];
        break;
      case 'street':
        sh.actor = -1;
        sh.board.push(...e.cards);
        for (let s = 0; s < 4; s++) if (!this.game.players[s].folded && !this.game.players[s].allIn) hud.setStatus(s, '');
        await this._dealBoard(e.cards, e.street);
        break;
      case 'showdown':
        if (this.ff) await this._endFastForward();
        await this._showdown(e);
        break;
      case 'award':
        if (this.ff) await this._endFastForward();
        await this._award(e);
        break;
      case 'eliminated':
        sh.out[e.seat] = true;
        hud.setStatus(e.seat, 'Out', COLORS.smoke);
        if (e.seat !== 0) {
          hud.message(`${this.cast[e.seat].label} is out`, COLORS.redLight);
          await this._muck(e.seat);
          await this._bustScene(e.seat);
        }
        break;
      default:
        break;
    }
  }

  async _action(e) {
    const seat = e.seat;
    const hud = this.hud;
    const ch = this.room.characters[seat];
    const lines = this.cast[seat].lines;
    const talk = (key, p) => { if (lines && Math.random() < p) hud.say(seat, pick(lines[key])); };
    switch (e.action) {
      case 'fold':
        hud.setStatus(seat, 'Fold', COLORS.smoke);
        talk('fold', 0.4);
        if (seat === 0 && this.canFastForward()) this.hud.message('Press F to skip to the end of the hand', COLORS.bone, 6);
        sound.play('fold');
        await this._muck(seat);
        break;
      case 'check':
        hud.setStatus(seat, 'Check', COLORS.bone);
        ch?.knock();
        talk('check', 0.2);
        await this._knockGesture(seat);
        break;
      case 'call':
        hud.setStatus(seat, e.allIn ? 'All in' : `Call ${money(e.amount)}`, e.allIn ? COLORS.redLight : COLORS.paper);
        ch?.knock();
        if (e.allIn) talk('allIn', 0.8); else talk('call', 0.2);
        await this._throw(seat, e.amount);
        break;
      case 'bet':
      case 'raise': {
        const big = e.amount >= Math.max(150, (e.pot - e.amount) * 0.7);
        const label = e.allIn ? 'All in' : `${e.action === 'bet' ? 'Bet' : 'Raise to'} ${money(e.to)}`;
        hud.setStatus(seat, label, e.allIn ? COLORS.redLight : COLORS.gold);
        if (e.allIn) talk('allIn', 0.85);
        else if (big) talk('bigBet', 0.7);
        else talk('raise', 0.35);
        if (seat === 0 && big) {
          const s = 1 + Math.floor(Math.random() * 3);
          if (!this.game.players[s].folded && !this.game.players[s].out && Math.random() < 0.5) {
            hud.say(s, pick(['Big talk.', 'Ohh, tough guy.', 'Hmm.', 'Easy, kid.']));
          }
        }
        await this._throw(seat, e.amount);
        break;
      }
      default:
        break;
    }
  }

  /** Throw `amount` worth of chips from a seat's stack into the pot. */
  async _throw(seat, amount) {
    if (amount <= 0) return;
    const stack = this.stacks[seat];
    const chosen = seat === 0 ? this._selectedFor(amount) : null;
    let chips;
    if (chosen) {
      stack.chips = stack.chips.filter((c) => !chosen.includes(c));
      chips = chosen;
      for (const c of chips) c.lift = 0;
      this.selected = [];
    } else {
      if (seat === 0) this.clearChipSelection();
      chips = stack.take(amount);
    }
    // an opponent reaches for his stack first, then pushes the chips out
    const ch = this._arm(seat);
    if (ch) await ch.gesture(this.tweens, [{ to: this._felt(stack.origin, 0.07), dur: 0.34, ease: ease.anticipate }]);
    const landing = this.pot.receive(chips);
    stack.layout();
    if (ch) {
      ch.gesture(this.tweens, [
        { to: this._felt(seatSpots(seat).bet, 0.04), dur: 0.26, ease: ease.outBack, hold: 0.14 },
        { to: null, dur: 0.5, ease: ease.inOutCubic },
      ]);
    }
    await landing;
  }

  async _slideFromPot(seat, amount) {
    const ch = this._arm(seat);
    // the winner leans in and rakes the pot back toward himself
    if (ch) await ch.gesture(this.tweens, [{ to: this._felt(this.potSpot, 0.05), dur: 0.38, ease: ease.anticipate, hold: 0.08 }]);
    const chips = this.pot.take(amount);
    this.stacks[seat].add(chips);
    const slide = this.stacks[seat].layout();
    if (ch) ch.gesture(this.tweens, [{ to: this._felt(this.stacks[seat].origin, 0.05), dur: 0.5, ease: ease.inOutCubic }, { to: null, dur: 0.45, ease: ease.inOutCubic }]);
    await slide;
    sound.play('chipStack');
  }

  /** An opponent reaches out and lays his hand on his cards (before turning them over). */
  async _touchCards(seat) {
    const ch = this._arm(seat);
    const card = this.hole[seat]?.find(Boolean);
    if (!ch || !card) return;
    await ch.gesture(this.tweens, [{ to: this._felt(card.position, 0.03), dur: 0.32, ease: ease.anticipate, hold: 0.06 }]);
    ch.gesture(this.tweens, [
      { to: this._felt(card.position, 0.12), dur: 0.18, ease: ease.outQuint },
      { to: null, dur: 0.45, ease: ease.inOutCubic },
    ]);
  }

  /** An opponent with a working arm, or null (you, or someone who's gone). */
  _arm(seat) {
    const ch = seat ? this.room.characters[seat] : null;
    return ch && !ch.gone && ch.armRest ? ch : null;
  }

  /** A point just above the felt. */
  _felt(p, lift = 0.03) { return V(p.x, TABLE_HEIGHT + lift, p.z); }

  /** Check: two quick knocks on the felt in front of him. */
  async _knockGesture(seat) {
    const ch = this._arm(seat);
    if (!ch) { sound.play('knock'); await this.tweens.wait(0.25); return; }
    const p = seatSpots(seat).cards;
    await ch.gesture(this.tweens, [{ to: this._felt(p, 0.09), dur: 0.22, ease: ease.outQuint }]);
    for (let i = 0; i < 2; i++) {
      await ch.gesture(this.tweens, [{ to: this._felt(p, 0.012), dur: 0.07, ease: ease.inCubic }]);
      sound.play('knock');
      this.look.shake = Math.max(this.look.shake, 0.004);
      await ch.gesture(this.tweens, [{ to: this._felt(p, 0.06), dur: 0.09, ease: ease.outQuad }]);
    }
    await ch.gesture(this.tweens, [{ to: null, dur: 0.4, ease: ease.inOutCubic }]);
  }

  // ---------------- cards ----------------

  async _dealHole(batch) {
    const jobs = batch.map((e, k) => {
      const spots = seatSpots(e.seat);
      const isMe = e.seat === 0;
      const card = this.cards.create(isMe ? e.card : null, V(DECK_SPOT.x, CARD_Y + 0.025, DECK_SPOT.z), { flipAxis: isMe ? 'x' : 'z' });
      this.hole[e.seat][e.round] = card;
      if (isMe) this.shown.hole[e.round] = e.card;
      const side = (e.round === 0 ? -1 : 1) * (isMe ? 0.045 : 0.03);
      const base = spots.cards;
      const to = V(base.x + spots.right.x * side, CARD_Y + e.round * 0.0015, base.z + spots.right.z * side);
      const yaw = isMe ? (e.round ? -0.06 : 0.05) : SEAT_ANGLES[e.seat] + (e.round ? 0.08 : -0.08);
      card.userData.rest = { pos: to.clone(), yaw };
      return this.cards.deal(card, to, { yaw, delay: k * 0.09, duration: 0.3 });
    });
    await Promise.all(jobs);
  }

  async _dealBoard(newCards, street) {
    if (this.peeking) await this._unpeek();
    const start = this.board.length;
    const objs = newCards.map((v, k) => {
      const i = start + k;
      const card = this.cards.create(v, V(DECK_SPOT.x, CARD_Y + 0.025, DECK_SPOT.z));
      card.scale.setScalar(BOARD_CARD_SCALE);
      this.board.push(card);
      const to = V(BOARD_SPOT.x + (i - 2) * 0.088 * BOARD_CARD_SCALE * 1.05, CARD_Y, BOARD_SPOT.z);
      return { card, to, job: this.cards.deal(card, to, { yaw: 0, delay: k * 0.12, duration: 0.32 }) };
    });
    await Promise.all(objs.map((o) => o.job));
    if (this.topView) {
      await Promise.all(objs.map((o, k) => this.cards.flip(o.card, true, { delay: k * 0.12 })));
      await this.tweens.wait(0.5);
      return;
    }
    // zoom in on the cards that just hit the felt, flip them, then ease back to the seat
    const center = objs.reduce((a, o) => a.add(o.to), V(0, 0, 0)).multiplyScalar(1 / objs.length);
    const wide = objs.length > 1;
    this.look.setShot(center.clone().add(V(0, wide ? 0.42 : 0.3, wide ? 0.26 : 0.17)), center.clone().add(V(0, 0, -0.01)), wide ? 50 : 40);
    await this._blendTo(1, 0.45);
    await Promise.all(objs.map((o, k) => this.cards.flip(o.card, true, { delay: k * 0.12 })));
    await this.tweens.wait(street === 'flop' ? 1.0 : 0.85);
    await this._blendTo(0, 0.45);
  }

  _blendTo(target, duration) {
    const from = this.look.blend;
    return this.tweens.add({ duration, easing: ease.inOutCubic, update: (t) => { this.look.blend = from + (target - from) * t; } });
  }

  /** E: lean in and tip up the near corners of your two cards (or put them back down). */
  async togglePeek() {
    if (this.phase !== 'playing' || this.cutscene || this._peekBusy) return;
    if (this.peeking) return this._unpeek();
    const mine = this.hole[0].filter(Boolean);
    if (mine.length < 2 || this.shown.folded[0] || this.look.blend > 0.01) return;
    this._peekBusy = true;
    this.peeking = true;
    this.peeked = true;
    this.hud.raiseInput = null;
    const center = mine.reduce((a, c) => a.add(c.userData.rest.pos), V(0, 0, 0)).multiplyScalar(0.5);
    const cfg = this.peekCfg;
    this.look.setShot(center.clone().add(V(...cfg.cam)), center.clone().add(V(...cfg.look)), cfg.fov);
    const hand = this.fp?.peek;
    const handFrom = center.clone().add(V(...cfg.handFrom));
    const handTo = center.clone().add(V(...cfg.hand));
    if (hand) { hand.visible = true; hand.scale.setScalar(0.85); hand.position.copy(handFrom); hand.rotation.set(...cfg.handRot); }
    this.peekLight.position.copy(center).add(V(0, 0.015, 0.13));
    await Promise.all([
      this._blendTo(1, 0.4),
      this.tweens.add({ duration: 0.5, update: (t) => { this.peekLight.intensity = 0.5 * t; } }),
      hand && this.tweens.add({ duration: 0.38, easing: ease.outBack, update: (t) => hand.position.lerpVectors(handFrom, handTo, t) }),
    ]);
    sound.play('cardFlip');
    await this.tweens.add({
      duration: 0.32, easing: ease.outBack,
      update: (t) => {
        mine.forEach((c, i) => this._tip(c, t, i));
        if (hand) { hand.position.copy(handTo).add(V(0, 0.04 * t, -0.015 * t)); hand.rotation.x = cfg.handRot[0] - 0.3 * t; }
      },
    });
    this._peekBusy = false;
  }

  /** Lift the near edge of a card about its far edge, with a little roll so one corner leads. */
  _tip(card, t, i) {
    const rest = card.userData.rest;
    const th = this.peekCfg.tilt * t;
    const roll = (i === 1 ? -0.28 : -0.16) * t;
    const half = CARD_LEN / 2;
    card.rotation.set(-th, rest.yaw, roll, 'YXZ');
    card.position.set(rest.pos.x, rest.pos.y + half * Math.sin(th) + 0.004 * t, rest.pos.z - half * (1 - Math.cos(th)));
  }

  async _unpeek() {
    if (!this.peeking || this._peekBusy) return;
    this._peekBusy = true;
    const mine = this.hole[0].filter(Boolean);
    const hand = this.fp?.peek;
    const hp = hand?.position.clone();
    await Promise.all([
      this.tweens.add({ duration: 0.25, easing: ease.inOutQuad, update: (t) => mine.forEach((c, i) => this._tip(c, 1 - t, i)) }),
      hand && this.tweens.add({ duration: 0.3, update: (t) => hand.position.lerpVectors(hp, hp.clone().add(V(0.15, -0.08, 0.3)), t) }),
      this._blendTo(0, 0.4),
      this.tweens.add({ duration: 0.35, update: (t) => { this.peekLight.intensity = 0.5 * (1 - t); } }),
    ]);
    if (hand) hand.visible = false;
    for (const c of mine) { c.rotation.set(0, c.userData.rest.yaw, 0); c.position.copy(c.userData.rest.pos); }
    this.peeking = false;
    this._peekBusy = false;
  }

  async _showdown(e) {
    if (this.peeking) await this._unpeek();
    this.hud.message('Showdown', COLORS.gold, 2.5);
    const flips = [];
    await Promise.all(e.hands.map((h) => this._touchCards(h.seat)));
    for (const h of e.hands) {
      this.revealed?.add(h.seat);
      this.hud.setStatus(h.seat, h.name, COLORS.lampGlow);
      h.hole.forEach((v, i) => {
        const card = this.hole[h.seat][i];
        if (!card) return;
        this.cards.setValue(card, v); // opponents' cards are revealed only now
        flips.push(this.cards.flip(card, true, { delay: flips.length * 0.12 }));
      });
    }
    await Promise.all(flips);
    for (let s = 1; s < 4; s++) this.room.characters[s]?.lookAt(this.potSpot);
    await this.tweens.wait(1.3);
  }

  /**
   * Whoever wins turns their cards up, showdown or not, and the camera leans in on them.
   * Only the main pot gets the close-up; a side-pot winner just flips.
   */
  async _showWinners(seats, zoom) {
    if (this.peeking) await this._unpeek();
    await Promise.all(seats.filter((s) => !this.revealed?.has(s)).map((s) => this._touchCards(s)));
    const flips = [];
    for (const seat of seats) {
      if (this.revealed?.has(seat)) continue;
      this.revealed?.add(seat);
      const values = this.game.players[seat].hole;
      this.hole[seat].forEach((card, i) => {
        if (!card) return;
        if (seat !== 0) this.cards.setValue(card, values[i]);
        if (card.userData.topShown) { card.userData.topShown = false; card.getObjectByName('flip').rotation[card.userData.flipAxis] = Math.PI; }
        flips.push(this.cards.flip(card, true, { delay: flips.length * 0.1 }));
      });
      const board = this.game.board;
      this.hud.setStatus(seat, board.length >= 3 ? describeScore(evaluate([...values, ...board])) : 'Shows', COLORS.lampGlow);
    }
    const cards = seats.flatMap((s) => this.hole[s].filter(Boolean));
    if (!zoom || !cards.length || this.topView) { await Promise.all(flips); return; }
    // lean in over the winning cards from below their bottom edge, so they read the right way
    // up (a face-up card's top edge points along its local -Z; board cards at yaw 0 face you)
    const center = cards.reduce((a, c) => a.add(c.position), V(0, 0, 0)).multiplyScalar(1 / cards.length);
    const top = V(0, 0, -1).applyQuaternion(cards[0].getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const wide = seats.length > 1 ? 0.25 : 0;
    this.look.setShot(center.clone().addScaledVector(top, -(0.2 + wide)).add(V(0, 0.3 + wide, 0)), center, 46 + wide * 40);
    await Promise.all([this._blendTo(1, 0.45), ...flips]);
    await this.tweens.wait(1.3);
    await this._blendTo(0, 0.45);
  }

  async _award(e) {
    await this._showWinners(e.winners.map((w) => w.seat), e.pot === 0);
    const potName = e.pot === 0 ? (this.game.lastHand?.pots?.length > 1 ? 'the main pot' : 'the pot') : `side pot ${e.pot}`;
    const names = e.winners.map((w) => this.cast[w.seat].label);
    const text = e.winners.length > 1
      ? `${names.join(' & ')} split ${potName}, ${money(e.amount)}`
      : `${names[0]} ${names[0] === 'You' ? 'win' : 'wins'} ${potName === 'the pot' ? money(e.amount) : `${potName}, ${money(e.amount)}`}`;
    this.hud.message(e.handName ? `${text} - ${e.handName}` : text, e.winners.some((w) => w.seat === 0) ? COLORS.lampGlow : COLORS.paper, 4);
    for (const w of e.winners) {
      if (w.seat !== 0) {
        if (Math.random() < 0.55) this.hud.say(w.seat, pick(this.cast[w.seat].lines.win));
      } else if (e.amount >= 200) {
        const losers = [1, 2, 3].filter((s) => !this.game.players[s].out && this.game.players[s].lastAction);
        if (losers.length && Math.random() < 0.6) {
          const s = pick(losers);
          this.hud.say(s, pick(this.cast[s].lines.lose));
        }
      }
    }
    const mine = e.winners.find((w) => w.seat === 0);
    if (mine) {
      if (e.pot === 0) this.dayStats.handsWon++;
      this.dayStats.biggestPot = Math.max(this.dayStats.biggestPot, e.amount);
    }
    await Promise.all(e.winners.map((w) => this._slideFromPot(w.seat, w.amount)));
    await this.tweens.wait(0.4);
  }

  async _muck(seat) {
    if (seat === 0 && this.peeking) await this._unpeek();
    const cards = this.hole[seat].filter(Boolean);
    this.hole[seat] = [];
    // he puts a hand on his cards and flicks them away toward the deck
    const ch = this._arm(seat);
    if (ch && cards.length) {
      await ch.gesture(this.tweens, [{ to: this._felt(cards[0].position, 0.03), dur: 0.3, ease: ease.anticipate }]);
      ch.gesture(this.tweens, [
        { to: this._felt(cards[0].position.clone().lerp(V(DECK_SPOT.x, 0, DECK_SPOT.z), 0.35), 0.06), dur: 0.2, ease: ease.outQuint },
        { to: null, dur: 0.45, ease: ease.inOutCubic },
      ]);
    }
    await Promise.all(cards.map((c, i) => {
      c.rotation.x = 0;
      if (c.userData.topShown) { c.getObjectByName('flip').rotation[c.userData.flipAxis] = Math.PI; c.userData.topShown = false; }
      const to = V(DECK_SPOT.x - 0.12 + Math.random() * 0.04, CARD_Y + 0.004 + i * 0.002, DECK_SPOT.z + 0.08);
      return this.cards.deal(c, to, { yaw: Math.random() * 3, duration: 0.3 }).then(() => this.cards.remove(c));
    }));
  }

  async _clearCards() {
    const all = [...this.cards.cards];
    const to = V(DECK_SPOT.x, CARD_Y + 0.02, DECK_SPOT.z);
    await Promise.all(all.map((c, i) => this.cards.deal(c, to, { yaw: 0.4, duration: 0.25, delay: i * 0.02, lift: 0.03 })));
    this.cards.clear();
    this.hole = [[], [], [], []];
    this.board = [];
    for (let s = 0; s < 4; s++) if (!this.game.players[s].out) this.hud.setStatus(s, '');
  }

  async _placeDealerButton(seat, instant = false) {
    const btn = this.dealerButton;
    if (!btn) return;
    const s = seatSpots(seat).dealerButton;
    const to = V(s.x, TABLE_HEIGHT + 0.001, s.z);
    if (instant) { btn.position.copy(to); return; }
    const from = btn.position.clone();
    await this.tweens.add({ duration: 0.4, easing: ease.outBack, update: (t) => btn.position.lerpVectors(from, to, t) });
  }

  // ---------------- game over ----------------

  _hideFirstPerson() {
    if (!this.fp) return;
    for (const o of [this.fp.gun, this.fp.grip, this.fp.peek, this.fp.open].filter(Boolean)) {
      o.visible = false;
      if (o.parent !== this.fp.scene) this.fp.scene.add(o);
      o.position.set(0, -5, 0);
      o.quaternion.identity();
      o.scale.setScalar(1);
    }
    this.fp.tremble = 0;
  }

  /** Turn the seated camera toward a world point (cutscenes). */
  _faceToward(p, pitchBias = 0) {
    const d = p.clone().sub(this.playerEye);
    this.look.override = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) + pitchBias };
  }

  /**
   * An opponent who goes broke doesn't walk out: he says his last words, brings a revolver
   * up to his temple and pulls the trigger. Flash, he slumps, the screen cuts to black, and
   * when the light comes back his chair is empty.
   */
  async _bustScene(seat) {
    const ch = this.room.characters[seat];
    if (!ch || ch.gone) return;
    ch.gestureId++;
    if (this.peeking) await this._unpeek();
    if (this.topView) await this._exitTopView();
    const u = this.pr.post.uniforms;
    const lines = this.cast[seat].lines;
    this.cutscene = true;
    this.look.locked = true;
    const head = this.room.headPosition(seat);
    this._faceToward(head, -0.16);
    for (let s = 1; s < 4; s++) if (s !== seat) this.room.characters[s]?.lookAt(head);
    ch.lookAt(this.playerEye);

    // a little warm light on him, the only time he's properly seen
    if (!this.bustLight) {
      this.bustLight = new THREE.PointLight(0xffb070, 0, 1.6, 2);
      this.bustLight.name = 'BustLight';
      this.room.scene.add(this.bustLight);
    }
    const light = this.bustLight;
    const toTable = V(-head.x, 0, -head.z).normalize();
    const hisRight = V(-1, 0, 0).applyQuaternion(ch.root.getWorldQuaternion(new THREE.Quaternion()));
    // in front of him and out on his gun side, so the raised arm catches it too
    light.position.copy(head).addScaledVector(toTable, 0.3).addScaledVector(hisRight, 0.38).add(V(0, 0.02, 0));
    this.tweens.add({ duration: 0.9, update: (t) => { light.intensity = 1.5 * t; } });
    this.hud.say(seat, pick(lines.lastWords), 3.4);
    await this.tweens.wait(2.6);

    // his right hand comes up with a revolver to his temple
    let gun = null;
    let solved = null;
    if (ch.armRest && this.fp?.gun) {
      ch.root.updateMatrixWorld(true);
      const right = hisRight;
      const neck = ch.head.getWorldPosition(V(0, 0, 0));
      const temple = neck.clone().add(V(0, 0.13, 0)).addScaledVector(right, 0.06);
      const target = neck.clone().add(V(0, 0.16, 0)).addScaledVector(right, 0.2).addScaledVector(toTable, 0.02);
      const shoulder = ch.upperArm.getWorldPosition(V(0, 0, 0));
      const pole = shoulder.clone().addScaledVector(right, 0.4).add(V(0, -0.3, 0)).addScaledVector(toTable, -0.05);
      solved = ch.solveArm(target, pole);
      ch.setArm(1, solved);
      ch.root.updateMatrixWorld(true);
      gun = this.fp.gun.clone(true);
      gun.name = 'BustRevolver';
      gun.visible = true;
      gun.scale.setScalar(1.25); // reads at the far side of the table
      this.room.scene.add(gun);
      gun.position.copy(ch.handTip.getWorldPosition(V(0, 0, 0)));
      gun.lookAt(temple); // the barrel runs along +Z, as in your own roulette scene
      ch.foreArm.attach(gun);
      ch.setArm(0);
      ch.lookAt(null);
      sound.play('gunGrab');
      await this.tweens.add({ duration: 1.2, easing: ease.anticipate, update: (t) => ch.setArm(t, solved) });
    }
    // a beat of nothing
    for (let s = 1; s < 4; s++) if (s !== seat) this.room.characters[s]?.lookAt(head);
    await this.tweens.wait(1.5);

    // bang
    sound.play('gunshot');
    light.position.copy(head).add(V(0, 0.1, 0));
    light.intensity = 6;
    u.tint.value.set(1, 0.93, 0.8);
    u.tintAmount.value = 0.45;
    this.look.shake = 0.1;
    this.tweens.add({ duration: 0.12, update: (t) => { u.tintAmount.value = 0.45 * (1 - t); light.intensity = 6 * (1 - t) + 0.3; } });
    await this.tweens.add({ duration: 0.35, easing: ease.settle, update: (t) => { ch.slump = t; } });
    u.fade.value = 1;
    u.tintAmount.value = 0;
    light.intensity = 0;
    await this.tweens.wait(1.2);

    // lights up: the chair is empty
    if (gun) { gun.removeFromParent(); }
    this.room.vanish(seat);
    await this._fade('fade', 0, 0.9);
    const others = [1, 2, 3].filter((s) => s !== seat && !this.shown.out[s]);
    if (others.length) {
      const s = pick(others);
      this.hud.say(s, pick(this.cast[s].lines.afterBust), 3);
      this.room.characters[s]?.lookAt(this.playerEye);
      await this.tweens.wait(1.8);
    }
    for (let s = 1; s < 4; s++) this.room.characters[s]?.lookAt(null);
    this.look.override = null;
    this.look.locked = false;
    this.cutscene = false;
  }

  /** You're broke. Don Sal slides a revolver across the felt; you pick it up. */
  async _gameOverScene() {
    this.cutscene = true;
    this.hud.prompt = null;
    this.look.locked = true;
    if (this.topView) this._exitTopViewNow();
    const thrower = !this.shown.out[2] ? 2 : ([1, 3].find((s) => !this.shown.out[s]) ?? 2);
    const head = this.room.headPosition(thrower);
    const d = head.clone().sub(this.playerEye);
    this.look.override = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) - 0.18 };
    for (let s = 1; s < 4; s++) this.room.characters[s]?.lookAt(this.playerEye);
    this.hud.say(thrower, thrower === 2 ? 'Nothing personal, kid. Just business.' : 'The boss says you know what to do.', 3);
    await this.tweens.wait(2.0);
    await this._gunSlide(thrower);
    await this._gunPickUp();
    await this._gunToHead();
    await this.tweens.wait(1.1);
    await this._gunFire('You ran out of chips.');
  }

  /** Height for the gun's origin (its grip) so that, turned to `quat`, its lowest point just touches the felt. */
  _gunRestHeight(quat) {
    const gun = this.fp.gun;
    const p = gun.position.clone(), q = gun.quaternion.clone();
    gun.position.set(0, 0, 0);
    gun.quaternion.copy(quat);
    gun.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gun, true);
    gun.position.copy(p);
    gun.quaternion.copy(q);
    gun.updateMatrixWorld(true);
    return TABLE_HEIGHT + 0.003 - (box.isEmpty() ? 0 : box.min.y);
  }

  /** Someone slides the revolver across the felt to you. */
  async _gunSlide(thrower) {
    const ch = this.room.characters[thrower];
    const gun = this.fp.gun;
    if (gun.parent !== this.fp.scene) this.fp.scene.attach(gun);
    const from = ch ? ch.root.localToWorld(V(0.14, 0.88, 0.5)) : V(0, 0.9, -0.6);
    const rest = GUN_REST.clone();
    // the origin is the grip, not the bottom of the gun: lift it so it lies on the felt, not in it
    const restY = this._gunRestHeight(rest);
    const land = V(0.06, restY, 0.4);
    this._gunFrom = from;
    gun.visible = true;
    gun.position.copy(from);
    this.look.override = { yaw: -0.02, pitch: -0.6 };
    const spin = new THREE.Quaternion();
    sound.play('gunThrow');
    await this.tweens.add({
      duration: 0.9, easing: ease.linear,
      update: (t) => {
        gun.position.lerpVectors(from, land, t);
        gun.position.y = Math.max(gun.position.y, restY) + Math.sin(Math.PI * t) * 0.32;
        spin.setFromAxisAngle(V(0, 1, 0), (1 - t) * Math.PI * 5);
        gun.quaternion.copy(rest).premultiply(spin);
      },
    });
    sound.play('gunDrop');
    this.look.shake = 0.025;
    const slideTo = land.clone().add(V(-0.03, 0, 0.06));
    await this.tweens.add({ duration: 0.3, easing: ease.settle, update: (t) => gun.position.lerpVectors(land, slideTo, t) });
    await this.tweens.wait(0.9);
  }

  /**
   * Reach in and pick it up. Your open hand comes out of the corner of the screen, slows as it
   * arrives over the grip, the fingers close (the open hand swaps for the gripping one) and the
   * gun snaps into the palm. It's heavy: it comes up off the felt slowly and settles with a bob.
   */
  async _gunPickUp() {
    const gun = this.fp.gun;
    const grip = this.fp.grip;
    const open = this.fp.open ?? grip;
    const handPose = new THREE.Object3D();
    handPose.lookAt(V(-0.45, -0.05, -1));
    // lifted far enough that the gun, turned upright in the hand, stays above the felt
    const grabAt = gun.position.clone().add(V(0, 0.035, 0));
    grabAt.y = Math.max(grabAt.y, this._gunRestHeight(handPose.quaternion) + 0.01);
    handPose.position.copy(grabAt);
    const hFrom = V(0.34, 0.45, 1.0);
    const hover = grabAt.clone().add(V(0.05, 0.07, 0.09));
    this.look.override = { yaw: -0.03, pitch: -0.7 }; // lean in over it
    // a little warm fill so your hand reads in the dark, as it comes in
    this.peekLight.position.copy(grabAt).add(V(0.1, 0.25, 0.25));
    this.tweens.add({ duration: 0.4, update: (t) => { this.peekLight.intensity = 0.45 * t; } });
    open.visible = true;
    open.position.copy(hFrom);
    open.quaternion.copy(handPose.quaternion);
    await this.tweens.add({
      duration: 0.42, easing: ease.outCubic,
      update: (t) => { open.position.lerpVectors(hFrom, hover, t); open.position.y += Math.sin(Math.PI * t) * 0.03; },
    });
    await this.tweens.add({ duration: 0.13, easing: ease.inCubic, update: (t) => open.position.lerpVectors(hover, grabAt, t) });
    // the fingers close round the grip
    if (open !== grip) open.visible = false;
    grip.visible = true;
    grip.position.copy(grabAt);
    grip.quaternion.copy(handPose.quaternion);
    sound.play('gunGrab');
    this.look.shake = Math.max(this.look.shake, 0.012);
    const g0 = gun.position.clone();
    const gq0 = gun.quaternion.clone();
    await this.tweens.add({
      duration: 0.09, easing: ease.outQuint,
      update: (t) => { gun.position.lerpVectors(g0, grabAt, t); gun.quaternion.copy(gq0).slerp(handPose.quaternion, t); },
    });
    grip.attach(gun);
    gun.position.set(0, 0, 0);
    gun.quaternion.identity();
    this.tweens.add({ duration: 0.18, easing: ease.linear, update: (t) => grip.scale.setScalar(1 + 0.05 * Math.sin(Math.PI * t)) });
    // heavy: a slow start off the felt, then a little bob as the weight settles in the hand
    const lift = grabAt.clone().add(V(-0.02, 0.09, 0.07));
    await this.tweens.add({ duration: 0.55, easing: ease.settle, update: (t) => grip.position.lerpVectors(grabAt, lift, t) });
    this._gunGrab = { pos: lift.clone(), table: grabAt.clone(), quat: handPose.quaternion.clone() };
    await this.tweens.wait(0.2);
  }

  /** Raise it to your temple: it dips first with the weight, then comes up and settles. */
  async _gunToHead() {
    const hand = this.fp.grip;
    const right = V(1, 0, 0), fwd = V(0, 0, -1), up = V(0, 1, 0);
    this.look.override = { yaw: -0.16, pitch: -0.02 };
    const p0 = hand.position.clone();
    const q0 = hand.quaternion.clone();
    const p1 = this.playerEye.clone().addScaledVector(right, 0.17).addScaledVector(fwd, 0.15).addScaledVector(up, -0.02);
    const aim = new THREE.Object3D();
    aim.position.copy(p1);
    // barrel turned in toward your temple, forearm trailing down and out to the right
    aim.lookAt(this.playerEye.clone().addScaledVector(up, 0.015).addScaledVector(fwd, 0.05));
    const light = this.peekLight;
    light.position.copy(p1).addScaledVector(fwd, -0.12).addScaledVector(right, -0.08);
    const clamp01 = (t) => Math.min(1, Math.max(0, t));
    await this.tweens.add({
      duration: 1.2, easing: ease.anticipate,
      update: (t) => {
        hand.position.lerpVectors(p0, p1, t);
        hand.position.y += Math.sin(Math.PI * clamp01(t)) * 0.06;
        hand.quaternion.copy(q0).slerp(aim.quaternion, clamp01(t));
        light.intensity = 0.18 * clamp01(t);
      },
    });
    hand.position.copy(p1);
    this.look.shake = Math.max(this.look.shake, 0.01); // the muzzle meets your head
    this.fp.tremble = 1;
  }

  /** Bang. Black, then red, then GAME OVER. The run is over. */
  async _gunFire(reason) {
    const u = this.pr.post.uniforms;
    clearRun();
    this.savedRun = null;
    sound.play('gunshot');
    u.tint.value.set(1, 0.95, 0.85);
    u.tintAmount.value = 1;
    this.look.shake = 0.35;
    await this.tweens.wait(0.07);
    u.fade.value = 1;
    u.tintAmount.value = 0;
    this.peekLight.intensity = 0;
    this._hideFirstPerson();
    this.side.clear();
    this.drunk = 0;
    this.haze = 0;
    await this.tweens.wait(1.3);
    this.phase = 'gameover';
    this.gameOverState = { reveal: 0, ready: 0, reason };
    u.tint.value.set(0.42, 0.02, 0.03);
    this._fade('tintAmount', 0.7, 3.0);
    await this.tweens.wait(1.2);
    const go = this.gameOverState;
    await this.tweens.add({ duration: 3.4, easing: ease.linear, update: (t) => { go.reveal = t; } });
    await this.tweens.add({ duration: 0.9, easing: ease.linear, update: (t) => { go.ready = t; } });
    this.cutscene = false;
    this.look.override = null;
  }

  /** You lived: lower the gun, set it on the felt, let go and slide it back. */
  async _gunPutDown() {
    const grip = this.fp.grip;
    const open = this.fp.open ?? grip;
    const gun = this.fp.gun;
    this.fp.tremble = 0;
    this.look.override = { yaw: -0.02, pitch: -0.62 };
    const p0 = grip.position.clone();
    const q0 = grip.quaternion.clone();
    const g = this._gunGrab;
    await this.tweens.add({
      duration: 0.85, easing: ease.inOutCubic,
      update: (t) => { grip.position.lerpVectors(p0, g.pos, t); grip.quaternion.copy(q0).slerp(g.quat, t); this.peekLight.intensity = 0.18 * (1 - t); },
    });
    // down onto the felt with a thud
    await this.tweens.add({ duration: 0.16, easing: ease.inCubic, update: (t) => grip.position.lerpVectors(g.pos, g.table, t) });
    sound.play('gunDrop');
    this.look.shake = Math.max(this.look.shake, 0.02);
    this.fp.scene.attach(gun);
    // the fingers open and the hand pulls away
    if (open !== grip) {
      open.position.copy(grip.position);
      open.quaternion.copy(grip.quaternion);
      open.visible = true;
      grip.visible = false;
    }
    const hFrom = open.position.clone();
    await this.tweens.add({ duration: 0.4, easing: ease.inCubic, update: (t) => open.position.lerpVectors(hFrom, V(0.34, 0.45, 1.0), t) });
    open.visible = false;
    grip.visible = false;
    const gp = gun.position.clone();
    const gq = gun.quaternion.clone();
    // lay it back on its side, resting on the felt, then slide it back across
    const rest = GUN_REST.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
    const restY = this._gunRestHeight(rest);
    const to = this._gunFrom ? this._gunFrom.clone().setY(restY).lerp(V(0, restY, 0), 0.4) : V(0, restY, -0.4);
    sound.play('slide');
    await this.tweens.add({
      duration: 0.7, easing: ease.outCubic,
      update: (t) => {
        gun.quaternion.copy(gq).slerp(rest, Math.min(1, t * 2.5));
        gun.position.lerpVectors(gp, to, t);
        // never lower than resting on the felt in its current tilt
        gun.position.y = Math.max(gun.position.y, this._gunRestHeight(gun.quaternion));
      },
    });
    await this.tweens.wait(0.2);
    this._hideFirstPerson();
  }

  // ---------------- V: the view from above the table ----------------

  async toggleTopView() {
    if (this.phase !== 'playing' || this.cutscene || this._peekBusy || this._topBusy) return;
    if (this.topView) return this._exitTopView();
    if (this.peeking) await this._unpeek();
    if (this.look.blend > 0.01) return; // a board close-up is playing
    this._topBusy = true;
    this.topView = true;
    this.look.setShot(V(0, 1.7, 0.06), V(0, TABLE_HEIGHT, 0.04), 64, V(0, 0, -1));
    this._showMyCardsTop();
    await this._blendTo(1, 0.45);
    this._topBusy = false;
  }

  async _exitTopView() {
    if (!this.topView || this._topBusy) return;
    this._topBusy = true;
    this._hideMyCardsTop();
    await this._blendTo(0, 0.45);
    this.topView = false;
    this._topBusy = false;
  }

  _exitTopViewNow() {
    this._hideMyCardsTop();
    this.look.blend = 0;
    this.topView = false;
    this._topBusy = false;
  }

  /** From above, your own two cards lie face up so you can read them. */
  _showMyCardsTop() {
    for (const c of this.hole[0].filter(Boolean)) {
      if (c.userData.faceUp || c.userData.topShown) continue;
      c.userData.topShown = true;
      c.getObjectByName('flip').rotation[c.userData.flipAxis] = 0;
    }
    if (this.hole[0].filter(Boolean).length === 2) this.peeked = true;
  }

  _hideMyCardsTop() {
    for (const c of this.cards.cards) {
      if (!c.userData.topShown) continue;
      c.userData.topShown = false;
      if (!c.userData.faceUp) c.getObjectByName('flip').rotation[c.userData.flipAxis] = Math.PI;
    }
  }

  // ---------------- chips you click ----------------

  selectedValue() { return this.selected.reduce((s, c) => s + c.value, 0); }

  clearChipSelection() {
    for (const c of this.selected) c.lift = 0;
    this.selected = [];
  }

  _selectedFor(amount) {
    return this.selectedValue() === amount ? [...this.selected] : null;
  }

  /** Click a column in your own stack: lift its top chip into the bet you're building. */
  handleClick() {
    const ui = this.ui;
    if (!ui.clicked || this.phase !== 'playing' || !this.hud.prompt || this.cutscene || this.look.blend > 0.05) return;
    if (ui.clicked.button === 2) { this.clearChipSelection(); ui.consumeClick(); return; }
    const ndc = new THREE.Vector2((ui.clicked.x + 0.5) / ui.w * 2 - 1, -((ui.clicked.y + 0.5) / ui.h * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const stack = this.stacks[0];
    let best = null;
    for (const col of stack.columns) {
      const plane = new THREE.Plane(V(0, 1, 0), -(TABLE_HEIGHT + Math.min(col.n, 10) * this.chips.h * 0.5));
      const hit = ray.ray.intersectPlane(plane, V(0, 0, 0));
      if (!hit) continue;
      const d = Math.hypot(hit.x - col.x, hit.z - col.z);
      if (d < this.chips.r * 1.5 && (!best || d < best.d)) best = { col, d };
    }
    if (!best) return;
    ui.consumeClick();
    const legal = this.hud.prompt.legal;
    const chip = stack.chips
      .filter((c) => c.value === best.col.value && !this.selected.includes(c))
      .filter((c) => Math.hypot(c.pos.x - best.col.x, c.pos.z - best.col.z) < 0.005)
      .sort((a, b) => b.pos.y - a.pos.y)[0];
    if (!chip || this.selectedValue() + chip.value > legal.stack) return;
    chip.lift = 0.02 + this.selected.length * 0.0005;
    this.selected.push(chip);
    sound.play('chipStack');
    this.hud.onChipsSelected();
  }

  // ---------------- misc ----------------

  potValue() { return this.pot.value; }

  /** Testing hook: queue new stacks to apply when the table is idle before the next hand. */
  queueStacks(arr) {
    const total = this.game.players.reduce((s, p) => s + p.stack + p.committed, 0);
    if (arr.reduce((s, v) => s + v, 0) !== total) throw new Error('total chips must not change');
    this.pendingStacks = arr;
  }

  _applyStacks() {
    this.pendingStacks.forEach((v, i) => {
      const p = this.game.players[i];
      p.stack = v;
      p.out = v === 0;
      this.shown.out[i] = p.out;
      this.stacks[i].setValue(v);
    });
    this.pendingStacks = null;
  }

  /** After each batch of events the chips on the table must equal the engine's numbers. */
  _checkSync() {
    const g = this.game;
    this.syncErrors = this.syncErrors ?? 0;
    g.players.forEach((p, i) => {
      const shown = this.stacks[i].value;
      if (shown !== p.stack) {
        this.syncErrors++;
        console.error(`stack ${i} drawn ${shown} but engine has ${p.stack}; correcting`);
        this.stacks[i].setValue(p.stack);
      }
    });
    const pot = potTotal(g);
    if (this.pot.value !== pot) {
      this.syncErrors++;
      console.error(`pot drawn ${this.pot.value} but engine has ${pot}`);
    }
  }

  update(dt) {
    this.chips.update();
    this.side.update(dt);
    this.haze = Math.max(0, this.haze - dt * 0.35);
    const u = this.pr.post.uniforms;
    const playing = this.phase === 'playing' || this.phase === 'over';
    u.drunk.value += ((playing ? this.drunk : 0) - u.drunk.value) * Math.min(1, dt * 1.5);
    u.haze.value = playing ? this.haze : 0;
    this.look.drunk = u.drunk.value;
    if (this.phase === 'menu') {
      this.menuT += dt;
      this._menuShot(this.menuT);
    }
    if (this.fp?.tremble && this.fp.grip.visible) {
      this.fp.grip.position.x += (Math.random() - 0.5) * 0.0012;
      this.fp.grip.position.y += (Math.random() - 0.5) * 0.0012;
    }
  }
}
