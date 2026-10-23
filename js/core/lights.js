/*
 * 《星图点灯 · Lumina》—— 休闲解压 + 烧脑点灯（Lights Out 变体）
 *
 * 玩法：点一颗星，会翻转它自己 + 上下左右四颗相邻星的「亮/灭」。
 *       目标是把满盘星星全部点亮。
 *
 * 设计要点：
 * - 必定可解：从「全部点亮」出发，随机按下若干颗星得到开局，
 *   因此「把那几颗星再点一遍」就是必然的胜利路径（生成集 G）。
 * - 提示：剩余正解 = G XOR 已按集合，取其中任意一颗即为一着正解，无需外部求解器。
 * - 难度：棋盘越大、生成步数越多、可用步数预算越紧 → 越烧脑。
 * - 解压：柔和辉光、呼吸脉动、点击涟漪与星尘粒子、轻柔音效。
 */
(function (factory) {
  const StarGame = factory();
  if (typeof module === 'object' && module.exports) module.exports = StarGame;
  const g =
    typeof globalThis !== 'undefined' ? globalThis
      : typeof GameGlobal !== 'undefined' ? GameGlobal
        : typeof window !== 'undefined' ? window : this;
  if (g) g.StarGame = StarGame;
})(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Baloo 2","Nunito","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = '"Share Tech Mono","Consolas","Menlo","PingFang SC",monospace';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function roundRect(ctx, x, y, w, h, r) {
    if (r > h / 2) r = h / 2;
    if (r > w / 2) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- 关卡难度梯度 ---------------- */
  // n=边长; k=生成步数(正解规模); slack=可用多余步数(越小越难); hint=提示次数
  const LEVELS = [
    { n: 3, k: 3, slack: 4, hint: 2 }, // 1 教学关
    { n: 3, k: 4, slack: 4, hint: 2 }, // 2
    { n: 4, k: 6, slack: 4, hint: 2 }, // 3
    { n: 4, k: 8, slack: 3, hint: 2 }, // 4
    { n: 5, k: 10, slack: 3, hint: 2 }, // 5
    { n: 5, k: 13, slack: 2, hint: 2 }, // 6
    { n: 6, k: 16, slack: 2, hint: 1 }, // 7
    { n: 6, k: 20, slack: 2, hint: 1 }, // 8
  ];

  function levelConfig(level) {
    const base = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
    const extra = Math.max(0, level - LEVELS.length);
    const n = Math.min(7, base.n + Math.floor(extra / 3));
    const kmax = n * n - 1;
    return {
      n: n,
      k: Math.min(kmax, base.k + extra * 2),
      slack: Math.max(1, base.slack - Math.floor(extra / 4)),
      hint: base.hint,
    };
  }

  /* ---------------- 核心 ---------------- */
  function StarGame(opts) {
    opts = opts || {};
    this.opts = opts;
    this.storage = opts.storage || null;
    this.nav = null;
    this.width = opts.width || 0;
    this.height = opts.height || 0;

    this.best = this._loadBest();
    this.bestLevel = this._loadBestLevel();

    this.level = 1;
    this.time = 0;

    this._layout();
    this._genAmbient();
    this.reset();
  }

  StarGame.prototype._loadBest = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('lumina.best'), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  };
  StarGame.prototype._loadBestLevel = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('lumina.level'), 10);
      return isNaN(v) || v < 1 ? 1 : v;
    } catch (e) {
      return 1;
    }
  };
  StarGame.prototype._save = function () {
    try {
      if (this.storage) {
        this.storage.set('lumina.best', String(this.best));
        this.storage.set('lumina.level', String(this.bestLevel));
      }
    } catch (e) {
      /* ignore */
    }
  };

  StarGame.prototype._layout = function () {
    const w = this.width;
    const h = this.height;
    this.pad = Math.max(14, w * 0.05);
    this.hudH = Math.max(66, h * 0.1);
    this.barH = Math.max(78, h * 0.125);

    const boardTop = this.hudH + 8;
    const boardBottom = h - this.barH;
    const n = this.n || 3;
    const cell = Math.min((w - this.pad * 2) / n, (boardBottom - boardTop) / n) * 0.94;
    this.cell = cell;
    this.gridLeft = (w - n * cell) / 2;
    this.gridTop = boardTop + ((boardBottom - boardTop) - n * cell) / 2;

    // 顶部返回键
    this.backR = { x: this.pad * 0.6, y: this.pad * 0.6, w: 40, h: 34 };
    // 底部按钮
    const bw = Math.min(120, (w - this.pad * 2 - 14) / 2);
    const by = h - this.barH + (this.barH - 44) / 2 + 6;
    this.restartR = { x: w / 2 - bw - 7, y: by, w: bw, h: 44 };
    this.hintR = { x: w / 2 + 7, y: by, w: bw, h: 44 };

    // 结算面板按钮
    const pw = Math.min(150, w * 0.42);
    const cy = h * 0.62;
    this.pBtn = { x: w / 2 - pw - 8, y: cy, w: pw, h: 50 };
    this.pBtn2 = { x: w / 2 + 8, y: cy, w: pw, h: 50 };
  };

  StarGame.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    this._layout();
  };

  StarGame.prototype._genAmbient = function () {
    const n = Math.min(70, Math.floor((this.width * this.height) / 12000));
    this.ambient = [];
    for (let i = 0; i < n; i++) {
      this.ambient.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.6,
        ph: Math.random() * TAU,
        sp: 0.4 + Math.random() * 1.6,
        vy: 0.008 + Math.random() * 0.02,
      });
    }
  };

  StarGame.prototype._cellCenter = function (i, j) {
    const c = this.cell;
    return {
      x: this.gridLeft + (j + 0.5) * c,
      y: this.gridTop + (i + 0.5) * c,
    };
  };

  StarGame.prototype.reset = function () {
    this._layout();
    this.score = 0;
    this.combo = 0;
    this.lastTap = -9;
    this.state = 'play';
    this.winT = 0;
    this.particles = [];
    this.ripples = [];
    this.texts = [];
    this.shakeT = 0;
    this._genLevel();
    this._syncIntensity();
  };

  StarGame.prototype.onEnter = function () {
    this.level = Math.max(1, this.bestLevel);
    this.reset();
  };

  StarGame.prototype._syncIntensity = function () {
    if (this.opts.audio && this.opts.audio.setIntensity) {
      this.opts.audio.setIntensity(0.16 + Math.min(0.4, this.level * 0.03));
    }
  };

  // 生成一关：从全亮出发随机按下 k 颗星
  StarGame.prototype._genLevel = function () {
    const cfg = levelConfig(this.level || 1);
    const n = cfg.n;
    this.n = n;
    this._layout();

    const size = n * n;
    // 状态数组：1=亮 0=灭；从全亮开始
    const lit = new Array(size).fill(1);
    const effect = function (idx, arr) {
      const i = (idx / n) | 0;
      const j = idx % n;
      const flip = function (a, b) {
        if (a < 0 || a >= n || b < 0 || b >= n) return;
        const p = a * n + b;
        arr[p] = arr[p] ? 0 : 1;
      };
      flip(i, j);
      flip(i - 1, j);
      flip(i + 1, j);
      flip(i, j - 1);
      flip(i, j + 1);
    };

    let guard = 0;
    let chosen;
    let board;
    do {
      guard++;
      board = lit.slice();
      const pool = [];
      for (let p = 0; p < size; p++) pool.push(p);
      // 洗牌取前 k 个互不相同
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = pool[i];
        pool[i] = pool[j];
        pool[j] = t;
      }
      chosen = pool.slice(0, Math.min(cfg.k, size));
      for (let c = 0; c < chosen.length; c++) effect(chosen[c], board);
      // 至少要有一半是灭的，避免开局几乎全亮（太简单）
      let off = 0;
      for (let p = 0; p < size; p++) if (!board[p]) off++;
      if (off >= Math.max(2, Math.floor(size * 0.35))) break;
    } while (guard < 40);

    this.solution = chosen.slice(); // 生成集 = 一组正解
    this.lit = board;
    this.pressed = new Array(size).fill(0); // 每格被按次数（用于换算剩余正解，仅取奇偶）

    this.budget = chosen.length + cfg.slack;
    this.moves = 0;
    this.hints = cfg.hint;
    this.hintIdx = -1;
    this.hintT = 0;

    // 每格动画状态
    this.glow = new Array(size);
    this.pop = new Array(size).fill(0);
    this.phase = new Array(size);
    for (let p = 0; p < size; p++) {
      this.glow[p] = board[p] ? 1 : 0;
      this.phase[p] = Math.random() * TAU;
    }
  };

  /* ----------------------------- 输入 ----------------------------- */
  StarGame.prototype._hit = function (r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };

  StarGame.prototype._indexAt = function (x, y) {
    const c = this.cell;
    const j = Math.floor((x - this.gridLeft) / c);
    const i = Math.floor((y - this.gridTop) / c);
    if (i < 0 || i >= this.n || j < 0 || j >= this.n) return -1;
    return i * this.n + j;
  };

  StarGame.prototype.pointerDown = function (x, y) {
    if (this._hit(this.backR, x, y)) {
      if (this.nav) this.nav.back();
      return;
    }
    if (this.state === 'win') {
      if (this._hit(this.pBtn, x, y)) this._nextLevel();
      else if (this._hit(this.pBtn2, x, y) && this.nav) this.nav.back();
      return;
    }
    if (this.state === 'over') {
      if (this._hit(this.pBtn, x, y)) this._retry();
      else if (this._hit(this.pBtn2, x, y) && this.nav) this.nav.back();
      return;
    }

    // 游戏中
    if (this._hit(this.restartR, x, y)) {
      this._retry();
      return;
    }
    if (this._hit(this.hintR, x, y)) {
      this._useHint();
      return;
    }
    const idx = this._indexAt(x, y);
    if (idx >= 0) this._tap(idx);
  };

  StarGame.prototype.pointerMove = function () {};
  StarGame.prototype.pointerUp = function () {};

  StarGame.prototype._useHint = function () {
    if (this.hints <= 0) {
      this._sound('over');
      return;
    }
    // 剩余正解 = 生成集 XOR 已按奇偶
    let pick = -1;
    for (let c = 0; c < this.solution.length; c++) {
      const p = this.solution[c];
      const pressedOdd = this.pressed[p] & 1;
      if (!pressedOdd) {
        pick = p;
        break;
      }
    }
    // 若生成集已被按完（理论上应已胜利），退化：找第一个还亮的异常
    if (pick < 0) {
      for (let p = 0; p < this.lit.length; p++) {
        if (!this.lit[p]) {
          pick = p;
          break;
        }
      }
    }
    if (pick < 0) return;
    this.hints--;
    this.hintIdx = pick;
    this.hintT = 3.2;
    this._sound('sparkle');
  };

  StarGame.prototype._tap = function (idx) {
    if (this.state !== 'play') return;
    const n = this.n;
    const i = (idx / n) | 0;
    const j = idx % n;
    const flip = (a, b) => {
      if (a < 0 || a >= n || b < 0 || b >= n) return;
      const p = a * n + b;
      this.lit[p] = this.lit[p] ? 0 : 1;
      this.pop[p] = 1;
    };
    flip(i, j);
    flip(i - 1, j);
    flip(i + 1, j);
    flip(i, j - 1);
    flip(i, j + 1);

    this.pressed[idx] ^= 1;
    this.moves++;

    const c = this._cellCenter(i, j);
    this._ripple(c.x, c.y);
    this._spark(c.x, c.y, this.lit[idx] ? '#ffe9a8' : '#8fb4ff');

    const now = this.time;
    if (now - this.lastTap < 1.1) this.combo += 1;
    else this.combo = 1;
    this.lastTap = now;

    this._sound('tile');
    if (this.hintIdx === idx) {
      this.hintIdx = -1;
      this.hintT = 0;
    }

    if (this._allLit()) {
      this._win();
      return;
    }
    if (this.moves >= this.budget) {
      this._gameOver();
    }
  };

  StarGame.prototype._allLit = function () {
    for (let p = 0; p < this.lit.length; p++) if (!this.lit[p]) return false;
    return true;
  };

  StarGame.prototype._win = function () {
    this.state = 'win';
    this.winT = 0;
    const base = 300 + this.level * 120;
    const efficiency = Math.max(0, this.budget - this.moves); // 省下的步数
    const pts = base + efficiency * 60 + this.hints * 40;
    this.score = pts;
    if (this.score > this.best) this.best = this.score;
    if (this.level + 1 > this.bestLevel) this.bestLevel = this.level + 1;
    this._save();
    this._sound('levelup');

    // 漫天星火
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * TAU;
      const spd = 60 + Math.random() * 260;
      this.particles.push({
        x: this.width / 2,
        y: this.height * 0.42,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 60,
        g: 360,
        r: 1.5 + Math.random() * 3,
        life: 1 + Math.random() * 0.9,
        max: 1.9,
        color: Math.random() < 0.5 ? '#ffe9a8' : '#9ad0ff',
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  };

  StarGame.prototype._gameOver = function () {
    if (this.state === 'over') return;
    this.state = 'over';
    this.shakeT = 0.4;
    this._sound('over');
  };

  StarGame.prototype._nextLevel = function () {
    this.level += 1;
    this.state = 'play';
    this._genLevel();
    this._syncIntensity();
  };

  StarGame.prototype._retry = function () {
    this.state = 'play';
    this._genLevel();
  };

  /* ----------------------------- 反馈 ----------------------------- */
  StarGame.prototype._sound = function (name) {
    if (this.opts.sound) {
      try {
        this.opts.sound(name);
      } catch (e) {
        /* ignore */
      }
    }
  };

  StarGame.prototype._ripple = function (x, y) {
    this.ripples.push({ x: x, y: y, r: this.cell * 0.2, life: 0.5, max: 0.5 });
  };

  StarGame.prototype._spark = function (x, y, color) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * TAU;
      const spd = 40 + Math.random() * 120;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        g: 120,
        r: 1 + Math.random() * 2.2,
        life: 0.4 + Math.random() * 0.4,
        max: 0.8,
        color: color,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 9,
      });
    }
  };

  /* ----------------------------- 更新 ----------------------------- */
  StarGame.prototype.update = function (dt) {
    if (dt > 0.05) dt = 0.05;
    this.time += dt;

    if (this.winT > 0 || this.state === 'win') this.winT += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintIdx = -1;
    }

    // 发光缓动
    for (let p = 0; p < this.lit.length; p++) {
      const target = this.lit[p] ? 1 : 0;
      this.glow[p] += (target - this.glow[p]) * Math.min(1, dt * 12);
      if (this.pop[p] > 0) this.pop[p] = Math.max(0, this.pop[p] - dt * 3);
    }

    // 涟漪
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.life -= dt;
      rp.r += dt * this.cell * 3.4;
      if (rp.life <= 0) this.ripples.splice(i, 1);
    }

    // 粒子
    const CAP = 260;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0 || this.particles.length > CAP * 1.5) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy += pt.g * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.spin * dt;
    }

    // 背景星尘
    for (let i = 0; i < this.ambient.length; i++) {
      const s = this.ambient[i];
      s.y -= s.vy * dt;
      if (s.y < -0.02) {
        s.y = 1.02;
        s.x = Math.random();
      }
    }
  };

  /* ----------------------------- 渲染 ----------------------------- */
  StarGame.prototype.render = function (ctx) {
    this._bg(ctx);

    ctx.save();
    if (this.shakeT > 0) {
      const s = this.shakeT * 12;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this._grid(ctx);
    this._particles(ctx);
    this._ripples(ctx);
    ctx.restore();

    this._hud(ctx);
    this._bar(ctx);
    if (this.state === 'win') this._panel(ctx, true);
    else if (this.state === 'over') this._panel(ctx, false);
  };

  StarGame.prototype._bg = function (ctx) {
    const w = this.width;
    const h = this.height;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1128');
    g.addColorStop(0.5, '#070c1f');
    g.addColorStop(1, '#03050f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 柔和星云
    const neb = function (x, y, r, cr, cg, cb, a) {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')');
      gr.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(w * 0.2, h * 0.16, w * 0.7, 70, 60, 200, 0.18);
    neb(w * 0.9, h * 0.62, w * 0.66, 0, 170, 230, 0.13);
    neb(w * 0.4, h * 0.95, w * 0.7, 210, 120, 60, 0.1);

    // 背景星尘
    for (let i = 0; i < this.ambient.length; i++) {
      const s = this.ambient[i];
      const a = 0.2 + 0.6 * Math.abs(Math.sin(this.time * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  StarGame.prototype._grid = function (ctx) {
    const n = this.n;
    const c = this.cell;
    const litCount = (function (self) {
      let k = 0;
      for (let p = 0; p < self.lit.length; p++) if (self.lit[p]) k++;
      return k;
    })(this);
    const total = n * n;

    // 星座连线：把相邻且都点亮的星连成星座（画在星星下方）
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = i * n + j;
        if (!this.lit[p]) continue;
        const a = this._cellCenter(i, j);
        // 右邻
        if (j + 1 < n && this.lit[p + 1]) {
          const b = this._cellCenter(i, j + 1);
          this._constLine(ctx, a, b);
        }
        // 下邻
        if (i + 1 < n && this.lit[p + n]) {
          const b = this._cellCenter(i + 1, j);
          this._constLine(ctx, a, b);
        }
      }
    }
    ctx.restore();

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = i * n + j;
        const ct = this._cellCenter(i, j);
        const lit = this.lit[p];
        const glow = this.glow[p];
        const pop = this.pop[p];
        const breathe = 0.5 + 0.5 * Math.sin(this.time * 1.8 + this.phase[p]);

        // 格子底板
        const pad = c * 0.1;
        const bx = this.gridLeft + j * c + pad;
        const by = this.gridTop + i * c + pad;
        const bs = c - pad * 2;
        roundRect(ctx, bx, by, bs, bs, bs * 0.24);
        ctx.fillStyle = lit
          ? 'rgba(70,60,30,' + (0.18 + 0.16 * glow) + ')'
          : 'rgba(30,44,86,0.5)';
        ctx.fill();
        ctx.strokeStyle = lit
          ? 'rgba(255,214,120,' + (0.35 + 0.4 * glow) + ')'
          : 'rgba(80,110,170,0.4)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 中心星星
        const rBase = c * 0.26 * (1 + pop * 0.28);
        if (glow > 0.03) {
          const grad = ctx.createRadialGradient(ct.x, ct.y, 0, ct.x, ct.y, c * 0.62);
          grad.addColorStop(0, 'rgba(255,236,160,' + (0.55 * glow) + ')');
          grad.addColorStop(0.5, 'rgba(255,190,90,' + (0.22 * glow) + ')');
          grad.addColorStop(1, 'rgba(255,170,80,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(ct.x, ct.y, c * 0.62, 0, TAU);
          ctx.fill();
        }

        // 五角星
        const rr = rBase * (0.9 + 0.1 * breathe);
        this._star(ctx, ct.x, ct.y, rr, lit ? glow : 0.12, lit, breathe);

        // 提示环
        if (this.hintIdx === p && this.hintT > 0) {
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 8);
          ctx.strokeStyle = '#9ad0ff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(ct.x, ct.y, c * 0.42, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 进度：已点亮 / 总数（带环形进度）
    const cx = this.width / 2;
    const topY = this.gridTop - Math.max(16, c * 0.42);
    const ratio = litCount / total;
    const R = Math.max(9, c * 0.22);
    // 环形进度
    ctx.save();
    ctx.strokeStyle = 'rgba(80,110,170,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - Math.max(46, c * 1.1), topY, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ffd780';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - Math.max(46, c * 1.1), topY, R, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(220,232,255,0.85)';
    ctx.font = 'bold ' + Math.round(Math.min(14, c * 0.42)) + 'px ' + MONO;
    ctx.fillText(litCount + ' / ' + total + ' 颗', cx - Math.max(28, c * 0.7), topY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  };

  // 星座连线：柔和发光连线 + 流动光点
  StarGame.prototype._constLine = function (ctx, a, b) {
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    const pulse = 0.35 + 0.25 * Math.sin(this.time * 2 + (a.x + b.y) * 0.02);
    grad.addColorStop(0, 'rgba(255,214,120,' + pulse + ')');
    grad.addColorStop(1, 'rgba(255,180,90,' + pulse + ')');
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1.5, this.cell * 0.05);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // 流动光点
    const t = (this.time * 0.6 + (a.x + a.y) * 0.001) % 1;
    const lp = { x: lerp2(a.x, b.x, t), y: lerp2(a.y, b.y, t) };
    ctx.fillStyle = 'rgba(255,245,200,0.9)';
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, Math.max(1, this.cell * 0.04), 0, TAU);
    ctx.fill();
  };

  function lerp2(a, b, t) {
    return a + (b - a) * t;
  }

  StarGame.prototype._star = function (ctx, x, y, r, glow, lit, breathe) {
    const spikes = 5;
    const inner = r * 0.44;
    ctx.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
      const rad = k % 2 === 0 ? r : inner;
      const a = (Math.PI / spikes) * k - Math.PI / 2;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (lit && glow > 0.03) {
      const gg = ctx.createLinearGradient(x, y - r, x, y + r);
      gg.addColorStop(0, '#fff7d6');
      gg.addColorStop(0.5, '#ffdf86');
      gg.addColorStop(1, '#ffb347');
      ctx.fillStyle = gg;
      ctx.save();
      ctx.shadowColor = 'rgba(255,205,110,0.9)';
      ctx.shadowBlur = r * (0.8 + 0.6 * breathe);
      ctx.fill();
      ctx.restore();

      // 十字星芒
      const sp = r * (1.9 + 0.4 * breathe);
      const alpha = 0.5 * glow;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,235,170,' + alpha + ')';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - sp, y);
      ctx.lineTo(x + sp, y);
      ctx.moveTo(x, y - sp);
      ctx.lineTo(x, y + sp);
      ctx.stroke();
      // 斜向短芒
      const sp2 = sp * 0.5;
      ctx.strokeStyle = 'rgba(255,235,170,' + (alpha * 0.6) + ')';
      ctx.lineWidth = Math.max(0.8, r * 0.08);
      const d = sp2 * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - d, y - d);
      ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d);
      ctx.lineTo(x - d, y + d);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(120,150,205,' + (0.28 + (lit ? glow : 0)) + ')';
      ctx.fill();
    }
  };

  StarGame.prototype._particles = function (ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      const a = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      // 小四角星
      const r = pt.r;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.6);
      ctx.lineTo(r * 0.5, -r * 0.5);
      ctx.lineTo(r * 1.6, 0);
      ctx.lineTo(r * 0.5, r * 0.5);
      ctx.lineTo(0, r * 1.6);
      ctx.lineTo(-r * 0.5, r * 0.5);
      ctx.lineTo(-r * 1.6, 0);
      ctx.lineTo(-r * 0.5, -r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  StarGame.prototype._ripples = function (ctx) {
    for (let i = 0; i < this.ripples.length; i++) {
      const rp = this.ripples[i];
      const a = clamp(rp.life / rp.max, 0, 1);
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  StarGame.prototype._hud = function (ctx) {
    const w = this.width;
    const h = this.hudH;

    // 返回键
    ctx.save();
    roundRect(ctx, this.backR.x, this.backR.y, this.backR.w, this.backR.h, 10);
    ctx.fillStyle = 'rgba(30,44,86,0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,232,255,0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#8fd6ff';
    ctx.font = 'bold 16px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹', this.backR.x + this.backR.w / 2, this.backR.y + this.backR.h / 2 + 1);
    ctx.restore();

    // 中部信息
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#eaf3ff';
    ctx.font = 'bold ' + Math.round(Math.min(22, w * 0.058)) + 'px ' + FONT;
    ctx.fillText('第 ' + this.level + ' 关', w / 2, this.backR.y + 22);

    // 步数预算
    const left = this.budget - this.moves;
    const danger = left <= 2;
    ctx.fillStyle = danger ? '#ff8f9c' : 'rgba(180,210,255,0.85)';
    ctx.font = Math.round(Math.min(14, w * 0.038)) + 'px ' + MONO;
    ctx.fillText('步数 ' + this.moves + ' / ' + this.budget, w / 2, this.backR.y + 22 + Math.max(18, w * 0.05));

    // 提示次数
    ctx.fillStyle = 'rgba(180,210,255,0.7)';
    ctx.font = Math.round(Math.min(12, w * 0.033)) + 'px ' + MONO;
    ctx.fillText('💡 ' + this.hints + '  ·  最高 ' + this.bestLevel, w / 2, this.backR.y + 22 + Math.max(34, w * 0.085));

    ctx.textAlign = 'left';
  };

  StarGame.prototype._bar = function (ctx) {
    const w = this.width;
    const y = this.height - this.barH;

    const btn = (r, label, accent, enabled) => {
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, enabled ? 'rgba(50,70,120,0.95)' : 'rgba(40,50,80,0.7)');
      g.addColorStop(1, enabled ? 'rgba(30,44,86,0.95)' : 'rgba(30,36,60,0.7)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = enabled ? accent : 'rgba(90,110,150,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = enabled ? '#eaf3ff' : 'rgba(150,170,200,0.6)';
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.restore();
    };

    btn(this.restartR, '↻ 重来', 'rgba(125,232,255,0.6)', true);
    btn(this.hintR, '💡 提示 ' + this.hints, 'rgba(255,214,120,0.7)', this.hints > 0);
  };

  StarGame.prototype._panel = function (ctx, win) {
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,20,0.68)';
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(w - this.pad * 2, 340);
    const ph = 250;
    const px = (w - pw) / 2;
    const py = h * 0.3;

    roundRect(ctx, px, py, pw, ph, 22);
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, 'rgba(28,40,80,0.98)');
    g.addColorStop(1, 'rgba(16,24,50,0.98)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = win ? 'rgba(255,214,120,0.7)' : 'rgba(255,120,140,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = win ? '#ffe9a8' : '#ff9fae';
    ctx.font = 'bold ' + Math.round(Math.min(30, pw * 0.1)) + 'px ' + FONT;
    ctx.fillText(win ? '星图点亮！' : '差一点点', w / 2, py + 62);

    ctx.fillStyle = 'rgba(200,220,255,0.82)';
    ctx.font = Math.round(Math.min(15, pw * 0.05)) + 'px ' + FONT;
    if (win) {
      ctx.fillText('本关得分 ' + this.score, w / 2, py + 104);
      ctx.fillStyle = 'rgba(180,210,255,0.6)';
      ctx.fillText('最高关卡 ' + this.bestLevel + '  ·  最高分 ' + this.best, w / 2, py + 132);
    } else {
      ctx.fillText('步数用完了，再来一次吧～', w / 2, py + 104);
      ctx.fillStyle = 'rgba(180,210,255,0.6)';
      ctx.fillText('点亮 ' + this._litCount() + ' / ' + this.n * this.n + ' 颗', w / 2, py + 132);
    }

    const drawBtn = (r, label, accent) => {
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      bg.addColorStop(0, accent + 'cc');
      bg.addColorStop(1, accent + '99');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = '#0a1128';
      ctx.font = 'bold 16px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    };

    // 面板按钮位置需要与 pointerDown 的 pBtn/pBtn2 对齐
    this.pBtn.y = py + ph - 70;
    this.pBtn2.y = py + ph - 70;
    if (win) {
      drawBtn(this.pBtn, '下一关', '#7de8ff');
      drawBtn(this.pBtn2, '回首页', '#b39bff');
    } else {
      drawBtn(this.pBtn, '重试', '#7de8ff');
      drawBtn(this.pBtn2, '回首页', '#b39bff');
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  StarGame.prototype._litCount = function () {
    let k = 0;
    for (let p = 0; p < this.lit.length; p++) if (this.lit[p]) k++;
    return k;
  };

  return StarGame;
});
