# Devil's Trap → Steam: launch & packaging roadmap

A research-grounded plan to take Devil's Trap (vanilla JS + Three.js, currently on GitHub Pages) to
Steam and make it go viral. Distilled from market + player-psyche + Steam-launch research. This is the
roadmap — the game itself (30-floor maze + 50-level arena campaign + endless Grind) is built and verified.

---

## Why this can work (the market read)

Devil's Trap straddles the two most clip-proven viral templates:

- **The skill arena boss-rush** — ULTRAKILL (multi-million sales), Risk of Rain 2 (1M in month one),
  Devil Daggers (the purest "memorize-then-beat, every death is my fault" loop). Our arena campaign is this.
- **The cheap clippable rage game** — Buckshot Roulette (~3–4M copies at $2.99, almost all via TikTok/Twitch),
  POST VOID (1–2M owners on ~122 peak players), Only Up! (~280k Twitch viewers on ~11k players). Our maze is this.

**Invisible traps are the single most clip-proven rage device in gaming** (I Wanna Be The Guy lineage). We
already have it. The job is to make it *loud and shareable*, price it cheap, and front-load the launch.

---

## Part 1 — Technical: ship it as a real Steam app

### The 3 blockers to fix (all small)
1. **Vendor Three.js locally.** `play.html` loads `three@0.160.0` from a CDN importmap — a Steam app must
   run offline, or first launch with no internet = blank screen = instant refund. Download `build/` +
   the `examples/jsm/` addons (UnrealBloom, PMREM, EffectComposer, RenderPass, OutputPass) into
   `game/vendor/three/` and repoint the importmap. **Pin the exact 0.160.0 you tested.**
2. **Add gamepad support.** There's none today (mouse/WASD/touch only). Add a Gamepad-API poll loop in
   `engine.js` (left stick = move, right stick = look, A = jump, trigger = fire, bumper = sonar/dash) +
   a Steam Input `game_actions_<AppID>.vdf` with glyphs. Required for **Steam Deck Verified**.
3. **Unblock menu audio.** Our `AudioContext` is gesture-gated (correct for browsers). In Electron add
   `app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required')` (keep the `ctx.resume()` fallback).

### Wrapper: **Electron 34** (decision is not close)
Tauri's per-machine WebView breaks our two non-negotiables — **pointer-lock** (the whole desktop control
scheme) and **WebGL2 + UnrealBloom/PMREM** (renders ~5 FPS or not at all on some WebViews). NW.js is a
viable #2. Electron bundles Chromium so it renders identically on every buyer's machine; the ~120 MB
bundle is irrelevant for a viral game. Pin **Electron 34** (overlay regressed in 35) and use **Steam Input**
(not raw Gamepad API) for the Deck path.

### Pipeline (GitHub-Pages folder → live Steam branch)
1. Scaffold Electron around the static files (`main.js` → `loadFile('game/play.html')`; no bundler needed).
   Starter templates: `JamesMoulang/electron-vite-template` or `birbhouse-games/electron-steam-app-template`.
2. Vendor Three.js (blocker #1); verify it runs with networking disabled.
3. `npx electron-builder --win --x64` → installer + unpacked build.
4. Steamworks: register partner, clear tax/bank, **pay the $100 Steam Direct fee** (starts a ~30-day
   first-app clock — pay early), reserve AppID, download the SDK.
5. **SteamPipe** upload (`steamcmd +run_app_build app_build_<AppID>.vdf`) to a **beta branch** (no review
   needed — iterate freely). Ship the Windows build; let the Deck run it via **Proton** (native-Linux
   Electron crashes in the Steam runtime). Copy `steam_appid.txt` + `steam_api64.dll` into the build root
   (the #1 "why does it crash" gotcha).
6. Store page live as **Coming Soon ≥ 2 weeks** out; submit store presence for review (3–5 business days).

### Steamworks integration: use `steamworks.js` (NOT greenworks — it no longer compiles)
- **Achievements** at events `profile.js` already tracks: first floor, first boss, arena win, full 50-level
  campaign, a Brutal no-death clear, "died to every trap type," "1,000 deaths," endless wave milestones.
- **Leaderboards** — keep the Firebase board (spans web + Steam) *and* mirror best times to a native Steam
  Leaderboard (overlay + friends). **Drop the coin-pack payment links on Steam** (Valve forbids external-payment
  unlocks); Souls stay 100% earn-by-play, which we already designed.
- **Cloud saves** — Auto-Cloud (zero code): point Electron `userData` to a json file + path-sync in the partner site.
- Overlay needs `in-process-gpu` + `disable-direct-composition` + a repainting transparent canvas (Electron quirk).

---

## Part 2 — Launch & hype playbook (ordered by leverage)

1. **Open the Steam "Coming Soon" page 6–12 months out**, release date + precise top-5 tags
   (`First-Person, Difficult, Trap, Rage, Arena Shooter` — never lead with Indie/Action). Point our
   GitHub-Pages traffic + the Devil's series at it. The 2025 **Personal Calendar** algorithm amplifies
   interest in the final 30 days — concentrate marketing there.
2. **Target ~10,000 wishlists** at launch (≈7k is the Popular-Upcoming floor). Velocity > total — a page
   adding 500/day beats one that ground out 7k slowly. Wishlists' real job: the launch-day email blast that
   manufactures the day-1 sales spike the *revenue* algorithm rewards.
3. **Price $7.99–$9.99 + 10–15% launch discount.** Sub-$10 converts ~50% better; the impulse price is itself
   a growth mechanic. Never launch permanently free.
4. **Ship a free DEMO** (the first ~5–10 maze floors + World 1 of the arena). Put the trap "gotcha" inside the
   first 5 minutes. Demos are the meta — "a streamer can't play screenshots."
5. **Steam Next Fest, once, only after ~2k wishlists** (it's a multiplier, not a generator — 0.819 correlation
   with pre-fest momentum). Drop the demo quietly *before* the fest for bug-fixing, then a big demo *update* for it.
6. **Capsule art is the #1 asset** ($500–1k, must read at 120×45, one focal point — a red-lit corridor with one
   deceptive glowing exit, or a mid-fall "gotcha"). It doubles as every streamer's thumbnail; ship them the PSD.
7. **Trailer: Genre → Hook → Content**, brutal trap-kill in the first 5 seconds, muted-readable, ≤60s.
8. **Seed wide to micro/mid streamers** (Keymailer + Lurkit, one-line pitches). One hit triggers the cascade
   (Balatro = Northerlion's first stream). Our **generative WebAudio score is DMCA-safe** — a real edge: creators
   won't get struck and we won't get delisted like Only Up!.
9. **Front-load everything into the first 48 hours** (launch + Next Fest) — that's the window the algorithm trains on.
   Drive **reviews hard** day 1 (New & Trending is review-gated at ~70%).
10. Consider the **Content Warning stunt** (free-to-keep for 24h → $7.99) only if day-1 footage is genuinely
    clippable — ours is. High-risk/high-reward; the safe default is paid + free demo.

---

## Part 3 — Shareable-by-design features to build next (ranked)

The research's clearest gameplay asks, mapped to our codebase. None are built yet — this is the post-launch backlog:

1. **Daily-seed "today's run."** *The single best growth feature.* One shared seed everyone plays today →
   streamers get a daily talking point, viewers compare deaths. `gen.cjs` already builds mazes from a seed;
   wire a date-derived seed + a global daily leaderboard (we already have Firebase). Name the moment.
2. **Instant death-replay + one-button share.** Auto-capture the last ~10s before a death (the invisible-trap
   reveal) + a screenshot-ready death card. Removes the #1 barrier to a streamer posting. Must read muted.
3. **Aggression-heals (the ULTRAKILL move).** Make kills the primary heal so retreating loses and rushing wins —
   the genre's #1 praised mechanic and the best anti-turtle pressure. We have kill-drops; make them the spine.
4. **A style/score meter + no-hit "S-rank"** per arena level — the strongest "one more run" engine in the genre.
5. **Practice/sandbox room + harder "Encore" boss remixes** — the two most-begged-for features after endless (shipped).

### Already shipped that the research demanded
✅ Endless wave mode (Cyber-Grind) ✅ Leaderboards ✅ Telegraphed attacks (no cheap one-shots) ✅ Real dash
i-frames ✅ Instant restart (FIGHT AGAIN button) ✅ Troll narrator on death ✅ Smooth difficulty curve with rest
beats ✅ FOV slider + screen-shake toggle + quality settings ✅ Difficulty modes ✅ Bank-on-death meta (Souls economy).

---

*Sources: SteamDB/SteamCharts CCU data, Steamworks docs, Chris Zukowski / howtomarketagame, and Steam-review +
YouTube/Reddit comment mining across ULTRAKILL, Devil Daggers, Vampire Survivors, Buckshot Roulette, Risk of
Rain 2, Lethal Company, Content Warning, Getting Over It, and Doom Eternal.*
