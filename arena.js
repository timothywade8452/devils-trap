// Devil's Trap — ARENA combat mode.
// A self-contained boss-fight controller. The engine owns player movement (the arena is a big
// open tile floor, so the normal physics/collision just work); this module owns everything else:
// rotating, repositioning, shooting bosses far across the field, ground drones that swarm you,
// the colour-bubble projectiles you fire back, particle bursts, and floating boss health bars.
//
// createArena(deps) -> {
//   spawn(cx, cz)                         // (re)build all entities around the arena centre
//   update(dt, playerPos, camera, live)   // step everything; -> {playerDamage, bossesLeft, win, changed}
//   playerShoot(origin, dirVec3)          // fire a bubble
//   bossCount()                           // bosses still alive
//   info()                                // counts, for the headless smoke test
// }

export function createArena({ THREE, scene, MAT, audio, bounds }) {
  const g = new THREE.Group(); scene.add(g);

  // shared geometry/materials (cheap, reused)
  const SPH = new THREE.SphereGeometry(1, 16, 16);
  const bubbleMat = (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
  const PLAYER_COLORS = [0x5cffd0, 0x7ce0ff, 0xb98cff]; // cycling bubble colours
  const ENEMY_COLOR = 0xff5a3c, BOSS_COLOR = [0xff3b2e, 0xff9a3c, 0xc35cff];

  const bosses = [], drones = [], pProj = [], eProj = [], parts = [];
  let centerX = 0, centerZ = 0, droneTimer = 0, colorIx = 0, prevBosses = -1;

  const HALF = () => (bounds.maxX - bounds.minX) / 2;
  const clampX = (x) => Math.max(bounds.minX + 1.5, Math.min(bounds.maxX - 1.5, x));
  const clampZ = (z) => Math.max(bounds.minZ + 1.5, Math.min(bounds.maxZ - 1.5, z));

  function clearGroup() {
    for (let i = g.children.length - 1; i >= 0; i--) g.remove(g.children[i]);
    bosses.length = drones.length = pProj.length = eProj.length = parts.length = 0;
  }

  // ── floating health bar (billboarded) ──
  function makeHealthBar() {
    const grp = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), new THREE.MeshBasicMaterial({ color: 0x110000, transparent: true, opacity: 0.7, depthTest: false }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), new THREE.MeshBasicMaterial({ color: 0xff3b2e, depthTest: false }));
    fg.position.z = 0.01; bg.renderOrder = 998; fg.renderOrder = 999;
    grp.add(bg); grp.add(fg); grp.userData.fg = fg; return grp;
  }
  function setBar(grp, frac) {
    const fg = grp.userData.fg; fg.scale.x = Math.max(0.001, frac);
    fg.position.x = -3 * (1 - frac);
    fg.material.color.setHex(frac > 0.5 ? 0x45e07a : frac > 0.25 ? 0xff9a3c : 0xff3b2e);
  }

  // ── spawn ──
  function spawn(cx, cz) {
    if (!g.parent) scene.add(g);
    clearGroup();
    centerX = cx; centerZ = cz; droneTimer = 1.5; prevBosses = -1;
    const orbit = Math.min(HALF() - 12, 58);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const grp = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 0), new THREE.MeshStandardMaterial({ color: 0x120008, emissive: BOSS_COLOR[i], emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.6 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.5, 10, 28), new THREE.MeshStandardMaterial({ color: 0x111319, metalness: 0.9, roughness: 0.25, emissive: BOSS_COLOR[i], emissiveIntensity: 0.25 }));
      ring.rotation.x = Math.PI / 2.4;
      const light = new THREE.PointLight(BOSS_COLOR[i], 1.2, 60, 2);
      const bar = makeHealthBar(); bar.position.y = 6;
      grp.add(core); grp.add(ring); grp.add(light); grp.add(bar); g.add(grp);
      bosses.push({
        grp, core, ring, bar, light, color: BOSS_COLOR[i],
        hp: 220, max: 220, ang, orbit, height: 9 + i * 3, spin: 0.6 + i * 0.25, orbitSpd: 0.18 + i * 0.05,
        repo: 3 + i, fireT: 1.5 + i * 0.6, tgt: { ang, orbit, height: 9 + i * 3 },
      });
    }
    for (let i = 0; i < 4; i++) spawnDrone();
  }

  function spawnDrone() {
    const ang = Math.random() * Math.PI * 2, rad = 30 + Math.random() * 14;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x1a0a08, emissive: ENEMY_COLOR, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0.5 }));
    m.position.set(clampX(centerX + Math.cos(ang) * rad), 2.4, clampZ(centerZ + Math.sin(ang) * rad));
    g.add(m);
    drones.push({ m, hp: 28, max: 28, fireT: 1 + Math.random() * 2, bob: Math.random() * 6 });
  }

  // ── projectiles ──
  function playerShoot(origin, dir) {
    if (pProj.length > 40) return;
    const col = PLAYER_COLORS[colorIx++ % PLAYER_COLORS.length];
    const m = new THREE.Mesh(SPH, bubbleMat(col)); m.scale.setScalar(0.55);
    m.position.copy(origin); g.add(m);
    const halo = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.2); m.add(halo);
    pProj.push({ m, vel: dir.clone().normalize().multiplyScalar(78), life: 2.6, dmg: 18, col });
  }
  function enemyShoot(from, targetPos, speed, dmg, col) {
    if (eProj.length > 70) return;
    const dir = targetPos.clone().sub(from).normalize();
    const m = new THREE.Mesh(SPH, bubbleMat(col)); m.scale.setScalar(0.7);
    m.position.copy(from); g.add(m);
    eProj.push({ m, vel: dir.multiplyScalar(speed), life: 5, dmg });
  }

  function burst(pos, col, n) {
    for (let i = 0; i < n && parts.length < 60; i++) {
      const m = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
      m.scale.setScalar(0.3 + Math.random() * 0.4); m.position.copy(pos); g.add(m);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * 2;
      parts.push({ m, vel: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 6), e * 5, Math.sin(a) * (4 + Math.random() * 6)), life: 0.6 });
    }
  }

  function bossCount() { return bosses.length; }
  function info() { return { bosses: bosses.length, drones: drones.length, playerProjectiles: pProj.length, enemyProjectiles: eProj.length }; }

  const tmp = new THREE.Vector3();

  function update(dt, playerPos, camera, live) {
    let playerDamage = 0;

    // ── bosses ──
    for (let i = bosses.length - 1; i >= 0; i--) {
      const b = bosses[i];
      b.core.rotation.y += dt * b.spin; b.core.rotation.x += dt * b.spin * 0.5;
      b.ring.rotation.z += dt * b.spin * 1.4;
      // orbit + drift toward reposition target
      if (live) {
        b.repo -= dt;
        if (b.repo <= 0) { b.repo = 3 + Math.random() * 4; b.tgt = { ang: Math.random() * Math.PI * 2, orbit: Math.min(HALF() - 12, 40 + Math.random() * 22), height: 8 + Math.random() * 9 }; }
        b.ang += dt * b.orbitSpd;
        b.orbit += (b.tgt.orbit - b.orbit) * Math.min(1, dt * 0.6);
        b.height += (b.tgt.height - b.height) * Math.min(1, dt * 0.6);
      }
      b.grp.position.set(centerX + Math.cos(b.ang) * b.orbit, b.height, centerZ + Math.sin(b.ang) * b.orbit);
      // health bar faces camera
      b.bar.quaternion.copy(camera.quaternion); setBar(b.bar, b.hp / b.max);
      b.core.material.emissiveIntensity = 1.2 + 0.5 * Math.sin(performance.now() * 0.004 + i);
      // fire a fan of shots at the player
      if (live) {
        b.fireT -= dt;
        if (b.fireT <= 0) {
          b.fireT = 1.6 + Math.random() * 1.2;
          const base = b.grp.position;
          for (let k = -2; k <= 2; k++) {
            const aim = playerPos.clone(); aim.y = 1.4;
            const dir = aim.sub(base).normalize();
            // rotate spread around Y
            const c = Math.cos(k * 0.12), s = Math.sin(k * 0.12);
            const rd = new THREE.Vector3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);
            enemyShoot(base.clone(), base.clone().add(rd.multiplyScalar(20)), 30, 10, b.color);
          }
          audio.sfx("shoot");
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
      if (live && dist > 8) { tmp.normalize(); d.m.position.x = clampX(d.m.position.x + tmp.x * dt * 9); d.m.position.z = clampZ(d.m.position.z + tmp.z * dt * 9); }
      d.m.position.y = 2.4 + Math.sin(d.bob) * 0.4; d.m.rotation.y += dt * 2;
      if (live) { d.fireT -= dt; if (d.fireT <= 0) { d.fireT = 1.6 + Math.random() * 1.8; enemyShoot(d.m.position.clone(), playerPos.clone().setY(1.4), 26, 6, ENEMY_COLOR); } }
    }

    // ── player projectiles ──
    for (let i = pProj.length - 1; i >= 0; i--) {
      const p = pProj[i]; p.m.position.addScaledVector(p.vel, dt); p.life -= dt;
      let hit = false;
      for (let j = bosses.length - 1; j >= 0; j--) {
        const b = bosses[j]; if (p.m.position.distanceTo(b.grp.position) < 5) {
          b.hp -= p.dmg; burst(p.m.position, p.col, 6); audio.sfx("hit"); hit = true;
          if (b.hp <= 0) { burst(b.grp.position, b.color, 22); audio.sfx("boom"); g.remove(b.grp); bosses.splice(j, 1); }
          break;
        }
      }
      if (!hit) for (let j = drones.length - 1; j >= 0; j--) {
        const d = drones[j]; if (p.m.position.distanceTo(d.m.position) < 2) {
          d.hp -= p.dmg; burst(p.m.position, p.col, 5); audio.sfx("hit"); hit = true;
          if (d.hp <= 0) { burst(d.m.position, ENEMY_COLOR, 12); audio.sfx("boom"); g.remove(d.m); drones.splice(j, 1); }
          break;
        }
      }
      const q = p.m.position;
      if (hit || p.life <= 0 || q.x < bounds.minX || q.x > bounds.maxX || q.z < bounds.minZ || q.z > bounds.maxZ) { g.remove(p.m); pProj.splice(i, 1); }
    }

    // ── enemy projectiles ──
    for (let i = eProj.length - 1; i >= 0; i--) {
      const p = eProj[i]; p.m.position.addScaledVector(p.vel, dt); p.life -= dt;
      p.m.rotation.y += dt * 3;
      const dx = p.m.position.x - playerPos.x, dy = p.m.position.y - (playerPos.y + 1.4), dz = p.m.position.z - playerPos.z;
      if (live && dx * dx + dy * dy + dz * dz < 2.6) { playerDamage += p.dmg; burst(p.m.position, 0xff5a3c, 5); g.remove(p.m); eProj.splice(i, 1); continue; }
      const q = p.m.position;
      if (p.life <= 0 || q.x < bounds.minX || q.x > bounds.maxX || q.z < bounds.minZ || q.z > bounds.maxZ) { g.remove(p.m); eProj.splice(i, 1); }
    }

    // safety sweep — any boss/drone brought to <=0 (e.g. overlapping hits) is cleaned up here
    for (let j = bosses.length - 1; j >= 0; j--) if (bosses[j].hp <= 0) { burst(bosses[j].grp.position, bosses[j].color, 22); audio.sfx("boom"); g.remove(bosses[j].grp); bosses.splice(j, 1); }
    for (let j = drones.length - 1; j >= 0; j--) if (drones[j].hp <= 0) { g.remove(drones[j].m); drones.splice(j, 1); }

    // ── particles ──
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; p.m.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(0.9);
      p.m.material.opacity = Math.max(0, p.life / 0.6); p.m.scale.multiplyScalar(1 + dt * 2);
      if (p.life <= 0) { g.remove(p.m); parts.splice(i, 1); }
    }

    const bossesLeft = bosses.length;
    const changed = bossesLeft !== prevBosses; prevBosses = bossesLeft;
    return { playerDamage, bossesLeft, win: bossesLeft === 0, changed };
  }

  function damageAll(n) { for (const b of bosses) b.hp -= n; }   // test hook for the win pipeline
  return { spawn, update, playerShoot, bossCount, info, damageAll };
}
