/* ============================================================
   音效引擎 - 使用 Web Audio API 实时合成，无需音频文件
   ============================================================ */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let enabled = true;

  // 音阶频率表（用于旋律）
  const NOTE = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
    A5: 880.00, C6: 1046.50
  };

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) {
      enabled = false;
    }
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // ---- 基础：播放一个音符 ----
  function tone(freq, dur = 0.15, type = 'sine', vol = 0.5, when = 0, slideTo = null) {
    if (!enabled) return;
    init();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ---- 噪声（打击/爆炸） ----
  function noise(dur = 0.2, vol = 0.4, when = 0, filterFreq = 1500, type = 'lowpass') {
    if (!enabled) return;
    init();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(filterFreq * 0.3, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  // ============ 具体音效 ============

  // 剑击
  function attack() {
    noise(0.12, 0.35, 0, 3000, 'highpass');
    tone(180, 0.1, 'sawtooth', 0.25, 0, 90);
  }

  // 命中
  function hit() {
    noise(0.18, 0.5, 0, 1200);
    tone(120, 0.16, 'square', 0.2, 0, 60);
  }

  // 暴击
  function crit() {
    noise(0.28, 0.6, 0, 2000);
    tone(220, 0.1, 'sawtooth', 0.35, 0, 80);
    tone(330, 0.1, 'sawtooth', 0.3, 0.05, 110);
    tone(440, 0.2, 'square', 0.25, 0.1, 130);
  }

  // 技能施放（上升音）
  function cast() {
    tone(300, 0.3, 'sine', 0.3, 0, 900);
    tone(400, 0.3, 'triangle', 0.2, 0.03, 1200);
  }

  // 火焰
  function fire() {
    noise(0.5, 0.4, 0, 800);
    tone(90, 0.4, 'sawtooth', 0.25, 0, 160);
    tone(150, 0.35, 'triangle', 0.18, 0.05, 400);
  }

  // 冰霜
  function ice() {
    tone(1200, 0.15, 'sine', 0.25);
    tone(1600, 0.15, 'sine', 0.2, 0.06);
    tone(2000, 0.25, 'sine', 0.18, 0.12, 900);
    noise(0.3, 0.2, 0, 5000, 'highpass');
  }

  // 治疗
  function heal() {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => {
      tone(f, 0.3, 'sine', 0.28, i * 0.07);
    });
  }

  // 中毒
  function poison() {
    tone(300, 0.25, 'triangle', 0.25, 0, 180);
    tone(250, 0.25, 'sine', 0.2, 0.12, 140);
  }

  // 防御
  function defend() {
    tone(200, 0.12, 'square', 0.22, 0, 160);
    tone(160, 0.2, 'square', 0.18, 0.08);
  }

  // 升级
  function levelUp() {
    const melody = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6];
    melody.forEach((f, i) => tone(f, 0.24, 'triangle', 0.32, i * 0.11));
  }

  // 胜利
  function victory() {
    const melody = [NOTE.C5, NOTE.C5, NOTE.C5, NOTE.C5, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.A4, NOTE.C5];
    const dur    = [0.15, 0.15, 0.15, 0.5, 0.5, 0.5, 0.5, 0.5, 0.8];
    let t = 0;
    melody.forEach((f, i) => {
      tone(f, dur[i], 'triangle', 0.32, t);
      t += dur[i] * 0.9;
    });
  }

  // 失败
  function defeat() {
    const melody = [NOTE.C5, NOTE.B4, NOTE.A4, NOTE.G4, NOTE.F4, NOTE.E4, NOTE.D4, NOTE.C4];
    melody.forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.26, i * 0.18));
  }

  // 按钮点击
  function click() {
    tone(700, 0.06, 'sine', 0.18);
  }

  // 获得物品
  function item() {
    tone(NOTE.E5, 0.12, 'triangle', 0.24);
    tone(NOTE.G5, 0.18, 'triangle', 0.22, 0.09);
  }

  // 回合切换
  function turn() {
    tone(440, 0.08, 'sine', 0.12);
  }

  // 敌人死亡
  function enemyDown() {
    noise(0.6, 0.45, 0, 900);
    tone(200, 0.6, 'sawtooth', 0.28, 0, 40);
  }

  // 存档
  function save() {
    tone(NOTE.C5, 0.1, 'sine', 0.2);
    tone(NOTE.G5, 0.15, 'sine', 0.2, 0.08);
  }

  // 商店打开
  function shopOpen() {
    tone(NOTE.E5, 0.1, 'triangle', 0.22);
    tone(NOTE.G5, 0.1, 'triangle', 0.2, 0.08);
    tone(NOTE.C6, 0.2, 'triangle', 0.22, 0.16);
  }

  // 购买成功（金币声）
  function buy() {
    tone(NOTE.C6, 0.07, 'sine', 0.22);
    tone(NOTE.G5, 0.1, 'sine', 0.18, 0.05);
    tone(NOTE.C6, 0.12, 'triangle', 0.15, 0.1);
  }

  // 出售成功
  function sell() {
    tone(NOTE.G5, 0.08, 'sine', 0.2);
    tone(NOTE.E5, 0.12, 'sine', 0.18, 0.07);
  }

  // 操作失败 / 金币不足
  function error() {
    tone(200, 0.12, 'square', 0.22);
    tone(150, 0.18, 'square', 0.2, 0.1);
  }

  return {
    resume, tone,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (master) master.gain.value = v ? 0.35 : 0; },
    attack, hit, crit, cast, fire, ice, heal, poison, defend,
    levelUp, victory, defeat, click, item, turn, enemyDown, save,
    shopOpen, buy, sell, error
  };
})();
