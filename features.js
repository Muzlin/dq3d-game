/* ============================================================
   扩展功能模块 - 20 项新功能
   依赖：game.js 中的 G / playerAction / render / log 等
   ============================================================ */

const Features = (() => {

  // ==================== 1. 金币掉落动画 ====================
  function goldRain(amount) {
    const layer = document.getElementById('floatLayer');
    if (!layer) return;
    const n = Math.min(12, 3 + Math.floor(amount / 20));
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'gold-coin';
      el.textContent = '🪙';
      el.style.left = (window.innerWidth * (0.5 + (Math.random() - 0.5) * 0.5)) + 'px';
      el.style.animationDelay = (i * 0.06) + 's';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1600);
    }
  }

  // ==================== 2. 装备强化 ====================
  const MAX_ENHANCE = 10;
  function enhanceCost(item) {
    return Math.round(60 * Math.pow(1.55, item.enhance || 0) * (1 + (item.tier || 1) * 0.1));
  }
  function enhanceChance(item) {
    // 强化等级越高成功率越低
    const base = 0.95 - (item.enhance || 0) * 0.075;
    return Math.max(0.25, base);
  }
  function enhanceItem(itemId) {
    const p = G.player;
    const item = p.bag.find(i => i.id === itemId) ||
                 ['weapon','armor','acc'].map(s => p.equip[s]).find(i => i && i.id === itemId);
    if (!item || item.kind !== 'equip') return;
    const lv = item.enhance || 0;
    if (lv >= MAX_ENHANCE) { toast('已达最高强化等级'); Sound.error(); return; }
    const cost = enhanceCost(item);
    if (p.gold < cost) { toast('金币不足'); Sound.error(); return; }
    p.gold -= cost;
    const chance = enhanceChance(item);
    if (Math.random() < chance) {
      item.enhance = lv + 1;
      // 提升数值
      const gain = Math.max(1, Math.round(item.value * 0.12));
      item.value += gain;
      const statName = item.stat === 'both' ? '攻防' : item.stat === 'atk' ? '攻击' : '防御';
      item.desc = `${statName} +${item.value}`;
      item.name = item.baseName ? item.baseName : item.name;
      // 记录基础名
      if (!item.baseName) item.baseName = item.name;
      item.name = `${item.baseName} +${item.enhance}`;
      Sound.levelUp();
      toast(`强化成功！+${item.enhance}`, '#55ffa0');
      log(`🔨 <b>${item.name}</b> 强化成功！${statName} +${item.value}`, 'sys');
    } else {
      Sound.error();
      toast('强化失败！材料损坏', '#ff5566');
      log(`💥 强化失败，损失 ${cost} 金币。`, 'miss');
    }
    saveGame();
    render();
  }

  // ==================== 3. 技能树 ====================
  const SKILL_TREE = [
    { id: 'atk1',  name: '力量强化 I',  icon: '💪', cost: 3, desc: '攻击 +8%',  req: null },
    { id: 'atk2',  name: '力量强化 II', icon: '💪', cost: 5, desc: '攻击 +15%', req: 'atk1' },
    { id: 'def1',  name: '铁壁 I',      icon: '🛡', cost: 3, desc: '防御 +10%', req: null },
    { id: 'def2',  name: '铁壁 II',     icon: '🛡', cost: 5, desc: '防御 +18%', req: 'def1' },
    { id: 'hp1',   name: '生命力 I',    icon: '❤️', cost: 3, desc: '最大生命 +15%', req: null },
    { id: 'hp2',   name: '生命力 II',   icon: '❤️', cost: 6, desc: '最大生命 +25%', req: 'hp1' },
    { id: 'mp1',   name: '魔力涌动',    icon: '🔵', cost: 4, desc: '最大法力 +30%', req: null },
    { id: 'crit1', name: '致命一击',    icon: '💥', cost: 5, desc: '暴击率 +8%', req: 'atk1' },
    { id: 'crit2', name: '致命打击',    icon: '💥', cost: 8, desc: '暴击伤害 +40%', req: 'crit1' },
    { id: 'vamp',  name: '吸血',        icon: '🩸', cost: 7, desc: '攻击吸取 12% 伤害为生命', req: 'atk2' },
    { id: 'thorns',name: '荆棘',        icon: '🌵', cost: 6, desc: '受击反弹 20% 伤害', req: 'def2' },
    { id: 'regen', name: '再生',        icon: '🌿', cost: 6, desc: '每回合恢复 3% 最大生命', req: 'hp2' }
  ];
  function skillPoints() {
    // 技能点随等级变多：
    //   Lv1-9:   每 2 级 1 点
    //   Lv10-29: 每级 1 点
    //   Lv30-59: 每级 1.5 点
    //   Lv60+:   每级 2 点
    const lv = G.player.lv;
    let earned = 2;   // 初始赠送
    if (lv <= 9) {
      earned += Math.floor(lv / 2);
    } else if (lv <= 29) {
      earned += 4 + (lv - 9);                    // Lv10起每级+1
    } else if (lv <= 59) {
      earned += 4 + 20 + Math.floor((lv - 29) * 1.5);   // 每级+1.5
    } else {
      earned += 4 + 20 + Math.floor(30 * 1.5) + Math.floor((lv - 59) * 2); // 每级+2
    }
    const used = (G.player.skills || []).reduce((sum, id) => {
      const s = SKILL_TREE.find(t => t.id === id);
      return sum + (s ? s.cost : 0);
    }, 0);
    return Math.max(0, earned - used);
  }
  function learnSkill(id) {
    const s = SKILL_TREE.find(t => t.id === id);
    if (!s) return;
    if ((G.player.skills || []).includes(id)) return;
    if (s.req && !(G.player.skills || []).includes(s.req)) { toast('需要先学习前置技能'); Sound.error(); return; }
    if (skillPoints() < s.cost) { toast('技能点不足'); Sound.error(); return; }
    if (!G.player.skills) G.player.skills = [];
    G.player.skills.push(id);
    applySkills();
    Sound.levelUp();
    toast(`学会了 ${s.name}！`, '#55ffa0');
    log(`✨ 学会技能【${s.name}】：${s.desc}`, 'sys');
    saveGame();
    renderSkillTree();
    render();
  }
  function hasSkill(id) { return (G.player.skills || []).includes(id); }
  // 应用技能加成为玩家基础属性（每次变更后重算）
  function applySkills() {
    const p = G.player;
    if (!p._baseStats) {
      p._baseStats = { maxHp: p.maxHp, maxMp: p.maxMp, atk: p.atk, def: p.def };
    }
    const b = p._baseStats;
    let hpMul = 1, mpMul = 1, atkMul = 1, defMul = 1;
    if (hasSkill('hp1')) hpMul *= 1.15;
    if (hasSkill('hp2')) hpMul *= 1.25;
    if (hasSkill('mp1')) mpMul *= 1.30;
    if (hasSkill('atk1')) atkMul *= 1.08;
    if (hasSkill('atk2')) atkMul *= 1.15;
    if (hasSkill('def1')) defMul *= 1.10;
    if (hasSkill('def2')) defMul *= 1.18;
    p.maxHp = Math.round(b.maxHp * hpMul);
    p.maxMp = Math.round(b.maxMp * mpMul);
    p.atk = Math.round(b.atk * atkMul);
    p.def = Math.round(b.def * defMul);
    p.hp = Math.min(p.hp, p.maxHp);
  }
  // 在升级后同步基础属性
  function syncBaseStats() {
    const p = G.player;
    if (p._baseStats) {
      p._baseStats.maxHp = p.maxHp;
      p._baseStats.maxMp = p.maxMp;
      p._baseStats.atk = p.atk;
      p._baseStats.def = p.def;
    }
  }

  // ==================== 4. 宠物/召唤兽 ====================
  const PETS = [
    { id: 'wolf',  name: '影狼',   icon: '🐺', cost: 120, desc: '每回合额外攻击，造成 15% 伤害' },
    { id: 'fairy', name: '精灵',   icon: '🧚', cost: 150, desc: '每回合恢复 5% 生命' },
    { id: 'golem', name: '石魔像', icon: '🗿', cost: 180, desc: '受到伤害减少 12%' },
    { id: 'phoenix', name: '凤凰', icon: '🔥', cost: 300, desc: '死亡时复活一次（50% 生命）' }
  ];
  function buyPet(id) {
    const pet = PETS.find(p => p.id === id);
    if (!pet) return;
    if ((G.player.pets || []).includes(id)) { toast('已拥有该宠物'); return; }
    if (G.player.gold < pet.cost) { toast('金币不足'); Sound.error(); return; }
    G.player.gold -= pet.cost;
    if (!G.player.pets) G.player.pets = [];
    G.player.pets.push(id);
    if (!G.player.activePet) G.player.activePet = id;
    Sound.item();
    toast(`获得宠物 ${pet.name}！`, '#55ffa0');
    log(`🐾 获得宠物【${pet.name}】：${pet.desc}`, 'sys');
    saveGame(); renderPetPanel(); render();
  }
  function setActivePet(id) {
    if (!(G.player.pets || []).includes(id)) return;
    G.player.activePet = id;
    Sound.click();
    toast(`出战宠物：${PETS.find(p => p.id === id).name}`);
    saveGame(); renderPetPanel(); render();
  }
  function hasPet(id) { return (G.player.pets || []).includes(id); }
  function activePet() { return G.player.activePet || null; }

  // ==================== 5. 无尽模式 ====================
  function startEndless() {
    if (!G) return;
    G.endless = true;
    G.endlessFloor = 1;
    Sound.click();
    toast('⚔ 无尽模式开始！', '#ffcc55');
    log('⚔⚔⚔ 进入无尽模式！挑战你的极限 ⚔⚔⚔', 'sys');
    buildEndlessFloor(1);
    closeModal('menuModal');
  }
  function buildEndlessFloor(floor) {
    // 无尽模式的敌人：基于玩家等级动态生成，越来越强
    const p = G.player;
    const scale = Math.pow(1.18, floor - 1);
    const baseHp = Math.round((p.maxHp * 1.2 + 100) * scale);
    const baseAtk = Math.round((p.atk * 0.55 + 10) * scale);
    const baseDef = Math.round((p.def * 0.5) * scale);
    const types = ['slime','goblin','skeleton','dragon','darklord'];
    const type = types[Math.min(4, Math.floor((floor - 1) / 3))];
    G.stageIndex = 999;
    G.enemy = {
      name: `无尽守卫 Lv.${floor}`,
      type,
      avatar: '💀',
      lv: p.lv + floor,
      hp: baseHp, maxHp: baseHp,
      atk: baseAtk, def: baseDef,
      exp: Math.round(50 * scale), gold: Math.round(30 * scale),
      isBoss: floor % 5 === 0, isMiniBoss: floor % 5 === 3,
      statuses: [], defending: false, cds: {}
    };
    // 重建模型
    if (typeof enemyModel !== 'undefined' && enemyModel) {
      scene.remove(enemyModel);
      disposeObject(enemyModel);
    }
    const variant = Models.createVariant(type, floor * 7 + 100);
    enemyModel = Models.create(type, { variant });
    enemyModel.position.copy(enemyPos);
    enemyModel.userData._deathT = 0;
    scene.add(enemyModel);
    G.busy = false;
    G.over = false;
    document.getElementById('stageInfo').textContent = `无尽模式 · 第 ${floor} 层`;
    log(`—— 无尽模式 第 ${floor} 层 ——`, 'sys');
    log(`<b>${G.enemy.name}</b> 出现了！`, 'enemy');
    render();
  }
  function onEndlessClear() {
    G.endlessFloor++;
    const reward = 50 * G.endlessFloor;
    G.player.gold += reward;
    goldRain(reward);
    log(`🎉 通过第 ${G.endlessFloor - 1} 层！获得 ${reward} 金币奖励。`, 'exp');
    log(`下一层即将开始…`, 'sys');
    buildEndlessFloor(G.endlessFloor);
  }

  // ==================== 6. 多角色选择 ====================
  const HEROES = [
    { id: 'warrior', name: '战士', icon: '⚔️', desc: '高生命高防御，攻守兼备',
      stats: { hp: 120, mp: 20, atk: 20, def: 9, crit: 0.08 }, color: 0x4a7dff },
    { id: 'mage',    name: '法师', icon: '🧙', desc: '高法力高伤害，脆弱',
      stats: { hp: 85, mp: 55, atk: 26, def: 4, crit: 0.14 }, color: 0xbb66ff },
    { id: 'rogue',   name: '刺客', icon: '🗡', desc: '高暴击高闪避，速攻',
      stats: { hp: 95, mp: 30, atk: 22, def: 6, crit: 0.22 }, color: 0x55ffa0 }
  ];
  function chooseHero(id) {
    const h = HEROES.find(x => x.id === id);
    if (!h) return;
    G = newGame();
    G.heroId = id;
    const p = G.player;
    p.heroId = id;
    p.name = h.name;
    p.avatar = h.icon;
    p.maxHp = h.stats.hp; p.hp = h.stats.hp;
    p.maxMp = h.stats.mp; p.mp = h.stats.mp;
    p.atk = h.stats.atk; p.def = h.stats.def;
    p.critBonus = h.stats.crit;
    p._baseStats = { maxHp: h.stats.hp, maxMp: h.stats.mp, atk: h.stats.atk, def: h.stats.def };
    Sound.levelUp();
    log(`⚔ 选择了【${h.name}】，开始冒险！`, 'sys');
    closeModal('chooseHeroModal');
    document.getElementById('startModal').classList.remove('show');
    buildStage(0);
    if (G.bgmOn) BGM.play(STAGE_BGM[0]);
    saveGame();
  }

  // ==================== 7. 商店刷新 ====================
  function shopRefresh() {
    if (typeof Shop === 'undefined') return;
    const cost = 50;
    if (G.player.gold < cost) { toast('刷新需要 50 金币'); Sound.error(); return; }
    G.player.gold -= cost;
    Shop.open(G.stageIndex + 1);
    Sound.item();
    toast('商店已刷新', '#55ffa0');
    render();
  }

  // ==================== 8. 战斗速度 ====================
  const SPEEDS = [1, 1.5, 2, 3];
  function cycleSpeed() {
    let idx = SPEEDS.indexOf(G.battleSpeed || 1);
    idx = (idx + 1) % SPEEDS.length;
    G.battleSpeed = SPEEDS[idx];
    Sound.click();
    const btn = document.getElementById('speedBtn');
    if (btn) btn.textContent = G.battleSpeed + '×';
    toast(`战斗速度 ${G.battleSpeed}×`);
    saveGame();
  }

  // ==================== 9. 逃跑机制 ====================
  async function tryFlee() {
    if (!G || G.over || G.busy) return;
    if (G.enemy.isBoss) { toast('首领战无法逃跑！'); Sound.error(); return; }
    G.busy = true; render();
    const chance = 0.55;
    if (Math.random() < chance) {
      log('💨 成功逃跑！', 'sys');
      Sound.click();
      G.busy = false;
      // 跳过本关（不算胜利，直接进入下一关但不给奖励）
      if (G.stageIndex < STAGES.length - 1) {
        buildStage(G.stageIndex + 1);
        G.busy = false;
      }
    } else {
      log('逃跑失败！', 'miss');
      Sound.error();
      toast('逃跑失败！', '#ff5566');
      await sleep(400);
      G.busy = false;
      // 敌人趁机攻击
      if (typeof enemyTurn === 'function') { await enemyTurn(); }
      render();
    }
  }

  // ==================== 10. 存档槽位 ====================
  function saveToSlot(slot) {
    try {
      const data = {
        v: 1, stageIndex: G.stageIndex, round: G.round,
        player: G.player, soundOn: G.soundOn, bgmOn: G.bgmOn,
        itemIdCounter: typeof itemIdCounter !== 'undefined' ? itemIdCounter : 1,
        savedAt: Date.now()
      };
      localStorage.setItem('dq3d_slot_' + slot, JSON.stringify(data));
      toast(`已保存到存档位 ${slot}`, '#55ffa0');
      Sound.save();
    } catch (e) { toast('保存失败'); }
  }
  function loadFromSlot(slot) {
    try {
      const raw = localStorage.getItem('dq3d_slot_' + slot);
      if (!raw) { toast('该存档位为空'); Sound.error(); return; }
      const s = JSON.parse(raw);
      localStorage.setItem('dq3d_save', raw);
      if (typeof loadGame === 'function') loadGame();
      toast(`已读取存档位 ${slot}`, '#55ffa0');
      closeModal('slotModal');
    } catch (e) { toast('读取失败'); }
  }
  function slotInfo(slot) {
    try {
      const raw = localStorage.getItem('dq3d_slot_' + slot);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return { stage: s.stageIndex + 1, lv: s.player.lv, gold: s.player.gold };
    } catch { return null; }
  }

  // ==================== 11. 成就系统 ====================
  const ACHIEVEMENTS = [
    { id: 'first_win',  name: '初战告捷',   icon: '🎯', desc: '赢得第一场战斗' },
    { id: 'combo10',    name: '连击大师',   icon: '🔥', desc: '达成 10 连击' },
    { id: 'crit5',      name: '暴击专家',   icon: '💥', desc: '累计 5 次暴击' },
    { id: 'lv10',       name: '成长之路',   icon: '⭐', desc: '达到 10 级' },
    { id: 'lv50',       name: '一代宗师',   icon: '👑', desc: '达到 50 级' },
    { id: 'golds1000',  name: '富甲一方',   icon: '💰', desc: '拥有 1000 金币' },
    { id: 'epic',       name: '紫装收集者', icon: '🟣', desc: '获得一件史诗装备' },
    { id: 'boss1',      name: '屠龙勇士',   icon: '🐲', desc: '击败第一个大首领' },
    { id: 'stage100',   name: '百战之躯',   icon: '🏆', desc: '通过第 100 关' },
    { id: 'stage500',   name: '传奇冒险者', icon: '🌟', desc: '通过第 500 关' },
    { id: 'endless10',  name: '无尽挑战者', icon: '♾️', desc: '无尽模式通过 10 层' },
    { id: 'pets',       name: '宠物大师',   icon: '🐾', desc: '拥有 2 只宠物' }
  ];
  function unlockAchievement(id) {
    if (!G.player.achievements) G.player.achievements = [];
    if (G.player.achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    G.player.achievements.push(id);
    Sound.levelUp();
    toast(`🏆 成就解锁：${a.name}`, '#ffcc55');
    log(`🏆 成就解锁【${a.name}】：${a.desc}`, 'sys');
    saveGame();
  }
  function hasAchievement(id) { return (G.player.achievements || []).includes(id); }
  function renderAchievements() {
    const el = document.getElementById('achievementList');
    if (!el) return;
    const unlocked = G.player.achievements || [];
    el.innerHTML = ACHIEVEMENTS.map(a => {
      const ok = unlocked.includes(a.id);
      return `<div class="ach-item ${ok ? 'unlocked' : 'locked'}">
        <div class="ach-icon">${ok ? a.icon : '🔒'}</div>
        <div class="ach-info">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>
      </div>`;
    }).join('');
  }
  let killCount = 0, critCount = 0;
  function trackKill() { killCount++; }
  function trackCrit() { critCount++; if (critCount >= 5) unlockAchievement('crit5'); }

  // ==================== 12. 连续战斗奖励 ====================
  function checkStreak() {
    const p = G.player;
    p.streak = (p.streak || 0) + 1;
    if (p.streak > 0 && p.streak % 5 === 0) {
      const bonus = p.streak * 10;
      p.gold += bonus;
      goldRain(bonus);
      log(`🔥 连续通过 ${p.streak} 关！额外奖励 ${bonus} 金币。`, 'exp');
      toast(`连战 ${p.streak} 关 +${bonus}💰`, '#ffcc55');
    }
  }

  // ==================== 13. 自动战斗 ====================
  let autoTimer = null;

  // ==================== 虚拟鼠标光标 ====================
  let cursorEl = null;
  let cursorPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function ensureCursor() {
    if (cursorEl) return cursorEl;
    cursorEl = document.createElement('div');
    cursorEl.id = 'autoCursor';
    cursorEl.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15 20.5 L11.5 14 L18 13 Z" fill="#fff" stroke="#14261a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    cursorEl.style.left = cursorPos.x + 'px';
    cursorEl.style.top = cursorPos.y + 'px';
    document.body.appendChild(cursorEl);
    return cursorEl;
  }

  // 平滑移动光标到目标元素中心
  function moveCursorTo(el, duration = 300) {
    const cursor = ensureCursor();
    const rect = el.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const startX = cursorPos.x, startY = cursorPos.y;
    const t0 = performance.now();

    cursor.classList.add('visible');
    document.querySelectorAll('.auto-target').forEach(x => x.classList.remove('auto-target'));
    el.classList.add('auto-target');

    return new Promise(resolve => {
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const x = startX + (targetX - startX) * e;
        const y = startY + (targetY - startY) * e;
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';
        cursorPos.x = x; cursorPos.y = y;
        if (t < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  // 光标点击动画 + 波纹
  function cursorClick() {
    const cursor = ensureCursor();
    cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click');
    let ring = document.getElementById('autoTapRing');
    if (!ring) {
      ring = document.createElement('div');
      ring.id = 'autoTapRing';
      document.body.appendChild(ring);
    }
    ring.style.left = cursorPos.x + 'px';
    ring.style.top = cursorPos.y + 'px';
    ring.style.width = '46px';
    ring.style.height = '46px';
    ring.classList.remove('show'); void ring.offsetWidth; ring.classList.add('show');
  }

  // ---- 自动点击：移动光标 → 点击 → 执行回调 ----
  // 在背包 DOM 中找到某物品对应的元素
  function findBagItemEl(itemId) {
    const grid = document.getElementById('bagGrid');
    if (!grid) return null;
    // 背包项 onclick="useItem('id')"
    for (const el of grid.children) {
      const oc = el.getAttribute && el.getAttribute('onclick');
      if (oc && oc.includes(itemId)) return el;
    }
    return null;
  }

  function showAutoTap(el, label, onClick) {
    if (!el) return;
    // 不显示提示文字（仅保留光标移动与点击动画）

    // 移动 → 点击 → 执行
    return moveCursorTo(el, 140).then(() => {
      cursorClick();
      try { Sound.click(); } catch (e) { /* ignore */ }
      if (onClick) setTimeout(onClick, 110);
    });
  }

  // ---- 自动战斗 / 自动推进 ----
  let autoActing = false;   // 防重入锁

  function toggleAuto() {
    if (autoTimer) {
      clearInterval(autoTimer); autoTimer = null;
      G.autoBattle = false;
      autoActing = false;
      hideAutoCursor();
      document.body.classList.remove('auto-mode');
      toast('自动战斗：关闭');
    } else {
      G.autoBattle = true;
      autoActing = false;
      document.body.classList.add('auto-mode');
      toast('自动战斗：开启（鼠标自动操作）', '#55ffa0');
      autoTimer = setInterval(autoTick, 400);
    }
    const btn = document.getElementById('autoBtn');
    if (btn) btn.classList.toggle('active', G.autoBattle);
  }

  function autoTick() {
    if (!G || !G.autoBattle) return;
    // 上一次动作还没完成 → 跳过本次
    if (autoActing) return;

    // 1) 结算弹窗 → 优先去商店，其次进入下一关
    const resultModal = document.getElementById('resultModal');
    if (resultModal && resultModal.classList.contains('show')) {
      // 若有「跳过」按钮且可见 → 优先点它（避免卡关）
      const skipBtn = document.getElementById('rSkipBtn');
      if (skipBtn && skipBtn.style.display !== 'none' && skipBtn.offsetParent !== null) {
        autoDo(skipBtn, '自动：跳过本关', () => skipBtn.click());
        return;
      }
      // 优先去商店（可见且可点）
      const shopBtn = document.getElementById('rShopBtn');
      if (shopBtn && shopBtn.style.display !== 'none' && shopBtn.offsetParent !== null) {
        // 结算停留超时兜底：超过 5 秒直接进下一关
        if (!G._resultOpenedAt) G._resultOpenedAt = Date.now();
        if (Date.now() - G._resultOpenedAt > 5000) {
          G._resultOpenedAt = null;
          G._bagDoneRound = null;
          const b2 = document.getElementById('rBtn');
          if (b2 && !b2.disabled) autoDo(b2, '自动：进入下一关（超时）', () => b2.click());
          return;
        }
        // ---- 每局先开一次背包（装备/用物品），再进商店 ----
        // 若「自动开背包」已关闭 → 跳过背包环节
        if (autoBagEnabled()) {
          const roundKey = G.stageIndex + ':' + G.round;
          if (G._bagDoneRound !== roundKey) {
            G._bagDoneRound = roundKey;
            Sound.click();
            openBag();
            return;
          }
        }
        // 若「自动进商店」已关闭 → 直接进下一关
        if (!autoShopEnabled()) {
          G._resultOpenedAt = null;
          const b3 = document.getElementById('rBtn');
          if (b3 && !b3.disabled) autoDo(b3, '自动：进入下一关', () => b3.click());
          return;
        }
        autoDo(shopBtn, '自动：前往商店', () => shopBtn.click());
        return;
      }
      const btn = document.getElementById('rBtn');
      if (btn && !btn.disabled) {
        autoDo(btn, '自动：进入下一关', () => btn.click());
        return;
      }
      // 弹窗开着但没按钮可点 → 强制关闭并继续（防卡死）
      if (!btn || btn.disabled) {
        resultModal.classList.remove('show');
        log('⚠ 结算弹窗异常，自动关闭', 'sys');
      }
      return;
    }

    // 2) 背包 → 自动装备/使用物品，然后关闭
    const bagModal = document.getElementById('bagModal');
    if (bagModal && bagModal.classList.contains('show')) {
      // 背包停留超时兜底
      if (!G._bagOpenedAt) G._bagOpenedAt = Date.now();
      if (Date.now() - G._bagOpenedAt > 5000) {
        G._bagOpenedAt = null;
        G._bagStep = 0;
        const cb = document.getElementById('bagCloseBtn');
        if (cb) autoDo(cb, '自动：关闭背包（超时）', () => cb.click());
        return;
      }
      // 逐步处理：先装备，再吃药，然后关闭
      G._bagStep = (G._bagStep || 0);
      if (G._bagStep < 3) {
        G._bagStep++;
        // 找到本次要操作的目标，先显示提示
        const p = G.player;
        if (G._bagStep === 1) {
          // 找要装备的候选
          const eq = p.bag.filter(i => i.kind === 'equip').find(it => {
            const cur = p.equip[it.slot];
            return !cur || it.value > cur.value;
          });
          if (eq) {
            showAutoTap(findBagItemEl(eq.id) || bagModal, `自动：装备${eq.name}`, () => {
              autoUseBag(1);
              renderBag();
            });
            autoActing = true;
            setTimeout(() => { autoActing = false; }, 600);
            return;
          }
        } else if (G._bagStep === 2) {
          // 找要用的消耗品
          const cons = p.bag.find(i => i.kind === 'consume' && (
            (i.key === 'potion' && p.hp < p.maxHp * 0.6) ||
            (i.key === 'ether' && p.mp < p.maxMp * 0.4)
          ));
          if (cons) {
            showAutoTap(findBagItemEl(cons.id) || bagModal, `自动：使用${cons.name}`, () => {
              autoUseBag(2);
              renderBag();
            });
            autoActing = true;
            setTimeout(() => { autoActing = false; }, 600);
            return;
          }
        }
        return;  // 本步无目标，下个 tick 进下一步
      }
      // 完成 → 关闭背包
      G._bagStep = 0;
      G._bagOpenedAt = null;
      const cb = document.getElementById('bagCloseBtn');
      if (cb) autoDo(cb, '自动：关闭背包', () => cb.click());
      return;
    } else {
      G._bagOpenedAt = null;
      G._bagStep = 0;
    }

    // 3) 商店 → 必须先购买，再自动继续
    const shopModal = document.getElementById('shopModal');
    if (shopModal && shopModal.classList.contains('show')) {
      // 初始化本次进店状态
      if (!G._shopOpenedAt) {
        G._shopOpenedAt = Date.now();
        G._shopBuyCount = 0;        // 本次已购买数
        G._shopTries = 0;           // 尝试次数
      }
      G._shopTries = (G._shopTries || 0) + 1;

      // 自动买一件（最多 3 件）
      const bought = (typeof Shop !== 'undefined' && Shop.autoBuyOne && Shop.autoBuyOne());
      if (bought) {
        G._shopBuyCount = (G._shopBuyCount || 0) + 1;
        return;  // 继续买下一件
      }

      // 未买到任何东西：先多尝试几次（可能是暂未刷新/金币不足）
      const boughtEnough = (G._shopBuyCount || 0) > 0;
      const tryEnough = G._shopTries > 8;
      const timeEnough = Date.now() - G._shopOpenedAt > 7000;

      // 只有买到了 或 确实买不到（尝试够多/超时） 才能离开
      if (boughtEnough || tryEnough || timeEnough) {
        G._shopOpenedAt = null;
        G._shopTries = 0;
        const btn = document.getElementById('shopContinueBtn');
        if (btn) autoDo(btn, '自动：继续冒险', () => btn.click());
      }
      return;
    } else {
      G._shopOpenedAt = null;
      G._shopTries = 0;
      G._shopBuyCount = 0;
    }

    // 3) 战斗中操作
    if (G.busy || G.over) return;
    const p = G.player, e = G.enemy;
    const hpPct = p.hp / p.maxHp;
    const ehpPct = e.hp / e.maxHp;

    const btn = {
      attack: document.querySelector('.act-btn.atk'),
      skill:  document.getElementById('btnSkill'),
      skill2: document.getElementById('btnSkill2'),
      heal:   document.getElementById('btnHeal'),
      poison: document.getElementById('btnPoison'),
      defend: document.querySelector('.act-btn.def')
    };
    const tipMap = {
      attack: '自动：攻击', skill: '自动：烈焰斩', skill2: '自动：冰霜箭',
      heal: '自动：治疗', poison: '自动：剧毒', defend: '自动：防御'
    };
    const ready  = k => p.cds[k] === 0 && p.mp >= (SKILLS[k] ? SKILLS[k].mp : 0);
    const hasStat = (key) => e.statuses && e.statuses.some(s => s.key === key);

    // ---- 构建候选技能及权重 ----
    const pool = [];
    const add = (act, w) => { if (w > 0) pool.push({ act, w }); };

    // 普通攻击：永远可用，基础权重
    add('attack', 30);

    // 治疗：仅血量低于 70% 时考虑，越低越优先
    if (p.hp < p.maxHp && ready('heal')) {
      let w = hpPct < 0.3 ? 70 : hpPct < 0.5 ? 30 : 8;
      add('heal', w);
    }

    // 剧毒：敌人未中毒时权重高（后续回合低）
    if (ready('poison') && ehpPct > 0.15) {
      add('poison', hasStat('poison') ? 6 : 45);
    }

    // 烈焰斩：高伤害主技能
    if (ready('skill')) {
      let w = 45;
      if (!hasStat('burn')) w += 15;         // 未灼烧时更愿意用
      if (e.isBoss) w += 10;                  // Boss 战更积极
      if (p.mp > p.maxMp * 0.6) w += 12;      // 蓝多时放心用
      add('skill', w);
    }

    // 冰霜箭：低耗技能
    if (ready('skill2')) {
      let w = 30;
      if (e.isBoss) w += 20;                  // Boss 减速价值高
      if (!hasStat('slow') && e.isBoss) w += 10;
      if (p.mp < 20) w += 15;                 // 蓝少时更愿意用低耗技能
      add('skill2', w);
    }

    // 防御：缺蓝或低血时考虑
    if (p.mp < 15) add('defend', 40);          // 缺蓝时高优先回蓝
    else if (hpPct < 0.25) add('defend', 25);  // 低血时减伤
    else add('defend', 5);

    // ---- 加权随机抽取 ----
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    let chosen = pool[0].act;
    for (const item of pool) {
      r -= item.w;
      if (r <= 0) { chosen = item.act; break; }
    }

    autoDo(btn[chosen], tipMap[chosen], () => playerAction(chosen));
  }

  // 带防重入锁的自动操作（移动光标 → 点击 → 执行）
  function autoDo(el, label, action) {
    if (!el || autoActing) return;
    autoActing = true;
    showAutoTap(el, label, () => {
      action();
      // 等战斗动作真正结束（G.busy 变 false）再释放锁
      const startT = Date.now();
      const waitDone = () => {
        // 弹窗类操作（背包/商店/结算）不依赖 G.busy
        const isModalAction = label && (label.includes('商店') || label.includes('背包') || label.includes('下一关') || label.includes('跳过') || label.includes('继续'));
        if (isModalAction) {
          setTimeout(() => { autoActing = false; }, 150);
          return;
        }
        // 战斗动作：等 busy 结束
        if ((typeof G === 'undefined' || !G || !G.busy) || Date.now() - startT > 3000) {
          autoActing = false;
        } else {
          setTimeout(waitDone, 120);
        }
      };
      setTimeout(waitDone, 120);
    });
    // 安全超时：避免锁卡死
    setTimeout(() => { if (autoActing) autoActing = false; }, 4000);
  }

  // 隐藏光标
  function hideAutoCursor() {
    if (cursorEl) cursorEl.classList.remove('visible');
    document.body.classList.remove('auto-mode');
    const ring = document.getElementById('autoTapRing');
    const tip = document.getElementById('autoTapTip');
    if (ring) ring.classList.remove('show');
    if (tip) tip.classList.remove('show');
    document.querySelectorAll('.auto-target').forEach(x => x.classList.remove('auto-target'));
  }

  // ==================== 14. 连击数显示优化（浮动累积） ====================
  // 由 game.js 的 showCombo 调用，这里增强显示
  function enhanceCombo(n) {
    let el = document.getElementById('comboCounter');
    if (!el) return;
    el.textContent = 'x' + n;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    // 连击越高颜色越热
    const hue = Math.max(0, 50 - n * 3);
    el.style.background = `linear-gradient(135deg, hsl(${hue},100%,55%), hsl(${Math.max(0,hue-20)},100%,45%))`;
  }

  // ==================== 15. 本地排行榜 ====================
  function recordScore(type, value) {
    try {
      const key = 'dq3d_board_' + type;
      const board = JSON.parse(localStorage.getItem(key) || '[]');
      board.push({ value, at: Date.now() });
      board.sort((a, b) => b.value - a.value);
      localStorage.setItem(key, JSON.stringify(board.slice(0, 10)));
    } catch { /* ignore */ }
  }
  function getBoard(type) {
    try { return JSON.parse(localStorage.getItem('dq3d_board_' + type) || '[]'); }
    catch { return []; }
  }
  function renderBoard() {
    const el = document.getElementById('boardList');
    if (!el) return;
    const floorBoard = getBoard('endless');
    const stageBoard = getBoard('stage');
    let html = '<div class="board-section"><h4>♾️ 无尽层数</h4>';
    html += floorBoard.length
      ? floorBoard.slice(0, 5).map((r, i) => `<div class="board-row"><span>#${i + 1}</span><b>${r.value} 层</b></div>`).join('')
      : '<div class="board-empty">暂无记录</div>';
    html += '</div><div class="board-section"><h4>🏆 最高关卡</h4>';
    html += stageBoard.length
      ? stageBoard.slice(0, 5).map((r, i) => `<div class="board-row"><span>#${i + 1}</span><b>第 ${r.value} 关</b></div>`).join('')
      : '<div class="board-empty">暂无记录</div>';
    html += '</div>';
    el.innerHTML = html;
  }

  // ==================== 16. 天气/环境效果 ====================
  let weatherObj = null;
  const WEATHERS = ['none', 'rain', 'snow', 'embers', 'leaves'];
  function setWeather(type) {
    if (!scene) return;
    // 清除旧天气
    if (weatherObj) { scene.remove(weatherObj); weatherObj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); weatherObj = null; }
    if (type === 'none') return;

    const count = type === 'rain' ? 800 : type === 'snow' ? 400 : 300;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 40;
      pos[i*3+1] = Math.random() * 25;
      pos[i*3+2] = (Math.random() - 0.5) * 40;
      vel[i] = 2 + Math.random() * 6;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = { rain: 0x99bbff, snow: 0xffffff, embers: 0xff6622, leaves: 0x88cc44 }[type];
    const size = { rain: 0.08, snow: 0.15, embers: 0.2, leaves: 0.25 }[type];
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.7,
      blending: type === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false
    });
    weatherObj = new THREE.Points(geo, mat);
    weatherObj.userData = { type, vel, count };
    scene.add(weatherObj);
  }
  function updateWeather(dt) {
    if (!weatherObj) return;
    const arr = weatherObj.geometry.attributes.position.array;
    const { type, vel, count } = weatherObj.userData;
    const fall = type === 'rain' ? 25 : type === 'snow' ? 3 : type === 'embers' ? -4 : 2;
    for (let i = 0; i < count; i++) {
      arr[i*3+1] -= vel[i] * dt * (fall / 6);
      if (type === 'leaves' || type === 'embers') arr[i*3] += Math.sin(arr[i*3+1] * 0.5) * dt * 3;
      if (arr[i*3+1] < -1) { arr[i*3+1] = 25; arr[i*3] = (Math.random()-0.5)*40; arr[i*3+2] = (Math.random()-0.5)*40; }
      if (arr[i*3+1] > 26) arr[i*3+1] = 0;
    }
    weatherObj.geometry.attributes.position.needsUpdate = true;
  }

  // ==================== 17. 武器附魔 ====================
  const ENCHANTS = [
    { id: 'fire',    name: '火焰附魔', icon: '🔥', cost: 200, desc: '攻击附带 15% 火焰伤害' },
    { id: 'ice',     name: '寒冰附魔', icon: '❄️', cost: 200, desc: '攻击有 25% 概率冻结敌人' },
    { id: 'light',   name: '雷电附魔', icon: '⚡', cost: 250, desc: '攻击有 20% 概率眩晕' },
    { id: 'vamp',    name: '吸血附魔', icon: '🩸', cost: 300, desc: '攻击吸取 15% 伤害' }
  ];
  function enchantWeapon(id) {
    const e = ENCHANTS.find(x => x.id === id);
    if (!e) return;
    const weapon = G.player.equip.weapon;
    if (!weapon) { toast('需要先装备武器'); Sound.error(); return; }
    if (G.player.gold < e.cost) { toast('金币不足'); Sound.error(); return; }
    G.player.gold -= e.cost;
    weapon.enchant = id;
    Sound.item();
    toast(`附魔成功：${e.name}`, '#ffcc55');
    log(`✨ 武器附加了【${e.name}】：${e.desc}`, 'sys');
    saveGame(); renderEnchantPanel(); render();
  }
  function getWeaponEnchant() {
    const w = G.player.equip.weapon;
    return w && w.enchant ? ENCHANTS.find(e => e.id === w.enchant) : null;
  }

  // ==================== 18. 暴击特写（慢动作 + 镜头） ====================
  function critCinematic() {
    const el = document.getElementById('critFlash');
    if (el) {
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
    // 临时降低战斗速度
    const prev = G.battleSpeed || 1;
    G.battleSpeed = 0.5;
    setTimeout(() => { G.battleSpeed = prev; }, 500);
  }

  // ==================== 19. 怪物图鉴 ====================
  const BESTIARY = [
    { type: 'slime',    name: '史莱姆',  icon: '🟢', desc: '最常见的低级魔物，以数量取胜。' },
    { type: 'goblin',   name: '哥布林',  icon: '👺', desc: '狡诈的类人生物，善于使用武器。' },
    { type: 'skeleton', name: '亡灵法师',icon: '💀', desc: '不死的施法者，掌握黑暗魔法。' },
    { type: 'dragon',   name: '巨龙',    icon: '🐲', desc: '强大的远古生物，吐息可熔化一切。' },
    { type: 'darklord', name: '暗黑魔王',icon: '👹', desc: '终极的邪恶存在，统御深渊。' }
  ];
  function renderBestiary() {
    const el = document.getElementById('bestiaryList');
    if (!el) return;
    const seen = G.player.bestiary || [];
    el.innerHTML = BESTIARY.map(b => {
      const known = seen.includes(b.type);
      const defeated = (G.player.bestiaryDefeated || []).includes(b.type);
      return `<div class="best-item ${known ? 'known' : 'unknown'}">
        <div class="best-icon">${known ? b.icon : '❓'}</div>
        <div class="best-info">
          <div class="best-name">${known ? b.name : '未知魔物'} ${defeated ? '<span class="best-tag">已讨伐</span>' : ''}</div>
          <div class="best-desc">${known ? b.desc : '尚未遭遇'}</div>
        </div>
      </div>`;
    }).join('');
  }
  function recordBestiary(type) {
    if (!G.player.bestiary) G.player.bestiary = [];
    if (!G.player.bestiary.includes(type)) { G.player.bestiary.push(type); saveGame(); }
  }
  function recordBestiaryDefeat(type) {
    if (!G.player.bestiaryDefeated) G.player.bestiaryDefeated = [];
    if (!G.player.bestiaryDefeated.includes(type)) { G.player.bestiaryDefeated.push(type); saveGame(); }
  }

  // ==================== 20. 一键扫荡 ====================
  const SWEEP_MAX = 50;   // 每次最多扫荡 50 关
  async function sweepStages(count) {
    if (!G || G.over || G.busy) return;
    const start = G.stageIndex + 1;
    const clearBefore = G.stageIndex;   // 已通过的关卡数（0-based，表示已过 0..clearBefore-1）
    // 扫荡：只能扫荡"已通关的关卡之前"的关卡
    // 简化规则：扫荡当前关之前的 N 关，快速获得奖励
    const p = G.player;
    let totalGold = 0, totalExp = 0, swept = 0;
    const from = Math.max(0, start - count);
    for (let i = from; i < start; i++) {
      const st = STAGES[i];
      if (!st) continue;
      // 扫荡只给 60% 奖励
      totalGold += Math.round(st.gold * 0.6);
      totalExp += Math.round(st.exp * 0.6);
      swept++;
    }
    if (swept === 0) { toast('没有可扫荡的关卡'); Sound.error(); return; }
    p.gold += totalGold;
    if (typeof gainExp === 'function') gainExp(totalExp);
    goldRain(totalGold);
    Sound.levelUp();
    log(`⚡ 一键扫荡 ${swept} 关！获得 ${totalGold} 金币、${totalExp} 经验。`, 'exp');
    toast(`扫荡完成 +${totalGold}💰 +${totalExp}EXP`, '#ffcc55');
    saveGame(); render();
  }

  // ==================== UI 辅助 ====================
  function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); }
  function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }
  function openMenu() { updateToggleBtns(); openModal('menuModal'); }
  function openSkillTree() { renderSkillTree(); openModal('skillTreeModal'); }
  function openPetPanel() { renderPetPanel(); openModal('petModal'); }
  function openAchievements() { renderAchievements(); openModal('achievementModal'); }
  function openBoard() { renderBoard(); openModal('boardModal'); }
  function openBestiary() { renderBestiary(); openModal('bestiaryModal'); }
  function openSlots() { renderSlots(); openModal('slotModal'); }
  function openEnchant() { renderEnchantPanel(); openModal('enchantModal'); }

  function renderSkillTree() {
    const el = document.getElementById('skillTreeList');
    if (!el) return;
    const pts = skillPoints();
    document.getElementById('skillPoints').textContent = pts;

    // 技能威力总览（随等级成长）
    const lv = G.player.lv;
    const pow = (k) => {
      const sk = SKILLS[k];
      const b = 1 + (sk.growth || 0) * (lv - 1);
      if (k === 'heal') return `回 ${Math.round(sk.heal * b)}`;
      if (k === 'attack') return `${(sk.mult * b).toFixed(2)}×`;
      return `${(sk.mult * b).toFixed(2)}×`;
    };
    const overview = `
      <div class="skill-overview">
        <div class="so-title">等级 Lv.${lv} 技能威力（随等级成长）</div>
        <div class="so-grid">
          <span>🗡 攻击 <b>${pow('attack')}</b></span>
          <span>🔥 烈焰斩 <b>${pow('skill')}</b></span>
          <span>❄️ 冰霜箭 <b>${pow('skill2')}</b></span>
          <span>💚 治疗 <b>${pow('heal')}</b></span>
          <span>☠️ 剧毒 <b>${pow('poison')}</b></span>
        </div>
      </div>`;

    el.innerHTML = overview + SKILL_TREE.map(s => {
      const learned = hasSkill(s.id);
      const canLearn = !learned && (!s.req || hasSkill(s.req)) && pts >= s.cost;
      return `<div class="skill-node ${learned ? 'learned' : canLearn ? 'available' : 'locked'}"
                   onclick="${learned ? '' : `Features.learnSkill('${s.id}')`}">
        <div class="skill-icon">${s.icon}</div>
        <div class="skill-info">
          <div class="skill-name">${s.name}</div>
          <div class="skill-desc">${s.desc}</div>
        </div>
        <div class="skill-cost">${learned ? '✓' : s.cost + 'pt'}</div>
      </div>`;
    }).join('');
  }

  function renderPetPanel() {
    const el = document.getElementById('petList');
    if (!el) return;
    el.innerHTML = PETS.map(p => {
      const owned = hasPet(p.id);
      const active = activePet() === p.id;
      return `<div class="pet-card ${owned ? 'owned' : ''} ${active ? 'active' : ''}"
                   onclick="${owned ? `Features.setActivePet('${p.id}')` : `Features.buyPet('${p.id}')`}">
        <div class="pet-icon">${p.icon}</div>
        <div class="pet-name">${p.name}</div>
        <div class="pet-desc">${p.desc}</div>
        <div class="pet-cost">${owned ? (active ? '出战中' : '已拥有') : `💰 ${p.cost}`}</div>
      </div>`;
    }).join('');
  }

  function renderEnchantPanel() {
    const el = document.getElementById('enchantList');
    if (!el) return;
    const weapon = G.player.equip.weapon;
    const cur = getWeaponEnchant();
    el.innerHTML = `
      <div class="enchant-current">
        当前武器：<b>${weapon ? weapon.name : '未装备'}</b>
        ${cur ? `<span class="enchant-tag">${cur.icon} ${cur.name}</span>` : ''}
      </div>
      ${ENCHANTS.map(e => `
        <div class="enchant-item ${cur && cur.id === e.id ? 'active' : ''}"
             onclick="Features.enchantWeapon('${e.id}')">
          <div class="enchant-icon">${e.icon}</div>
          <div class="enchant-info">
            <div class="enchant-name">${e.name}</div>
            <div class="enchant-desc">${e.desc}</div>
          </div>
          <div class="enchant-cost">💰 ${e.cost}</div>
        </div>`).join('')}`;
  }

  function renderSlots() {
    const el = document.getElementById('slotList');
    if (!el) return;
    el.innerHTML = [1, 2, 3].map(slot => {
      const info = slotInfo(slot);
      return `<div class="slot-card">
        <div class="slot-header">存档位 ${slot}</div>
        <div class="slot-info">${info ? `第 ${info.stage} 关 · Lv.${info.lv} · ${info.gold}💰` : '空'}</div>
        <div class="slot-actions">
          <button class="slot-btn save" onclick="Features.saveToSlot(${slot})">保存</button>
          <button class="slot-btn load" onclick="Features.loadFromSlot(${slot})" ${info ? '' : 'disabled'}>读取</button>
        </div>
      </div>`;
    }).join('');
  }

  // ==================== 自动进商店/背包 开关 ====================
  // 默认开启
  function toggleAutoShop() {
    if (!G) return;
    G.autoShop = G.autoShop === false ? true : false;
    updateToggleBtns();
    Sound.click();
    toast(G.autoShop ? '自动进商店：开启' : '自动进商店：关闭', G.autoShop ? '#55ffa0' : '#ff8866');
    saveGame();
  }
  function toggleAutoBag() {
    if (!G) return;
    G.autoBag = G.autoBag === false ? true : false;
    updateToggleBtns();
    Sound.click();
    toast(G.autoBag ? '自动开背包：开启' : '自动开背包：关闭', G.autoBag ? '#55ffa0' : '#ff8866');
    saveGame();
  }
  // 更新菜单按钮上的开/关状态
  function updateToggleBtns() {
    if (!G) return;
    const shopOn = G.autoShop !== false;
    const bagOn = G.autoBag !== false;
    const sBtn = document.getElementById('toggleShopBtn');
    const bBtn = document.getElementById('toggleBagBtn');
    if (sBtn) { sBtn.classList.toggle('off', !shopOn); sBtn.innerHTML = `<span>🏪</span>自动进商店 ${shopOn ? '✓' : '✕'}`; }
    if (bBtn) { bBtn.classList.toggle('off', !bagOn); bBtn.innerHTML = `<span>🎒</span>自动开背包 ${bagOn ? '✓' : '✕'}`; }
  }
  function autoShopEnabled() { return G && G.autoShop !== false; }
  function autoBagEnabled() { return G && G.autoBag !== false; }

  // ==================== 一键升级到 Lv209 ====================
  function levelTo209() {
    if (!G) return;
    const p = G.player;
    const target = 209;
    if (p.lv >= target) { toast('已是 Lv209 或更高'); return; }

    closeModal('menuModal');
    Sound.levelUp();
    log(`⬆ 直接将等级提升到 Lv.${target}（共 +${target - p.lv} 级）`, 'sys');

    // 逐级应用升级增益（与 gainExp 一致的公式）
    let guard = 0;
    while (p.lv < target && guard++ < 1000) {
      p.lv++;
      const k = 1 + p.lv * 0.05;
      p.maxHp += Math.round(25 * k);
      p.maxMp += Math.round(6 * k);
      p.atk += Math.round(4 * k);
      p.def += Math.round(2.5 * k);
      p.expNext = Math.round(50 + Math.pow(p.lv, 1.6) * 18);
    }
    // 清空经验条
    p.exp = 0;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.statuses = [];

    // 同步技能基础属性（技能树加成）
    if (typeof Features !== 'undefined' && Features.syncBaseStats) Features.syncBaseStats();
    if (typeof Features !== 'undefined' && Features.applySkills) Features.applySkills();
    p.hp = p.maxHp;
    p.mp = p.maxMp;

    // 成就
    if (typeof Features !== 'undefined' && Features.unlockAchievement) {
      Features.unlockAchievement('lv10');
      Features.unlockAchievement('lv50');
    }

    // 等级提升后，当前怪物血量按新血量重算
    if (typeof buildStage === 'function' && G.stageIndex != null) {
      buildStage(G.stageIndex);
    } else {
      render();
    }
    Sound.levelUp();
    toast(`⬆ 已升至 Lv.${target}！`, '#ffcc55');
    log(`⭐ 等级提升完成！当前 Lv.${p.lv}，生命 ${p.maxHp}，攻击 ${p.atk}，防御 ${p.def}`, 'sys');
    saveGame();
    render();
  }

  // ==================== Boss 挑战（10000 血，跳过 100 关）====================
  function startBossChallenge() {
    if (!G) return;
    if (G.bossChallenge) { toast('已在 Boss 挑战中'); return; }

    closeModal('menuModal');
    Sound.click();

    // 备份当前状态（失败可恢复）
    G._bossBackup = {
      stageIndex: G.stageIndex,
      enemy: G.enemy,
      enemyModel: (typeof enemyModel !== 'undefined') ? enemyModel : null
    };
    G.bossChallenge = true;

    // 生成 Boss（血量 = 玩家当前最大生命 × 10）
    const p = G.player;
    const bossHp = Math.max(10000, Math.round(p.maxHp * 10));
    G.enemy = {
      name: '👑 百关守护者',
      type: 'darklord',
      avatar: '👑',
      lv: Math.max(10, p.lv + 5),
      hp: bossHp, maxHp: bossHp,
      atk: Math.round(p.atk * 0.8 + 20),
      def: Math.round(p.def * 1.2 + 5),
      exp: 0, gold: 0,
      isBoss: true, isMiniBoss: false, isElite: false,
      special: (typeof SPECIALS !== 'undefined') ? Object.assign({}, SPECIALS.abyssGaze, { pool: [SPECIALS.abyssGaze, SPECIALS.divineWrath, SPECIALS.meteor] }) : null,
      statuses: [], defending: false, cds: {}
    };

    // 构建 3D 模型
    if (typeof enemyModel !== 'undefined' && enemyModel && typeof scene !== 'undefined') {
      scene.remove(enemyModel);
      if (typeof disposeObject === 'function') disposeObject(enemyModel);
    }
    if (typeof Models !== 'undefined' && typeof scene !== 'undefined') {
      const v = Models.createVariant('darklord', 9999);
      enemyModel = Models.create('darklord', { variant: v });
      enemyModel.position.copy(enemyPos);
      enemyModel.userData._deathT = 0;
      scene.add(enemyModel);
    }

    // 重置战斗状态
    G.round = 1;
    G.over = false;
    G.busy = false;
    G.combo = 0;
    G.maxCombo = 0;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.statuses = [];
    p.cds = { skill: 0, skill2: 0, heal: 0, poison: 0 };

    // 更新 UI
    const info = document.getElementById('stageInfo');
    if (info) info.innerHTML = `👑 Boss挑战 · ${bossHp} HP`;
    log(`—— 挑战【百关守护者】${bossHp} HP ——`, 'sys');
    log('💡 击败它可直接跳过 100 关！', 'sys');
    render();
    Sound.cast();
  }

  // 处理 Boss 挑战胜利
  function onBossChallengeWin() {
    if (!G || !G.bossChallenge) return false;
    G.bossChallenge = false;
    G._bossBackup = null;

    const p = G.player;

    // ---- 奖励 1：升 10 级所需的经验 ----
    // 按当前公式逐级累加接下来的 10 级所需经验
    let totalExp = p.expNext - p.exp;   // 当前还差多少升级
    let simLv = p.lv;
    for (let i = 1; i < 10; i++) {
      simLv++;
      totalExp += Math.round(50 + Math.pow(simLv, 1.6) * 18);
    }
    if (typeof gainExp === 'function') {
      gainExp(totalExp);
    } else {
      p.exp += totalExp;
    }
    log(`⭐ 击败守护者，获得 <b>${totalExp}</b> 点经验（相当于 10 级）！`, 'exp');
    toast(`⭐ +${totalExp} EXP（升10级）`, '#d4a8ff');

    // ---- 奖励 2：跳过 100 关 ----
    const jump = 100;
    const target = Math.min(STAGES.length - 1, G.stageIndex + jump);
    const actualJump = target - G.stageIndex;
    log(`🎉 击败百关守护者！跳过 ${actualJump} 关！`, 'sys');
    toast(`👑 跳过 ${actualJump} 关！`, '#ffcc55');
    try { Features.recordScore('stage', target + 1); } catch (e) { /* ignore */ }

    // 进入目标关卡
    if (typeof buildStage === 'function') {
      buildStage(target);
    }
    G.busy = false;
    render();
    if (typeof saveGame === 'function') saveGame();
    return true;
  }

  function init() {
    // 天气在关卡切换时由 game.js 调用
  }

  return {
    init,
    // 1
    goldRain,
    // 2
    enhanceItem, enhanceCost, enhanceChance, MAX_ENHANCE,
    // 3
    SKILL_TREE, skillPoints, learnSkill, hasSkill, applySkills, syncBaseStats, openSkillTree,
    // 4
    PETS, buyPet, setActivePet, hasPet, activePet, openPetPanel,
    // 5
    startEndless, buildEndlessFloor, onEndlessClear,
    // 6
    HEROES, chooseHero,
    // 7
    shopRefresh,
    // 8
    cycleSpeed,
    // 9
    tryFlee,
    // 10
    saveToSlot, loadFromSlot, openSlots,
    // 11
    ACHIEVEMENTS, unlockAchievement, hasAchievement, openAchievements, trackKill, trackCrit,
    // 12
    checkStreak,
    // 13
    toggleAuto, autoTick, showAutoTap, hideAutoCursor, autoDo,
    // 14
    enhanceCombo,
    // 15
    recordScore, getBoard, openBoard,
    // 16
    setWeather, updateWeather,
    // 17
    ENCHANTS, enchantWeapon, getWeaponEnchant, openEnchant,
    // 18
    critCinematic,
    // 19
    BESTIARY, renderBestiary, recordBestiary, recordBestiaryDefeat, openBestiary,
    // 20
    sweepStages,
    // UI
    openModal, closeModal, openMenu,
    // Boss 挑战
    startBossChallenge, onBossChallengeWin,
    // 自动商店/背包开关
    toggleAutoShop, toggleAutoBag, updateToggleBtns, autoShopEnabled, autoBagEnabled
  };
})();
