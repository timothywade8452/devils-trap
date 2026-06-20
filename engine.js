// Devil's Trap — first-person 3D rage-bait trap maze.
// Vanilla ES module + Three.js (CDN). All physics share tile rules with sim.js, so the
// verifier and the game agree on exactly what kills you.
import * as THREE from "three";
import { LEVELS } from "./levels.js";
import { TS, WALL_H, SOLID, FLOORLIKE, classify, tileAt } from "./sim.js";
// Post-processing addons (cinematic bloom). Loaded eagerly; if the CDN fetch
// fails we fall back to a plain render so the game still boots.
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { S, mountSettings, openSettings, isSettingsOpen } from "./settings.js";
import { createArena } from "./arena.js";

// ───────────────────────── tunables ─────────────────────────
const EYE = 2.3, RADIUS = 1.0, SPEED = 11, ACCEL = 60, JUMP = 9.2, GRAV = 26, DEATH_Y = -14;
const TAUNTS = {
  spike:  ["Those spikes were load-bearing.", "You stepped on the obvious one.", "Pointed feedback."],
  pit:    ["It looked solid. It wasn't.", "Bottomless. Like your patience.", "Mind the gap. The whole gap."],
  launch: ["That jump was illegal.", "You launched yourself again.", "Gravity says hi."],
  crush:  ["Heads up. Too late.", "The ceiling missed you. Just kidding.", "Flat-out wrong turn."],
  lava:   ["Hot take: don't touch lava.", "Medium rare.", "The floor was a warning."],
  lavarise:["Too slow. The floor is lava now.", "Should've run.", "Outrun by a puddle."],
  void:   ["You never learn.", "Reset your math, not your luck.", "Down you go."],
  shot:   ["Out-gunned.", "The bosses send their regards.", "You blinked. They didn't."],
};

// ───────────────────────── three setup ─────────────────────────
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// cinematic colour pipeline: filmic tone-map + sRGB output for richer, less "flat" lighting
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04050a, 0.02);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);
let BASE_FOV = 75;             // zoom lerps toward this / aimed values (follows the FOV setting)
let targetFov = BASE_FOV;

// lights
const hemi = new THREE.HemisphereLight(0x8088a0, 0x101015, 0.55); scene.add(hemi);
const amb = new THREE.AmbientLight(0x404858, 0.6); scene.add(amb);
const torch = new THREE.PointLight(0xfff2d8, 1.0, 70, 1.6); scene.add(torch); // follows the player
const sun = new THREE.DirectionalLight(0xbfc8e0, 0.55); sun.position.set(20, 60, 10);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.radius = 3;
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120; sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
scene.add(sun);

// ───────────────────────── procedural textures ─────────────────────────
function cv(s = 256) { const e = document.createElement("canvas"); e.width = e.height = s; return [e, e.getContext("2d")]; }
function noise(ctx, s, a, base) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < s * s * 0.5; i++) {
    const x = Math.random() * s, y = Math.random() * s, l = (Math.random() - 0.5) * a;
    ctx.fillStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${Math.abs(l) / 255})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}
function texConcrete() {
  const [e, x] = cv(256); noise(x, 256, 60, "#3a3d44");
  x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  const t = new THREE.CanvasTexture(e); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function texFloor(aCol, bCol) {
  const [e, x] = cv(256); const n = 4, c = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? aCol : bCol; x.fillRect(i * c, j * c, c, c); }
  noise2(x, 256, 26);
  x.strokeStyle = "rgba(0,0,0,0.25)"; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += c) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  const t = new THREE.CanvasTexture(e); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function noise2(ctx, s, a) { for (let i = 0; i < s * s * 0.25; i++) { const l = (Math.random() - 0.5) * a; ctx.fillStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${Math.abs(l) / 255})`; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); } }
function texLava() {
  const [e, x] = cv(128);
  for (let i = 0; i < 128 * 128 * 0.6; i++) { const v = Math.random(); x.fillStyle = v > 0.7 ? "#ffcf55" : v > 0.4 ? "#ff6a1a" : "#9a1500"; x.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
  const t = new THREE.CanvasTexture(e); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TEX = {
  concrete: texConcrete(),
  floorA: texFloor("#caccd2", "#33363d"), // grey checker  — Act I (cold slate)
  floorB: texFloor("#d2b487", "#6e5230"), // amber stone    — Act II (rust)
  floorC: texFloor("#b9a6dc", "#3a2c54"), // violet stone   — Act III (toxic)
  lava: texLava(),
  door: (() => { const [e, x] = cv(128); x.fillStyle = "#2a1c14"; x.fillRect(0, 0, 128, 128); x.fillStyle = "#3c2a1d"; x.fillRect(14, 8, 100, 120); x.strokeStyle = "#1a0f08"; x.lineWidth = 4; x.strokeRect(20, 16, 88, 100); x.fillStyle = "#caa24a"; x.beginPath(); x.arc(98, 70, 5, 0, 7); x.fill(); return new THREE.CanvasTexture(e); })(),
};
// crisp-up every texture: max anisotropy (sharp at grazing angles) + correct colour space
const maxAniso = renderer.capabilities.getMaxAnisotropy();
for (const k in TEX) { const t = TEX[k]; t.anisotropy = maxAniso; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; }

const MAT = {
  wall: new THREE.MeshStandardMaterial({ map: TEX.concrete, bumpMap: TEX.concrete, bumpScale: 0.06, roughness: 0.95, envMapIntensity: 0.5 }),
  door: new THREE.MeshStandardMaterial({ map: TEX.door, bumpMap: TEX.door, bumpScale: 0.04, roughness: 0.8 }),
  pillar: new THREE.MeshStandardMaterial({ color: 0x111319, roughness: 0.3, metalness: 0.75, envMapIntensity: 1.4 }),
  floorA: new THREE.MeshStandardMaterial({ map: TEX.floorA, bumpMap: TEX.floorA, bumpScale: 0.05, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.6 }),
  floorB: new THREE.MeshStandardMaterial({ map: TEX.floorB, bumpMap: TEX.floorB, bumpScale: 0.05, roughness: 0.88, metalness: 0.08, envMapIntensity: 0.5 }),
  floorC: new THREE.MeshStandardMaterial({ map: TEX.floorC, bumpMap: TEX.floorC, bumpScale: 0.05, roughness: 0.82, metalness: 0.12, envMapIntensity: 0.7 }),
  lava: new THREE.MeshStandardMaterial({ map: TEX.lava, emissive: 0xff4400, emissiveIntensity: 1.6, roughness: 0.5 }),
  spike: new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.25, metalness: 0.8, envMapIntensity: 1.5 }),
  ceil: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 1 }),
};

// ───────────────────────── environment reflections (PMREM, core API) ─────────────────────────
// A dark teal-to-black gradient sky baked into a pre-filtered cube so metal (pillars, spikes)
// pick up subtle real reflections instead of looking like flat plastic.
(function buildEnv() {
  const [e, x] = cv(512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0a1018"); g.addColorStop(0.45, "#0b1420"); g.addColorStop(0.6, "#10161e"); g.addColorStop(1, "#020305");
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // a faint cold glow band near the horizon for directional reflection
  const h = x.createRadialGradient(256, 240, 10, 256, 240, 260);
  h.addColorStop(0, "rgba(120,150,190,0.30)"); h.addColorStop(1, "rgba(120,150,190,0)");
  x.fillStyle = h; x.fillRect(0, 0, 512, 512);
  const eqTex = new THREE.CanvasTexture(e); eqTex.mapping = THREE.EquirectangularReflectionMapping; eqTex.colorSpace = THREE.SRGBColorSpace;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(eqTex).texture;
    eqTex.dispose(); pmrem.dispose();
  } catch { scene.environment = eqTex; }
})();

// per-act colour themes — fog, lights, wall tint and exit accent shift each act
const THEMES = [
  { floor: MAT.floorA, fog: 0x05060a, sky: 0x8088a0, ground: 0x101015, amb: 0x404858, torch: 0xfff2d8, wall: 0xa6abb6, accent: 0xaad8ff },
  { floor: MAT.floorB, fog: 0x0a0604, sky: 0xb08c5c, ground: 0x160d06, amb: 0x4e3a24, torch: 0xffd49a, wall: 0xc09a72, accent: 0xff9a3c },
  { floor: MAT.floorC, fog: 0x09040e, sky: 0x9778b6, ground: 0x130a1a, amb: 0x483a5c, torch: 0xe2c2ff, wall: 0xa98fcc, accent: 0xc35cff },
];

// ───────────────────────── game state ─────────────────────────
const world = new THREE.Group(); scene.add(world);
const dynamic = [];                 // per-frame updaters for this level
let grid = [], gridW = 0, gridH = 0;
let levelIdx = 0, deaths = 0, totalDeaths = 0, sprung = new Set();
let state = "menu";                 // menu | play | dead | win | victory
let mode = "maze";                  // maze | arena
let arena = null;                   // arena controller (created on first arena run)
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, grounded: true, coyote: 0, hp: 100 };
let lavaY = -50, lavaPlane = null, riseTimer = 0;
let bobPhase = 0, stepDist = 0;     // view-bob + footstep cadence
const clock = new THREE.Clock();

const HUD = {
  level: document.getElementById("hud-level"), name: document.getElementById("hud-name"),
  deaths: document.getElementById("hud-deaths"), msg: document.getElementById("msg"),
  msgTitle: document.getElementById("msg-title"), msgSub: document.getElementById("msg-sub"),
  msgHint: document.getElementById("msg-hint"), flash: document.getElementById("flash"),
  msgPrimary: document.getElementById("msg-primary"), msgMenu: document.getElementById("msg-menu"),
};

function worldX(c) { return c * TS; }
function worldZ(r) { return r * TS; }
function cellOf(x, z) { return [Math.round(z / TS), Math.round(x / TS)]; }

// ───────────────────────── build a level ─────────────────────────
function buildLevel(i) {
  levelIdx = i; deaths = 0; sprung = new Set(); riseTimer = 0;
  for (let k = world.children.length - 1; k >= 0; k--) world.remove(world.children[k]);
  dynamic.length = 0;
  const L = LEVELS[i]; grid = L.grid.map((r) => r.split("")); gridH = grid.length; gridW = grid[0].length;
  // apply this act's colour theme
  const theme = THEMES[L.tier || 0];
  const floorMat = theme.floor;
  scene.fog.color.setHex(theme.fog);
  hemi.color.setHex(theme.sky); hemi.groundColor.setHex(theme.ground);
  amb.color.setHex(theme.amb); torch.color.setHex(theme.torch);
  MAT.wall.color.setHex(theme.wall);
  const floorGeo = new THREE.PlaneGeometry(TS, TS);
  const wallGeo = new THREE.BoxGeometry(TS, WALL_H, TS);

  for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) {
    const ch = grid[r][c]; const x = worldX(c), z = worldZ(r);
    // floor under every floor-like + lava tile (lava gets its own surface)
    if (FLOORLIKE.has(ch)) {
      const f = new THREE.Mesh(floorGeo, floorMat); f.rotation.x = -Math.PI / 2; f.position.set(x, 0, z); f.receiveShadow = true; world.add(f);
      if (ch === "o") f.userData.pitTile = `${r},${c}`; // trap slab that drops
    }
    if (ch === "~") { const f = new THREE.Mesh(floorGeo, MAT.lava); f.rotation.x = -Math.PI / 2; f.position.set(x, 0.05, z); world.add(f); const pl = new THREE.PointLight(0xff5a18, 0.8, 12, 2); pl.position.set(x, 1.5, z); world.add(pl); }
    if (SOLID.has(ch)) {
      const mat = ch === "D" ? MAT.door : ch === "P" ? MAT.pillar : MAT.wall;
      if (ch === "P") { const g = new THREE.Mesh(new THREE.CylinderGeometry(TS * 0.32, TS * 0.36, WALL_H * 0.62, 16), mat); g.position.set(x, WALL_H * 0.31, z); g.castShadow = true; world.add(g); }
      else { const w = new THREE.Mesh(wallGeo, mat); w.position.set(x, WALL_H / 2, z); w.castShadow = true; w.receiveShadow = true; world.add(w); }
    }
  }

  // ceiling (dim, for enclosure + crush visual)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(gridW * TS + TS, gridH * TS + TS), MAT.ceil);
  ceil.rotation.x = Math.PI / 2; ceil.position.set((gridW - 1) * TS / 2, WALL_H, (gridH - 1) * TS / 2); world.add(ceil);

  // goal orb (the only real exit) — glowing, pulsing, with its own light
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: theme.accent, emissiveIntensity: 2.2 }));
  orb.position.set(worldX(L.goal.c), 2.2, worldZ(L.goal.r)); world.add(orb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: theme.accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(7, 7, 1); halo.position.copy(orb.position); world.add(halo);
  const orbLight = new THREE.PointLight(theme.accent, 1.4, 40, 2); orbLight.position.copy(orb.position); world.add(orbLight);
  // exit beacon: a tall shaft of light that rises above the walls so you can always orient
  // toward the real exit (it shows WHERE to go, never which tiles are safe).
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 1.5, WALL_H * 3.2, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.set(worldX(L.goal.c), WALL_H * 1.6, worldZ(L.goal.r)); world.add(beam);
  dynamic.push((t) => { orb.position.y = 2.2 + Math.sin(t * 2) * 0.3; halo.position.y = orb.position.y; orbLight.position.y = orb.position.y; const p = 2 + Math.sin(t * 4) * 0.6; orb.material.emissiveIntensity = p; beam.material.opacity = 0.12 + Math.sin(t * 3) * 0.05; });

  // rising-lava finale plane
  lavaPlane = null;
  if (L.risingLava) {
    lavaPlane = new THREE.Mesh(new THREE.PlaneGeometry(gridW * TS + TS, gridH * TS + TS), MAT.lava);
    lavaPlane.rotation.x = -Math.PI / 2; lavaPlane.position.set((gridW - 1) * TS / 2, -50, (gridH - 1) * TS / 2); world.add(lavaPlane);
    lavaY = -50; riseTimer = L.riseTime;
  }

  respawn();
}

function glowSprite() { const [e, x] = cv(128); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(170,212,255,0.5)"); g.addColorStop(1, "rgba(170,212,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(e); }

// ───────────────────────── spawn / die / win ─────────────────────────
function respawn() {
  if (mode === "arena") { buildArena(); return; }
  const L = LEVELS[levelIdx];
  player.pos.set(worldX(L.start.c), 0, worldZ(L.start.r));
  player.vel.set(0, 0, 0); player.grounded = true; player.pitch = 0;
  // face roughly toward the goal
  player.yaw = Math.atan2(worldX(L.goal.c) - player.pos.x, worldZ(L.goal.r) - player.pos.z);
  if (LEVELS[levelIdx].risingLava) { lavaY = -50; riseTimer = LEVELS[levelIdx].riseTime; if (lavaPlane) lavaPlane.position.y = -50; }
  sprung = new Set();
  // un-drop any pit slabs
  world.traverse((m) => { if (m.userData && m.userData.pitTile) { m.position.y = 0; m.visible = true; } });
  state = "play"; hideMsg();
  updateHUD();
}

function die(reason) {
  if (state !== "play") return;
  state = "dead"; deaths++; totalDeaths++;
  flash("#c01010"); AUDIO.sting("die");
  const pool = TAUNTS[reason] || TAUNTS.void;
  const label = mode === "arena" ? "FIGHT AGAIN" : "RETRY";
  showMsg("YOU DIED", pool[Math.floor(Math.random() * pool.length)],
    "death #" + deaths + "  ·  R / Space to retry", { label });
  updateHUD();
}

function winLevel() {
  if (state !== "play") return;
  flash("#10c040"); AUDIO.sting("win");
  if (levelIdx + 1 >= LEVELS.length) {
    state = "victory";
    showMsg("YOU ESCAPED", "All " + LEVELS.length + " floors. The Devil is impressed.",
      "Total deaths: " + totalDeaths + "  ·  Space to replay", { label: "PLAY AGAIN", clear: true });
  } else {
    state = "win";
    const next = LEVELS[levelIdx + 1];
    showMsg("LEVEL " + (levelIdx + 1) + " CLEAR", next.taunt,
      "Next: " + next.name + "  ·  Space to continue", { label: "NEXT FLOOR", clear: true });
  }
}

function advance() {
  if (mode === "arena") { buildArena(); return; }
  if (state === "win") buildLevel(levelIdx + 1);
  else if (state === "victory") { totalDeaths = 0; buildLevel(0); }
}

// ───────────────────────── input ─────────────────────────
const keys = {};
addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyR" && state === "play") respawn();
  if (e.code === "KeyR" && state === "dead") respawn();
  if (e.code === "Space" && state === "dead") respawn();
  if (e.code === "Space" && (state === "win" || state === "victory")) advance();
  // zoom: + / - (and keypad), 0 to reset
  if (e.code === "Equal" || e.code === "NumpadAdd") targetFov = clamp(targetFov - 6, 30, 100);
  if (e.code === "Minus" || e.code === "NumpadSubtract") targetFov = clamp(targetFov + 6, 30, 100);
  if (e.code === "Digit0" || e.code === "Numpad0") targetFov = BASE_FOV;
  if (e.code === "KeyM") toggleMute();
  if (e.code === "KeyP") { openSettings(); }
});
// mouse wheel = zoom in / out
addEventListener("wheel", (e) => { if (state === "play" && !isSettingsOpen()) { targetFov = clamp(targetFov + Math.sign(e.deltaY) * 5, 30, 100); e.preventDefault(); } }, { passive: false });
addEventListener("keyup", (e) => { keys[e.code] = false; });

canvas.addEventListener("click", () => {
  if (isSettingsOpen()) return;
  if (state === "menu") { startGame(); return; }
  if (state === "dead") { respawn(); return; }
  if (state === "win" || state === "victory") { advance(); return; }
  if (!isTouch) canvas.requestPointerLock();
});
// fire while pointer-locked in the arena (left button held = auto-fire, gated by cooldown)
canvas.addEventListener("mousedown", (e) => { if (e.button === 0 && mode === "arena" && document.pointerLockElement === canvas) { shootHeld = true; fire(); } });
addEventListener("mouseup", (e) => { if (e.button === 0) shootHeld = false; });
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas && state === "play" && !isSettingsOpen()) {
    const s = 0.0023 * S.sensitivity, iv = S.invertY ? -1 : 1;
    player.yaw -= e.movementX * s; player.pitch = clamp(player.pitch - e.movementY * s * iv, -1.3, 1.3);
  }
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────────────────── touch controls (fully customizable) ─────────────────────────
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
let moveVec = { x: 0, y: 0 }, touchSprint = false, shootHeld = false, editLayout = false;
const T = {};   // cached DOM refs

function safeInset(side) {            // read the CSS env(safe-area-inset-*) value in px (notch / home indicator)
  const v = getComputedStyle(document.documentElement).getPropertyValue("--safe-" + side);
  const n = parseFloat(v); return Number.isFinite(n) ? n : 0;
}
function defaultPos(ctrl) {            // [left, bottom] in px; move control opposite the action cluster
  const sl = safeInset("l"), sr = safeInset("r"), sb = safeInset("b");
  const w = innerWidth, moveLeft = S.mHanded === "right", m = 26;
  const ml = m + sl, mr = m + sr, mb = m + sb;     // keep clear of notches / home indicator
  const actX = moveLeft ? w - 116 - sr : ml, oppX = moveLeft ? ml : w - 116 - sr;
  switch (ctrl) {
    case "move":   return moveLeft ? [ml, mb] : [w - 158 - sr, mb];
    case "jump":   return [actX, mb + 6];
    case "sprint": return moveLeft ? [actX - 104, mb + 6] : [actX + 104, mb + 6];
    case "shoot":  return [actX, mb + 116];
  }
  return [ml, mb];
}
function applyMobileLayout() {
  if (!isTouch) return;
  const moveEl = S.mScheme === "dpad" ? T.dpad : T.stick;
  T.stick.style.display = S.mScheme === "dpad" ? "none" : "flex";
  T.dpad.style.display = S.mScheme === "dpad" ? "block" : "none";
  const place = (el, ctrl) => {
    if (!el) return;
    const p = S.mLayout[ctrl] || defaultPos(ctrl);
    el.style.left = p[0] + "px"; el.style.bottom = p[1] + "px";
    el.style.opacity = S.mOpacity; el.style.transform = `scale(${S.mScale})`; el.style.transformOrigin = "center";
    el.dataset.ctrl = ctrl;
  };
  place(moveEl, "move"); place(T.jump, "jump"); place(T.sprint, "sprint"); place(T.shoot, "shoot");
  T.shoot.style.display = (mode === "arena") ? "flex" : "none";
}

function setupTouch() {
  T.touch = document.getElementById("touch"); T.stick = document.getElementById("stick"); T.nub = document.getElementById("nub");
  T.dpad = document.getElementById("dpad"); T.jump = document.getElementById("jumpbtn"); T.sprint = document.getElementById("sprintbtn"); T.shoot = document.getElementById("shootbtn");
  if (!isTouch) return;
  document.body.classList.add("is-touch");   // unlocks touch-only CSS (top combat HUD, touch ctrl hint)
  T.touch.style.display = "block";
  applyMobileLayout();

  // a held-button helper that also doubles as a drag handle in layout-edit mode
  const holdBtn = (el, onDown, onUp) => {
    let dragId = null, off = null;
    el.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (editLayout) { const t = e.changedTouches[0]; dragId = t.identifier; const r = el.getBoundingClientRect(); off = { x: t.clientX - r.left, y: t.clientY - r.top }; return; }
      el.classList.add("held"); onDown && onDown();
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      if (!editLayout || dragId === null) return; e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) if (t.identifier === dragId) {
        const left = clamp(t.clientX - off.x, 0, innerWidth - el.offsetWidth);
        const bottom = clamp(innerHeight - (t.clientY - off.y) - el.offsetHeight, 0, innerHeight - el.offsetHeight);
        el.style.left = left + "px"; el.style.bottom = bottom + "px";
        S.mLayout[el.dataset.ctrl] = [Math.round(left), Math.round(bottom)]; saveS();
      }
    }, { passive: false });
    const end = (e) => { if (editLayout) { dragId = null; return; } el.classList.remove("held"); onUp && onUp(); };
    el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
  };

  holdBtn(T.jump, () => { if (state === "play" && (player.grounded || player.coyote > 0)) { player.vel.y = JUMP; player.grounded = false; player.coyote = 0; } });
  holdBtn(T.sprint, () => { touchSprint = true; }, () => { touchSprint = false; });
  holdBtn(T.shoot, () => { shootHeld = true; fire(); }, () => { shootHeld = false; });

  // analog stick
  let stickId = null, origin = null;
  holdBtnStick();
  function holdBtnStick() {
    T.stick.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      if (editLayout) { dragHandle(T.stick, t); return; }
      stickId = t.identifier; const r = T.stick.getBoundingClientRect(); origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, { passive: false });
    T.stick.addEventListener("touchmove", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (editLayout) return;
      for (const t of e.changedTouches) if (t.identifier === stickId) {
        const dx = clamp((t.clientX - origin.x) / 52, -1, 1), dy = clamp((t.clientY - origin.y) / 52, -1, 1);
        moveVec = { x: dx, y: dy }; T.nub.style.transform = `translate(${dx * 34}px,${dy * 34}px)`;
      }
    }, { passive: false });
    const end = () => { stickId = null; moveVec = { x: 0, y: 0 }; T.nub.style.transform = ""; };
    T.stick.addEventListener("touchend", end); T.stick.addEventListener("touchcancel", end);
  }
  // dpad
  T.dpad.querySelectorAll("button").forEach((b) => {
    const code = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[b.dataset.dir];
    b.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); if (editLayout) { dragHandle(T.dpad, e.changedTouches[0]); return; } keys[code] = true; b.classList.add("held"); }, { passive: false });
    const up = (e) => { keys[code] = false; b.classList.remove("held"); };
    b.addEventListener("touchend", up); b.addEventListener("touchcancel", up);
  });
  function dragHandle(el, t) {
    const r = el.getBoundingClientRect(), off = { x: t.clientX - r.left, y: t.clientY - r.top }, id = t.identifier;
    const mv = (e) => { for (const tt of e.changedTouches) if (tt.identifier === id) {
      const left = clamp(tt.clientX - off.x, 0, innerWidth - el.offsetWidth), bottom = clamp(innerHeight - (tt.clientY - off.y) - el.offsetHeight, 0, innerHeight - el.offsetHeight);
      el.style.left = left + "px"; el.style.bottom = bottom + "px"; S.mLayout[el.dataset.ctrl] = [Math.round(left), Math.round(bottom)]; saveS();
    } e.preventDefault(); };
    const up = () => { removeEventListener("touchmove", mv); removeEventListener("touchend", up); };
    addEventListener("touchmove", mv, { passive: false }); addEventListener("touchend", up);
  }

  // look — single-finger drag anywhere on the canvas (buttons sit above and stop propagation)
  let lookId = null, lastLook = null;
  canvas.addEventListener("touchstart", (e) => {
    if (editLayout || isSettingsOpen()) return;
    const t = e.changedTouches[0];
    if (state !== "play") return;       // taps for menu/respawn handled by the click event
    if (lookId === null) { lookId = t.identifier; lastLook = { x: t.clientX, y: t.clientY }; }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (lookId === null) return;
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      const s = 0.006 * S.sensitivity, iv = S.invertY ? -1 : 1;
      player.yaw -= (t.clientX - lastLook.x) * s; player.pitch = clamp(player.pitch - (t.clientY - lastLook.y) * s * iv, -1.3, 1.3);
      lastLook = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  canvas.addEventListener("touchend", lookEnd); canvas.addEventListener("touchcancel", lookEnd);
}

// ───────────────────────── physics & traps ─────────────────────────
function isSolidCell(r, c) { return SOLID.has(tileAt(grid, r, c)); }

function collide(pos) {
  // push the player circle out of any solid cell in the 3x3 neighbourhood
  const [pr, pc] = cellOf(pos.x, pos.z);
  for (let r = pr - 1; r <= pr + 1; r++) for (let c = pc - 1; c <= pc + 1; c++) {
    if (!isSolidCell(r, c)) continue;
    const minX = worldX(c) - TS / 2, maxX = worldX(c) + TS / 2, minZ = worldZ(r) - TS / 2, maxZ = worldZ(r) + TS / 2;
    const cx = clamp(pos.x, minX, maxX), cz = clamp(pos.z, minZ, maxZ);
    const dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 < RADIUS * RADIUS) {
      const d = Math.sqrt(d2) || 0.0001; const push = (RADIUS - d) / d;
      if (d2 > 0.0000001) { pos.x += dx * push; pos.z += dz * push; }
      else { pos.x = maxX + RADIUS; } // dead-center fallback
    }
  }
}

function tick(dt) {
  if (state !== "play") return;
  const frozen = isSettingsOpen();
  // movement intent (camera-relative)
  let ix = 0, iz = 0;
  if (!frozen) {
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (isTouch) { ix += moveVec.x; iz -= moveVec.y; }
  }
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const sprinting = keys.ShiftLeft || keys.ShiftRight || touchSprint;
  const spd = SPEED * S.moveSpeed * (sprinting ? 1.5 : 1);   // Shift / RUN to sprint
  // strafe sign matches the camera's actual screen-right axis (was mirrored before)
  const wantX = (iz * sin - ix * cos) * spd;
  const wantZ = (iz * cos + ix * sin) * spd;
  player.vel.x += (wantX - player.vel.x) * Math.min(1, ACCEL * dt / SPEED);
  player.vel.z += (wantZ - player.vel.z) * Math.min(1, ACCEL * dt / SPEED);
  // jump with a little coyote-time grace so a late press still works at ledges
  if (!frozen && keys.Space && (player.grounded || player.coyote > 0)) { player.vel.y = JUMP; player.grounded = false; player.coyote = 0; }

  // integrate horizontal + collide
  player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
  collide(player.pos);

  // ground / gravity
  const [r, c] = cellOf(player.pos.x, player.pos.z);
  const ch = tileAt(grid, r, c);
  const pitSprung = sprung.has(`${r},${c}`);
  const hasFloor = FLOORLIKE.has(ch) && !(ch === "o" && pitSprung);
  if (hasFloor && player.pos.y <= 0.01 && player.vel.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.grounded = true; player.coyote = 0.12; }
  else { player.vel.y -= GRAV * dt; player.pos.y += player.vel.y * dt; player.grounded = false; player.coyote = Math.max(0, player.coyote - dt); }

  // rising lava
  if (lavaPlane) {
    riseTimer -= dt; const L = LEVELS[levelIdx];
    lavaY = THREE.MathUtils.lerp(-50, WALL_H, 1 - Math.max(0, riseTimer) / L.riseTime);
    lavaPlane.position.y = lavaY;
    if (player.pos.y < lavaY) { die("lavarise"); return; }
  }

  // trap resolution by the tile under the player's centre
  if (player.grounded || player.pos.y <= 0.01) {
    const k = classify(ch);
    if (k.kind === "win") { winLevel(); return; }
    if (k.kind === "die") { springVisual(ch, r, c); die(k.reason); return; }
    if (k.kind === "fall") { sprung.add(`${r},${c}`); dropPit(r, c); /* gravity takes over */ }
  }
  if (player.pos.y < DEATH_Y) { die("void"); return; }
}

function dropPit(r, c) { world.traverse((m) => { if (m.userData && m.userData.pitTile === `${r},${c}` && m.visible) { m.userData.dropping = true; } }); }
function springVisual(ch, r, c) {
  const x = worldX(c), z = worldZ(r);
  if (ch === "^") { for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 6), MAT.spike); s.position.set(x + (Math.random() - 0.5) * 2.5, 1.2, z + (Math.random() - 0.5) * 2.5); world.add(s); } }
  if (ch === "C") { const b = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, TS), MAT.wall); b.position.set(x, 2, z); world.add(b); }
  if (ch === "J") { player.vel.y = 22; player.vel.x *= 3; player.vel.z *= 3; }
}

// ───────────────────────── HUD / overlays ─────────────────────────
function updateHUD() { if (mode === "arena") return; const L = LEVELS[levelIdx]; HUD.level.textContent = "LV " + (levelIdx + 1) + "/" + LEVELS.length; HUD.name.textContent = L.name; HUD.deaths.textContent = "☠ " + deaths; }
// showMsg(title, sub, hint, opts) — opts.label sets the primary button text, opts.clear styles it green,
// opts.action is the primary tap action (defaults to the state-driven respawn/advance). MENU is always shown.
function showMsg(title, sub, hint, opts = {}) {
  HUD.msgTitle.textContent = title; HUD.msgSub.textContent = sub; HUD.msgHint.textContent = hint || "";
  HUD.msgTitle.classList.toggle("clear", !!opts.clear);
  HUD.msgPrimary.textContent = opts.label || "RETRY";
  HUD.msgPrimary.classList.toggle("clear", !!opts.clear);
  msgPrimaryAction = opts.action || null;
  HUD.msg.classList.add("show");
}
function hideMsg() { HUD.msg.classList.remove("show"); }
// the primary overlay button runs this if set, else falls back to the canvas/state default (respawn/advance)
let msgPrimaryAction = null;
function runMsgPrimary() { if (msgPrimaryAction) msgPrimaryAction(); else if (state === "dead") respawn(); else if (state === "win" || state === "victory") advance(); }
// back-to-menu: show the intro overlay, drop combat HUD, release pointer-lock, reset to menu state
function backToMenu() {
  state = "menu";
  hideMsg();
  document.exitPointerLock?.();
  document.getElementById("combat").hidden = true;
  document.getElementById("intro").style.display = "";
  if (isTouch && T.shoot) T.shoot.style.display = "none";
}
HUD.msgPrimary.addEventListener("click", (e) => { e.stopPropagation(); runMsgPrimary(); });
HUD.msgMenu.addEventListener("click", (e) => { e.stopPropagation(); backToMenu(); });
// tapping the overlay background (not a button) still triggers the primary action, matching the old behaviour
HUD.msg.addEventListener("click", (e) => { if (e.target === HUD.msg || e.target.classList.contains("msg-inner")) runMsgPrimary(); });
// swallow touch on the buttons so the tap never falls through to the canvas look-handler underneath
["touchstart", "touchend"].forEach((ev) => {
  HUD.msgPrimary.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  HUD.msgMenu.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
});
let flashT = 0;
function flash(color) { HUD.flash.style.background = color; HUD.flash.style.opacity = "0.55"; flashT = 0.4; }

// ───────────────────────── generative dark-ambient music (WebAudio, no asset files) ─────────────────────────
// Built lazily on the first user gesture so the headless verifier never spins up an AudioContext.
const AUDIO = (() => {
  let ctx = null, master = null, musicBus = null, sfxBus = null, reverb = null, pad = [], lfo = null, timer = null, muted = false;
  const NOTES = [55, 65.41, 73.42, 82.41, 98];
  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, len = (rate * seconds) | 0, buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : S.masterVol; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = S.music ? 1 : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx ? 1 : 0; sfxBus.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(3.6, 2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.55; reverb.connect(wet); wet.connect(master);
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 300; filter.Q.value = 5;
    filter.connect(musicBus); filter.connect(reverb);
    lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 170; lfo.connect(lg); lg.connect(filter.frequency); lfo.start();
    for (const f of [55, 55.3, 82.41, 110]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.07; o.connect(g); g.connect(filter); o.start(); pad.push(o); }
    let step = 0;
    timer = setInterval(() => {
      if (!ctx || ctx.state !== "running") return;
      const t = ctx.currentTime;
      if (step % 2 === 0) thump(t);                 // sub-bass heartbeat
      if (Math.random() < 0.18) bell(t + 0.05);      // sparse dissonant bell
      step++;
    }, 900);
  }
  function thump(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.18); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.55); }
  function bell(t) { const base = NOTES[Math.floor(Math.random() * NOTES.length)] * 4; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = base * (Math.random() < 0.5 ? 1 : 1.5); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2); o.connect(g); g.connect(musicBus); g.connect(reverb); o.start(t); o.stop(t + 2.3); }
  // generic blip used by the arena (shoot / hit / boom) — routed through the sfx bus
  function blip(type, t) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(sfxBus);
    if (type === "shoot") { o.type = "square"; o.frequency.setValueAtTime(720, t); o.frequency.exponentialRampToValueAtTime(280, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.start(t); o.stop(t + 0.18); }
    else if (type === "hit") { o.type = "triangle"; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.start(t); o.stop(t + 0.15); }
    else if (type === "boom") { o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.start(t); o.stop(t + 0.52); }
    else if (type === "hurt") { o.type = "sawtooth"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.start(t); o.stop(t + 0.22); }
  }
  return {
    start() { try { ensure(); if (ctx.state === "suspended") ctx.resume(); } catch {} },
    toggle() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : S.masterVol, ctx.currentTime, 0.2); return muted; },
    get muted() { return muted; },
    setVolume(v) { if (master && !muted) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
    setMusic(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.1); },
    setSfx(on) { if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.1); },
    sfx(type) { if (ctx) blip(type, ctx.currentTime); },
    step() { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.08); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.13); },
    sting(type) {
      if (!ctx) return; const t = ctx.currentTime;
      if (type === "die") { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.6); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.7); }
      if (type === "win") { [392, 523.25, 659.25].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = f; const s = t + i * 0.09; g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.18, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.9); o.connect(g); g.connect(reverb); o.start(s); o.stop(s + 1); }); }
    },
  };
})();
function toggleMute() { const m = AUDIO.toggle(); const b = document.getElementById("mutebtn"); if (b) b.textContent = m ? "🔇" : "🔊"; }
function updateZoomHUD() { const z = document.getElementById("hud-zoom"); if (z) { const pct = Math.round(BASE_FOV / camera.fov * 100); z.textContent = pct === 100 ? "" : "🔍 " + pct + "%"; } }

function startGame() {
  mode = "maze"; document.getElementById("combat").hidden = true;
  state = "play"; document.getElementById("intro").style.display = "none";
  AUDIO.start(); buildLevel(0); applyMobileLayout();
  if (!isTouch) canvas.requestPointerLock();
}

// ───────────────────────── arena combat mode ─────────────────────────
let lastShot = 0;
function fire() {
  if (mode !== "arena" || !arena || state !== "play" || isSettingsOpen()) return;
  const now = clock.elapsedTime;
  if (now - lastShot < 0.2) return;
  lastShot = now;
  const dir = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
  const origin = new THREE.Vector3(player.pos.x, player.pos.y + EYE - 0.25, player.pos.z).addScaledVector(dir, 1.4);
  arena.playerShoot(origin, dir);
  AUDIO.sfx("shoot");
}

function buildArena() {
  mode = "arena"; levelIdx = 0; deaths = 0; sprung = new Set(); riseTimer = 0; lavaPlane = null;
  for (let k = world.children.length - 1; k >= 0; k--) world.remove(world.children[k]);
  dynamic.length = 0;
  const W = 41, H = 41, cx = (W - 1) >> 1, cz = (H - 1) >> 1;   // 41×4 = 164 units across — a big floor
  const g = Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => (r === 0 || c === 0 || r === H - 1 || c === W - 1) ? "#" : "."));
  for (let r = 4; r < H - 4; r += 6) for (let c = 4; c < W - 4; c += 6) { if (Math.abs(r - cz) < 4 && Math.abs(c - cx) < 4) continue; g[r][c] = "P"; }
  grid = g; gridH = H; gridW = W;
  const theme = THEMES[2];   // hellish violet arena
  scene.fog.color.setHex(theme.fog); hemi.color.setHex(theme.sky); hemi.groundColor.setHex(theme.ground);
  amb.color.setHex(theme.amb); torch.color.setHex(theme.torch); MAT.wall.color.setHex(theme.wall);
  const floorGeo = new THREE.PlaneGeometry(TS, TS), wallGeo = new THREE.BoxGeometry(TS, WALL_H, TS);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = g[r][c], x = worldX(c), z = worldZ(r);
    if (ch === ".") { const f = new THREE.Mesh(floorGeo, theme.floor); f.rotation.x = -Math.PI / 2; f.position.set(x, 0, z); f.receiveShadow = true; world.add(f); }
    else if (ch === "#") { const w = new THREE.Mesh(wallGeo, MAT.wall); w.position.set(x, WALL_H / 2, z); w.castShadow = true; w.receiveShadow = true; world.add(w); }
    else if (ch === "P") { const p = new THREE.Mesh(new THREE.CylinderGeometry(TS * 0.34, TS * 0.4, WALL_H * 0.85, 16), MAT.pillar); p.position.set(x, WALL_H * 0.42, z); p.castShadow = true; world.add(p); }
  }
  if (!arena) arena = createArena({ THREE, scene: world, MAT, glowSprite, audio: AUDIO, worldX, worldZ, bounds: { minX: TS, maxX: worldX(W - 2), minZ: TS, maxZ: worldZ(H - 2) } });
  arena.spawn(worldX(cx), worldZ(cz));
  player.pos.set(worldX(cx), 0, worldZ(cz)); player.vel.set(0, 0, 0); player.grounded = true; player.pitch = 0; player.yaw = 0; player.hp = 100;
  document.getElementById("combat").hidden = false;
  HUD.level.textContent = "ARENA"; HUD.name.textContent = "Slay the bosses"; HUD.deaths.textContent = "";
  updateCombatHUD(arena.bossCount());
  applyMobileLayout();
  state = "play"; hideMsg();
}
function startArena() { document.getElementById("intro").style.display = "none"; AUDIO.start(); buildArena(); if (!isTouch) canvas.requestPointerLock(); }
function winArena() { if (state !== "play") return; state = "victory"; flash("#10c040"); AUDIO.sting("win"); showMsg("ARENA CLEARED", "Every boss down. The Devil grins.", "Space to fight again", { label: "FIGHT AGAIN", clear: true }); }
function updateCombatHUD(bossesLeft) {
  const hp = Math.max(0, player.hp);
  document.getElementById("hp-fill").style.width = hp + "%";
  document.getElementById("hp-text").textContent = Math.round(hp);
  document.getElementById("boss-count").textContent = "BOSSES " + bossesLeft;
}

// ───────────────────────── settings application ─────────────────────────
let lastFov = S.fov;
function applySettings() {
  renderer.toneMappingExposure = S.brightness;
  if (bloomPass) bloomPass.strength = S.bloom;
  const q = S.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === "low" ? 1 : q === "med" ? 1.5 : 2));
  renderer.shadowMap.enabled = q !== "low";
  const sm = q === "high" ? 2048 : q === "med" ? 1024 : 512;
  if (sun.shadow.mapSize.width !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (AUDIO) { AUDIO.setVolume(S.masterVol); AUDIO.setMusic(S.music); AUDIO.setSfx(S.sfx); }
  if (S.fov !== lastFov) { targetFov = S.fov; lastFov = S.fov; } BASE_FOV = S.fov;
  const vig = document.getElementById("vignette"); if (vig) vig.style.display = S.vignette ? "block" : "none";
  applyMobileLayout();
  resize();
}

// ───────────────────────── post-processing (cinematic bloom) ─────────────────────────
// Wrapped so a CDN miss on the addons degrades gracefully to a plain render.
let composer = null, bloomPass = null;
try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.6, 0.8); // strength, radius, threshold
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
} catch (err) { composer = null; console.warn("bloom unavailable, plain render", err); }

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
  if (bloomPass) bloomPass.resolution.set(w, h);
}
addEventListener("resize", resize); resize();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()); const t = clock.elapsedTime;
  if (!window.__noRender) {
    tick(dt);
    // smooth zoom toward target FOV
    if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); updateZoomHUD(); }
    // camera follow + subtle view-bob while walking (immersion, render-only)
    const hspeed = Math.hypot(player.vel.x, player.vel.z);
    let bobY = 0, swayX = 0, swayZ = 0;
    if (state === "play" && player.grounded && hspeed > 0.8) {
      bobPhase += dt * hspeed * 1.3;
      const amp = Math.min(1, hspeed / SPEED);
      if (S.viewBob) {
        bobY = Math.sin(bobPhase * 2) * 0.09 * amp;
        const sway = Math.sin(bobPhase) * 0.06 * amp;        // gentle side-to-side
        swayX = -Math.cos(player.yaw) * sway; swayZ = Math.sin(player.yaw) * sway;
      }
      stepDist += hspeed * dt;
      if (stepDist > 2.4) { stepDist = 0; AUDIO.step(); }    // footstep on each stride
    } else { stepDist = 2.4; }
    camera.position.set(player.pos.x + swayX, player.pos.y + EYE + bobY, player.pos.z + swayZ);
    const dir = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
    camera.lookAt(camera.position.clone().add(dir));
    torch.position.copy(camera.position);
    for (const fn of dynamic) fn(t);
    // pit slabs dropping
    world.traverse((m) => { if (m.userData && m.userData.dropping && m.position.y > -16) { m.position.y -= dt * 30; if (m.position.y < -15) m.visible = false; } });
    // arena combat — enemies, bosses, projectiles
    if (mode === "arena" && arena) {
      if (shootHeld && state === "play") fire();
      const res = arena.update(dt, player.pos, camera, state === "play");
      if (state === "play") {
        if (res.playerDamage > 0) { player.hp = Math.max(0, player.hp - res.playerDamage); flash("rgba(200,20,20,0.9)"); AUDIO.sfx("hurt"); updateCombatHUD(res.bossesLeft); if (player.hp <= 0) die("shot"); }
        else if (res.changed) updateCombatHUD(res.bossesLeft);
        if (res.win) winArena();
      }
    }
    if (flashT > 0) { flashT -= dt; HUD.flash.style.opacity = String(Math.max(0, flashT / 0.4 * 0.55)); }
    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }
}

setupTouch();
mountSettings({ onChange: applySettings, onEditLayout: (on) => { editLayout = on; applyMobileLayout(); }, isTouch });
applySettings();
frame();

// ───────────────────────── test / verify hooks ─────────────────────────
// Exposed so the headless harness can drive real physics without a human.
window.Trap = {
  get state() { return state; }, get deaths() { return deaths; }, get level() { return levelIdx; },
  get mode() { return mode; }, get hp() { return player.hp; },
  get player() { return player; }, LEVELS, TS,
  start: startGame,
  startArena,
  backToMenu,
  openSettings,
  toggleMute,
  goto(i) { mode = "maze"; document.getElementById("combat").hidden = true; document.getElementById("intro").style.display = "none"; buildLevel(i); },
  // step the simulation by hand (dt seconds), used by the bot
  step(dt) { tick(dt); },
  // place the player at a tile centre (verifier teleports along the safe path)
  toTile(r, c) { player.pos.set(worldX(c), 0, worldZ(r)); player.vel.set(0, 0, 0); player.grounded = true; },
  setKeys(obj) { Object.assign(keys, obj); },
  classifyTile(r, c) { return classify(tileAt(grid, r, c)); },
  // arena hooks for the smoke test
  fire,
  arenaInfo() { return arena ? arena.info() : null; },
  arenaNuke() { if (arena) arena.damageAll(99999); },
  // deterministically advance the arena (the headless harness can't rely on rAF timing)
  arenaStep(dt) {
    if (mode !== "arena" || !arena) return player.hp;
    const res = arena.update(dt, player.pos, camera, true);
    if (res.playerDamage > 0) { player.hp = Math.max(0, player.hp - res.playerDamage); if (player.hp <= 0) die("shot"); }
    if (res.win) winArena();
    return player.hp;
  },
};
window.dispatchEvent(new Event("trap-ready"));
