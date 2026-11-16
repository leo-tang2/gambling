// Sound is out of scope for now. Every game moment that should make a noise calls
// sound.play(name) already, so adding audio later only means filling in this class.
// Names used: chipThrow, chipStack, cardDeal, cardFlip, potSlide, knock, fold, win, lose, typewriter.
export class Sound {
  constructor() { this.enabled = false; }
  play(_name, _opts) {}
}
export const sound = new Sound();
