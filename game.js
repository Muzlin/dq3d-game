/* ============================================================
   勇者斗恶龙 3D - 核心游戏逻辑
   依赖：THREE, Sound, Effects, Models
   ============================================================ */

// ==================== 数据定义 ====================

// 技能表
// 技能表：mult 为基础倍率，growth 为每级伤害成长（玩家等级）
const SKILLS = {
  attack: { name: '攻击',     mp: 0,  cd: 0, mult: 1.0,  growth: 0.035, icon: '🗡' },
  skill:  { name: '烈焰斩',   mp: 15, cd: 3, mult: 2.2,  growth: 0.045, icon: '🔥', effect: 'fire',   status: 'burn' },
  skill2: { name: '冰霜箭',   mp: 10, cd: 2, mult: 1.6,  growth: 0.04,  icon: '❄️', effect: 'ice',    status: 'slow' },
  heal:   { name: '治疗术',   mp: 12, cd: 3, mult: 0,    growth: 0.05,  icon: '💚', effect: 'heal',   heal: 35 },
  poison: { name: '剧毒',     mp: 12, cd: 4, mult: 0.5,  growth: 0.035, icon: '☠️', effect: 'poison', status: 'poison' },
  defend: { name: '防御',     mp: 0,  cd: 0, mult: 0,    growth: 0,     icon: '🛡' }
};

// 计算技能在当前等级下的实际倍率/治疗量
function skillPower(key) {
  const sk = SKILLS[key];
  if (!sk) return { mult: 1 };
  const lv = (G && G.player) ? (G.player.lv || 1) : 1;
  const bonus = 1 + (sk.growth || 0) * (lv - 1);
  return {
    mult: sk.mult * bonus,
    heal: sk.heal ? Math.round(sk.heal * bonus) : 0,
    bonus
  };
}

// 技能描述（含当前等级加成）
function skillDesc(key) {
  const sk = SKILLS[key];
  const p = skillPower(key);
  if (key === 'heal') return `恢复 ${p.heal} 生命`;
  if (key === 'attack') return `倍率 ${(p.mult).toFixed(2)}×`;
  if (key === 'defend') return `减伤 + 回蓝`;
  return `倍率 ${p.mult.toFixed(2)}×（+${((p.bonus-1)*100).toFixed(0)}%）`;
}

// 关卡配置
// ==================== 关卡系统（1000 关程序化生成）====================
const TOTAL_STAGES = 1000;

// 敌人基础模板
// ==================== 怪物图鉴：10 种原型 ====================
const ENEMY_TYPES = [
  { type: 'slime',    avatar: '🟢', family: '史莱姆', names: ['史莱姆','粘液怪','史莱姆王','吞噬者'] },
  { type: 'goblin',   avatar: '👺', family: '哥布林', names: ['哥布林','哥布林战士','哥布林督军','哥布林王'] },
  { type: 'skeleton', avatar: '💀', family: '亡灵',   names: ['骷髅兵','亡灵法师','獗骨祭司','巫妖王'] },
  { type: 'bat',      avatar: '🦇', family: '吸血蝠', names: ['血蝠','厄运夜蝠','影翼恶魔','血祖'] },
  { type: 'spider',   avatar: '🕷', family: '魔蛛',   names: ['洞穴蛛','毒沼蛛后','织网者','缠丝女王'] },
  { type: 'wolf',     avatar: '🐺', family: '魔狼',   names: ['野狼','影狼','霜牙狼王','月嗜魔狼'] },
  { type: 'troll',    avatar: '🧟', family: '巨魔',   names: ['山巨魔','石臂巨魔','嗜血巨魔','远古魔像'] },
  { type: 'wraith',   avatar: '👻', family: '幽魂',   names: ['游魂','怨灵','噬魂者','死神化身'] },
  { type: 'dragon',   avatar: '🐲', family: '巨龙',   names: ['幼龙','炎鳞龙','雷霆古龙','混沌龙王'] },
  { type: 'demon',    avatar: '😈', family: '恶魔',   names: ['小恶魔','炼狱魔卫','深渊领主','终焉之神'] }
];

// ==================== 1000 个独特怪物名生成 ====================
// 前缀 + 核心名 + 后缀，组合出千种不同名字
const NAME_PREFIX = [
  '', '狂暴的', '古老的', '腐化的', '嗜血的', '幽魂', '铁甲', '剧毒的', '寒霜的', '烈焰的',
  '暗影', '黄金', '血腥', '雷鸣', '蛛网的', '诅咒的', '不朽的', '疯狂的', '虚空的', '深渊的',
  '炽热的', '冰封的', '翠绿的', '紫晶的', '沼泽的', '沙漠的', '地狱的', '天界的', '扭曲的', '沉寂的'
];
const NAME_SUFFIX = [
  '', '·幼体', '·成体', '·精英', '·守卫', '·猎手', '·先祖', '·魔化', '·觉醒', '·王者',
  '·灾祸', '·终焉', '·梦魇', '·怒火', '·瘟疫', '·血誓', '·孤月', '·破碎', '·噬星', '·无相'
];

// 确定性伪随机
function nameSeedRand(seed) {
  let x = Math.sin(seed * 91.733 + 17.31) * 43758.5453;
  return x - Math.floor(x);
}

function makeEnemyName(typeIdx, stageIndex) {
  const def = ENEMY_TYPES[typeIdx];
  const tier = Math.min(3, Math.floor(stageIndex / 250));    // 0..3 名阶
  const core = def.names[tier];
  const p = Math.floor(nameSeedRand(stageIndex * 3 + 1) * NAME_PREFIX.length);
  const s = Math.floor(nameSeedRand(stageIndex * 5 + 2) * NAME_SUFFIX.length);
  return NAME_PREFIX[p] + core + NAME_SUFFIX[s];
}

// ==================== 绝招系统 ====================
// 每种绝招：id / 名称 / 图标 / 倍率 / 附带效果 / 特效
const SPECIALS = {
  // ---- 攻击类 ----
  fireBreath:  { id:'fireBreath',  name:'烈焰吐息', icon:'🔥', mult:1.8, status:'burn',   color:0xff5500, desc:'喷射高温火焰，造成伤害并灼烧' },
  iceStorm:    { id:'iceStorm',    name:'冰霜风暴', icon:'❄️', mult:1.6, status:'slow',   color:0x66ccff, desc:'寒冰风暴冻结敌人，减速' },
  venomSpray:  { id:'venomSpray',  name:'剧毒喷射', icon:'☠️', mult:1.3, status:'poison', color:0x99ff33, desc:'喷射腐蚀毒液，持续中毒' },
  thunderStrike:{ id:'thunderStrike',name:'雷霆一击', icon:'⚡', mult:2.0, status:'stun',   color:0xffee44, desc:'召唤落雷，有概率眩晕' },
  shadowStrike:{ id:'shadowStrike',name:'暗影突袭', icon:'🌑', mult:2.2, status:null,     color:0x6633cc, desc:'从暗影中突袭，巨额伤害' },
  meteor:      { id:'meteor',      name:'陨石冲击', icon:'☄️', mult:2.6, status:'burn',   color:0xff3300, desc:'召下陨石，毁灭性打击' },
  // ---- 自身增益类 ----
  bloodDrain:  { id:'bloodDrain',  name:'生命汲取', icon:'🩸', mult:1.4, status:null,     color:0xcc0033, drain:0.6, heal:true, desc:'吸取生命，回复自身' },
  ironWall:    { id:'ironWall',    name:'铁壁',     icon:'🛡', mult:0,   status:'defup',  color:0x9999bb, self:true, desc:'硬化外壳，大幅提升防御' },
  berserk:     { id:'berserk',     name:'狂暴',     icon:'💢', mult:0,   status:'atkup',  color:0xff4444, self:true, healPct:0.1, heal:true, desc:'陷入狂暴，回血并提升攻击' },
  vampireBite: { id:'vampireBite', name:'噬血獠牙', icon:'🧛', mult:1.7, status:null,     color:0x990022, drain:0.8, heal:true, desc:'獠牙撕咬，大量吸取生命' },
  // ---- 减益类 ----
  curse:       { id:'curse',       name:'死亡诅咒', icon:'😈', mult:0.8, status:'weak',   color:0x8822cc, desc:'施以诅咒，降低敌人攻击' },
  webTrap:     { id:'webTrap',     name:'缠丝陷阱', icon:'🕸', mult:0.6, status:'stun',   color:0xcccccc, desc:'吐出蛛丝束缚，有概率定身' },
  howl:        { id:'howl',        name:'狼嚎',     icon:'🌕', mult:0,   status:'atkup',  color:0xddcc88, self:true, desc:'嘨叫鼓舞，提升自身攻击' },
  soulDrain:   { id:'soulDrain',   name:'摄魂',     icon:'👻', mult:1.5, status:'weak',   color:0x88aaff, drain:0.4, heal:true, desc:'抽取灵魂，伤害并吸取' },
  // ---- 特殊类 ----
  split:       { id:'split',       name:'分裂',     icon:'🟢', mult:0,   status:null,     color:0x44ff88, self:true, healPct:0.15, heal:true, desc:'分裂增生，恢复大量生命' },
  petrify:     { id:'petrify',     name:'石化凝视', icon:'🗿', mult:1.2, status:'stun',   color:0xaa9988, desc:'石化凝视，高概率定身' },
  quake:       { id:'quake',       name:'大地震撃', icon:'🌋', mult:2.3, status:null,     color:0xcc6622, desc:'引起地震，无视部分防御' },
  divineWrath: { id:'divineWrath', name:'神罚',     icon:'🌟', mult:2.8, status:'burn',   color:0xffdd66, desc:'降下神罚，毁灭一切' },
  abyssGaze:   { id:'abyssGaze',   name:'深渊凝视', icon:'👁', mult:2.5, status:'weak',   color:0xaa22ff, desc:'凝视深渊，伤害并诅咒' }
};

// 每种怪物原型的绝招候选（每种都含至少一个回血类）
const TYPE_SPECIALS = {
  slime:    ['venomSpray', 'split', 'quake'],
  goblin:   ['shadowStrike', 'berserk', 'webTrap'],
  skeleton: ['curse', 'soulDrain', 'iceStorm'],
  bat:      ['vampireBite', 'bloodDrain', 'shadowStrike'],
  spider:   ['webTrap', 'venomSpray', 'petrify', 'split'],
  wolf:     ['howl', 'shadowStrike', 'iceStorm', 'bloodDrain'],
  troll:    ['quake', 'ironWall', 'berserk'],
  wraith:   ['soulDrain', 'curse', 'abyssGaze'],
  dragon:   ['fireBreath', 'iceStorm', 'thunderStrike', 'meteor', 'bloodDrain'],
  demon:    ['abyssGaze', 'divineWrath', 'meteor', 'curse', 'soulDrain']
};

// 为某个怪物生成绝招（确定性）
function makeSpecial(typeIdx, stageIndex, isBoss) {
  const type = ENEMY_TYPES[typeIdx].type;
  const pool = TYPE_SPECIALS[type] || ['shadowStrike'];
  // 保留完整候选池，供战斗中根据血量智能选择
  const poolDefs = pool.map(id => SPECIALS[id]).filter(Boolean);
  // 按关卡确定性选一个作为“默认主绝招”
  let idx = isBoss ? pool.length - 1
                   : Math.floor(nameSeedRand(stageIndex * 13 + 7) * pool.length);
  const base = SPECIALS[pool[idx]] || SPECIALS.shadowStrike;
  // 深拷贝（倍率随关卡微调）
  const scale = 1 + Math.min(0.6, stageIndex / 1500);
  const mk = (sp) => Object.assign({}, sp, {
    pool: poolDefs,   // 候选池
    mult: sp.mult ? +(sp.mult * scale).toFixed(2) : 0
  });
  return mk(base);
}

// 地形区域（每 100 关一个区域，循环 10 次但配色渐进变暗）
const ZONE_THEMES = [
  { name: '森林', colors: [0x1a3a1a, 0x2e5a30], fog: 0x1a3a22 },
  { name: '洞穴', colors: [0x2e2418, 0x4a3420], fog: 0x2e2418 },
  { name: '墓园', colors: [0x20203a, 0x33335a], fog: 0x282845 },
  { name: '熔岩', colors: [0x4a1810, 0x6e2818], fog: 0x4a1a10 },
  { name: '魔域', colors: [0x2a1030, 0x44204a], fog: 0x2a1430 }
];
const ZONE_SUFFIX = ['小径','深处','废土','深渊','神庙','要塞','秘境','炼狱','虚空','终焉'];

// 确定性伪随机（0..1），用于关卡生成
function seedRand(seed) {
  let x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// 根据关卡序号（1-based）生成关卡配置
function getStage(index) {
  const n = index + 1;                    // 关卡号 1..1000
  const zoneIdx = Math.floor(index / 100) % ZONE_THEMES.length;
  const zone = ZONE_THEMES[zoneIdx];
  const suffix = ZONE_SUFFIX[Math.floor(index / 100) % ZONE_SUFFIX.length];

  // ---- 敌人类型：随关卡推进向强敌偏移 ----
  // 前 10 关固定教学顺序，之后按区域强度选择
  // 使用基于关卡号的确定性伪随机，保证同一关每次打开敌人都一致
  let typeIdx;
  if (index < 10) {
    typeIdx = index;
  } else {
    // 根据关卡区间决定敌种上限：前期只能遇到弱敌，逐步解锁全部 10 种
    const maxTier = index < 20 ? 2
                  : index < 40 ? 4
                  : index < 80 ? 6
                  : index < 150 ? 8
                  : 9;
    const r = seedRand(index * 7919 + 13);
    if (r < 0.25) typeIdx = Math.max(0, maxTier - 3);
    else if (r < 0.6) typeIdx = Math.max(0, maxTier - 1);
    else typeIdx = maxTier;
    typeIdx = Math.min(9, typeIdx);
  }

  // ---- Boss 判定 ----
  const isBoss = n % 100 === 0;                          // 每 100 关：大 Boss
  const isMiniBoss = !isBoss && n % 25 === 0 && n > 40;  // 每 25 关：小 Boss（前 40 关没有）
  const isElite = !isBoss && !isMiniBoss && n % 5 === 0 && n > 10;  // 每 5 关：精英（前 10 关没有）

  // Boss 强制用高级敌种
  if (isBoss) typeIdx = 9;
  else if (isMiniBoss) typeIdx = Math.min(9, Math.max(typeIdx, 7));
  else if (isElite) typeIdx = Math.min(9, Math.max(typeIdx, 4));

  const enemyDef = ENEMY_TYPES[typeIdx];

  // ---- 数值成长曲线 ----
  // 用幂函数(power 1.15)兼顾前中后期，避免数值爆炸
  // 系数经过 1000 关全程模拟标定：保证玩家始终能在被击杀前取胜
  const g = Math.pow(index + 1, 1.15);

  // 基础属性
  let hp  = Math.round(70 + g * 1.5);
  let atk = Math.round(9 + g * 0.35);
  let def = Math.round(2 + g * 0.12);
  let exp = Math.round(30 + g * 2.5);
  let gold = Math.round(55 + g * 4.0);
  let lv = 1 + Math.floor(Math.pow(index + 1, 0.85) * 0.55) + Math.floor(index / 12);

  // Boss 加成
  const tierBoost = 1 + typeIdx * 0.18;   // 高级敌种更强
  hp  = Math.round(hp * tierBoost);
  atk = Math.round(atk * tierBoost);
  def = Math.round(def * tierBoost);
  exp = Math.round(exp * (1 + typeIdx * 0.25));
  gold = Math.round(gold * (1 + typeIdx * 0.3));

  let bossTag = '';
  if (isBoss) {
    hp = Math.round(hp * 2.5); atk = Math.round(atk * 1.5);
    def = Math.round(def * 1.4); exp = Math.round(exp * 4); gold = Math.round(gold * 5);
    lv += 5; bossTag = '👑 ';
  } else if (isMiniBoss) {
    hp = Math.round(hp * 1.6); atk = Math.round(atk * 1.25);
    def = Math.round(def * 1.2); exp = Math.round(exp * 2.2); gold = Math.round(gold * 2.4);
    lv += 2; bossTag = '⭐ ';
  } else if (isElite) {
    hp = Math.round(hp * 1.25); atk = Math.round(atk * 1.1);
    exp = Math.round(exp * 1.5); gold = Math.round(gold * 1.5);
    lv += 1; bossTag = '✦ ';
  }

  // ---- 名称（1000 个独特名）----
  const stageName = `${zone.name}·${suffix}`;
  const displayName = makeEnemyName(typeIdx, index);

  // ---- 绝招（每个怪物一只）----
  const special = makeSpecial(typeIdx, index, isBoss || isMiniBoss);

  return {
    name: stageName,
    enemy: enemyDef.type,
    avatar: enemyDef.avatar,
    enemyName: bossTag + displayName + (isBoss || isMiniBoss ? ` 【第${n}关】` : ''),
    lv, hp, atk, def, exp, gold,
    colors: zone.colors,
    fog: zone.fog,
    isBoss, isMiniBoss, isElite,
    special,
    index
  };
}

// 兼容旧代码：惰性生成关卡数组（只生成需要的）
const STAGES = new Proxy([], {
  get(target, prop) {
    if (prop === 'length') return TOTAL_STAGES;
    if (typeof prop === 'string' && /^\d+$/.test(prop)) {
      const i = Number(prop);
      if (i >= 0 && i < TOTAL_STAGES) {
        if (!target[i]) target[i] = getStage(i);
        return target[i];
      }
      return undefined;
    }
    return target[prop];
  }
});

// ==================== 装备 / 物品定义 ====================
// 品质等级（紫色「史诗」为最高级别）
const RARITY = {
  common: { name: '普通', color: '#c8c8d8', cls: 'r-common', mult: 1.0 },
  good:   { name: '优秀', color: '#5ade7f', cls: 'r-good',   mult: 1.35 },
  rare:   { name: '稀有', color: '#5aa8ff', cls: 'r-rare',   mult: 1.8 },
  epic:   { name: '史诗', color: '#bb66ff', cls: 'r-epic',   mult: 2.8 }   // 最高级（紫色）
};

// ==================== 100 件装备库 ====================
// 结构：{ slot, icon, name, tier }  tier 1-10 决定基础数值强度
// 每个槽位约 33 件，共 100 件
const EQUIP_DB = [
  // ---------- 武器 (34 件) ----------
  { slot: 'weapon', icon: '🔪', name: '生锈匕首',     tier: 1 },
  { slot: 'weapon', icon: '🗡', name: '铁剑',         tier: 1 },
  { slot: 'weapon', icon: '🪓', name: '手斧',         tier: 2 },
  { slot: 'weapon', icon: '🔨', name: '铁锤',         tier: 2 },
  { slot: 'weapon', icon: '🗡', name: '精钢长剑',     tier: 3 },
  { slot: 'weapon', icon: '🔱', name: '三叉戟',       tier: 3 },
  { slot: 'weapon', icon: '🪓', name: '战斧',         tier: 3 },
  { slot: 'weapon', icon: '⚔️', name: '大剑',         tier: 4 },
  { slot: 'weapon', icon: '🔨', name: '战锤',         tier: 4 },
  { slot: 'weapon', icon: '🏹', name: '长弓',         tier: 4 },
  { slot: 'weapon', icon: '🗡', name: '银光剑',       tier: 5 },
  { slot: 'weapon', icon: '🗡', name: '暗影短刃',     tier: 5 },
  { slot: 'weapon', icon: '🔱', name: '海皇三叉戟',   tier: 5 },
  { slot: 'weapon', icon: '⚔️', name: '骑士长剑',     tier: 6 },
  { slot: 'weapon', icon: '🪓', name: '狂战巨斧',     tier: 6 },
  { slot: 'weapon', icon: '🔨', name: '雷霆战锤',     tier: 6 },
  { slot: 'weapon', icon: '🗡', name: '烈焰之刃',     tier: 7 },
  { slot: 'weapon', icon: '❄️', name: '寒霜巨剑',     tier: 7 },
  { slot: 'weapon', icon: '⚡', name: '雷鸣长枪',     tier: 7 },
  { slot: 'weapon', icon: '🟣', name: '暗影魔剑',     tier: 8 },
  { slot: 'weapon', icon: '🩸', name: '血刃',         tier: 8 },
  { slot: 'weapon', icon: '💀', name: '夺魂镰刀',     tier: 8 },
  { slot: 'weapon', icon: '🐉', name: '龙牙圣剑',     tier: 9 },
  { slot: 'weapon', icon: '🔥', name: '炽天神剑',     tier: 9 },
  { slot: 'weapon', icon: '❄️', name: '绝对零度',     tier: 9 },
  { slot: 'weapon', icon: '⚡', name: '天罚之锤',     tier: 9 },
  { slot: 'weapon', icon: '🌙', name: '月华双刃',     tier: 9 },
  { slot: 'weapon', icon: '☀️', name: '烈日神剑',     tier: 10 },
  { slot: 'weapon', icon: '🌌', name: '虚空之刃',     tier: 10 },
  { slot: 'weapon', icon: '👑', name: '君王权杖',     tier: 10 },
  { slot: 'weapon', icon: '🕳️', name: '终焉之刃',     tier: 10 },
  { slot: 'weapon', icon: '✨', name: '创世神剑',     tier: 10 },
  { slot: 'weapon', icon: '🔮', name: '贤者法杖',     tier: 8 },
  { slot: 'weapon', icon: '🪄', name: '秘法魔杖',     tier: 6 },

  // ---------- 护甲 (33 件) ----------
  { slot: 'armor', icon: '👕', name: '布衣',         tier: 1 },
  { slot: 'armor', icon: '🦺', name: '皮甲',         tier: 1 },
  { slot: 'armor', icon: '🦺', name: '硬皮护甲',     tier: 2 },
  { slot: 'armor', icon: '🛡', name: '木盾',         tier: 2 },
  { slot: 'armor', icon: '🛡', name: '锁子甲',       tier: 3 },
  { slot: 'armor', icon: '🛡', name: '铁盾',         tier: 3 },
  { slot: 'armor', icon: '🥋', name: '布制护腕',     tier: 3 },
  { slot: 'armor', icon: '🛡', name: '板甲',         tier: 4 },
  { slot: 'armor', icon: '🛡', name: '骑士铠甲',     tier: 4 },
  { slot: 'armor', icon: '🥋', name: '武僧长袍',     tier: 4 },
  { slot: 'armor', icon: '🛡', name: '秘银铠',       tier: 5 },
  { slot: 'armor', icon: '🛡', name: '塔盾',         tier: 5 },
  { slot: 'armor', icon: '🥋', name: '暗影斗篷',     tier: 5 },
  { slot: 'armor', icon: '🛡', name: '符文护甲',     tier: 6 },
  { slot: 'armor', icon: '🛡', name: '圣殿重铠',     tier: 6 },
  { slot: 'armor', icon: '🥋', name: '贤者法袍',     tier: 6 },
  { slot: 'armor', icon: '🛡', name: '龙鳞胸甲',     tier: 7 },
  { slot: 'armor', icon: '🛡', name: '凤凰羽衣',     tier: 7 },
  { slot: 'armor', icon: '🛡', name: '寒冰护甲',     tier: 7 },
  { slot: 'armor', icon: '🛡', name: '暗黑魔铠',     tier: 8 },
  { slot: 'armor', icon: '🛡', name: '血纹战甲',     tier: 8 },
  { slot: 'armor', icon: '🥋', name: '虚空长袍',     tier: 8 },
  { slot: 'armor', icon: '🛡', name: '龙鳞神铠',     tier: 9 },
  { slot: 'armor', icon: '🛡', name: '泰坦护甲',     tier: 9 },
  { slot: 'armor', icon: '🛡', name: '不灭圣铠',     tier: 9 },
  { slot: 'armor', icon: '🛡', name: '雷霆战甲',     tier: 9 },
  { slot: 'armor', icon: '🥋', name: '星辰法衣',     tier: 9 },
  { slot: 'armor', icon: '🛡', name: '神域战铠',     tier: 10 },
  { slot: 'armor', icon: '🛡', name: '永恒壁障',     tier: 10 },
  { slot: 'armor', icon: '🥋', name: '命运之袍',     tier: 10 },
  { slot: 'armor', icon: '🛡', name: '终焉护甲',     tier: 10 },
  { slot: 'armor', icon: '✨', name: '创世神铠',     tier: 10 },
  { slot: 'armor', icon: '🛡', name: '无畏壁垒',     tier: 10 },

  // ---------- 饰品 (33 件) ----------
  { slot: 'acc', icon: '💍', name: '铜戒',           tier: 1 },
  { slot: 'acc', icon: '📿', name: '护身符',         tier: 1 },
  { slot: 'acc', icon: '💍', name: '银戒',           tier: 2 },
  { slot: 'acc', icon: '📿', name: '骨制项链',       tier: 2 },
  { slot: 'acc', icon: '💍', name: '金戒',           tier: 3 },
  { slot: 'acc', icon: '🔮', name: '水晶球',         tier: 3 },
  { slot: 'acc', icon: '📿', name: '翡翠项链',       tier: 3 },
  { slot: 'acc', icon: '💍', name: '力量之戒',       tier: 4 },
  { slot: 'acc', icon: '🧿', name: '守护之眼',       tier: 4 },
  { slot: 'acc', icon: '📿', name: '月光坠饰',       tier: 4 },
  { slot: 'acc', icon: '💍', name: '秘银指环',       tier: 5 },
  { slot: 'acc', icon: '🔮', name: '占卜水晶',       tier: 5 },
  { slot: 'acc', icon: '📿', name: '贤者项链',       tier: 5 },
  { slot: 'acc', icon: '💍', name: '符文戒指',       tier: 6 },
  { slot: 'acc', icon: '🧿', name: '洞察之瞳',       tier: 6 },
  { slot: 'acc', icon: '📿', name: '星辰吊坠',       tier: 6 },
  { slot: 'acc', icon: '💍', name: '龙血指环',       tier: 7 },
  { slot: 'acc', icon: '🔮', name: '凤凰之心',       tier: 7 },
  { slot: 'acc', icon: '📿', name: '寒霜项链',       tier: 7 },
  { slot: 'acc', icon: '💍', name: '暗影之戒',       tier: 8 },
  { slot: 'acc', icon: '🧿', name: '血月之眼',       tier: 8 },
  { slot: 'acc', icon: '📿', name: '虚空项链',       tier: 8 },
  { slot: 'acc', icon: '💍', name: '永恒圣印',       tier: 9 },
  { slot: 'acc', icon: '🔮', name: '世界之瞳',       tier: 9 },
  { slot: 'acc', icon: '📿', name: '命运项链',       tier: 9 },
  { slot: 'acc', icon: '💍', name: '雷霆指环',       tier: 9 },
  { slot: 'acc', icon: '🧿', name: '先知之眼',       tier: 9 },
  { slot: 'acc', icon: '💍', name: '神格之戒',       tier: 10 },
  { slot: 'acc', icon: '🔮', name: '宇宙之心',       tier: 10 },
  { slot: 'acc', icon: '📿', name: '终焉圣物',       tier: 10 },
  { slot: 'acc', icon: '🧿', name: '全视之眼',       tier: 10 },
  { slot: 'acc', icon: '✨', name: '创世圣印',       tier: 10 },
  { slot: 'acc', icon: '🌟', name: '永恒之星',       tier: 10 }
];

// 兼容旧接口：EQUIP_TEMPLATES（用于商店等随机选取）
const EQUIP_TEMPLATES = EQUIP_DB;

// 消耗品定义
const CONSUMABLES = {
  potion:  { name: '治疗药水', icon: '🧪', desc: '恢复 40 点生命', use: (p) => healPlayer(40, '治疗药水') },
  ether:   { name: '魔力药水', icon: '🔮', desc: '恢复 25 点法力', use: (p) => { p.mp = Math.min(p.maxMp, p.mp + 25); floatOn('player', '+' + Math.min(25, p.maxMp - p.mp + 25) > 0 ? '+25' : '+25', 'mp'); log('使用魔力药水，恢复 25 点法力。', 'heal'); render(); } },
  elixir:  { name: '万能药',   icon: '⚗️', desc: '回满生命并解除异常', use: (p) => { p.hp = p.maxHp; p.statuses = []; log('使用万能药，生命全满，异常解除！', 'heal'); floatOn('player', 'MAX', 'heal'); render(); } }
};

// ==================== 全局状态 ====================
let G = null;

function newPlayer() {
  return {
    name: '勇者', type: 'hero', avatar: '🧙',
    lv: 1, exp: 0, expNext: 68,
    hp: 100, maxHp: 100,
    mp: 30, maxMp: 30,
    atk: 18, def: 6,
    critBonus: 0,              // 角色固有暴击加成
    statuses: [],              // 玩家状态（一般不用）
    cds: { skill: 0, skill2: 0, heal: 0, poison: 0 },
    equip: { weapon: null, armor: null, acc: null },   // 装备栏
    bag: [],                   // 背包（物品实例）
    gold: 300,                 // 初始金币（足够买几件装备）
    defending: false,
    // ---- 扩展功能 ----
    skills: [],                // 已学技能
    pets: [],                  // 拥有的宠物
    activePet: null,
    achievements: [],          // 已解锁成就
    bestiary: [],              // 已遭遇怪物
    bestiaryDefeated: [],      // 已讨伐怪物
    streak: 0,                 // 连续通关数
    _baseStats: null           // 技能加成前的基础属性
  };
}

function newGame() {
  return {
    stageIndex: 0,
    round: 1,
    player: newPlayer(),
    enemy: null,               // 当前敌人（运行时构造）
    over: false,
    busy: false,
    camMode: 0,                // 0:动态 1:固定
    soundOn: true,
    bgmOn: true,
    combo: 0,                  // 连击计数
    maxCombo: 0,
    shopReturnTo: null,        // 商店关闭后的去向: 'next' | 'battle'
    rewardApplied: false,      // 奖励是否已发放
    // ---- 扩展功能 ----
    battleSpeed: 1,            // 战斗速度倍率
    autoBattle: false,         // 自动战斗
    autoShop: true,            // 自动进商店
    autoBag: true,             // 自动开背包
    endless: false,            // 无尽模式
    endlessFloor: 1,
    heroId: 'warrior',
    unlockedContinue: false
  };
}

// 关卡 BGM 映射
const STAGE_BGM = ['forest', 'cave', 'graveyard', 'lair', 'boss'];

// ==================== 状态效果计算 ====================
function hasStatus(entity, key) {
  return entity.statuses && entity.statuses.some(s => s.key === key);
}
function addStatus(entity, key, turns, extra = {}) {
  if (!entity.statuses) entity.statuses = [];
  const exist = entity.statuses.find(s => s.key === key);
  if (exist) { exist.turns = Math.max(exist.turns, turns); }
  else entity.statuses.push(Object.assign({ key, turns, maxTurns: turns }, extra));
  renderBuffs();
}
function tickStatuses(entity, isPlayer) {
  if (!entity.statuses || !entity.statuses.length) return;
  const messages = [];
  for (let i = entity.statuses.length - 1; i >= 0; i--) {
    const s = entity.statuses[i];
    if (s.key === 'poison') {
      const dmg = Math.max(3, Math.round(entity.maxHp * 0.05));
      entity.hp -= dmg;
      messages.push({ text: `${entity.name} 受到剧毒侵蚀，损失 <b>${dmg}</b> 点生命。`, cls: 'poison' });
      floatOn(isPlayer ? 'player' : 'enemy', '-' + dmg, 'poison');
    } else if (s.key === 'burn') {
      const dmg = Math.max(4, Math.round(entity.maxHp * 0.06));
      entity.hp -= dmg;
      messages.push({ text: `${entity.name} 被烈焰灼烧，损失 <b>${dmg}</b> 点生命。`, cls: 'crit' });
      floatOn(isPlayer ? 'player' : 'enemy', '-' + dmg, 'dmg');
    }
    s.turns--;
    if (s.turns <= 0) {
      messages.push({ text: `${entity.name} 的【${statusName(s.key)}】效果结束了。`, cls: 'sys' });
      entity.statuses.splice(i, 1);
    }
  }
  messages.forEach(m => log(m.text, m.cls));
  if (messages.length) render();
}

function statusName(key) {
  return { poison: '剧毒', burn: '灼烧', slow: '缓速', atkup: '攻击提升', defup: '防御提升', stun: '眩晕', weak: '虚弱' }[key] || key;
}

// ==================== 有效属性（含装备与状态加成） ====================
function effectiveAtk(entity) {
  let a = entity.atk;
  if (entity.equip) {
    ['weapon', 'armor', 'acc'].forEach(s => {
      const e = entity.equip[s];
      if (e && (e.stat === 'atk' || e.stat === 'both')) a += e.value;
    });
  }
  if (hasStatus(entity, 'atkup')) a = Math.round(a * 1.3);
  if (hasStatus(entity, 'slow')) a = Math.round(a * 0.75);
  if (hasStatus(entity, 'weak')) a = Math.round(a * 0.7);   // 诅咒减攻
  return a;
}
function effectiveDef(entity) {
  let d = entity.def || 0;
  if (entity.equip) {
    ['weapon', 'armor', 'acc'].forEach(s => {
      const e = entity.equip[s];
      if (e && (e.stat === 'def' || e.stat === 'both')) d += e.value;
    });
  }
  if (hasStatus(entity, 'defup')) d = Math.round(d * 1.4);
  return d;
}

// ==================== 装备生成 ====================
// 随机品质（紫色「史诗」为最高，概率最低）
function randRarity(bonus = 0) {
  const r = Math.random() + bonus;
  if (r > 0.96) return 'epic';    // 最高级（紫）
  if (r > 0.82) return 'rare';
  if (r > 0.52) return 'good';
  return 'common';
}

// 根据槽位获取属性类型
function slotStat(slot) {
  return slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : 'both';
}

let itemIdCounter = 1;

// 从装备库中按关卡挑合适的装备
// stageIndex: 0-based 关卡序号（0-999）
function pickEquip(stageIndex, minTier = 1) {
  // tier 随关卡进度线性提升：1 → 10（约每 110 关升 1 级）
  const progress = Math.min(1, Math.max(0, stageIndex / 999));
  const maxTier = Math.min(10, Math.max(minTier, 1 + Math.round(progress * 9)));
  // 优先挑选该区间偏高的装备（但不低于 minTier）
  const lo = Math.max(minTier, maxTier - 2);
  const candidates = EQUIP_DB.filter(e => e.tier >= lo && e.tier <= maxTier);
  const pool = candidates.length ? candidates : EQUIP_DB;
  return pool[Math.floor(Math.random() * pool.length)];
}

function makeItem(templateOrIndex, rarity, stageLv) {
  // 兼容传入索引或直接传装备对象
  let t;
  if (typeof templateOrIndex === 'number') {
    // 旧接口：按索引，但索引可能越界（库变大了），故取模并叠加层级提示
    t = EQUIP_DB[templateOrIndex % EQUIP_DB.length];
  } else if (templateOrIndex && templateOrIndex.name) {
    t = templateOrIndex;
  } else {
    t = pickEquip(stageLv);
  }

  const r = RARITY[rarity] || RARITY.common;
  const stat = slotStat(t.slot);

  // 数值 = (装备层级基础 + 关卡加成) × 品质倍率
  const tierBase = t.tier * 3.2;
  const lvBonus = stageLv * 1.6;
  const value = Math.max(1, Math.round((tierBase + lvBonus) * r.mult));

  const statName = stat === 'both' ? '攻防' : stat === 'atk' ? '攻击' : '防御';
  return {
    id: 'it' + (itemIdCounter++),
    kind: 'equip',
    slot: t.slot,
    icon: t.icon,
    name: t.name,
    tier: t.tier,
    rarity, stat, value,
    desc: `${statName} +${value}`
  };
}
function makeConsumable(key, count = 1) {
  const c = CONSUMABLES[key];
  return { id: 'it' + (itemIdCounter++), kind: 'consume', key, icon: c.icon, name: c.name, rarity: 'common', desc: c.desc, count };
}

// ==================== THREE 场景 ====================
let renderer, scene, camera, clock;
let heroModel, enemyModel;
let heroPos = new THREE.Vector3(-3.2, 0, 0.5);
let enemyPos = new THREE.Vector3(3.2, 0, -0.5);
let ambientLight, keyLight, rimLight;
let camShake = 0;
let camTarget = { pos: new THREE.Vector3(0, 4, 11), look: new THREE.Vector3(0, 1.6, 0) };
let camCurrent = { pos: new THREE.Vector3(0, 4, 11), look: new THREE.Vector3(0, 1.6, 0) };
let attackAnim = null;      // 攻击动画状态

// ---- 4D 视觉元素 ----
let heroGlyph = null;       // 玩家脚下超立方体法阵
let enemyGlyph = null;      // 敌人脚下超立方体法阵
let bgTesseracts = [];      // 背景漂浮的 4D 几何体

function initThree() {
  const canvas = document.getElementById('scene');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (err) {
    // WebGL 不可用时的优雅降级
    const el = document.getElementById('loading');
    el.classList.remove('hide');
    el.innerHTML = `<div style="text-align:center;line-height:2">
      <div style="font-size:40px">⚠️</div>
      <div>无法初始化 3D 渲染（WebGL 不可用）</div>
      <div style="font-size:12px;color:#5555aa;margin-top:8px">
        请尝试：更新浏览器 / 开启硬件加速 / 更换设备
      </div>
    </div>`;
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  scene.fog = new THREE.Fog(0x0a0a14, 18, 42);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4, 11);
  camera.lookAt(0, 1.6, 0);

  clock = new THREE.Clock();

  // 灯光
  ambientLight = new THREE.AmbientLight(0x8899cc, 1.15);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight(0xfff0e0, 2.2);
  keyLight.position.set(6, 14, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -14;
  keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 14;
  keyLight.shadow.camera.bottom = -14;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  rimLight = new THREE.DirectionalLight(0x7788ff, 1.4);
  rimLight.position.set(-8, 6, -6);
  scene.add(rimLight);

  // 地面
  buildGround();

  // 4D 背景几何体群
  build4DBackdrop();

  Effects.init(scene);

  // 事件
  window.addEventListener('resize', onResize);
  window.addEventListener('click', () => Sound.resume(), { once: true });

  // 隐藏加载
  setTimeout(() => document.getElementById('loading').classList.add('hide'), 300);

  animate();
}

let ground = null;
function buildGround() {
  if (ground) { scene.remove(ground); ground.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }

  ground = new THREE.Group();

  // 主地面
  const geo = new THREE.CircleGeometry(16, 48);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a2a1a, roughness: 0.95, metalness: 0.05
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  ground.add(mesh);

  // 环形装饰
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4455aa, transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
  });
  [3.5, 6.5, 10].forEach(r => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ground.add(ring);
  });

  // 随机石块
  for (let i = 0; i < 18; i++) {
    const size = 0.2 + Math.random() * 0.5;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 1, flatShading: true })
    );
    const a = Math.random() * Math.PI * 2;
    const r = 7 + Math.random() * 8;
    rock.position.set(Math.cos(a) * r, size * 0.4, Math.sin(a) * r);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    ground.add(rock);
  }

  // 柱子（增加场景层次）
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = 13;
    const pillar = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 })
    );
    shaft.position.y = 3;
    shaft.castShadow = true;
    pillar.add(shaft);
    // 顶部火盆
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.35, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.8, metalness: 0.4 })
    );
    bowl.position.y = 6.1;
    pillar.add(bowl);
    const flameColor = [0xff6622, 0xaa55ff, 0x2288ff][i % 3];
    const light = new THREE.PointLight(flameColor, 2, 14);
    light.position.y = 6.5;
    pillar.add(light);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: flameColor, transparent: true, opacity: 0.85 })
    );
    flame.position.y = 6.4;
    flame.userData.flicker = true;
    pillar.add(flame);

    pillar.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    ground.add(pillar);
  }

  scene.add(ground);
}

function setStageEnvironment(stage) {
  scene.background = new THREE.Color(stage.colors[0]);
  scene.fog.color = new THREE.Color(stage.fog);
  // 雾效放宽，避免远处的 4D 几何体被雾完全遮住
  scene.fog.near = 22;
  scene.fog.far = 55;
  if (ground && ground.children[0] && ground.children[0].material) {
    ground.children[0].material.color = new THREE.Color(stage.colors[1]);
  }
  // 4D 几何体颜色：按区域（每 100 关）取色，后期更暗更危险
  const zoneIdx = G ? Math.floor(G.stageIndex / 100) : 0;
  const accentPalette = [0x66aaff, 0xaa66ff, 0x55ffaa, 0xff6633, 0xcc22ff,
                         0x33ddcc, 0xff4488, 0xffee44, 0xff2222, 0x8a2be2];
  const accentHex = accentPalette[zoneIdx % accentPalette.length];
  // 后期（高区域）降低亮度，制造压迫感
  const darken = Math.min(0.45, zoneIdx * 0.05);
  bgTesseracts.forEach((t, i) => {
    const c = new THREE.Color(accentHex);
    c.offsetHSL((i % 5) * 0.06 - 0.12, 0.1, 0.05);
    if (darken > 0) c.offsetHSL(0, 0, -darken);
    const hex = c.getHex();
    t.edgeColors[0].setHex(hex);
    if (t.mat && t.mat.color) t.mat.color.setHex(hex);
    if (t.pointsMat && t.pointsMat.color) t.pointsMat.color.setHex(hex);
  });
}

// ==================== 4D 背景几何体群 ====================
function build4DBackdrop() {
  // 清理旧的
  bgTesseracts.forEach(t => Hyper4D.disposeTesseract(t));
  bgTesseracts = [];

  // 远处环绕的超立方体
  const configs = [
    { radius: 11, angle: 0.4,       height: 5.0, size: 1.1, speed: 0.5 },
    { radius: 13, angle: Math.PI * 0.7, height: 7.5, size: 0.85, speed: 0.35 },
    { radius: 9.5, angle: Math.PI * 1.35, height: 3.5, size: 0.7, speed: 0.7 },
    { radius: 15, angle: Math.PI * 1.7, height: 6.0, size: 1.3, speed: 0.28 },
    { radius: 12, angle: Math.PI * 0.25, height: 9.5, size: 0.6, speed: 0.55 }
  ];

  configs.forEach((cfg, i) => {
    const t = Hyper4D.createTesseract({
      size: cfg.size,
      color: 0x66aaff,
      color2: 0xaa66ff,
      opacity: 0.4,
      spinSpeed: cfg.speed,
      distance: 2.8
    });
    t.group.position.set(
      Math.cos(cfg.angle) * cfg.radius,
      cfg.height,
      Math.sin(cfg.angle) * cfg.radius - 4
    );
    t.baseY = cfg.height;
    t.phase = i * 1.3;
    t.driftAngle = cfg.angle;
    t.driftRadius = cfg.radius;
    scene.add(t.group);
    bgTesseracts.push(t);
  });
}

// 创建角色脚下的 4D 法阵
function createGlyphAt(side, color) {
  const glyph = Hyper4D.createHyperGlyph({
    color: color,
    size: side === 'player' ? 1.5 : 1.7,
    layers: 2
  });
  const pos = side === 'player' ? heroPos : enemyPos;
  glyph.group.position.set(pos.x, 0.35, pos.z);
  glyph.pulse = 0;
  scene.add(glyph.group);
  return glyph;
}

function disposeGlyph(g) {
  if (!g) return;
  g.cubes.forEach(st => {
    if (st.group) {
      // 先释放子对象资源，再从场景移除
      st.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => m.dispose());
        }
      });
      if (st.group.parent) st.group.parent.remove(st.group);
    }
  });
  if (g.group && g.group.parent) g.group.parent.remove(g.group);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== 渲染循环 ====================
let time = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  // 镜头抖动
  if (camShake > 0) {
    camShake = Math.max(0, camShake - dt * 3);
  }

  // 镜头平滑
  camCurrent.pos.lerp(camTarget.pos, 1 - Math.pow(0.001, dt));
  camCurrent.look.lerp(camTarget.look, 1 - Math.pow(0.001, dt));
  camera.position.copy(camCurrent.pos);
  if (camShake > 0) {
    camera.position.x += (Math.random() - 0.5) * camShake * 0.5;
    camera.position.y += (Math.random() - 0.5) * camShake * 0.5;
  }
  camera.lookAt(camCurrent.look);

  // 角色动画
  updateCharacterAnim(heroModel, dt, true);
  updateCharacterAnim(enemyModel, dt, false);

  // ---- 4D 几何体更新 ----
  // 背景超立方体：自旋 + 缓慢漂浮
  bgTesseracts.forEach((t, i) => {
    Hyper4D.updateTesseract(t, dt, 1);
    t.driftAngle += dt * 0.06;
    t.group.position.x = Math.cos(t.driftAngle) * t.driftRadius;
    t.group.position.z = Math.sin(t.driftAngle) * t.driftRadius - 4;
    t.group.position.y = t.baseY + Math.sin(time * 0.6 + t.phase) * 0.8;
  });

  // 角色法阵：旋转 + 跟随角色 + 激活脉冲
  if (heroGlyph) {
    const boost = heroGlyph.pulse > 0 ? 3.5 : 1;
    if (heroGlyph.pulse > 0) heroGlyph.pulse -= dt * 1.6;
    heroGlyph.update(dt, boost);
    heroGlyph.group.position.x = heroModel ? heroModel.position.x : heroPos.x;
    heroGlyph.group.position.z = heroPos.z;
    const hp = heroGlyph.group.children;
    const scala = 1 + Math.max(0, heroGlyph.pulse) * 0.35;
    heroGlyph.group.scale.setScalar(scala);
    const alive = G && G.player.hp > 0;
    heroGlyph.group.visible = alive;
  }
  if (enemyGlyph) {
    const boost = enemyGlyph.pulse > 0 ? 3.5 : 1;
    if (enemyGlyph.pulse > 0) enemyGlyph.pulse -= dt * 1.6;
    enemyGlyph.update(dt, boost);
    enemyGlyph.group.position.x = enemyModel ? enemyModel.position.x : enemyPos.x;
    enemyGlyph.group.position.z = enemyPos.z;
    const scala = 1 + Math.max(0, enemyGlyph.pulse) * 0.35;
    enemyGlyph.group.scale.setScalar(scala);
    const alive = G && G.enemy && G.enemy.hp > 0;
    enemyGlyph.group.visible = alive;
  }

  // 攻击动画
  if (attackAnim) updateAttackAnim(dt);

  // 火焰闪烁
  if (ground) {
    ground.traverse(o => {
      if (o.userData && o.userData.flicker) {
        const s = 1 + Math.sin(time * 12 + o.position.x) * 0.18;
        o.scale.setScalar(s);
      }
    });
  }

  Effects.update(dt);
  // 扩展功能：天气粒子更新
  if (typeof Features !== 'undefined') Features.updateWeather(dt);
  renderer.render(scene, camera);
}

function updateCharacterAnim(model, dt, isHero) {
  if (!model) return;
  const ud = model.userData;
  const isAlive = isHero ? (G && G.player.hp > 0) : (G && G.enemy && G.enemy.hp > 0);

  // 呼吸 / 漂浮
  const breathe = Math.sin(time * 2.2 + (isHero ? 0 : 1.5)) * 0.03;
  if (ud.type === 'slime') {
    // 史莱姆弹跳
    ud.bounce += dt * 3.2;
    const b = Math.abs(Math.sin(ud.bounce)) * 0.28;
    model.position.y = b;
    ud.body.scale.y = 0.78 + Math.sin(ud.bounce) * 0.09;
    ud.body.scale.x = 1 - Math.sin(ud.bounce) * 0.05;
    ud.body.scale.z = 1 - Math.sin(ud.bounce) * 0.05;
  } else if (ud.type === 'skeleton' || ud.type === 'darklord') {
    // 漂浮
    model.position.y = breathe * 2.5 + Math.sin(time * 1.5 + 1) * 0.06;
    if (ud.ring) ud.ring.rotation.z = time * 0.8;
    if (ud.orb) { ud.orb.rotation.y = time * 1.5; ud.orb.rotation.x = time * 0.9; }
    if (ud.darkRing) { ud.darkRing.rotation.z = time * 0.4; ud.darkRing2.rotation.z = -time * 0.6; }
    if (ud.orbLight) ud.orbLight.intensity = 1.8 + Math.sin(time * 3) * 0.6;
  } else if (ud.type === 'dragon') {
    model.position.y = breathe * 2;
    // 翅膀扇动
    if (ud.wings) {
      ud.wings.forEach((w, i) => {
        const flap = Math.sin(time * 2.4 + i * Math.PI) * 0.22;
        w.rotation.z = 0.15 + flap;
        w.rotation.y = flap * 0.5 * (i % 2 === 0 ? 1 : -1);
      });
    }
    // 尾巴摆动
    if (ud.tail) ud.tail.rotation.y = Math.sin(time * 1.6) * 0.28;
    // 口部火光
    if (ud.fireLight) ud.fireLight.intensity = 0.6 + Math.abs(Math.sin(time * 4)) * 0.8;
    if (ud.head) ud.head.rotation.x = Math.sin(time * 1.1) * 0.05;
  } else {
    // 人形：呼吸
    model.position.y = breathe;
    if (ud.cape) ud.cape.rotation.x = 0.12 + Math.sin(time * 1.8) * 0.06;
    if (ud.armR) ud.armR.rotation.x = Math.sin(time * 1.8 + 0.5) * 0.05;
    if (ud.aura) {
      ud.aura.rotation.z = time * 0.6;
      ud.aura.material.opacity = 0.25 + Math.sin(time * 2) * 0.1;
    }
  }

  // 死亡倒下
  const t = model.userData._deathT || 0;
  if (!isAlive) {
    model.userData._deathT = Math.min(1, t + dt * 1.8);
    const k = model.userData._deathT;
    model.rotation.z = -k * Math.PI * 0.42;
    model.position.y = (model.userData._baseY || 0) - k * 1.0;
    model.traverse(o => {
      if (o.material && o.material.transparent !== undefined) {
        if (!o.userData._origOpacity) o.userData._origOpacity = o.material.opacity;
        if (o.material.transparent === false) { o.material.transparent = true; }
        o.material.opacity = o.userData._origOpacity * (1 - k * 0.75);
      }
    });
  }
}

// ==================== 攻击动画 ====================
function playAttackAnim(side, onHit) {
  const model = side === 'player' ? heroModel : enemyModel;
  const targetModel = side === 'player' ? enemyModel : heroModel;
  if (!model) { onHit && onHit(); return; }

  const startPos = model.position.clone();
  const dir = side === 'player' ? 1 : -1;
  const dur = 0.32;
  let t = 0;

  attackAnim = {
    model, startPos, dir, t: 0, dur,
    hitFired: false,
    onHit,
    targetModel
  };
}

function updateAttackAnim(dt) {
  const a = attackAnim;
  a.t += dt;
  const p = Math.min(1, a.t / a.dur);

  let offset;
  if (p < 0.4) {
    // 蓄力后退
    offset = -0.5 * (p / 0.4);
  } else if (p < 0.75) {
    // 前冲
    offset = -0.5 + 1.9 * ((p - 0.4) / 0.35);
  } else {
    // 收回
    offset = 1.4 * (1 - (p - 0.75) / 0.25);
  }
  a.model.position.x = a.startPos.x + offset * a.dir;

  // 挥剑动作
  const ud = a.model.userData;
  if (ud.armR) {
    ud.armR.rotation.x = -Math.sin(p * Math.PI) * 1.6;
    ud.armR.rotation.z = -Math.sin(p * Math.PI) * 0.5;
  }
  if (ud.club) ud.club.rotation.z = -0.3 - Math.sin(p * Math.PI) * 1.2;

  // 命中时机
  if (!a.hitFired && p >= 0.62) {
    a.hitFired = true;
    a.onHit && a.onHit();
    camShake = 1.2;
  }

  if (p >= 1) {
    a.model.position.x = a.startPos.x;
    if (ud.armR) { ud.armR.rotation.x = 0; ud.armR.rotation.z = 0; }
    if (ud.club) ud.club.rotation.z = -0.3;
    attackAnim = null;
  }
}

// ==================== 镜头控制 ====================
function setCam(mode) {
  if (mode === 0) {
    camTarget.pos.set(0, 4.2, 11.5);
    camTarget.look.set(0, 1.7, 0);
  } else if (mode === 1) {
    camTarget.pos.set(-0.5, 3.2, 9);
    camTarget.look.set(0, 1.8, 0);
  }
}
function camZoom(duration = 0.6) {
  camTarget.pos.set(0, 2.8, 8.2);
  camTarget.look.set(0, 1.5, 0);
  setTimeout(() => setCam(G.camMode), duration * 1000);
}

function toggleCam() {
  G.camMode = (G.camMode + 1) % 2;
  setCam(G.camMode);
  Sound.click();
}

// ==================== 3D 坐标 → 屏幕坐标 ====================
function worldToScreen(v3) {
  const v = v3.clone();
  v.project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight
  };
}

function floatOn(side, text, type) {
  const layer = document.getElementById('floatLayer');
  const model = side === 'player' ? heroModel : enemyModel;
  const worldPos = new THREE.Vector3();
  if (model) {
    worldPos.copy(model.position);
    worldPos.y += 2.8;
    worldPos.x += (Math.random() - 0.5) * 0.6;
  } else {
    worldPos.set(side === 'player' ? -3 : 3, 3, 0);
  }
  const p = worldToScreen(worldPos);

  const el = document.createElement('div');
  el.className = 'float-num ' + type;
  el.textContent = text;
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}

// ==================== 战斗核心 ====================
function startGame() {
  // 有存档时先确认，避免误删进度
  if (hasSave()) {
    if (!confirm('重新开始将清除当前冒险进度，确定吗？')) {
      Sound.error();
      return;
    }
  }
  Sound.resume();
  Sound.click();
  localStorage.removeItem('dq3d_save');
  G = newGame();
  document.getElementById('startModal').classList.remove('show');
  document.getElementById('continueBtn').style.display = 'none';
  buildStage(0);
  log('⚔ 冒险开始！讨伐恶龙，拯救王国！', 'sys');
  if (G.bgmOn) BGM.play(STAGE_BGM[0]);
  saveGame();
}

function continueGame() {
  if (loadGame()) {
    document.getElementById('startModal').classList.remove('show');
    const stage = STAGES[G.stageIndex];
    log(`📁 读取存档，继续第 ${G.stageIndex + 1} 关 · ${stage.name}`, 'sys');
  }
}

// 重新开始（HUD 按钮）：清空进度从头开始
function restartGame() {
  if (!G) {
    // 尚未开始，直接开局
    startGame();
    return;
  }
  const cur = `第 ${G.stageIndex + 1} 关 · ${G.enemy ? G.enemy.name : ''}`;
  if (!confirm(`重新开始将清除当前进度（${cur}），确定吗？`)) {
    Sound.error();
    return;
  }
  Sound.click();
  localStorage.removeItem('dq3d_save');
  G = newGame();
  document.getElementById('startModal').classList.remove('show');
  document.getElementById('resultModal').classList.remove('show');
  document.getElementById('shopModal').classList.remove('show');
  buildStage(0);
  log('🔄 重新开始冒险！', 'sys');
  log('⚔ 讨伐恶龙，拯救王国！', 'sys');
  if (G.bgmOn) BGM.play(STAGE_BGM[0]);
  saveGame();
}

// 构建关卡
// 深度释放一个 3D 对象的所有几何体与材质
function disposeObject(obj) {
  if (!obj) return;
  obj.traverse(o => {
    // 几何体
    if (o.geometry) {
      o.geometry.dispose();
    }
    // 材质（可能是数组）
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        // 释放材质上的纹理
        for (const key in m) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      });
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

function buildStage(index) {
  G.stageIndex = index;
  const stage = STAGES[index];

  // 清理上一关残留的特效
  if (typeof Effects !== 'undefined' && Effects.clearAll) Effects.clearAll();

  // 清理旧敌人（从场景移除 + 释放资源）
  if (enemyModel) {
    scene.remove(enemyModel);
    disposeObject(enemyModel);
    enemyModel = null;
  }

  // 清理旧 4D 法阵
  disposeGlyph(heroGlyph); heroGlyph = null;
  disposeGlyph(enemyGlyph); enemyGlyph = null;

  // ---- 怪物血量：基础 = 玩家最大生命 × 2（随玩家成长）----
  const pHp = (G.player && G.player.maxHp) ? G.player.maxHp : 100;
  let enemyHp = Math.round(pHp * 2);
  let enemyAtk = stage.atk;
  // Boss / 精英叠加倍率
  if (stage.isBoss) {
    enemyHp = Math.round(enemyHp * 2.5);
    enemyAtk = Math.round(stage.atk * 1.5);
  } else if (stage.isMiniBoss) {
    enemyHp = Math.round(enemyHp * 1.6);
    enemyAtk = Math.round(stage.atk * 1.25);
  } else if (stage.isElite) {
    enemyHp = Math.round(enemyHp * 1.25);
    enemyAtk = Math.round(stage.atk * 1.1);
  }

  // 创建敌人数据
  G.enemy = {
    name: stage.enemyName || enemyName(stage.enemy),
    type: stage.enemy,
    avatar: stage.avatar,
    lv: stage.lv,
    hp: enemyHp, maxHp: enemyHp,
    atk: enemyAtk, def: stage.def,
    exp: stage.exp, gold: stage.gold,
    isBoss: !!stage.isBoss, isMiniBoss: !!stage.isMiniBoss, isElite: !!stage.isElite,
    special: stage.special || null,   // 绝招
    statuses: [],
    defending: false,
    cds: {}
  };

  // 创建玩家模型（仅一次）
  if (!heroModel) {
    heroModel = Models.create('hero');
    heroModel.position.copy(heroPos);
    heroModel.userData._baseY = 0;
    scene.add(heroModel);
  } else {
    // 复活重置
    heroModel.rotation.z = 0;
    heroModel.position.copy(heroPos);
    heroModel.userData._deathT = 0;
    heroModel.traverse(o => {
      if (o.userData._origOpacity !== undefined && o.material) {
        o.material.opacity = o.userData._origOpacity;
        if (o.userData._origOpacity >= 1) o.material.transparent = false;
      }
    });
  }

  // 创建敌人模型（带关卡专属变体，每关外观不同）
  const variant = Models.createVariant(stage.enemy, index);
  G.enemy.variant = variant;
  enemyModel = Models.create(stage.enemy, { variant });
  enemyModel.position.copy(enemyPos);
  enemyModel.userData._baseY = 0;
  enemyModel.userData._deathT = 0;
  scene.add(enemyModel);

  // 4D 法阵（角色脚下）——旧的已在开头清理
  heroGlyph = createGlyphAt('player', 0x4a7dff);
  enemyGlyph = createGlyphAt('enemy', 0xff4466);

  // 出场特效
  Effects.spawnPoof(enemyPos.clone().setY(1.5), 0xff6688);

  // 环境
  setStageEnvironment(stage);
  setCam(G.camMode);

  // 结算最终Boss特殊处理
  G.round = 1;
  G.over = false;
  G.busy = false;
  G.combo = 0;
  resetPlayerActionState();

  // 更新 UI
  document.getElementById('stageInfo').innerHTML = `第 ${index + 1}<span class="stage-total"> / ${STAGES.length}</span> 关 · ${stage.name}`;
  updateBagBadge();

  // 切换关卡 BGM（按区域循环）
  if (G.bgmOn) BGM.play(STAGE_BGM[Math.floor(index / 100) % STAGE_BGM.length] || 'forest');
  log(`—— 第 ${index + 1} / ${STAGES.length} 关 · ${stage.name} ——`, 'sys');
  const tag = G.enemy.isBoss ? '👑 首领战！' : G.enemy.isMiniBoss ? '⭐ 精英守卫战！' : G.enemy.isElite ? '✦ 精英战！' : '';
  if (tag) log(tag, 'sys');
  log(`<b>${G.enemy.name}</b>（Lv.${stage.lv}）出现了！`, 'enemy');

  // ---- 扩展功能接入 ----
  // 怪物图鉴记录
  if (typeof Features !== 'undefined' && G.enemy.type) Features.recordBestiary(G.enemy.type);
  // 天气效果（按区域切换）
  if (typeof Features !== 'undefined' && typeof scene !== 'undefined') {
    const weatherByZone = ['leaves', 'none', 'rain', 'embers', 'snow'];
    Features.setWeather(weatherByZone[index % weatherByZone.length]);
  }
  // 重置连击计数显示
  const cc = document.getElementById('comboCounter');
  if (cc) { cc.textContent = 'x0'; cc.classList.remove('bump'); }

  render();
  saveGame();
}

function enemyName(type) {
  return {
    slime: '翠绿史莱姆', goblin: '哥布林战士',
    skeleton: '亡灵法师', dragon: '烈焰恶龙', darklord: '暗黑魔王'
  }[type] || '魔物';
}

function resetPlayerActionState() {
  const p = G.player;
  p.defending = false;
  // 每关开始：所有技能冷却归零
  p.cds = { skill: 0, skill2: 0, heal: 0, poison: 0 };
}

// ==================== 伤害计算 ====================
function calcDamage(attacker, defender, mult, isPlayer) {
  // 闪避
  if (Math.random() < 0.05) return { miss: true };

  const atk = effectiveAtk(attacker);
  const def = effectiveDef(defender);
  const variance = 0.85 + Math.random() * 0.3;

  let dmg = atk * mult * variance;
  // 防御力减伤（百分比 + 固定）
  const reduction = def / (def + 20);
  dmg *= (1 - reduction * 0.7);

  // 暴击（基础 12% + 角色固有 + 技能树加成）
  let critRate = 0.12;
  if (isPlayer) {
    critRate += (attacker.critBonus || 0);
    if (typeof Features !== 'undefined') {
      if (Features.hasSkill('crit1')) critRate += 0.08;
    }
    // 调试：必暴击
    if (typeof G !== 'undefined' && G && G._alwaysCrit) critRate = 1;
  }
  const crit = Math.random() < critRate;
  if (crit) {
    let critMult = 1.8;
    if (isPlayer && typeof Features !== 'undefined' && Features.hasSkill('crit2')) critMult += 0.4;
    dmg *= critMult;
  }

  // 防御姿态减伤
  if (defender.defending) dmg *= 0.45;

  // ---- 调试：一击必杀 ----
  if (typeof G !== 'undefined' && G && G._oneHit && isPlayer) {
    return { dmg: Math.max(999999, Math.round(dmg)), crit: true };
  }

  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

// ==================== 玩家行动 ====================
async function playerAction(action) {
  if (!G || G.over || G.busy) return;
  Sound.resume();
  G.busy = true;
  render();

  const p = G.player, e = G.enemy;
  p.defending = false;

  const skill = SKILLS[action];

  // 检查冷却与蓝耗
  if (action !== 'attack' && action !== 'defend') {
    // ---- 调试：无冷却 / 无限法力 ----
    if (!G._noCd && p.cds[action] > 0) { G.busy = false; render(); return; }
    if (!G._infMp && p.mp < skill.mp) { G.busy = false; render(); return; }
    if (!G._infMp) p.mp -= skill.mp;
    if (skill.cd > 0 && !G._noCd) p.cds[action] = skill.cd;
  }

  let skipEnemyTurn = false;
  void skipEnemyTurn;

  switch (action) {
    case 'attack':
      Sound.attack();
      await playerAttackSequence(1.0, '攻击');
      break;

    case 'skill':
      Sound.cast();
      log(`<b>${p.name}</b> 释放【${SKILLS.skill.name}】！`, 'player');
      await playerSkillSequence(SKILLS.skill, 'skill');
      break;

    case 'skill2':
      Sound.cast();
      log(`<b>${p.name}</b> 释放【${SKILLS.skill2.name}】！`, 'player');
      await playerSkillSequence(SKILLS.skill2, 'skill2');
      break;

    case 'poison':
      Sound.poison();
      log(`<b>${p.name}</b> 释放【${SKILLS.poison.name}】！`, 'player');
      await playerSkillSequence(SKILLS.poison, 'poison');
      break;

    case 'heal':
      Sound.heal();
      {
        const before = p.hp;
        const healAmt = skillPower('heal').heal;
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        const healed = Math.round(p.hp - before);
        log(`<b>${p.name}</b> 使用【治疗术】，恢复 <b>${healed}</b> 点生命。`, 'heal');
        Effects.healBurst(heroPos.clone().setY(1.5));
        floatOn('player', '+' + healed, 'heal');
        Sound.heal();
        render();
      }
      break;

    case 'defend':
      Sound.defend();
      p.defending = true;
      const mpGain = 8;
      p.mp = Math.min(p.maxMp, p.mp + mpGain);
      addStatus(p, 'defup', 1);
      log(`<b>${p.name}</b> 摆出防御姿态，恢复 ${mpGain} 点法力。`, 'player');
      floatOn('player', '🛡', 'miss');
      render();
      break;
  }

  // 玩家回合结束，检查敌人死亡
  if (e.hp <= 0) {
    await onEnemyDefeated();
    G.busy = false;
    return;
  }

  // 敌人回合
  await sleep(450);

  if (!G.over && e.hp > 0) {
    await enemyTurn();
  }

  if (G.over) { G.busy = false; return; }

  // 回合结束处理
  await sleep(200);

  // 状态结算
  tickStatuses(p, true);
  tickStatuses(e, false);

  // 检查死亡
  if (e.hp <= 0) { await onEnemyDefeated(); G.busy = false; return; }
  // 调试：无敌模式防止玩家死亡
  if (G._godMode && p.hp <= 0) { p.hp = 1; log('🛡 无敌模式：免疫致命伤害', 'sys'); }
  if (p.hp <= 0) { onPlayerDefeated(); G.busy = false; return; }

  // 冷却递减
  Object.keys(p.cds).forEach(k => { if (p.cds[k] > 0) p.cds[k]--; });
  // 每回合回蓝
  p.mp = Math.min(p.maxMp, p.mp + 3);

  // ---- 扩展功能：每回合恢复 ----
  if (typeof Features !== 'undefined' && p.hp > 0) {
    let regen = 0;
    // 技能树：再生
    if (Features.hasSkill('regen')) regen += Math.round(p.maxHp * 0.03);
    // 宠物：精灵
    if (Features.activePet() === 'fairy') regen += Math.round(p.maxHp * 0.05);
    if (regen > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + regen);
      floatOn('player', '+' + regen, 'heal');
    }
  }

  // 玩家临时防御状态递减
  p.statuses.forEach(s => { if (s.key === 'defup') s.turns--; });
  p.statuses = p.statuses.filter(s => s.turns > 0);

  G.round++;
  G.busy = false;
  render();
  saveGame();
}

// 玩家普攻序列
async function playerAttackSequence(mult, label) {
  const e = G.enemy;
  return new Promise(resolve => {
    playAttackAnim('player', () => {
      const result = calcDamage(G.player, e, mult, true);
      applyDamageToEnemy(result, label);
      resolve();
    });
  });
}

// 玩家技能序列
async function playerSkillSequence(skill, key) {
  const e = G.enemy;
  await sleep(120);

  const power = key ? skillPower(key) : { mult: skill.mult };

  // 技能特效
  const enemyCenter = enemyPos.clone().setY(1.6);
  const heroCenter = heroPos.clone().setY(1.8);

  if (skill.effect === 'fire') Effects.fireSlash(heroCenter, enemyCenter);
  else if (skill.effect === 'ice') Effects.iceBolt(heroCenter, enemyCenter);
  else if (skill.effect === 'poison') Effects.poisonCloud(enemyCenter);

  return new Promise(resolve => {
    playAttackAnim('player', () => {
      if (skill.effect === 'fire') { Sound.fire(); Effects.fireSlash(heroCenter, enemyCenter); }
      else if (skill.effect === 'ice') { Sound.ice(); Effects.iceBolt(heroCenter, enemyCenter); }
      else if (skill.effect === 'poison') { Sound.poison(); Effects.poisonCloud(enemyCenter); }

      const result = calcDamage(G.player, e, power.mult, true);
      applyDamageToEnemy(result, skill.name, skill.status);
      resolve();
    });
  });
}

function applyDamageToEnemy(result, label, statusKey) {
  const e = G.enemy;
  const enemyCenter = enemyPos.clone().setY(1.6);

  if (result.miss) {
    log(`<b>${G.player.name}</b> 的${label}被闪避了！`, 'miss');
    floatOn('enemy', 'MISS', 'miss');
    // 闪避中断连击
    G.combo = 0;
    render();
    return;
  }

  // 连击累加
  G.combo++;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;

  // 连击伤害加成（每连击 +5%，最多 +50%）
  const comboBonus = Math.min(0.5, (G.combo - 1) * 0.05);
  if (comboBonus > 0) result.dmg = Math.round(result.dmg * (1 + comboBonus));
  result.combo = G.combo;

  e.hp -= result.dmg;

  if (result.crit) {
    log(`<b>${G.player.name}</b> 的${label}暴击！造成 <b>${result.dmg}</b> 点伤害 🔥`, 'crit');
    floatOn('enemy', '-' + result.dmg, 'crit');
    Effects.critBurst(enemyCenter);
    Sound.crit();
    screenFlash(0xffffff, 0.5);
    slowMotion(0.35, 420);
    camShake = 1.6;
    // ---- 扩展功能：暴击特写 + 成就 ----
    if (typeof Features !== 'undefined') { Features.critCinematic(); Features.trackCrit(); }
  } else {
    log(`<b>${G.player.name}</b> 的${label}造成 <b>${result.dmg}</b> 点伤害。`, 'player');
    floatOn('enemy', '-' + result.dmg, 'dmg');
    Effects.hitSpark(enemyCenter, 0xffaa66);
    Sound.hit();
    camShake = 0.7;
  }

  // ---- 扩展功能：武器附魔效果 ----
  if (typeof Features !== 'undefined') {
    const ench = Features.getWeaponEnchant();
    if (ench && e.hp > 0) {
      if (ench.id === 'fire') {
        const burn = Math.max(1, Math.round(result.dmg * 0.15));
        e.hp -= burn;
        log(`🔥 火焰附魔追加 <b>${burn}</b> 点灼烧伤害。`, 'crit');
        Effects.fireSlash(enemyCenter, enemyCenter.clone());
      } else if (ench.id === 'ice') {
        if (Math.random() < 0.25) { addStatus(e, 'slow', 2); log('❄️ 寒冰附魔：敌人被减速！', 'sys'); }
      } else if (ench.id === 'light') {
        if (Math.random() < 0.20) { addStatus(e, 'stun', 1); log('⚡ 雷电附魔：敌人被眩晕！', 'sys'); }
      } else if (ench.id === 'vamp') {
        const heal = Math.max(1, Math.round(result.dmg * 0.15));
        G.player.hp = Math.min(G.player.maxHp, G.player.hp + heal);
        floatOn('player', '+' + heal, 'heal');
        log(`🩸 吸血附魔恢复 <b>${heal}</b> 点生命。`, 'heal');
      }
    }
    // 技能树吸血
    if (Features.hasSkill('vamp')) {
      const heal = Math.max(1, Math.round(result.dmg * 0.12));
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + heal);
    }
    // 宠物：影狼追击
    if (Features.activePet() === 'wolf') {
      const extra = Math.max(1, Math.round(result.dmg * 0.15));
      e.hp -= extra;
      log(`🐺 影狼追击，追加 <b>${extra}</b> 点伤害。`, 'sys');
      floatOn('enemy', '-' + extra, 'dmg');
    }
  }

  // 连击提示
  if (G.combo >= 2) {
    showCombo(G.combo);
  }

  // 附加状态
  if (statusKey && e.hp > 0) {
    const dur = statusKey === 'poison' ? 3 : statusKey === 'burn' ? 3 : 2;
    if (Math.random() < 0.75) {
      addStatus(e, statusKey, dur);
      log(`<b>${e.name}</b> 陷入【${statusName(statusKey)}】状态！`, 'sys');
    }
  }

  // 受击闪光
  flashModel(enemyModel, 0xff4444);
  if (heroGlyph) heroGlyph.pulse = 0.8;
  render();
}

// 模型受击闪光
function flashModel(model, color) {
  if (!model) return;
  const mats = [];
  model.traverse(o => {
    if (o.material && o.material.emissive && o.material.emissiveIntensity !== undefined) {
      if (o.userData._flashOrig === undefined) {
        o.userData._flashOrig = o.material.emissive.getHex();
      }
      mats.push(o);
      o.material.emissive.setHex(color);
      o.material.emissiveIntensity = 1.2;
    }
  });
  setTimeout(() => {
    mats.forEach(o => {
      if (o.material) {
        o.material.emissive.setHex(o.userData._flashOrig || 0x000000);
        o.material.emissiveIntensity = 1;
      }
    });
  }, 120);
}

// ==================== 敌人 AI ====================
// 根据当前血量智能选择绝招
function pickEnemySpecial(e) {
  const hp = e.hp / e.maxHp;
  const base = e.special || SPECIALS.shadowStrike;
  const pool = base.pool || [base];
  const healSkills = pool.filter(s => s.heal || s.healPct || s.drain);
  const attackSkills = pool.filter(s => !s.heal && !s.healPct && !s.drain);

  // 血量 < 50%：优先用回血/吸血类（血量越低越优先）
  if (hp < 0.5 && healSkills.length) {
    // 血量 < 25% 时几乎必用回血
    const useHeal = hp < 0.25 ? Math.random() < 0.9 : Math.random() < 0.65;
    if (useHeal) {
      return healSkills[Math.floor(Math.random() * healSkills.length)];
    }
  }
  // 满血时不浪费回血技能 → 用攻击类
  if (hp >= 0.5 && attackSkills.length) {
    return attackSkills[Math.floor(Math.random() * attackSkills.length)];
  }
  // 其他情况：随机（如果没有攻击类则用候选池）
  const fallback = attackSkills.length ? attackSkills : (pool.length ? pool : [base]);
  return fallback[Math.floor(Math.random() * fallback.length)];
}

// 使用绝招（每个怪物独一无二，会根据血量选招）
async function useEnemySpecial() {
  const e = G.enemy, p = G.player;
  const sp = pickEnemySpecial(e);

  // 宣告
  log(`<b>${e.name}</b> 发动绝招【${sp.icon} ${sp.name}】！`, 'enemy');
  Sound.cast();

  // 屏幕震动 + 特效
  const ecenter = enemyPos.clone().setY(1.5);
  const pcenter = heroPos.clone().setY(1.8);
  Effects.spawnPoof(ecenter, sp.color);
  if (typeof Features !== 'undefined' && Features.goldRain === undefined) { /* noop */ }

  await sleep(280);

  // ---- 自身增益类绝招（不弙击）----
  if (sp.self) {
    if (sp.healPct) {
      const heal = Math.round(e.maxHp * sp.healPct);
      e.hp = Math.min(e.maxHp, e.hp + heal);
      floatOn('enemy', '+' + heal, 'heal');
      Effects.healBurst(ecenter);
      log(`<b>${e.name}</b> 恢复了 <b>${heal}</b> 点生命。`, 'enemy');
    }
    if (sp.status) {
      addStatus(e, sp.status, 3);
    }
    flashModel(enemyModel, sp.color);
    camShake = 1.0;
    render();
    return;
  }

  // ---- 攻击类绝招 ----
  return new Promise(resolve => {
    playAttackAnim('enemy', () => {
      // 技能特效
      if (sp.id === 'fireBreath' || sp.id === 'meteor') Effects.fireSlash(ecenter, pcenter);
      else if (sp.id === 'iceStorm') Effects.iceBolt(ecenter, pcenter);
      else if (sp.id === 'venomSpray') Effects.poisonCloud(pcenter);
      else if (sp.id === 'divineWrath' || sp.id === 'thunderStrike') Effects.critBurst(pcenter);
      else Effects.hitSpark(pcenter, sp.color);

      // 伤害计算（quake 无视部分防御）
      let mult = sp.mult || 1.6;
      const result = calcDamage(e, p, mult, false);

      if (result.miss) {
        log(`<b>${p.name}</b> 闪避了【${sp.name}】！`, 'miss');
        floatOn('player', 'MISS', 'miss');
        render();
        resolve();
        return;
      }

      // 命中
      p.hp -= result.dmg;
      floatOn('player', '-' + result.dmg, result.crit ? 'crit' : 'dmg');
      Effects.hitSpark(pcenter, sp.color);
      flashModel(heroModel, sp.color);
      camShake = 1.6;
      screenFlash(sp.color, result.crit ? 0.4 : 0.22, 260);

      if (result.crit) {
        log(`💥 <b>${e.name}</b> 的【${sp.name}】暴击！造成 <b>${result.dmg}</b> 点伤害！`, 'crit');
        Sound.crit();
      } else {
        log(`<b>${e.name}</b> 的【${sp.name}】造成 <b>${result.dmg}</b> 点伤害。`, 'enemy');
        Sound.hit();
      }

      // 附带状态（对玩家）
      if (sp.status && sp.status !== 'atkup' && sp.status !== 'defup') {
        const chance = e.isBoss ? 0.9 : 0.65;
        if (Math.random() < chance) {
          addStatus(p, sp.status, 2);
          log(`<b>${p.name}</b> 陷入【${statusName(sp.status)}】！`, 'sys');
        }
      }

      // 吸血
      if (sp.drain && result.dmg > 0) {
        const heal = Math.max(1, Math.round(result.dmg * sp.drain));
        e.hp = Math.min(e.maxHp, e.hp + heal);
        floatOn('enemy', '+' + heal, 'heal');
        log(`<b>${e.name}</b> 吸取了 <b>${heal}</b> 点生命。`, 'enemy');
      }

      render();
      resolve();
    });
  });
}

async function enemyTurn() {
  const e = G.enemy, p = G.player;
  e.defending = false;

  // 眩晕检查
  if (hasStatus(e, 'stun')) {
    log(`<b>${e.name}</b> 处于眩晕，无法行动！`, 'sys');
    render();
    return;
  }

  const hpPct = e.hp / e.maxHp;
  let choice = 'attack';
  const roll = Math.random();

  // Boss 更聪明：提高容错与技能使用率
  const isBoss = !!e.isBoss;
  const isMini = !!e.isMiniBoss;
  const specChance = isBoss ? 0.7 : isMini ? 0.52 : 0.42;
  const defChance = isBoss ? 0.06 : isMini ? 0.1 : 0.14;

  // AI 决策（血量低 → 更渴望用绝招，绝招会优先选回血类）
  if (hpPct < 0.3) {
    // 血量 < 30%：高概率发动绝招（回血）
    choice = roll < 0.75 ? 'special' : 'attack';
  } else if (hpPct < 0.6) {
    // 血量 < 60%：中等概率用绝招
    choice = roll < specChance + 0.15 ? 'special' : (roll < defChance ? 'defend' : 'attack');
  } else if (roll < specChance) {
    choice = 'special';
  } else if (roll < defChance) {
    choice = 'defend';
  }

  // 关卡越深，AI 越激进（按区域计算，避免后期过难）
  const aggression = Math.min(1, Math.floor(G.stageIndex / 100) / 9);
  const specBoost = aggression * 0.25 + (isBoss ? 0.15 : 0);
  if (Math.random() < specBoost && hpPct >= 0.3) choice = 'special';

  switch (choice) {
    case 'rage': {
      const heal = Math.round(e.maxHp * 0.1);
      e.hp = Math.min(e.maxHp, e.hp + heal);
      addStatus(e, 'atkup', 3);
      log(`<b>${e.name}</b> 陷入狂暴！恢复 <b>${heal}</b> 点生命，攻击力大幅提升！`, 'enemy');
      floatOn('enemy', '+' + heal, 'heal');
      Effects.healBurst(enemyPos.clone().setY(1.5));
      Sound.cast();
      flashModel(enemyModel, 0xff2222);
      render();
      break;
    }

    case 'defend': {
      e.defending = true;
      addStatus(e, 'defup', 1);
      log(`<b>${e.name}</b> 进入防御姿态。`, 'enemy');
      render();
      break;
    }

    case 'special': {
      return await useEnemySpecial();
    }

    default: {
      return new Promise(resolve => {
        playAttackAnim('enemy', () => {
          Sound.attack();
          const result = calcDamage(e, p, 1.0, false);
          applyDamageToPlayer(result, '攻击');
          resolve();
        });
      });
    }
  }
}

function applyDamageToPlayer(result, label) {
  const p = G.player;
  const heroCenter = heroPos.clone().setY(1.8);

  if (result.miss) {
    log(`<b>${G.enemy.name}</b> 的${label}被闪避了！`, 'miss');
    floatOn('player', 'MISS', 'miss');
    render();
    return;
  }

  // ---- 扩展功能：石魔像减伤 ----
  if (typeof Features !== 'undefined' && Features.activePet() === 'golem') {
    result.dmg = Math.max(1, Math.round(result.dmg * 0.88));
  }

  // ---- 调试：无敌模式 ----
  if (G._godMode) {
    floatOn('player', 'INVULN', 'miss');
    log('🛡 无敌模式：免疫本次伤害', 'sys');
    render();
    return;
  }

  p.hp -= result.dmg;

  // ---- 扩展功能：荆棘反弹 ----
  if (typeof Features !== 'undefined' && Features.hasSkill('thorns') && result.dmg > 0) {
    const reflect = Math.max(1, Math.round(result.dmg * 0.20));
    G.enemy.hp -= reflect;
    log(`🌵 荆棘反弹 <b>${reflect}</b> 点伤害。`, 'sys');
    floatOn('enemy', '-' + reflect, 'dmg');
  }

  // 玩家受击：中断连击
  if (G.combo > 0) {
    log(`连击被中断！`, 'miss');
  }
  G.combo = 0;

  if (result.crit) {
    log(`<b>${G.enemy.name}</b> 的${label}暴击！造成 <b>${result.dmg}</b> 点伤害 💥`, 'crit');
    floatOn('player', '-' + result.dmg, 'crit');
    Effects.critBurst(heroCenter);
    Sound.crit();
  } else {
    log(`<b>${G.enemy.name}</b> 的${label}造成 <b>${result.dmg}</b> 点伤害。`, 'enemy');
    floatOn('player', '-' + result.dmg, 'dmg');
    Effects.hitSpark(heroCenter, 0xff6666);
    Sound.hit();
  }

  flashModel(heroModel, 0xff3333);
  camShake = 1.0;
  render();
}

// ==================== 胜负处理 ====================
async function onEnemyDefeated() {
  const e = G.enemy;
  G.over = true;
  Sound.enemyDown();
  Effects.deathBurst(enemyPos.clone().setY(1.5), 0xff4466);
  flashModel(enemyModel, 0xffffff);
  camShake = 1.8;

  // 击杀特写 + 闪光
  killCloseup(enemyPos);
  screenFlash(0xffffff, 0.35, 350);
  if (enemyGlyph) enemyGlyph.pulse = 1.5;

  log(`🎉 <b>${e.name}</b> 被击败了！`, 'sys');

  // ---- Boss 挑战：胜利直接跳过 100 关（优先处理）----
  if (G.bossChallenge && typeof Features !== 'undefined' && Features.onBossChallengeWin) {
    G.over = true;
    render();
    await sleep(900);
    Features.onBossChallengeWin();
    return;
  }

  // ---- 扩展功能：击杀事件 ----
  if (typeof Features !== 'undefined') {
    Features.trackKill();
    Features.recordBestiaryDefeat(e.type);
    Features.unlockAchievement('first_win');
    if (e.isBoss) Features.unlockAchievement('boss1');
    if (G.player.gold >= 1000) Features.unlockAchievement('golds1000');
    if (G.stageIndex + 1 >= 100) Features.unlockAchievement('stage100');
    if (G.stageIndex + 1 >= 500) Features.unlockAchievement('stage500');
  }

  // 无尽模式分支
  if (G.endless) {
    render();
    await sleep(700);
    Features.recordScore('endless', G.endlessFloor);
    if (G.endlessFloor >= 10) Features.unlockAchievement('endless10');
    Features.onEndlessClear();
    return;
  }

  // 普通关卡：连续战斗奖励
  if (typeof Features !== 'undefined') Features.checkStreak();

  render();

  // 结算奖励
  const expGain = e.exp;
  const goldGain = e.gold;

  // 金币掉落动画
  if (typeof Features !== 'undefined') Features.goldRain(goldGain);

  await sleep(900);

  // 掉落
  const drops = rollDrops();

  // 弹结算
  G.resultData = { expGain, goldGain, drops };
  showResult('win');
}

function onPlayerDefeated() {
  G.over = true;
  Sound.defeat();

  // ---- Boss 挑战失败：恢复原关卡 ----
  if (G.bossChallenge) {
    G.bossChallenge = false;
    log(`💀 <b>${G.player.name}</b> 在 Boss 挑战中倒下了……`, 'sys');
    toast('Boss 挑战失败，返回原关卡', '#ff8866');
    render();
    setTimeout(() => {
      const p = G.player;
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      p.statuses = [];
      p.cds = { skill: 0, skill2: 0, heal: 0, poison: 0 };
      G._bossBackup = null;
      buildStage(G.stageIndex);
      G.busy = false;
      render();
      saveGame();
    }, 1200);
    return;
  }

  // 记录本关失败次数
  const stage = G.stageIndex;
  if (!G.failCounts) G.failCounts = {};
  G.failCounts[stage] = (G.failCounts[stage] || 0) + 1;
  const fails = G.failCounts[stage];
  log(`💀 <b>${G.player.name}</b> 倒下了……（本关失败 ${fails}/5）`, 'sys');
  render();
  setTimeout(() => showResult('lose'), 800);
}

function rollDrops() {
  const drops = [];
  const stage = STAGES[G.stageIndex];
  const n = G.stageIndex + 1;
  const guarantee = !!(G && G._guaranteedDrop);   // 调试：必掉落

  // 装备掉落（Boss 必掉，普通怪概率掉）
  const dropChance = guarantee ? 1.0 : (G.enemy.isBoss ? 1.0 : G.enemy.isMiniBoss ? 0.85 : 0.62);
  if (Math.random() < dropChance) {
    // 根据关卡进度挑合适的装备
    const equip = pickEquip(G.stageIndex, 1);
    // 品质：Boss 关更容易出紫装，但整体以中低品质为主
    const rarityBonus = guarantee ? 1.0 : (G.enemy.isBoss ? 0.12 : G.enemy.isMiniBoss ? 0.05 : 0);
    const rarity = randRarity(rarityBonus);
    drops.push(makeItem(equip, rarity, stage.lv));
  }

  // Boss 额外掉一件（品质略高）
  if (guarantee || (G.enemy.isBoss && Math.random() < 0.5)) {
    const equip = pickEquip(G.stageIndex, 1);
    drops.push(makeItem(equip, randRarity(guarantee ? 1.0 : 0.1), stage.lv));
  }

  // 消耗品掉落
  if (guarantee || Math.random() < 0.7) {
    const key = Math.random() < 0.7 ? 'potion' : (Math.random() < 0.6 ? 'ether' : 'elixir');
    drops.push(makeConsumable(key, 1));
  }

  return drops;
}

// ==================== 结算窗口 ====================
function showResult(type) {
  const modal = document.getElementById('resultModal');
  const icon = document.getElementById('rIcon');
  const title = document.getElementById('rTitle');
  const text = document.getElementById('rText');
  const reward = document.getElementById('rewardBox');
  const btn = document.getElementById('rBtn');

  const isLast = G.stageIndex >= STAGES.length - 1;

  if (type === 'win') {
    Sound.victory();
    const isBoss = G.enemy.isBoss;
    const isMini = G.enemy.isMiniBoss;
    if (isLast) {
      icon.textContent = '👑';
      title.textContent = '全 部 通 关';
      text.textContent = `你征服了全部 ${STAGES.length} 关，成为真正的传奇！`;
    } else if (isBoss) {
      icon.textContent = '👑';
      title.textContent = 'B O S S 击 破';
      text.textContent = `击败了 ${G.enemy.name}，通往下一区域！`;
    } else if (isMini) {
      icon.textContent = '⭐';
      title.textContent = '胜 利';
      text.textContent = `击败了小 Boss ${G.enemy.name}`;
    } else {
      icon.textContent = '🏆';
      title.textContent = '胜 利';
      text.textContent = `击败了 ${G.enemy.name}`;
    }
    title.className = 'win';
  } else {
    icon.textContent = '💀';
    title.textContent = '失 败';
    title.className = 'lose';
    text.textContent = `你被击败了（第 ${G.stageIndex + 1} 关），但冒险仍将继续…`;
  }

  // 奖励展示
  reward.innerHTML = '';
  if (type === 'win') {
    const { expGain, goldGain, drops } = G.resultData;
    let html = '<div class="reward-title">战斗奖励</div>';
    html += `<div class="reward-item"><span class="r-ico">⭐</span><span class="r-name">经验值</span><b style="color:#d4a8ff">+${expGain}</b></div>`;
    html += `<div class="reward-item"><span class="r-ico">💰</span><span class="r-name">金币</span><b style="color:#ffcc55">+${goldGain}</b></div>`;
    drops.forEach((d, i) => {
      const r = RARITY[d.rarity];
      html += `<div class="reward-item" style="animation-delay:${(i + 2) * 0.08}s">
        <span class="r-ico">${d.icon}</span>
        <span class="r-name">${d.name}</span>
        <span class="r-rarity" style="background:${r.color}22;color:${r.color}">${r.name}</span>
      </div>`;
    });
    reward.innerHTML = html;
    G.pendingReward = { expGain, goldGain, drops };

    // 连击展示
    if (G.maxCombo >= 3) {
      html += ''; // keep
      const comboEl = document.createElement('div');
      comboEl.className = 'reward-item';
      comboEl.innerHTML = `<span class="r-ico">🔥</span><span class="r-name">最高连击</span><b style="color:#ff8844">${G.maxCombo} 连</b>`;
      reward.appendChild(comboEl);
    }

    btn.textContent = isLast ? '完成冒险' : '进入下一关';
    btn.onclick = () => applyRewardAndNext(isLast);

    // 商店按钮（非最终关）：作为进入下一关前的可选环节
    let shopBtn = document.getElementById('rShopBtn');
    if (!shopBtn) {
      shopBtn = document.createElement('button');
      shopBtn.id = 'rShopBtn';
      shopBtn.className = 'big-btn shop-entry';
      btn.parentNode.insertBefore(shopBtn, btn.nextSibling);
    }
    shopBtn.style.display = isLast ? 'none' : 'block';
    shopBtn.textContent = '🏪 前往商店（再进下一关）';
    shopBtn.onclick = () => {
      Sound.click();
      document.getElementById('resultModal').classList.remove('show');
      // 先发放奖励，避免玩家在商店中关闭页面导致丢失
      applyPendingReward();
      // 标记：从商店关闭后要进入下一关
      G.shopReturnTo = 'next';
      openShop();
    };

    Sound.item();
  } else {
    reward.innerHTML = '';
    const stage = G.stageIndex;
    const fails = (G.failCounts && G.failCounts[stage]) || 0;
    const need = 5;
    const canSkip = fails >= need;

    // 展示失败进度
    if (!canSkip) {
      reward.innerHTML = `<div class="reward-title">本关失败次数</div>
        <div class="reward-item"><span class="r-ico">💀</span><span class="r-name">已失败</span><b style="color:#ff5566">${fails} / ${need}</b></div>
        <div style="font-size:11px;color:#8888aa;padding:6px 10px">再失败 ${need - fails} 次将自动跳过本关</div>`;
    } else {
      reward.innerHTML = `<div class="reward-title">连续失败 ${fails} 次</div>
        <div style="font-size:12px;color:#ffcc55;padding:8px 10px">可选择跳过本关，直接进入下一关</div>`;
    }

    // 主按钮：重新挑战
    btn.textContent = '重新挑战';
    btn.onclick = () => retryStage();

    // 跳过按钮（失败 5 次后出现）
    let skipBtn = document.getElementById('rSkipBtn');
    if (!skipBtn) {
      skipBtn = document.createElement('button');
      skipBtn.id = 'rSkipBtn';
      skipBtn.className = 'big-btn skip-entry';
      btn.parentNode.insertBefore(skipBtn, btn.nextSibling);
    }
    skipBtn.style.display = canSkip ? 'block' : 'none';
    skipBtn.textContent = '⏭ 跳过本关';
    skipBtn.onclick = () => skipStage();

    const sb = document.getElementById('rShopBtn');
    if (sb) sb.style.display = 'none';

    // 达到 5 次失败：延迟后自动跳过（给玩家选择时间）
    if (canSkip) {
      if (G._autoSkipTimer) clearTimeout(G._autoSkipTimer);
      G._autoSkipTimer = setTimeout(() => {
        const m = document.getElementById('resultModal');
        if (m && m.classList.contains('show')) {
          log('⏭ 连续失败 5 次，自动跳过本关…', 'sys');
          skipStage();
        }
      }, 3500);
    }
  }

  // 重置连击（在展示完结算信息后，延迟到下关开始时才真正清零）
  // 这里不动 maxCombo，供结算展示；combo 清零避免跨回合延续
  G.combo = 0;

  modal.classList.add('show');
}

function applyRewardAndNext(isLast) {
  Sound.click();
  document.getElementById('resultModal').classList.remove('show');

  if (isLast) {
    // 通关
    localStorage.removeItem('dq3d_save');
    setTimeout(() => {
      // 展示通关信息后重新开始
      document.getElementById('startModal').classList.add('show');
      document.getElementById('continueBtn').style.display = 'none';
      G = newGame();
    }, 300);
    return;
  }

  // 应用奖励（只应用一次）
  applyPendingReward();

  // 进入下一关
  continueToNextStage();
}

// 发放待领取的战斗奖励（幂等，只发一次）
function applyPendingReward() {
  if (!G || !G.resultData || G.rewardApplied) return;
  const { expGain, goldGain, drops } = G.resultData;
  G.player.gold += goldGain;
  drops.forEach(d => addToBag(d));
  gainExp(expGain);
  G.rewardApplied = true;
}

// 进入下一关（供结算按钮与商店共用）
function continueToNextStage() {
  if (!G) return;
  if (G.stageIndex >= STAGES.length - 1) return; // 已是最后一关

  // 关掉可能还开着的弹窗
  document.getElementById('resultModal').classList.remove('show');
  document.getElementById('shopModal').classList.remove('show');

  buildStage(G.stageIndex + 1);
  G.rewardApplied = false;
  G.resultData = null;
  G.busy = false;
  G.combo = 0;
  G.maxCombo = 0;
  // 记录最高关卡排行
  if (typeof Features !== 'undefined') Features.recordScore('stage', G.stageIndex + 1);
  render();
  saveGame();
}

function retryStage() {
  Sound.click();
  document.getElementById('resultModal').classList.remove('show');
  if (G._autoSkipTimer) { clearTimeout(G._autoSkipTimer); G._autoSkipTimer = null; }

  // 恢复玩家满状态
  const p = G.player;
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.statuses = [];
  p.cds = { skill: 0, skill2: 0, heal: 0, poison: 0 };

  buildStage(G.stageIndex);
  G.rewardApplied = false;
  G.resultData = null;
  G.shopReturnTo = null;
  G.busy = false;
  render();
  saveGame();
}

// 跳过当前关卡（连续失败 5 次后）
function skipStage() {
  if (G._autoSkipTimer) { clearTimeout(G._autoSkipTimer); G._autoSkipTimer = null; }
  document.getElementById('resultModal').classList.remove('show');
  Sound.click();

  const skipped = G.stageIndex + 1;
  const isLast = G.stageIndex >= STAGES.length - 1;
  log(`⏭ 跳过第 ${skipped} 关，前往下一关…`, 'sys');

  // 清除本关失败记录
  if (G.failCounts) delete G.failCounts[G.stageIndex];

  if (isLast) {
    // 已是最后一关：直接完成冒险
    localStorage.removeItem('dq3d_save');
    setTimeout(() => {
      document.getElementById('startModal').classList.add('show');
      document.getElementById('continueBtn').style.display = 'none';
      G = newGame();
    }, 300);
    return;
  }

  // 恢复满状态并进入下一关
  const p = G.player;
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.statuses = [];
  p.cds = { skill: 0, skill2: 0, heal: 0, poison: 0 };

  // 发少量经验作为补偿
  if (typeof gainExp === 'function') {
    const bonus = Math.round(20 * (1 + G.stageIndex / 100));
    log(`跳过奖励：获得 ${bonus} 点经验。`, 'exp');
    gainExp(bonus);
  }

  buildStage(G.stageIndex + 1);
  G.rewardApplied = false;
  G.resultData = null;
  G.shopReturnTo = null;
  G.busy = false;
  G.combo = 0;
  G.maxCombo = 0;
  render();
  saveGame();
}

function gainExp(amount) {
  const p = G.player;
  p.exp += amount;
  log(`获得 <b>${amount}</b> 点经验值。`, 'exp');
  floatOn('player', '+' + amount + ' EXP', 'exp');

  // 升级（所需经验为幂函数，保证 1000 关内能持续升级）
  let guard = 0;
  while (p.exp >= p.expNext && guard++ < 50) {
    p.exp -= p.expNext;
    p.lv++;
    // 升级增益随等级加速，与敌人成长同步
    const k = 1 + p.lv * 0.05;
    const hpUp = Math.round(25 * k);
    const mpUp = Math.round(6 * k);
    const atkUp = Math.round(4 * k);
    const defUp = Math.round(2.5 * k);
    p.maxHp += hpUp; p.hp = p.maxHp;
    p.maxMp += mpUp; p.mp = p.maxMp;
    p.atk += atkUp; p.def += defUp;

    // 下一级所需经验（幂函数）
    p.expNext = Math.round(50 + Math.pow(p.lv, 1.6) * 18);

    log(`⭐ <b>升级！</b> 勇者达到 Lv.${p.lv}！生命/法力全满，属性提升。`, 'sys');
    Sound.levelUp();
    Effects.levelUpBurst(heroPos.clone().setY(1.5));
    floatOn('player', 'LEVEL UP!', 'heal');

    // 升级时解除异常
    p.statuses = [];

    // ---- 扩展功能：升级事件 ----
    if (typeof Features !== 'undefined') {
      // 同步基础属性（技能加成基于此重算）
      Features.syncBaseStats();
      Features.applySkills();
      // 等级成就
      if (p.lv >= 10) Features.unlockAchievement('lv10');
      if (p.lv >= 50) Features.unlockAchievement('lv50');
      // 技能点提示
      const pts = Features.skillPoints();
      if (pts > 0) log(`🌳 获得技能点！当前可用：<b>${pts}</b> 点（菜单→技能树）`, 'sys');
    }
  }
}

// ==================== 背包 / 物品 ====================
function addToBag(item) {
  const p = G.player;
  // 消耗品可堆叠
  if (item.kind === 'consume') {
    const exist = p.bag.find(i => i.kind === 'consume' && i.key === item.key);
    if (exist) { exist.count += item.count; }
    else p.bag.push(item);
  } else {
    p.bag.push(item);
  }
  updateBagBadge();
  saveGame();
}

function updateBagBadge() {
  const badge = document.getElementById('bagBadge');
  const n = G ? G.player.bag.length : 0;
  badge.textContent = n;
  badge.classList.toggle('show', n > 0);
}

function openBag() {
  if (!G) return;
  Sound.click();
  renderBag();
  document.getElementById('bagModal').classList.add('show');
}
function closeBag() {
  Sound.click();
  document.getElementById('bagModal').classList.remove('show');
}

// ---------- 自动背包：装备更好的装备 / 使用消耗品 ----------
// 返回 true 表示执行了一次操作（供自动战斗调度）
function autoUseBag(step) {
  if (!G) return false;
  const p = G.player;

  // step 1：装备背包里更强的装备
  if (step === 1) {
    const equips = p.bag.filter(i => i.kind === 'equip');
    if (!equips.length) return false;
    // 只装比现在更强的
    const candidates = equips.filter(it => {
      const cur = p.equip[it.slot];
      return !cur || it.value > cur.value;
    });
    if (!candidates.length) return false;
    candidates.sort((a, b) => {
      const ae = p.equip[a.slot] ? 1 : 0;
      const be = p.equip[b.slot] ? 1 : 0;
      if (ae !== be) return ae - be;      // 空槽优先
      return b.value - a.value;            // 再按数值
    });
    useItem(candidates[0].id);
    return true;
  }

  // step 2：使用消耗品（血/蓝不满时）
  if (step === 2) {
    // 生命低 → 喝药
    if (p.hp < p.maxHp * 0.6) {
      const potion = p.bag.find(i => i.kind === 'consume' && i.key === 'potion');
      if (potion) { useItem(potion.id); return true; }
    }
    // 法力低 → 喝魔药
    if (p.mp < p.maxMp * 0.4) {
      const ether = p.bag.find(i => i.kind === 'consume' && i.key === 'ether');
      if (ether) { useItem(ether.id); return true; }
    }
    return false;
  }

  return false;
}

function renderBag() {
  const p = G.player;
  const grid = document.getElementById('bagGrid');
  const equipGrid = document.getElementById('equipGrid');
  const equipRow = document.getElementById('equipRow');

  // 装备栏（3 个槽位）
  const slotMeta = [
    { key: 'weapon', icon: '🗡', label: '武器' },
    { key: 'armor',  icon: '🛡', label: '护甲' },
    { key: 'acc',    icon: '💍', label: '饰品' }
  ];
  equipRow.innerHTML = slotMeta.map(s => {
    const e = p.equip[s.key];
    const r = e ? RARITY[e.rarity] : null;
    return `<div class="equip-slot ${e ? 'filled ' + r.cls : ''}" title="${e ? e.name + ' ' + e.desc : s.label}" onclick="unequip('${s.key}')">
      <span>${e ? e.icon : s.icon}</span>
      <span class="slot-name" style="${e ? 'color:' + r.color : ''}">${e ? e.name : s.label}</span>
    </div>`;
  }).join('');

  // 背包物品
  const items = p.bag;
  grid.innerHTML = items.length
    ? items.map(it => {
        const r = RARITY[it.rarity];
        return `<div class="bag-item ${r.cls}" onclick="useItem('${it.id}')" title="${it.name}\n${it.desc}">
          <span class="bi-ico">${it.icon}</span>
          <span class="bi-name">${it.name}</span>
          ${it.kind === 'consume' && it.count > 1 ? `<span class="bi-count">×${it.count}</span>` : ''}
        </div>`;
      }).join('')
    : Array(8).fill('<div class="bag-empty"></div>').join('');

  // 已装备列表
  const equipped = slotMeta.map(s => p.equip[s.key]).filter(Boolean);
  equipGrid.innerHTML = equipped.length
    ? equipped.map(it => {
        const r = RARITY[it.rarity];
        return `<div class="bag-item ${r.cls}" onclick="unequip('${it.slot}')" title="点击卸下">
          <span class="bi-ico">${it.icon}</span>
          <span class="bi-name">${it.name}</span>
        </div>`;
      }).join('')
    : '<div class="bag-empty" style="grid-column:1/-1;aspect-ratio:auto;padding:14px;font-size:11px">暂无装备 · 击败怪物掉落</div>';
}

function useItem(id) {
  if (!G) return;
  // 注：结算界面（G.over=true）也允许整理装备/用药
  const p = G.player;
  const idx = p.bag.findIndex(i => i.id === id);
  if (idx < 0) return;
  const item = p.bag[idx];

  if (item.kind === 'consume') {
    Sound.item();
    // 消耗品：战斗外也可用
    if (item.key === 'potion') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + 40);
      const healed = Math.round(p.hp - before);
      log(`使用【${item.name}】，恢复 <b>${healed}</b> 点生命。`, 'heal');
      floatOn('player', '+' + healed, 'heal');
      Effects.healBurst(heroPos.clone().setY(1.5));
    } else if (item.key === 'ether') {
      const before = p.mp;
      p.mp = Math.min(p.maxMp, p.mp + 25);
      log(`使用【${item.name}】，恢复 <b>${Math.round(p.mp - before)}</b> 点法力。`, 'heal');
      floatOn('player', '+MP', 'mp');
    } else if (item.key === 'elixir') {
      p.hp = p.maxHp;
      p.statuses = [];
      log(`使用【${item.name}】，生命全满，异常解除！`, 'heal');
      floatOn('player', 'MAX', 'heal');
      Effects.healBurst(heroPos.clone().setY(1.5));
    }
    item.count--;
    if (item.count <= 0) p.bag.splice(idx, 1);
    updateBagBadge();
    renderBag();
    render();
    saveGame();
    return;
  }

  // 装备
  Sound.item();
  const slot = item.slot;
  const old = p.equip[slot];
  p.equip[slot] = item;
  p.bag.splice(idx, 1);
  if (old) p.bag.push(old);

  log(`装备了 <b>${item.name}</b>（${item.desc}）。`, 'sys');
  // 可见反馈：飘字
  floatOn('player', '📦 ' + item.name, 'heal');
  Sound.item();
  // 扩展功能：史诗装备成就
  if (typeof Features !== 'undefined' && item.rarity === 'epic') {
    Features.unlockAchievement('epic');
  }
  renderBag();
  render();
  saveGame();
}

function unequip(slot) {
  if (!G) return;
  const p = G.player;
  const item = p.equip[slot];
  if (!item) return;
  Sound.click();
  p.bag.push(item);
  p.equip[slot] = null;
  log(`卸下了 <b>${item.name}</b>。`, 'sys');
  renderBag();
  render();
  saveGame();
}

// ==================== 状态图标渲染 ====================
function renderBuffs() {
  if (!G) return;
  const pBuffs = document.getElementById('pBuffs');
  const eBuffs = document.getElementById('eBuffs');

  const iconMap = { poison: '☠️', burn: '🔥', slow: '❄️', atkup: '⚔️', defup: '🛡', stun: '💫' };

  const render = (el, entity) => {
    if (!entity || !entity.statuses || !entity.statuses.length) { el.innerHTML = ''; return; }
    el.innerHTML = entity.statuses.map(s =>
      `<span class="buff ${s.key}" title="${statusName(s.key)}（剩余 ${s.turns} 回合）">
        ${iconMap[s.key] || '❓'}${s.turns}
      </span>`
    ).join('');
  };
  render(pBuffs, G.player);
  render(eBuffs, G.enemy);
}

// ==================== 主渲染 ====================
function render() {
  if (!G) return;
  const p = G.player, e = G.enemy;

  document.getElementById('round').textContent = `第 ${G.round} 回合`;

  // 玩家
  document.getElementById('pName').textContent = p.name;
  document.getElementById('pLv').textContent = p.lv;
  const pHpPct = Math.max(0, p.hp / p.maxHp) * 100;
  document.getElementById('pHpBar').style.width = pHpPct + '%';
  document.getElementById('pHpBar').classList.toggle('low', pHpPct < 30 && pHpPct > 0);
  document.getElementById('pHpText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;

  const pMpPct = Math.max(0, p.mp / p.maxMp) * 100;
  document.getElementById('pMpBar').style.width = pMpPct + '%';
  document.getElementById('pMpText').textContent = `${Math.ceil(p.mp)} / ${p.maxMp}`;

  const pExpPct = Math.min(100, (p.exp / p.expNext) * 100);
  document.getElementById('pExpBar').style.width = pExpPct + '%';
  document.getElementById('pExpText').textContent = `EXP ${p.exp} / ${p.expNext}`;

  document.getElementById('pAtk').textContent = effectiveAtk(p);
  document.getElementById('pDef').textContent = effectiveDef(p);

  // 敌人
  if (e) {
    document.getElementById('eName').textContent = e.name;
    document.getElementById('eLv').textContent = `Lv.${e.lv}`;
    document.getElementById('eIcon').textContent = e.avatar;
    const eHpPct = Math.max(0, e.hp / e.maxHp) * 100;
    document.getElementById('eHpBar').style.width = eHpPct + '%';
    document.getElementById('eHpBar').classList.toggle('low', eHpPct < 30 && eHpPct > 0);
    document.getElementById('eHpText').textContent = `${Math.max(0, Math.ceil(e.hp))} / ${e.maxHp}`;
  }

  // 按钮状态
  const lock = G.over || G.busy;
  const btns = document.querySelectorAll('.act-btn');
  btns.forEach(b => b.disabled = lock);

  if (!lock) {
    setSkillBtn('btnSkill', 'skill', p);
    setSkillBtn('btnSkill2', 'skill2', p);
    setSkillBtn('btnHeal', 'heal', p);
    setSkillBtn('btnPoison', 'poison', p);
  }

  renderBuffs();
  updateBagBadge();
}

function setSkillBtn(btnId, key, p) {
  const btn = document.getElementById(btnId);
  const skill = SKILLS[key];
  const subId = { skill: 'skillSub', skill2: 'skill2Sub', heal: 'healSub', poison: 'poisonSub' }[key];
  const sub = document.getElementById(subId);

  // 移除旧遮罩
  const oldMask = btn.querySelector('.cd-mask');
  if (oldMask) oldMask.remove();

  const cd = p.cds[key] || 0;
  const noMp = p.mp < skill.mp;
  const healFull = key === 'heal' && p.hp >= p.maxHp;

  if (cd > 0) {
    btn.disabled = true;
    btn.classList.add('cooling');
    const mask = document.createElement('div');
    mask.className = 'cd-mask';
    mask.textContent = cd;
    btn.appendChild(mask);
    sub.textContent = `冷却 ${cd} 回合`;
  } else if (noMp) {
    btn.disabled = true;
    btn.classList.remove('cooling');
    sub.textContent = `法力不足 (${Math.ceil(p.mp)}/${skill.mp})`;
  } else if (healFull) {
    btn.disabled = true;
    btn.classList.remove('cooling');
    sub.textContent = '生命已满';
  } else {
    btn.disabled = false;
    btn.classList.remove('cooling');
    // 显示当前等级下的威力
    const power = skillPower(key);
    if (key === 'heal') {
      sub.textContent = `回${power.heal} · MP${skill.mp}`;
    } else {
      sub.textContent = `${power.mult.toFixed(2)}× · MP${skill.mp}`;
    }
  }
}

// ==================== 日志 ====================
function log(text, cls = '') {
  const el = document.getElementById('log');
  const p = document.createElement('p');
  if (cls) p.className = 'c-' + cls;
  p.innerHTML = text;
  el.appendChild(p);
  while (el.children.length > 100) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;

  // 底部提示条
  const barText = document.getElementById('logBarText');
  barText.innerHTML = text;
}

let logOpen = false;
function toggleLog() {
  logOpen = !logOpen;
  document.getElementById('logPanel').classList.toggle('show', logOpen);
  document.querySelector('#logBar .log-toggle').textContent = logOpen ? '▼' : '▲';
}

// ==================== 音效开关 ====================
function toggleSound() {
  G.soundOn = !G.soundOn;
  Sound.enabled = G.soundOn;
  document.getElementById('soundBtn').textContent = G.soundOn ? '🔊' : '🔇';
  if (G.soundOn) Sound.click();
  saveGame();
}

function toggleBGM() {
  G.bgmOn = !G.bgmOn;
  const btn = document.getElementById('bgmBtn');
  if (G.bgmOn) {
    btn.textContent = '🎵';
    BGM.setEnabled(true);
    BGM.play(STAGE_BGM[G.stageIndex] || 'forest');
    Sound.click();
  } else {
    btn.textContent = '🔕';
    BGM.setEnabled(false);
  }
  saveGame();
}

// 打开商店
function openShop() {
  if (!G) return;
  document.getElementById('resultModal').classList.remove('show');
  // 若未标记返回行为，默认为“回战斗（不自动进关）”
  if (!G.shopReturnTo) G.shopReturnTo = 'battle';
  Shop.open(G.stageIndex + 1);
}

// ==================== 存档 ====================
function saveGame() {
  if (!G || G.over) return;
  try {
    const save = {
      v: 1,
      stageIndex: G.stageIndex,
      round: G.round,
      player: G.player,
      soundOn: G.soundOn,
      bgmOn: G.bgmOn,
      battleSpeed: G.battleSpeed || 1,
      heroId: G.heroId || 'warrior',
      itemIdCounter
    };
    localStorage.setItem('dq3d_save', JSON.stringify(save));
  } catch (e) { /* ignore */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('dq3d_save');
    if (!raw) return false;
    const save = JSON.parse(raw);
    if (!save || save.v !== 1) return false;

    G = newGame();
    G.stageIndex = save.stageIndex;
    G.round = save.round || 1;
    G.player = save.player;
    G.soundOn = save.soundOn !== false;
    G.bgmOn = save.bgmOn !== false;
    itemIdCounter = save.itemIdCounter || 1;

    // 恢复 UI
    document.getElementById('soundBtn').textContent = G.soundOn ? '🔊' : '🔇';
    Sound.enabled = G.soundOn;
    const bgmBtn = document.getElementById('bgmBtn');
    if (bgmBtn) bgmBtn.textContent = G.bgmOn ? '🎵' : '🔕';
    if (G.bgmOn) BGM.play(STAGE_BGM[G.stageIndex] || 'forest');

    buildStage(save.stageIndex);
    G.busy = false;
    render();
    return true;
  } catch (e) {
    return false;
  }
}

// 恢复进度的闪现提示（自动消失）
function showResumeBanner(stageIndex, lv) {
  let el = document.getElementById('resumeBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'resumeBanner';
    document.body.appendChild(el);
  }
  const stage = STAGES[stageIndex] || STAGES[0];
  el.innerHTML = `
    <div class="rb-icon">📁</div>
    <div class="rb-text">
      <div class="rb-title">已恢复冒险进度</div>
      <div class="rb-sub">第 ${stageIndex + 1} 关 · ${stage.name} &nbsp;|&nbsp; Lv.${lv}</div>
    </div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function hasSave() {
  return !!localStorage.getItem('dq3d_save');
}

// 只读取存档数据（不应用），用于开场展示进度
function readSave() {
  try {
    const raw = localStorage.getItem('dq3d_save');
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || save.v !== 1) return null;
    if (!save.player) return null;
    if (typeof save.stageIndex !== 'number') save.stageIndex = 0;
    return save;
  } catch (e) {
    return null;
  }
}

// 自动读档并跳转到存档关卡
function autoLoadAndJump() {
  const save = readSave();
  if (!save) return;

  try {
    G = newGame();
    G.stageIndex = save.stageIndex;
    G.round = save.round || 1;
    G.player = save.player;
    G.soundOn = save.soundOn !== false;
    G.bgmOn = save.bgmOn !== false;
    itemIdCounter = save.itemIdCounter || 1;

    // 恢复 UI 设置
    document.getElementById('soundBtn').textContent = G.soundOn ? '🔊' : '🔇';
    Sound.enabled = G.soundOn;
    const bgmBtn = document.getElementById('bgmBtn');
    if (bgmBtn) bgmBtn.textContent = G.bgmOn ? '🎵' : '🔕';

    // 直接构建存档所在关卡
    buildStage(save.stageIndex);
    G.busy = false;
    render();

    // 关闭开场界面
    document.getElementById('startModal').classList.remove('show');

    // 短暂显示恢复进度提示
    showResumeBanner(save.stageIndex, save.player.lv);

    // 提示
    const stage = STAGES[save.stageIndex] || STAGES[0];
    log('══ 自动读取存档 ══', 'sys');
    log(`📁 继续第 ${save.stageIndex + 1} 关 · ${stage.name}（Lv.${save.player.lv}）`, 'sys');
    log(`<b>${G.enemy.name}</b> 挡在前面！`, 'enemy');
    toast(`已恢复进度：第 ${save.stageIndex + 1} 关 · ${stage.name}`, '#55ffa0');

    if (G.bgmOn) BGM.play(STAGE_BGM[save.stageIndex] || 'forest');
  } catch (e) {
    console.error('自动读档失败:', e);
  }
}

// ==================== 工具 ====================
const sleep = ms => new Promise(r => setTimeout(r, ms / (G && G.battleSpeed ? G.battleSpeed : 1)));

// 屏幕闪白/闪光
function screenFlash(color = 0xffffff, intensity = 0.5, duration = 180) {
  let el = document.getElementById('screenFlash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'screenFlash';
    document.body.appendChild(el);
  }
  const c = new THREE.Color(color);
  el.style.background = `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${intensity})`;
  el.style.transition = 'none';
  el.style.opacity = '1';
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${duration}ms ease-out`;
    el.style.opacity = '0';
  });
}

// 慢动作（降低游戏动画更新速度，这里用镜头特效模拟）
let slowMoFactor = 1;
function slowMotion(factor = 0.35, duration = 400) {
  slowMoFactor = factor;
  document.body.classList.add('slowmo');
  setTimeout(() => {
    slowMoFactor = 1;
    document.body.classList.remove('slowmo');
  }, duration);
}

// 连击显示
function showCombo(n) {
  let el = document.getElementById('comboDisplay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'comboDisplay';
    document.body.appendChild(el);
  }
  el.textContent = `${n} COMBO`;
  el.classList.remove('show');
  void el.offsetWidth; // 重启动画
  el.classList.add('show');
  // 根据连击数变色
  const hue = Math.max(0, 40 - (n - 2) * 8);
  el.style.color = `hsl(${hue}, 100%, 60%)`;
  el.style.textShadow = `0 0 20px hsla(${hue}, 100%, 60%, 0.8), 0 4px 12px rgba(0,0,0,0.9)`;
  // 侧边连击计数器
  if (typeof Features !== 'undefined') Features.enhanceCombo(n);
  // 成就：10 连击
  if (n >= 10 && typeof Features !== 'undefined') Features.unlockAchievement('combo10');
}

// 击杀特写镜头
function killCloseup(targetPos) {
  const origPos = camTarget.pos.clone();
  const origLook = camTarget.look.clone();

  // 镜头拉近到敌人
  camTarget.pos.set(targetPos.x * 0.5, 2.2, 6.5);
  camTarget.look.set(targetPos.x * 0.6, 1.3, targetPos.z);
  camShake = 0.8;

  setTimeout(() => {
    camTarget.pos.copy(origPos);
    camTarget.look.copy(origLook);
  }, 900);
}

// ==================== 启动 ====================
function boot() {
  // 依赖检查：确保关键模块已加载
  const missing = [];
  if (typeof THREE === 'undefined') missing.push('Three.js');
  if (typeof Sound === 'undefined') missing.push('音效模块');
  if (typeof Effects === 'undefined') missing.push('特效模块');
  if (typeof Models === 'undefined') missing.push('模型模块');
  if (typeof Hyper4D === 'undefined') missing.push('4D 模块');
  if (typeof BGM === 'undefined') missing.push('BGM 模块');

  if (missing.length) {
    const el = document.getElementById('loading');
    el.classList.remove('hide');
    el.innerHTML = `<div style="text-align:center;line-height:2">
      <div style="font-size:40px">⚠️</div>
      <div>游戏模块加载失败</div>
      <div style="font-size:12px;color:#5555aa;margin-top:8px">缺失: ${missing.join('、')}</div>
      <div style="font-size:12px;color:#5555aa;margin-top:8px">请刷新页面重试</div>
    </div>`;
    console.error('缺失模块:', missing);
    return;
  }

  try {
    initThree();
  } catch (err) {
    console.error('初始化失败:', err);
    return;
  }

  // 检查存档
  const save = readSave();
  if (save) {
    // 显示进度信息
    const infoEl = document.getElementById('saveInfo');
    const stage = STAGES[save.stageIndex] || STAGES[0];
    if (infoEl) {
      infoEl.style.display = 'block';
      document.getElementById('saveStage').textContent = `第 ${save.stageIndex + 1} 关 / ${STAGES.length} · ${stage.name}`;
      document.getElementById('saveEnemy').textContent = (stage.enemyName || enemyName(stage.enemy)) + ` (Lv.${stage.lv})`;
      document.getElementById('saveLevel').textContent = `Lv.${save.player.lv} · ${save.player.gold}💰`;
    }

    // 有存档：自动加载并跳转到之前闯到的关卡
    // （开场界面会自动关闭，无需玩家点击）
    autoLoadAndJump();
  } else {
    // 无存档：显示开场界面，主按钮为“开始冒险”
    const startBtn = document.getElementById('startBtn');
    const contBtn = document.getElementById('continueBtn');
    if (startBtn) {
      startBtn.textContent = '开 始 冒 险';
      startBtn.onclick = () => startGame();
    }
    if (contBtn) contBtn.style.display = 'none';
    const infoEl = document.getElementById('saveInfo');
    if (infoEl) infoEl.style.display = 'none';
  }

  // 快捷键
  window.addEventListener('keydown', e => {
    // ---- Cmd/Ctrl + P：解除自动并恢复鼠标 ----
    if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (G && G.autoBattle) {
        Features.toggleAuto();       // 关闭自动
        toast('已解除自动战斗，鼠标已恢复', '#55ffa0');
        log('⏸ 手动解除自动战斗。', 'sys');
      } else {
        toast('当前未开启自动战斗');
      }
      return;
    }

    // ---- 空格：进入下一关 / 确认弹窗 ----
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      // 结算弹窗打开时 → 进入下一关 / 重试
      const resultModal = document.getElementById('resultModal');
      if (resultModal && resultModal.classList.contains('show')) {
        const btn = document.getElementById('rBtn');
        if (btn && !btn.disabled) { btn.click(); return; }
      }
      // 商店打开时 → 前往下一关 / 返回战斗
      const shopModal = document.getElementById('shopModal');
      if (shopModal && shopModal.classList.contains('show')) {
        const btn = document.getElementById('shopContinueBtn');
        if (btn) { btn.click(); return; }
      }
      // 开场界面 → 开始冒险
      const startModal = document.getElementById('startModal');
      if (startModal && startModal.classList.contains('show')) {
        const btn = document.getElementById('startBtn');
        if (btn) { btn.click(); return; }
      }
      return;
    }

    if (!G || G.over || G.busy) return;
    if (e.key === '1') playerAction('attack');
    else if (e.key === '2') playerAction('skill');
    else if (e.key === '3') playerAction('skill2');
    else if (e.key === '4') playerAction('heal');
    else if (e.key === '5') playerAction('poison');
    else if (e.key === '6') playerAction('defend');
    else if (e.key === 'l' || e.key === 'L') toggleLog();
    else if (e.key === 'Escape') {
      // ESC 关闭所有弹窗
      ['menuModal','skillTreeModal','petModal','enchantModal','achievementModal','bestiaryModal','boardModal','slotModal','shopModal','bagModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
      });
    }
  });

  // 初始化开发者调试面板（按 ~ 或 F2 打开）
  if (typeof DevPanel !== 'undefined') DevPanel.init();
}

boot();
