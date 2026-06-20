// Devil's Trap — ARENA combat mode.
// A self-contained boss-fight controller. The engine owns player movement (the arena is a big
// open tile floor, so the normal physics/collision just work); this module owns everything else:
// three DISTINCT multi-part boss constructs that orbit, reposition, telegraph and unleash volleys,
// enrage at low HP, ground drones that swarm and telegraph, the colour-bubble projectiles you fire
// back, glowing tracer enemy fire with muzzle flashes, particle bursts and shockwaves, and floating
// segmented boss health bars.
//
// createArena(deps) -> {
//   spawn(cx, cz)                         // (re)build all entities around the arena centre
//   update(dt, playerPos, camera, live)   // step everything; -> {playerDamage, bossesLeft, win, changed}
//   playerShoot(origin, dirVec3)          // fire a bubble
//   bossCount()                           // bosses still alive
//   info()                                // counts, for the headless smoke test
//   damageAll(n)                          // test hook for the win pipeline
// }

export function createArena({ THREE, scene, MAT, audio, glowSprite, bounds }) {
  const g = new THREE.Group(); scene.add(g);

  // ── shared cheap geometry ──
  const SPH = new THREE.SphereGeometry(1, 16, 16);
  const SPH_LO = new THREE.SphereGeometry(1, 10, 8);

  const bubbleMat = (hex, op = 0.95) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending });
  const PLAYER_COLORS = [0x5cffd0, 0x7ce0ff, 0xb98cff]; // cycling bubble colours
  const ENEMY_COLOR = 0xff5a3c;
  // each boss is visually distinct: red icosahedral "Wrath", amber spiked "Inferno", violet plated "Void"
  const BOSS_COLOR = [0xff3b2e, 0xff9a3c, 0xc35cff];
  const ENRAGE_COLOR = [0xff1a4c, 0xffd23c, 0xff5cf0];

  const bosses = [], drones = [], pProj = [], eProj = [], parts = [];
  let centerX = 0, centerZ = 0, droneTimer = 0, colorIx = 0, prevBosses = -1;
  let lockObj = null, lockRing = null;   // auto-aim target lock + its on-target reticle

  const HALF = () => (bounds.maxX - bounds.minX) / 2;
  const clampX = (x) => Math.max(bounds.minX + 1.5, Math.min(bounds.maxX - 1.5, x));
  const clampZ = (z) => Math.max(bounds.minZ + 1.5, Math.min(bounds.maxZ - 1.5, z));

  function clearGroup() {
    for (let i = g.children.length - 1; i >= 0; i--) g.remove(g.children[i]);
    bosses.length = drones.length = pProj.length = eProj.length = parts.length = 0;
  }

  // ── a reusable additive glow sprite (halo) ──
  function halo(color, size, op = 0.8) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size); return s;
  }

  // ── floating, segmented, phase-coloured health bar (billboarded) ──
  const SEGMENTS = 12;
  function makeHealthBar() {
    const grp = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.8), new THREE.MeshBasicMaterial({ color: 0x0a0006, transparent: true, opacity: 0.78, depthTest: false }));
    bg.renderOrder = 997; grp.add(bg);
    const segs = [];
    const segW = 6 / SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(segW * 0.82, 0.56), new THREE.MeshBasicMaterial({ color: 0x45e07a, depthTest: false, transparent: true }));
      m.position.x = -3 + segW * (i + 0.5); m.position.z = 0.02; m.renderOrder = 999; grp.add(m); segs.push(m);
    }
    grp.userData.segs = segs; return grp;
  }
  function setBar(grp, frac, enraged) {
    const segs = grp.userData.segs;
    const lit = Math.ceil(frac * SEGMENTS);
    const col = enraged ? 0xff1a4c : frac > 0.5 ? 0x45e07a : frac > 0.25 ? 0xff9a3c : 0xff3b2e;
    for (let i = 0; i < segs.length; i++) {
      const on = i < lit;
      segs[i].material.color.setHex(on ? col : 0x220011);
      segs[i].material.opacity = on ? 1 : 0.35;
    }
  }

  // ── distinct boss model builders. Each returns {grp, core, coreMat, rings[], spikes[], plates[], glow, light} ──
  function buildBossModel(i) {
    const grp = new THREE.Group();
    const baseCol = BOSS_COLOR[i];
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x0c0006, emissive: baseCol, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.7 });
    const armorMat = () => new THREE.MeshStandardMaterial({ color: 0x0e1016, metalness: 0.95, roughness: 0.22, emissive: baseCol, emissiveIntensity: 0.28 });
    const rings = [], spikes = [], plates = [];
    let core;

    if (i === 0) {
      // ── WRATH — jagged crystal eye wrapped in two counter-rotating gyro rings + a lurking spike crown.
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), coreMat);
      grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.55, 12, 36), armorMat()); r1.rotation.x = Math.PI / 2.3; grp.add(r1); rings.push(r1);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.4, 12, 40), armorMat()); r2.rotation.x = Math.PI / 1.7; r2.rotation.y = 0.6; grp.add(r2); rings.push(r2);
      // spike crown orbiting the core
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), armorMat());
        const a = (k / 6) * Math.PI * 2; sp.position.set(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2);
        sp.lookAt(0, 0, 0); sp.rotateX(Math.PI / 2); grp.add(sp); spikes.push(sp);
      }
    } else if (i === 1) {
      // ── INFERNO — molten octahedral heart caged by a halo ring and a swarm of orbiting ember shards.
      core = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), coreMat);
      grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.7, 8, 32), armorMat()); r1.rotation.x = Math.PI / 2; grp.add(r1); rings.push(r1);
      // floating armor plates as a broken shell
      for (let k = 0; k < 5; k++) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.6), armorMat());
        const a = (k / 5) * Math.PI * 2; pl.position.set(Math.cos(a) * 4.6, (k - 2) * 0.7, Math.sin(a) * 4.6);
        pl.lookAt(0, pl.position.y, 0); grp.add(pl); plates.push(pl);
      }
      // ember shards
      for (let k = 0; k < 7; k++) {
        const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.7, 0), coreMat);
        const a = (k / 7) * Math.PI * 2; sh.position.set(Math.cos(a) * 6.6, Math.sin(a * 1.6) * 1.2, Math.sin(a) * 6.6);
        grp.add(sh); spikes.push(sh);
      }
    } else {
      // ── VOID — dodecahedral monolith sheathed in heavy floating armor plates and a slow outer ring.
      core = new THREE.Mesh(new THREE.DodecahedronGeometry(3.0, 0), coreMat);
      grp.add(core);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.6, 8, 40), armorMat()); r1.rotation.x = Math.PI / 2.1; grp.add(r1); rings.push(r1);
      for (let k = 0; k < 8; k++) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.5), armorMat());
        const a = (k / 8) * Math.PI * 2; pl.position.set(Math.cos(a) * 4.4, Math.sin(a * 2) * 1.4, Math.sin(a) * 4.4);
        pl.lookAt(0, pl.position.y, 0); grp.add(pl); plates.push(pl);
      }
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3.4, 4), armorMat());
        const a = (k / 4) * Math.PI * 2 + 0.4; sp.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2);
        sp.lookAt(0, 0, 0); sp.rotateX(Math.PI / 2); grp.add(sp); spikes.push(sp);
      }
    }

    const glow = halo(baseCol, 16, 0.5); grp.add(glow);
    const light = new THREE.PointLight(baseCol, 1.4, 70, 2); grp.add(light);
    const bar = makeHealthBar(); bar.position.y = 7; grp.add(bar);
    return { grp, core, coreMat, rings, spikes, plates, glow, light, bar };
  }

  // ── spawn ──
  function spawn(cx, cz) {
    if (!g.parent) scene.add(g);
    clearGroup();
    lockObj = null; lockRing = null;       // ring was a child of g, just cleared — rebuilt on next update
    centerX = cx; centerZ = cz; droneTimer = 1.5; prevBosses = -1;
    const orbit = Math.min(HALF() - 12, 58);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const mdl = buildBossModel(i);
      g.add(mdl.grp);
      bosses.push({
        ...mdl, color: BOSS_COLOR[i], enrageColor: ENRAGE_COLOR[i],
        hp: 220, max: 220, ang, orbit, height: 9 + i * 3,
        spin: 0.6 + i * 0.25, orbitSpd: 0.18 + i * 0.05,
        repo: 3 + i, fireT: 1.5 + i * 0.6,
        tgt: { ang, orbit, height: 9 + i * 3 },
        // telegraph / phase state
        wind: 0,            // >0 means winding up to fire
        windMax: 0.6 + i * 0.05,
        phase: 0,           // 0 normal, 1 enraged(<=50%), 2 frenzy(<=25%)
        flash: 0,           // hit-flash timer
        flicker: Math.random() * 6,
      });
    }
    for (let i = 0; i < 4; i++) spawnDrone();
  }

  function spawnDrone() {
    const ang = Math.random() * Math.PI * 2, rad = 30 + Math.random() * 14;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x1a0a08, emissive: ENEMY_COLOR, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0.55 }));
    grp.add(body);
    // little thruster fins
    const finMat = new THREE.MeshStandardMaterial({ color: 0x120606, metalness: 0.8, roughness: 0.3, emissive: ENEMY_COLOR, emissiveIntensity: 0.4 });
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), finMat);
      const a = (k / 3) * Math.PI * 2; fin.position.set(Math.cos(a) * 1.3, -0.4, Math.sin(a) * 1.3); grp.add(fin);
    }
    const gl = halo(ENEMY_COLOR, 5, 0.45); grp.add(gl);
    grp.position.set(clampX(centerX + Math.cos(ang) * rad), 2.4, clampZ(centerZ + Math.sin(ang) * rad));
    g.add(grp);
    drones.push({ m: grp, body, glow: gl, hp: 28, max: 28, fireT: 1 + Math.random() * 2, bob: Math.random() * 6, wind: 0, flash: 0 });
  }

  // ── projectiles ──
  function playerShoot(origin, dir) {
    if (pProj.length > 40) return;
    const col = PLAYER_COLORS[colorIx++ % PLAYER_COLORS.length];
    const m = new THREE.Mesh(SPH, bubbleMat(col)); m.scale.setScalar(0.55);
    m.position.copy(origin); g.add(m);
    const h = halo(col, 2.2, 0.6); m.add(h);
    pProj.push({ m, vel: dir.clone().normalize().multiplyScalar(115), life: 2.6, dmg: 18, col });
    muzzle(origin, col, 0.7);
  }

  // glowing tracer enemy shot: bright core + additive halo + faint trail
  function enemyShoot(from, dirVec, speed, dmg, col) {
    if (eProj.length > 70) return;
    const dir = dirVec.clone().normalize();
    const m = new THREE.Mesh(SPH_LO, bubbleMat(col, 1)); m.scale.setScalar(0.55);
    m.position.copy(from); g.add(m);
    const h = halo(col, 3.0, 0.85); m.add(h);
    eProj.push({ m, halo: h, vel: dir.multiplyScalar(speed), life: 5, dmg, col, trailT: 0 });
  }

  function muzzle(pos, col, scale) {
    const f = halo(col, 5 * scale, 0.9); f.position.copy(pos); g.add(f);
    parts.push({ m: f, vel: new THREE.Vector3(), life: 0.18, fade: 0.18, flash: true });
  }

  function burst(pos, col, n) {
    for (let i = 0; i < n && parts.length < 60; i++) {
      const m = new THREE.Mesh(SPH_LO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
      m.scale.setScalar(0.3 + Math.random() * 0.4); m.position.copy(pos); g.add(m);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * 2;
      parts.push({ m, vel: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 6), e * 5, Math.sin(a) * (4 + Math.random() * 6)), life: 0.6, fade: 0.6 });
    }
  }

  // an expanding additive ring sprite — used for phase-transition shockwaves & death
  function shockwave(pos, col) {
    if (parts.length >= 60) return;
    const s = halo(col, 4, 0.95); s.position.copy(pos); g.add(s);
    parts.push({ m: s, vel: new THREE.Vector3(), life: 0.5, fade: 0.5, grow: 70 });
  }

  function bossCount() { return bosses.length; }
  function info() { return { bosses: bosses.length, drones: drones.length, playerProjectiles: pProj.length, enemyProjectiles: eProj.length, lock: !!lockObj, bossHp: bosses.reduce((s, b) => s + Math.max(0, b.hp), 0) }; }

  // ── auto-aim target lock (mobile can't aim with a third thumb, so we lock the nearest threat) ──
  function ensureLockRing() {
    if (lockRing) return;
    lockRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthTest: false, side: THREE.DoubleSide }));
    lockRing.renderOrder = 996; lockRing.visible = false;
  }
  const objPos = (o) => (o.grp ? o.grp.position : o.m.position);
  const _v = new THREE.Vector3(), _camDir = new THREE.Vector3();
  function acquireTarget(camera, playerPos) {
    camera.getWorldDirection(_camDir); _camDir.y = 0; _camDir.normalize();
    let best = null, bestScore = Infinity;
    const consider = (obj, isBoss) => {
      _v.copy(objPos(obj)).sub(playerPos); const dist = _v.length(); if (dist < 0.01) return;
      _v.y = 0; _v.normalize();
      const front = Math.max(0, _v.dot(_camDir));               // 1 = dead ahead
      // bosses strongly preferred (they're the win condition + sit far away); proximity + facing still matter
      const score = dist * (isBoss ? 0.2 : 1) * (1.3 - 0.4 * front);
      if (score < bestScore) { bestScore = score; best = obj; }
    };
    for (const b of bosses) consider(b, true);
    for (const d of drones) consider(d, false);
    return best;
  }
  function nearestDroneWithin(playerPos, maxd) {
    let best = null, bd = maxd;
    for (const d of drones) { const dist = objPos(d).distanceTo(playerPos); if (dist < bd) { bd = dist; best = d; } }
    return best;
  }
  const _lockPrev = new THREE.Vector3(), _lockVel = new THREE.Vector3();
  let lockTracked = null;
  function updateLock(camera, playerPos, dt) {
    ensureLockRing(); if (!lockRing.parent) g.add(lockRing);
    // drop a dead lock; keep a live one (hysteresis) so the reticle doesn't jitter between enemies
    if (lockObj && !(bosses.includes(lockObj) || drones.includes(lockObj))) lockObj = null;
    // emergency override — a drone right in your face takes priority over chipping a far boss
    const threat = nearestDroneWithin(playerPos, 9);
    if (threat) lockObj = threat;
    else if (!lockObj) lockObj = acquireTarget(camera, playerPos);
    if (lockObj) {
      const isBoss = !!lockObj.grp, p = objPos(lockObj);
      // estimate target velocity (for projectile leading) from frame-to-frame motion
      if (lockObj === lockTracked && dt > 0) _lockVel.copy(p).sub(_lockPrev).multiplyScalar(1 / dt);
      else _lockVel.set(0, 0, 0);
      lockTracked = lockObj; _lockPrev.copy(p);
      lockRing.visible = true; lockRing.position.copy(p);
      const base = isBoss ? 7.5 : 2.6, pulse = base * (1 + 0.09 * Math.sin(performance.now() * 0.007));
      lockRing.scale.setScalar(pulse); lockRing.quaternion.copy(camera.quaternion);
      lockRing.material.color.setHex(isBoss ? 0xff6a6a : 0xffe04a);
    } else { lockRing.visible = false; lockTracked = null; }
  }
  function lockedPos() { if (!lockObj) return null; return objPos(lockObj).clone(); }
  // lead the target: where to aim so a bubble at `speed` from `eye` intersects the moving enemy
  function lockedAim(eye, speed) {
    if (!lockObj) return null;
    const p = objPos(lockObj).clone();
    const t = Math.min(1.2, p.distanceTo(eye) / Math.max(1, speed));   // travel time, capped
    return p.addScaledVector(_lockVel, t);
  }
  function hasLock() { return !!lockObj; }

  const tmp = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // recompute a boss's phase from HP; returns true if it just escalated
  function updatePhase(b) {
    const frac = b.hp / b.max;
    const want = frac <= 0.25 ? 2 : frac <= 0.5 ? 1 : 0;
    if (want > b.phase) {
      b.phase = want;
      // visible enrage: speed up, recolour, shockwave flash
      b.spin *= 1.5; b.orbitSpd *= 1.4; b.repo = Math.min(b.repo, 0.6);
      const ec = want === 2 ? 0xffffff : b.enrageColor;
      b.coreMat.emissive.setHex(b.enrageColor);
      b.light.color.setHex(b.enrageColor);
      b.glow.material.color.setHex(b.enrageColor);
      b.flash = Math.max(b.flash, 0.4);
      shockwave(b.grp.position, ec);
      audio.sfx("boom");
      return true;
    }
    return false;
  }

  function update(dt, playerPos, camera, live) {
    let playerDamage = 0;
    const now = performance.now() * 0.001;

    // ── bosses ──
    for (let i = bosses.length - 1; i >= 0; i--) {
      const b = bosses[i];
      const phaseMul = 1 + b.phase * 0.35;

      // animate parts: counter-rotate rings, spin spikes/plates, breathe core
      b.core.rotation.y += dt * b.spin; b.core.rotation.x += dt * b.spin * 0.5;
      for (let r = 0; r < b.rings.length; r++) { b.rings[r].rotation.z += dt * b.spin * (r % 2 ? -1.6 : 1.4); }
      const sp = now * (1.2 + b.phase * 0.5);
      for (let s = 0; s < b.spikes.length; s++) {
        b.spikes[s].position.applyAxisAngle(UP, dt * b.orbitSpd * 2 * phaseMul);
        b.spikes[s].rotation.y += dt * 2;
      }
      for (let p = 0; p < b.plates.length; p++) {
        b.plates[p].position.applyAxisAngle(UP, dt * b.orbitSpd * phaseMul);
        b.plates[p].position.y = Math.sin(sp + p) * 1.4;
      }
      b.glow.material.rotation += dt * 0.4;

      // orbit + drift toward reposition target
      if (live) {
        b.repo -= dt;
        if (b.repo <= 0) {
          b.repo = (3 + Math.random() * 4) / phaseMul;
          b.tgt = { ang: Math.random() * Math.PI * 2, orbit: Math.min(HALF() - 12, 40 + Math.random() * 22), height: 8 + Math.random() * 9 };
        }
        b.ang += dt * b.orbitSpd;
        b.orbit += (b.tgt.orbit - b.orbit) * Math.min(1, dt * 0.6);
        b.height += (b.tgt.height - b.height) * Math.min(1, dt * 0.6);
      }
      b.grp.position.set(centerX + Math.cos(b.ang) * b.orbit, b.height, centerZ + Math.sin(b.ang) * b.orbit);

      // health bar always faces camera
      b.bar.quaternion.copy(camera.quaternion); setBar(b.bar, Math.max(0, b.hp) / b.max, b.phase > 0);

      // emissive: idle breathe + hit-flash spike + wind-up brighten
      b.flash = Math.max(0, b.flash - dt);
      const breathe = 1.2 + 0.5 * Math.sin(now * 4 + b.flicker);
      const windGlow = b.wind > 0 ? (1 - b.wind / b.windMax) * 3.2 : 0; // brightens as it nears release
      b.coreMat.emissiveIntensity = breathe + b.flash * 5 + windGlow;
      const targetScale = 1 + (b.wind > 0 ? (1 - b.wind / b.windMax) * 0.35 : 0) + b.flash * 0.25;
      b.core.scale.setScalar(b.core.scale.x + (targetScale - b.core.scale.x) * Math.min(1, dt * 12));
      b.glow.material.opacity = 0.45 + windGlow * 0.12 + b.flash;
      b.light.intensity = 1.4 + windGlow * 0.6 + b.flash * 4;

      // phase escalation check
      updatePhase(b);

      // ── fire cycle: telegraph wind-up, then release a fan ──
      if (live) {
        if (b.wind > 0) {
          b.wind -= dt;
          if (b.wind <= 0) {
            b.wind = 0;
            const base = b.grp.position.clone();
            muzzle(base, b.color, 1.4);
            // denser fan when enraged; readable spread
            const count = 2 + b.phase;       // -count..count -> 5 / 7 / 9 shots
            const spread = 0.13;
            const speed = 30 + b.phase * 7;
            for (let k = -count; k <= count; k++) {
              const aim = playerPos.clone(); aim.y = 1.4;
              const dir = aim.sub(base).normalize();
              const c = Math.cos(k * spread), s = Math.sin(k * spread);
              const rd = new THREE.Vector3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);
              enemyShoot(base.clone(), rd, speed, 10, b.color);
            }
            audio.sfx("shoot");
            b.fireT = (1.6 + Math.random() * 1.2) / phaseMul;
          }
        } else {
          b.fireT -= dt;
          if (b.fireT <= 0) { b.wind = b.windMax; }   // begin the visible telegraph
        }
      }
    }

    // ── drones ──
    if (live) {
      droneTimer -= dt;
      if (droneTimer <= 0 && bosses.length && drones.length < 6) { droneTimer = 3; spawnDrone(); }
    }
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i]; d.bob += dt * 4;
      tmp.copy(playerPos).sub(d.m.position); tmp.y = 0; const dist = tmp.length();
      if (live) {
        tmp.normalize();
        // hover at a mid radius (~18): close in if far, back off if too near, otherwise strafe sideways
        let mvx = 0, mvz = 0;
        if (dist > 20) { mvx = tmp.x; mvz = tmp.z; }
        else if (dist < 15) { mvx = -tmp.x; mvz = -tmp.z; }
        else { mvx = -tmp.z; mvz = tmp.x; }   // perpendicular strafe
        d.m.position.x = clampX(d.m.position.x + mvx * dt * 8); d.m.position.z = clampZ(d.m.position.z + mvz * dt * 8);
      }
      d.m.position.y = 2.4 + Math.sin(d.bob) * 0.4; d.m.rotation.y += dt * 2;

      d.flash = Math.max(0, d.flash - dt);
      d.body.material.emissiveIntensity = 1.3 + d.flash * 5 + (d.wind > 0 ? 2.5 : 0);
      d.glow.material.opacity = 0.45 + (d.wind > 0 ? 0.5 : 0) + d.flash;

      if (live) {
        if (d.wind > 0) {
          d.wind -= dt;
          if (d.wind <= 0) {
            d.wind = 0;
            const from = d.m.position.clone();
            muzzle(from, ENEMY_COLOR, 0.8);
            enemyShoot(from, playerPos.clone().setY(1.4).sub(from), 26, 6, ENEMY_COLOR);
            audio.sfx("shoot");
            d.fireT = 1.6 + Math.random() * 1.8;
          }
        } else {
          d.fireT -= dt;
          if (d.fireT <= 0) d.wind = 0.4;   // short telegraph before a drone shot
        }
      }
    }

    // ── player projectiles ──
    for (let i = pProj.length - 1; i >= 0; i--) {
      const p = pProj[i]; p.m.position.addScaledVector(p.vel, dt); p.life -= dt;
      let hit = false;
      for (let j = bosses.length - 1; j >= 0; j--) {
        const b = bosses[j]; if (p.m.position.distanceTo(b.grp.position) < 6.5) {
          b.hp -= p.dmg; b.flash = Math.max(b.flash, 0.22);   // flinch/flash
          // small knock-back along incoming direction
          b.ang += (p.vel.x >= 0 ? 1 : -1) * 0.01;
          burst(p.m.position, p.col, 6); audio.sfx("hit"); hit = true;
          if (b.hp <= 0) { killBoss(j); }
          break;
        }
      }
      if (!hit) for (let j = drones.length - 1; j >= 0; j--) {
        const d = drones[j]; if (p.m.position.distanceTo(d.m.position) < 2) {
          d.hp -= p.dmg; d.flash = Math.max(d.flash, 0.2); burst(p.m.position, p.col, 5); audio.sfx("hit"); hit = true;
          if (d.hp <= 0) { burst(d.m.position, ENEMY_COLOR, 12); shockwave(d.m.position, ENEMY_COLOR); audio.sfx("boom"); g.remove(d.m); drones.splice(j, 1); }
          break;
        }
      }
      const q = p.m.position;
      if (hit || p.life <= 0 || q.x < bounds.minX || q.x > bounds.maxX || q.z < bounds.minZ || q.z > bounds.maxZ) { g.remove(p.m); pProj.splice(i, 1); }
    }

    // ── enemy projectiles (glowing tracers) ──
    for (let i = eProj.length - 1; i >= 0; i--) {
      const p = eProj[i]; p.m.position.addScaledVector(p.vel, dt); p.life -= dt;
      p.m.rotation.y += dt * 3;
      // faint additive trail dots
      p.trailT -= dt;
      if (p.trailT <= 0 && parts.length < 60) {
        p.trailT = 0.05;
        const t = new THREE.Mesh(SPH_LO, bubbleMat(p.col, 0.7)); t.scale.setScalar(0.3); t.position.copy(p.m.position); g.add(t);
        parts.push({ m: t, vel: new THREE.Vector3(), life: 0.25, fade: 0.25 });
      }
      const dx = p.m.position.x - playerPos.x, dy = p.m.position.y - (playerPos.y + 1.4), dz = p.m.position.z - playerPos.z;
      if (live && dx * dx + dy * dy + dz * dz < 2.6) { playerDamage += p.dmg; burst(p.m.position, p.col, 5); audio.sfx("hurt"); g.remove(p.m); eProj.splice(i, 1); continue; }
      const q = p.m.position;
      if (p.life <= 0 || q.x < bounds.minX || q.x > bounds.maxX || q.z < bounds.minZ || q.z > bounds.maxZ) { g.remove(p.m); eProj.splice(i, 1); }
    }

    // safety sweep — any boss/drone brought to <=0 (e.g. overlapping hits) is cleaned up here
    for (let j = bosses.length - 1; j >= 0; j--) if (bosses[j].hp <= 0) killBoss(j);
    for (let j = drones.length - 1; j >= 0; j--) if (drones[j].hp <= 0) { g.remove(drones[j].m); drones.splice(j, 1); }

    // ── particles / sprites ──
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; p.m.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(0.9);
      const frac = Math.max(0, p.life / p.fade);
      if (p.grow) p.m.scale.setScalar(p.m.scale.x + dt * p.grow);
      else if (p.flash) p.m.scale.setScalar(p.m.scale.x * (1 + dt * 4));
      else p.m.scale.multiplyScalar(1 + dt * 2);
      p.m.material.opacity = (p.grow || p.flash ? 0.95 : 1) * frac;
      if (p.life <= 0) { g.remove(p.m); parts.splice(i, 1); }
    }

    // maintain the auto-aim lock + reticle (uses the freshly-moved enemy positions)
    updateLock(camera, playerPos, dt);

    const bossesLeft = bosses.length;
    const changed = bossesLeft !== prevBosses; prevBosses = bossesLeft;
    return { playerDamage, bossesLeft, win: bossesLeft === 0, changed };
  }

  function killBoss(j) {
    const b = bosses[j];
    burst(b.grp.position, b.color, 22);
    shockwave(b.grp.position, 0xffffff);
    shockwave(b.grp.position, b.color);
    audio.sfx("boom");
    g.remove(b.grp); bosses.splice(j, 1);
  }

  function damageAll(n) { for (const b of bosses) b.hp -= n; }   // test hook for the win pipeline
  return { spawn, update, playerShoot, bossCount, info, damageAll, lockedPos, lockedAim, hasLock };
}
