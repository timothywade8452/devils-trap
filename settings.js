// Devil's Trap — settings store + in-game settings panel.
// One source of truth for tunables (audio / video / gameplay / mobile), persisted to
// localStorage. The panel mutates S, saves, and calls the engine's onChange so it can
// re-apply everything live. No framework — plain DOM built once on first open.

const KEY = "devilstrap_settings_v1";

export const DEFAULTS = {
  // audio
  masterVol: 0.7, music: true, sfx: true,
  // video
  brightness: 1.05, bloom: 0.8, quality: "high", vignette: true,
  // gameplay
  moveSpeed: 1.0, sensitivity: 1.0, fov: 75, invertY: false, viewBob: true, autoAim: true,
  // mobile controls
  mScheme: "stick", mOpacity: 0.85, mScale: 1.0, mHanded: "right",
  mLayout: {},        // { stick:{x,y}, jump:{x,y}, shoot:{x,y}, sprint:{x,y} } in px from bottom-left
};

export const S = load();

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  return { ...DEFAULTS, ...s, mLayout: { ...(s.mLayout || {}) } };
}
export function saveS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
export function resetS() { Object.assign(S, JSON.parse(JSON.stringify(DEFAULTS))); saveS(); }

// ───────────────────────── panel UI ─────────────────────────
let panel = null, onChangeCb = null, onEditLayoutCb = null, editing = false;

export function mountSettings({ onChange, onEditLayout, isTouch }) {
  onChangeCb = onChange; onEditLayoutCb = onEditLayout;
  buildPanel(!!isTouch);
}
export function openSettings() { if (panel) { panel.classList.add("show"); document.exitPointerLock?.(); } }
export function closeSettings() { if (panel) { panel.classList.remove("show"); if (editing) toggleEdit(false); } }
export function isSettingsOpen() { return panel && panel.classList.contains("show"); }

const fire = () => { saveS(); onChangeCb && onChangeCb(); };

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

function slider(label, key, min, max, step, fmt) {
  const row = el("div", "set-row");
  const top = el("div", "set-rowtop");
  top.appendChild(el("span", "set-label", label));
  const val = el("span", "set-val", fmt ? fmt(S[key]) : S[key]);
  top.appendChild(val); row.appendChild(top);
  const inp = el("input", "set-range"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = S[key];
  inp.addEventListener("input", () => { S[key] = parseFloat(inp.value); val.textContent = fmt ? fmt(S[key]) : S[key]; fire(); });
  row.appendChild(inp); return row;
}
function toggle(label, key) {
  const row = el("div", "set-row set-rowflat");
  row.appendChild(el("span", "set-label", label));
  const btn = el("button", "set-toggle" + (S[key] ? " on" : ""), S[key] ? "ON" : "OFF");
  btn.addEventListener("click", () => { S[key] = !S[key]; btn.classList.toggle("on", S[key]); btn.textContent = S[key] ? "ON" : "OFF"; fire(); });
  row.appendChild(btn); return row;
}
function choice(label, key, opts) {
  const row = el("div", "set-row set-rowflat");
  row.appendChild(el("span", "set-label", label));
  const wrap = el("div", "set-choice");
  opts.forEach(([v, txt]) => {
    const b = el("button", "set-chip" + (S[key] === v ? " on" : ""), txt);
    b.addEventListener("click", () => { S[key] = v; wrap.querySelectorAll(".set-chip").forEach((x) => x.classList.remove("on")); b.classList.add("on"); fire(); });
    wrap.appendChild(b);
  });
  row.appendChild(wrap); return row;
}

function buildPanel(isTouch) {
  panel = el("div", "set-panel");
  const card = el("div", "set-card");
  card.appendChild(el("h2", "set-title", "SETTINGS"));

  // tabs
  const tabs = el("div", "set-tabs");
  const body = el("div", "set-body");
  const sections = {};
  const TABDEFS = [["audio", "Audio"], ["video", "Video"], ["game", "Gameplay"]];
  if (isTouch) TABDEFS.push(["mobile", "Touch"]);
  TABDEFS.forEach(([id, name], i) => {
    const t = el("button", "set-tab" + (i === 0 ? " on" : ""), name);
    const sec = el("div", "set-sec" + (i === 0 ? " on" : "")); sections[id] = sec;
    t.addEventListener("click", () => {
      tabs.querySelectorAll(".set-tab").forEach((x) => x.classList.remove("on")); t.classList.add("on");
      body.querySelectorAll(".set-sec").forEach((x) => x.classList.remove("on")); sec.classList.add("on");
    });
    tabs.appendChild(t); body.appendChild(sec);
  });

  // audio
  sections.audio.appendChild(slider("Master volume", "masterVol", 0, 1, 0.01, (v) => Math.round(v * 100) + "%"));
  sections.audio.appendChild(toggle("Music", "music"));
  sections.audio.appendChild(toggle("Sound effects", "sfx"));
  // video
  sections.video.appendChild(slider("Brightness", "brightness", 0.5, 1.8, 0.01, (v) => v.toFixed(2)));
  sections.video.appendChild(slider("Bloom glow", "bloom", 0, 2, 0.05, (v) => v.toFixed(2)));
  sections.video.appendChild(choice("Quality", "quality", [["low", "Low"], ["med", "Medium"], ["high", "High"]]));
  sections.video.appendChild(toggle("Vignette", "vignette"));
  // gameplay
  sections.game.appendChild(slider("Move speed", "moveSpeed", 0.6, 1.6, 0.05, (v) => v.toFixed(2) + "×"));
  sections.game.appendChild(slider("Look sensitivity", "sensitivity", 0.4, 2.2, 0.05, (v) => v.toFixed(2) + "×"));
  sections.game.appendChild(slider("Field of view", "fov", 60, 100, 1, (v) => Math.round(v) + "°"));
  sections.game.appendChild(toggle("Invert vertical look", "invertY"));
  sections.game.appendChild(toggle("View bob", "viewBob"));
  sections.game.appendChild(toggle("Aim assist (arena auto-target)", "autoAim"));
  // mobile
  if (isTouch) {
    sections.mobile.appendChild(choice("Move control", "mScheme", [["stick", "Joystick"], ["dpad", "D-Pad"]]));
    sections.mobile.appendChild(choice("Handed", "mHanded", [["left", "Left"], ["right", "Right"]]));
    sections.mobile.appendChild(slider("Button opacity", "mOpacity", 0.2, 1, 0.05, (v) => Math.round(v * 100) + "%"));
    sections.mobile.appendChild(slider("Button size", "mScale", 0.7, 1.5, 0.05, (v) => v.toFixed(2) + "×"));
    const editRow = el("div", "set-row set-rowflat");
    editRow.appendChild(el("span", "set-label", "Reposition buttons"));
    const eb = el("button", "set-toggle", "EDIT");
    eb.addEventListener("click", () => toggleEdit(!editing, eb));
    editRow.appendChild(eb); sections.mobile.appendChild(editRow);
    sections.mobile.appendChild(el("p", "set-hint", "Tap EDIT, then drag any on-screen button to move it. Tap DONE to save."));
  }

  card.appendChild(tabs); card.appendChild(body);

  // footer
  const foot = el("div", "set-foot");
  const reset = el("button", "set-btn ghost", "Reset defaults");
  reset.addEventListener("click", () => { resetS(); closeSettings(); rebuild(isTouch); onChangeCb && onChangeCb(); });
  const done = el("button", "set-btn", "DONE");
  done.addEventListener("click", () => closeSettings());
  foot.appendChild(reset); foot.appendChild(done);
  card.appendChild(foot);

  panel.appendChild(card);
  panel.addEventListener("click", (e) => { if (e.target === panel) closeSettings(); });
  document.body.appendChild(panel);
}

function rebuild(isTouch) { if (panel) panel.remove(); buildPanel(isTouch); }

let floatDone = null;
function toggleEdit(on, btn) {
  editing = on;
  if (btn) { btn.textContent = on ? "DONE" : "EDIT"; btn.classList.toggle("on", on); }
  document.body.classList.toggle("layout-edit", on);
  onEditLayoutCb && onEditLayoutCb(on);
  if (on) {
    panel.classList.remove("show");              // hide panel so the buttons are reachable
    floatDone = el("button", "set-btn float-done", "DONE ✓");
    floatDone.addEventListener("click", () => toggleEdit(false, btn));
    document.body.appendChild(floatDone);
  } else if (floatDone) { floatDone.remove(); floatDone = null; }
}
