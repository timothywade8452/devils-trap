// Devil's Trap — leaderboard configuration.
//
// mode "local"    → scores are stored in this browser (localStorage). Works with ZERO setup, but
//                   the board is per-device (each device sees the players who played on it).
// mode "supabase" → a real GLOBAL leaderboard shared across everyone, free, ~3 min to set up:
//                   1. Create a free project at supabase.com
//                   2. SQL editor → run:
//                        create table scores ( id text primary key, name text, cc text, country text,
//                          points int, deaths int, level int, "bossKills" int, plays int, updated bigint );
//                        alter table scores enable row level security;
//                        create policy "read"  on scores for select using (true);
//                        create policy "write" on scores for insert with check (true);
//                        create policy "upd"   on scores for update using (true);
//                   3. Settings → API → paste the Project URL + anon public key below, set mode:"supabase".
//                   (The anon key is safe to expose — the RLS policies above are what grant access.)

export const CONFIG = {
  mode: "local",                                  // "local" | "supabase"
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
export function isGlobal() { return CONFIG.mode === "supabase" && CONFIG.supabase.url && CONFIG.supabase.anon; }
