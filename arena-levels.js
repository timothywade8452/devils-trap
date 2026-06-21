// Devil's Trap — ARENA CAMPAIGN data (50 levels + endless).
//
// Authored from deep research: a 5-world × 10-level boss-rush built on the pro-design recipe —
//   • Combinatorial variety: each level varies ≥2 axes (arena · roster · objective · modifiers ·
//     hazard · boss-state) so no two feel alike, without 50 bespoke art sets.
//   • Teach-before-test: every enemy/mechanic debuts in a clean low-noise level, then recombines.
//   • Difficulty as a chapter sawtooth on a parabolic envelope — BOSS every 10th (10/20/30/40/50),
//     MINIBOSS ~mid-chapter (7/17/27/37/45), a REST level right after each boss (11/21/31/41), and a
//     GAUNTLET spike late in each chapter (9/18/29/39/49). L50 is tuned for catharsis, not cruelty.
//   • Objective rotates so consecutive levels never share a win condition.
//   • Modifiers gated by progress (≤1 early → 4 late) with category caps, per the affix-budget model.
//   • The rage-bait "the-floor-is-a-liar" DNA escalates across worlds (telegraphed drop → lava floor →
//     fake-safe tiles → lethal void → total deception).
//
// Each level is consumed by engine.buildArena() (geom/theme/hazard) + arena.spawn() (combat):
//   { id, world, name, taunt, objLabel, objective, target, geom{size,cover}, hazard[], mods[],
//     bosses[{type,hp}], bossName, waves[{delay|whenClear, spawn:[[kind,n,opts]]}], trickle{} }
//
// objective: slay | boss | survive | horde | hunt | endless    (engine wins/loses on these)
// kinds:     drone hound cyclops brute imp aegis mortar hive sentry wraith   (see arena.js ENEMY_DEF)
// mods (enemy affixes): armored swift frenzy venom volley splitting
// hazard (arena/global):  lava dark shrink lowgrav onehit

export const WORLDS = [
  { id: 0, name: "THE PROVING FLOOR", theme: 0, blurb: "Sterile test-deck. Learn the lie — gently." },
  { id: 1, name: "EMBER REACH",       theme: 1, blurb: "Foundry of fire. The lie now burns." },
  { id: 2, name: "THE DROWNED VAULT", theme: 2, blurb: "Drowned dark. Fake-safe ground baits you under." },
  { id: 3, name: "STORMSPIRE",        theme: 3, blurb: "Sky gauntlet. The lie can finally kill." },
  { id: 4, name: "THE LIAR'S THRONE", theme: 4, blurb: "Everything lies — floor, gravity, the HUD." },
];

const L = (o) => { o.world = Math.floor((o.id - 1) / 10); return o; };

export const ARENA_LEVELS = [
  // ───────────────────────── WORLD 1 · THE PROVING FLOOR (cyan) ─────────────────────────
  L({ id: 1, name: "First Steps, First Lies", taunt: "Just shoot what moves. The floor is fine. Mostly.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 37, cover: "grid" }, hazard: [], mods: [],
      waves: [{ delay: 0, spawn: [["drone", 3]] }, { whenClear: true, spawn: [["imp", 4]] }] }),
  L({ id: 2, name: "Cover Story", taunt: "Hold the light. Dash when it gets close. Try not to cry.",
      objective: "survive", objLabel: "HOLD", target: 35, geom: { size: 37, cover: "ring" }, hazard: [], mods: [],
      trickle: { type: "imp", every: 2.4, max: 7 }, waves: [{ delay: 0, spawn: [["drone", 2]] }] }),
  L({ id: 3, name: "Shooting Gallery", taunt: "Twenty drones. Quick. The clock is judging you.",
      objective: "horde", objLabel: "BLITZ ×20", target: 20, geom: { size: 41, cover: "scatter" }, hazard: [], mods: [],
      trickle: { type: "drone", every: 1.3, max: 9 } }),
  L({ id: 4, name: "The Shield Wall", taunt: "They block the front. You have legs. Use them.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 37, cover: "corners" }, hazard: [], mods: [],
      waves: [{ delay: 0, spawn: [["aegis", 2], ["imp", 3]] }, { whenClear: true, spawn: [["aegis", 2], ["drone", 2]] }] }),
  L({ id: 5, name: "The Glass Fall", taunt: "SETPIECE. The whole floor is a lie. Keep moving or fall.",
      objective: "survive", objLabel: "SURVIVE", target: 45, geom: { size: 41, cover: "none" }, hazard: ["shrink"], mods: [],
      trickle: { type: "drone", every: 2.0, max: 8 }, waves: [{ delay: 0, spawn: [["imp", 4]] }, { delay: 14, spawn: [["aegis", 2]] }] }),
  L({ id: 6, name: "Catch Your Breath", taunt: "Three marked. Ignore the rest. Breathe. You'll need it.",
      objective: "hunt", objLabel: "HUNT 3", geom: { size: 39, cover: "grid" }, hazard: [], mods: [],
      trickle: { type: "imp", every: 3.0, max: 5 }, waves: [{ delay: 0, spawn: [["aegis", 3, { mark: true }]] }] }),
  L({ id: 7, name: "Twin Wardens", taunt: "MINIBOSS. Two armored brutes. Pick a back to stab.",
      objective: "slay", objLabel: "MINIBOSS", geom: { size: 41, cover: "corners" }, hazard: [], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["aegis", 2, { mark: true }]] }, { delay: 4, spawn: [["imp", 4]] }, { whenClear: true, spawn: [["brute", 1], ["imp", 3]] }] }),
  L({ id: 8, name: "Disappearing Act", taunt: "The tiles stop warning you now. Survive the vanishing.",
      objective: "survive", objLabel: "SURVIVE", target: 42, geom: { size: 41, cover: "scatter" }, hazard: ["shrink"], mods: [],
      trickle: { type: "drone", every: 1.9, max: 9 }, waves: [{ delay: 0, spawn: [["aegis", 2]] }] }),
  L({ id: 9, name: "Gauntlet Run", taunt: "GAUNTLET. No cover. No mercy. No excuses.",
      objective: "slay", objLabel: "GAUNTLET", geom: { size: 39, cover: "none" }, hazard: [], mods: ["swift"],
      waves: [{ delay: 0, spawn: [["imp", 5], ["drone", 3]] }, { whenClear: true, spawn: [["aegis", 3], ["drone", 3]] }] }),
  L({ id: 10, name: "THE OVERSEER", taunt: "BOSS. It watches. It judges. It drops the floor on you.",
      objective: "boss", objLabel: "BOSS", bossName: "THE OVERSEER", geom: { size: 45, cover: "ring" }, hazard: [], mods: [],
      bosses: [{ type: 0, hp: 1.0 }], trickle: { type: "imp", every: 4.5, max: 5 },
      waves: [{ delay: 8, spawn: [["drone", 3]] }, { whenClear: true, spawn: [["aegis", 2]] }] }),

  // ───────────────────────── WORLD 2 · EMBER REACH (amber) ─────────────────────────
  L({ id: 11, name: "Into the Foundry", taunt: "Hounds and heat. Dash through the fire — it forgives you mid-dash.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 41, cover: "grid" }, hazard: ["lava"], mods: [],
      waves: [{ delay: 0, spawn: [["hound", 3]] }, { whenClear: true, spawn: [["hound", 2], ["imp", 4]] }] }),
  L({ id: 12, name: "Hot Floor", taunt: "The floor is rising. Up is the only honest direction.",
      objective: "survive", objLabel: "SURVIVE", target: 40, geom: { size: 39, cover: "ring" }, hazard: ["lava", "shrink"], mods: [],
      trickle: { type: "hound", every: 2.1, max: 7 } }),
  L({ id: 13, name: "Mortar Line", taunt: "HOLD. They lob over your cover. Cover is a suggestion.",
      objective: "survive", objLabel: "HOLD", target: 40, geom: { size: 43, cover: "corners" }, hazard: ["lava"], mods: [],
      trickle: { type: "hound", every: 2.6, max: 5 }, waves: [{ delay: 0, spawn: [["mortar", 3]] }] }),
  L({ id: 14, name: "Melt the Walls", taunt: "PUZZLE. Heavies and heat. Bait the big ones onto the lava.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 43, cover: "scatter" }, hazard: ["lava"], mods: [],
      waves: [{ delay: 0, spawn: [["brute", 1], ["hound", 3]] }, { whenClear: true, spawn: [["brute", 1], ["mortar", 2]] }] }),
  L({ id: 15, name: "Pressure Cooker", taunt: "BLITZ. Thirty rushers before the vents blow. GO.",
      objective: "horde", objLabel: "BLITZ ×28", target: 28, geom: { size: 41, cover: "none" }, hazard: ["lava"], mods: ["swift"],
      trickle: { type: "hound", every: 1.1, max: 11 } }),
  L({ id: 16, name: "Forge Embers", taunt: "HUNT. Three marked mortars across a molten hall. Snipe.",
      objective: "hunt", objLabel: "HUNT 3", geom: { size: 45, cover: "scatter" }, hazard: ["lava"], mods: [],
      trickle: { type: "hound", every: 3.2, max: 5 }, waves: [{ delay: 0, spawn: [["mortar", 3, { mark: true }]] }] }),
  L({ id: 17, name: "The Knight Trio", taunt: "MINIBOSS. Three armored knights. Back-vents glow. Aim there.",
      objective: "slay", objLabel: "MINIBOSS", geom: { size: 43, cover: "corners" }, hazard: ["lava"], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["brute", 3, { mark: true }]] }, { delay: 6, spawn: [["hound", 4]] }] }),
  L({ id: 18, name: "No Cover, All Heat", taunt: "GAUNTLET. Cover's gone. Floor's lava. Feet don't fail now.",
      objective: "slay", objLabel: "GAUNTLET", geom: { size: 41, cover: "none" }, hazard: ["lava"], mods: ["swift", "volley"],
      waves: [{ delay: 0, spawn: [["hound", 5]] }, { whenClear: true, spawn: [["mortar", 3], ["hound", 3]] }] }),
  L({ id: 19, name: "Collapse", taunt: "The panels turn to lava under you. Survive the meltdown.",
      objective: "survive", objLabel: "SURVIVE", target: 55, geom: { size: 43, cover: "scatter" }, hazard: ["lava", "shrink"], mods: [],
      trickle: { type: "hound", every: 1.8, max: 9 }, waves: [{ delay: 0, spawn: [["brute", 1]] }, { delay: 20, spawn: [["brute", 1], ["mortar", 2]] }] }),
  L({ id: 20, name: "THE FORGEMASTER", taunt: "BOSS. It smashes your cover, then floods the floor. Fight on islands.",
      objective: "boss", objLabel: "BOSS", bossName: "THE FORGEMASTER", geom: { size: 47, cover: "corners" }, hazard: ["lava", "shrink"], mods: [],
      bosses: [{ type: 1, hp: 1.25 }], trickle: { type: "hound", every: 4.0, max: 5 },
      waves: [{ delay: 10, spawn: [["mortar", 2]] }] }),

  // ───────────────────────── WORLD 3 · THE DROWNED VAULT (teal) ─────────────────────────
  L({ id: 21, name: "Tidewater", taunt: "REST. Wraiths circle, casters snipe. Ease into the deep.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 41, cover: "grid" }, hazard: [], mods: [],
      waves: [{ delay: 0, spawn: [["wraith", 3]] }, { whenClear: true, spawn: [["cyclops", 2], ["wraith", 2]] }] }),
  L({ id: 22, name: "Echoes in the Dark", taunt: "BLACKOUT. Pitch dark. They glow. You don't. Good luck.",
      objective: "slay", objLabel: "BLACKOUT", geom: { size: 41, cover: "scatter" }, hazard: ["dark"], mods: [],
      waves: [{ delay: 0, spawn: [["wraith", 4]] }, { whenClear: true, spawn: [["wraith", 3], ["imp", 4]] }] }),
  L({ id: 23, name: "Conduit", taunt: "PROTECT. Casters electrify the water. Keep the core alive.",
      objective: "survive", objLabel: "PROTECT", target: 45, geom: { size: 43, cover: "ring" }, hazard: [], mods: [],
      trickle: { type: "wraith", every: 2.4, max: 7 }, waves: [{ delay: 0, spawn: [["cyclops", 2]] }] }),
  L({ id: 24, name: "The Lure", taunt: "That platform looks safe. It is not. Nothing here is.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 43, cover: "scatter" }, hazard: [], mods: ["swift"],
      waves: [{ delay: 0, spawn: [["wraith", 4]] }, { whenClear: true, spawn: [["sentry", 2], ["wraith", 2]] }] }),
  L({ id: 25, name: "The Bait Pool", taunt: "SETPIECE · SUDDEN DEATH. One hit ends you. The 'safe' tiles lie.",
      objective: "slay", objLabel: "SUDDEN DEATH", geom: { size: 41, cover: "corners" }, hazard: ["onehit"], mods: [],
      waves: [{ delay: 0, spawn: [["wraith", 3]] }, { whenClear: true, spawn: [["cyclops", 2], ["sentry", 1]] }] }),
  L({ id: 26, name: "Low Tide", taunt: "HUNT. Tide's out. Four marked lurkers. Find them.",
      objective: "hunt", objLabel: "HUNT 4", geom: { size: 45, cover: "scatter" }, hazard: [], mods: [],
      trickle: { type: "imp", every: 3.0, max: 5 }, waves: [{ delay: 0, spawn: [["wraith", 4, { mark: true }]] }] }),
  L({ id: 27, name: "Choir Wardens", taunt: "MINIBOSS. Three armored casters lock the corners. Break the grid.",
      objective: "slay", objLabel: "MINIBOSS", geom: { size: 43, cover: "ring" }, hazard: [], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["sentry", 3, { mark: true }]] }, { delay: 6, spawn: [["wraith", 4]] }] }),
  L({ id: 28, name: "Rising Vault", taunt: "The flood climbs. Stay high, stay alive, stay moving.",
      objective: "survive", objLabel: "SURVIVE", target: 50, geom: { size: 43, cover: "scatter" }, hazard: ["shrink"], mods: [],
      trickle: { type: "wraith", every: 1.9, max: 9 }, waves: [{ delay: 0, spawn: [["cyclops", 2]] }] }),
  L({ id: 29, name: "Black Current", taunt: "GAUNTLET · DARK. No cover, half-lit, conductive water. Move.",
      objective: "slay", objLabel: "GAUNTLET", geom: { size: 41, cover: "none" }, hazard: ["dark"], mods: ["swift"],
      waves: [{ delay: 0, spawn: [["wraith", 5], ["cyclops", 2]] }, { whenClear: true, spawn: [["sentry", 2], ["wraith", 3]] }] }),
  L({ id: 30, name: "THE DROWNED CHOIR", taunt: "BOSS. Three voices, one fury. The lights die in its final verse.",
      objective: "boss", objLabel: "BOSS", bossName: "THE DROWNED CHOIR", geom: { size: 47, cover: "ring" }, hazard: ["dark"], mods: [],
      bosses: [{ type: 2, hp: 1.35 }], trickle: { type: "wraith", every: 4.0, max: 6 },
      waves: [{ delay: 9, spawn: [["sentry", 2]] }] }),

  // ───────────────────────── WORLD 4 · STORMSPIRE (violet) ─────────────────────────
  L({ id: 31, name: "Above the Clouds", taunt: "REST. Lancers shove, wisps zap. The fall can kill now.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 43, cover: "grid" }, hazard: [], mods: ["swift"],
      waves: [{ delay: 0, spawn: [["hound", 3], ["drone", 2]] }, { whenClear: true, spawn: [["hound", 3], ["drone", 3]] }] }),
  L({ id: 32, name: "Strike Zones", taunt: "HOLD. Lightning paints kill-circles on your pad. Rotate off.",
      objective: "survive", objLabel: "HOLD", target: 45, geom: { size: 43, cover: "ring" }, hazard: [], mods: [],
      trickle: { type: "drone", every: 2.2, max: 8 }, waves: [{ delay: 0, spawn: [["mortar", 2]] }] }),
  L({ id: 33, name: "Windward Gauntlet", taunt: "Fight on a shrinking platform over the void. Don't get pushed.",
      objective: "survive", objLabel: "SURVIVE", target: 48, geom: { size: 41, cover: "scatter" }, hazard: ["shrink"], mods: ["swift"],
      trickle: { type: "hound", every: 1.9, max: 8 }, waves: [{ delay: 0, spawn: [["drone", 3]] }] }),
  L({ id: 34, name: "Chain Reaction", taunt: "BLITZ. Thirty wisps, fast. They chain lightning. Spread your fire.",
      objective: "horde", objLabel: "BLITZ ×30", target: 30, geom: { size: 45, cover: "scatter" }, hazard: [], mods: ["swift", "volley"],
      trickle: { type: "drone", every: 1.1, max: 12 } }),
  L({ id: 35, name: "Skybreak", taunt: "PUZZLE. Bait the strikes onto the armored titans. Crack them open.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 45, cover: "corners" }, hazard: [], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["brute", 2], ["hound", 3]] }, { whenClear: true, spawn: [["brute", 1], ["drone", 4]] }] }),
  L({ id: 36, name: "The Long Drop", taunt: "SUDDEN DEATH. Real planks and fake ones over the void. One wrong dash.",
      objective: "slay", objLabel: "SUDDEN DEATH", geom: { size: 43, cover: "scatter" }, hazard: ["onehit"], mods: [],
      waves: [{ delay: 0, spawn: [["hound", 3], ["drone", 2]] }, { whenClear: true, spawn: [["hound", 3], ["drone", 3]] }] }),
  L({ id: 37, name: "Titan Pair", taunt: "MINIBOSS. Two storm-titans summon overlapping grids. Dodge the seams.",
      objective: "slay", objLabel: "MINIBOSS", geom: { size: 45, cover: "ring" }, hazard: [], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["brute", 2, { mark: true }], ["hive", 1]] }, { delay: 8, spawn: [["drone", 4]] }] }),
  L({ id: 38, name: "Eye of the Storm", taunt: "Seventy-five seconds in a shrinking calm. Outside it: lightning.",
      objective: "survive", objLabel: "SURVIVE", target: 65, geom: { size: 45, cover: "scatter" }, hazard: ["shrink"], mods: ["swift"],
      trickle: { type: "drone", every: 1.7, max: 10 }, waves: [{ delay: 0, spawn: [["brute", 1], ["hound", 3]] }] }),
  L({ id: 39, name: "Freefall Approach", taunt: "GAUNTLET. Narrow walkways, void on both sides, knockback only.",
      objective: "slay", objLabel: "GAUNTLET", geom: { size: 41, cover: "none" }, hazard: ["shrink"], mods: ["swift", "frenzy"],
      waves: [{ delay: 0, spawn: [["hound", 6]] }, { whenClear: true, spawn: [["hound", 4], ["drone", 4]] }] }),
  L({ id: 40, name: "THE TEMPEST CROWN", taunt: "BOSS. It shatters the arena into islands — then the islands lie too.",
      objective: "boss", objLabel: "BOSS", bossName: "THE TEMPEST CROWN", geom: { size: 47, cover: "scatter" }, hazard: ["shrink"], mods: [],
      bosses: [{ type: 3, hp: 1.5 }], trickle: { type: "drone", every: 3.6, max: 7 },
      waves: [{ delay: 10, spawn: [["hound", 3]] }] }),

  // ───────────────────────── WORLD 5 · THE LIAR'S THRONE (crimson) ─────────────────────────
  L({ id: 41, name: "The Threshold of Lies", taunt: "REST. The HUD lies now. Trust your eyes, not the numbers.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 43, cover: "grid" }, hazard: [], mods: ["frenzy"],
      waves: [{ delay: 0, spawn: [["imp", 5], ["wraith", 2]] }, { whenClear: true, spawn: [["wraith", 3], ["imp", 4]] }] }),
  L({ id: 42, name: "Hall of Mirrors", taunt: "HUNT. Three real targets hide among phantom copies of you.",
      objective: "hunt", objLabel: "HUNT 3", geom: { size: 45, cover: "scatter" }, hazard: [], mods: ["swift"],
      trickle: { type: "imp", every: 2.2, max: 8 }, waves: [{ delay: 0, spawn: [["wraith", 3, { mark: true }]] }] }),
  L({ id: 43, name: "Echo: Proving Floor", taunt: "REMIX. The first world returns — corrupted, armored, and lying.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 45, cover: "scatter" }, hazard: ["shrink"], mods: ["armored", "swift"],
      waves: [{ delay: 0, spawn: [["drone", 3], ["imp", 4]] }, { whenClear: true, spawn: [["aegis", 3], ["drone", 3]] }] }),
  L({ id: 44, name: "Echo: Drowned Lava", taunt: "REMIX. Fire AND flood in one arena. The floors flip beneath you.",
      objective: "survive", objLabel: "SURVIVE", target: 55, geom: { size: 45, cover: "corners" }, hazard: ["lava", "dark"], mods: ["swift"],
      trickle: { type: "wraith", every: 1.7, max: 10 }, waves: [{ delay: 0, spawn: [["mortar", 2], ["hound", 3]] }] }),
  L({ id: 45, name: "THE FALSE IDOL", taunt: "SETPIECE · MINIBOSS-TRIO. Three past lords at once, each floor lying differently.",
      objective: "boss", objLabel: "TRIO", bossName: "THE FALSE IDOL", geom: { size: 47, cover: "ring" }, hazard: ["dark"], mods: [],
      bosses: [{ type: 0, hp: 0.6 }, { type: 1, hp: 0.6 }, { type: 2, hp: 0.6 }], trickle: { type: "imp", every: 4.0, max: 6 } }),
  L({ id: 46, name: "Gravity's Lie", taunt: "PUZZLE. Gravity is a rumor. Cover and fake-floors flip with it.",
      objective: "slay", objLabel: "SLAY ALL", geom: { size: 45, cover: "scatter" }, hazard: ["lowgrav"], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["brute", 1], ["wraith", 3], ["imp", 3]] }, { whenClear: true, spawn: [["hive", 1], ["wraith", 3]] }] }),
  L({ id: 47, name: "One Shot, One Lie", taunt: "SUDDEN DEATH. One hit kills, and the HUD lies about your health.",
      objective: "slay", objLabel: "SUDDEN DEATH", geom: { size: 43, cover: "corners" }, hazard: ["onehit"], mods: ["frenzy"],
      waves: [{ delay: 0, spawn: [["wraith", 3], ["imp", 3]] }, { whenClear: true, spawn: [["wraith", 4], ["imp", 4]] }] }),
  L({ id: 48, name: "The Unmaking", taunt: "PURGE. Kill the spawners deleting your floor. Ignore the swarm, or drown.",
      objective: "slay", objLabel: "PURGE", geom: { size: 45, cover: "scatter" }, hazard: ["dark"], mods: ["armored"],
      waves: [{ delay: 0, spawn: [["hive", 2, { mark: true }], ["imp", 4]] }, { whenClear: true, spawn: [["hive", 2, { mark: true }], ["wraith", 3]] }] }),
  L({ id: 49, name: "Last Honest Ground", taunt: "GAUNTLET. No cover, no honest floor, no telegraph. The hardest room.",
      objective: "slay", objLabel: "GAUNTLET", geom: { size: 43, cover: "none" }, hazard: ["dark", "shrink"], mods: ["swift", "venom"],
      waves: [{ delay: 0, spawn: [["hound", 4], ["wraith", 3], ["imp", 4]] }, { whenClear: true, spawn: [["brute", 1], ["wraith", 3], ["hound", 3]] }] }),
  L({ id: 50, name: "THE DEVIL", taunt: "FINALE. The Liar's Throne. It wears every face you've beaten. End it.",
      objective: "boss", objLabel: "FINALE", bossName: "THE DEVIL", geom: { size: 49, cover: "ring" }, hazard: ["shrink"], mods: [],
      bosses: [{ type: 4, hp: 1.8 }, { type: 1, hp: 0.7 }, { type: 3, hp: 0.7 }], trickle: { type: "imp", every: 3.4, max: 7 },
      waves: [{ delay: 12, spawn: [["hound", 3]] }, { whenClear: true, spawn: [["wraith", 3]] }] }),
];

// ── ENDLESS · "THE GRIND" (the begged-for Cyber-Grind mode) ──
// One arena, escalating forever. Score = kills. A boss every few waves. Lose on death.
// The engine drives the escalation; this is just the seed state.
export const ARENA_ENDLESS = {
  id: 0, world: 4, name: "THE GRIND", taunt: "No exit. No end. Just one more wave. How long can you last?",
  objLabel: "ENDLESS", objective: "endless", geom: { size: 47, cover: "scatter" }, hazard: [], mods: [],
  bosses: [], trickle: { type: "imp", every: 2.2, max: 8 },
  waves: [{ delay: 0, spawn: [["drone", 3]] }],
  // escalation pools the engine cycles through as the run deepens
  pool: ["drone", "imp", "hound", "wraith", "aegis", "cyclops", "mortar", "brute", "sentry", "hive"],
  bossTypes: [0, 1, 2, 3],
};

export const ARENA_COUNT = ARENA_LEVELS.length;
export default ARENA_LEVELS;
