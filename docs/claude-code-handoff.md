# Finishing Bar Gambling in Claude Code

Claude Code reads `CLAUDE.md` in this folder automatically, so it already knows the project,
the commands, the look you want and how deploys work. You don't need to run `/init`.

## 1. Open it

In PowerShell:

```powershell
cd "$env:USERPROFILE\OneDrive\Documents\BarGambling"
claude
```

## 2. Send these messages, one at a time

Wait for each one to finish (and look at what it did) before sending the next. Messages 3-7
are a menu: skip any you don't want, or change the order.

### Message 1 - connect this folder to GitHub

```
This folder has the same files as https://github.com/leo-tang2/gambling (branch main) but isn't a
git repo yet. Connect it without losing or overwriting any local file: git init -b main, add that
repo as origin, fetch, then reset the index (not the working tree) to origin/main and set main to
track origin/main. Show me git status - it should be clean. If any file differs, show me the diff
and don't commit anything yet.
```

### Message 2 - get your bearings, then a punch list

```
Read CLAUDE.md and README.md, run the tests and the build, then start the dev server and play
Back Room Hold'em through with the Playwright MCP using the window.__holdem hooks: a few hands,
each of the three random offers (forceEvent), V top view, cash out, the overview, buying something
in the bar, and starting night 2. Take screenshots as you go and look at them.
Then give me a punch list of what's broken, rough or missing, ordered by how much it hurts the
game. Don't fix anything yet.
```

### Message 3 - sound

```
Add sound. Sound.js is a stub, and every moment that should make a noise already calls
sound.play(name) (the names are listed in CLAUDE.md). Make the sounds with the Web Audio API in
code (no downloaded files): chips clacking, card slides and flips, a low room hum, footsteps, glass
on wood, the revolver's cylinder spin, a dry click and a gunshot, a cigar puff. Keep it gritty and
quiet like the visuals. Audio must start only after the first click or keypress (browser autoplay
rules), and add an M key to mute that's saved in localStorage. Add it to the README controls and
the site's controls list.
```

### Message 4 - fix the punch list

```
Work through the punch list from earlier, top to bottom. After each visual fix, take a Playwright
screenshot and check it before moving on. Run the tests and build when you're done, and tell me
what you changed.
```

### Message 5 - polish the side events

```
Polish the between-hands offers in SideEvents.js. The bartender stands too close and fills the
screen, and his face renders as a red block in the dark - frame him so he's readable but still in
shadow. The whiskey glass looks huge when it comes up to the camera. Make the cigar puff and the
Don's roulette scene feel more cinematic (camera timing, a beat of silence before the trigger).
Screenshot every step of each event and check them.
```

### Message 6 - phones and tablets

```
Right now Back Room Hold'em needs a keyboard and mouse. Make it playable on touch screens: tap
buttons (they're already drawn), tap to peek at cards, a button for the top view and for cash out,
and drag to look around. Test with the Playwright MCP using a phone viewport. Update the site's
"needs a keyboard and a mouse" line once it works.
```

### Message 7 - ship it

```
Run the tests and the build. If both pass, commit everything with a clear message and push to
main - that deploys to Vercel. Then check the deployment finished and open
https://bar-gambling-six.vercel.app and /holdem/ to confirm both load.
```

## 3. When you're ready for game 2

Fill in the brackets first:

```
Let's plan Bar Gambling game 2: [the game - e.g. liar's dice, blackjack, a slot machine, darts
for money]. It's set in the same bar as Back Room Hold'em, with [who you play against]. Reuse
src/shared/ (renderer, UI, chips, cards, tweens) and follow the same structure as src/holdem/,
with its own page at /[short-name]/ and an entry on the site's "Tonight's games" board.
Use plan mode: show me the plan before writing code.
```

## Tips

- For big changes, press **Shift+Tab** to switch Claude Code into plan mode first, so you
  approve the plan before it edits anything.
- Ask it to "take a screenshot and check it" for anything visual. It has your Playwright MCP.
- Pushing to `main` updates the live site within about a minute. Make a branch first
  (`git switch -c something`) when you want a change only as a Vercel preview.
