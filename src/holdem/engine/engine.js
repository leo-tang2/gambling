// Pure no-limit Texas Hold'em engine. No rendering, no timers, no DOM.
// Every mutating call returns the list of events it produced, in order, so a renderer
// can animate them (deals, blinds, actions, street cards, returns, awards...).

import { shuffledDeck } from './deck.js';
import { secureRng } from './rng.js';
import { evaluate, bestFive, describeScore } from './evaluator.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

export function createGame({
  players,
  startingStack = 1000,
  smallBlind = 10,
  bigBlind = 20,
  rng = secureRng,
  button,
  deckFn = null, // tests only: (game) => array of cards, dealt from the end
}) {
  if (players.length < 2) throw new Error('need at least two players');
  return {
    smallBlind,
    bigBlind,
    rng,
    deckFn,
    players: players.map((p, seat) => ({
      id: p.id ?? `p${seat}`,
      name: p.name ?? `Player ${seat + 1}`,
      seat,
      isHuman: !!p.isHuman,
      stack: p.stack ?? startingStack,
      hole: [],
      folded: false,
      allIn: false,
      out: false,
      bet: 0, // chips in front of the player this street
      committed: 0, // chips put in this hand (all streets)
      pending: false, // must still act this street
      canRaise: false, // betting has been (re)opened for this player
      lastAction: null,
      ...freshHandStats(),
    })),
    button: button ?? rng.int(players.length), // random starting dealer button
    handNumber: 0,
    deck: [],
    board: [],
    street: 'idle', // idle | preflop | flop | turn | river | done
    currentBet: 0,
    lastRaiseSize: bigBlind,
    raisesThisStreet: 0,
    actionOn: -1,
    sbSeat: -1,
    bbSeat: -1,
    status: 'playing', // playing | over
    winnerSeat: -1,
    lastHand: null, // summary of the most recent finished hand
    _events: [],
  };
}

// ---------- helpers ----------

const emit = (g, e) => g._events.push(e);
const flush = (g) => {
  const out = g._events;
  g._events = [];
  return out;
};

/**
 * Public record of how a player has acted this hand (everyone at the table saw it):
 * bets/raises preflop, in total and on the current street, and whether they put money in
 * voluntarily preflop. The AI uses this to guess what its opponents might be holding.
 */
function freshHandStats() {
  return { preRaises: 0, raises: 0, streetRaises: 0, vpip: false };
}

export const isLive = (p) => !p.out && !p.folded;
const canAct = (p) => isLive(p) && !p.allIn;

/** Next seat clockwise after `from` whose player matches `pred`. */
export function nextSeat(g, from, pred = (p) => !p.out) {
  const n = g.players.length;
  for (let i = 1; i <= n; i++) {
    const s = (from + i) % n;
    if (pred(g.players[s])) return s;
  }
  return -1;
}

export const activeCount = (g) => g.players.filter((p) => !p.out).length;
export const potTotal = (g) => g.players.reduce((a, p) => a + p.committed, 0);

function put(g, p, amount) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.committed += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

function draw(g) {
  const c = g.deck.pop();
  if (c === undefined) throw new Error('deck exhausted');
  return c;
}

// ---------- hand lifecycle ----------

export function startHand(g) {
  if (g.status !== 'playing') throw new Error('game is over');
  if (activeCount(g) < 2) throw new Error('not enough players');
  g.handNumber++;
  if (g.handNumber > 1 || g.players[g.button].out) g.button = nextSeat(g, g.button);

  for (const p of g.players) {
    p.hole = [];
    p.folded = p.out;
    p.allIn = false;
    p.bet = 0;
    p.committed = 0;
    p.pending = false;
    p.canRaise = false;
    p.lastAction = null;
    Object.assign(p, freshHandStats());
  }
  g.deck =g.deckFn ? g.deckFn(g) : shuffledDeck(g.rng); // fresh, unbiased shuffle every hand
  g.board = [];
  g.street = 'preflop';
  g.currentBet = 0;
  g.lastRaiseSize = g.bigBlind;
  g.raisesThisStreet = 0;
  g.lastHand = null;

  emit(g, { type: 'handStart', hand: g.handNumber, button: g.button });

  // Blinds. Heads-up: the button posts the small blind and acts first preflop.
  if (activeCount(g) === 2) {
    g.sbSeat = g.button;
    g.bbSeat = nextSeat(g, g.button);
  } else {
    g.sbSeat = nextSeat(g, g.button);
    g.bbSeat = nextSeat(g, g.sbSeat);
  }
  const sb = g.players[g.sbSeat];
  const bb = g.players[g.bbSeat];
  const sbAmt = put(g, sb, g.smallBlind);
  emit(g, { type: 'blind', seat: sb.seat, blind: 'small', amount: sbAmt, allIn: sb.allIn });
  const bbAmt = put(g, bb, g.bigBlind);
  emit(g, { type: 'blind', seat: bb.seat, blind: 'big', amount: bbAmt, allIn: bb.allIn });
  g.currentBet = g.bigBlind; // others owe a full big blind even if the BB is short

  // Deal two cards each, one at a time, starting left of the button.
  const order = [];
  let s = g.button;
  for (let i = 0; i < activeCount(g); i++) {
    s = nextSeat(g, s);
    order.push(s);
  }
  for (let round = 0; round < 2; round++) {
    for (const seat of order) {
      const card = draw(g);
      g.players[seat].hole.push(card);
      emit(g, { type: 'deal', seat, round, card });
    }
  }

  openStreet(g, g.bbSeat);
  advance(g);
  return flush(g);
}

function openStreet(g, firstActorAfter) {
  for (const p of g.players) {
    p.pending = canAct(p);
    p.canRaise = canAct(p);
    p.streetRaises = 0;
  }
  g.actionOn = firstActorAfter;
}

/** A player needs to act if betting is open to them and it still matters. */
function needsAction(g, p) {
  if (!canAct(p) || !p.pending) return false;
  const othersCanAct = g.players.some((q) => q !== p && canAct(q));
  if (!othersCanAct && p.bet >= g.currentBet) return false; // nothing left to decide
  return true;
}

function advance(g) {
  const live = g.players.filter(isLive);
  if (live.length === 1) return winUncontested(g, live[0]);

  const next = nextSeat(g, g.actionOn, (p) => needsAction(g, p));
  if (next >= 0) {
    g.actionOn = next;
    emit(g, { type: 'turn', seat: next, street: g.street });
    return;
  }
  endStreet(g);
}

function returnUncalled(g) {
  const live = g.players.filter((p) => !p.out);
  const sorted = [...live].sort((a, b) => b.bet - a.bet);
  const top = sorted[0];
  const second = sorted[1]?.bet ?? 0;
  if (top && top.bet > second) {
    const amt = top.bet - second;
    top.bet -= amt;
    top.committed -= amt;
    top.stack += amt;
    if (top.stack > 0) top.allIn = false;
    emit(g, { type: 'return', seat: top.seat, amount: amt });
  }
}

function endStreet(g) {
  returnUncalled(g);
  for (const p of g.players) p.bet = 0;
  emit(g, { type: 'streetEnd', street: g.street, pot: potTotal(g) });

  const live = g.players.filter(isLive);
  const actors = live.filter((p) => !p.allIn);

  if (g.street === 'river') return showdown(g);

  const idx = STREETS.indexOf(g.street);
  g.street = STREETS[idx + 1];
  draw(g); // burn
  const n = g.street === 'flop' ? 3 : 1;
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(draw(g));
  g.board.push(...cards);
  emit(g, { type: 'street', street: g.street, cards, board: [...g.board] });

  g.currentBet = 0;
  g.lastRaiseSize = g.bigBlind;
  g.raisesThisStreet = 0;
  if (actors.length <= 1) {
    // Everyone (or all but one) is all-in: run the board out with no betting.
    for (const p of g.players) p.pending = false;
    return endStreet(g);
  }
  openStreet(g, g.button);
  advance(g);
}

// ---------- actions ----------

export function legalActions(g) {
  if (g.street === 'idle' || g.street === 'done' || g.actionOn < 0) return null;
  const p = g.players[g.actionOn];
  const toCall = Math.min(g.currentBet - p.bet, p.stack);
  const maxRaiseTo = p.bet + p.stack;
  const othersCanAct = g.players.some((q) => q !== p && canAct(q));
  const canRaise = p.canRaise && othersCanAct && maxRaiseTo > g.currentBet;
  const fullMin = g.currentBet === 0 ? g.bigBlind : g.currentBet + g.lastRaiseSize;
  return {
    seat: p.seat,
    toCall,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    canRaise,
    isBet: g.currentBet === 0, // label: "bet" vs "raise"
    minRaiseTo: canRaise ? Math.min(fullMin, maxRaiseTo) : 0,
    maxRaiseTo: canRaise ? maxRaiseTo : 0,
    currentBet: g.currentBet,
    playerBet: p.bet,
    stack: p.stack,
  };
}

/**
 * Apply the current player's action.
 * action: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount? }
 * For bet/raise, `amount` is the total the player's bet becomes this street ("raise to").
 */
export function applyAction(g, action) {
  const legal = legalActions(g);
  if (!legal) throw new Error('no action expected');
  const p = g.players[g.actionOn];
  let { type } = action;
  let to = action.amount;

  if (type === 'allin') {
    if (legal.canRaise) { type = 'raise'; to = legal.maxRaiseTo; }
    else if (legal.canCall) type = 'call';
    else type = 'check';
  }
  if (type === 'bet') type = 'raise';

  let added = 0;
  switch (type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw new Error('cannot check facing a bet');
      break;
    case 'call':
      if (!legal.canCall) throw new Error('nothing to call');
      added = put(g, p, legal.toCall);
      if (g.street === 'preflop') p.vpip = true;
      break;
    case 'raise': {
      if (!legal.canRaise) throw new Error('raising is not allowed here');
      if (!Number.isInteger(to)) throw new Error('raise amount must be an integer');
      if (to > legal.maxRaiseTo) throw new Error(`raise to ${to} exceeds stack`);
      if (to < legal.minRaiseTo) throw new Error(`minimum raise is to ${legal.minRaiseTo}`);
      const raiseSize = to - g.currentBet;
      added = put(g, p, to - p.bet);
      const full = raiseSize >= g.lastRaiseSize;
      if (full) g.lastRaiseSize = raiseSize;
      g.currentBet = to;
      g.raisesThisStreet++;
      p.raises++;
      p.streetRaises++;
      if (g.street === 'preflop') { p.preRaises++; p.vpip = true; }
      for (const q of g.players) {
        if (q === p || !canAct(q)) continue;
        q.pending = true; // everyone must respond to the new amount
        if (full) q.canRaise = true; // only a full raise reopens raising for players who already acted
      }
      break;
    }
    default:
      throw new Error(`unknown action ${type}`);
  }

  p.pending = false;
  p.canRaise = false;
  const label = type === 'raise' ? (legal.isBet ? 'bet' : 'raise') : type;
  p.lastAction = { type: label, amount: added, to: p.bet, allIn: p.allIn };
  emit(g, {
    type: 'action', seat: p.seat, action: label, amount: added, to: p.bet,
    allIn: p.allIn, pot: potTotal(g), street: g.street,
  });
  advance(g);
  return flush(g);
}

// ---------- pots & showdown ----------

/** Split committed chips into a main pot and side pots with their eligible seats. */
export function computePots(g) {
  const contrib = g.players.map((p) => p.committed);
  const levels = [...new Set(contrib.filter((c) => c > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contrib) amount += Math.max(0, Math.min(c, level) - prev);
    const eligible = g.players.filter((p) => isLive(p) && p.committed >= level).map((p) => p.seat);
    const last = pots[pots.length - 1];
    if (last && (eligible.length === 0 || sameSet(last.eligible, eligible))) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }
  return pots.filter((p) => p.amount > 0);
}

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Seat order for odd chips: first seat left of the button gets the first extra chip. */
function seatsFromButton(g) {
  const out = [];
  for (let i = 1; i <= g.players.length; i++) out.push((g.button + i) % g.players.length);
  return out;
}

function distribute(g, pot, winners, potIndex, handName) {
  const order = seatsFromButton(g).filter((s) => winners.includes(s));
  const share = Math.floor(pot.amount / order.length);
  let odd = pot.amount - share * order.length;
  const result = order.map((seat) => {
    const amt = share + (odd > 0 ? 1 : 0);
    if (odd > 0) odd--;
    g.players[seat].stack += amt;
    return { seat, amount: amt };
  });
  emit(g, { type: 'award', pot: potIndex, amount: pot.amount, winners: result, handName });
  return result;
}

function winUncontested(g, winner) {
  returnUncalled(g);
  for (const p of g.players) p.bet = 0;
  const amount = potTotal(g);
  g.lastHand = { uncontested: true, winners: [winner.seat], pots: [{ amount, eligible: [winner.seat] }] };
  distribute(g, { amount }, [winner.seat], 0, null);
  finishHand(g);
}

function showdown(g) {
  g.street = 'showdown';
  const live = g.players.filter(isLive);
  const hands = live.map((p) => {
    const all = [...p.hole, ...g.board];
    const score = evaluate(all);
    return { seat: p.seat, hole: [...p.hole], score, name: describeScore(score), best: bestFive(all).cards };
  });
  emit(g, { type: 'showdown', hands, board: [...g.board] });
  const byseat = Object.fromEntries(hands.map((h) => [h.seat, h]));
  const pots = computePots(g);
  const awards = [];
  pots.forEach((pot, i) => {
    const contenders = pot.eligible.map((s) => byseat[s]);
    const best = Math.max(...contenders.map((h) => h.score));
    const winners = contenders.filter((h) => h.score === best).map((h) => h.seat);
    awards.push(distribute(g, pot, winners, i, byseat[winners[0]].name));
  });
  g.lastHand = { uncontested: false, hands, pots, awards };
  finishHand(g);
}

function finishHand(g) {
  g.street = 'done';
  g.actionOn = -1;
  for (const p of g.players) {
    p.committed = 0;
    if (!p.out && p.stack === 0) {
      p.out = true;
      emit(g, { type: 'eliminated', seat: p.seat });
    }
  }
  const remaining = g.players.filter((p) => !p.out);
  const human = g.players.find((p) => p.isHuman);
  if (remaining.length === 1) {
    g.status = 'over';
    g.winnerSeat = remaining[0].seat;
  } else if (human && human.out) {
    g.status = 'over';
    g.winnerSeat = -1;
  }
  emit(g, { type: 'handEnd', hand: g.handNumber, status: g.status, winnerSeat: g.winnerSeat });
}

// ---------- views ----------

/**
 * What one player is allowed to know: their own hole cards and public table state.
 * Opponent AI only ever receives this — never the deck or other players' cards.
 */
export function playerView(g, seat) {
  return {
    seat,
    hole: [...g.players[seat].hole],
    board: [...g.board],
    street: g.street,
    button: g.button,
    bigBlind: g.bigBlind,
    smallBlind: g.smallBlind,
    pot: potTotal(g),
    currentBet: g.currentBet,
    raisesThisStreet: g.raisesThisStreet,
    legal: g.actionOn === seat ? legalActions(g) : null,
    players: g.players.map((p) => ({
      seat: p.seat, name: p.name, stack: p.stack, bet: p.bet, committed: p.committed,
      folded: p.folded, allIn: p.allIn, out: p.out, lastAction: p.lastAction,
      preRaises: p.preRaises, raises: p.raises, streetRaises: p.streetRaises, vpip: p.vpip,
    })),
  };
}

export function totalChips(g) {
  return g.players.reduce((a, p) => a + p.stack + p.committed, 0);
}
