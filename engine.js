// Devil's Trap — first-person 3D rage-bait trap maze.
// Vanilla ES module + Three.js (CDN). All physics share tile rules with sim.js, so the
// verifier and the game agree on exactly what kills you.
import * as THREE from "three";
import { LEVELS } from "./levels.js";
import { TS, WALL_H, SOLID, FLOORLIKE, classify, tileAt } from "./sim.js";

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
};

// ───────────────────────── three setup ─────────────────────────
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060a, 0.018);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);

// lights
const hemi = new THREE.HemisphereLight(0x8088a0, 0x101015, 0.55); scene.add(hemi);
const amb = new THREE.AmbientLight(0x404858, 0.6); scene.add(amb);
const torch = new THREE.PointLight(0xfff2d8, 1.0, 70, 1.6); scene.add(torch); // follows the player
const sun = new THREE.DirectionalLight(0xbfc8e0, 0.5); sun.position.set(20, 60, 10);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
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
  floorA: texFloor("#caccd2", "#33363d"), // grey checker
  floorB: texFloor("#c9b48a", "#6e5a38"), // tan stone (later levels)
  lava: texLava(),
  door: (() => { const [e, x] = cv(128); x.fillStyle = "#2a1c14"; x.fillRect(0, 0, 128, 128); x.fillStyle = "#3c2a1d"; x.fillRect(14, 8, 100, 120); x.strokeStyle = "#1a0f08"; x.lineWidth = 4; x.strokeRect(20, 16, 88, 100); x.fillStyle = "#caa24a"; x.beginPath(); x.arc(98, 70, 5, 0, 7); x.fill(); return new THREE.CanvasTexture(e); })(),
};

const MAT = {
  wall: new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.95 }),
  door: new THREE.MeshStandardMaterial({ map: TEX.door, roughness: 0.8 }),
  pillar: new THREE.MeshStandardMaterial({ color: 0x111319, roughness: 0.4, metalness: 0.5 }),
  floorA: new THREE.MeshStandardMaterial({ map: TEX.floorA, roughness: 0.9 }),
  floorB: new THREE.MeshStandardMaterial({ map: TEX.floorB, roughness: 0.9 }),
  lava: new THREE.MeshStandardMaterial({ map: TEX.lava, emissive: 0xff4400, emissiveIntensity: 1.3, roughness: 0.5 }),
  spike: new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.35, metalness: 0.6 }),
  ceil: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 1 }),
};

// ───────────────────────── game state ─────────────────────────
const world = new THREE.Group(); scene.add(world);
const dynamic = [];                 // per-frame updaters for this level
let grid = [], gridW = 0, gridH = 0;
let levelIdx = 0, deaths = 0, totalDeaths = 0, sprung = new Set(), scorch = new Set();
let state = "menu";                 // menu | play | dead | win | victory
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, grounded: true };
let lavaY = -50, lavaPlane = null, riseTimer = 0;
const clock = new THREE.Clock();

const SCORCH_KEY = "devilstrap_scorch_v1";
try { scorch = new Set(JSON.parse(localStorage.getItem(SCORCH_KEY) || "[]")); } catch { scorch = new Set(); }

const HUD = {
  level: document.getElementById("hud-level"), name: document.getElementById("hud-name"),
  deaths: document.getElementById("hud-deaths"), msg: document.getElementById("msg"),
  msgTitle: document.getElementById("msg-title"), msgSub: document.getElementById("msg-sub"),
  msgHint: document.getElementById("msg-hint"), flash: document.getElementById("flash"),
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
  const floorMat = i >= 5 ? MAT.floorB : MAT.floorA;
  const floorGeo = new THREE.PlaneGeometry(TS, TS);
  const wallGeo = new THREE.BoxGeometry(TS, WALL_H, TS);

  for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) {
    const ch = grid[r][c]; const x = worldX(c), z = worldZ(r);
    // floor under every floor-like + lava tile (lava gets its own surface)
    if (FLOORLIKE.has(ch)) {
      const f = new THREE.Mesh(floorGeo, floorMat); f.rotation.x = -Math.PI / 2; f.position.set(x, 0, z); f.receiveShadow = true; world.add(f);
      if (ch === "o") f.userData.pitTile = `${r},${c}`; // trap slab that drops
      // scorch decal if the player has died here before (memory aid)
      if (scorch.has(`${i}:${r},${c}`)) addScorch(x, z);
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
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe8ff, emissiveIntensity: 2.2 }));
  orb.position.set(worldX(L.goal.c), 2.2, worldZ(L.goal.r)); world.add(orb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0x9fd4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(7, 7, 1); halo.position.copy(orb.position); world.add(halo);
  const orbLight = new THREE.PointLight(0xaad8ff, 1.4, 40, 2); orbLight.position.copy(orb.position); world.add(orbLight);
  dynamic.push((t) => { orb.position.y = 2.2 + Math.sin(t * 2) * 0.3; halo.position.y = orb.position.y; orbLight.position.y = orb.position.y; const p = 2 + Math.sin(t * 4) * 0.6; orb.material.emissiveIntensity = p; });

  // rising-lava finale plane
  lavaPlane = null;
  if (L.risingLava) {
    lavaPlane = new THREE.Mesh(new THREE.PlaneGeometry(gridW * TS + TS, gridH * TS + TS), MAT.lava);
    lavaPlane.rotation.x = -Math.PI / 2; lavaPlane.position.set((gridW - 1) * TS / 2, -50, (gridH - 1) * TS / 2); world.add(lavaPlane);
    lavaY = -50; riseTimer = L.riseTime;
  }

  respawn();
}

function addScorch(x, z) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(TS * 0.8, TS * 0.8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62 }));
  s.rotation.x = -Math.PI / 2; s.position.set(x, 0.04, z); world.add(s);
  const ring = new THREE.Mesh(new THREE.RingGeometry(TS * 0.28, TS * 0.4, 16), new THREE.MeshBasicMaterial({ color: 0xff3a1e, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z); world.add(ring);
}
function glowSprite() { const [e, x] = cv(128); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(170,212,255,0.5)"); g.addColorStop(1, "rgba(170,212,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(e); }

// ───────────────────────── spawn / die / win ─────────────────────────
function respawn() {
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
  const [r, c] = cellOf(player.pos.x, player.pos.z);
  scorch.add(`${levelIdx}:${r},${c}`); try { localStorage.setItem(SCORCH_KEY, JSON.stringify([...scorch])); } catch {}
  flash("#c01010");
  const pool = TAUNTS[reason] || TAUNTS.void;
  showMsg("YOU DIED", pool[Math.floor(Math.random() * pool.length)], "Press  R  or click to try again  ·  death #" + deaths);
  updateHUD();
}

function winLevel() {
  if (state !== "play") return;
  flash("#10c040");
  if (levelIdx + 1 >= LEVELS.length) {
    state = "victory";
    showMsg("YOU ESCAPED", "All 10 levels. The Devil is impressed.", "Total deaths: " + totalDeaths + "  ·  click for a victory lap");
  } else {
    state = "win";
    const next = LEVELS[levelIdx + 1];
    showMsg("LEVEL " + (levelIdx + 1) + " CLEAR", next.taunt, "Next: " + next.name + "  ·  press  Space  or click");
  }
}

function advance() {
  if (state === "win") buildLevel(levelIdx + 1);
  else if (state === "victory") { totalDeaths = 0; buildLevel(0); }
}

// ───────────────────────── input ─────────────────────────
const keys = {};
addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyR" && state === "play") respawn();
  if (e.code === "KeyR" && state === "dead") respawn();
  if (e.code === "Space" && (state === "win" || state === "victory")) advance();
});
addEventListener("keyup", (e) => { keys[e.code] = false; });

canvas.addEventListener("click", () => {
  if (state === "menu") { startGame(); return; }
  if (state === "dead") { respawn(); return; }
  if (state === "win" || state === "victory") { advance(); return; }
  if (!isTouch) canvas.requestPointerLock();
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas && state === "play") {
    player.yaw -= e.movementX * 0.0023; player.pitch = clamp(player.pitch - e.movementY * 0.0023, -1.3, 1.3);
  }
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// touch controls
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
let moveVec = { x: 0, y: 0 }, lookId = null, lastLook = null;
function setupTouch() {
  if (!isTouch) return;
  document.getElementById("touch").style.display = "block";
  const stick = document.getElementById("stick"), nub = document.getElementById("nub");
  let stickId = null, origin = null;
  const startStick = (t) => { stickId = t.identifier; const r = stick.getBoundingClientRect(); origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const moveStick = (t) => { const dx = clamp((t.clientX - origin.x) / 55, -1, 1), dy = clamp((t.clientY - origin.y) / 55, -1, 1); moveVec = { x: dx, y: dy }; nub.style.transform = `translate(${dx * 35}px,${dy * 35}px)`; };
  addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (state === "dead") { respawn(); return; }
      if (state === "win" || state === "victory") { advance(); return; }
      if (state === "menu") { startGame(); return; }
      if (t.clientX < innerWidth * 0.45 && stickId === null) startStick(t);
      else if (lookId === null) { lookId = t.identifier; lastLook = { x: t.clientX, y: t.clientY }; }
    }
  }, { passive: false });
  addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) moveStick(t);
      else if (t.identifier === lookId) { player.yaw -= (t.clientX - lastLook.x) * 0.006; player.pitch = clamp(player.pitch - (t.clientY - lastLook.y) * 0.006, -1.3, 1.3); lastLook = { x: t.clientX, y: t.clientY }; }
    }
    e.preventDefault();
  }, { passive: false });
  addEventListener("touchend", (e) => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; moveVec = { x: 0, y: 0 }; nub.style.transform = ""; } if (t.identifier === lookId) lookId = null; } });
  document.getElementById("jumpbtn").addEventListener("touchstart", (e) => { e.preventDefault(); if (player.grounded && state === "play") { player.vel.y = JUMP; player.grounded = false; } });
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
  // movement intent (camera-relative)
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (isTouch) { ix += moveVec.x; iz -= moveVec.y; }
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wantX = (ix * cos + iz * sin) * SPEED;
  const wantZ = (iz * cos - ix * sin) * SPEED;
  player.vel.x += (wantX - player.vel.x) * Math.min(1, ACCEL * dt / SPEED);
  player.vel.z += (wantZ - player.vel.z) * Math.min(1, ACCEL * dt / SPEED);
  if ((keys.Space) && player.grounded) { player.vel.y = JUMP; player.grounded = false; }

  // integrate horizontal + collide
  player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
  collide(player.pos);

  // ground / gravity
  const [r, c] = cellOf(player.pos.x, player.pos.z);
  const ch = tileAt(grid, r, c);
  const pitSprung = sprung.has(`${r},${c}`);
  const hasFloor = FLOORLIKE.has(ch) && !(ch === "o" && pitSprung);
  if (hasFloor && player.pos.y <= 0.01 && player.vel.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.grounded = true; }
  else { player.vel.y -= GRAV * dt; player.pos.y += player.vel.y * dt; player.grounded = false; }

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
function updateHUD() { const L = LEVELS[levelIdx]; HUD.level.textContent = "LV " + (levelIdx + 1) + "/" + LEVELS.length; HUD.name.textContent = L.name; HUD.deaths.textContent = "☠ " + deaths; }
function showMsg(title, sub, hint) { HUD.msgTitle.textContent = title; HUD.msgSub.textContent = sub; HUD.msgHint.textContent = hint; HUD.msg.classList.add("show"); }
function hideMsg() { HUD.msg.classList.remove("show"); }
let flashT = 0;
function flash(color) { HUD.flash.style.background = color; HUD.flash.style.opacity = "0.55"; flashT = 0.4; }

function startGame() { state = "play"; document.getElementById("intro").style.display = "none"; buildLevel(0); if (!isTouch) canvas.requestPointerLock(); }

// ───────────────────────── main loop ─────────────────────────
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()); const t = clock.elapsedTime;
  if (!window.__noRender) {
    tick(dt);
    // camera follow
    camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
    const dir = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
    camera.lookAt(camera.position.clone().add(dir));
    torch.position.copy(camera.position);
    for (const fn of dynamic) fn(t);
    // pit slabs dropping
    world.traverse((m) => { if (m.userData && m.userData.dropping && m.position.y > -16) { m.position.y -= dt * 30; if (m.position.y < -15) m.visible = false; } });
    if (flashT > 0) { flashT -= dt; HUD.flash.style.opacity = String(Math.max(0, flashT / 0.4 * 0.55)); }
    renderer.render(scene, camera);
  }
}

setupTouch();
frame();

// ───────────────────────── test / verify hooks ─────────────────────────
// Exposed so the headless harness can drive real physics without a human.
window.Trap = {
  get state() { return state; }, get deaths() { return deaths; }, get level() { return levelIdx; },
  get player() { return player; }, LEVELS, TS,
  start: startGame,
  goto(i) { document.getElementById("intro").style.display = "none"; buildLevel(i); },
  // step the simulation by hand (dt seconds), used by the bot
  step(dt) { tick(dt); },
  // place the player at a tile centre (verifier teleports along the safe path)
  toTile(r, c) { player.pos.set(worldX(c), 0, worldZ(r)); player.vel.set(0, 0, 0); player.grounded = true; },
  setKeys(obj) { Object.assign(keys, obj); },
  classifyTile(r, c) { return classify(tileAt(grid, r, c)); },
};
window.dispatchEvent(new Event("trap-ready"));
