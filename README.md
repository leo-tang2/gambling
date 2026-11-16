# Bar Gambling — Game 1: Back Room Hold'em

A first-person, pixelated 3D Texas Hold'em game against three mafia players, running in the
browser with three.js and Vite. Local preview only; chips are play chips.

## Run it

From this folder, in PowerShell (use `npm.cmd`, since PowerShell's script policy blocks `npm`):

```
npm.cmd install      # first time only
npm.cmd run dev      # then open http://localhost:5173 (the site) or /holdem/ (the game)
npm.cmd test         # engine + chip unit tests (Vitest)
```

The game opens on a small start menu. Press **Start** (or Enter): the screen goes black and
you're in your seat.

## Controls

- **E:** lean in and tip up the corners of your two cards to see them; **E** again to put them
  down. Your cards and hand strength show in the bottom bar once you've looked.
- **V:** look straight down at the table from above; the board and your own two cards lie face up
  so you can read them. **V** again to sit back. You can still act from up there.
- **Mouse:** push the pointer to the left/right edges of the screen to look around, to the
  top edge to look up. In the middle the view stays still so you can click chips and buttons.
- **Click chips in your stack** to pick them up into a bet, then **Enter** (or the Throw button)
  to throw them. Right-click or **Esc** puts them back.
- **1** fold · **2** check/call · **3** raise · **4** all in · **5** cash out (each button shows
  its number in its bottom-left corner). F / C / R / A still work too.
- **3** (or the Raise... button) opens a box where you type the amount to raise to. Min, 1/2 Pot,
  Pot and All in fill it in; **Enter** confirms, **Esc** cancels.
- **Q:** puff on your cigar, if you took one.

Everyone at the table, their money and what they last did is listed bottom-right, above your hand.
When cards land on the board the camera zooms in on them for a moment.

## A night at the table

You start night 1 with $1,000; blinds are $10/$20. The opponents come back each night with a
little more ($1,000 + $250 per night after the first).

Every 2-3 hands something happens between hands:

- **The bartender** offers a drink. Take it and the room starts to swim for a few hands.
- **Russian roulette:** pick 1-5 bullets. Live, and your money grows by 25% / 60% / 120% / 250% /
  600%. Die, and the run is over.
- **A cigar** from Frankie or the Don. It sits in an ashtray by your cards; **Q** to smoke it.

**Cash out** (button 5, confirm with 1) gets you up from the table with what's in front of you;
chips already in the pot stay there. You get an overview of the night: your money hand by hand as
a bar graph, and how the family feels about you. The more of their money you take, the less happy
they are. Then you go to **your bar**.

## Your bar

Half of what you cash out goes into the bar fund, the other half is your stake for the next night.
Spend the bar fund on things for your bar (stools, a neon sign, a jukebox, a pool table, a
chandelier...). Nothing in the bar makes money: it's just yours, and it stays between nights.

Progress is saved in the browser after each night, and **Continue** on the start menu picks it
up. Going broke, or losing at roulette, ends the run and wipes the save.

## The website

`index.html` is the Bar Gambling site (styles and script in `src/site/`, images in `public/site/`);
`holdem/index.html` is the game. `npm.cmd run build` builds both into `dist/`. The site is deployed
on Vercel from this project's GitHub repo; every push to `main` redeploys it.

## Layout

```
src/
  shared/            reusable by later bar games
    render/          PixelRenderer (640x360 render, palette + dither, grain, vignette,
                     fades/tints, integer upscale),
                     palette, texture helpers, model loading
    ui/              "Backroom" bitmap font, PixelUI widgets, DialogueBox (kept for later games)
    props/           ChipManager (instanced chips, stacks, pot pile), chip maths, CardManager
    input/           LookController
    anim/            Tweens
    audio/           Sound stub: every sound moment already calls sound.play(name)
  holdem/
    engine/          pure poker logic: deck, shuffle, evaluator, betting, side pots
    ai/              opponent AI (sees only its own view of the table)
    scene/           room layout, lamp, gray-box fallbacks
    scene/           ...plus Extras: smoke, embers, the bartender, glass, ashtray & cigar
    game/            cast & lines, HUD, HoldemController, SideEvents (drink / roulette / cigar),
                     Overview (cash-out screen), meta (mood, payouts, hidden luck, saves)
  bar/               BarTycoon: your bar between nights
tests/               Vitest unit tests
tools/blender/       Python scripts that build every model in public/models
public/models/       exported .glb assets
```

## Rebuilding the models

Each model is built by a script in `tools/blender/`. In Blender's Python console:

```python
PROJECT_DIR = r"C:\Users\leota\OneDrive\Documents\BarGambling"
exec(open(PROJECT_DIR + r"\tools\blender\table.py").read())
lib.export_glb([bpy.data.objects['Table']], 'table.glb')
```

Characters take `WHO = 'boss' | 'enforcer' | 'shark'` before running `characters.py`.
`firstperson.py` builds the revolver and your hands (exported together as `firstperson.glb`).

## Testing hooks

`window.__holdem` exposes `game`, `controller`, `start()`, `setSpeed(n)` (animation speed),
`autoplay(true)` (an AI plays your seat), `setStacks([...])` (queue stacks for the next
hand, total unchanged), `forceEvent('drink' | 'roulette' | 'cigar')` (make the next offer that one)
and `pick(n)` (choose option n in an open offer box). They exist for automated checks and are not part of the game UI.
