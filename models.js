/* ============================================================
   3D 角色模型 - 使用几何体拼装，不依赖外部模型文件
   依赖：THREE
   ============================================================ */

const Models = (() => {
  // ---------- 材质工厂 ----------
  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.6,
    metalness: opts.metalness ?? 0.2,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: opts.flat ?? false
  });

  // ---------- 确定性伪随机 ----------
  function vrand(seed) {
    let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function vrange(seed, min, max) {
    return min + vrand(seed) * (max - min);
  }
  // 从 HSL 生成颜色
  function vcolor(seed, hMin, hMax, sMin, sMax, lMin, lMax) {
    const h = vrange(seed, hMin, hMax) / 360;
    const s = vrange(seed + 11, sMin, sMax) / 100;
    const l = vrange(seed + 23, lMin, lMax) / 100;
    const c = new THREE.Color();
    c.setHSL(h, s, l);
    return c.getHex();
  }

  // ---------- 为每个关卡生成怪物变体参数 ----------
  // seed 基于关卡号，保证同一关怪物外观一致
  function makeVariant(type, seed) {
    const v = {
      scale: 1,
      bodyColor: null, accentColor: null, eyeColor: null,
      spikes: 0, aura: false, glow: 0
    };

    switch (type) {
      case 'slime':
        // 史莱姆：颜色范围广（绿→蓝→紫→金）
        v.bodyColor = vcolor(seed, 80, 300, 55, 85, 42, 62);
        v.eyeColor = vcolor(seed + 5, 0, 360, 60, 90, 45, 65);
        v.scale = vrange(seed + 7, 0.82, 1.18);
        v.glow = vrange(seed + 9, 0, 0.35);
        v.aura = vrand(seed + 13) > 0.72;
        break;

      case 'goblin':
        // 哥布林：绿/黄/红皮肤，体型差异明显
        v.bodyColor = vcolor(seed, 60, 150, 40, 70, 32, 52);
        v.eyeColor = vrand(seed + 3) > 0.5 ? 0xff2222 : (vcolor(seed + 4, 30, 60, 80, 100, 50, 65));
        v.scale = vrange(seed + 7, 0.9, 1.15);
        v.spikes = Math.floor(vrange(seed + 11, 0, 4));
        v.aura = vrand(seed + 13) > 0.8;
        break;

      case 'skeleton':
        // 骷髅：骨色/幽光色变化
        v.bodyColor = vcolor(seed, 40, 70, 8, 25, 72, 88);  // 骨白偏黄
        v.accentColor = vcolor(seed + 2, 180, 330, 60, 100, 50, 68);  // 幽光紫/青
        v.eyeColor = v.accentColor;
        v.scale = vrange(seed + 7, 0.92, 1.12);
        v.glow = vrange(seed + 9, 0.8, 1.8);
        v.aura = true;
        break;

      case 'dragon':
        // 龙：红/蓝/黑/金等鳞色
        v.bodyColor = vcolor(seed, 0, 360, 55, 85, 30, 50);
        v.accentColor = vcolor(seed + 3, 20, 60, 70, 95, 48, 62);  // 腹部
        v.eyeColor = vcolor(seed + 6, 30, 70, 85, 100, 50, 62);
        v.scale = vrange(seed + 7, 0.88, 1.2);
        v.spikes = Math.floor(vrange(seed + 11, 4, 9));  // 背刺数量
        v.glow = vrange(seed + 9, 0.4, 1.2);
        v.aura = vrand(seed + 13) > 0.6;
        break;

      case 'darklord':
        // 魔王：暗紫/暗红/暗蓝
        v.bodyColor = vcolor(seed, 240, 360, 45, 75, 12, 26);
        v.accentColor = vcolor(seed + 3, 260, 330, 70, 100, 45, 65);
        v.eyeColor = vcolor(seed + 6, 330, 360, 85, 100, 52, 65);
        v.scale = vrange(seed + 7, 0.95, 1.18);
        v.glow = vrange(seed + 9, 1.2, 2.2);
        v.aura = true;
        break;
    }
    return v;
  }

  // ---------- 给模型应用变体（缩放 / 特效）----------
  function applyVariant(group, variant) {
    if (!variant) return;
    if (variant.scale && variant.scale !== 1) {
      group.scale.setScalar(variant.scale);
    }
    // 光环（可选）
    if (variant.aura) {
      const ringColor = variant.accentColor || variant.eyeColor || 0xffffff;
      const aura = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.05, 28),
        new THREE.MeshBasicMaterial({
          color: ringColor, transparent: true, opacity: 0.28,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.04;
      aura.userData.spin = true;
      group.add(aura);
      group.userData.aura = aura;
    }
  }

  // ---------- 玩家：勇者 ----------
  function createHero() {
    const g = new THREE.Group();

    // 身体（躯干）
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 0.7, 6, 12),
      mat(0x3355cc, { roughness: 0.5, metalness: 0.3 })
    );
    torso.position.y = 1.15;
    g.add(torso);

    // 护甲胸甲
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.45, 0.55, 12),
      mat(0x8899bb, { metalness: 0.8, roughness: 0.25 })
    );
    chest.position.y = 1.25;
    g.add(chest);

    // 头
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 14),
      mat(0xffd9b3, { roughness: 0.7 })
    );
    head.position.y = 2.15;
    g.add(head);

    // 头盔
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      mat(0xaabbdd, { metalness: 0.85, roughness: 0.2 })
    );
    helm.position.y = 2.18;
    g.add(helm);
    // 头盔顶饰
    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.4, 8),
      mat(0xff4444, { emissive: 0x661111 })
    );
    crest.position.y = 2.62;
    g.add(crest);

    // 眼睛
    const eyeMat = mat(0x111133, { emissive: 0x2244aa, emissiveIntensity: 0.6 });
    [-0.14, 0.14].forEach(x => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
      eye.position.set(x, 2.18, 0.34);
      g.add(eye);
    });

    // 手臂
    const armMat = mat(0x4466dd, { roughness: 0.5, metalness: 0.3 });
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.6, 4, 8), armMat);
    armL.position.set(-0.62, 1.2, 0);
    armL.rotation.z = 0.22;
    g.add(armL);

    const armR = new THREE.Group();
    armR.position.set(0.62, 1.45, 0);
    const armRMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.6, 4, 8), armMat);
    armRMesh.position.y = -0.3;
    armR.add(armRMesh);
    // 手
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xffd9b3));
    hand.position.y = -0.65;
    armR.add(hand);
    g.add(armR);

    // 剑
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 1.25, 0.22),
      mat(0xddeeff, { metalness: 0.95, roughness: 0.1, emissive: 0x223355, emissiveIntensity: 0.4 })
    );
    blade.position.y = 0.75;
    sword.add(blade);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.3, 4),
      mat(0xffffff, { metalness: 1, roughness: 0.05 })
    );
    tip.position.y = 1.52;
    tip.rotation.y = Math.PI / 4;
    sword.add(tip);
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.09, 0.14),
      mat(0xffcc44, { metalness: 0.9, roughness: 0.25 })
    );
    guard.position.y = 0.1;
    sword.add(guard);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8),
      mat(0x553311, { roughness: 0.9 })
    );
    grip.position.y = -0.12;
    sword.add(grip);
    sword.position.set(0, -0.65, 0.1);
    sword.rotation.x = -0.25;
    armR.add(sword);

    // 腿
    const legMat = mat(0x2a2a44, { roughness: 0.7 });
    [-0.22, 0.22].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 8), legMat);
      leg.position.set(x, 0.42, 0);
      g.add(leg);
      // 靴子
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.22, 0.42),
        mat(0x443322, { roughness: 0.85 })
      );
      boot.position.set(x, 0.11, 0.05);
      g.add(boot);
    });

    // 披风
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 1.3, 6, 8),
      new THREE.MeshStandardMaterial({
        color: 0xdd3333, side: THREE.DoubleSide, roughness: 0.8
      })
    );
    cape.position.set(0, 1.15, -0.42);
    cape.rotation.x = 0.12;
    g.add(cape);

    // 光环（脚下）
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4488ff, transparent: true, opacity: 0.32,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.02;
    g.add(aura);

    // 保存可动部件引用
    g.userData = { armR, sword, cape, head, aura, type: 'hero' };
    return g;
  }

  // ---------- 敌人：史莱姆 ----------
  function createSlime(color = 0x44cc66, variant = null) {
    const g = new THREE.Group();
    const v = variant || {};
    const bodyColor = v.bodyColor != null ? v.bodyColor : color;
    const eyeColor = v.eyeColor != null ? v.eyeColor : 0x111111;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor, roughness: 0.25, metalness: 0.1,
      transparent: true, opacity: 0.88,
      emissive: v.glow ? bodyColor : 0x000000,
      emissiveIntensity: v.glow || 0
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16), bodyMat);
    body.scale.set(1, 0.78, 1);
    body.position.y = 0.68;
    g.add(body);

    // 顶部高光球
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    );
    shine.position.set(-0.3, 1.15, 0.35);
    g.add(shine);

    // 眼睛
    const eyeWhite = mat(0xffffff, { roughness: 0.3 });
    const pupil = mat(eyeColor, { emissive: eyeColor, emissiveIntensity: 0.4 });
    [-0.28, 0.28].forEach(x => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), eyeWhite);
      e.position.set(x, 0.82, 0.72);
      g.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pupil);
      p.position.set(x, 0.82, 0.85);
      g.add(p);
    });

    // 嘴
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.035, 6, 12, Math.PI),
      mat(0x224422)
    );
    mouth.position.set(0, 0.6, 0.8);
    mouth.rotation.z = Math.PI;
    g.add(mouth);

    g.userData = { body, type: 'slime', baseColor: bodyColor, bounce: 0 };
    applyVariant(g, v);
    return g;
  }

  // ---------- 敌人：哥布林 ----------
  function createGoblin(variant = null) {
    const g = new THREE.Group();
    const v = variant || {};
    const skinColor = v.bodyColor != null ? v.bodyColor : 0x66aa44;
    const eyeColor = v.eyeColor != null ? v.eyeColor : 0xff2222;
    const skin = mat(skinColor, { roughness: 0.65 });
    // 皮肤的暗色版本（用于四肢）
    const darkSkin = new THREE.Color(skinColor).offsetHSL(0, 0, -0.08).getHex();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 10), skin);
    torso.position.y = 1.0;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), skin);
    head.position.y = 1.72;
    head.scale.set(1, 0.92, 1.05);
    g.add(head);

    // 尖耳
    [-1, 1].forEach(s => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 6), skin);
      ear.position.set(s * 0.39, 1.78, 0);
      ear.rotation.z = s * -1.1;
      ear.rotation.x = -0.3;
      g.add(ear);
    });

    // 眼睛（发光，颜色可变）
    const eyeMat = mat(eyeColor, { emissive: eyeColor, emissiveIntensity: 1.2 + (v.glow || 0) });
    [-0.13, 0.13].forEach(x => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
      e.position.set(x, 1.78, 0.31);
      g.add(e);
    });

    // 头刺（变体特征）
    if (v.spikes) {
      for (let i = 0; i < v.spikes; i++) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.05, 0.2 + Math.random() * 0.1, 5),
          mat(darkSkin, { flat: true })
        );
        const px = (i - (v.spikes - 1) / 2) * 0.13;
        spike.position.set(px, 2.05, -0.05);
        spike.rotation.x = -0.5;
        g.add(spike);
      }
    }

    // 獠牙
    [-0.09, 0.09].forEach(x => {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 5), mat(0xffeecc));
      fang.position.set(x, 1.6, 0.32);
      g.add(fang);
    });

    // 手臂
    const armMat = mat(darkSkin);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), armMat);
    armL.position.set(-0.52, 1.0, 0); armL.rotation.z = 0.35;
    g.add(armL);
    const armR = new THREE.Group();
    armR.position.set(0.52, 1.25, 0);
    const armRM = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), armMat);
    armRM.position.y = -0.25;
    armR.add(armRM);
    g.add(armR);

    // 武器：木棒
    const club = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 8), mat(0x6b4a2a, { roughness: 0.9 }));
    club.add(stick);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), mat(0x7a5533, { roughness: 0.95, flat: true }));
    knot.position.y = 0.5;
    knot.scale.set(1, 1.15, 0.9);
    club.add(knot);
    // 尖刺
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), mat(0x9a7a5a, { flat: true }));
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.17, 0.5, Math.sin(a) * 0.17);
      spike.rotation.z = -Math.cos(a) * 1.2;
      spike.rotation.x = Math.sin(a) * 1.2;
      club.add(spike);
    }
    club.position.set(0, -0.5, 0.1);
    club.rotation.z = -0.3;
    armR.add(club);

    // 腿
    const legMat = mat(new THREE.Color(darkSkin).offsetHSL(0, 0, -0.05).getHex());
    [-0.18, 0.18].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 4, 8), legMat);
      leg.position.set(x, 0.38, 0);
      g.add(leg);
    });

    g.userData = { armR, club, head, type: 'goblin' };
    applyVariant(g, v);
    return g;
  }

  // ---------- 敌人：骷髅法师 ----------
  function createSkeleton(variant = null) {
    const g = new THREE.Group();
    const v = variant || {};
    const boneColor = v.bodyColor != null ? v.bodyColor : 0xe8e8d8;
    const glowColor = v.accentColor != null ? v.accentColor : 0xaa55ff;
    const glowInt = v.glow || 1.5;
    const bone = mat(boneColor, { roughness: 0.75 });

    // 骨架躯干
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8), bone);
    spine.position.y = 1.15;
    g.add(spine);

    // 肋骨
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(0.28 - i * 0.035, 0.045, 6, 12, Math.PI),
        bone
      );
      rib.position.set(0, 1.42 - i * 0.17, 0);
      rib.rotation.set(Math.PI / 2, 0, 0);
      rib.rotation.y = 0;
      g.add(rib);
    }

    // 盆骨
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.24), bone);
    pelvis.position.y = 0.72;
    g.add(pelvis);

    // 头骨
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 12), bone);
    skull.position.y = 1.85;
    skull.scale.set(1, 1.08, 1);
    g.add(skull);
    // 下颌
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.32), bone);
    jaw.position.y = 1.6;
    g.add(jaw);
    // 眼窝（发光，颜色可变）
    const socketMat = mat(0x220033, { emissive: glowColor, emissiveIntensity: glowInt });
    [-0.13, 0.13].forEach(x => {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), socketMat);
      socket.position.set(x, 1.87, 0.28);
      g.add(socket);
    });

    // 手臂
    const armMat = bone;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 4, 7), armMat);
    armL.position.set(-0.42, 1.25, 0); armL.rotation.z = 0.25;
    g.add(armL);
    const armR = new THREE.Group();
    armR.position.set(0.42, 1.5, 0);
    const armRM = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 4, 7), armMat);
    armRM.position.y = -0.25;
    armR.add(armRM);
    g.add(armR);

    // 法杖
    const staff = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 8), mat(0x3a2a1a, { roughness: 0.9 }));
    staff.add(shaft);
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 1),
      mat(glowColor, { emissive: new THREE.Color(glowColor).offsetHSL(0,0,-0.15).getHex(), emissiveIntensity: 1.4, roughness: 0.1 })
    );
    orb.position.y = 0.92;
    staff.add(orb);
    // 环
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.025, 6, 20),
      mat(new THREE.Color(glowColor).offsetHSL(0,0,0.15).getHex(), { emissive: glowColor, emissiveIntensity: 0.8, metalness: 0.7 })
    );
    ring.position.y = 0.92;
    ring.rotation.x = Math.PI / 2.4;
    staff.add(ring);
    // 点光源
    const light = new THREE.PointLight(glowColor, 1.6, 6);
    light.position.y = 0.92;
    staff.add(light);

    staff.position.set(0, -0.5, 0.05);
    armR.add(staff);

    // 腿
    const legMat = bone;
    [-0.14, 0.14].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.55, 4, 7), legMat);
      leg.position.set(x, 0.34, 0);
      g.add(leg);
    });

    // 幽光（脚下）
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.75, 24),
      new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    g.add(glow);

    g.userData = { armR, staff, orb, ring, head: skull, glow, light, type: 'skeleton' };
    applyVariant(g, v);
    return g;
  }

  // ---------- 敌人：恶龙 ----------
  function createDragon(variant = null) {
    const g = new THREE.Group();
    const v = variant || {};
    const scaleColor = v.bodyColor != null ? v.bodyColor : 0xcc2233;
    const bellyColor = v.accentColor != null ? v.accentColor : 0xffaa55;
    const eyeColor = v.eyeColor != null ? v.eyeColor : 0xffdd00;
    const spikeCount = v.spikes != null ? Math.max(3, v.spikes) : 6;
    const fireColor = v.glow ? new THREE.Color(scaleColor).offsetHSL(0, 0.1, 0.2).getHex() : 0xff5500;
    const scale = mat(scaleColor, { roughness: 0.45, metalness: 0.35 });
    const belly = mat(bellyColor, { roughness: 0.6 });
    const hornMat = mat(0xddddcc, { roughness: 0.4 });

    // 身体
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 1.3, 8, 16), scale);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.5;
    g.add(body);
    // 腹部
    const bellyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.0, 6, 12), belly);
    bellyMesh.rotation.z = Math.PI / 2;
    bellyMesh.position.set(0, 1.15, 0.45);
    g.add(bellyMesh);

    // 脖子
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 6, 12), scale);
    neck.position.set(1.15, 2.35, 0);
    neck.rotation.z = -0.65;
    g.add(neck);

    // 头
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.75), scale);
    head.position.set(1.95, 3.0, 0);
    head.rotation.z = -0.18;
    g.add(head);
    // 吻部
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.55), scale);
    snout.position.set(2.45, 2.85, 0);
    g.add(snout);
    // 下颚
    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.5), belly);
    jawMesh.position.set(2.48, 2.62, 0);
    g.add(jawMesh);

    // 角
    [-0.25, 0.25].forEach(z => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.65, 7), hornMat);
      horn.position.set(1.68, 3.45, z);
      horn.rotation.z = 0.5;
      horn.rotation.x = z * 0.5;
      g.add(horn);
    });
    // 鼻角
    const noseHorn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), hornMat);
    noseHorn.position.set(2.6, 3.12, 0);
    noseHorn.rotation.z = -1.3;
    g.add(noseHorn);

    // 眼睛（发光，颜色可变）
    const eyeMat = mat(eyeColor, { emissive: eyeColor, emissiveIntensity: 1.8 });
    [-0.26, 0.26].forEach(z => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), eyeMat);
      eye.position.set(2.12, 3.12, z);
      g.add(eye);
    });

    // 牙齿
    for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 5), mat(0xfffff0, { roughness: 0.2 }));
      tooth.position.set(2.28 + i * 0.11, 2.63, 0.18);
      tooth.rotation.x = Math.PI;
      g.add(tooth);
      const tooth2 = tooth.clone();
      tooth2.position.z = -0.18;
      g.add(tooth2);
    }

    // 腿
    const legPositions = [
      [0.55, 0.55], [0.55, -0.55],
      [-0.55, 0.55], [-0.55, -0.55]
    ];
    legPositions.forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.6, 5, 9), scale);
      leg.position.set(x, 0.55, z);
      g.add(leg);
      // 爪
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.5), mat(0x882222));
      claw.position.set(x + 0.08, 0.1, z);
      g.add(claw);
      // 趾甲
      for (let t = -1; t <= 1; t++) {
        const nail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), hornMat);
        nail.position.set(x + 0.3, 0.1, z + t * 0.17);
        nail.rotation.z = -Math.PI / 2;
        g.add(nail);
      }
    });

    // 翅膀（可动）
    const wings = [];
    [-1, 1].forEach(side => {
      const wing = new THREE.Group();
      wing.position.set(-0.35, 2.2, side * 0.7);

      const membraneMat = new THREE.MeshStandardMaterial({
        color: 0x991133, side: THREE.DoubleSide,
        roughness: 0.7, transparent: true, opacity: 0.92
      });

      // 主翼膜
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.5, 1.3, 1.8, 1.9, 2.6, 1.1);
      shape.bezierCurveTo(2.0, 0.5, 1.9, -0.4, 1.5, -0.9);
      shape.bezierCurveTo(1.0, -0.3, 0.4, -0.1, 0, 0);
      const wingGeo = new THREE.ShapeGeometry(shape, 10);
      const membrane = new THREE.Mesh(wingGeo, membraneMat);
      membrane.rotation.y = Math.PI / 2;
      wing.add(membrane);

      // 翼骨
      const boneMat = mat(0x772233, { roughness: 0.6 });
      const bones = [
        [1.5, 1.35, 0.75, 0.09],
        [1.3, 0.9, 0.6, 0.08],
        [1.1, 0.15, 0.5, 0.07]
      ];
      bones.forEach(([len, , , r]) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), boneMat);
        b.position.y = len / 2;
        b.rotation.z = Math.PI / 2;
        b.rotation.y = 0;
        wing.add(b);
      });

      wing.scale.z = side;
      g.add(wing);
      wings.push(wing);
    });

    // 尾巴
    const tail = new THREE.Group();
    tail.position.set(-1.75, 1.3, 0);
    const segments = 6;
    let prev = tail;
    let prevPos = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < segments; i++) {
      const size = 0.38 - i * 0.05;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(size, 0.1), 8, 8), scale);
      seg.position.set(-(i * 0.4 + 0.1), -i * i * 0.045, 0);
      tail.add(seg);
    }
    // 尾刺
    const tailSpike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), hornMat);
    tailSpike.position.set(-2.5, -0.7, 0);
    tailSpike.rotation.z = Math.PI / 2;
    tail.add(tailSpike);
    g.add(tail);

    // 背刺（数量可变）
    for (let i = 0; i < spikeCount; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14 - i * 0.012, 0.4 - i * 0.03, 6), hornMat);
      spike.position.set(0.7 - i * (1.4 / spikeCount), 2.55 - i * 0.02, 0);
      spike.rotation.z = -0.15;
      g.add(spike);
    }

    // 火焰光晕（口中，颜色可变）
    const fireLight = new THREE.PointLight(fireColor, 0.8, 5);
    fireLight.position.set(2.7, 2.75, 0);
    g.add(fireLight);

    g.userData = { body, head, wings, tail, jaw: jawMesh, fireLight, type: 'dragon' };
    applyVariant(g, v);
    return g;
  }

  // ---------- 敌人：暗黑魔王（最终Boss） ----------
  function createDarkLord(variant = null) {
    const g = new THREE.Group();
    const v = variant || {};
    const darkColor = v.bodyColor != null ? v.bodyColor : 0x1a1030;
    const trimColor = v.accentColor != null ? v.accentColor : 0x7722cc;
    const eyeColor = v.eyeColor != null ? v.eyeColor : 0xff2266;
    const glowInt = v.glow || 1;
    const dark = mat(darkColor, { roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(darkColor).offsetHSL(0,0,0.05).getHex(), emissiveIntensity: 0.4 });
    const trim = mat(trimColor, { emissive: new THREE.Color(trimColor).offsetHSL(0,0,-0.1).getHex(), emissiveIntensity: 0.9 * glowInt, metalness: 0.7, roughness: 0.3 });

    // 长袍（锥形）
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.0, 16), dark);
    robe.position.y = 1.0;
    g.add(robe);
    // 袍边
    const robeTrim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24), trim);
    robeTrim.rotation.x = Math.PI / 2;
    robeTrim.position.y = 0.1;
    g.add(robeTrim);

    // 上半身
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.7, 8, 14), dark);
    torso.position.y = 2.15;
    g.add(torso);
    // 肩甲
    [-1, 1].forEach(s => {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), trim);
      pad.position.set(s * 0.55, 2.55, 0);
      pad.rotation.z = s * 0.5;
      g.add(pad);
      // 尖刺
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), mat(0xaa44ff, { emissive: 0x6611cc, emissiveIntensity: 0.8 }));
      spike.position.set(s * 0.72, 2.82, 0);
      spike.rotation.z = s * 0.9;
      g.add(spike);
    });

    // 兜帽
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.7),
      dark
    );
    hood.position.y = 3.0;
    hood.scale.set(1, 1.15, 1.05);
    g.add(hood);

    // 兜帽内的黑暗（脸）
    const voidFace = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    voidFace.position.set(0, 2.95, 0.08);
    g.add(voidFace);

    // 发光的眼睛
    const eyeMat = mat(eyeColor, { emissive: eyeColor, emissiveIntensity: 2.5 });
    [-0.17, 0.17].forEach(x => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), eyeMat);
      eye.position.set(x, 2.98, 0.36);
      g.add(eye);
    });

    // 手臂
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.75, 5, 10), dark);
    armL.position.set(-0.75, 2.1, 0); armL.rotation.z = 0.32;
    g.add(armL);
    const armR = new THREE.Group();
    armR.position.set(0.75, 2.5, 0);
    const armRM = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.75, 5, 10), dark);
    armRM.position.y = -0.38;
    armR.add(armRM);
    // 爪手
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), trim);
    claw.position.y = -0.85;
    armR.add(claw);
    g.add(armR);

    // 法杖（暗黑权杖）
    const staff = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 8), mat(0x2a1a3a, { roughness: 0.8 }));
    staff.add(shaft);
    // 顶部骷髅头
    const orbSkull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0xddddcc, { roughness: 0.6 }));
    orbSkull.position.y = 1.0;
    orbSkull.scale.set(1, 1.1, 1);
    staff.add(orbSkull);
    const orbEye = mat(0x00ffaa, { emissive: 0x00ff88, emissiveIntensity: 2 });
    [-0.08, 0.08].forEach(x => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), orbEye);
      e.position.set(x, 1.03, 0.19);
      staff.add(e);
    });
    // 能量球
    const energyOrb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshBasicMaterial({ color: 0xaa22ff, transparent: true, opacity: 0.55 })
    );
    energyOrb.position.y = 1.0;
    staff.add(energyOrb);
    const orbLight = new THREE.PointLight(0xaa22ff, 2.2, 8);
    orbLight.position.y = 1.0;
    staff.add(orbLight);

    staff.position.set(0, -0.8, 0.1);
    armR.add(staff);

    // 脚下暗黑光环
    const darkRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0xaa22ff, transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    darkRing.rotation.x = -Math.PI / 2;
    darkRing.position.y = 0.03;
    g.add(darkRing);
    const darkRing2 = darkRing.clone();
    darkRing2.scale.setScalar(0.7);
    darkRing2.material = darkRing.material.clone();
    g.add(darkRing2);

    g.userData = { armR, staff, orb: energyOrb, orbLight, head: hood, darkRing, darkRing2, type: 'darklord' };
    applyVariant(g, v);
    return g;
  }

  // ---------- 模型工厂 ----------
  function create(type, flavor = {}) {
    const v = flavor.variant || null;
    switch (type) {
      case 'hero':     return createHero();
      case 'slime':    return createSlime(flavor.color, v);
      case 'goblin':   return createGoblin(v);
      case 'skeleton': return createSkeleton(v);
      case 'dragon':   return createDragon(v);
      case 'darklord': return createDarkLord(v);
      default:         return createSlime(flavor.color, v);
    }
  }

  // 根据关卡序号生成怪物变体（确定性：同一关外观一致）
  function createVariant(type, stageIndex) {
    const seed = stageIndex * 7919 + 977 + type.length * 131;
    return makeVariant(type, seed);
  }

  return { create, createVariant, makeVariant, mat };
})();
