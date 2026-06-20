// Devil's Trap — leaderboard configuration.
//
// mode "firebase" → GLOBAL board (default). Uses the same public Firebase Realtime DB as the other
//                   Devil's games, under its own `trap_scores` path. Each player is written to their
//                   OWN key (atomic per-row PUT), so concurrent saves never clobber each other and
//                   nobody is ever lost. Firebase sends CORS headers and text/plain writes skip the
//                   preflight, so it works straight from the browser on GitHub Pages.
// mode "local"    → per-device only (localStorage), zero setup. Offline fallback is automatic.
// mode "supabase" → alternative global backend (see git history / leaderboard.js for the adapter).

export const CONFIG = {
  mode: "firebase",                                // "firebase" | "local" | "supabase"
  firebase: { url: "https://devils-lie-default-rtdb.firebaseio.com", path: "trap_scores" },
  supabase: { url: "", anon: "", table: "scores" },
};

// ── points system ──
export const SCORE = {
  levelBase: 50,        // points for clearing a maze floor
  levelStep: 10,        // + this × floor index (later floors worth more)
  bossKill: 250,        // per boss destroyed in the arena
  arenaWin: 1000,       // clearing the arena (all bosses)
  fullVictory: 2000,    // clearing all 30 floors
};
export function levelPoints(i) { return SCORE.levelBase + SCORE.levelStep * i; }
export function isGlobal() {
  return CONFIG.mode === "firebase" || (CONFIG.mode === "supabase" && !!CONFIG.supabase.url && !!CONFIG.supabase.anon);
}
