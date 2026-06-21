# Devil's Trap

**A first-person 3D rage-bait trap maze. The floor is a liar.**

**▶ Play: https://timothywade8452.github.io/devils-trap/**

Walk to the glowing orb — that's the only exit. The doors carved into the walls are
*decorative*. Every other tile looks exactly like solid floor; most of them are pits, spikes,
launch pads or crushers with **no tells**. You can't dodge the first one. You die, you learn the
spot, you go again — the traps never move, so the impossible maze becomes a route you simply
remember. A shaft of light marks the real exit so you always know which way is out.

**30 floors** across three colour-themed acts, each ending with the floor turning to rising lava —
plus a full **50-level Arena campaign** (5 worlds, a boss every 10th) and an endless **Grind** mode.

## Controls

- **Desktop:** `WASD` / arrows move · **shift** sprint · **mouse** look · **space** jump ·
  **F** sonar scout · **double-tap** a move key to dash (arena) · **scroll / + −** zoom ·
  **left-click** fire (arena) · **R** restart · **M** mute · **⚙** settings
- **Mobile:** on-screen joystick or D-pad · drag to look · **JUMP / RUN / FIRE / PING / DASH**
  buttons — all with adjustable opacity, size, handedness and drag-to-reposition layout

## Souls economy & shop 🛒

Clear floors, kill bosses and win the arena to earn **Souls** — skill-scaled (Brutal pays more, a
no-death clear pays a bonus). Spend them in the **Soul Shop**:

- **Skins** — cosmetic accent sets that recolour your arena energy-bubbles, sonar ping, dash trail
  and crosshair (8 skins, Standard → legendary Void Walker). Pure cosmetics, no gameplay edge.
- **Upgrades** — *fair* aids that never trivialise the core: **Soul Magnet** (×2 Souls), **Scout's
  Reserve** (+2 pings, auto-disabled on Brutal), **Quick Step** (faster dash), **Death Echo** (marks
  where a trap last got you this floor), **Iron Heart** (+25 arena HP). Toggleable; ring-fenced so
  the hardest mode stays pure.
- **Get Souls** — optional coin packs. Display-only "coming soon" until you drop a payment link
  (Stripe / Gumroad / Ko-fi / Lemon Squeezy…) into `shop-config.js` — no backend, no build step.

Everything persists in `localStorage`. (Design lifted from the sibling *Devil's Due* shop + economy
lessons from *SwagaCity*: cosmetic-first sinks, skill-scaled earning, convenience ring-fenced.)

## Mechanics

- **Sonar ping** (F / PING) — a limited tactical scout that flashes nearby traps for a moment so
  you can de-risk your next steps. Radius + charges are limited, so memory still rules.
- **Difficulty** (⚙) — **Casual** (5 pings, slow lava), **Normal** (3 pings), **Brutal** (no pings,
  no exit beacon, fast lava) for the rage-seekers.
- **Per-floor best** — a live timer and your best run (fewest deaths, then fastest) per floor, with a
  NEW BEST callout.
- **Arena dodge dash** + **health pickups** dropped by drones — survive longer, play with more skill.
- Plus full **game juice**: screen shake, distinct per-trap death sounds, level-clear bursts.

## Arena campaign ⚔ — 50 levels

A full first-person boss-rush, built from deep research into what makes arena shooters
(ULTRAKILL, Devil Daggers, Risk of Rain 2) and rage hits blow up. Fire glowing **energy bubbles**
at hovering, multi-phase bosses and a swarm of distinct enemies; dash to dodge; circle the cover.

- **5 worlds × 10 levels = 50**, each visually distinct (The Proving Floor → Ember Reach → The
  Drowned Vault → Stormspire → The Liar's Throne), with a **boss every 10th**, a miniboss mid-world,
  a breather right after each boss, and a gauntlet spike late in each chapter.
- **10 enemy archetypes**, each demanding a different response — swarmer drone, rusher hound, sniper
  cyclops, tank brute, swarmling imp, shielded aegis, bomber mortar, summoner hive, turret sentry,
  orbiting wraith — composed into waves with a stress-paced scheduler.
- **5 bosses** (Overseer / Forgemaster / Drowned Choir / Tempest Crown / **The Devil**) that telegraph,
  enrage at 50/25% HP, and cycle composable attack patterns: aimed fans, radial rings, spirals, beam
  lances, projectile rain, and add-summons.
- **Rotating objectives** so no two levels feel the same — slay, survive, hold, blitz/horde, hunt the
  marked, boss duel, gauntlet (no cover), miniboss trio, and **sudden death** (one hit = death).
- **Arena modifiers** (affixes) multiply the threat: ARMORED, SWIFT, FRENZY, VENOM, VOLLEY, SPLITTING —
  and environmental hazards 🔥 LAVA, 🌑 DARK, ⭕ SHRINK (the arena closes in), 🌙 LOW-G, 💀 ONE-HIT.
- The signature **"the floor is a liar"** rage-bait DNA escalates across the worlds, and a **troll
  narrator** taunts you (per world) on every death.
- A **level-select** grid tracks your progress (each level unlocks the next), and **☠ THE GRIND** is an
  endless Cyber-Grind: survive escalating waves with a boss every fifth, scored by kills.

Auto-aim assist makes it fully **one-thumb playable** on mobile: hold FIRE and it locks + leads the
nearest threat while you drive with the stick.

## Settings

Full in-game panel (⚙): master volume / music / SFX, brightness, bloom glow, render quality,
vignette, move speed, look sensitivity, field of view, invert-Y, view-bob, aim assist, and the
entire mobile control layout. Everything persists in `localStorage`.

## Leaderboard

Every player picks a **name** before playing (captured on the landing page or the game — nobody
plays unnamed), with their **country auto-detected** from IP (api.country.is → ipwho.is → geojs).
You earn **points** for clearing floors (worth more the deeper you go), killing bosses, and winning
the arena; your **death count** is tracked too. A score is submitted the moment you join, so every
named player is ranked — even after a single floor. Open it with 🏆 (in-game) or on the landing page.

The board is **global** by default — a shared Firebase Realtime DB (the same one the other Devil's
games use, under a `trap_scores` path). Each player is written to their **own key**, so concurrent
saves are atomic and never clobber each other — nobody is ever lost. It's CORS-enabled and writes
use `text/plain` to skip the preflight, so it works straight from the browser. Switch to `local`
(per-device) or a Supabase backend any time in `lbconfig.js`.

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
- `arena.js` — config-driven arena combat engine (10 enemy archetypes, 5 bosses + composable attack
  patterns, wave scheduler, objectives, modifiers, auto-aim lock) · `arena-levels.js` — the 50-level campaign + endless data
- `settings.js` — settings store + in-game settings panel
- `profile.js` — player name capture + IP country + run stats · `leaderboard.js` — leaderboard store + UI · `lbconfig.js` — backend + scoring config
- `shop.js` — Souls economy + Soul Shop (skins / upgrades / packs) · `shop-config.js` — coin-pack payment-link config
- `sim.js` — shared tile rules (what kills you), used by the engine *and* the verifier
- `levels.js` — auto-generated level data (30 levels) · `gen.cjs` — the level generator
- `verify.mjs` — headless harness: proves every maze floor is **beatable** (memory bot) + **rage-bait**
  (naive bot dies), all **50 arena levels** spawn and are **winnable** through the real win pipeline,
  endless escalates, the economy pays out, and the game **boots clean** (0 console errors)
- `functest.mjs` — live functional test of the level-select DOM + per-frame hazards (lava / shrink / one-hit)

```bash
node gen.cjs      # regenerate levels.js
node verify.mjs   # full verification (pure checks + live browser engine + 50-level arena campaign)
node functest.mjs # live functional test of the level-select + hazard paths
```

Part of the **Devil's** series — [Devil's Lie](https://trpper11.github.io/devils-lie/) ·
[Devil's Due](https://trpper11.github.io/devils-due/).
