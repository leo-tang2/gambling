# Bar Gambling

A collection of first-person, pixelated 3D gambling games set in the back room of a bar,
running in the browser (three.js + Vite, plain JavaScript, no framework). Game 1 is
**Back Room Hold'em**: Texas Hold'em against three mobsters under one hanging lamp.
Play chips only — never anything involving real money.

- Live site: https://bar-gambling-six.vercel.app (game at `/holdem/`)
- Repo: https://github.com/leo-tang2/gambling (branch `main`)
- Hosting: Vercel project `bar-gambling` on the LeoWork team. **Every push to `main` deploys
  to production**, so only push work that passes tests and builds.

## Machine and commands

This folder lives in OneDrive on a Windows PC. In PowerShell, use `npm.cmd` / `npx.cmd`
(the script policy blocks plain `npm`). Vite watches with polling because of OneDrive.

```
npm.cmd install
npm.cmd run dev      # http://localhost:5173 = the site, http://localhost:5173/holdem/ = the game
npm.cmd test         # Vitest: engine, AI, chips, meta rules
npm.cmd run build    # builds both pages into dist/
```

Before every commit: `npm.cmd test` and `npm.cmd run build` must pass.

## Layout

```
index.html               the Bar Gambling website (src/site/ styles + script, public/site/ images)
holdem/index.html        game 1
src/
  main.js                game boot, render loop, window.__holdem test hooks
  shared/                reusable by later bar games
    render/              PixelRenderer (640x360 internal render, palette quantise + dither, grain,
                         vignette, fades, drunk/haze post effects), palette.js, Assets (GLB loading)
    ui/                  bitmap font (font.js), PixelUI immediate-mode widgets, DialogueBox
    props/               ChipManager (instanced chips), chipMath, CardManager
    input/               LookController (mouse-edge look, cinematic shots, drunk sway)
    anim/                Tweens
    audio/Sound.js       STUB - see "Sound" below
  holdem/
    engine/              pure poker rules: deck, evaluator, betting, side pots (no three.js here)
    ai/                  opponent decisions; an AI only sees its own view of the table
    scene/               BackRoom (room, seats, characters + idle smoking), Lamp, Extras
                         (smoke, embers, bartender, glass, ashtray/cigar), layout constants
    game/                HoldemController (the game loop, cutscenes, top view, cash out),
                         HUD (all on-screen UI), SideEvents (drink / roulette / cigar),
                         Overview (cash-out screen), meta.js (pure rules: mood, roulette payouts,
                         hidden luck, bar catalog, save/load), cast.js (names, lines)
  bar/                   your bar between nights, a separate 3D scene you walk around in (14 x 10 m):
                         BarScene.js (room, counter, the bartender's serve routine, regulars, every
                         catalog item as a 3D group hidden until bought, colliders; people and the
                         minigame models come from bar.glb), BarTycoon.js (WASD + pointer-lock
                         walking, E to use the catalog / door / horse table / gallery, the catalog
                         top view that zooms to the hovered item, the betting slip and race camera,
                         the gallery HUD), horseRace.js (pure rules: Turtle/Myrtle/Yertle/Lurtle,
                         runRace, settleBet, parseBet), ShootingGallery.js (ducks, cans, the
                         revolver from firstperson.glb). main.js renders bar.view instead of the
                         back room while bar.active, with pr.setPixelSize(2) for chunkier pixels.
tests/                   Vitest
tools/blender/           Python scripts that build every model in public/models (see README)
public/models/           exported .glb files
```

## How a run works

menu -> night N at the table -> every 2-3 hands a random offer (drink / Russian roulette / cigar)
-> **Cash out** (key 5) -> Overview (stats, money-per-hand bar graph, mafia mood bar) -> Your bar
(spend the bar fund) -> night N+1. Half of each cash-out goes to the bar fund, half is the next
night's stake; whatever is not spent in the bar is added to that stake (`nextNight` in meta.js,
also what the save holds). Going broke or dying at roulette ends the run and clears the save
(`localStorage['bargambling.run.v1']`). Drinks give hidden luck (`makeLuckyDeckFn` in meta.js):
never show the player that it exists.

## Conventions

- **Look:** the user wants it closer to Buckshot Roulette: keep the pixel style but not overly
  pixelated, and keep text small. Everything renders at 640x360 and upscales by whole numbers.
  Use colours from `src/shared/render/palette.js` only. All game UI is drawn with PixelUI on the
  UI canvas (not the DOM), in the bitmap font.
- Opponents stay in the dark; light reveals them only briefly (lamp edge, cigarette embers).
- Game rules belong in pure modules (`engine/`, `ai/`, `game/meta.js`) with unit tests.
- Chip visuals must always match engine stacks. The controller checks this after every hand
  (`_checkSync`); if you change money outside the engine (e.g. roulette), update both.
- Controls: 1 fold, 2 check/call, 3 raise, 4 all in, 5 cash out, E peek at cards, V top view,
  Q puff cigar. Buttons show their number badge bottom-left. In the bar: WASD walk, click for
  mouse look, E use (catalog / back-room door / horse table / gallery), R reload in the gallery.
  Keep README controls in sync. The horses' names are always drawn in orange (COLORS.amber).
- New sounds: call `sound.play('name')` at the moment; list the name in Sound.js.

## Testing in the browser

`window.__holdem` (dev and prod) exposes: `start()`, `setSpeed(n)`, `autoplay(true, 'tight')`,
`setStacks([...])`, `forceEvent('drink'|'roulette'|'cigar')`, `pick(n)` (choose an option in an
open offer box), `visitBar(fund)` (cash out at your next turn and walk into your bar), plus
`game`, `controller`, `hud`, `bar` (`bar.player`, `bar.openCatalog()`, `bar.world`). Use the Playwright MCP to open the dev server,
drive these hooks, and take screenshots to check visual changes. Look at the screenshots before
calling a visual change done. The threejs-devtools MCP can inspect the live scene.

## Sound

Not implemented yet: `Sound.play()` does nothing. Names already called in the code:
buy, cardDeal, cardFlip, cashOut, chipStack, chipThrow, cylinderSpin, dryFire, fold, footsteps,
glassDown, gulp, gunDrop, gunGrab, gunThrow, gunshot, knock, potSlide, puff, slide, typewriter, win.

## Models

Built in Blender from `tools/blender/*.py` (the Blender MCP is installed on this PC). Export to
`public/models/<name>.glb`. `bar.py` builds all of bar.glb (people, horse table, horses, crown, gallery,
duck with a transparent cut-out texture, can, pint, beer tap). Characters are one body mesh plus a `Head` node and a posable right arm
(`UpperArmR` pivots at the shoulder, `ForeArmR` at the elbow, empty `HandTipR` marks the hand's
end); there are no rigs. `Character.solveArm()` in BackRoom.js reaches that hand to a point.
The arms are measured for where the game seats them (`SEAT_DIST` in characters.py must match
layout.js + `SIT_BACK`). Blender can also run headless:
`blender --background --factory-startup --python <job.py>` with a job that sets `PROJECT_DIR`/`WHO`,
execs the script and calls `lib.export_glb`.

## Opponent AI

`ai/decide.js`: preflop it plays a starting-hand chart (`preflopScore` thresholds per personality in
`personalities.js`); after the flop it measures equity against the hands each opponent could hold
given their public betting this hand (`ai/range.js`, engine stats `preRaises/raises/streetRaises/vpip`),
so it folds to real aggression and bluffs/semi-bluffs at a per-personality rate. A broke opponent
shoots himself (`_bustScene` in HoldemController); whoever wins a pot turns their cards up.
