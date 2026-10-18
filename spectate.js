/* ============================================================
   观战模式 - 20 个机器人自动对战 + 3D 主画面 + 评论系统
   主画面：真实 3D 战斗（可点缩略图切换房间）
   ============================================================ */

const Spectate = (() => {
  const BOT_COUNT = 20;

  // ==================== 状态 ====================
  let bots = [];
  let running = false;
  let timer = null;
  let round = 0;
  let tickInterval = 900;
  let selected = 0;          // 当前主画面显示的机器人

  // ==================== 观战专用 3D ====================
  let sRenderer = null, sScene = null, sCamera = null, sClock = null;
  let sAmbient = null, sKey = null;
  const sRooms = [];         // 每个机器人的 3D 对象 { hero, enemy, heroGlyph, enemyGlyph }
  let sInited = false;
  let sAnimId = null;

  // 3D 坐标
  const S_HERO_POS = new THREE.Vector3(-3.2, 0, 0.5);
  const S_ENEMY_POS = new THREE.Vector3(3.2, 0, -0.5);

  // ==================== 初始化观战 3D ====================
  function initSpectate3D() {
    if (sInited) return true;
    const canvas = document.getElementById('spectateCanvas');
    if (!canvas) return false;
    try {
      sRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (e) {
      console.warn('观战 3D 初始化失败:', e);
      return false;
    }
    sRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    sRenderer.shadowMap.enabled = true;
    sRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sRenderer.toneMappingExposure = 1.25;

    sScene = new THREE.Scene();
    sScene.background = new THREE.Color(0x1a2a3a);
    sScene.fog = new THREE.Fog(0x1a2a3a, 20, 45);

    sCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
    sCamera.position.set(0, 4.2, 11.5);
    sCamera.lookAt(0, 1.7, 0);

    sClock = new THREE.Clock();

    sAmbient = new THREE.AmbientLight(0x8899cc, 1.15);
    sScene.add(sAmbient);
    sKey = new THREE.DirectionalLight(0xfff0e0, 2.2);
    sKey.position.set(6, 14, 8);
    sKey.castShadow = true;
    sKey.shadow.mapSize.set(512, 512);
    sKey.shadow.camera.left = -14;
    sKey.shadow.camera.right = 14;
    sKey.shadow.camera.top = 14;
    sKey.shadow.camera.bottom = -14;
    sScene.add(sKey);
    const rim = new THREE.DirectionalLight(0x7788ff, 1.2);
    rim.position.set(-8, 6, -6);
    sScene.add(rim);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(16, 40),
      new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    sScene.add(ground);
    // 地面环
    [3.5, 6.5, 10].forEach(r => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.06, r + 0.06, 48),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      sScene.add(ring);
    });

    sInited = true;
    startSpectateLoop();
    return true;
  }

  // 为某个机器人构建 3D 对象（一次性，切换时显隐）
  function buildRoomModel(bot) {
    // 玩家模型
    const jobType = bot.job === 'mage' ? 'skeleton' : (bot.job === 'rogue' ? 'goblin' : 'hero');
    let hero;
    try {
      hero = Models.create('hero');
    } catch (e) {
      hero = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x4a7dff }));
      m.position.y = 1.2; hero.add(m);
    }
    hero.position.copy(S_HERO_POS);
    hero.userData._deathT = 0;

    // 敌人模型
    const enemyTypes = ['slime', 'goblin', 'skeleton', 'dragon', 'darklord'];
    const et = enemyTypes[bot.id % enemyTypes.length];
    let enemy;
    try {
      const v = Models.createVariant(et, bot.id * 13 + 7);
      enemy = Models.create(et, { variant: v });
    } catch (e) {
      enemy = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xff4466 }));
      enemy.position.y = 1;
    }
    enemy.position.copy(S_ENEMY_POS);
    enemy.userData._deathT = 0;

    return { hero, enemy };
  }

  // 显示某个房间（隐藏其他）
  function showRoom(idx) {
    if (!sInited) return;
    selected = idx;
    sRooms.forEach((room, i) => {
      if (!room) return;
      const on = i === idx;
      if (room.hero) room.hero.visible = on;
      if (room.enemy) room.enemy.visible = on;
      if (room.heroGlyph) room.heroGlyph.group.visible = on;
      if (room.enemyGlyph) room.enemyGlyph.group.visible = on;
    });
    // 高亮缩略图
    document.querySelectorAll('.spectate-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    // 更新标题
    const titleEl = document.getElementById('spectateFocus');
    if (titleEl && bots[idx]) {
      titleEl.textContent = `${bots[idx].name}  Lv.${bots[idx].lv}`;
    }
  }

  // ==================== 3D 渲染循环 ====================
  let sTime = 0;
  function startSpectateLoop() {
    if (sAnimId) cancelAnimationFrame(sAnimId);
    const loop = () => {
      sAnimId = requestAnimationFrame(loop);
      if (!sInited || !sRenderer) return;
      // 不在观战界面时不渲染（省性能）
      const modal = document.getElementById('spectateModal');
      if (!modal || !modal.classList.contains('show')) return;

      const dt = Math.min(sClock.getDelta(), 0.05);
      sTime += dt;

      // 更新当前房间的呼吸/动画
      const room = sRooms[selected];
      const bot = bots[selected];
      if (room && bot) {
        const breathe = Math.sin(sTime * 2.2) * 0.03;
        if (room.hero) {
          room.hero.position.y = breathe;
          // 死亡倒下
          const dead = bot.hp <= 0;
          room.hero.userData._deathT = dead ? Math.min(1, (room.hero.userData._deathT || 0) + dt * 1.6) : 0;
          room.hero.rotation.z = -(room.hero.userData._deathT) * Math.PI * 0.4;
        }
        if (room.enemy) {
          const eType = room.enemy.userData && room.enemy.userData.type;
          if (eType === 'slime') {
            const bounce = Math.abs(Math.sin(sTime * 3.2)) * 0.25;
            room.enemy.position.y = bounce;
          } else {
            room.enemy.position.y = Math.sin(sTime * 1.8 + 1) * 0.05;
          }
        }
        // 攻击动画
        if (room.attackAnim) updateAttackAnimRoom(room, dt);
      }

      sRenderer.render(sScene, sCamera);
    };
    loop();
  }

  // ==================== 机器人数据 ====================
  function makeBot(i) {
    const names = ['影', '炎', '霜', '雷', '岚', '夜', '光', '冥', '风', '岩',
                   '铁', '星', '月', '血', '龙', '狼', '鸦', '蛇', '虎', '鹰'];
    const titles = ['骑士', '法师', '刺客', '战士', '游侠', '贤者', '武僧', '死灵', '祭司', '剑圣'];
    const jobs = ['warrior', 'mage', 'rogue'];
    const jobNames = { warrior: '战士', mage: '法师', rogue: '刺客' };
    return {
      id: i,
      name: names[i % names.length] + titles[(i * 3) % titles.length],
      job: jobs[i % 3],
      jobName: jobNames[jobs[i % 3]],
      icon: ['⚔️', '🧙', '🗡'][i % 3],
      lv: 1 + Math.floor(Math.random() * 180),
      hp: 0, maxHp: 0, mp: 0, maxMp: 0, atk: 0, def: 0,
      enemy: null, enemyType: null,
      combo: 0, round: 1,
      dead: false,
      lastAction: '准备中…',
      kills: 0, dmgDealt: 0, dmgTaken: 0,
      // ---- 经济 & 装备 ----
      gold: 0,
      equip: { weapon: null, armor: null, acc: null },
      equipBonus: { atk: 0, def: 0 },
      boughtCount: 0,
      nextBuyAt: null    // 下次购买的击杀数阈值
    };
  }

  function initBot(bot) {
    bot.maxHp = Math.round(100 * (1 + bot.lv * 0.6));
    bot.hp = bot.maxHp;
    bot.maxMp = 30 + bot.lv;
    bot.mp = bot.maxMp;
    bot.atk = Math.round(18 * (1 + bot.lv * 0.18));
    bot.def = Math.round(6 * (1 + bot.lv * 0.12));
    // 初始金币：与等级相关（模拟已玩了一段时间）
    bot.gold = 300 + bot.lv * 25;
    // 开局先买一批装备（直到买不起更好的，最多 4 件）
    for (let k = 0; k < 4; k++) buyEquipment(bot);
    // 开局买完后重置购买节奏
    bot.kills = 0;
    bot.nextBuyAt = 3 + Math.floor(Math.random() * 2);
    spawnEnemyFor(bot);
  }

  // ==================== 机器人购买/佩戴装备 ====================
  // 机器人购买装备：按当前金币选档次，买得起的范围内挑最好的
  function buyEquipment(bot) {
    if (typeof EQUIP_DB === 'undefined') return;

    // ---- 1) 计算每件装备的价格，筛选买得起的 ----
    const affordable = [];
    for (const eq of EQUIP_DB) {
      const value = Math.max(1, Math.round(eq.tier * 3.2 * 1.8));
      const price = Math.round(40 + value * 3.2);
      if (bot.gold >= price) affordable.push({ eq, value, price });
    }
    if (!affordable.length) return;   // 金币不够买任何装备

    // ---- 2) 优先补齐空槽位（凑齐 3 件装备）----
    let candidates = affordable.filter(a => !bot.equip[a.eq.slot]);
    if (!candidates.length) {
      // ---- 3) 已有装备：找能升级的 ----
      candidates = affordable.filter(a => {
        const cur = bot.equip[a.eq.slot];
        return cur && cur.value < a.value;
      });
    }
    if (!candidates.length) return;   // 无法提升

    // ---- 4) 在候选中挑最好的（前 30% 随机）----
    candidates.sort((a, b) => b.value - a.value);
    const topN = Math.max(1, Math.ceil(candidates.length * 0.3));
    const pick = candidates[Math.floor(Math.random() * topN)];

    doBuy(bot, pick.eq, pick.value, pick.price);
  }

  function doBuy(bot, equip, value, price) {
    if (bot.gold < price) return;
    bot.gold -= price;
    bot.boughtCount++;
    bot.equip[equip.slot] = {
      name: equip.name, icon: equip.icon, slot: equip.slot,
      value, tier: equip.tier
    };
    recalcBotStats(bot);
    // ---- 购买可见反馈 ----
    bot.lastBuy = `${equip.icon}${equip.name}`;
    bot.buyFlash = Date.now();      // 触发闪烁动画
    bot.buySlot = equip.slot;       // 哪个槽位更新了
    // 在缩略图区域浮出购买提示
    showBuyToast(bot, equip, value, price);
  }

  // 购买时的浮出提示
  function showBuyToast(bot, equip, value, price) {
    const grid = document.getElementById('spectateGrid');
    if (!grid) return;
    const card = grid.children[bot.id];
    if (!card) return;
    // 移除旧提示
    const old = card.querySelector('.buy-toast');
    if (old) old.remove();
    const tip = document.createElement('div');
    tip.className = 'buy-toast';
    tip.innerHTML = `🛒 <b>${equip.icon}${equip.name}</b><span class="bt-gain">+${value}</span><span class="bt-cost">-${price}💰</span>`;
    card.appendChild(tip);
    setTimeout(() => tip.remove(), 3200);
    // 卡片闪烁
    card.classList.remove('buying');
    void card.offsetWidth;
    card.classList.add('buying');
    setTimeout(() => card.classList.remove('buying'), 900);
  }

  // 重算机器人属性（基础 + 装备加成）
  function recalcBotStats(bot) {
    let atkBonus = 0, defBonus = 0, hpBonus = 0;
    ['weapon', 'armor', 'acc'].forEach(s => {
      const e = bot.equip[s];
      if (!e) return;
      if (s === 'weapon') atkBonus += e.value;
      else if (s === 'armor') { defBonus += e.value; hpBonus += e.value * 3; }
      else { atkBonus += Math.round(e.value * 0.6); defBonus += Math.round(e.value * 0.6); }
    });
    bot.equipBonus = { atk: atkBonus, def: defBonus };
    const baseHp = Math.round(100 * (1 + bot.lv * 0.6));
    bot.maxHp = baseHp + hpBonus;
    if (bot.hp > bot.maxHp) bot.hp = bot.maxHp;
  }

  // 获取带装备加成的实际属性
  function botAtk(bot) { return bot.atk + (bot.equipBonus.atk || 0); }
  function botDef(bot) { return bot.def + (bot.equipBonus.def || 0); }

  function spawnEnemyFor(bot) {
    const scale = 0.7 + Math.random() * 0.5;
    const base = 60 + bot.lv * 40;
    const types = ['slime', 'goblin', 'skeleton', 'dragon', 'darklord'];
    bot.enemyType = types[Math.floor(Math.random() * types.length)];
    const names = { slime: '史莱姆', goblin: '哥布林', skeleton: '亡灵', dragon: '巨龙', darklord: '魔王' };
    bot.enemy = {
      name: names[bot.enemyType] + '·Lv' + Math.floor(bot.lv * 0.8 + Math.random() * 20),
      hp: Math.round(base * scale), maxHp: Math.round(base * scale),
      atk: Math.round((8 + bot.lv * 2.2) * scale),
      def: Math.round((2 + bot.lv * 0.8) * scale)
    };
  }

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // ==================== 战斗逻辑 ====================
  function botTurn(bot) {
    if (bot.dead) return;
    const e = bot.enemy;
    // 带装备加成的实际属性
    const ATK = botAtk(bot), DEF = botDef(bot);

    let action = '', dmg = 0;
    const r = Math.random();
    if (bot.hp / bot.maxHp < 0.3 && bot.mp >= 12 && r < 0.5) {
      const heal = Math.round(bot.maxHp * 0.15);
      bot.hp = Math.min(bot.maxHp, bot.hp + heal);
      bot.mp -= 12;
      action = `💚 治疗 +${heal}`;
      bot.lastAction = action;
      return;  // 治疗不触发攻击动画
    } else if (bot.mp >= 15 && r < 0.6) {
      dmg = Math.max(1, Math.round(ATK * 2.2 * (0.85 + Math.random() * 0.3)));
      bot.mp -= 15;
      action = `🔥 烈焰斩`;
    } else if (bot.mp >= 10 && r < 0.75) {
      dmg = Math.max(1, Math.round(ATK * 1.6 * (0.85 + Math.random() * 0.3)));
      bot.mp -= 10;
      action = `❄️ 冰霜箭`;
    } else {
      dmg = Math.max(1, Math.round(ATK * (0.85 + Math.random() * 0.3)));
      action = `🗡 攻击`;
    }

    // 暴击
    const crit = Math.random() < 0.12;
    if (crit) dmg = Math.round(dmg * 1.8);

    e.hp -= dmg;
    bot.dmgDealt += dmg;
    bot.combo++;
    bot.lastAction = action + ` -${dmg}` + (crit ? ' 暴击!' : '');

    // 触发该房间的攻击动画
    triggerRoomAttack(bot.id, crit);

    // 敌人死亡 → 掉落金币 + 定期购买装备 + 刷新
    if (e.hp <= 0) {
      e.hp = 0;
      bot.kills++;
      // 金币掉落（与敌人强度相关）
      const reward = Math.round(20 + bot.lv * 3 + Math.random() * 40);
      bot.gold += reward;
      bot.lastAction = `💰 +${reward}`;

      // ---- 每局都尝试购买一次（金币不够则不买）----
      setTimeout(() => {
        if (!running) return;
        buyEquipment(bot);
      }, 250);

      setTimeout(() => {
        if (!running) return;
        spawnEnemyFor(bot);
        bot.round++;
        if (!bot.lastBuy) bot.lastAction = '⚔ 遭遇新敌人';
        rebuildRoomEnemy(bot.id);
      }, 500);
      return;
    }

    // 敌人反击
    const enemyDmg = Math.max(1, Math.round(e.atk * (0.8 + Math.random() * 0.4) * (1 - DEF / (DEF + 80))));
    bot.hp -= enemyDmg;
    bot.dmgTaken += enemyDmg;
    bot.combo = 0;
    bot.lastBuy = null;   // 清空购买提示
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.dead = true;
      bot.lastAction = '💀 阵亡';
      return;
    }
    bot.mp = Math.min(bot.maxMp, bot.mp + 3);
    bot.round++;
  }

  // ==================== 房间攻击动画 ====================
  function triggerRoomAttack(botId, crit) {
    const room = sRooms[botId];
    if (!room) return;
    room.attackAnim = { t: 0, dur: 0.35, crit: !!crit };
  }

  function updateAttackAnimRoom(room, dt) {
    const a = room.attackAnim;
    a.t += dt;
    const p = Math.min(1, a.t / a.dur);
    if (room.hero) {
      const off = Math.sin(p * Math.PI) * 1.6;
      room.hero.position.x = S_HERO_POS.x + off;
    }
    // 命中闪光（敌人）
    if (!a.hitDone && p >= 0.55) {
      a.hitDone = true;
      if (room.enemy) {
        room.enemy.traverse(o => {
          if (o.material && o.material.emissive) {
            o.userData._oe = o.material.emissive.getHex();
            o.material.emissive.setHex(a.crit ? 0xffdd33 : 0xff4444);
            o.material.emissiveIntensity = 1.4;
          }
        });
        setTimeout(() => {
          if (!room.enemy) return;
          room.enemy.traverse(o => {
            if (o.material && o.material.emissive) {
              o.material.emissive.setHex(o.userData._oe || 0x000000);
              o.material.emissiveIntensity = 1;
            }
          });
        }, 130);
      }
    }
    if (p >= 1) {
      if (room.hero) room.hero.position.x = S_HERO_POS.x;
      room.attackAnim = null;
    }
  }

  function rebuildRoomEnemy(botId) {
    const room = sRooms[botId];
    const bot = bots[botId];
    if (!room || !bot || !sScene) return;
    const wasVisible = room.enemy ? room.enemy.visible : false;
    if (room.enemy) { sScene.remove(room.enemy); disposeObj(room.enemy); }
    let enemy;
    try {
      const v = Models.createVariant(bot.enemyType, bot.id * 13 + bot.round * 7);
      enemy = Models.create(bot.enemyType, { variant: v });
    } catch (e) {
      enemy = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xff4466 }));
      enemy.position.y = 1;
    }
    enemy.position.copy(S_ENEMY_POS);
    enemy.visible = (selected === botId);
    sScene.add(enemy);
    room.enemy = enemy;
  }

  function disposeObj(obj) {
    if (!obj) return;
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => m.dispose());
      }
    });
  }

  // ==================== 推进回合 ====================
  function tick() {
    if (!running) return;
    round++;
    bots.forEach(botTurn);
    renderThumbs();
    updateStats();
    if (bots.every(b => b.dead)) {
      stop();
      toast('观战结束：全部机器人阵亡', '#ff8866');
    }
  }

  // ==================== 渲染缩略图 ====================
  function renderThumbs() {
    const grid = document.getElementById('spectateGrid');
    if (!grid) return;
    grid.innerHTML = bots.map((bot, i) => {
      const hpPct = Math.max(0, bot.hp / bot.maxHp * 100);
      const ehpPct = bot.enemy ? Math.max(0, bot.enemy.hp / bot.enemy.maxHp * 100) : 0;
      // 装备图标行
      const eq = bot.equip || {};
      const eqIcons = ['weapon', 'armor', 'acc'].map(s => {
        const it = eq[s];
        return it ? `<span class="st-equip" title="${it.name} (+${it.value})">${it.icon}</span>` : `<span class="st-equip empty">·</span>`;
      }).join('');
      return `
        <div class="spectate-thumb ${bot.dead ? 'dead' : ''} ${i === selected ? 'active' : ''}"
             onclick="Spectate.select(${i})">
          <div class="st-head">
            <span class="st-icon">${bot.icon}</span>
            <span class="st-name">${bot.name}</span>
          </div>
          <div class="st-lv">Lv.${bot.lv} · ${bot.jobName} · 💰${bot.gold || 0}</div>
          <div class="sp-bar hp"><div class="sp-fill" style="width:${hpPct}%;${hpPct<30?'background:linear-gradient(90deg,#ff3b3b,#ff7b7b)':''}"></div></div>
          <div class="sp-bar enemy"><div class="sp-fill" style="width:${ehpPct}%"></div></div>
          <div class="st-equips">${eqIcons}</div>
          <div class="st-action">${bot.dead ? '💀 阵亡' : bot.lastBuy ? ('🛒'+bot.lastBuy) : bot.lastAction}</div>
        </div>`;
    }).join('');
  }

  function updateStats() {
    const alive = bots.filter(b => !b.dead).length;
    const el = document.getElementById('spectateRound');
    if (el) el.textContent = `第 ${round} 回合 · 存活 ${alive}/${BOT_COUNT}`;
  }

  function select(i) {
    if (i < 0 || i >= bots.length) return;
    showRoom(i);
    Sound.click();
  }

  // ==================== 控制 ====================
  function start() {
    if (running) return;
    // 初始化 3D
    const ok3d = initSpectate3D();
    // 生成机器人
    bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      const b = makeBot(i);
      initBot(b);
      bots.push(b);
    }
    // 构建 3D 房间
    if (ok3d && sScene) {
      // 清理旧房间
      sRooms.forEach(r => {
        if (!r) return;
        if (r.hero) { sScene.remove(r.hero); disposeObj(r.hero); }
        if (r.enemy) { sScene.remove(r.enemy); disposeObj(r.enemy); }
      });
      sRooms.length = 0;
      bots.forEach((b, i) => {
        const { hero, enemy } = buildRoomModel(b);
        hero.visible = false; enemy.visible = false;
        sScene.add(hero); sScene.add(enemy);
        sRooms[i] = { hero, enemy, attackAnim: null };
      });
      showRoom(0);
    }
    round = 1;
    running = true;
    renderThumbs();
    updateStats();
    renderComments();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, tickInterval);
    Sound.click();
  }

  function stop() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
  }

  function open() {
    // 关闭玩家自己的自动战斗（避免冲突）
    if (typeof Features !== 'undefined' && typeof G !== 'undefined' && G && G.autoBattle) {
      try { Features.toggleAuto(); } catch (e) { /* ignore */ }
    }
    document.getElementById('spectateModal').classList.add('show');
    // 快捷评论
    const quick = document.getElementById('commentQuick');
    if (quick && !quick.dataset.init) {
      quick.dataset.init = '1';
      quick.innerHTML = ['👍', '😂', '🔥', '😱', '👏', '💀', '❓', '😭']
        .map(e => `<button onclick="Spectate.sendQuickComment('${e}')">${e}</button>`).join('');
    }
    start();
  }

  function close() {
    stop();
    stopBotComments();
    document.getElementById('spectateModal').classList.remove('show');
    Sound.click();
  }

  const SPEEDS = [900, 500, 250];
  let speedIdx = 0;
  function cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    tickInterval = SPEEDS[speedIdx];
    if (timer) { clearInterval(timer); timer = setInterval(tick, tickInterval); }
    const btn = document.getElementById('spectateSpeed');
    if (btn) btn.textContent = ['1×', '2×', '4×'][speedIdx];
    Sound.click();
  }

  // ==================== 评论 ====================
  let comments = [];
  const BOT_COMMENTS = [
    '这操作可以啊！', '哈哈哈笑死', '菜鸡互啄', '大佬666', '这波稳了',
    '痛，太痛了', '什么鬼操作', '蹲一个翻盘', '前排围观 🔥', '这血量要没了',
    '蹭蹭不进去', '装什么大佬', '我上我也行', '主播好人', '稳住别浪',
    '这AI有点东西', '秒了秒了', '翻车现场', '残血反杀？', '太精彩了 👏',
    '加大力度', '心疼机器人', '顶不住了啊', '看得我血压高'
  ];
  const NAMES = ['路人甲', '吃瓜群众', '键盘侠', '白嫖怪', '萌新', '老玩家', '云玩家',
                 '手速怪', '欧皇', '非酋', '摸鱼ing', '真香', '打工人', '夜猫子'];

  function renderComments() {
    const list = document.getElementById('commentList');
    if (!list) return;
    list.innerHTML = comments.map(c => `
      <div class="comment-item ${c.bot ? 'bot' : ''}">
        <span class="c-name">${c.name}</span>
        <span class="c-text">${c.text}</span>
      </div>`).join('');
    list.scrollTop = list.scrollHeight;
  }
  function addComment(name, text, isBot) {
    comments.push({ name, text, bot: isBot });
    if (comments.length > 100) comments.shift();
    renderComments();
  }
  function sendComment() {
    const input = document.getElementById('commentInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    addComment('你', text, false);
    input.value = '';
    Sound.click();
  }
  function sendQuickComment(emoji) {
    addComment('你', emoji, false);
    Sound.click();
  }
  let botCommentTimer = null;
  function startBotComments() {
    if (botCommentTimer) clearInterval(botCommentTimer);
    botCommentTimer = setInterval(() => {
      if (!running) return;
      const alive = bots.filter(b => !b.dead).length;
      let text;
      if (alive <= 3) text = '剩这么几个了！';
      else if (alive < 10) text = '死伤惨重…';
      else text = pick(BOT_COMMENTS);
      addComment(pick(NAMES) + Math.floor(Math.random() * 99), text, true);
    }, 1800);
  }
  function stopBotComments() {
    if (botCommentTimer) { clearInterval(botCommentTimer); botCommentTimer = null; }
  }

  return {
    open() { open(); startBotComments(); },
    close,
    start, stop, tick, cycleSpeed, select,
    sendComment, sendQuickComment,
    get running() { return running; },
    get bots() { return bots; },
    get selected() { return selected; }
  };
})();
