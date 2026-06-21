// Functional test of the LIVE arena-campaign paths the headless win-pipeline (verify.mjs) skips:
// the level-select DOM overlay, the objective banner, and the per-frame hazard logic
// (lava chip, shrinking-ring damage, low-gravity, dark lighting) driven through the real tick()/frame().
import http from "http"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
let chromium; for (const p of ["/root/.npm/_npx/705bc6b22212b352/node_modules/playwright", "playwright"]) { try { chromium = require(p).chromium; if (chromium) break; } catch {} }
if (!chromium) { console.log("no playwright"); process.exit(0); }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mjs": "text/javascript" };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/play.html"; const fp = path.join(ROOT, p); fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); res.end("nf"); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "text/plain" }); res.end(d); }); });
const PORT = 8771; await new Promise((r) => server.listen(PORT, r));
let fail = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };
const noise = (s) => /Failed to load resource/i.test(s) || /ipwho\.is|geojs\.io|country\.is|firebaseio\.com/i.test(s);
const browser = await chromium.launch(); const page = await browser.newPage();
const errors = []; page.on("console", (m) => { if (m.type() === "error" && !noise(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => { if (!noise(String(e))) errors.push(String(e)); });
await page.goto(`http://localhost:${PORT}/play.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.Trap && window.Trap.arenaLevels, null, { timeout: 15000 });

console.log("\n=== level-select overlay (DOM) ===");
const sel = await page.evaluate(() => {
  window.Trap.openArenaSelect();
  const shown = document.getElementById("arena-select").classList.contains("show");
  const cells = document.querySelectorAll("#as-grid .as-cell").length;
  const worlds = document.querySelectorAll("#as-worlds .as-wtag").length;
  const endless = !!document.getElementById("as-endless");
  const unlocked = document.querySelectorAll("#as-grid .as-cell:not(.locked)").length;
  const bosses = document.querySelectorAll("#as-grid .as-cell.boss").length;
  return { shown, cells, worlds, endless, unlocked, bosses };
});
ok(sel.shown, "level-select opens");
ok(sel.cells === 50, `50 level cells render (${sel.cells})`);
ok(sel.worlds === 5, `5 world tags (${sel.worlds})`);
ok(sel.endless, "endless button present");
ok(sel.bosses === 6, `6 boss cells flagged — 10/20/30/40/45/50 (${sel.bosses})`);
ok(sel.unlocked >= 1, `at least level 1 unlocked (${sel.unlocked})`);

console.log("\n=== objective banner ===");
const banner = await page.evaluate(() => {
  window.Trap.arenaGoto(10);      // Into the Foundry (lava)
  return { tag: document.getElementById("arena-tag").textContent, chips: document.querySelectorAll("#arena-mods .ach").length, combatShown: !document.getElementById("combat").hidden };
});
ok(/Into the Foundry/.test(banner.tag), `banner shows level name ("${banner.tag}")`);
ok(banner.chips >= 1, `modifier/objective chips render (${banner.chips})`);
ok(banner.combatShown, "combat HUD visible in arena");

console.log("\n=== live hazard ticks (real tick() loop) ===");
// LAVA: stand the player on a lava patch and run real ticks → HP chips down
const lava = await page.evaluate(() => {
  window.Trap.arenaGoto(10); const h = window.Trap.arenaHaz;
  if (!h.lava.length) return { has: false };
  const p = h.lava[0]; window.Trap.player.pos.set(p.x, 0, p.z);
  const hp0 = window.Trap.hp; for (let k = 0; k < 12; k++) window.Trap.step(0.1);
  return { has: true, hp0, hp1: window.Trap.hp };
});
ok(lava.has, "lava level has lava patches");
ok(lava.hp1 < lava.hp0, `standing in lava damages the player (${lava.hp0}→${Math.round(lava.hp1)})`);
// SHRINK: stand outside the safe ring → HP chips down
const shrink = await page.evaluate(() => {
  window.Trap.arenaGoto(4); const h = window.Trap.arenaHaz, c = window.Trap.arenaCenter;
  window.Trap.player.pos.set(c.x + h.shrinkR0 + 10, 0, c.z);
  const hp0 = window.Trap.hp; for (let k = 0; k < 12; k++) window.Trap.step(0.1);
  return { shrinkOn: h.shrinkOn, hp0, hp1: window.Trap.hp };
});
ok(shrink.shrinkOn, "shrink level flags shrinkOn");
ok(shrink.hp1 < shrink.hp0, `outside the shrinking ring damages the player (${shrink.hp0}→${Math.round(shrink.hp1)})`);
// ONE-HIT: maxHp is 1 on sudden-death levels
const onehit = await page.evaluate(() => { window.Trap.arenaGoto(24); return window.Trap.arenaHaz.onehit; });
ok(onehit, "sudden-death level sets one-hit (maxHp=1)");

console.log("\n=== levels clear by REAL auto-fire (proves shields/enemies are killable, not just god-mode nuke) ===");
for (const [idx, name] of [[0, "First Steps"], [3, "The Shield Wall"], [9, "THE OVERSEER"]]) {
  const r = await page.evaluate((i) => {
    window.Trap.arenaGoto(i);
    let steps = 0; for (; steps < 1600 && window.Trap.state === "play"; steps++) window.Trap.arenaAutoStep(0.033, true);  // god-mode survival, REAL auto-aim fire
    const inf = window.Trap.arenaInfo();
    return { state: window.Trap.state, steps, enemies: inf.enemies, bosses: inf.bosses };
  }, idx);
  ok(r.state === "win" || r.state === "victory", `LV${idx + 1} ${name} clears by real fire (state=${r.state}, ${r.steps} steps)`);
}

console.log("\n=== live frames across hazard types (no console errors) ===");
for (const [idx, label] of [[10, "lava"], [21, "dark"], [45, "lowgrav"], [4, "shrink"], [9, "boss"]]) {
  await page.evaluate((i) => window.Trap.arenaGoto(i), idx);
  await page.waitForTimeout(350);   // let the real rAF frame() loop run (~20 frames)
}
await page.evaluate(() => window.Trap.startEndless());
await page.waitForTimeout(500);
ok(errors.length === 0, "no console errors across live arena frames + endless" + (errors.length ? " :: " + errors.slice(0, 4).join(" | ") : ""));

await browser.close(); server.close();
console.log(fail ? `\n✗ ${fail} functional check(s) failed` : "\n✓ FUNCTIONAL CHECKS PASSED");
process.exit(fail ? 1 : 0);
