/*
 * 程序化音频引擎：节奏化 BGM + 音效，全部用振荡器 / 噪声实时合成。
 * 不依赖任何音频素材文件，浏览器 / 微信小游戏通用。
 *
 * 结构：16 分音符步进器 + 鼓组（底鼓/军鼓/踩镲）+ 贝斯 + 和弦铺底 + 主旋律
 *
 * 用法：
 *   const audio = new AudioEngine(() => new AudioContext());
 *   audio.unlock();                 // 首次用户手势时调用
 *   audio.playTrack('cute');        // 切歌
 *   audio.sfx('match');             // 播放音效
 */
(function (factory) {
  const AudioEngine = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = AudioEngine;
  }
  const g =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof GameGlobal !== 'undefined'
        ? GameGlobal
        : typeof window !== 'undefined'
          ? window
          : this;
  if (g) g.AudioEngine = AudioEngine;
})(function () {
  'use strict';

  const STEPS = 16; // 一小节 16 个 16 分音符

  function mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // 音阶内「度数」转半音，支持跨八度
  function degToSemi(scale, deg) {
    const len = scale.length;
    const oct = Math.floor(deg / len);
    const idx = ((deg % len) + len) % len;
    return scale[idx] + 12 * oct;
  }

  /* ------------------------------------------------------------------
   * 曲目配置
   * ------------------------------------------------------------------ */
  const TRACKS = {
    // 首页：轻松带律动的 Lo-fi 律动
    menu: {
      bpm: 96,
      root: 60,
      scale: [0, 2, 4, 5, 7, 9, 11],
      progression: [0, 5, 3, 4],
      kick: 'x.......x.......',
      snare: '....x.......x...',
      hat: '..x...x...x...x.',
      bass: 'x.....x...x.....',
      arp: [0, 4, 2, 7, 4, 2, 5, 4],
      leadType: 'triangle',
      leadGain: 0.055,
      padGain: 0.045,
      bassGain: 0.075,
      kickGain: 0.16,
      snareGain: 0.075,
      hatGain: 0.03,
      swing: 0,
    },

    // 咩咩消消乐：跳跃感强的大调五声
    cute: {
      bpm: 124,
      root: 64,
      scale: [0, 2, 4, 7, 9],
      progression: [0, 3, 4, 1],
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      bass: 'x.x..x..x.x..x..',
      arp: [0, 2, 4, 2, 1, 3, 4, 2],
      leadType: 'triangle',
      leadGain: 0.065,
      padGain: 0.035,
      bassGain: 0.085,
      kickGain: 0.2,
      snareGain: 0.08,
      hatGain: 0.042,
      swing: 0.16,
    },

    // 星际合成：紧凑的电子驱动
    sci: {
      bpm: 132,
      root: 57,
      scale: [0, 2, 3, 5, 7, 8, 10],
      progression: [0, 0, 5, 6],
      kick: 'x...x...x..xx...',
      snare: '....x.......x...',
      hat: 'xxxxxxxxxxxxxxxx',
      bass: 'x.xx..x..x.xx..x',
      arp: [0, 2, 4, 6, 7, 6, 4, 2],
      leadType: 'sawtooth',
      leadGain: 0.042,
      padGain: 0.045,
      bassGain: 0.085,
      kickGain: 0.22,
      snareGain: 0.085,
      hatGain: 0.032,
      swing: 0,
    },

    // 星图点灯：舒缓的梦幻氛围
    puzzle: {
      bpm: 84,
      root: 62,
      scale: [0, 2, 4, 7, 9],
      progression: [0, 4, 5, 3],
      kick: 'x.......x.......',
      snare: '........x.......',
      hat: '..x.......x.....',
      bass: 'x.......x.......',
      arp: [0, 2, 4, 7, 4, 2, 9, 7],
      leadType: 'sine',
      leadGain: 0.05,
      padGain: 0.055,
      bassGain: 0.06,
      kickGain: 0.12,
      snareGain: 0.04,
      hatGain: 0.022,
      swing: 0.1,
    },

    // 星驰穿梭：疾速电子动作
    action: {
      bpm: 148,
      root: 55,
      scale: [0, 3, 5, 7, 10],
      progression: [0, 0, 3, 5],
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      bass: 'x.xxx.x.x.xxx.x.',
      arp: [0, 3, 5, 7, 5, 3, 10, 7],
      leadType: 'sawtooth',
      leadGain: 0.05,
      padGain: 0.03,
      bassGain: 0.095,
      kickGain: 0.24,
      snareGain: 0.085,
      hatGain: 0.038,
      swing: 0,
    },

    // 霓虹脉冲：星际合成的高压变奏（紧张感更强）
    neon: {
      bpm: 140,
      root: 55,
      scale: [0, 2, 3, 5, 7, 8, 10],
      progression: [0, 5, 6, 4],
      kick: 'x..xx..xx..xx..x',
      snare: '....x.......x..x',
      hat: 'xxxxxxxxxxxxxxxx',
      bass: 'x.xx.x.xx.xx.x.x',
      arp: [0, 3, 5, 7, 8, 7, 5, 3],
      leadType: 'sawtooth',
      leadGain: 0.045,
      padGain: 0.05,
      bassGain: 0.09,
      kickGain: 0.23,
      snareGain: 0.09,
      hatGain: 0.034,
      swing: 0,
    },

    // 暖阳小品：消消乐的慵懒变奏（更放松）
    cozy: {
      bpm: 104,
      root: 62,
      scale: [0, 2, 4, 7, 9],
      progression: [0, 3, 1, 4],
      kick: 'x.......x.x.....',
      snare: '....x.......x...',
      hat: '..x...x...x...x.',
      bass: 'x...x.....x...x.',
      arp: [0, 2, 4, 2, 7, 4, 2, 0],
      leadType: 'triangle',
      leadGain: 0.058,
      padGain: 0.05,
      bassGain: 0.07,
      kickGain: 0.16,
      snareGain: 0.07,
      hatGain: 0.03,
      swing: 0.14,
    },

    // 星耀庆典：明亮欢快的胜利/首页变奏
    victory: {
      bpm: 116,
      root: 60,
      scale: [0, 2, 4, 7, 9, 12],
      progression: [0, 4, 5, 3],
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      bass: 'x...x.x.x...x.x.',
      arp: [0, 4, 7, 9, 7, 4, 11, 9],
      leadType: 'triangle',
      leadGain: 0.062,
      padGain: 0.04,
      bassGain: 0.075,
      kickGain: 0.19,
      snareGain: 0.075,
      hatGain: 0.04,
      swing: 0.12,
    },

    // 星旅者 · 冒险叙事：温暖辽阔的进行曲感
    adventure: {
      bpm: 100,
      root: 58,
      scale: [0, 2, 4, 7, 9],
      progression: [0, 5, 3, 4],
      kick: 'x.....x.x.......',
      snare: '....x.......x...',
      hat: '..x...x...x...x.',
      bass: 'x.......x.....x.',
      arp: [0, 2, 4, 7, 9, 7, 4, 2],
      leadType: 'triangle',
      leadGain: 0.06,
      padGain: 0.055,
      bassGain: 0.07,
      kickGain: 0.15,
      snareGain: 0.06,
      hatGain: 0.028,
      swing: 0.08,
    },

    // 星旅者 · 遭遇战：紧凑推进
    battle: {
      bpm: 138,
      root: 55,
      scale: [0, 2, 3, 5, 7, 8, 10],
      progression: [0, 0, 5, 3],
      kick: 'x..x..x.x..x..x.',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      bass: 'x.xx..x.x.xx..x.',
      arp: [0, 3, 5, 7, 5, 3, 8, 7],
      leadType: 'sawtooth',
      leadGain: 0.048,
      padGain: 0.04,
      bassGain: 0.09,
      kickGain: 0.22,
      snareGain: 0.085,
      hatGain: 0.036,
      swing: 0,
    },

    // 星旅者 · Boss 战：压迫式史诗
    boss: {
      bpm: 150,
      root: 52,
      scale: [0, 1, 3, 5, 6, 8, 10],
      progression: [0, 6, 5, 4],
      kick: 'x.xxx.x.x.xxx.x.',
      snare: '....x...x...x..x',
      hat: 'xxxxxxxxxxxxxxxx',
      bass: 'x.xx.x.xx.x.x.xx',
      arp: [0, 1, 3, 6, 8, 6, 3, 1],
      leadType: 'sawtooth',
      leadGain: 0.052,
      padGain: 0.05,
      bassGain: 0.1,
      kickGain: 0.25,
      snareGain: 0.095,
      hatGain: 0.04,
      swing: 0,
    },
  };

  const TRACK_TITLES = {
    menu: '弧光圆舞曲 · Arcadia Waltz',
    cute: '咩咩小舞曲 · Momo Boogie',
    sci: '星核脉冲 · Nova Pulse',
    puzzle: '星图摇篮曲 · Lumina Lullaby',
    action: '疾速星驰 · Hyper Dash',
    neon: '霓虹脉冲 · Neon Drive',
    cozy: '暖阳小品 · Cozy Glow',
    victory: '星耀庆典 · Nova Festival',
    adventure: '星旅史诗 · Wanderer’s Saga',
    battle: '遭遇战 · Clash of Stars',
    boss: '王座之影 · Shadow of the Throne',
  };

  /* ------------------------------------------------------------------
   * 12 种小动物各自的叫声（音高 / 音色 / 滑音 / 颤音各不相同）
   * ------------------------------------------------------------------ */
  const ANIMAL_VOICES = [
    { f: [76, 84], type: 'sine', dur: 0.13, glide: 1 },        // 兔兔：上扬 boing
    { f: [69, 62], type: 'sawtooth', dur: 0.15, glide: 1 },     // 喵喵：下滑喵
    { f: [60, 67], type: 'triangle', dur: 0.17 },               // 熊熊：低沉吼
    { f: [72, 72], type: 'square', dur: 0.1, vib: 20 },        // 熊猫：短促咕
    { f: [64, 67, 71], type: 'triangle', dur: 0.09 },          // 猪猪：哼哼三连
    { f: [74, 80], type: 'sine', dur: 0.11 },                   // 蛙蛙：呱
    { f: [67, 60], type: 'sawtooth', dur: 0.14, vib: 14 },     // 狗狗：汪
    { f: [79, 85], type: 'triangle', dur: 0.1 },                // 小鸡：啾啾
    { f: [70, 74], type: 'square', dur: 0.11 },                // 狐狸：短叫
    { f: [72, 65], type: 'sine', dur: 0.15 },                  // 企鹅：低鸣
    { f: [62, 69], type: 'triangle', dur: 0.18 },              // 考拉：慢悠悠
    { f: [78, 82], type: 'square', dur: 0.09 },                // 猴子：吱吱
  ];

  function AudioEngine(createContext) {
    this.createContext = createContext;
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.track = null;
    this.current = null;
    this.def = null;
    this.step = 0;
    this.nextStepTime = 0;
    this.stepDur = 0;
    this.baseStepDur = 0;
    this.timer = null;
    this.muted = false;
    this.volume = 0.62;
    this.intensity = 0; // 0=休闲 … 1=紧凑
    this.samples = {}; // 真实音频采样：name -> AudioBuffer
    this.sampleBase = '';
    this.sampleLoader = null;
    this.nativePlayer = null; // 可选：原生播放器（微信真机走 InnerAudioContext）
  }

  // 设置真实音频加载器：loader(path) -> Promise<ArrayBuffer> | ArrayBuffer
  AudioEngine.prototype.setSampleLoader = function (loader, base) {
    this.sampleLoader = loader;
    this.sampleBase = base || '';
  };

  // 设置原生采样播放器（微信小游戏真机用 InnerAudioContext 更稳）
  // 需实现 canPlay(name) / play(name, gain, rate, muted)
  AudioEngine.prototype.setNativePlayer = function (player) {
    this.nativePlayer = player;
  };

  // 解码单个 ArrayBuffer，兼容「返回 Promise」与「回调」两种实现
  AudioEngine.prototype._decode = function (data) {
    const self = this;
    if (!this.ctx || !data) return Promise.resolve(null);
    const copy = data.slice ? data.slice(0) : data;
    return new Promise(function (resolve) {
      let settled = false;
      function ok(buf) {
        if (!settled) {
          settled = true;
          resolve(buf || null);
        }
      }
      function fail() {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }
      try {
        const ret = self.ctx.decodeAudioData(copy, ok, fail);
        if (ret && typeof ret.then === 'function') ret.then(ok, fail);
      } catch (e) {
        fail();
      }
    });
  };

  // 批量加载真实音频样本（解码为 AudioBuffer），失败的键将被忽略
  AudioEngine.prototype.loadSamples = function (names) {
    if (!this.ctx || !this.sampleLoader) return Promise.resolve();
    const self = this;
    const jobs = names.map(function (name) {
      if (self.samples[name]) return Promise.resolve();
      return Promise.resolve()
        .then(function () {
          return self.sampleLoader(self.sampleBase + name + '.wav');
        })
        .then(function (data) {
          return self._decode(data);
        })
        .then(function (buf) {
          if (buf) self.samples[name] = buf;
        })
        .catch(function () {
          /* 忽略该样本，使用合成音兜底 */
        });
    });
    return Promise.all(jobs);
  };

  // 播放真实样本；成功返回 true，未加载则返回 false（由调用方回退到合成音）
  AudioEngine.prototype.playSample = function (name, gain, rate) {
    // 优先使用原生播放器（微信真机）
    if (this.nativePlayer && this.nativePlayer.canPlay(name)) {
      const ok = this.nativePlayer.play(name, gain, rate, this.muted);
      if (ok) return true;
    }
    if (!this.ctx) return false;
    const buf = this.samples[name];
    if (!buf) return false;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate || 1;
      const g = this.ctx.createGain();
      g.gain.value = gain == null ? 0.9 : gain;
      src.connect(g);
      g.connect(this.master || this.ctx.destination);
      src.start(0);
      return true;
    } catch (e) {
      return false;
    }
  };

  AudioEngine.prototype.trackTitle = function (name) {
    return TRACK_TITLES[name] || '静音';
  };

  AudioEngine.prototype.unlock = function () {
    if (!this.ctx) {
      try {
        this.ctx = this.createContext();
      } catch (e) {
        this.ctx = null;
      }
      if (this.ctx) {
        try {
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : this.volume;
          this.master.connect(this.ctx.destination);
        } catch (e) {
          this.master = null;
        }
      }
    }
    if (this.ctx && this.ctx.resume) {
      try {
        this.ctx.resume();
      } catch (e) {
        /* ignore */
      }
    }
    if (this.ctx && this.track && this.current !== this.track) {
      this._start();
    }
  };

  AudioEngine.prototype.isMuted = function () {
    return this.muted;
  };

  AudioEngine.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    if (this.nativePlayer && this.nativePlayer.setMuted) {
      this.nativePlayer.setMuted(this.muted);
    }
    return this.muted;
  };

  AudioEngine.prototype.toggleMute = function () {
    return this.setMuted(!this.muted);
  };

  // 设置节奏紧凑度：0 休闲舒缓，1 紧张急促（影响速度 + 鼓点密度）
  AudioEngine.prototype.setIntensity = function (v) {
    this.intensity = Math.max(0, Math.min(1, v || 0));
  };

  AudioEngine.prototype.playTrack = function (name) {
    this.track = name;
    if (!this.ctx) return; // 解锁后自动播放
    this._start();
  };

  AudioEngine.prototype._start = function () {
    this._stopTimer();
    this.current = this.track;
    this.def = TRACKS[this.track] || null;
    this.step = 0;
    if (!this.def) return;
    this.baseStepDur = 60 / this.def.bpm / 4; // 16 分音符（基准）
    this.stepDur = this.baseStepDur;
    this.nextStepTime = this.ctx.currentTime + 0.08;
    const self = this;
    this.timer = setInterval(function () {
      self._schedule();
    }, 25);
    this._schedule();
  };

  AudioEngine.prototype._stopTimer = function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  AudioEngine.prototype._schedule = function () {
    if (!this.ctx || !this.def) return;
    // 紧凑度提升 → 速度加快（最多 +22%）
    this.stepDur = this.baseStepDur / (1 + this.intensity * 0.22);
    const lookahead = 0.18;
    let guard = 0;
    while (this.nextStepTime < this.ctx.currentTime + lookahead && guard < 32) {
      this._playStep(this.step, this.nextStepTime);
      this.nextStepTime += this.stepDur;
      this.step += 1;
      guard += 1;
    }
    if (guard >= 32) this.nextStepTime = this.ctx.currentTime + 0.06;
  };

  AudioEngine.prototype._playStep = function (step, time) {
    const d = this.def;
    const inBar = step % STEPS;
    const bar = Math.floor(step / STEPS) % d.progression.length;
    const chordDeg = d.progression[bar];
    const swing = d.swing && inBar % 2 === 1 ? d.swing * this.stepDur : 0;
    const t = time + swing;
    const self = this;

    function midi(deg) {
      return d.root + degToSemi(d.scale, deg);
    }

    const inten = this.intensity;

    // 鼓组（随紧凑度加密）
    if (d.kick[inBar] === 'x') self._kick(t, d.kickGain);
    else if (inten > 0.7 && inBar === 7) self._kick(t, d.kickGain * 0.7);

    if (d.snare[inBar] === 'x') self._snare(t, d.snareGain);

    if (d.hat[inBar] === 'x') self._hat(t, d.hatGain);
    else if (inten > 0.4 && inBar % 2 === 0) self._hat(t, d.hatGain * 0.55);
    else if (inten > 0.78) self._hat(t, d.hatGain * 0.35);

    // 和弦铺底（每小节开头）
    if (inBar === 0 && d.padGain > 0) {
      const triad = [0, 2, 4];
      for (let i = 0; i < triad.length; i++) {
        self._tone(mtof(midi(chordDeg + triad[i])), t, this.stepDur * STEPS * 0.9, 'sine', d.padGain);
      }
    }

    // 贝斯
    if (d.bass[inBar] === 'x' && d.bassGain > 0) {
      self._tone(mtof(midi(chordDeg) - 12), t, this.stepDur * 1.5, 'triangle', d.bassGain);
    }

    // 主旋律
    if (d.leadGain > 0) {
      const ad = d.arp[inBar % d.arp.length];
      self._tone(mtof(midi(chordDeg + ad) + 12), t, this.stepDur * 0.85, d.leadType || 'triangle', d.leadGain);
      // 高紧凑度时追加高八度点缀，营造紧张感
      if (inten > 0.6 && inBar % 4 === 2) {
        self._tone(mtof(midi(chordDeg + ad) + 24), t, this.stepDur * 0.5, 'sine', d.leadGain * 0.5);
      }
    }
  };

  /* ----------------------------- 合成原语 ----------------------------- */
  AudioEngine.prototype._tone = function (freq, time, dur, type, gain, endFreq) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, time);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur);
      }
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(this.master || this.ctx.destination);
      osc.start(time);
      osc.stop(time + dur + 0.03);
    } catch (e) {
      /* ignore */
    }
  };

  AudioEngine.prototype._noise = function (time, dur, gain, filterType, freq) {
    if (!this.ctx) return false;
    try {
      if (!this.noiseBuf && this.ctx.createBuffer) {
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
      }
      if (!this.noiseBuf) return false;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType || 'highpass';
      filter.frequency.value = freq || 7000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master || this.ctx.destination);
      src.start(time);
      src.stop(time + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  };

  AudioEngine.prototype._kick = function (time, gain) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(165, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
      osc.connect(g);
      g.connect(this.master || this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.24);
    } catch (e) {
      /* ignore */
    }
  };

  AudioEngine.prototype._snare = function (time, gain) {
    if (!this.ctx) return;
    if (!this._noise(time, 0.16, gain * 0.75, 'bandpass', 2200)) {
      this._tone(190, time, 0.12, 'triangle', gain * 0.6, 120);
    }
  };

  AudioEngine.prototype._hat = function (time, gain) {
    if (!this.ctx) return;
    if (!this._noise(time, 0.045, gain, 'highpass', 8200)) {
      this._tone(8200, time, 0.035, 'square', gain * 0.5);
    }
  };

  /* ----------------------------- 音效 ----------------------------- */
  AudioEngine.prototype.sfx = function (name, level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.002;
    try {
      if (name === 'tap') {
        this._tone(700, t, 0.05, 'sine', 0.05);
      } else if (name === 'bubble') {
        this._tone(420, t, 0.14, 'sine', 0.055, 1100);
      } else if (name === 'pop') {
        this._tone(880, t, 0.08, 'sine', 0.05, 1650);
        this._noise(t, 0.06, 0.02, 'highpass', 6000);
      } else if (name === 'sparkle') {
        this._tone(mtof(88), t, 0.12, 'sine', 0.03, mtof(95));
      } else if (name === 'drop') {
        this._tone(330, t, 0.1, 'sine', 0.06, 190);
      } else if (name === 'merge') {
        const b = 260 + (level || 0) * 46;
        this._tone(b, t, 0.1, 'triangle', 0.1);
        this._tone(b * 1.5, t + 0.04, 0.12, 'sine', 0.07);
      } else if (name === 'sun') {
        this._tone(520, t, 0.16, 'triangle', 0.12, 900);
        this._tone(780, t + 0.06, 0.2, 'sine', 0.08, 1200);
      } else if (name === 'over') {
        this._tone(360, t, 0.18, 'sawtooth', 0.08, 220);
        this._tone(220, t + 0.14, 0.4, 'sine', 0.09, 90);
      } else if (name === 'tile') {
        this._tone(880, t, 0.06, 'sine', 0.055);
        this._tone(1320, t + 0.03, 0.05, 'sine', 0.035);
      } else if (name === 'match') {
        this._tone(mtof(76), t, 0.08, 'triangle', 0.075);
        this._tone(mtof(80), t + 0.06, 0.08, 'triangle', 0.075);
        this._tone(mtof(83), t + 0.12, 0.14, 'sine', 0.08);
      } else if (name === 'win') {
        const s = [72, 76, 79, 84];
        for (let i = 0; i < s.length; i++) this._tone(mtof(s[i]), t + i * 0.11, 0.22, 'triangle', 0.09);
      } else if (name === 'levelup') {
        const s = [69, 73, 76, 81, 85];
        for (let i = 0; i < s.length; i++) {
          this._tone(mtof(s[i]), t + i * 0.085, 0.3, 'triangle', 0.09);
          this._tone(mtof(s[i] + 12), t + i * 0.085, 0.22, 'sine', 0.04);
        }
      } else if (name === 'star') {
        this._tone(1046, t, 0.09, 'sine', 0.06, 1568);
      } else if (name === 'whoosh') {
        this._noise(t, 0.22, 0.05, 'bandpass', 1200);
      } else if (name === 'animal') {
        this._animalVoice(level | 0, t);
      }
    } catch (e) {
      /* ignore */
    }
  };

  // 小动物叫声：每种动物音高与音色不同
  AudioEngine.prototype._animalVoice = function (type, time) {
    const v = ANIMAL_VOICES[type % ANIMAL_VOICES.length];
    const base = v.f[0];
    const gain = 0.085;

    if (v.f.length === 3) {
      // 三个音的连串叫声
      for (let i = 0; i < v.f.length; i++) {
        this._tone(mtof(v.f[i]), time + i * 0.075, v.dur, v.type, gain);
      }
      return;
    }

    const f0 = mtof(base);
    const f1 = mtof(v.glide ? v.f[1] : base);
    const dur = v.dur;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f1, time + dur * 0.85);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    // 颤音：让叫声更像活物
    if (v.vib) {
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = v.vib;
      lfoGain.gain.value = f0 * 0.06;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + dur + 0.02);
    }

    osc.connect(g);
    g.connect(this.master || this.ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  };

  return AudioEngine;
});
