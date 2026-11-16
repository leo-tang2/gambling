// Cards are integers 0..51. rank = card % 13 (0 = deuce ... 12 = ace), suit = floor(card / 13).
export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs'; // clubs, diamonds, hearts, spades
export const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

export const rankOf = (card) => card % 13;
export const suitOf = (card) => Math.floor(card / 13);
export const makeCard = (rank, suit) => suit * 13 + rank;

export function cardToString(card) {
  return RANKS[rankOf(card)] + SUITS[suitOf(card)];
}

/** Parse "As", "Td", "2c" (case-insensitive rank). */
export function parseCard(str) {
  const r = RANKS.indexOf(str[0].toUpperCase());
  const s = SUITS.indexOf(str[1].toLowerCase());
  if (r < 0 || s < 0 || str.length !== 2) throw new Error(`Bad card: ${str}`);
  return makeCard(r, s);
}

export const parseCards = (str) => str.trim().split(/\s+/).filter(Boolean).map(parseCard);
