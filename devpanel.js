/* ============================================================
   开发者调试面板 (Dev Console) - 30 个后台功能
   按 ~ 键或从菜单打开
   ============================================================ */

const DevPanel = (() => {
  let visible = false;
  let panelEl = null;

  // ==================== 工具 ====================
  function P() { return (typeof G !== 'undefined' && G) ? G.player : null; }
  function E() { return (typeof G !== 'undefined' && G) ? G.enemy : null; }

  function num(id, def) {
    const v = parseFloat(document.getElementById(id)?.value);
    return Number.isFinite(v) ? v : def;
  }
  function toast2(msg, color) {
    if (typeof toast === 'function') toast(msg, color || '#55ffa0');
    log(`[调试] ${msg}`, 'sys');
  }

  // ==================== 1. 设置等级 ====================
  function setLevel() {
    const p = P(); if (!p) return;
    const lv = Math.max(1, Math.floor(num('dev-lv', p.lv)));
    const old = p.lv;
    if (lv > old) {
      for (let i = old + 1; i <= lv; i++) {
        const k = 1 + i * 0.05;
        p.maxHp += Math.round(25 * k);
        p.maxMp += Math.round(6 * k);
        p.atk += Math.round(4 * k);
        p.def += Math.round(2.5 * k);
      }
    } else if (lv < old) {
      const r = lv / old;
      p.maxHp = Math.max(50, Math.round(p.maxHp * r));
      p.maxMp = Math.max(10, Math.round(p.maxMp * r));
      p.atk = Math.max(5, Math.round(p.atk * r));
      p.def = Math.max(1, Math.round(p.def * r));
    }
    p.lv = lv;
    p.exp = 0;
    p.expNext = Math.round(50 + Math.pow(lv, 1.6) * 18);
    p.hp = p.maxHp; p.mp = p.maxMp;
    toast2(`等级 → Lv.${lv}`);
    refresh();
  }

  // ==================== 2. 设置属性 ====================
  function setStats() {
    const p = P(); if (!p) return;
    if (document.getElementById('dev-hp').value) { p.maxHp = Math.max(1, Math.floor(num('dev-hp', p.maxHp))); p.hp = p.maxHp; }
    if (document.getElementById('dev-mp').value) { p.maxMp = Math.max(1, Math.floor(num('dev-mp', p.maxMp))); p.mp = p.maxMp; }
    if (document.getElementById('dev-atk').value) p.atk = Math.max(1, Math.floor(num('dev-atk', p.atk)));
    if (document.getElementById('dev-def').value) p.def = Math.max(0, Math.floor(num('dev-def', p.def)));
    if (p._baseStats) { p._baseStats = { maxHp: p.maxHp, maxMp: p.maxMp, atk: p.atk, def: p.def }; }
    toast2('属性已应用');
    refresh();
  }

  // ==================== 3. 回满状态 ====================
  function fullHeal() {
    const p = P(); if (!p) return;
    p.hp = p.maxHp; p.mp = p.maxMp; p.statuses = [];
    p.cds = { skill: 0, skill2: 0, heal: 0, poison: 0 };
    toast2('已回满状态');
    refresh();
  }

  // ==================== 4. 设置金币 ====================
  function setGold() {
    const p = P(); if (!p) return;
    p.gold = Math.max(0, Math.floor(num('dev-gold', p.gold)));
    toast2(`金币 → ${p.gold}`);
    refresh();
  }

  // ==================== 5. 加金币 ====================
  function addGold(n) {
    const p = P(); if (!p) return;
    p.gold += n;
    toast2(`金币 +${n}（共 ${p.gold}）`);
    refresh();
  }

  // ==================== 6. 加经验 ====================
  function addExp() {
    const n = Math.floor(num('dev-exp', 1000));
    if (typeof gainExp === 'function') gainExp(n);
    toast2(`经验 +${n}`);
    refresh();
  }

  // ==================== 7. 直接升级（+N级） ====================
  function levelUpN(n) {
    const p = P(); if (!p) return;
    for (let i = 0; i < n; i++) {
      const k = 1 + p.lv * 0.05;
      p.lv++;
      p.maxHp += Math.round(25 * k);
      p.maxMp += Math.round(6 * k);
      p.atk += Math.round(4 * k);
      p.def += Math.round(2.5 * k);
      p.expNext = Math.round(50 + Math.pow(p.lv, 1.6) * 18);
    }
    p.hp = p.maxHp; p.mp = p.maxMp;
    toast2(`升级 +${n} → Lv.${p.lv}`);
    refresh();
  }

  // ==================== 8. 秒杀敌人 ====================
  function killEnemy() {
    const e = E(); if (!e) { toast2('没有敌人'); return; }
    e.hp = 1;
    if (typeof playerAction === 'function' && !G.busy && !G.over) {
      playerAction('attack');
    } else {
      e.hp = 0;
      if (typeof onEnemyDefeated === 'function') onEnemyDefeated();
    }
    toast2('敌人已被削弱到 1 血');
  }

  // ==================== 9. 秒败（测试失败） ====================
  function forceLose() {
    const p = P(); if (!p) return;
    p.hp = 1; p.def = 0;
    if (G.enemy) G.enemy.atk = 999999;
    toast2('已设为残血（下回合必败）');
  }

  // ==================== 10. 跳过当前关卡 ====================
  function skipStage() {
    if (typeof skipStage === 'function') { skipStage(); toast2('已跳过关卡'); }
    else if (typeof buildStage === 'function') { buildStage(Math.min(999, G.stageIndex + 1)); toast2('已跳过'); }
  }

  // ==================== 11. 跳转到指定关卡 ====================
  function gotoStage() {
    const n = Math.max(1, Math.min(1000, Math.floor(num('dev-stage', G.stageIndex + 1))));
    if (typeof buildStage === 'function') buildStage(n - 1);
    toast2(`跳转到第 ${n} 关`);
  }

  // ==================== 12. 给随机装备 ====================
  function giveEquip(rarity) {
    const p = P(); if (!p) return;
    if (typeof makeItem !== 'function' || typeof pickEquip !== 'function') return;
    const item = makeItem(pickEquip(G.stageIndex), rarity || 'epic', G.stageIndex + 20);
    p.bag.push(item);
    if (typeof updateBagBadge === 'function') updateBagBadge();
    toast2(`获得装备：${item.name}`);
    refresh();
  }

  // ==================== 13. 清空背包 ====================
  function clearBag() {
    const p = P(); if (!p) return;
    p.bag = [];
    if (typeof updateBagBadge === 'function') updateBagBadge();
    toast2('背包已清空', '#ff8866');
    refresh();
  }

  // ==================== 14. 全装备（紫装） ====================
  function equipBest() {
    const p = P(); if (!p) return;
    if (typeof makeItem !== 'function') return;
    const slots = ['weapon', 'armor', 'acc'];
    slots.forEach(slot => {
      const tpl = (typeof EQUIP_DB !== 'undefined') ? EQUIP_DB.filter(e => e.slot === slot).pop() : null;
      if (tpl) p.equip[slot] = makeItem(tpl, 'epic', 100);
    });
    toast2('已装备顶级紫装');
    refresh();
  }

  // ==================== 15. 满技能点 ====================
  function maxSkills() {
    const p = P(); if (!p) return;
    p.lv = Math.max(p.lv, 120);
    toast2('等级已提升以满足技能点');
    refresh();
  }

  // ==================== 16. 学会所有技能 ====================
  function learnAllSkills() {
    const p = P(); if (!p) return;
    if (typeof Features === 'undefined' || !Features.SKILL_TREE) return;
    p.skills = Features.SKILL_TREE.map(s => s.id);
    if (Features.applySkills) Features.applySkills();
    toast2('已学会全部技能');
    refresh();
  }

  // ==================== 17. 解锁所有宠物 ====================
  function allPets() {
    const p = P(); if (!p) return;
    if (typeof Features !== 'undefined' && Features.PETS) {
      p.pets = Features.PETS.map(x => x.id);
      p.activePet = p.pets[0];
    }
    toast2('已解锁全部宠物');
    refresh();
  }

  // ==================== 18. 解锁所有成就 ====================
  function allAchievements() {
    const p = P(); if (!p) return;
    if (typeof Features !== 'undefined' && Features.ACHIEVEMENTS) {
      p.achievements = Features.ACHIEVEMENTS.map(a => a.id);
    }
    toast2('已解锁全部成就');
  }

  // ==================== 19. 解锁图鉴 ====================
  function allBestiary() {
    const p = P(); if (!p) return;
    if (typeof Features !== 'undefined' && Features.BESTIARY) {
      p.bestiary = Features.BESTIARY.map(b => b.type);
      p.bestiaryDefeated = Features.BESTIARY.map(b => b.type);
    }
    toast2('图鉴已全解锁');
  }

  // ==================== 20. 无敌模式 ====================
  function toggleGod() {
    if (!G) return;
    G._godMode = !G._godMode;
    toast2(G._godMode ? '无敌模式 ON' : '无敌模式 OFF', G._godMode ? '#ffcc55' : '#8888aa');
    refresh();
  }

  // ==================== 21. 一击必杀 ====================
  function toggleOneHit() {
    if (!G) return;
    G._oneHit = !G._oneHit;
    toast2(G._oneHit ? '一击必杀 ON' : '一击必杀 OFF', G._oneHit ? '#ff5566' : '#8888aa');
    refresh();
  }

  // ==================== 22. 无限法力 ====================
  function toggleInfMp() {
    if (!G) return;
    G._infMp = !G._infMp;
    toast2(G._infMp ? '无限法力 ON' : '无限法力 OFF');
    refresh();
  }

  // ==================== 23. 无冷却 ====================
  function toggleNoCd() {
    if (!G) return;
    G._noCd = !G._noCd;
    toast2(G._noCd ? '无冷却 ON' : '无冷却 OFF');
    refresh();
  }

  // ==================== 24. 必暴击 ====================
  function toggleAlwaysCrit() {
    if (!G) return;
    G._alwaysCrit = !G._alwaysCrit;
    toast2(G._alwaysCrit ? '必暴击 ON' : '必暴击 OFF');
    refresh();
  }

  // ==================== 25. 100% 掉落 ====================
  function toggleGuaranteedDrop() {
    if (!G) return;
    G._guaranteedDrop = !G._guaranteedDrop;
    toast2(G._guaranteedDrop ? '必掉落 ON' : '必掉落 OFF');
    refresh();
  }

  // ==================== 26. 战斗速度 ====================
  function setSpeed() {
    if (!G) return;
    G.battleSpeed = Math.max(0.25, Math.min(10, num('dev-speed', 1)));
    toast2(`战斗速度 ${G.battleSpeed}×`);
    refresh();
  }

  // ==================== 27. 重载存档 ====================
  function reloadSave() {
    if (typeof loadGame === 'function' && loadGame()) toast2('存档已重载');
    else toast2('无存档', '#ff8866');
  }

  // ==================== 28. 导出存档 ====================
  function exportSave() {
    const raw = localStorage.getItem('dq3d_save');
    if (!raw) { toast2('无存档', '#ff8866'); return; }
    const el = document.getElementById('dev-saveout');
    if (el) { el.value = raw; el.select(); }
    // 复制到剪贴板
    try { navigator.clipboard.writeText(raw); toast2('存档已复制到剪贴板'); }
    catch (e) { toast2('已显示在下方文本框'); }
  }

  // ==================== 29. 导入存档 ====================
  function importSave() {
    const el = document.getElementById('dev-savein');
    if (!el || !el.value.trim()) { toast2('请先粘贴存档', '#ff8866'); return; }
    try {
      JSON.parse(el.value);  // 校验
      localStorage.setItem('dq3d_save', el.value.trim());
      toast2('存档已导入，正在重载…');
      setTimeout(() => { if (typeof loadGame === 'function') loadGame(); }, 300);
    } catch (e) {
      toast2('存档格式错误', '#ff8866');
    }
  }

  // ==================== 30. 重置游戏 ====================
  function resetAll() {
    if (!confirm('确定重置所有数据？（不可恢复）')) return;
    localStorage.clear();
    toast2('所有数据已重置', '#ff8866');
    setTimeout(() => location.reload(), 500);
  }

  // ==================== 刷新面板数据 ====================
  function refresh() {
    if (!visible) return;
    const p = P(); if (!p || !panelEl) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('dev-lv', p.lv);
    set('dev-hp', p.maxHp);
    set('dev-mp', p.maxMp);
    set('dev-atk', p.atk);
    set('dev-def', p.def);
    set('dev-gold', p.gold);
    set('dev-stage', G.stageIndex + 1);

    // 状态显示区
    const info = document.getElementById('dev-info');
    if (info) {
      info.innerHTML = `
        <div class="dev-row"><span>等级</span><b>Lv.${p.lv}</b></div>
        <div class="dev-row"><span>生命</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
        <div class="dev-row"><span>法力</span><b>${Math.ceil(p.mp)} / ${p.maxMp}</b></div>
        <div class="dev-row"><span>攻击 / 防御</span><b>${p.atk} / ${p.def}</b></div>
        <div class="dev-row"><span>金币</span><b>${p.gold}</b></div>
        <div class="dev-row"><span>关卡</span><b>第 ${G.stageIndex + 1} 关</b></div>
        <div class="dev-row"><span>敌人</span><b>${G.enemy ? G.enemy.name + ' ' + Math.max(0, Math.ceil(G.enemy.hp)) + '/' + G.enemy.maxHp : '无'}</b></div>
        <div class="dev-row"><span>背包 / 装备</span><b>${p.bag.length} 件</b></div>
        <div class="dev-row"><span>自动战斗</span><b>${G.autoBattle ? '开' : '关'}</b></div>
        <div class="dev-row"><span>跳关次数</span><b>${G.failCounts ? Object.values(G.failCounts).reduce((a,b)=>a+b,0) : 0}</b></div>
        <div class="dev-flags">
          ${G._godMode ? '<span class="flag on">无敌</span>' : ''}
          ${G._oneHit ? '<span class="flag on">一击必杀</span>' : ''}
          ${G._infMp ? '<span class="flag on">无限蓝</span>' : ''}
          ${G._noCd ? '<span class="flag on">无冷却</span>' : ''}
          ${G._alwaysCrit ? '<span class="flag on">必暴击</span>' : ''}
          ${G._guaranteedDrop ? '<span class="flag on">必掉落</span>' : ''}
        </div>`;
    }
    // 更新开关按钮状态
    ['god', 'oneHit', 'infMp', 'noCd', 'alwaysCrit', 'guaranteedDrop'].forEach(k => {
      const btn = document.getElementById('dev-btn-' + k);
      if (btn) btn.classList.toggle('on', !!G['_' + k] || (k==='god'&&G._godMode) || (k==='oneHit'&&G._oneHit) || (k==='infMp'&&G._infMp) || (k==='noCd'&&G._noCd) || (k==='alwaysCrit'&&G._alwaysCrit) || (k==='guaranteedDrop'&&G._guaranteedDrop));
    });
  }

  // ==================== 显示 / 隐藏 ====================
  function open() {
    if (!panelEl) build();
    panelEl.style.display = 'flex';
    visible = true;
    refresh();
    if (typeof Sound !== 'undefined') Sound.click();
  }
  function close() {
    if (panelEl) panelEl.style.display = 'none';
    visible = false;
  }
  function toggle() { visible ? close() : open(); }

  // ==================== 构建面板 ====================
  function build() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'devPanel';
    panelEl.innerHTML = `
      <div class="dev-box">
        <div class="dev-head">
          <h2>🛠 开发者调试面板</h2>
          <span class="dev-sub">30 个后台功能</span>
          <button class="dev-close" onclick="DevPanel.close()">✕</button>
        </div>
        <div class="dev-body">
          <div class="dev-cols">
            <!-- 左列：状态 -->
            <div class="dev-col">
              <h3>📊 实时状态</h3>
              <div id="dev-info" class="dev-info"></div>
              <h3>🎮 快捷操作</h3>
              <div class="dev-actions">
                <button class="dev-btn" onclick="DevPanel.fullHeal()">💚 回满状态</button>
                <button class="dev-btn" onclick="DevPanel.killEnemy()">⚔ 秒杀敌人</button>
                <button class="dev-btn" onclick="DevPanel.forceLose()">💀 测试失败</button>
                <button class="dev-btn" onclick="DevPanel.skipStage()">⏭ 跳过关卡</button>
                <button class="dev-btn" onclick="DevPanel.levelUpN(1)">⬆ +1级</button>
                <button class="dev-btn" onclick="DevPanel.levelUpN(10)">⬆ +10级</button>
              </div>
              <h3>🎁 物品</h3>
              <div class="dev-actions">
                <button class="dev-btn" onclick="DevPanel.giveEquip('rare')">🗡 随机蓝装</button>
                <button class="dev-btn" onclick="DevPanel.giveEquip('epic')">🟣 随机紫装</button>
                <button class="dev-btn" onclick="DevPanel.equipBest()">👑 顶级装备</button>
                <button class="dev-btn" onclick="DevPanel.clearBag()">🗑 清空背包</button>
              </div>
              <h3>🔓 解锁</h3>
              <div class="dev-actions">
                <button class="dev-btn" onclick="DevPanel.learnAllSkills()">🌳 全技能</button>
                <button class="dev-btn" onclick="DevPanel.allPets()">🐾 全宠物</button>
                <button class="dev-btn" onclick="DevPanel.allAchievements()">🏆 全成就</button>
                <button class="dev-btn" onclick="DevPanel.allBestiary()">📖 全图鉴</button>
              </div>
            </div>
            <!-- 右列：作弊开关 + 数值 -->
            <div class="dev-col">
              <h3>⚡ 作弊开关</h3>
              <div class="dev-actions">
                <button class="dev-btn toggle" id="dev-btn-god" onclick="DevPanel.toggleGod()">🛡 无敌模式</button>
                <button class="dev-btn toggle" id="dev-btn-oneHit" onclick="DevPanel.toggleOneHit()">💥 一击必杀</button>
                <button class="dev-btn toggle" id="dev-btn-infMp" onclick="DevPanel.toggleInfMp()">🔵 无限法力</button>
                <button class="dev-btn toggle" id="dev-btn-noCd" onclick="DevPanel.toggleNoCd()">⏱ 无冷却</button>
                <button class="dev-btn toggle" id="dev-btn-alwaysCrit" onclick="DevPanel.toggleAlwaysCrit()">💢 必暴击</button>
                <button class="dev-btn toggle" id="dev-btn-guaranteedDrop" onclick="DevPanel.toggleGuaranteedDrop()">🎁 100%掉落</button>
              </div>
              <h3>📝 数值设置</h3>
              <div class="dev-fields">
                <label>等级 <input type="number" id="dev-lv"><button onclick="DevPanel.setLevel()">应用</button></label>
                <label>生命 <input type="number" id="dev-hp"><button onclick="DevPanel.setStats()">应用</button></label>
                <label>法力 <input type="number" id="dev-mp"></label>
                <label>攻击 <input type="number" id="dev-atk"></label>
                <label>防御 <input type="number" id="dev-def"></label>
                <label>金币 <input type="number" id="dev-gold"><button onclick="DevPanel.setGold()">应用</button></label>
                <label>关卡 <input type="number" id="dev-stage"><button onclick="DevPanel.gotoStage()">跳转</button></label>
                <label>经验 <input type="number" id="dev-exp" value="1000"><button onclick="DevPanel.addExp()">给予</button></label>
                <label>速度 <input type="number" id="dev-speed" value="1" step="0.25"><button onclick="DevPanel.setSpeed()">应用</button></label>
              </div>
              <div class="dev-actions" style="margin-top:8px">
                <button class="dev-btn" onclick="DevPanel.addGold(10000)">💰 +1万金币</button>
                <button class="dev-btn" onclick="DevPanel.addGold(1000000)">💰 +100万金币</button>
              </div>
              <h3>💾 存档</h3>
              <div class="dev-actions">
                <button class="dev-btn" onclick="DevPanel.exportSave()">📤 导出存档</button>
                <button class="dev-btn" onclick="DevPanel.importSave()">📥 导入存档</button>
                <button class="dev-btn" onclick="DevPanel.reloadSave()">🔄 重载存档</button>
                <button class="dev-btn danger" onclick="DevPanel.resetAll()">💣 重置游戏</button>
              </div>
              <textarea id="dev-saveout" class="dev-save" placeholder="导出的存档会显示在这里"></textarea>
              <textarea id="dev-savein" class="dev-save" placeholder="粘贴存档到这里，然后点导入"></textarea>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panelEl);
  }

  // ==================== 初始化（键盘快捷键） ====================
  function init() {
    window.addEventListener('keydown', e => {
      // ~ 键（Semicolon 附近）或 F2 打开
      if (e.key === '`' || e.key === '~' || e.key === 'F2') {
        // 排除输入框内
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggle();
      }
    });
  }

  return {
    init, open, close, toggle, refresh, build,
    setLevel, setStats, fullHeal, setGold, addGold, addExp, levelUpN,
    killEnemy, forceLose, skipStage, gotoStage,
    giveEquip, clearBag, equipBest, maxSkills, learnAllSkills,
    allPets, allAchievements, allBestiary,
    toggleGod, toggleOneHit, toggleInfMp, toggleNoCd, toggleAlwaysCrit, toggleGuaranteedDrop,
    setSpeed, reloadSave, exportSave, importSave, resetAll,
    get visible() { return visible; }
  };
})();
