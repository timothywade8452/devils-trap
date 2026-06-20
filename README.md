# Devil's Trap

**A first-person 3D rage-bait trap maze. The floor is a liar.**

**▶ Play: https://timothywade8452.github.io/devils-trap/**

Walk to the glowing orb — that's the only exit. The doors carved into the walls are
*decorative*. Every other tile looks exactly like solid floor; most of them are pits, spikes,
launch pads or crushers with **no tells**. You can't dodge the first one. You die, you learn the
spot, you go again — the traps never move, so the impossible maze becomes a route you simply
remember. A shaft of light marks the real exit so you always know which way is out.

**30 floors** across three colour-themed acts, each ending with the floor turning to rising lava —
plus a separate **Arena** boss-fight mode.

## Controls

- **Desktop:** `WASD` / arrows move · **shift** sprint · **mouse** look · **space** jump ·
  **scroll / + −** zoom · **left-click** fire (arena) · **R** restart · **M** mute · **⚙** settings
- **Mobile:** on-screen joystick or D-pad · drag to look · **JUMP / RUN / FIRE** buttons — all
  with adjustable opacity, size, handedness and drag-to-reposition layout

## Arena mode ⚔

A vast open hellfield. Three **bosses** hover and rotate far across the arena, constantly
repositioning and firing projectile spreads while ground **drones** swarm in. Fire back with
glowing **energy bubbles** that streak across the field and burst on impact. Circle the cover
pillars, dodge, and drop all three bosses before your health hits zero.

## Settings

Full in-game panel (⚙): master volume / music / SFX, brightness, bloom glow, render quality,
vignette, move speed, look sensitivity, field of view, invert-Y, view-bob, and the entire mobile
control layout. Everything persists in `localStorage`.

## How it stays fair

Every maze level is an open room of identical-looking floor where exactly one **serpentine path is
safe**. That path is found by a goal-biased randomized DFS at build time, so it is *always*
solvable; every other interior tile is salted with a trap. The result: lethal on sight, trivial
once memorized.

## Tech

Vanilla JavaScript + [Three.js](https://threejs.org) (CDN import map, plus the post-processing
addons for bloom). No build step, no bundler. Cinematic pipeline: ACES filmic tone-mapping,
UnrealBloom, PMREM environment reflections, real-time soft shadows, procedural canvas textures,
view-bob, and a generative WebAudio score (dark-ambient drone + combat SFX, no audio files).
Pointer-lock FPS controller on desktop, full custom touch UI on mobile.

## Files

- `play.html` — the game · `index.html` — landing page
- `engine.js` — Three.js renderer + FPS physics + maze/arena runtime + audio
- `arena.js` — the boss-fight combat module (enemies, bosses, projectiles)
- `settings.js` — settings store + in-game settings panel
- `sim.js` — shared tile rules (what kills you), used by the engine *and* the verifier
- `levels.js` — auto-generated level data (30 levels) · `gen.cjs` — the level generator
- `verify.mjs` — headless harness: proves every level is **beatable** (memory bot clears it),
  **rage-bait** (naive bot dies), the **arena** boots/fights/wins, and the game **boots clean**

```bash
node gen.cjs      # regenerate levels.js
node verify.mjs   # full verification (pure checks + live browser engine + arena)
```

Part of the **Devil's** series — [Devil's Lie](https://trpper11.github.io/devils-lie/) ·
[Devil's Due](https://trpper11.github.io/devils-due/).
