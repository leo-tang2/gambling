import { describe, it, expect } from 'vitest';
import {
  createGame, startHand, applyAction, legalActions, computePots, playerView, totalChips,
} from '../src/holdem/engine/engine.js';
import { seededRng } from '../src/holdem/engine/rng.js';
import { rigged, players } from './helpers.js';

const act = (g, type, amount) => applyAction(g, { type, amount });
const foldOut = (g) => { while (g.street !== 'done') act(g, 'fold'); };

describe('button rotation and blinds', () => {
  it('starts the button on a random seat', () => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(createGame({ players: players(4) }).button);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('posts blinds left of the button and rotates every hand', () => {
    const g = createGame({ players: players(4), button: 0 });
    for (let hand = 0; hand < 8; hand++) {
      const ev = startHand(g);
      const b = hand % 4;
      expect(g.button).toBe(b);
      expect(g.sbSeat).toBe((b + 1) % 4);
      expect(g.bbSeat).toBe((b + 2) % 4);
      expect(g.actionOn).toBe((b + 3) % 4); // under the gun
      const blinds = ev.filter((e) => e.type === 'blind');
      expect(blinds.map((e) => [e.seat, e.amount])).toEqual([[(b + 1) % 4, 10], [(b + 2) % 4, 20]]);
      expect(ev.filter((e) => e.type === 'deal')).toHaveLength(8);
      foldOut(g);
    }
  });

  it('skips eliminated players', () => {
    const g = createGame({ players: players(4), button: 0 });
    g.players[1].out = true;
    startHand(g);
    expect([g.sbSeat, g.bbSeat, g.actionOn]).toEqual([2, 3, 0]);
    expect(g.players[1].hole).toHaveLength(0);
    foldOut(g);
    startHand(g);
    expect(g.button).toBe(2);
    expect([g.sbSeat, g.bbSeat, g.actionOn]).toEqual([3, 0, 2]);
  });

  it('heads-up: the button posts the small blind, acts first preflop and last after', () => {
    const g = createGame({ players: players(2), button: 0 });
    startHand(g);
    expect([g.sbSeat, g.bbSeat, g.actionOn]).toEqual([0, 1, 0]);
    act(g, 'call');
    expect(g.actionOn).toBe(1); // big blind option
    expect(legalActions(g).canCheck).toBe(true);
    act(g, 'check');
    expect(g.street).toBe('flop');
    expect(g.actionOn).toBe(1);
  });

  it('a short big blind posts all-in and others still owe the full blind', () => {
    const g = createGame({ players: players(3, [1000, 1000, 15]), button: 0 });
    startHand(g);
    expect(g.players[2].allIn).toBe(true);
    expect(g.players[2].committed).toBe(15);
    expect(legalActions(g).toCall).toBe(20);
  });
});

describe('minimum raises', () => {
  it('follows no-limit min-raise rules preflop and postflop', () => {
    const g = createGame({ players: players(4), button: 0 });
    startHand(g);
    expect(legalActions(g).minRaiseTo).toBe(40);
    act(g, 'raise', 60); // seat 3 raises by 40
    expect(legalActions(g).minRaiseTo).toBe(100);
    expect(() => act(g, 'raise', 90)).toThrow(/minimum raise/);
    act(g, 'raise', 100); // seat 0
    expect(legalActions(g).minRaiseTo).toBe(140);
    act(g, 'call'); // 1
    act(g, 'call'); // 2
    act(g, 'call'); // 3
    expect(g.street).toBe('flop');
    expect(g.actionOn).toBe(1);
    const l = legalActions(g);
    expect(l.isBet).toBe(true);
    expect(l.minRaiseTo).toBe(20);
    act(g, 'bet', 50);
    expect(legalActions(g).minRaiseTo).toBe(100);
  });

  it('rejects raises larger than the stack and allows all-in for less', () => {
    const g = createGame({ players: players(3, [30, 1000, 1000]), button: 1 });
    startHand(g); // sb=2, bb=0 (stack 30), actor 1
    act(g, 'raise', 100);
    // seat 2 then seat 0
    act(g, 'call');
    const l = legalActions(g);
    expect(g.actionOn).toBe(0);
    expect(l.canRaise).toBe(false); // can only call all-in for less
    expect(l.toCall).toBe(10);
    expect(() => act(g, 'raise', 2000)).toThrow();
    act(g, 'allin');
    expect(g.players[0].allIn).toBe(true);
  });

  it('a short all-in raise does not reopen betting for players who already acted', () => {
    const g = createGame({ players: players(3, [150, 1000, 1000]), button: 0 });
    startHand(g); // sb=1 bb=2 actor 0
    act(g, 'call'); act(g, 'call'); act(g, 'check');
    expect(g.street).toBe('flop');
    act(g, 'bet', 100); // seat 1
    act(g, 'call'); // seat 2
    act(g, 'allin'); // seat 0: 130 total, a raise of only 30
    expect(g.currentBet).toBe(130);
    let l = legalActions(g);
    expect(l.seat).toBe(1);
    expect(l.toCall).toBe(30);
    expect(l.canRaise).toBe(false);
    act(g, 'call');
    l = legalActions(g);
    expect(l.seat).toBe(2);
    expect(l.canRaise).toBe(false);
    act(g, 'call');
    expect(g.street).toBe('turn');
  });

  it('a full all-in raise reopens betting', () => {
    const g = createGame({ players: players(3, [250, 1000, 1000]), button: 0 });
    startHand(g);
    act(g, 'call'); act(g, 'call'); act(g, 'check');
    act(g, 'bet', 100);
    act(g, 'call');
    act(g, 'allin'); // 230: a raise of 130
    const l = legalActions(g);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(360);
  });

  it('a player who has not acted yet may still raise over a short all-in', () => {
    const g = createGame({ players: players(3, [1000, 1000, 150]), button: 0 });
    startHand(g);
    act(g, 'call'); act(g, 'call'); act(g, 'check');
    act(g, 'bet', 100); // seat 1
    act(g, 'allin'); // seat 2: 130
    const l = legalActions(g);
    expect(l.seat).toBe(0);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(230);
  });
});

describe('pots', () => {
  it('builds side pots for different all-in amounts and pays each correctly', () => {
    const g = createGame({
      players: players(4, [100, 300, 600, 1000]),
      button: 0,
      deckFn: rigged({ 0: 'As Ad', 1: 'Ks Kd', 2: 'Qs Qd', 3: '9c 7h' }, '2c 5d 8h Js 3c'),
    });
    startHand(g); // actor 3
    act(g, 'allin');
    act(g, 'allin');
    act(g, 'allin');
    const ev = act(g, 'allin');
    const returned = ev.find((e) => e.type === 'return');
    expect(returned).toEqual({ type: 'return', seat: 3, amount: 400 });
    expect(g.lastHand.pots).toEqual([
      { amount: 400, eligible: [0, 1, 2, 3] },
      { amount: 600, eligible: [1, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ]);
    expect(g.players.map((p) => p.stack)).toEqual([400, 600, 600, 400]);
    expect(g.board).toHaveLength(5);
  });

  it('a short stack can win only the main pot; the rest goes to the next best hand', () => {
    const g = createGame({
      players: players(3, [100, 1000, 1000]),
      button: 0,
      deckFn: rigged({ 0: 'As Ad', 1: 'Ks Kd', 2: '9c 7h' }, '2c 5d 8h Js 3c'),
    });
    startHand(g);
    act(g, 'allin'); // seat 0 shoves 100
    act(g, 'raise', 400); // seat 1
    act(g, 'call'); // seat 2
    expect(g.street).toBe('flop');
    act(g, 'check'); act(g, 'check');
    act(g, 'check'); act(g, 'check');
    act(g, 'check'); act(g, 'check');
    expect(g.lastHand.pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 600, eligible: [1, 2] },
    ]);
    expect(g.players.map((p) => p.stack)).toEqual([300, 1200, 600]);
  });

  it('splits tied pots and gives the odd chip to the first winner left of the button', () => {
    const g = createGame({
      players: players(3),
      smallBlind: 5,
      bigBlind: 10,
      button: 0,
      deckFn: rigged({ 0: '2c 3d', 1: '4h 5h', 2: '6c 7d' }, 'As Ks Qs Js Ts'),
    });
    startHand(g);
    act(g, 'call'); // seat 0
    act(g, 'fold'); // seat 1 leaves 5 dead
    act(g, 'check'); // seat 2
    for (let i = 0; i < 6; i++) act(g, 'check');
    expect(g.lastHand.awards[0]).toEqual([{ seat: 2, amount: 13 }, { seat: 0, amount: 12 }]);
    expect(g.players.map((p) => p.stack)).toEqual([1002, 995, 1003]);
  });

  it('returns an uncalled bet when everyone folds', () => {
    const g = createGame({ players: players(3), button: 0 });
    startHand(g);
    act(g, 'raise', 100);
    act(g, 'fold');
    const ev = act(g, 'fold');
    expect(ev.find((e) => e.type === 'return')).toMatchObject({ seat: 0, amount: 80 });
    expect(ev.find((e) => e.type === 'award')).toMatchObject({ amount: 50, winners: [{ seat: 0, amount: 50 }] });
    expect(g.players.map((p) => p.stack)).toEqual([1030, 990, 980]);
  });

  it('computePots counts folded players\' chips as dead money', () => {
    const g = createGame({ players: players(3), button: 0 });
    startHand(g);
    act(g, 'raise', 100); act(g, 'call'); act(g, 'fold');
    expect(computePots(g)).toEqual([{ amount: 220, eligible: [0, 1] }]);
  });
});

describe('game end and elimination', () => {
  it('eliminates busted players and ends the game when one player has everything', () => {
    const g = createGame({
      players: players(3, [100, 100, 1000]),
      button: 0,
      deckFn: rigged({ 0: '9c 7h', 1: 'Ks Kd', 2: 'As Ad' }, '2c 5d 8h Js 3c'),
    });
    startHand(g);
    act(g, 'allin'); act(g, 'allin'); act(g, 'call');
    expect(g.players.map((p) => p.out)).toEqual([true, true, false]);
    expect(g.status).toBe('over');
    expect(g.winnerSeat).toBe(2);
    expect(() => startHand(g)).toThrow();
  });

  it('ends the game as soon as the human busts', () => {
    const g = createGame({
      players: players(4, [100, 1000, 1000, 1000]),
      button: 3,
      deckFn: rigged({ 0: '9c 7h', 1: 'Ks Kd', 2: '4c 4d', 3: '6h 6s' }, '2c 5d Ah Js 3c'),
    });
    startHand(g); // sb 0, bb 1, actor 2
    act(g, 'fold'); act(g, 'fold'); act(g, 'allin'); act(g, 'call');
    expect(g.players[0].out).toBe(true);
    expect(g.status).toBe('over');
    expect(g.winnerSeat).toBe(-1);
  });
});

describe('information hiding', () => {
  it('a player view contains only that player\'s hole cards and no deck', () => {
    const g = createGame({ players: players(4), button: 0 });
    startHand(g);
    const v = playerView(g, g.actionOn);
    expect(v.hole).toEqual(g.players[g.actionOn].hole);
    expect(v).not.toHaveProperty('deck');
    for (const p of v.players) expect(p).not.toHaveProperty('hole');
    expect(JSON.stringify(v)).not.toContain('deck');
  });
});

describe('random full games', () => {
  it('conserve chips and always reach a legal end', () => {
    for (let game = 0; game < 150; game++) {
      const rng = seededRng(1000 + game);
      const g = createGame({ players: players(4), rng });
      const total = totalChips(g);
      let hands = 0;
      while (g.status === 'playing' && hands < 3000) {
        startHand(g);
        hands++;
        while (g.street !== 'done') {
          const l = legalActions(g);
          const p = g.players[l.seat];
          expect(p.out || p.folded || p.allIn).toBe(false);
          const opts = ['fold'];
          if (l.canCheck) opts.push('check', 'check');
          if (l.canCall) opts.push('call', 'call');
          if (l.canRaise) opts.push('raise', 'allin');
          const type = opts[rng.int(opts.length)];
          let amount;
          if (type === 'raise') amount = l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1);
          act(g, type, amount);
          expect(totalChips(g)).toBe(total);
          for (const q of g.players) expect(q.stack).toBeGreaterThanOrEqual(0);
        }
        expect(g.players.reduce((a, q) => a + q.stack, 0)).toBe(total);
      }
      expect(g.status).toBe('over');
    }
  });
});
