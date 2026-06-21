// Devil's Trap — Souls economy + Shop (skins · upgrades · packs).
// Modeled on the proven Devil's Due loop: Souls are EARNED by playing and SPENT on cosmetic skins
// and a few FAIR upgrades that never trivialise the rage-bait core. SwagaCity's economy lessons are
// baked in: skill-scaled earning (harder difficulty pays more), cosmetic-first sinks, convenience
// ring-fenced (Brutal stays pure), and all tunable numbers live here in one balance block.
//
// Pure data/logic + a DOM panel. The engine imports the getters and re-applies on change; it never
// imports back, so there's no cycle.

import { SHOP_CONFIG } from "./shop-config.js";

const KEY = "devilstrap_shop_v1";

// ─────────────── balance (one place for every number) ───────────────
const EARN = { floorFirst: 30, floorReplay: 5, noDeath: 15, bossKill: 20, arenaWin: 150, victory: 400 };
const DIFF_MULT = { casual: 0.8, normal: 1, brutal: 1.5 };   // skill-scaled: grinding easy can't out-farm

// ─────────────── catalogs ───────────────
// A skin is a tiny data object of accent colours the FP game actually shows: arena energy-bubbles,
// the sonar ping, the dash trail, and the HUD/crosshair accent. No new art — just material params.
export const SKINS = [
  { id: "std",     name: "Standard Issue", price: 0,   blurb: "The colours you started with.",        bubble: [0x5cffd0, 0x7ce0ff, 0xb98cff], ping: 0xaad8ff, trail: 0x9fd4ff, accent: "159,212,255" },
  { id: "toxic",   name: "Toxic",          price: 120, blurb: "Radioactive green. Sickly and proud.",  bubble: [0xaaff77, 0x7ed957, 0x2f8f2f], ping: 0xaaff77, trail: 0x88ff66, accent: "136,255,102" },
  { id: "inferno", name: "Inferno",        price: 180, blurb: "Molten orange. Everything burns.",      bubble: [0xffd23c, 0xff7a18, 0xff3b2e], ping: 0xff9a3c, trail: 0xff7a2e, accent: "255,140,70" },
  { id: "glitch",  name: "Glitch",         price: 250, blurb: "Neon cyan. Beep boop, you're dead.",    bubble: [0xaef7ff, 0x39d4e6, 0x00f0ff], ping: 0x00f0ff, trail: 0x39d4e6, accent: "57,224,255" },
  { id: "royal",   name: "Royal",          price: 320, blurb: "Purple-blooded and insufferable.",      bubble: [0xe6c8ff, 0xa45dff, 0x5a1fb0], ping: 0xc060ff, trail: 0xc8a0ff, accent: "200,160,255" },
  { id: "gold",    name: "Gilded",         price: 420, blurb: "Solid gold and twice as smug.",         bubble: [0xfff0b0, 0xffcf5c, 0xc98a12], ping: 0xffd24a, trail: 0xffcf5c, accent: "255,207,92" },
  { id: "blood",   name: "Bloodlust",      price: 550, blurb: "Arterial red. The Devil approves.",     bubble: [0xff8a8a, 0xff3b3b, 0xb01010], ping: 0xff4a4a, trail: 0xff3b3b, accent: "255,90,90" },
  { id: "void",    name: "Void Walker",    price: 900, blurb: "A hole in reality. Legendary.",         bubble: [0xc0a0ff, 0x7a3fd0, 0x2a0a4a], ping: 0x9a7aff, trail: 0xb080ff, accent: "176,128,255" },
];
// Fair upgrades — toggleable, off by default (Magnet is always-on once owned). None reveal traps
// ahead or solve the maze; the ones that scout/scale are auto-disabled on Brutal so it stays pure.
export const UPGRADES = [
  { id: "magnet",    name: "Soul Magnet",     price: 500, blurb: "Permanent: earn DOUBLE Souls from everything.", always: true },
  { id: "scout",     name: "Scout's Reserve", price: 280, blurb: "+2 sonar pings per life. (Off on Brutal.)" },
  { id: "quickstep", name: "Quick Step",      price: 350, blurb: "Arena dash recharges 35% faster." },
  { id: "echo",      name: "Death Echo",      price: 220, blurb: "Marks the last spot a trap got you this floor." },
  { id: "ironheart", name: "Iron Heart",      price: 450, blurb: "Start the arena with +25 HP (125 total)." },
];
export const PACKS = SHOP_CONFIG.packs || [];
const PACK_NOTE = SHOP_CONFIG.note || "";

// ─────────────── persistence ───────────────
function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  return {
    souls: s.souls | 0,
    owned: { skins: ["std", ...((s.owned && s.owned.skins) || []).filter((x) => x !== "std")], upgrades: (s.owned && s.owned.upgrades) || [] },
    equip: { skin: (s.equip && s.equip.skin) || "std", upgrades: (s.equip && s.equip.upgrades) || [] },
    cleared: s.cleared || [],
  };
}
const D = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch {} }

const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
const upById = (id) => UPGRADES.find((u) => u.id === id);
const ownsSkin = (id) => D.owned.skins.includes(id);
const ownsUp = (id) => D.owned.upgrades.includes(id);
// an upgrade is ACTIVE if owned and (always-on, or toggled on)
export function upgradeOn(id) { return ownsUp(id) && (upById(id)?.always || D.equip.upgrades.includes(id)); }

// ─────────────── getters the engine applies ───────────────
export const souls = () => D.souls;
export const equippedSkin = () => D.equip.skin;
export function skinColors() { return skinById(D.equip.skin); }
export const soulMagnet = () => upgradeOn("magnet");
export const pingBonus = () => (upgradeOn("scout") ? 2 : 0);
export const dashMult = () => (upgradeOn("quickstep") ? 0.65 : 1);
export const deathEcho = () => upgradeOn("echo");
export const arenaMaxHp = () => (upgradeOn("ironheart") ? 125 : 100);

// ─────────────── earning ───────────────
// award("floor", {idx, deaths, finished, difficulty}) | ("boss", {n, difficulty}) | ("arenaWin", {difficulty})
export function award(kind, o = {}) {
  const dm = DIFF_MULT[o.difficulty] || 1;
  let e = 0;
  if (kind === "floor") {
    const first = D.cleared.indexOf(o.idx) < 0;
    e += first ? EARN.floorFirst : EARN.floorReplay;
    if (first) D.cleared.push(o.idx);
    if (o.deaths === 0) e += EARN.noDeath;        // skill bonus
    e = Math.round(e * dm);
    if (o.finished) e += Math.round(EARN.victory * dm);
  } else if (kind === "boss") { e = Math.round(EARN.bossKill * (o.n || 1) * dm); }
  else if (kind === "arenaWin") { e = Math.round(EARN.arenaWin * dm); }
  if (soulMagnet()) e *= 2;
  D.souls += e; save();
  return e;
}

// ─────────────── spending ───────────────
let onChange = null;
function changed() { save(); onChange && onChange(); }
export function buySkin(id) {
  const s = skinById(id); if (ownsSkin(id)) return equipSkin(id);
  if (D.souls < s.price) return { ok: false, reason: "poor" };
  D.souls -= s.price; D.owned.skins.push(id); D.equip.skin = id; changed(); return { ok: true };
}
export function equipSkin(id) { if (!ownsSkin(id)) return { ok: false, reason: "locked" }; D.equip.skin = id; changed(); return { ok: true }; }
export function buyUpgrade(id) {
  const u = upById(id); if (!u) return { ok: false };
  if (ownsUp(id)) return { ok: false, reason: "owned" };
  if (D.souls < u.price) return { ok: false, reason: "poor" };
  D.souls -= u.price; D.owned.upgrades.push(id);
  if (!u.always) D.equip.upgrades.push(id);    // auto-equip toggleable upgrades
  changed(); return { ok: true };
}
export function toggleUpgrade(id) {
  if (!ownsUp(id) || upById(id)?.always) return { ok: false };
  const i = D.equip.upgrades.indexOf(id);
  if (i >= 0) D.equip.upgrades.splice(i, 1); else D.equip.upgrades.push(id);
  changed(); return { ok: true, on: upgradeOn(id) };
}
export function buyPack(id) {
  const p = PACKS.find((x) => x.id === id); if (!p) return { ok: false };
  if (p.buyUrl) { try { window.open(p.buyUrl, "_blank", "noopener"); } catch {} return { ok: true, opened: true }; }
  return { ok: false, reason: "unconfigured" };
}

// ─────────────── shop panel UI ───────────────
let panel = null, tab = "skins";
const hex = (n) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
function el(t, c, h) { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }

export function mountShop({ onChange: cb }) { onChange = cb; }
export function isShopOpen() { return panel && panel.classList.contains("show"); }
export function openShop() { build(); render(); panel.classList.add("show"); document.exitPointerLock?.(); }
export function closeShop() { if (panel) panel.classList.remove("show"); }

function build() {
  if (panel) return;
  panel = el("div", "shop-panel");
  panel.innerHTML = `
    <div class="shop-card">
      <div class="shop-head"><h2>🛒 SOUL SHOP</h2><span class="shop-bal" id="shop-bal"></span><button class="shop-close" aria-label="Close">✕</button></div>
      <div class="shop-tabs">
        <button class="shop-tab" data-t="skins">Skins</button>
        <button class="shop-tab" data-t="upgrades">Upgrades</button>
        <button class="shop-tab" data-t="packs">Get Souls</button>
      </div>
      <div class="shop-body" id="shop-body"></div>
      <p class="shop-flash" id="shop-flash"></p>
    </div>`;
  document.body.appendChild(panel);
  panel.addEventListener("click", (e) => { if (e.target === panel) closeShop(); });
  panel.querySelector(".shop-close").addEventListener("click", closeShop);
  panel.querySelectorAll(".shop-tab").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.t; render(); }));
}
let flashT = null;
function flash(msg) { const f = panel.querySelector("#shop-flash"); f.textContent = msg; f.classList.add("on"); clearTimeout(flashT); flashT = setTimeout(() => f.classList.remove("on"), 1100); }
function render() {
  if (!panel) return;
  panel.querySelector("#shop-bal").textContent = "💀 " + D.souls;
  panel.querySelectorAll(".shop-tab").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  const body = panel.querySelector("#shop-body"); body.innerHTML = "";
  if (tab === "skins") body.appendChild(renderSkins());
  else if (tab === "upgrades") body.appendChild(renderUpgrades());
  else body.appendChild(renderPacks());
}
function swatch(s) { return `<span class="sw" style="background:linear-gradient(135deg,${hex(s.bubble[0])},${hex(s.bubble[1])},${hex(s.bubble[2])})"></span>`; }
function renderSkins() {
  const grid = el("div", "shop-grid");
  for (const s of SKINS) {
    const owned = ownsSkin(s.id), eq = D.equip.skin === s.id;
    const card = el("div", "shop-card-item" + (eq ? " equipped" : ""));
    card.innerHTML = `${swatch(s)}<div class="ci-n">${s.name}</div><div class="ci-b">${s.blurb}</div>`;
    const btn = el("button", "ci-btn");
    if (eq) { btn.textContent = "EQUIPPED"; btn.classList.add("eqd"); btn.disabled = true; }
    else if (owned) { btn.textContent = "EQUIP"; btn.onclick = () => { equipSkin(s.id); render(); }; }
    else { btn.textContent = "💀 " + s.price; btn.onclick = () => { const r = buySkin(s.id); if (!r.ok && r.reason === "poor") flash("Not enough Souls"); else render(); }; }
    card.appendChild(btn); grid.appendChild(card);
  }
  return grid;
}
function renderUpgrades() {
  const grid = el("div", "shop-grid");
  for (const u of UPGRADES) {
    const owned = ownsUp(u.id), on = upgradeOn(u.id);
    const card = el("div", "shop-card-item" + (on ? " equipped" : ""));
    card.innerHTML = `<div class="ci-up">⚙</div><div class="ci-n">${u.name}</div><div class="ci-b">${u.blurb}</div>`;
    const btn = el("button", "ci-btn");
    if (!owned) { btn.textContent = "💀 " + u.price; btn.onclick = () => { const r = buyUpgrade(u.id); if (!r.ok && r.reason === "poor") flash("Not enough Souls"); else render(); }; }
    else if (u.always) { btn.textContent = "OWNED"; btn.classList.add("eqd"); btn.disabled = true; }
    else { btn.textContent = on ? "ON" : "OFF"; btn.classList.toggle("eqd", on); btn.onclick = () => { toggleUpgrade(u.id); render(); }; }
    card.appendChild(btn); grid.appendChild(card);
  }
  return grid;
}
function renderPacks() {
  const wrap = el("div");
  const grid = el("div", "shop-grid");
  for (const p of PACKS) {
    const card = el("div", "shop-card-item" + (p.best ? " best" : ""));
    card.innerHTML = `<div class="ci-up">💀</div><div class="ci-n">${p.name}</div><div class="ci-b">${p.souls.toLocaleString()} Souls${p.best ? " · best value" : ""}</div>`;
    const btn = el("button", "ci-btn");
    if (p.buyUrl) { btn.textContent = p.priceLabel; btn.onclick = () => buyPack(p.id); }
    else { btn.textContent = p.priceLabel; btn.classList.add("soon"); btn.onclick = () => flash("Coming soon"); }
    card.appendChild(btn); grid.appendChild(card);
  }
  wrap.appendChild(grid);
  wrap.appendChild(el("p", "shop-note", PACK_NOTE + (PACKS.every((p) => !p.buyUrl) ? "" : "")));
  return wrap;
}
