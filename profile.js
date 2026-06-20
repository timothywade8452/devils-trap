// Devil's Trap — player profile: identity (id + name), country (IP geo), and run stats.
// Persisted in localStorage. Provides the name-capture modal that gates BOTH the landing page
// and the game, so every player is named before they play — and a baseline leaderboard entry is
// submitted the moment they join, so nobody who plays even one level is ever missed.

const KEY = "devilstrap_profile_v1";

function uid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEFAULT_STATS = { points: 0, deaths: 0, level: 0, bossKills: 0, plays: 0 };

export function getProfile() {
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && p.id) { p.stats = { ...DEFAULT_STATS, ...(p.stats || {}) }; return p; } } catch {}
  return null;
}
export function hasName() { const p = getProfile(); return !!(p && p.name); }
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }

export function setName(name) {
  const clean = String(name || "").trim().slice(0, 20) || "Anonymous";
  const p = getProfile() || { id: uid(), stats: { ...DEFAULT_STATS } };
  p.name = clean;
  return save(p);
}
export function setCountry(cc, country) {
  const p = getProfile(); if (!p) return null;
  p.cc = (cc || "").toUpperCase(); p.country = country || ""; return save(p);
}

// stat mutators (return the updated profile)
export function addPoints(n) { const p = getProfile(); if (!p) return null; p.stats.points += n; return save(p); }
export function addDeath() { const p = getProfile(); if (!p) return null; p.stats.deaths += 1; return save(p); }
export function addBossKill(n = 1) { const p = getProfile(); if (!p) return null; p.stats.bossKills += n; return save(p); }
export function bumpLevel(reached) { const p = getProfile(); if (!p) return null; p.stats.level = Math.max(p.stats.level, reached); return save(p); }
export function addPlay() { const p = getProfile(); if (!p) return null; p.stats.plays += 1; return save(p); }

// ── country via IP (free, no key; cached on the profile) ──
export async function detectCountry() {
  const p = getProfile(); if (p && p.cc) return { cc: p.cc, country: p.country };
  const tryFetch = async (url, pick) => {
    try { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) return null; return pick(await r.json()); } catch { return null; }
  };
  let res = await tryFetch("https://ipwho.is/", (j) => j && j.success !== false && j.country_code ? { cc: j.country_code, country: j.country } : null);
  if (!res) res = await tryFetch("https://get.geojs.io/v1/ip/country.json", (j) => j && j.country ? { cc: j.country, country: j.name || j.country } : null);
  if (res) setCountry(res.cc, res.country);
  return res || { cc: "", country: "" };
}

export function flag(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  try { return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))); } catch { return "🏳️"; }
}

// ── name-capture modal ──
let modalEl = null;
function buildModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement("div");
  modalEl.className = "name-modal";
  modalEl.innerHTML = `
    <div class="name-card">
      <h2>ENTER THE TRAP</h2>
      <p class="name-sub">Pick a name for the leaderboard.</p>
      <input id="name-input" type="text" maxlength="20" autocomplete="off" placeholder="Your name" />
      <p class="name-err" id="name-err"></p>
      <button id="name-go" class="name-go">CONTINUE</button>
      <p class="name-foot" id="name-foot">🌍 detecting country…</p>
    </div>`;
  document.body.appendChild(modalEl);
  return modalEl;
}

// Ensure a named profile exists. If missing, show the modal and resolve once submitted.
// Always resolves with the profile (never blocks the game's test hooks).
export function ensureName() {
  return new Promise((resolve) => {
    if (hasName()) { resolve(getProfile()); return; }
    const el = buildModal(); el.classList.add("show");
    const input = el.querySelector("#name-input"), err = el.querySelector("#name-err"), go = el.querySelector("#name-go"), foot = el.querySelector("#name-foot");
    setTimeout(() => { try { input.focus(); } catch {} }, 50);
    detectCountry().then((c) => { if (foot) foot.textContent = c && c.cc ? `${flag(c.cc)} ${c.country}` : "🌍 country unavailable"; });
    const submit = () => {
      const v = input.value.trim();
      if (!v) { err.textContent = "Please enter a name."; input.focus(); return; }
      setName(v);
      el.classList.remove("show");
      resolve(getProfile());
    };
    go.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  });
}

// Show the modal pre-filled to let a player change their name later.
export function openNameEditor(onDone) {
  const el = buildModal(); el.classList.add("show");
  const input = el.querySelector("#name-input"), go = el.querySelector("#name-go"), foot = el.querySelector("#name-foot");
  const p = getProfile(); if (p && p.name) input.value = p.name;
  if (p && p.cc) foot.textContent = `${flag(p.cc)} ${p.country}`;
  setTimeout(() => { try { input.focus(); } catch {} }, 50);
  const go2 = go.cloneNode(true); go.parentNode.replaceChild(go2, go);   // clear old listeners
  const submit = () => { const v = input.value.trim(); if (!v) return; setName(v); el.classList.remove("show"); onDone && onDone(getProfile()); };
  go2.addEventListener("click", submit);
  input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
}
