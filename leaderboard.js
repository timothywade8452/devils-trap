// Devil's Trap — global leaderboard.
// Default backend: a free no-account JSON store (jsonblob) so it works on static Pages out of the
// box. Each submit does GET → upsert-this-player-by-id → PUT, mirroring to localStorage so the
// view still works offline and the local player is never lost. Optional Supabase mode gives a
// race-proof DB (atomic upsert) — see lbconfig.js / README.

import { CONFIG, isGlobal } from "./lbconfig.js";
import { flag, getProfile } from "./profile.js";

const STORE_KEY = "devilstrap_lb_store_v1";   // local store / cache of all known scores (keyed list)

function readStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } }
function writeStore(scores) { try { localStorage.setItem(STORE_KEY, JSON.stringify(scores)); } catch {} }

function entryOf(p) {
  return { id: p.id, name: p.name || "Anonymous", cc: p.cc || "", country: p.country || "",
    points: p.stats.points | 0, deaths: p.stats.deaths | 0, level: p.stats.level | 0,
    bossKills: p.stats.bossKills | 0, plays: p.stats.plays | 0, updated: Date.now() };
}
const upsert = (scores, e) => { const i = scores.findIndex((s) => s.id === e.id); if (i >= 0) scores[i] = e; else scores.push(e); return scores; };

// ── local backend (per-device, zero setup / offline fallback) ──
async function localFetch() { return readStore(); }
async function localSubmit(p) { writeStore(upsert(readStore(), entryOf(p))); return true; }

// ── firebase realtime DB backend (default GLOBAL) ──
// Per-player key writes are atomic, so concurrent saves never clobber each other → no user lost.
// text/plain is a CORS-"simple" content type → no preflight, works from the browser.
const fbAll = () => `${CONFIG.firebase.url}/${CONFIG.firebase.path}.json`;
const fbOne = (id) => `${CONFIG.firebase.url}/${CONFIG.firebase.path}/${encodeURIComponent(id)}.json`;
async function fbFetch() {
  try {
    const r = await fetch(fbAll(), { cache: "no-store" });
    if (r.ok) { const j = await r.json(); const arr = j ? (Array.isArray(j) ? j.filter(Boolean) : Object.values(j)) : []; writeStore(arr); return arr; }
  } catch {}
  return readStore();   // offline fallback
}
async function fbSubmit(p) {
  const e = entryOf(p); writeStore(upsert(readStore(), e));   // mirror locally first
  try { const r = await fetch(fbOne(e.id), { method: "PUT", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(e) }); return r.ok; } catch { return false; }
}

// ── supabase backend (optional global; atomic per-row upsert keyed by id) ──
function sbHeaders() { return { apikey: CONFIG.supabase.anon, Authorization: "Bearer " + CONFIG.supabase.anon, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }; }
async function sbFetch() {
  try { const u = `${CONFIG.supabase.url}/rest/v1/${CONFIG.supabase.table}?select=*&order=points.desc&limit=500`;
    const r = await fetch(u, { headers: sbHeaders() }); if (r.ok) { const s = await r.json(); writeStore(s); return s; } } catch {}
  return readStore();   // offline fallback
}
async function sbSubmit(p) {
  const e = entryOf(p); writeStore(upsert(readStore(), e));   // mirror locally too
  try { const u = `${CONFIG.supabase.url}/rest/v1/${CONFIG.supabase.table}`;
    const r = await fetch(u, { method: "POST", headers: sbHeaders(), body: JSON.stringify([e]) }); return r.ok; } catch { return false; }
}

export const GLOBAL = isGlobal();
const backend = CONFIG.mode === "firebase" ? { fetch: fbFetch, submit: fbSubmit }
  : (CONFIG.mode === "supabase" && GLOBAL) ? { fetch: sbFetch, submit: sbSubmit }
  : { fetch: localFetch, submit: localSubmit };
export async function fetchScores() { return backend.fetch(); }
// serialize writes so two submits never overlap
let inflight = Promise.resolve();
function rawSubmit(p) { inflight = inflight.then(() => backend.submit(p)).catch(() => {}); return inflight; }

// debounced submit so rapid score events coalesce into one network write
let pending = null, timer = null;
export function submit(profile, immediate = false) {
  const p = profile || getProfile(); if (!p || !p.id) return;
  pending = p;
  if (immediate) { clearTimeout(timer); timer = null; const x = pending; pending = null; return rawSubmit(x); }
  if (timer) return;
  timer = setTimeout(() => { timer = null; const x = pending; pending = null; if (x) rawSubmit(x); }, 1200);
}

export function sortScores(scores) {
  return [...scores].sort((a, b) => (b.points - a.points) || (a.deaths - b.deaths) || ((b.level | 0) - (a.level | 0)));
}

// ── leaderboard UI ──
let modal = null;
function build() {
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "lb-modal";
  modal.innerHTML = `
    <div class="lb-card">
      <div class="lb-head"><h2>🏆 LEADERBOARD</h2><button class="lb-close" aria-label="Close">✕</button></div>
      <div class="lb-body"><div class="lb-status">Loading…</div><table class="lb-table" hidden>
        <thead><tr><th>#</th><th>Player</th><th class="num">Points</th><th class="num">Deaths</th><th class="num lvl">Floor</th></tr></thead>
        <tbody></tbody></table></div>
      <div class="lb-foot"><span id="lb-me"></span><span class="lb-scope">${GLOBAL ? "🌍 Global" : "📱 This device"}</span><button class="lb-refresh">↻ Refresh</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelector(".lb-close").addEventListener("click", close);
  modal.querySelector(".lb-refresh").addEventListener("click", () => load());
  return modal;
}
export function renderInto(tbody, status, table, scores, meId, meRow) {
  const sorted = sortScores(scores);
  if (!sorted.length) { status.textContent = "No scores yet — be the first!"; status.hidden = false; table.hidden = true; return; }
  status.hidden = true; table.hidden = false;
  tbody.innerHTML = sorted.slice(0, 100).map((s, i) => {
    const me = s.id === meId ? " class=\"me\"" : "";
    const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
    const name = (s.name || "Anonymous").replace(/[<>&]/g, "");
    return `<tr${me}><td>${rank}</td><td><span class="fl">${flag(s.cc)}</span>${name}</td><td class="num">${s.points | 0}</td><td class="num">${s.deaths | 0}</td><td class="num lvl">${(s.level | 0) || "—"}</td></tr>`;
  }).join("");
  if (meRow) {
    const rank = sorted.findIndex((s) => s.id === meId);
    const me = sorted.find((s) => s.id === meId);
    meRow.textContent = me ? `You: #${rank + 1} · ${me.points | 0} pts · ☠ ${me.deaths | 0}` : "";
  }
}
async function load() {
  const m = build(); const status = m.querySelector(".lb-status"), table = m.querySelector(".lb-table"), tbody = m.querySelector("tbody"), meRow = m.querySelector("#lb-me");
  status.hidden = false; status.textContent = "Loading…"; table.hidden = true;
  const me = getProfile();
  const scores = await fetchScores();
  renderInto(tbody, status, table, scores, me && me.id, meRow);
}
export function openLeaderboard() { build().classList.add("show"); load(); }
function close() { if (modal) modal.classList.remove("show"); }

// render the top-N into an arbitrary element (used by the landing page section)
export async function renderTopInto(host, n = 10) {
  const me = getProfile(); const scores = sortScores(await fetchScores()).slice(0, n);
  if (!scores.length) { host.innerHTML = `<p class="lb-empty">No scores yet — play to claim #1.</p>`; return; }
  host.innerHTML = `<table class="lb-table"><thead><tr><th>#</th><th>Player</th><th class="num">Points</th><th class="num">Deaths</th><th class="num lvl">Floor</th></tr></thead><tbody>${
    scores.map((s, i) => {
      const meC = me && s.id === me.id ? " class=\"me\"" : "";
      const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
      const name = (s.name || "Anonymous").replace(/[<>&]/g, "");
      return `<tr${meC}><td>${rank}</td><td><span class="fl">${flag(s.cc)}</span>${name}</td><td class="num">${s.points | 0}</td><td class="num">${s.deaths | 0}</td><td class="num lvl">${(s.level | 0) || "—"}</td></tr>`;
    }).join("")}</tbody></table>`;
}
