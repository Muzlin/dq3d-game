/* ============================================================
   BGM 背景音乐引擎 - Web Audio 实时合成循环旋律
   每个关卡有不同主题，无需音频文件
   ============================================================ */

const BGM = (() => {
  let ctx = null;
  let master = null;
  let enabled = false;
  let playing = false;
  let schedulerTimer = null;
  let currentTrack = null;
  let nextNoteTime = 0;
  let step = 0;

  // 音名 → 频率
  const N = {
    C3: 130.81, Cb3: 123.47, 'C#3': 138.59, Db3: 138.59,
    D3: 146.83, 'D#3': 155.56, Eb3: 155.56,
    E3: 164.81, F3: 174.61, 'F#3': 185.00, Gb3: 185.00,
    G3: 196.00, 'G#3': 207.65, Ab3: 207.65,
    A3: 220.00, 'A#3': 233.08, Bb3: 233.08, B3: 246.94,

    C4: 261.63, Cb4: 246.94, 'C#4': 277.18, Db4: 277.18,
    D4: 293.66, 'D#4': 311.13, Eb4: 311.13,
    E4: 329.63, F4: 349.23, 'F#4': 369.99, Gb4: 369.99,
    G4: 392.00, 'G#4': 415.30, Ab4: 415.30,
    A4: 440.00, 'A#4': 466.16, Bb4: 466.16, B4: 493.88,

    C5: 523.25, 'C#5': 554.37, Db5: 554.37,
    D5: 587.33, 'D#5': 622.25, Eb5: 622.25,
    E5: 659.25, F5: 698.46, 'F#5': 739.99,
    G5: 783.99, 'G#5': 830.61, Ab5: 830.61,
    A5: 880.00, 'A#5': 932.33, Bb5: 932.33, B5: 987.77,

    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98,
    R: 0 // 休止符
  };

  // ==================== 音轨定义 ====================
  // 每轨：bass(低音) + lead(主旋律) + pad(和弦铺底)
  // tempo: 每分钟拍数；step 时长为 (60/tempo)/2（八分音符）
  const TRACKS = {
    // 森林：宁静悠扬，大调
    forest: {
      tempo: 92,
      bass: ['C3','R','C3','R','G3','R','G3','R','A3','R','A3','R','F3','R','F3','R',
             'C3','R','C3','R','G3','R','G3','R','F3','R','F3','R','G3','R','G3','R'],
      lead: ['E4','G4','C5','G4','E4','D4','E4','R','F4','A4','C5','A4','F4','E4','D4','R',
             'E4','G4','C5','E5','D5','C5','B4','R','A4','F4','G4','A4','G4','E4','C4','R'],
      pad:  ['C4','C4','C4','C4','G3','G3','G3','G3','A3','A3','A3','A3','F3','F3','F3','F3',
             'C4','C4','C4','C4','G3','G3','G3','G3','F3','F3','F3','F3','G3','G3','G3','G3']
    },
    // 洞穴：小调，带神秘感
    cave: {
      tempo: 84,
      bass: ['A3','R','A3','R','E3','R','E3','R','F3','R','F3','R','G3','R','G3','R',
             'A3','R','A3','R','E3','R','E3','R','D3','R','D3','R','E3','R','E3','R'],
      lead: ['A4','C5','E5','C5','A4','G4','A4','R','F4','A4','C5','A4','G4','F4','E4','R',
             'A4','C5','E5','A5','G5','E5','D5','R','C5','A4','G4','F4','E4','D4','A3','R'],
      pad:  ['A3','A3','A3','A3','E3','E3','E3','E3','F3','F3','F3','F3','G3','G3','G3','G3',
             'A3','A3','A3','A3','E3','E3','E3','E3','D3','D3','D3','D3','E3','E3','E3','E3']
    },
    // 墓园：阴森，半音下行
    graveyard: {
      tempo: 76,
      bass: ['D3','R','D3','R','Bb3','R','A3','R','G3','R','G3','R','F3','R','F3','R',
             'D3','R','D3','R','A3','R','A3','R','G3','R','G3','R','A3','R','A3','R'],
      lead: ['D4','F4','A4','F4','D4','C4','D4','R','C4','E4','G4','E4','C4','A3','C4','R',
             'D4','F4','A4','D5','C5','A4','G4','R','F4','D4','C4','A3','G3','A3','D4','R'],
      pad:  ['D3','D3','D3','D3','A3','A3','A3','A3','G3','G3','G3','G3','F3','F3','F3','F3',
             'D3','D3','D3','D3','A3','A3','A3','A3','G3','G3','G3','G3','A3','A3','A3','A3']
    },
    // 龙巢：紧张，快速
    lair: {
      tempo: 116,
      bass: ['E3','E3','B3','R','E3','E3','B3','R','C3','C3','G3','R','D3','D3','A3','R',
             'E3','E3','B3','R','E3','E3','B3','R','A3','A3','E3','R','B3','B3','E3','R'],
      lead: ['E4','G4','B4','E5','D5','B4','G4','R','C5','E5','G5','E5','D5','B4','A4','R',
             'E4','G4','B4','E5','G5','E5','D5','R','C5','A4','B4','A4','G4','E4','B3','R'],
      pad:  ['E3','E3','E3','E3','B3','B3','B3','B3','C4','C4','C4','C4','D3','D3','D3','D3',
             'E3','E3','E3','E3','B3','B3','B3','B3','A3','A3','A3','A3','B3','B3','B3','B3']
    },
    // 魔王：史诗，压抑，多声部
    boss: {
      tempo: 132,
      bass: ['C3','C3','G3','G3','Ab3','G3','C3','C3','F3','F3','C3','C3','G3','G3','B3','B3',
             'C3','C3','G3','G3','A3','A3','E3','E3','F3','F3','C3','C3','G3','G3','C3','C3'],
      lead: ['C4','Eb4','G4','C5','B4','G4','Eb4','R','F4','Ab4','C5','F5','Eb5','C5','Ab4','R',
             'C4','Eb4','G4','C5','Bb4','G4','Eb4','R','F4','C5','Ab4','F4','Eb4','C4','G3','R'],
      pad:  ['C3','C3','C3','C3','G3','G3','G3','G3','G#3','G#3','G#3','G#3','F3','F3','F3','F3',
             'C4','C4','C4','C4','A3','A3','A3','A3','F3','F3','F3','F3','G3','G3','G3','G3']
    }
  };

  // ==================== 初始化 ====================
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.14;   // BGM 音量偏低
      master.connect(ctx.destination);
    } catch (e) { enabled = false; }
  }

  // ==================== 单音合成 ====================
  function playNote(freq, time, dur, type, vol, detune = 0) {
    if (!ctx || freq <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (detune) osc.detune.setValueAtTime(detune, time);

    // ADSR 包络
    const atk = Math.min(0.03, dur * 0.15);
    const rel = Math.min(0.25, dur * 0.6);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + atk);
    gain.gain.setValueAtTime(vol, time + dur - rel);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // 低通滤波的音色（用于 pad）
  function playPad(freqs, time, dur, vol) {
    if (!ctx) return;
    freqs.forEach((f, i) => { if (f > 0) playNote(f, time, dur, 'sine', vol * (1 - i * 0.15), i * 6); });
  }

  // ==================== 调度 ====================
  function scheduler() {
    if (!playing || !ctx) return;
    const track = currentTrack;
    const stepDur = (60 / track.tempo) / 2;   // 八分音符

    while (nextNoteTime < ctx.currentTime + 0.2) {
      const s = step % track.bass.length;

      const bassName = track.bass[s];
      const leadName = track.lead[s];
      const padName  = track.pad[s];

      // 低音（每拍）
      if (N[bassName]) {
        playNote(N[bassName], nextNoteTime, stepDur * 1.8, 'triangle', 0.5);
      }

      // 主旋律
      if (N[leadName]) {
        const vol = (s % 8 === 0) ? 0.4 : 0.3;
        playNote(N[leadName], nextNoteTime, stepDur * 1.4, 'square', vol * 0.5);
      }

      // 和弦铺底（每 4 步换一次）
      if (s % 4 === 0 && N[padName]) {
        const root = N[padName];
        playPad([root, root * 1.25, root * 1.5], nextNoteTime, stepDur * 3.6, 0.16);
      }

      // 打击乐（节拍感）
      if (s % 4 === 0) {
        // 底鼓
        playNote(60, nextNoteTime, 0.12, 'sine', 0.5);
      }
      if (s % 4 === 2) {
        // 军鼓（噪声感，用高频短音模拟）
        playNote(1200, nextNoteTime, 0.05, 'square', 0.06);
      }

      nextNoteTime += stepDur;
      step++;
    }
  }

  // ==================== 控制 ====================
  function play(trackName) {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    if (!TRACKS[trackName]) trackName = 'forest';

    // 同一轨已在播放则不重启
    if (playing && currentTrack && currentTrack.name === trackName) return;

    stop(true);
    currentTrack = Object.assign({ name: trackName }, TRACKS[trackName]);
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    playing = true;
    enabled = true;

    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = setInterval(scheduler, 50);
  }

  function stop(quiet = false) {
    playing = false;
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
    if (master && !quiet) master.gain.value = 0;
    if (master && quiet === true && !enabled) master.gain.value = 0.14;
  }

  function setEnabled(v) {
    enabled = v;
    init();
    if (!master) return;
    master.gain.value = v ? 0.14 : 0;
    if (v && playing && ctx && ctx.state === 'suspended') ctx.resume();
  }

  // 通关胜利号角（覆盖 BGM 短暂播放）
  function playVictorySting() {
    init();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const melody = [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6];
    melody.forEach((f, i) => {
      if (f) playNote(f, t0 + i * 0.13, 0.3, 'triangle', 0.5);
    });
  }

  return {
    play, stop, setEnabled, playVictorySting,
    get playing() { return playing; },
    get track() { return currentTrack ? currentTrack.name : null; }
  };
})();
