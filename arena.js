// Devil's Trap — ARENA combat engine (data-driven campaign).
//
// A single self-contained boss/horde controller that the engine drives one LEVEL at a time.
// The engine owns player movement + the floor/hazards; this module owns every combatant:
//   • 10 distinct ENEMY archetypes (each demands a different response): swarmer drone, rusher
//     hound, sniper cyclops, tank brute, swarmling imp, shielded aegis, bomber mortar, summoner
//     hive, static sentry turret, orbiting wraith.
//   • 5 multi-phase BOSSES (Wrath / Inferno / Void / Leviathan / The Devil) that orbit, telegraph,
//     enrage, and unleash composable ATTACK PATTERNS (fan / ring / spiral / burst / beam / rain / summon).
//   • A WAVE scheduler (timed + on-clear spawns + background trickle) and OBJECTIVE tracking
//     (slay / boss / survive / horde / hunt) so each of the 50 campaign levels is a distinct fight.
//   • A MODIFIER (affix) system that multiplies content from the same assets (frenzy / armored /
//     swift / volley / splitting / venom ...).
//   • Colour-bubble player projectiles, glowing enemy tracers, ballistic lobs, AoE blast zones with
//     ground telegraphs, sweeping beams, particle bursts, shockwaves, billboarded health bars, and a
//     mobile auto-aim target lock (so you can play one-thumbed).
//
// createArena(deps) -> {
//   spawn(cfg)                            // build the encounter described by an ARENA_LEVELS entry
//   update(dt, playerPos, camera, live)   // step everything -> objective/damage/win state
//   playerShoot(origin, dirVec3)          // fire a bubble
//   bossCount() / enemyCount() / info()   // counts (info() drives the headless test)
//   damageAll(n)                          // test hook: nuke every combatant
//   lockedPos()/lockedAim()/hasLock()     // auto-aim target lock (mobile)
//   spawnHealthAt(x,z) / killDrones()     // test hooks
//   setBubbleColors(arr)                  // equipped-skin recolour
// }

export function createArena({ THREE, scene, MAT, audio, glowSprite, bounds }) {
  const g = new THREE.Group(); scene.add(g);

  // ── shared cheap geometry (reused across thousands of instances) ──
  const SPH = new THREE.SphereGeometry(1, 16, 16);
  const SPH_LO = new THREE.SphereGeometry(1, 10, 8);
  const RING = new THREE.RingGeometry(0.82, 1.0, 32);

  const bubbleMat = (hex, op = 0.95) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending });
  let PLAYER_COLORS = [0x5cffd0, 0x7ce0ff, 0xb98cff]; // cycling bubble colours (swapped by equipped skin)
  function setBubbleColors(arr) { if (arr && arr.length) PLAYER_COLORS = arr.slice(); }

  // ── boss identity: colour, enrage colour, and the attack patterns each one uses ──
  const BOSS_COLOR   = [0xff3b2e, 0xff9a3c, 0xc35cff, 0x33e0b0, 0xff1133];
  const ENRAGE_COLOR = [0xff1a4c, 0xffd23c, 0xff5cf0, 0x7affd8, 0xff5566];
  const BOSS_PATTERNS = [
    ["fan", "burst"],                                  // 0 Wrath
    ["fan", "ring", "rain"],                           // 1 Inferno
    ["spiral", "beam", "fan"],                         // 2 Void
    ["summon", "ring", "beam", "rain"],                // 3 Leviathan
    ["fan", "ring", "spiral", "beam", "rain", "summon"], // 4 The Devil (final)
  ];
  const BOSS_NAME = ["WRATH", "INFERNO", "VOID", "LEVIATHAN", "THE DEVIL"];

  // ── ENEMY archetype table. Each forces a different player response. ──
  // move: "band" (hold a range band + strafe) | "chase" (melee) | "orbit" | "static"
  // fire: "aimed" | "sniper" | "lob" | "bomb" | "summon" | "radial" | "tangent" | "melee"
  const ENEMY_DEF = {
    drone:   { name: "Wisp",   hp: 26, speed: 8,  move: "band",  band: [15, 21], fire: "aimed",   cd: [1.6, 2.8], wind: 0.4,  dmg: 6,  pspeed: 26, color: 0xff5a3c, model: "drone",  size: 1.4, score: 1 },
    hound:   { name: "Hound",  hp: 22, speed: 17, move: "chase", band: [0, 0],   fire: "melee",   cd: [0.0, 0.0], wind: 0.0,  dmg: 13, pspeed: 0,  color: 0xff2a6a, model: "hound",  size: 1.3, score: 1 },
    cyclops: { name: "Cyclops",hp: 34, speed: 3,  move: "band",  band: [34, 48], fire: "sniper",  cd: [2.6, 3.6], wind: 1.2,  dmg: 20, pspeed: 70, color: 0xffcf3a, model: "cyclops",size: 1.8, score: 2 },
    brute:   { name: "Brute",  hp: 92, speed: 4,  move: "band",  band: [16, 28], fire: "lob",     cd: [2.2, 3.2], wind: 0.7,  dmg: 16, pspeed: 22, color: 0xff7a2e, model: "brute",  size: 2.4, score: 3 },
    imp:     { name: "Imp",    hp: 9,  speed: 15, move: "chase", band: [0, 0],   fire: "melee",   cd: [0.0, 0.0], wind: 0.0,  dmg: 6,  pspeed: 0,  color: 0xff4488, model: "imp",    size: 0.9, score: 1 },
    aegis:   { name: "Aegis",  hp: 46, speed: 6,  move: "band",  band: [16, 24], fire: "aimed",   cd: [1.7, 2.6], wind: 0.45, dmg: 9,  pspeed: 28, color: 0x6fd0ff, model: "aegis",  size: 1.7, score: 2, shield: true },
    mortar:  { name: "Mortar", hp: 28, speed: 6,  move: "band",  band: [22, 32], fire: "bomb",    cd: [2.4, 3.4], wind: 0.6,  dmg: 18, pspeed: 0,  color: 0xff6a18, model: "mortar", size: 1.6, score: 2 },
    hive:    { name: "Hive",   hp: 56, speed: 4,  move: "band",  band: [26, 40], fire: "summon",  cd: [3.4, 4.6], wind: 0.8,  dmg: 0,  pspeed: 0,  color: 0xb06bff, model: "hive",   size: 2.0, score: 3, summon: "imp" },
    sentry:  { name: "Sentry", hp: 38, speed: 0,  move: "static",band: [0, 0],   fire: "radial",  cd: [2.0, 2.6], wind: 0.5,  dmg: 7,  pspeed: 22, color: 0xff3340, model: "sentry", size: 1.6, score: 2 },
    wraith:  { name: "Wraith", hp: 30, speed: 13, move: "orbit", band: [13, 17], fire: "tangent", cd: [1.4, 2.2], wind: 0.35, dmg: 7,  pspeed: 30, color: 0x9affe0, model: "wraith", size: 1.4, score: 2 },
  };

  // ── live state ──
  const bosses = [], enemies = [], pProj = [], eProj = [], parts = [], orbs = [], zones = [], beams = [];
  let centerX = 0, centerZ = 0, colorIx = 0, prevBosses = -1;
  let lockObj = null, lockRing = null;
  // campaign / objective state
  let cfg = null, levelT = 0, waveList = [], trickle = null, trickleT = 0;
  let objective = "slay", target = 0, killCount = 0, spawnedAll = false, won = false, mods = [];

  const HALF = () => (bounds.maxX - bounds.minX) / 2;
  const clampX = (x) => Math.max(bounds.minX + 1.5, Math.min(bounds.maxX - 1.5, x));
  const clampZ = (z) => Math.max(bounds.minZ + 1.5, Math.min(bounds.maxZ - 1.5, z));
  const rand = (a, b) => a + Math.random() * (b - a);
  const has = (m) => mods.indexOf(m) >= 0;

  function clearGroup() {
    for (let i = g.children.length - 1; i >= 0; i--) g.remove(g.children[i]);
    bosses.length = enemies.length = pProj.length = eProj.length = parts.length = orbs.length = zones.length = beams.length = 0;
  }

  // ── reusable additive glow sprite (halo) ──
  function halo(color, size, op = 0.8) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size); return s;
  }

  // ── floating, segmented, phase-coloured health bar (billboarded) ──
  const SEGMENTS = 12;
  function makeHealthBar(width = 6) {
    const grp = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.07, 0.8), new THREE.MeshBasicMaterial({ color: 0x0a0006, transparent: true, opacity: 0.78, depthTest: false }));
    bg.renderOrder = 997; grp.add(bg);
    const segs = [], segW = width / SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(segW * 0.82, 0.56), new THREE.MeshBasicMaterial({ color: 0x45e07a, depthTest: false, transparent: true }));
      m.position.x = -width / 2 + segW * (i + 0.5); m.position.z = 0.02; m.renderOrder = 999; grp.add(m); segs.push(m);
    }
    grp.userData.segs = segs; return grp;
  }
  function setBar(grp, frac, enraged) {
    const segs = grp.userData.segs, lit = Math.ceil(frac * SEGMENTS);
    const col = enraged ? 0xff1a4c : frac > 0.5 ? 0x45e07a : frac > 0.25 ? 0xff9a3c : 0xff3b2e;
    for (let i = 0; i < segs.length; i++) {
      const on = i < lit;
      segs[i].material.color.setHex(on ? col : 0x220011);
      segs[i].material.opacity = on ? 1 : 0.35;
    }
  }

  // ─────────────────────────── boss model builders ───────────────────────────
  function buildBossModel(i) {
    const grp = new THREE.Group();
    const baseCol = BOSS_COLOR[i];
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x0c0006, emissive: baseCol, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.7 });
    const armorMat = () => new THREE.MeshStandardMaterial({ color: 0x0e1016, metalness: 0.95, roughness: 0.22, emissive: baseCol, emissiveIntensity: 0.28 });
    const rings = [], spikes = [], plates = [];
    let core, scale = 1;

    if (i === 0) {                 // WRATH — jagged crystal eye + counter-rotating gyro rings + spike crown
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), coreMat); grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.55, 12, 36), armorMat()); r1.rotation.x = Math.PI / 2.3; grp.add(r1); rings.push(r1);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.4, 12, 40), armorMat()); r2.rotation.x = Math.PI / 1.7; r2.rotation.y = 0.6; grp.add(r2); rings.push(r2);
      for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), armorMat()); const a = (k / 6) * Math.PI * 2; sp.position.set(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2); sp.lookAt(0, 0, 0); sp.rotateX(Math.PI / 2); grp.add(sp); spikes.push(sp); }
    } else if (i === 1) {          // INFERNO — molten octahedral heart, halo ring, ember shards
      core = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), coreMat); grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.7, 8, 32), armorMat()); r1.rotation.x = Math.PI / 2; grp.add(r1); rings.push(r1);
      for (let k = 0; k < 5; k++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.6), armorMat()); const a = (k / 5) * Math.PI * 2; pl.position.set(Math.cos(a) * 4.6, (k - 2) * 0.7, Math.sin(a) * 4.6); pl.lookAt(0, pl.position.y, 0); grp.add(pl); plates.push(pl); }
      for (let k = 0; k < 7; k++) { const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.7, 0), coreMat); const a = (k / 7) * Math.PI * 2; sh.position.set(Math.cos(a) * 6.6, Math.sin(a * 1.6) * 1.2, Math.sin(a) * 6.6); grp.add(sh); spikes.push(sh); }
    } else if (i === 2) {          // VOID — dodecahedral monolith, heavy plates, slow outer ring
      core = new THREE.Mesh(new THREE.DodecahedronGeometry(3.0, 0), coreMat); grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.6, 8, 40), armorMat()); r1.rotation.x = Math.PI / 2.1; grp.add(r1); rings.push(r1);
      for (let k = 0; k < 8; k++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.5), armorMat()); const a = (k / 8) * Math.PI * 2; pl.position.set(Math.cos(a) * 4.4, Math.sin(a * 2) * 1.4, Math.sin(a) * 4.4); pl.lookAt(0, pl.position.y, 0); grp.add(pl); plates.push(pl); }
      for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3.4, 4), armorMat()); const a = (k / 4) * Math.PI * 2 + 0.4; sp.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2); sp.lookAt(0, 0, 0); sp.rotateX(Math.PI / 2); grp.add(sp); spikes.push(sp); }
    } else if (i === 3) {          // LEVIATHAN — vast serpentine coil of plated rings + a green sun core
      scale = 1.15;
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 0), coreMat); grp.add(core);
      for (let r = 0; r < 3; r++) { const ro = new THREE.Mesh(new THREE.TorusGeometry(5.2 + r * 1.4, 0.5, 10, 44), armorMat()); ro.rotation.x = Math.PI / 2 + r * 0.5; ro.rotation.y = r * 0.7; grp.add(ro); rings.push(ro); }
      for (let k = 0; k < 10; k++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.5), armorMat()); const a = (k / 10) * Math.PI * 2; pl.position.set(Math.cos(a) * 5.0, Math.sin(a * 3) * 2.0, Math.sin(a) * 5.0); pl.lookAt(0, pl.position.y, 0); grp.add(pl); plates.push(pl); }
    } else {                       // THE DEVIL — horned obsidian heart wreathed in blades; the climax
      scale = 1.3;
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1), coreMat); grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.8, 12, 48), armorMat()); r1.rotation.x = Math.PI / 2; grp.add(r1); rings.push(r1);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(8.0, 0.5, 12, 52), armorMat()); r2.rotation.x = Math.PI / 1.8; grp.add(r2); rings.push(r2);
      for (let k = 0; k < 2; k++) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 5), armorMat()); horn.position.set((k ? 1 : -1) * 2.0, 3.4, 0); horn.rotation.z = (k ? -1 : 1) * 0.5; grp.add(horn); spikes.push(horn); }
      for (let k = 0; k < 10; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.0, 4), armorMat()); const a = (k / 10) * Math.PI * 2; sp.position.set(Math.cos(a) * 4.8, Math.sin(a * 2) * 1.0, Math.sin(a) * 4.8); sp.lookAt(0, 0, 0); sp.rotateX(Math.PI / 2); grp.add(sp); spikes.push(sp); }
    }
    grp.scale.setScalar(scale);
    const glow = halo(baseCol, 16 * scale, 0.5); grp.add(glow);
    const light = new THREE.PointLight(baseCol, 1.4, 80, 2); grp.add(light);
    const bar = makeHealthBar(7); bar.position.y = 7.4; grp.add(bar);
    return { grp, core, coreMat, rings, spikes, plates, glow, light, bar, scale };
  }

  // ─────────────────────────── enemy model builders ───────────────────────────
  function emat(col, em = 1.3) { return new THREE.MeshStandardMaterial({ color: 0x14080a, emissive: col, emissiveIntensity: em, roughness: 0.4, metalness: 0.55 }); }
  function darkMat(col) { return new THREE.MeshStandardMaterial({ color: 0x120606, metalness: 0.8, roughness: 0.3, emissive: col, emissiveIntensity: 0.35 }); }

  function buildEnemyModel(def) {
    const grp = new THREE.Group(); const col = def.color; let body, shieldMesh = null;
    if (def.model === "drone") {
      body = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), emat(col)); grp.add(body);
      for (let k = 0; k < 3; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), darkMat(col)); const a = (k / 3) * Math.PI * 2; fin.position.set(Math.cos(a) * 1.3, -0.4, Math.sin(a) * 1.3); grp.add(fin); }
    } else if (def.model === "hound") {
      body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 6), emat(col, 1.5)); body.rotation.x = Math.PI / 2; grp.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 4), darkMat(col)); tail.rotation.x = -Math.PI / 2; tail.position.z = -1.6; grp.add(tail);
    } else if (def.model === "cyclops") {
      body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), emat(col, 0.6)); grp.add(body);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshBasicMaterial({ color: col })); iris.position.z = 1.1; iris.scale.z = 0.4; grp.add(iris);
      const ringm = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.18, 8, 24), darkMat(col)); grp.add(ringm);
    } else if (def.model === "brute") {
      body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), emat(col, 0.9)); grp.add(body);
      for (let k = 0; k < 4; k++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 2.8), darkMat(col)); pl.position.x = k < 2 ? -1.5 : 1.5; pl.position.y = (k % 2 ? 0.6 : -0.6); grp.add(pl); }
    } else if (def.model === "imp") {
      body = new THREE.Mesh(new THREE.TetrahedronGeometry(0.95, 0), emat(col, 1.7)); grp.add(body);
    } else if (def.model === "aegis") {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), emat(col, 1.0)); grp.add(body);
      shieldMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.0, 0.4), new THREE.MeshStandardMaterial({ color: 0x081826, emissive: col, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0.92 }));
      shieldMesh.position.z = 1.7; grp.add(shieldMesh);
    } else if (def.model === "mortar") {
      body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.4, 10), emat(col, 1.1)); grp.add(body);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.8, 8), darkMat(col)); barrel.position.y = 1.2; grp.add(barrel);
    } else if (def.model === "hive") {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), emat(col, 1.2)); grp.add(body);
      for (let k = 0; k < 4; k++) { const bit = new THREE.Mesh(new THREE.TetrahedronGeometry(0.5, 0), emat(col, 1.6)); const a = (k / 4) * Math.PI * 2; bit.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6); grp.add(bit); }
    } else if (def.model === "sentry") {
      const baseM = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 1.2, 8), darkMat(col)); baseM.position.y = -1.0; grp.add(baseM);
      body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 2.0), emat(col, 1.0)); grp.add(body);
      for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.6), new THREE.MeshBasicMaterial({ color: col })); const a = (k / 4) * Math.PI * 2; bl.position.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2); bl.lookAt(0, 0, 0); grp.add(bl); }
    } else { // wraith
      body = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ color: 0x0a1a16, emissive: col, emissiveIntensity: 1.3, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 })); body.scale.y = 1.6; grp.add(body);
    }
    const gl = halo(col, 4.4 * def.size, 0.45); grp.add(gl);
    return { m: grp, body, glow: gl, shieldMesh };   // enemies key their group as `.m` (bosses use `.grp`)
  }

  // ─────────────────────────── spawning ───────────────────────────
  function applyMods(e) {
    // affixes multiply threat from the same assets
    if (has("armored"))   { e.hp *= 2.0; e.max = e.hp; }
    if (has("swift"))     e.speedMul = (e.speedMul || 1) * 1.5;
    if (has("frenzy"))    e.fireMul = (e.fireMul || 1) * 0.55;   // shorter cooldown
    if (has("venom"))     e.dmgMul = (e.dmgMul || 1) * 1.6;
    if (has("volley"))    e.volley = true;
    if (has("splitting")) e.split = true;
  }

  function spawnEnemy(kind, x, z, opts = {}) {
    if (enemies.length >= 30) return null;
    const def = ENEMY_DEF[kind] || ENEMY_DEF.drone;
    const mdl = buildEnemyModel(def);
    const ang = Math.random() * Math.PI * 2, rad = opts.rad != null ? opts.rad : rand(26, Math.min(HALF() - 4, 46));
    const px = x != null ? x : clampX(centerX + Math.cos(ang) * rad);
    const pz = z != null ? z : clampZ(centerZ + Math.sin(ang) * rad);
    mdl.m.position.set(px, def.model === "imp" || def.model === "hound" ? 1.8 : 2.6, pz);
    g.add(mdl.m);
    const e = {
      kind, def, ...mdl, hp: def.hp, max: def.hp, fireT: rand(def.cd[0], def.cd[1]) * 0.6 + def.wind,
      wind: 0, windMax: def.wind, bob: Math.random() * 6, flash: 0, recoil: 0, meleeCD: 0,
      orbitAng: ang, marked: !!opts.mark, speedMul: 1, fireMul: 1, dmgMul: 1, volley: false, split: false,
    };
    applyMods(e);
    if (opts.mod) for (const m of [].concat(opts.mod)) { const save = mods; mods = [m]; applyMods(e); mods = save; }
    if (e.marked) { const crown = new THREE.Mesh(new THREE.TorusGeometry(def.size + 0.6, 0.12, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffe24a, blending: THREE.AdditiveBlending, transparent: true })); crown.rotation.x = Math.PI / 2; crown.position.y = def.size + 1.2; mdl.m.add(crown); e.crown = crown; }
    enemies.push(e);
    return e;
  }

  function buildBoss(typeIx, hpMul) {
    const mdl = buildBossModel(typeIx);
    g.add(mdl.grp);
    const hp = Math.round(220 * (hpMul || 1));
    const i = bosses.length;
    bosses.push({
      ...mdl, typeIx, color: BOSS_COLOR[typeIx], enrageColor: ENRAGE_COLOR[typeIx],
      patterns: BOSS_PATTERNS[typeIx], patIx: Math.floor(Math.random() * BOSS_PATTERNS[typeIx].length),
      hp, max: hp, ang: (i / 3) * Math.PI * 2, orbit: Math.min(HALF() - 12, 50), height: 9 + i * 3,
      spin: 0.6 + i * 0.2, orbitSpd: 0.18 + i * 0.05, repo: 3 + i, fireT: 1.6 + i * 0.6,
      tgt: { orbit: Math.min(HALF() - 12, 50), height: 9 + i * 3 },
      wind: 0, windMax: 0.6, phase: 0, flash: 0, flicker: Math.random() * 6, spiralA: 0,
    });
  }

  // spawn(cfg) — build the encounter from an ARENA_LEVELS entry
  function spawn(levelCfg) {
    if (!g.parent) scene.add(g);
    clearGroup();
    lockObj = null; lockRing = null;
    centerX = (bounds.minX + bounds.maxX) / 2; centerZ = (bounds.minZ + bounds.maxZ) / 2;
    prevBosses = -1; levelT = 0; killCount = 0; won = false; spawnedAll = false; trickleT = 0;

    cfg = levelCfg || {};
    objective = cfg.objective || "slay";
    target = cfg.target || 0;
    mods = (cfg.mods || []).slice();
    trickle = cfg.trickle || null;

    // bosses
    for (const b of (cfg.bosses || [])) buildBoss(b.type | 0, b.hp || 1);
    // re-seat boss orbit angles evenly
    bosses.forEach((b, i) => { b.ang = (i / Math.max(1, bosses.length)) * Math.PI * 2; });

    // waves (cloned so we can mark them done)
    waveList = (cfg.waves || []).map((w) => ({ delay: w.delay, whenClear: !!w.whenClear, spawn: w.spawn, done: false }));
    // an immediate opening wave only if nothing else will populate the fight
    if (!waveList.length && !bosses.length && !trickle) waveList = [{ delay: 0, spawn: [["drone", 4]], done: false }];
    // fire the delay-0 waves right away so the fight starts populated
    runWaves(true);
  }

  function spawnGroup(entry) {
    const [kind, n, opts] = entry;
    for (let k = 0; k < (n || 1); k++) spawnEnemy(kind, null, null, opts || {});
  }
  // Waves run strictly IN ORDER (clean "rounds"): a delay wave fires at its time; a whenClear
  // wave fires only once the field is empty; later waves wait for the current one.
  function runWaves(initialOnly) {
    for (let i = 0; i < waveList.length; i++) {
      const w = waveList[i]; if (w.done) continue;
      if (w.whenClear) {
        if (initialOnly) break;                 // never spawn on-clear during the opening pass
        if (enemies.length === 0) { w.spawn.forEach(spawnGroup); w.done = true; }
        break;                                  // hold here until this round is spawned + cleared
      } else {
        if (levelT >= (w.delay || 0)) { w.spawn.forEach(spawnGroup); w.done = true; continue; }
        break;                                  // a later delay not reached yet — don't skip ahead
      }
    }
    spawnedAll = waveList.every((w) => w.done);
  }

  // ─────────────────────────── projectiles ───────────────────────────
  function playerShoot(origin, dir) {
    if (pProj.length > 40) return;
    const col = PLAYER_COLORS[colorIx++ % PLAYER_COLORS.length];
    const m = new THREE.Mesh(SPH, bubbleMat(col)); m.scale.setScalar(0.55); m.position.copy(origin); g.add(m);
    m.add(halo(col, 2.2, 0.6));
    pProj.push({ m, vel: dir.clone().normalize().multiplyScalar(115), life: 2.6, dmg: 18, col });
    muzzle(origin, col, 0.7);
  }
  // glowing tracer enemy shot (optionally ballistic via grav)
  function enemyShoot(from, dirVec, speed, dmg, col, grav = 0) {
    if (eProj.length > 90) return;
    const dir = dirVec.clone().normalize();
    const m = new THREE.Mesh(SPH_LO, bubbleMat(col, 1)); m.scale.setScalar(0.55); m.position.copy(from); g.add(m);
    const h = halo(col, 3.0, 0.85); m.add(h);
    eProj.push({ m, halo: h, vel: dir.multiplyScalar(speed), life: 5, dmg, col, trailT: 0, grav });
  }
  function muzzle(pos, col, scale) { const f = halo(col, 5 * scale, 0.9); f.position.copy(pos); g.add(f); parts.push({ m: f, vel: new THREE.Vector3(), life: 0.18, fade: 0.18, flash: true }); }
  function burst(pos, col, n) {
    for (let i = 0; i < n && parts.length < 70; i++) {
      const m = new THREE.Mesh(SPH_LO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
      m.scale.setScalar(0.3 + Math.random() * 0.4); m.position.copy(pos); g.add(m);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * 2;
      parts.push({ m, vel: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 6), e * 5, Math.sin(a) * (4 + Math.random() * 6)), life: 0.6, fade: 0.6 });
    }
  }
  function shockwave(pos, col) { if (parts.length >= 70) return; const s = halo(col, 4, 0.95); s.position.copy(pos); g.add(s); parts.push({ m: s, vel: new THREE.Vector3(), life: 0.5, fade: 0.5, grow: 70 }); }

  // a telegraphed ground blast zone (mortar bombs + boss rain): rings flash, then damage if you're inside
  function spawnZone(x, z, radius, delay, dmg, col) {
    if (zones.length >= 18) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.12, z); g.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fill.rotation.x = -Math.PI / 2; fill.position.set(x, 0.1, z); g.add(fill);
    zones.push({ ring, fill, x, z, radius, t: delay, max: delay, dmg, col, done: false });
  }
  // a sweeping/aimed beam telegraph that resolves into a fast lance
  function spawnBeam(from, to, dmg, col, windup, speed) {
    const dir = to.clone().sub(from); const len = dir.length(); dir.normalize();
    const geo = new THREE.CylinderGeometry(0.08, 0.08, len, 6);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    const mid = from.clone().addScaledVector(dir, len / 2); m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(m);
    beams.push({ m, from: from.clone(), dir: dir.clone(), len, dmg, col, t: windup, max: windup, speed, fired: false });
  }

  function bossCount() { return bosses.length; }
  function enemyCount() { return enemies.length; }
  function info() {
    return {
      bosses: bosses.length, drones: enemies.length, enemies: enemies.length, killCount, objective, won,
      playerProjectiles: pProj.length, enemyProjectiles: eProj.length, orbs: orbs.length, zones: zones.length,
      lock: !!lockObj, bossHp: bosses.reduce((s, b) => s + Math.max(0, b.hp), 0),
      enemyHp: enemies.reduce((s, e) => s + Math.max(0, e.hp), 0),
    };
  }
  function spawnHealthAt(x, z) { spawnHealth({ x, z }); }
  function killDrones() { for (const e of enemies) e.hp = 0; }       // legacy test-hook name
  function killEnemies() { for (const e of enemies) e.hp = 0; }

  // health pickup dropped by a dead enemy — collect by walking over it
  function spawnHealth(pos) {
    if (orbs.length > 8) return;
    const grp = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x0a2010, emissive: 0x45e07a, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.4 }));
    grp.add(core); grp.add(halo(0x45e07a, 4, 0.5)); grp.position.set(pos.x, 1.4, pos.z); g.add(grp);
    orbs.push({ m: grp, core, bob: Math.random() * 6, heal: 20 });
  }

  // ─────────────────────────── auto-aim target lock (mobile one-thumb aim) ───────────────────────────
  function ensureLockRing() {
    if (lockRing) return;
    lockRing = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthTest: false, side: THREE.DoubleSide }));
    lockRing.renderOrder = 996; lockRing.visible = false;
  }
  const objPos = (o) => (o.grp ? o.grp.position : o.m.position);
  const _v = new THREE.Vector3(), _camDir = new THREE.Vector3();
  function acquireTarget(camera, playerPos) {
    camera.getWorldDirection(_camDir); _camDir.y = 0; _camDir.normalize();
    let best = null, bestScore = Infinity;
    const consider = (obj, isBoss) => {
      _v.copy(objPos(obj)).sub(playerPos); const dist = _v.length(); if (dist < 0.01) return;
      _v.y = 0; _v.normalize();
      const front = Math.max(0, _v.dot(_camDir));
      const score = dist * (isBoss ? 0.25 : 1) * (1.3 - 0.4 * front);
      if (score < bestScore) { bestScore = score; best = obj; }
    };
    for (const b of bosses) consider(b, true);
    for (const e of enemies) consider(e, false);
    return best;
  }
  function nearestEnemyWithin(playerPos, maxd) {
    let best = null, bd = maxd;
    for (const e of enemies) { const dist = objPos(e).distanceTo(playerPos); if (dist < bd) { bd = dist; best = e; } }
    return best;
  }
  const _lockPrev = new THREE.Vector3(), _lockVel = new THREE.Vector3();
  let lockTracked = null;
  function updateLock(camera, playerPos, dt) {
    ensureLockRing(); if (!lockRing.parent) g.add(lockRing);
    if (lockObj && !(bosses.includes(lockObj) || enemies.includes(lockObj))) lockObj = null;
    const threat = nearestEnemyWithin(playerPos, 9);
    if (threat) lockObj = threat;
    else if (!lockObj) lockObj = acquireTarget(camera, playerPos);
    if (lockObj) {
      const isBoss = !!lockObj.grp, p = objPos(lockObj);
      if (lockObj === lockTracked && dt > 0) _lockVel.copy(p).sub(_lockPrev).multiplyScalar(1 / dt);
      else _lockVel.set(0, 0, 0);
      lockTracked = lockObj; _lockPrev.copy(p);
      lockRing.visible = true; lockRing.position.copy(p);
      const base = isBoss ? 7.5 : (lockObj.def ? lockObj.def.size * 1.6 : 2.6), pulse = base * (1 + 0.09 * Math.sin(performance.now() * 0.007));
      lockRing.scale.setScalar(pulse); lockRing.quaternion.copy(camera.quaternion);
      lockRing.material.color.setHex(isBoss ? 0xff6a6a : 0xffe04a);
    } else { lockRing.visible = false; lockTracked = null; }
  }
  function lockedPos() { if (!lockObj) return null; return objPos(lockObj).clone(); }
  function lockedAim(eye, speed) {
    if (!lockObj) return null;
    const p = objPos(lockObj).clone();
    const t = Math.min(1.2, p.distanceTo(eye) / Math.max(1, speed));
    return p.addScaledVector(_lockVel, t);
  }
  function hasLock() { return !!lockObj; }

  const tmp = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  // ─────────────────────────── boss phase + attack patterns ───────────────────────────
  function updatePhase(b) {
    const frac = b.hp / b.max, want = frac <= 0.25 ? 2 : frac <= 0.5 ? 1 : 0;
    if (want > b.phase) {
      b.phase = want;
      b.spin *= 1.5; b.orbitSpd *= 1.4; b.repo = Math.min(b.repo, 0.6);
      b.coreMat.emissive.setHex(b.enrageColor); b.light.color.setHex(b.enrageColor); b.glow.material.color.setHex(b.enrageColor);
      b.flash = Math.max(b.flash, 0.4); shockwave(b.grp.position, want === 2 ? 0xffffff : b.enrageColor); audio.sfx("boom");
    }
  }
  function bossFire(b, playerPos) {
    const base = b.grp.position.clone(); muzzle(base, b.color, 1.4);
    const pat = b.patterns[b.patIx % b.patterns.length]; b.patIx++;
    const aim = playerPos.clone(); aim.y = 1.4; const toP = aim.clone().sub(base).normalize();
    const ph = b.phase;
    if (pat === "fan") {
      const count = 2 + ph, spread = 0.13, speed = 30 + ph * 7;
      for (let k = -count; k <= count; k++) { const c = Math.cos(k * spread), s = Math.sin(k * spread); enemyShoot(base.clone(), new THREE.Vector3(toP.x * c - toP.z * s, toP.y, toP.x * s + toP.z * c), speed, 10, b.color); }
      audio.sfx("shoot");
    } else if (pat === "ring") {
      const n = 14 + ph * 6, speed = 24 + ph * 5;
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; enemyShoot(base.clone(), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), speed, 9, b.color); }
      audio.sfx("boom");
    } else if (pat === "spiral") {
      const arms = 2 + ph; for (let a = 0; a < arms; a++) { const ang = b.spiralA + (a / arms) * Math.PI * 2; enemyShoot(base.clone(), new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), 26, 8, b.color); } b.spiralA += 0.5; audio.sfx("shoot");
    } else if (pat === "burst") {
      for (let k = 0; k < 3; k++) enemyShoot(base.clone(), toP.clone(), 34 + ph * 6, 9, b.color);   // tight aimed triple
      audio.sfx("shoot");
    } else if (pat === "beam") {
      const tgt = aim.clone(); spawnBeam(base.clone(), tgt, 18 + ph * 4, b.color, 0.9, 110); audio.sfx("shoot");
    } else if (pat === "rain") {
      const n = 3 + ph; for (let k = 0; k < n; k++) { const rx = clampX(playerPos.x + rand(-14, 14)), rz = clampZ(playerPos.z + rand(-14, 14)); spawnZone(rx, rz, 4.2, 1.0, 16, b.color); } audio.sfx("boom");
    } else if (pat === "summon") {
      const kinds = ["imp", "imp", "drone", "wraith"]; const n = 2 + ph;
      for (let k = 0; k < n; k++) spawnEnemy(kinds[k % kinds.length], clampX(base.x + rand(-8, 8)), clampZ(base.z + rand(-8, 8)), {}); audio.sfx("boom");
    }
    b.fireT = (1.6 + Math.random() * 1.2) / (1 + ph * 0.35);
  }

  // ─────────────────────────── enemy behaviour ───────────────────────────
  function enemyFire(e, playerPos) {
    const from = e.m.position.clone(); const aim = playerPos.clone().setY(1.4);
    const toP = aim.clone().sub(from).normalize(); const fire = e.def.fire; const dmg = e.def.dmg * e.dmgMul;
    if (fire === "aimed") { muzzle(from, e.def.color, 0.7); enemyShoot(from, toP, e.def.pspeed, dmg, e.def.color); if (e.volley) { enemyShoot(from, toP.clone().applyAxisAngle(UP, 0.12), e.def.pspeed, dmg, e.def.color); enemyShoot(from, toP.clone().applyAxisAngle(UP, -0.12), e.def.pspeed, dmg, e.def.color); } audio.sfx("shoot"); }
    else if (fire === "sniper") { spawnBeam(from, aim.clone(), dmg, e.def.color, 0.5, e.def.pspeed); audio.sfx("shoot"); }
    else if (fire === "lob") { const v = toP.clone(); v.y = 0.5; enemyShoot(from, v.normalize(), e.def.pspeed, dmg, e.def.color, 18); audio.sfx("shoot"); }
    else if (fire === "bomb") { spawnZone(clampX(playerPos.x), clampZ(playerPos.z), 4.6, 1.1, dmg, e.def.color); audio.sfx("boom"); }
    else if (fire === "radial") { const n = e.volley ? 12 : 8; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + e.bob * 0.2; enemyShoot(from, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), e.def.pspeed, dmg, e.def.color); } audio.sfx("shoot"); }
    else if (fire === "tangent") { const tan = new THREE.Vector3(-toP.z, 0, toP.x); enemyShoot(from, tan, e.def.pspeed, dmg, e.def.color); enemyShoot(from, tan.clone().negate(), e.def.pspeed, dmg, e.def.color); audio.sfx("shoot"); }
    else if (fire === "summon") { const n = 2; for (let k = 0; k < n; k++) spawnEnemy(e.def.summon || "imp", clampX(from.x + rand(-6, 6)), clampZ(from.z + rand(-6, 6)), {}); audio.sfx("boom"); }
  }

  function updateEnemy(e, dt, playerPos, live) {
    e.bob += dt * 4;
    tmp.copy(playerPos).sub(e.m.position); tmp.y = 0; const dist = tmp.length(); tmp.normalize();
    const spd = e.def.speed * (e.speedMul || 1);
    if (live && e.def.move !== "static") {
      if (e.recoil > 0) { e.recoil -= dt; e.m.position.x = clampX(e.m.position.x - tmp.x * dt * 14); e.m.position.z = clampZ(e.m.position.z - tmp.z * dt * 14); }
      else if (e.def.move === "chase") { e.m.position.x = clampX(e.m.position.x + tmp.x * dt * spd); e.m.position.z = clampZ(e.m.position.z + tmp.z * dt * spd); }
      else if (e.def.move === "orbit") { e.orbitAng += dt * 1.2; const r = (e.def.band[0] + e.def.band[1]) / 2; e.m.position.x = clampX(playerPos.x + Math.cos(e.orbitAng) * r); e.m.position.z = clampZ(playerPos.z + Math.sin(e.orbitAng) * r); }
      else { // band: approach to a comfortable range, else strafe
        let mvx, mvz; const [near, far] = e.def.band;
        if (dist > far) { mvx = tmp.x; mvz = tmp.z; } else if (dist < near) { mvx = -tmp.x; mvz = -tmp.z; } else { mvx = -tmp.z; mvz = tmp.x; }
        e.m.position.x = clampX(e.m.position.x + mvx * dt * spd); e.m.position.z = clampZ(e.m.position.z + mvz * dt * spd);
      }
    }
    const yBase = (e.def.model === "imp" || e.def.model === "hound") ? 1.8 : 2.6;
    e.m.position.y = yBase + Math.sin(e.bob) * 0.4;
    // face the player (so the shield/eye orient correctly)
    if (dist > 0.1) e.m.rotation.y = Math.atan2(tmp.x, tmp.z);
    if (e.def.move === "static") e.m.rotation.y += dt * 1.5;     // sentry spins
    e.flash = Math.max(0, e.flash - dt);
    e.body.material.emissiveIntensity = (e.def.model === "wraith" ? 1.3 : 1.0) + e.flash * 5 + (e.wind > 0 ? 2.4 : 0);
    e.glow.material.opacity = 0.45 + (e.wind > 0 ? 0.5 : 0) + e.flash;
    if (e.crown) e.crown.rotation.z += dt * 2;

    if (!live) return 0;
    let melee = 0;
    // melee enemies hit on contact
    if (e.def.fire === "melee") {
      if (e.meleeCD > 0) e.meleeCD -= dt;
      if (dist < 2.6 && e.meleeCD <= 0) { melee += e.def.dmg * e.dmgMul; e.meleeCD = 0.8; e.recoil = 0.25; e.flash = 0.3; burst(e.m.position, e.def.color, 5); audio.sfx("hurt"); }
    } else {
      // ranged fire cycle with a visible wind-up telegraph
      if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) { e.wind = 0; enemyFire(e, playerPos); e.fireT = rand(e.def.cd[0], e.def.cd[1]) * e.fireMul; } }
      else { e.fireT -= dt; if (e.fireT <= 0) e.wind = e.windMax; }
    }
    return melee;
  }

  // ─────────────────────────── main step ───────────────────────────
  function update(dt, playerPos, camera, live) {
    let playerDamage = 0;
    const now = performance.now() * 0.001;
    if (live) { levelT += dt; runWaves(false); }

    // background trickle (survive/horde/boss pressure)
    if (live && trickle && enemies.length < (trickle.max || 6)) {
      trickleT -= dt; if (trickleT <= 0) { spawnEnemy(trickle.type || "drone", null, null, {}); trickleT = trickle.every || 3; }
    }

    // ── bosses ──
    for (let i = bosses.length - 1; i >= 0; i--) {
      const b = bosses[i]; const phaseMul = 1 + b.phase * 0.35;
      b.core.rotation.y += dt * b.spin; b.core.rotation.x += dt * b.spin * 0.5;
      for (let r = 0; r < b.rings.length; r++) b.rings[r].rotation.z += dt * b.spin * (r % 2 ? -1.6 : 1.4);
      const sp = now * (1.2 + b.phase * 0.5);
      for (let s = 0; s < b.spikes.length; s++) { b.spikes[s].position.applyAxisAngle(UP, dt * b.orbitSpd * 2 * phaseMul); b.spikes[s].rotation.y += dt * 2; }
      for (let p = 0; p < b.plates.length; p++) { b.plates[p].position.applyAxisAngle(UP, dt * b.orbitSpd * phaseMul); b.plates[p].position.y = Math.sin(sp + p) * 1.4; }
      b.glow.material.rotation += dt * 0.4;
      if (live) {
        b.repo -= dt;
        if (b.repo <= 0) { b.repo = (3 + Math.random() * 4) / phaseMul; b.tgt = { orbit: Math.min(HALF() - 12, 40 + Math.random() * 22), height: 8 + Math.random() * 9 }; }
        b.ang += dt * b.orbitSpd; b.orbit += (b.tgt.orbit - b.orbit) * Math.min(1, dt * 0.6); b.height += (b.tgt.height - b.height) * Math.min(1, dt * 0.6);
      }
      b.grp.position.set(centerX + Math.cos(b.ang) * b.orbit, b.height, centerZ + Math.sin(b.ang) * b.orbit);
      b.bar.quaternion.copy(camera.quaternion); setBar(b.bar, Math.max(0, b.hp) / b.max, b.phase > 0);
      b.flash = Math.max(0, b.flash - dt);
      const breathe = 1.2 + 0.5 * Math.sin(now * 4 + b.flicker), windGlow = b.wind > 0 ? (1 - b.wind / b.windMax) * 3.2 : 0;
      b.coreMat.emissiveIntensity = breathe + b.flash * 5 + windGlow;
      const targetScale = b.scale * (1 + (b.wind > 0 ? (1 - b.wind / b.windMax) * 0.35 : 0) + b.flash * 0.25);
      b.core.scale.setScalar(b.core.scale.x + (targetScale - b.core.scale.x) * Math.min(1, dt * 12));
      b.glow.material.opacity = 0.45 + windGlow * 0.12 + b.flash; b.light.intensity = 1.4 + windGlow * 0.6 + b.flash * 4;
      updatePhase(b);
      if (live) {
        if (b.wind > 0) { b.wind -= dt; if (b.wind <= 0) { b.wind = 0; bossFire(b, playerPos); } }
        else { b.fireT -= dt; if (b.fireT <= 0) b.wind = b.windMax; }
      }
    }

    // ── enemies ──
    for (let i = enemies.length - 1; i >= 0; i--) playerDamage += updateEnemy(enemies[i], dt, playerPos, live);

    // ── player projectiles ──
    for (let i = pProj.length - 1; i >= 0; i--) {
      const p = pProj[i]; p.m.position.addScaledVector(p.vel, dt); p.life -= dt; let hit = false;
      for (let j = bosses.length - 1; j >= 0; j--) { const b = bosses[j]; if (p.m.position.distanceTo(b.grp.position) < 6.5 * b.scale) { b.hp -= p.dmg; b.flash = Math.max(b.flash, 0.22); b.ang += (p.vel.x >= 0 ? 1 : -1) * 0.01; burst(p.m.position, p.col, 6); audio.sfx("hit"); hit = true; if (b.hp <= 0) killBoss(j); break; } }
      if (!hit) for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j]; const er = e.def.size + 0.7;
        if (p.m.position.distanceTo(e.m.position) < er) {
          // shielded enemy: shots into its front are mostly blocked
          if (e.def.shield) { tmp.copy(p.m.position).sub(e.m.position); tmp.y = 0; tmp.normalize(); const facing = new THREE.Vector3(Math.sin(e.m.rotation.y), 0, Math.cos(e.m.rotation.y)); if (tmp.dot(facing) > 0.35) { burst(p.m.position, 0x9fd8ff, 3); audio.sfx("hit"); hit = true; break; } }
          e.hp -= p.dmg; e.flash = Math.max(e.flash, 0.2); burst(p.m.position, p.col, 5); audio.sfx("hit"); hit = true;
          if (e.hp <= 0) killEnemy(j);
          break;
        }
      }
      const q = p.m.position;
      if (hit || p.life <= 0 || q.x < bounds.minX || q.x > bounds.maxX || q.z < bounds.minZ || q.z > bounds.maxZ) { g.remove(p.m); pProj.splice(i, 1); }
    }

    // ── enemy projectiles (tracers + ballistic lobs) ──
    for (let i = eProj.length - 1; i >= 0; i--) {
      const p = eProj[i]; if (p.grav) p.vel.y -= p.grav * dt; p.m.position.addScaledVector(p.vel, dt); p.life -= dt; p.m.rotation.y += dt * 3;
      p.trailT -= dt;
      if (p.trailT <= 0 && parts.length < 70) { p.trailT = 0.05; const t = new THREE.Mesh(SPH_LO, bubbleMat(p.col, 0.7)); t.scale.setScalar(0.3); t.position.copy(p.m.position); g.add(t); parts.push({ m: t, vel: new THREE.Vector3(), life: 0.25, fade: 0.25 }); }
      const dx = p.m.position.x - playerPos.x, dy = p.m.position.y - (playerPos.y + 1.4), dz = p.m.position.z - playerPos.z;
      if (live && dx * dx + dy * dy + dz * dz < 2.6) { playerDamage += p.dmg; burst(p.m.position, p.col, 5); audio.sfx("hurt"); g.remove(p.m); eProj.splice(i, 1); continue; }
      const q = p.m.position;
      if (p.life <= 0 || q.y < 0 || q.x < bounds.minX || q.x > bounds.maxX || q.z < bounds.minZ || q.z > bounds.maxZ) { g.remove(p.m); eProj.splice(i, 1); }
    }

    // ── beams (telegraph then lance) ──
    for (let i = beams.length - 1; i >= 0; i--) {
      const bm = beams[i]; bm.t -= dt; const f = Math.max(0, bm.t / bm.max);
      bm.m.material.opacity = bm.fired ? Math.max(0, bm.t / 0.18) : (0.3 + (1 - f) * 0.6); bm.m.scale.x = bm.m.scale.z = bm.fired ? 3 : (1 + (1 - f) * 2);
      if (!bm.fired && bm.t <= 0) {
        bm.fired = true; bm.t = 0.18; bm.max = 0.18;
        // resolve as a fast lance along the telegraph; dodgeable by leaving the line
        if (live) { const d = playerPos.clone().setY(1.4).sub(bm.from); const proj = d.dot(bm.dir); const closest = bm.from.clone().addScaledVector(bm.dir, Math.max(0, Math.min(bm.len, proj))); if (closest.distanceTo(playerPos.clone().setY(1.4)) < 2.4) playerDamage += bm.dmg; }
        burst(bm.from.clone().addScaledVector(bm.dir, bm.len * 0.5), bm.col, 8);
      }
      if (bm.t <= 0 && bm.fired) { g.remove(bm.m); beams.splice(i, 1); }
    }

    // ── blast zones (mortar / rain): telegraph, then AoE damage ──
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]; z.t -= dt; const f = Math.max(0, z.t / z.max);
      z.ring.material.opacity = 0.5 + (1 - f) * 0.45; z.fill.material.opacity = 0.1 + (1 - f) * 0.25;
      const pulse = z.radius * (0.9 + 0.1 * Math.sin(now * 12)); z.ring.scale.set(pulse / z.radius, pulse / z.radius, 1);
      if (z.t <= 0 && !z.done) {
        z.done = true;
        if (live) { const d = Math.hypot(playerPos.x - z.x, playerPos.z - z.z); if (d < z.radius) playerDamage += z.dmg; }
        burst(new THREE.Vector3(z.x, 0.5, z.z), z.col, 12); shockwave(new THREE.Vector3(z.x, 0.4, z.z), z.col); audio.sfx("boom");
        g.remove(z.ring); g.remove(z.fill); zones.splice(i, 1);
      }
    }

    // safety sweep — anything at <=0 HP gets cleaned up
    for (let j = bosses.length - 1; j >= 0; j--) if (bosses[j].hp <= 0) killBoss(j);
    for (let j = enemies.length - 1; j >= 0; j--) if (enemies[j].hp <= 0) killEnemy(j);

    // ── particles ──
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; p.m.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(0.9);
      const frac = Math.max(0, p.life / p.fade);
      if (p.grow) p.m.scale.setScalar(p.m.scale.x + dt * p.grow); else if (p.flash) p.m.scale.setScalar(p.m.scale.x * (1 + dt * 4)); else p.m.scale.multiplyScalar(1 + dt * 2);
      p.m.material.opacity = (p.grow || p.flash ? 0.95 : 1) * frac;
      if (p.life <= 0) { g.remove(p.m); parts.splice(i, 1); }
    }

    // ── health pickups ──
    let healCollected = 0;
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i]; o.bob += dt * 3; o.m.position.y = 1.4 + Math.sin(o.bob) * 0.25; o.core.rotation.y += dt * 1.6;
      if (live) { const dx = o.m.position.x - playerPos.x, dz = o.m.position.z - playerPos.z; if (dx * dx + dz * dz < 6.25) { healCollected += o.heal; burst(o.m.position, 0x45e07a, 8); g.remove(o.m); orbs.splice(i, 1); } }
    }

    updateLock(camera, playerPos, dt);

    // ── objective resolution ──
    const enemiesLeft = enemies.length, bossesLeft = bosses.length, markedLeft = enemies.filter((e) => e.marked).length;
    if (live && !won) {
      if (objective === "boss" || objective === "duel") { if (bossesLeft === 0) won = true; }   // kill the boss(es) = win; adds are just pressure
      else if (objective === "survive") { if (levelT >= target) won = true; }
      else if (objective === "horde") { if (killCount >= target) won = true; }
      else if (objective === "hunt") { if (spawnedAll && markedLeft === 0) won = true; }
      else { if (spawnedAll && enemiesLeft === 0 && bossesLeft === 0) won = true; }   // slay / gauntlet / assault
    }
    const changed = bossesLeft !== prevBosses; prevBosses = bossesLeft;

    // HUD label per objective
    let hudText = "";
    if (objective === "survive") hudText = "SURVIVE " + Math.max(0, Math.ceil(target - levelT)) + "s";
    else if (objective === "horde") hudText = "KILLS " + killCount + "/" + target;
    else if (objective === "hunt") hudText = "HUNT " + markedLeft;
    else if (bossesLeft) hudText = "BOSSES " + bossesLeft;
    else hudText = "ENEMIES " + enemiesLeft;

    return { playerDamage, healCollected, win: won, lose: false, changed, bossesLeft, enemiesLeft, killCount, markedLeft, hudText, objective };
  }

  function killEnemy(j) {
    const e = enemies[j]; killCount++;
    burst(e.m.position, e.def.color, 12); shockwave(e.m.position, e.def.color); audio.sfx("boom");
    // splitting affix: imps fracture into two weaker imps
    if (e.split && e.kind !== "imp") { for (let k = 0; k < 2; k++) { const ch = spawnEnemy("imp", clampX(e.m.position.x + rand(-2, 2)), clampZ(e.m.position.z + rand(-2, 2)), {}); if (ch) { ch.hp = ch.max = Math.ceil(ch.max * 0.6); } } }
    if (Math.random() < 0.32) spawnHealth(e.m.position);
    g.remove(e.m); enemies.splice(j, 1);
  }
  function killBoss(j) {
    const b = bosses[j];
    burst(b.grp.position, b.color, 24); shockwave(b.grp.position, 0xffffff); shockwave(b.grp.position, b.color); audio.sfx("boom");
    g.remove(b.grp); bosses.splice(j, 1);
  }

  function damageAll(n) { for (const b of bosses) b.hp -= n; for (const e of enemies) e.hp -= n; }

  // ── endless-mode hooks: drip fresh spawns / bosses into a live fight ──
  function pushWave(spawn) { (spawn || []).forEach(spawnGroup); }
  function addBoss(type, hp) { buildBoss(type | 0, hp || 1); bosses.forEach((b, i) => { b.ang = (i / Math.max(1, bosses.length)) * Math.PI * 2; }); }
  function setTrickle(t) { trickle = t; }

  return {
    spawn, update, playerShoot, bossCount, enemyCount, info, damageAll,
    lockedPos, lockedAim, hasLock, spawnHealthAt, killDrones, killEnemies, setBubbleColors,
    pushWave, addBoss, setTrickle, bossName: (ix) => BOSS_NAME[ix] || "BOSS",
  };
}
