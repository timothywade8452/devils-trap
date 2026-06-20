// Headless verification for Devil's Trap.
//  PART A (pure, no browser): every level has a 4-connected safe '.' path S->G (BEATABLE),
//          the path is salted with traps so the obvious straight route dies (RAGE BAIT),
//          and grids are rectangular / single S / single G.
//  PART B (real browser via Playwright): the page boots with no console errors, Three.js
//          initialises, and the live physics engine agrees with sim.js — a MEMORY bot that
//          teleport-steps the safe path WINS every level; a NAIVE bot that walks the straight
//          line DIES. Same trap code the human hits.
import { LEVELS } from "./levels.js";
import { safePath, tileAt, classify, SOLID } from "./sim.js";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (c, m) => { if (!c) { console.log("  ✗ " + m); fail++; } else console.log("  ✓ " + m); };

console.log("\n=== PART A · level integrity (pure) ===");
LEVELS.forEach((L, i) => {
  console.log(`\nL${i + 1} ${L.name}`);
  const g = L.grid, W = g[0].length;
  ok(g.every((r) => r.length === W), "rectangular grid");
  const flat = g.join("");
  ok((flat.match(/S/g) || []).length === 1, "exactly one start");
  ok((flat.match(/G/g) || []).length === 1, "exactly one goal");

  const p = safePath(L);
  ok(p && p.length >= 2, "safe path S→G exists (BEATABLE)" + (p ? ` len=${p.length}` : ""));

  // RAGE BAIT: the naive straight-ish route (Manhattan from S to G stepping greedily)
  // must hit a deadly/fall tile before reaching G.
  let r = L.start.r, c = L.start.c, naiveDied = false, guard = 0;
  while (!(r === L.goal.r && c === L.goal.c) && guard++ < 200) {
    const dr = Math.sign(L.goal.r - r), dc = Math.sign(L.goal.c - c);
    // prefer the axis with greater remaining distance, skip solids by trying the other axis
    let nr = r, nc = c;
    if (Math.abs(L.goal.r - r) >= Math.abs(L.goal.c - c) && dr) nr = r + dr; else if (dc) nc = c + dc; else if (dr) nr = r + dr;
    if (SOLID.has(tileAt(g, nr, nc))) { if (dc && !SOLID.has(tileAt(g, r, c + dc))) { nc = c + dc; nr = r; } else if (dr && !SOLID.has(tileAt(g, r + dr, c))) { nr = r + dr; nc = c; } }
    r = nr; c = nc;
    const k = classify(tileAt(g, r, c));
    if (k.kind === "die" || k.kind === "fall") { naiveDied = true; break; }
    if (k.kind === "win") break;
  }
  ok(naiveDied, "naive straight path hits a trap (RAGE BAIT)");

  // there should be a healthy field of traps
  const traps = (flat.match(/[\^o~JC]/g) || []).length;
  ok(traps >= 8, `dense trap field (${traps} traps)`);
});

if (fail) { console.log(`\n✗ PART A failed (${fail})`); process.exit(1); }
console.log("\n✓ PART A passed");

// ── PART B ───────────────────────────────────────────────────────────────────
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let chromium;
for (const p of ["/root/.npm/_npx/705bc6b22212b352/node_modules/playwright", "playwright"]) {
  try { chromium = require(p).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("\n(Playwright unavailable — skipping browser test)"); process.exit(0); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mjs": "text/javascript" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/play.html";
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); res.end("nf"); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "text/plain" }); res.end(d); });
});
const PORT = Number(process.env.PORT) || 8754;
await new Promise((r) => server.listen(PORT, r));

console.log("\n=== PART B · live engine (headless chromium) ===");
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`http://localhost:${PORT}/play.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.Trap && window.Trap.LEVELS, null, { timeout: 15000 }).catch(() => {});
const booted = await page.evaluate(() => !!(window.Trap && window.Trap.LEVELS));
ok(booted, "game booted + Three.js initialised");
ok(errors.length === 0, "no console errors" + (errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""));

if (booted) {
  // MEMORY bot — teleport-step along the verified safe path through the REAL engine.
  const memResults = await page.evaluate(async () => {
    const out = [];
    function bfsPath(L) {
      const grid = L.grid, S = L.start, G = L.goal, key = (r, c) => r + "," + c;
      const standable = (ch) => ch === "." || ch === "S" || ch === "G";
      const q = [[S.r, S.c]], prev = new Map([[key(S.r, S.c), null]]);
      while (q.length) { const [r, c] = q.shift(); if (r === G.r && c === G.c) { const p = []; let k = key(r, c); while (k) { const [a, b] = k.split(",").map(Number); p.unshift([a, b]); k = prev.get(k); } return p; }
        for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const nr = r + dr, nc = c + dc, nk = key(nr, nc); const ch = grid[nr] && grid[nr][nc]; if (ch && !prev.has(nk) && standable(ch)) { prev.set(nk, key(r, c)); q.push([nr, nc]); } } }
      return null;
    }
    for (let i = 0; i < window.Trap.LEVELS.length; i++) {
      window.Trap.goto(i);
      const L = window.Trap.LEVELS[i], path = bfsPath(L);
      let died = false;
      for (const [r, c] of path) {
        window.Trap.toTile(r, c);
        window.Trap.step(0.016);     // run real trap logic on this tile
        if (window.Trap.state === "dead") { died = true; break; }
        if (window.Trap.state === "win" || window.Trap.state === "victory") break;
      }
      const s = window.Trap.state;
      out.push({ i, died, win: s === "win" || s === "victory", state: s });
    }
    return out;
  });
  for (const m of memResults) ok(!m.died && m.win, `L${m.i + 1} MEMORY bot clears (state=${m.state})`);

  // NAIVE bot — straight greedy march on tile centres must die somewhere.
  const naiveResults = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < window.Trap.LEVELS.length; i++) {
      window.Trap.goto(i);
      const L = window.Trap.LEVELS[i]; let r = L.start.r, c = L.start.c, died = false, guard = 0;
      while (!(r === L.goal.r && c === L.goal.c) && guard++ < 200) {
        const dr = Math.sign(L.goal.r - r), dc = Math.sign(L.goal.c - c);
        if (Math.abs(L.goal.r - r) >= Math.abs(L.goal.c - c) && dr) r += dr; else if (dc) c += dc; else if (dr) r += dr;
        const cls = window.Trap.classifyTile(r, c);
        if (cls.kind === "solid") { if (dc) c += 0; break; }   // blocked — naive give up = also a fail to finish
        window.Trap.toTile(r, c); window.Trap.step(0.016);
        if (window.Trap.state === "dead") { died = true; break; }
        if (window.Trap.state === "win") break;
      }
      out.push({ i, died, state: window.Trap.state });
    }
    return out;
  });
  for (const n of naiveResults) ok(n.died, `L${n.i + 1} NAIVE bot dies (state=${n.state})`);

  // ── ARENA combat smoke test ──
  console.log("\n=== PART C · arena combat (live) ===");
  const arenaBoot = await page.evaluate(() => {
    window.Trap.startArena();
    const info = window.Trap.arenaInfo();
    return { mode: window.Trap.mode, hp: window.Trap.hp, bosses: info && info.bosses };
  });
  ok(arenaBoot.mode === "arena", "arena mode entered");
  ok(arenaBoot.bosses === 3, `3 bosses spawned (${arenaBoot.bosses})`);
  ok(arenaBoot.hp === 100, "player starts at 100 HP");

  // firing spawns player bubbles (added synchronously by the real shoot path)
  const fired = await page.evaluate(() => { window.Trap.fire(); return window.Trap.arenaInfo().playerProjectiles; });
  ok(fired >= 1, `firing spawns a bubble (${fired})`);

  // drive the arena deterministically — bosses fire, projectiles fly, player takes damage
  const afterRun = await page.evaluate(() => {
    let hp = 100, maxEnemy = 0;
    for (let i = 0; i < 200 && hp >= 100; i++) { hp = window.Trap.arenaStep(0.033); maxEnemy = Math.max(maxEnemy, window.Trap.arenaInfo().enemyProjectiles); }
    return { hp, maxEnemy };
  });
  ok(afterRun.maxEnemy > 0, `bosses/drones fire projectiles (${afterRun.maxEnemy} in flight)`);
  ok(afterRun.hp < 100, `enemy fire damages the player (HP ${afterRun.hp})`);

  // AIM ASSIST (mobile): without manual aiming, holding fire auto-locks + damages enemies
  const assist = await page.evaluate(() => {
    window.Trap.startArena();
    for (let i = 0; i < 5; i++) window.Trap.arenaStep(0.033);   // let a lock acquire
    const locked = window.Trap.arenaInfo().lock;
    const hp0 = window.Trap.arenaInfo().bossHp;
    let dropped = 0;
    for (let i = 0; i < 150 && window.Trap.state === "play"; i++) { const inf = window.Trap.arenaAutoStep(0.033); dropped = hp0 - inf.bossHp; }
    return { locked, hp0, dropped };
  });
  ok(assist.locked, "auto-aim acquires a target lock");
  ok(assist.dropped > 80, `auto-aim alone damages enemies without manual aiming (-${Math.round(assist.dropped)} boss HP)`);

  // fresh arena, kill all bosses through the real death/win pipeline
  const won = await page.evaluate(() => {
    window.Trap.startArena();        // reset: full HP, 3 bosses, state=play
    window.Trap.arenaNuke(); window.Trap.arenaStep(0.033);
    return { state: window.Trap.state, bosses: window.Trap.arenaInfo().bosses };
  });
  ok(won.bosses === 0, "all bosses cleared");
  ok(won.state === "victory", `arena win triggers (state=${won.state})`);
  ok(errors.length === 0, "no console errors in arena" + (errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""));
}

await browser.close();
server.close();
console.log(fail ? `\n✗ ${fail} check(s) failed` : "\n✓ ALL CHECKS PASSED — beatable, rage-bait, boots clean");
process.exit(fail ? 1 : 0);
