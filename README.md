# Devil's Trap

**A first-person 3D rage-bait trap maze. The floor is a liar.**

**▶ Play: https://timothywade8452.github.io/devils-trap/**

Walk to the glowing orb — that's the only exit. The doors carved into the walls are
*decorative*. Every other tile looks exactly like solid floor; most of them are pits, spikes,
launch pads or crushers with **no tells**. You can't dodge the first one. You die, you learn the
spot, you go again — the traps never move, so the spot that kills you **scorches red** on your
next run and the impossible maze becomes a route you simply remember.

Ten floors, escalating, ending with the floor literally turning to rising lava.

## Controls

- **Desktop:** `WASD` / arrows move · **mouse** look · **space** jump · **R** restart floor · **esc** free cursor
- **Mobile:** left thumbstick move · drag right side to look · **JUMP** button

## The ten floors

1. **The Threshold** — just walk to the light.
2. **Decorative Doors** — the wall exits are bait.
3. **The Floor Lies** — solid-looking tiles drop into the dark.
4. **Pillars of Salt** — black pillars split the room; pits fill the gaps.
5. **Hot Floor** — visible lava puddles, invisible traps.
6. **Launch Window** — one tile flings you somewhere fatal.
7. **Overhead** — the ceiling has opinions.
8. **The Long Con** — the safe path doubles back.
9. **No Tells** — everything you learned, weaponized.
10. **The Floor Is Lava** — literally. It rises. Run.

## How it stays fair

Every level is an open room of identical-looking floor where exactly one **serpentine path is
safe**. That path is found by a goal-biased randomized DFS at build time, so it is *always*
solvable; every other interior tile is salted with a trap. The result: lethal on sight,
trivial once memorized.

## Tech

Vanilla JavaScript + [Three.js](https://threejs.org) (loaded from CDN via import map). No build
step, no bundler. Procedural canvas textures (concrete, checker stone, lava), real-time
shadows, fog, a glowing point-lit exit orb, and a pointer-lock FPS controller with full mobile
touch support. Scorch-mark memory persists in `localStorage`.

## Files

- `play.html` — the game · `index.html` — landing page
- `engine.js` — Three.js renderer + FPS physics + trap runtime
- `sim.js` — shared tile rules (what kills you), used by the engine *and* the verifier
- `levels.js` — auto-generated level data · `gen.cjs` — the level generator
- `verify.mjs` — headless harness: proves every level is **beatable** (memory bot clears it),
  **rage-bait** (naive bot dies), and that the game **boots clean** in real Chromium

```bash
node gen.cjs      # regenerate levels.js
node verify.mjs   # full verification (pure checks + live browser engine test)
```

Part of the **Devil's** series — [Devil's Lie](https://trpper11.github.io/devils-lie/) ·
[Devil's Due](https://trpper11.github.io/devils-due/).
