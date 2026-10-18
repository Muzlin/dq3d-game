/* ============================================================
   3D 特效系统 - 粒子、技能光效、伤害数字定位
   依赖：THREE
   ============================================================ */

const Effects = (() => {
  let scene = null;
  const active = [];       // 活动中的粒子系统
  const rings = [];        // 冲击波环

  function init(s) {
    scene = s;
  }

  // ---------- 通用粒子爆发 ----------
  function burst(opts) {
    const {
      position, count = 30, color = 0xff6644,
      size = 0.25, speed = 4, life = 0.8,
      gravity = -6, spread = 1, blending = THREE.AdditiveBlending
    } = opts;

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = position.x;
      pos[i * 3 + 1] = position.y;
      pos[i * 3 + 2] = position.z;

      // 球面随机方向
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      vel.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * sp * spread,
        Math.abs(Math.cos(phi)) * sp + speed * 0.3,
        Math.sin(phi) * Math.sin(theta) * sp * spread
      ));

      // 颜色微扰
      const c = baseColor.clone();
      c.offsetHSL((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending,
      depthWrite: false,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    active.push({
      points, geo, mat, vel, life: 0, maxLife: life, gravity
    });

    return points;
  }

  // ---------- 冲击波环 ----------
  function shockwave(position, color = 0xffffff, maxRadius = 2.5, life = 0.5) {
    const geo = new THREE.RingGeometry(0.1, 0.25, 32);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    rings.push({ ring, geo, mat, life: 0, maxLife: life, maxRadius });
  }

  // ---------- 4D 超立方体碎片（技能特效） ----------
  const hyperShards = [];
  function hyperBurst(at, color = 0x66aaff, count = 3, scale = 0.5) {
    for (let i = 0; i < count; i++) {
      const state = Hyper4D.createTesseract({
        size: scale * (0.7 + Math.random() * 0.6),
        color,
        color2: 0xffffff,
        opacity: 0.9,
        spinSpeed: 2 + Math.random() * 2,
        distance: 2.6
      });
      state.group.position.copy(at);
      state.group.position.x += (Math.random() - 0.5) * 1.2;
      state.group.position.y += (Math.random() - 0.5) * 1.0;
      state.group.position.z += (Math.random() - 0.5) * 1.2;
      state.life = 0;
      state.maxLife = 0.6 + Math.random() * 0.5;
      state.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        1 + Math.random() * 2.5,
        (Math.random() - 0.5) * 3
      );
      state.expand = 1.6 + Math.random();
      scene.add(state.group);
      hyperShards.push(state);
    }
  }

  // ---------- 技能：火焰斩 ----------
  function fireSlash(from, to) {
    // 火焰爆发
    burst({ position: to, count: 60, color: 0xff4400, size: 0.3, speed: 6, life: 1.0, gravity: 4 });
    burst({ position: to, count: 40, color: 0xffcc33, size: 0.22, speed: 8, life: 0.7, gravity: 2 });
    shockwave(to, 0xff6622, 3, 0.6);
    hyperBurst(to, 0xff6622, 3, 0.45);
  }

  // ---------- 技能：冰霜箭 ----------
  function iceBolt(from, to) {
    burst({ position: to, count: 50, color: 0x66ccff, size: 0.24, speed: 5, life: 0.9, gravity: -2 });
    burst({ position: to, count: 30, color: 0xffffff, size: 0.18, speed: 3, life: 0.6, gravity: -1 });
    shockwave(to, 0x88ddff, 2.2, 0.5);
    hyperBurst(to, 0x66ccff, 3, 0.4);
  }

  // ---------- 技能：剧毒 ----------
  function poisonCloud(to) {
    burst({ position: to, count: 45, color: 0x9b4dff, size: 0.4, speed: 2.5, life: 1.4, gravity: -0.5, spread: 1.4 });
    burst({ position: to, count: 25, color: 0x55ff88, size: 0.3, speed: 1.5, life: 1.8, gravity: -0.3 });
  }

  // ---------- 治疗 ----------
  function healBurst(at) {
    burst({ position: at, count: 40, color: 0x55ff9d, size: 0.28, speed: 2, life: 1.2, gravity: 3 });
    burst({ position: at, count: 20, color: 0xffffff, size: 0.16, speed: 1.2, life: 1.0, gravity: 2.5 });
    shockwave(at, 0x66ffaa, 2, 0.6);
  }

  // ---------- 普通命中 ----------
  function hitSpark(at, color = 0xffffff) {
    burst({ position: at, count: 25, color, size: 0.18, speed: 6, life: 0.5, gravity: -8 });
    shockwave(at, color, 1.6, 0.3);
  }

  // ---------- 暴击 ----------
  function critBurst(at) {
    burst({ position: at, count: 50, color: 0xffdd33, size: 0.3, speed: 9, life: 0.8, gravity: -6 });
    burst({ position: at, count: 30, color: 0xff8844, size: 0.22, speed: 6, life: 0.6, gravity: -4 });
    shockwave(at, 0xffcc33, 3.5, 0.45);
    hyperBurst(at, 0xffdd33, 5, 0.5);
  }

  // ---------- 升级 ----------
  function levelUpBurst(at) {
    burst({ position: at, count: 80, color: 0xffcc55, size: 0.32, speed: 5, life: 1.6, gravity: 2.5, spread: 1.5 });
    burst({ position: at, count: 40, color: 0xffffff, size: 0.2, speed: 3, life: 1.2, gravity: 2 });
    shockwave(at, 0xffdd66, 4, 0.9);
    setTimeout(() => shockwave(at, 0xffee88, 3, 0.9), 180);
    hyperBurst(at, 0xffcc55, 6, 0.6);
  }

  // ---------- 敌人死亡 ----------
  function deathBurst(at, color = 0xff4466) {
    burst({ position: at, count: 70, color, size: 0.35, speed: 7, life: 1.2, gravity: -7, spread: 1.3 });
    burst({ position: at, count: 35, color: 0x333333, size: 0.5, speed: 3, life: 1.5, gravity: -3, spread: 1.5 });
    shockwave(at, color, 4, 0.8);
    hyperBurst(at, color, 6, 0.55);
  }

  // ---------- 生成（召唤）特效 ----------
  function spawnPoof(at, color = 0x8888ff) {
    burst({ position: at, count: 40, color, size: 0.3, speed: 3, life: 0.9, gravity: 1 });
    shockwave(at, color, 2, 0.5);
  }

  // ---------- 每帧更新 ----------
  function update(dt) {
    // 粒子
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.life += dt;
      const t = p.life / p.maxLife;

      if (t >= 1) {
        scene.remove(p.points);
        p.geo.dispose();
        p.mat.dispose();
        active.splice(i, 1);
        continue;
      }

      const posAttr = p.geo.attributes.position;
      const arr = posAttr.array;
      for (let j = 0; j < p.vel.length; j++) {
        const v = p.vel[j];
        v.y += p.gravity * dt;
        arr[j * 3] += v.x * dt;
        arr[j * 3 + 1] += v.y * dt;
        arr[j * 3 + 2] += v.z * dt;
      }
      posAttr.needsUpdate = true;
      p.mat.opacity = 1 - t * t;
      p.mat.size = p.mat.size * (1 - dt * 0.4);
    }

    // 冲击波环
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        scene.remove(r.ring);
        r.geo.dispose();
        r.mat.dispose();
        rings.splice(i, 1);
        continue;
      }
      const s = 1 + t * r.maxRadius * 4;
      r.ring.scale.set(s, s, s);
      r.mat.opacity = 0.85 * (1 - t);
    }

    // 4D 超立方体碎片
    for (let i = hyperShards.length - 1; i >= 0; i--) {
      const h = hyperShards[i];
      h.life += dt;
      const t = h.life / h.maxLife;
      if (t >= 1) {
        Hyper4D.disposeTesseract(h);
        hyperShards.splice(i, 1);
        continue;
      }
      // 4D 自旋（加速） + 上抛 + 放大消散
      Hyper4D.updateTesseract(h, dt, 1 + t * 2);
      h.vel.y -= 6 * dt;
      h.group.position.x += h.vel.x * dt;
      h.group.position.y += h.vel.y * dt;
      h.group.position.z += h.vel.z * dt;
      const sc = 1 + t * h.expand;
      h.group.scale.setScalar(sc);
      h.mat.opacity = 0.9 * (1 - t * t);
      if (h.pointsMat) h.pointsMat.opacity = 0.9 * (1 - t * t);
      if (h.core) h.core.material.opacity = 0.5 * (1 - t);
    }
  }

  // ---------- 清空所有活动特效（用于关卡切换/重开） ----------
  function clearAll() {
    active.forEach(p => {
      scene.remove(p.points);
      p.geo.dispose();
      p.mat.dispose();
    });
    active.length = 0;

    rings.forEach(r => {
      scene.remove(r.ring);
      r.geo.dispose();
      r.mat.dispose();
    });
    rings.length = 0;

    hyperShards.forEach(h => {
      Hyper4D.disposeTesseract(h);
    });
    hyperShards.length = 0;
  }

  return {
    init, update,
    burst, shockwave,
    fireSlash, iceBolt, poisonCloud, healBurst,
    hitSpark, critBurst, levelUpBurst, deathBurst, spawnPoof,
    hyperBurst, clearAll
  };
})();
