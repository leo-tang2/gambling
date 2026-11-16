import { COLORS } from '../../shared/render/palette.js';
import { PERSONALITIES } from '../ai/personalities.js';

// Seat 0 is the player. Seats go clockwise: 1 = your left, 2 = across, 3 = your right.
export const CAST = [
  { seat: 0, id: 'you', name: 'You', short: 'YOU', label: 'You', isHuman: true, color: COLORS.cream },
  {
    seat: 1, id: 'enforcer', model: 'enforcer', name: 'Bruno "The Brick" Rizzo', short: 'BRUNO', label: 'Bruno',
    title: 'the enforcer', style: PERSONALITIES.aggressive, color: COLORS.redLight,
    lines: {
      bigBet: ['Pay up or get out.', 'Feel that? That\'s pressure.', 'You want to see the next card? Costs extra.'],
      allIn: ['All of it. Every chip.', 'I\'m all in. Your move, tough guy.'],
      raise: ['Raise.', 'More.', 'Let\'s make it hurt.'],
      call: ['I\'ll see it.', 'Yeah, yeah. Call.'],
      check: ['Knock knock.', 'Check.'],
      fold: ['Tch. Take it.', 'Not this one.', 'Next time.'],
      win: ['That\'s how it\'s done.', 'Mine. All mine.', 'Don\'t look so sad.'],
      lose: ['...I\'ll remember that.', 'You got lucky.', 'Grr.'],
      bust: ['This ain\'t over.'],
      playerBust: ['Show him the door.'],
    },
  },
  {
    seat: 2, id: 'boss', model: 'boss', name: 'Don Salvatore "Sal" Bellini', short: 'DON SAL', label: 'Don Sal',
    title: 'the boss', style: PERSONALITIES.tight, color: COLORS.gold,
    lines: {
      bigBet: ['Let\'s see how much you believe.', 'A respectful bet. Respect it.'],
      allIn: ['Everything. Out of respect.', 'The family goes all in.'],
      raise: ['I raise.', 'A little more, I think.'],
      call: ['I\'ll call. Out of courtesy.', 'Call.'],
      check: ['Patience.', 'I check.'],
      fold: ['Not worth the trouble.', 'Go ahead. Enjoy it.', 'I fold. This time.'],
      win: ['The house always collects.', 'Thank you for your contribution.', 'Mm. As expected.'],
      lose: ['Enjoy it while it lasts.', 'Hm. Well played.', 'A loan. Nothing more.'],
      bust: ['Bah. I need some air.'],
      playerBust: ['Nothing personal, kid. Just business.'],
    },
  },
  {
    seat: 3, id: 'shark', model: 'shark', name: 'Frankie "Slick" Romano', short: 'FRANKIE', label: 'Frankie',
    title: 'the card shark', style: PERSONALITIES.loose, color: COLORS.sage,
    lines: {
      bigBet: ['Ooh, getting spicy.', 'Sure you want to do that?', 'Bet you won\'t call.'],
      allIn: ['Shove! Let\'s dance.', 'All in, baby.'],
      raise: ['Raise. Just for fun.', 'I like it. Raise.'],
      call: ['I\'m curious. Call.', 'Why not?'],
      check: ['Check. Or am I trapping you?', 'Tap tap.'],
      fold: ['Eh, I\'ll get you later.', 'Fine, fine.', 'Too rich for me.'],
      win: ['Read you like a menu.', 'Easy money.', 'Ha! Thanks, pal.'],
      lose: ['Ugh, the cards hate me.', 'Rigged, I tell you.', 'Whatever.'],
      bust: ['I\'ll be back with more.'],
      playerBust: ['Sorry, pal. The cards were talking.'],
    },
  },
];

export const STARTING_STACK = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
