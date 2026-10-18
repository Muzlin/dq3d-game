/* ============================================================
   商店系统 - 购买 / 出售 装备与消耗品
   依赖：game.js 中的 RARITY / EQUIP_TEMPLATES / CONSUMABLES / makeItem / makeConsumable
   ============================================================ */

const Shop = (() => {
  let currentStock = [];     // 当前商店库存（全量装备目录）
  let view = 'buy';          // buy | sell
  let category = 'all';      // all | weapon | armor | acc | consume

  // ---------- 价格计算 ----------
  const RARITY_MULT = { common: 1.0, good: 1.7, rare: 2.8, epic: 5.0 };

  function buyPrice(item) {
    if (item.kind === 'consume') {
      return { potion: 25, ether: 35, elixir: 90 }[item.key] || 30;
    }
    // 装备：基础价格 * 稀有度系数 + 数值加成
    const base = 30 + item.value * 4;
    return Math.round(base * (RARITY_MULT[item.rarity] || 1));
  }

  function sellPrice(item) {
    return Math.max(5, Math.round(buyPrice(item) * 0.45));
  }

  // ---------- 生成库存：包含全部 100 件装备 ----------
  // 商店常驻所有装备，玩家可自由选购；价格由装备层级/数值决定
  let fullCatalogCache = null;

  function generateStock(stageIndex) {
    // 全量目录只生成一次（价格基于装备自身，不随关卡变化）
    if (!fullCatalogCache) {
      fullCatalogCache = EQUIP_DB.map(equip => {
        // 商店固定出售「稀有」品质（蓝色），价格适中
        const item = makeItem(equip, 'rare', 0);
        // 重新用固定公式定价（不依赖关卡等级）
        const tierBase = equip.tier * 3.2;
        item.value = Math.max(1, Math.round(tierBase * RARITY.rare.mult));
        const statName = item.stat === 'both' ? '攻防' : item.stat === 'atk' ? '攻击' : '防御';
        item.desc = `${statName} +${item.value}`;
        // 商店价 = 数值 * 系数 + 基础价（前期也能买得起）
        item.price = Math.round(20 + item.value * 2.2);
        return item;
      });
    }

    // 深拷贝一份（避免买卖修改原目录）
    const stock = fullCatalogCache.map(it => Object.assign({}, it, { id: 'shop_' + it.name }));

    // 消耗品（不限量）
    stock.push(makeConsumable('potion', 99));
    stock.push(makeConsumable('ether', 99));
    stock.push(makeConsumable('elixir', 99));

    // 标记价格（消耗品）
    stock.forEach(it => {
      if (it.kind === 'consume' && !it.price) it.price = buyPrice(it);
    });
    return stock;
  }

  // ---------- 打开商店 ----------
  function open(stageIndex) {
    currentStock = generateStock(stageIndex);
    view = 'buy';
    resetAutoBuy();   // 重置自动购买计数
    document.getElementById('shopModal').classList.add('show');
    Sound.resume();
    try { Sound.shopOpen(); } catch (e) { /* 音效失败不影响商店 */ }
    render();
  }

  function close() {
    // 内部关闭（无动画回调）——保留供代码调用
    document.getElementById('shopModal').classList.remove('show');
    saveGame();
  }

  // 底部主按钮：根据进入商店的来源决定去向
  function proceed() {
    Sound.click();
    const ret = G && G.shopReturnTo;
    document.getElementById('shopModal').classList.remove('show');
    saveGame();
    if (G) G.shopReturnTo = null;

    if (ret === 'next') {
      // 从结算进入：直接前往下一关（不用 setTimeout，避免后台节流）
      continueToNextStage();
    }
    // ret === 'battle' 或 null：返回战斗（仅关闭弹窗）
  }

  function switchView(v) {
    view = v;
    Sound.click();
    render();
  }

  // 分类筛选
  function setCategory(cat) {
    category = cat;
    Sound.click();
    // 更新按钮高亮
    document.querySelectorAll('#shopFilters .shop-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    render();
  }

  // ---------- 渲染 ----------
  function render() {
    const p = G.player;
    document.getElementById('shopGold').textContent = p.gold;

    // 底部按钮：根据入口决定文案与行为
    const contBtn = document.getElementById('shopContinueBtn');
    if (contBtn) {
      const isNext = G && G.shopReturnTo === 'next';
      contBtn.style.display = 'block';
      contBtn.textContent = isNext ? '前往下一关 →' : '返回战斗 ⚔';
      contBtn.classList.toggle('to-battle', !isNext);
    }

    // Tab 高亮
    document.getElementById('tabBuy').classList.toggle('active', view === 'buy');
    document.getElementById('tabSell').classList.toggle('active', view === 'sell');

    const list = document.getElementById('shopList');
    let items = view === 'buy' ? currentStock : buildSellList();

    // 分类筛选
    if (category !== 'all') {
      items = items.filter(it => {
        if (category === 'consume') return it.kind === 'consume';
        return it.kind === 'equip' && it.slot === category;
      });
    }

    if (!items.length) {
      list.innerHTML = `<div class="shop-empty">${view === 'buy' ? '该分类暂无可购物品' : '没有可出售的物品'}</div>`;
      return;
    }

    list.innerHTML = items.map((it, i) => {
      const r = RARITY[it.rarity] || RARITY.common;
      const price = view === 'buy' ? it.price : sellPrice(it);
      const afford = view === 'buy' ? p.gold >= price : true;
      const countTag = it.kind === 'consume' && it.count > 1 ? `<span class="shop-count">×${it.count}</span>` : '';
      return `
        <div class="shop-item ${r.cls} ${afford ? '' : 'unaffordable'}" style="animation-delay:${i * 0.04}s" onclick="Shop.${view}(${i})">
          <div class="si-icon">${it.icon}${countTag}</div>
          <div class="si-info">
            <div class="si-name" style="color:${r.color}">${it.name}</div>
            <div class="si-desc">${it.kind === 'consume' ? it.desc : it.desc + ' · ' + r.name}</div>
          </div>
          <div class="si-price ${view === 'buy' && !afford ? 'cant' : ''}">
            ${view === 'buy' ? '💰' : '💵'} ${price}
          </div>
        </div>`;
    }).join('');
  }

  function buildSellList() {
    const p = G.player;
    const list = [];
    // 背包中的装备
    p.bag.filter(i => i.kind === 'equip').forEach(i => list.push(i));
    // 已装备的也可卖（会先卸下）
    ['weapon', 'armor', 'acc'].forEach(s => {
      if (p.equip[s]) list.push(Object.assign({}, p.equip[s], { _equipped: s }));
    });
    // 消耗品（可卖）
    p.bag.filter(i => i.kind === 'consume').forEach(i => list.push(i));
    return list;
  }

  // ---------- 购买 ----------
  function buy(index) {
    const item = currentStock[index];
    if (!item) return;
    const p = G.player;

    if (p.gold < item.price) {
      Sound.error();
      toast('金币不足！');
      return;
    }

    p.gold -= item.price;
    Sound.buy();

    // 消耗品堆叠
    if (item.kind === 'consume') {
      const exist = p.bag.find(i => i.kind === 'consume' && i.key === item.key);
      if (exist) exist.count += 1;
      else p.bag.push({ id: 'it' + (itemIdCounter++), kind: 'consume', key: item.key, icon: item.icon, name: item.name, rarity: 'common', desc: item.desc, count: 1 });
    } else {
      // 装备：生成一件全新的（商店常驻，不扣除库存）
      const newItem = makeItem(
        { slot: item.slot, icon: item.icon, name: item.name, tier: item.tier || 1 },
        item.rarity,
        0
      );
      newItem.value = item.value;
      newItem.desc = item.desc;
      p.bag.push(newItem);
    }

    updateBagBadge();
    render();
    saveGame();
  }

  // ---------- 出售 ----------
  function sell(index) {
    const items = buildSellList();
    const item = items[index];
    if (!item) return;
    const p = G.player;
    const price = sellPrice(item);

    if (item._equipped) {
      // 已装备：先卸下
      p.equip[item._equipped] = null;
    } else if (item.kind === 'consume') {
      // 消耗品：减少一个
      const real = p.bag.find(i => i.id === item.id);
      if (real) {
        real.count--;
        if (real.count <= 0) p.bag.splice(p.bag.indexOf(real), 1);
      }
    } else {
      const idx = p.bag.findIndex(i => i.id === item.id);
      if (idx >= 0) p.bag.splice(idx, 1);
    }

    p.gold += price;
    Sound.sell();
    updateBagBadge();
    render();
    saveGame();
  }

  // ---------- 自动购买一件（供自动战斗使用）----------
  // 返回 true 表示买了一件，false 表示无可买/买不起
  let autoBuyCount = 0;        // 本次进店已自动购买数
  let autoBuyShopRef = null;   // 标记当前商店实例（防跨店累计）
  const AUTO_BUY_MAX = 3;      // 每次进店最多自动买 3 件

  function resetAutoBuy() {
    autoBuyCount = 0;
  }

  function autoBuyOne() {
    // 本次进店购买上限
    if (autoBuyCount >= AUTO_BUY_MAX) return false;
    if (view !== 'buy') { view = 'buy'; render(); return false; }
    const p = G.player;

    // ---- 1) 优先买能提升的装备 ----
    const candidates = [];
    currentStock.forEach((it, idx) => {
      if (!it || it.kind !== 'equip') return;
      if (it.price > p.gold) return;
      const cur = p.equip[it.slot];
      if (!cur || cur.value < it.value) candidates.push({ it, idx, prio: !cur ? 0 : 1 });
    });
    if (candidates.length) {
      // 空槽优先，再按数值
      candidates.sort((a, b) => a.prio - b.prio || b.it.value - a.it.value);
      const goldBefore = p.gold;
      buySafely(candidates[0].idx);
      if (p.gold < goldBefore) { autoBuyCount++; return true; }
      return false;
    }

    // ---- 2) 没有好装备 → 买消耗品（保证有东西可买）----
    const consumeIdx = currentStock.findIndex(it => it.kind === 'consume' && it.price <= p.gold);
    if (consumeIdx >= 0) {
      const goldBefore = p.gold;
      buy(consumeIdx);
      if (p.gold < goldBefore) { autoBuyCount++; return true; }
    }
    return false;
  }

  function buySafely(idx) {
    // 确保当前视图是 all（避免分类筛选导致下标错位）
    if (category !== 'all') {
      category = 'all';
      document.querySelectorAll('#shopFilters .shop-filter').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === 'all');
      });
    }
    buy(idx);
    // 购买后自动装备它（若更好）
    const p = G.player;
    const bought = p.bag[p.bag.length - 1];
    if (bought && bought.kind === 'equip') {
      const cur = p.equip[bought.slot];
      if (!cur || cur.value < bought.value) {
        useItem(bought.id);
      }
    }
  }

  return { open, close, switchView, setCategory, buy, sell, render, buyPrice, sellPrice, proceed, autoBuyOne, resetAutoBuy };
})();

// ==================== 小巧提示条 ====================
let toastTimer = null;
function toast(msg, color = '#ff5566') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.color = color;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
