/*
 * 《星际合成 · Nova Fusion》—— 科幻风「投放 + 合成」玩法
 *
 * - 从轨道投放能量球，两个同等级能量球相撞后融合为更高等级
 * - 能量球等级：尘 → 微粒 → 赤岩 → 熔核 → 曜金 → 蓝晶 → 深蓝 → 翠芒 → 环带 → 巨木 → 恒星
 * - 扇区（SECTOR）难度梯度：重力、警戒线、判定时间、投放花色逐级提升
 * - 全息 UI / 能量场容器 / 扫描网格 / 等离子火花，全部 Canvas 程序化绘制
 */
(function (factory) {
  const MergeGame = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = MergeGame;
  }
  const g =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof GameGlobal !== 'undefined'
        ? GameGlobal
        : typeof window !== 'undefined'
          ? window
          : this;
  if (g) g.MergeGame = MergeGame;
})(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Baloo 2","Nunito","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = '"Share Tech Mono","Consolas","Menlo","PingFang SC",monospace';

  const GRAVITY = 1500;
  const REST = 0.16;
  const WALL_REST = 0.3;
  const FIXED = 1 / 120;
  const SOLVER_ITER = 4;

  const PLANETS = [
    { name: '尘', r: 13, c1: '#8ef2ff', c2: '#1c6fa8', glow: '#5fd8ff' },
    { name: '微粒', r: 18, c1: '#dff6ff', c2: '#4d8fc0', glow: '#8fe8ff' },
    { name: '赤岩', r: 24, c1: '#ffc98a', c2: '#a85c1e', glow: '#ffb066' },
    { name: '熔核', r: 30, c1: '#ff8f6b', c2: '#a32a3f', glow: '#ff7a6b' },
    { name: '曜金', r: 37, c1: '#ffe27a', c2: '#b3820e', glow: '#ffd85a' },
    { name: '蓝晶', r: 45, c1: '#7de8ff', c2: '#1350a8', glow: '#57d6ff' },
    { name: '深蓝', r: 53, c1: '#9aa8ff', c2: '#2a2f9c', glow: '#8a9cff' },
    { name: '翠芒', r: 61, c1: '#a8f5ea', c2: '#158f86', glow: '#7ff0e0' },
    { name: '环带', r: 69, c1: '#ffe6a6', c2: '#a67c18', glow: '#ffdc8a', ring: true },
    { name: '巨木', r: 77, c1: '#ffc49a', c2: '#8f4a18', glow: '#ffb184' },
    { name: '恒星', r: 86, c1: '#ffffff', c2: '#ffb020', glow: '#ffe27a', sun: true },
  ];
  const MAX_LEVEL = PLANETS.length - 1;
  const POINTS = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 60];

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function easeOutBack(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function parseHex(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function mixHex(a, b, t) {
    const ca = parseHex(a);
    const cb = parseHex(b);
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* ----------------------------- 实体 ----------------------------- */
  let idCounter = 0;
  function Planet(x, y, r, level) {
    this.id = ++idCounter;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = r;
    this.level = level;
    this.dead = false;
    this.age = 0;
    this.spawnT = 0;
    this.phase = Math.random() * TAU;
  }

  /* ----------------------------- 核心 ----------------------------- */
  function MergeGame(opts) {
    opts = opts || {};
    this.opts = opts;
    this.storage = opts.storage || null;
    this.nav = null;
    this.best = this._loadBest();
    this.bestSector = this._loadBestSector();

    this.width = opts.width || 0;
    this.height = opts.height || 0;

    this.planets = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.stars = [];

    this.time = 0;
    this.acc = 0;

    this.sector = 1;
    this.gravityMul = 1;
    this.graceTime = 1.6;
    this.lineDrop = 0;
    this.maxDropLevel = 2;
    this.nextSectorAt = 400;

    this._layout();
    this._genStars();
    this.reset();
  }

  MergeGame.prototype._loadBest = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('nova.best'), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  };

  MergeGame.prototype._saveBest = function () {
    try {
      if (this.storage) this.storage.set('nova.best', String(this.best));
    } catch (e) {
      /* ignore */
    }
  };

  MergeGame.prototype._loadBestSector = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('nova.sector'), 10);
      return isNaN(v) ? 1 : v;
    } catch (e) {
      return 1;
    }
  };

  MergeGame.prototype._saveBestSector = function () {
    try {
      if (this.storage) this.storage.set('nova.sector', String(this.bestSector));
    } catch (e) {
      /* ignore */
    }
  };

  MergeGame.prototype._layout = function () {
    const w = this.width;
    const h = this.height;
    this.pad = Math.max(12, w * 0.05);
    this.leftX = this.pad;
    this.rightX = w - this.pad;
    this.hudY = h * 0.05;
    this.dropY = h * 0.135;
    this.topY = h * 0.175;
    this.baseLineY = h * 0.215;
    this.floorY = h - Math.max(22, h * 0.045);
    this.corner = Math.min(22, w * 0.06);
    this.lineY = this.baseLineY + this.lineDrop * h;
  };

  MergeGame.prototype._genStars = function () {
    const w = this.width;
    const h = this.height;
    const count = Math.min(170, Math.floor((w * h) / 5000));
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.4, 1.6),
        ph: Math.random() * TAU,
        sp: rand(0.6, 2.4),
      });
    }
    // 场内等离子微粒
    this.motes = [];
    const moteCount = Math.min(28, Math.floor((w * h) / 22000));
    const moteColors = ['#7de8ff', '#c08bff', '#ff8fb1', '#ffd76e'];
    for (let i = 0; i < moteCount; i++) {
      this.motes.push({
        x: rand(this.leftX, this.rightX),
        y: rand(this.topY, this.floorY),
        r: rand(1, 2.6),
        vy: rand(6, 22),
        ph: Math.random() * TAU,
        c: moteColors[i % moteColors.length],
      });
    }
  };

  MergeGame.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    this._layout();
    this._genStars();
    for (let i = 0; i < this.planets.length; i++) {
      const b = this.planets[i];
      b.x = clamp(b.x, this.leftX + b.r, this.rightX - b.r);
      b.y = Math.min(b.y, this.floorY - b.r);
    }
    if (!this.pointerActive) this.aimX = (this.leftX + this.rightX) / 2;
  };

  /* --------------------------- 扇区难度 --------------------------- */
  MergeGame.prototype._applySector = function () {
    const idx = this.sector - 1;
    this.gravityMul = 1 + idx * 0.06;
    this.graceTime = Math.max(0.9, 1.7 - idx * 0.06);
    this.lineDrop = Math.min(0.05, idx * 0.005);
    this.maxDropLevel = idx < 2 ? 2 : idx < 5 ? 3 : 4;
    this.lineY = this.baseLineY + this.lineDrop * this.height;
    // BGM 随扇区推进逐步紧凑
    if (this.opts.audio) {
      this.opts.audio.setIntensity(Math.min(0.95, 0.35 + idx * 0.06));
    }
  };

  MergeGame.prototype._checkSector = function () {
    if (this.score >= this.nextSectorAt && this.sector < 30) {
      this.sector += 1;
      this.nextSectorAt = 1200 * this.sector;
      this._applySector();
      if (this.sector > this.bestSector) {
        this.bestSector = this.sector;
        this._saveBestSector();
      }
      this._ringFx(this.width / 2, this.height * 0.42, 20, '#7de8ff');
      this._text(this.width / 2, this.height * 0.34, 'SECTOR ' + pad2(this.sector), '#7de8ff', true);
      this._sound('levelup');
    }
  };

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  MergeGame.prototype._randomLevel = function () {
    const r = Math.random();
    const max = this.maxDropLevel;
    if (r < 0.4) return 0;
    if (r < 0.72) return 1;
    if (r < 0.9) return Math.min(2, max);
    return 1 + Math.floor(Math.random() * Math.max(1, max));
  };

  MergeGame.prototype.reset = function () {
    this.planets = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.score = 0;
    this.combo = 0;
    this.dangerTime = 0;
    this.acc = 0;
    this.gameOver = false;
    this.pointerActive = false;
    this.dropCooldown = 0;
    this.hintT = 0;
    this.lastMergeTime = -9;
    this.sector = 1;
    this.nextSectorAt = 1200;
    this._applySector();
    this.currentLevel = this._randomLevel();
    this.nextLevel = this._randomLevel();
    this.aimX = (this.leftX + this.rightX) / 2;
  };

  MergeGame.prototype.restart = function () {
    this.reset();
  };

  MergeGame.prototype.onEnter = function () {
    this.reset();
  };

  /* ----------------------------- 输入 ----------------------------- */
  MergeGame.prototype._clampAim = function (x) {
    return clamp(x, this.leftX + 6, this.rightX - 6);
  };

  MergeGame.prototype.pointerDown = function (x, y) {
    if (this.gameOver) {
      if (this._hitRestart(x, y)) {
        this.restart();
      } else if (this._hitHome(x, y)) {
        if (this.nav) this.nav.back();
      }
      return;
    }
    if (this._hitBack(x, y)) {
      if (this.nav) this.nav.back();
      return;
    }
    this.pointerActive = true;
    this.aimX = this._clampAim(x);
  };

  MergeGame.prototype.pointerMove = function (x) {
    if (this.gameOver) return;
    if (this.pointerActive) this.aimX = this._clampAim(x);
  };

  MergeGame.prototype.pointerUp = function () {
    if (this.gameOver) return;
    if (!this.pointerActive) return;
    this.pointerActive = false;
    if (this.dropCooldown > 0) return;
    this._drop();
  };

  MergeGame.prototype._drop = function () {
    const lvl = this.currentLevel;
    const b = new Planet(this.aimX, this.dropY, PLANETS[lvl].r, lvl);
    b.vy = 40;
    b.spawnT = 0.12;
    this.planets.push(b);
    this.currentLevel = this.nextLevel;
    this.nextLevel = this._randomLevel();
    this.dropCooldown = 0.18;
    this._sound('drop');
  };

  /* ----------------------------- 更新 ----------------------------- */
  MergeGame.prototype.update = function (dt) {
    if (dt > 0.05) dt = 0.05;
    this._updateAnimations(dt);

    if (this.gameOver) return;
    if (this.dropCooldown > 0) this.dropCooldown -= dt;

    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED && steps < 12) {
      this._step(FIXED);
      this.acc -= FIXED;
      steps += 1;
      if (this.gameOver) {
        this.acc = 0;
        break;
      }
    }
    if (steps >= 12) this.acc = 0;
  };

  MergeGame.prototype._updateAnimations = function (dt) {
    this.time += dt;
    this.hintT += dt;

    const planets = this.planets;
    for (let i = 0; i < planets.length; i++) {
      if (planets[i].spawnT < 0.24) planets[i].spawnT += dt;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const rr = this.rings[i];
      rr.life -= dt;
      if (rr.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      rr.r += rr.spd * dt;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y -= t.vy * dt;
    }
  };

  MergeGame.prototype._step = function (dt) {
    const planets = this.planets;
    const g = GRAVITY * this.gravityMul;

    for (let i = 0; i < planets.length; i++) {
      const b = planets[i];
      b.vy += g * dt;
      b.vx *= 0.999;
      b.vy *= 0.999;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;
    }

    // 融合检测
    const isDead = {};
    const merges = [];
    for (let i = 0; i < planets.length; i++) {
      const a = planets[i];
      if (isDead[a.id]) continue;
      for (let j = i + 1; j < planets.length; j++) {
        const b = planets[j];
        if (isDead[b.id]) continue;
        if (a.level !== b.level) continue;
        const rr = a.r + b.r;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy <= rr * rr - 0.5) {
          isDead[a.id] = true;
          isDead[b.id] = true;
          merges.push([a, b]);
          break;
        }
      }
    }

    if (merges.length) {
      const survivors = [];
      for (let i = 0; i < planets.length; i++) {
        if (!isDead[planets[i].id]) survivors.push(planets[i]);
      }
      for (let m = 0; m < merges.length; m++) {
        const np = this._doMerge(merges[m][0], merges[m][1]);
        if (np) survivors.push(np);
      }
      this.planets = survivors;
    }

    for (let it = 0; it < SOLVER_ITER; it++) {
      this._resolveWalls();
      this._resolvePairs();
    }

    this._updateDanger(dt);
  };

  MergeGame.prototype._resolveWalls = function () {
    const arr = this.planets;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (b.x - b.r < this.leftX) {
        b.x = this.leftX + b.r;
        if (b.vx < 0) b.vx = -b.vx * WALL_REST;
      }
      if (b.x + b.r > this.rightX) {
        b.x = this.rightX - b.r;
        if (b.vx > 0) b.vx = -b.vx * WALL_REST;
      }
      if (b.y + b.r > this.floorY) {
        b.y = this.floorY - b.r;
        if (b.vy > 0) b.vy = -b.vy * REST;
        b.vx *= 0.9;
      }
    }
  };

  MergeGame.prototype._resolvePairs = function () {
    const arr = this.planets;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minD = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minD - d;

        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const mt = ma + mb;

        a.x -= nx * ((overlap * mb) / mt);
        a.y -= ny * ((overlap * mb) / mt);
        b.x += nx * ((overlap * ma) / mt);
        b.y += ny * ((overlap * ma) / mt);

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const jimp = (-(1 + REST) * vn) / (1 / ma + 1 / mb);
          a.vx -= (jimp * nx) / ma;
          a.vy -= (jimp * ny) / ma;
          b.vx += (jimp * nx) / mb;
          b.vy += (jimp * ny) / mb;
        }
      }
    }
  };

  MergeGame.prototype._updateDanger = function (dt) {
    let danger = false;
    const arr = this.planets;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (b.age < 0.45) continue;
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (b.y - b.r < this.lineY && speed < 130) {
        danger = true;
        break;
      }
    }
    if (danger) this.dangerTime += dt;
    else this.dangerTime = Math.max(0, this.dangerTime - dt * 2);

    if (this.dangerTime > this.graceTime) this._gameOver();
  };

  MergeGame.prototype._gameOver = function () {
    if (this.gameOver) return;
    this.gameOver = true;
    if (this.score > this.best) {
      this.best = this.score;
      this._saveBest();
    }
    this._sound('over');
  };

  MergeGame.prototype._doMerge = function (a, b) {
    const nx = (a.x + b.x) / 2;
    const ny = (a.y + b.y) / 2;
    const src = PLANETS[a.level];

    if (this.time - this.lastMergeTime < 0.75) this.combo += 1;
    else this.combo = 1;
    this.lastMergeTime = this.time;

    this._burst(nx, ny, a.r, src.glow || src.c1);
    this._ringFx(nx, ny, Math.max(a.r, b.r) * 1.4, src.glow || src.c1);

    const level = a.level + 1;
    if (level > MAX_LEVEL) {
      const pts = 200 * this.combo;
      this.score += pts;
      this._text(nx, ny - 16, '+' + pts, '#ffe27a', true);
      this._ringFx(nx, ny, 20, '#ffe27a');
      this._sound('sun');
      this._checkSector();
      return null;
    }

    const np = new Planet(nx, ny, PLANETS[level].r, level);
    np.vx = (a.vx + b.vx) * 0.5;
    np.vy = (a.vy + b.vy) * 0.5 - 40;
    np.spawnT = 0;

    const pts = POINTS[level] * this.combo;
    this.score += pts;
    this._text(nx, ny - PLANETS[level].r, '+' + pts, PLANETS[level].glow || PLANETS[level].c1, false);
    if (this.combo > 1) {
      this._text(nx, ny - PLANETS[level].r - 24, 'OVERDRIVE x' + this.combo, '#7de8ff', true);
    }
    this._sound('merge', level);
    this._checkSector();
    return np;
  };

  MergeGame.prototype._burst = function (x, y, r, color) {
    const n = 10 + Math.floor(r / 4);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU;
      const spd = rand(80, 300);
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 50,
        g: 420,
        r: rand(1.2, 3.2),
        life: rand(0.3, 0.7),
        max: 0.7,
        color: color,
      });
    }
  };

  MergeGame.prototype._ringFx = function (x, y, r, color) {
    this.rings.push({ x: x, y: y, r: r, spd: 210, life: 0.45, max: 0.45, color: color });
  };

  MergeGame.prototype._text = function (x, y, text, color, big) {
    this.texts.push({
      x: x,
      y: y,
      text: text,
      color: color,
      life: big ? 1.1 : 0.85,
      max: big ? 1.1 : 0.85,
      vy: 46,
      big: !!big,
    });
  };

  MergeGame.prototype._sound = function (name, level) {
    if (this.opts.sound) {
      try {
        this.opts.sound(name, level);
      } catch (e) {
        /* ignore */
      }
    }
  };

  MergeGame.prototype._hitRect = function (r, x, y) {
    if (!r) return false;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };
  MergeGame.prototype._hitRestart = function (x, y) {
    return this._hitRect(this._restartRect, x, y);
  };
  MergeGame.prototype._hitHome = function (x, y) {
    return this._hitRect(this._homeRect, x, y);
  };
  MergeGame.prototype._hitBack = function (x, y) {
    return this._hitRect(this._backRect, x, y);
  };

  /* ----------------------------- 绘制 ----------------------------- */
  MergeGame.prototype.render = function (ctx) {
    this._bg(ctx);
    this._grid(ctx);
    this._field(ctx);
    this._fieldMotes(ctx);
    this._dangerLine(ctx);
    this._guide(ctx);
    this._drawPlanets(ctx);
    this._drawParticles(ctx);
    this._drawTexts(ctx);
    this._hud(ctx);
    this._scanlines(ctx);
    if (!this.gameOver && this.hintT < 3) this._hint(ctx);
    if (this.gameOver) this._over(ctx);
  };

  MergeGame.prototype._bg = function (ctx) {
    const w = this.width;
    const h = this.height;

    if (this.bgImage && this.bgImage.width) {
      const iw = this.bgImage.width;
      const ih = this.bgImage.height;
      const scale = Math.max(w / iw, h / ih) * 1.06;
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (w - dw) / 2 + Math.sin(this.time * 0.13) * 6;
      const dy = (h - dh) / 2 + Math.cos(this.time * 0.1) * 5;
      ctx.drawImage(this.bgImage, dx, dy, dw, dh);

      // 闪烁星点叠加（本身已含星空，这里补动态光）
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const a = 0.2 + 0.6 * Math.abs(Math.sin(this.time * s.sp + s.ph));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#dbeaff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060b22');
    g.addColorStop(0.5, '#04071a');
    g.addColorStop(1, '#02040e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    this._nebula(ctx, w * 0.24, h * 0.2, w * 0.7, 60, 90, 255, 0.2);
    this._nebula(ctx, w * 0.86, h * 0.58, w * 0.68, 0, 190, 255, 0.16);
    this._nebula(ctx, w * 0.42, h * 0.95, w * 0.66, 190, 40, 160, 0.14);

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const a = 0.25 + 0.75 * Math.abs(Math.sin(this.time * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dbeaff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  MergeGame.prototype.setBackground = function (img) {
    this.bgImage = img;
  };

  MergeGame.prototype._nebula = function (ctx, x, y, r, cr, cg, cb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // 底部透视网格
  MergeGame.prototype._grid = function (ctx) {
    const w = this.width;
    const h = this.height;
    const horizon = h * 0.72;
    ctx.save();
    ctx.strokeStyle = 'rgba(90,160,255,0.16)';
    ctx.lineWidth = 1;

    // 纵向透视线
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * (w / 14), horizon);
      ctx.lineTo(w / 2 + i * (w / 3.2), h);
      ctx.stroke();
    }
    // 横向滚动线
    const scroll = (this.time * 0.35) % 1;
    for (let i = 0; i < 9; i++) {
      const t = (i + scroll) / 9;
      const y = horizon + Math.pow(t, 2.2) * (h - horizon);
      ctx.globalAlpha = 0.15 + t * 0.45;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  // 能量场容器
  MergeGame.prototype._field = function (ctx) {
    const gg = ctx.createLinearGradient(0, this.topY, 0, this.floorY);
    gg.addColorStop(0, 'rgba(80,170,255,0.05)');
    gg.addColorStop(1, 'rgba(80,170,255,0.13)');
    ctx.fillStyle = gg;
    this._fieldPath(ctx);
    ctx.fill();

    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(125,232,255,0.75)';
    ctx.shadowColor = '#39c8ff';
    ctx.shadowBlur = 18;
    this._fieldPath(ctx);
    ctx.stroke();
    ctx.restore();

    // 导轨刻度
    ctx.save();
    ctx.strokeStyle = 'rgba(125,232,255,0.28)';
    ctx.lineWidth = 1;
    const step = Math.max(26, this.floorY / 9);
    for (let y = this.topY + 10; y < this.floorY; y += step) {
      ctx.beginPath();
      ctx.moveTo(this.leftX - 5, y);
      ctx.lineTo(this.leftX, y);
      ctx.moveTo(this.rightX, y);
      ctx.lineTo(this.rightX + 5, y);
      ctx.stroke();
    }
    ctx.restore();

    // 四角括号
    ctx.save();
    ctx.strokeStyle = 'rgba(160,220,255,0.5)';
    ctx.lineWidth = 2;
    const L = 16;
    const corners = [
      [this.leftX, this.topY, 1, 1],
      [this.rightX, this.topY, -1, 1],
      [this.leftX, this.floorY, 1, -1],
      [this.rightX, this.floorY, -1, -1],
    ];
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] + c[3] * L);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0] + c[2] * L, c[1]);
      ctx.stroke();
    }
    ctx.restore();
  };

  MergeGame.prototype._fieldPath = function (ctx) {
    const leftX = this.leftX;
    const rightX = this.rightX;
    const topY = this.topY;
    const floorY = this.floorY;
    const c = this.corner;
    ctx.beginPath();
    ctx.moveTo(leftX, topY);
    ctx.lineTo(leftX, floorY - c);
    ctx.quadraticCurveTo(leftX, floorY, leftX + c, floorY);
    ctx.lineTo(rightX - c, floorY);
    ctx.quadraticCurveTo(rightX, floorY, rightX, floorY - c);
    ctx.lineTo(rightX, topY);
  };

  MergeGame.prototype._dangerLine = function (ctx) {
    const amt = Math.min(1, this.dangerTime / this.graceTime);
    ctx.save();
    if (ctx.setLineDash) ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.time * 26;
    ctx.lineWidth = 2;
    const pulse = 0.24 + 0.6 * amt + 0.14 * Math.sin(this.time * 11);
    ctx.strokeStyle = 'rgba(255,72,96,' + Math.min(0.95, pulse) + ')';
    if (amt > 0.05) {
      ctx.shadowColor = '#ff3d64';
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(this.leftX, this.lineY);
    ctx.lineTo(this.rightX, this.lineY);
    ctx.stroke();
    ctx.restore();

    // 两端警示三角
    ctx.save();
    ctx.fillStyle = 'rgba(255,72,96,' + (0.35 + 0.5 * amt) + ')';
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? this.leftX + 7 : this.rightX - 7;
      ctx.beginPath();
      ctx.moveTo(x, this.lineY - 6);
      ctx.lineTo(x + 6, this.lineY + 5);
      ctx.lineTo(x - 6, this.lineY + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  MergeGame.prototype._guide = function (ctx) {
    if (this.gameOver || this.dropCooldown > 0) return;
    const x = this.aimX;

    // 激光瞄准线
    ctx.save();
    if (ctx.setLineDash) ctx.setLineDash([4, 12]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(125,232,255,0.35)';
    ctx.shadowColor = '#39c8ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, this.topY);
    ctx.lineTo(x, this.floorY);
    ctx.stroke();
    ctx.restore();

    // 全息准星
    ctx.save();
    ctx.strokeStyle = 'rgba(160,240,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, this.topY - 4, 8 + Math.sin(this.time * 6) * 1.2, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 14, this.topY - 4);
    ctx.lineTo(x - 6, this.topY - 4);
    ctx.moveTo(x + 6, this.topY - 4);
    ctx.lineTo(x + 14, this.topY - 4);
    ctx.stroke();
    ctx.restore();

    drawPlanet(ctx, x, this.dropY, this.currentLevel, PLANETS[this.currentLevel].r, 0.45, true, this.time);
  };

  MergeGame.prototype._drawPlanets = function (ctx) {
    const arr = this.planets;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const s = b.spawnT < 0.2 ? easeOutBack(b.spawnT / 0.2) : 1;
      // 待机脉动：能量球缓缓呼吸 + 微小浮动
      const pulse = 1 + Math.sin(this.time * 2.2 + b.phase) * 0.028;
      const bob = Math.sin(this.time * 1.4 + b.phase * 1.7) * b.r * 0.05;
      drawPlanet(
        ctx,
        b.x,
        b.y + bob,
        b.level,
        b.r * (0.55 + 0.45 * Math.min(1, s)) * pulse,
        1,
        false,
        this.time + b.phase
      );
    }
  };

  // 场内漂浮的等离子微粒，增加空间层次
  MergeGame.prototype._fieldMotes = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.y -= m.vy * 0.016;
      m.x += Math.sin(this.time * 0.9 + m.ph) * 0.22;
      if (m.y < this.topY) {
        m.y = this.floorY;
        m.x = this.leftX + Math.random() * (this.rightX - this.leftX);
      }
      ctx.globalAlpha = 0.18 + 0.3 * Math.abs(Math.sin(this.time * 1.6 + m.ph));
      ctx.fillStyle = m.c;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  MergeGame.prototype._drawParticles = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < this.rings.length; i++) {
      const rr = this.rings[i];
      ctx.globalAlpha = Math.max(0, rr.life / rr.max) * 0.85;
      ctx.strokeStyle = rr.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rr.x, rr.y, rr.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  MergeGame.prototype._drawTexts = function (ctx) {
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life / t.max));
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + (t.big ? 19 : 15) + 'px ' + MONO;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  MergeGame.prototype._hud = function (ctx) {
    const w = this.width;
    const pad = this.pad;

    // 左侧数据面板
    ctx.save();
    sciPanel(ctx, pad, 8, 112, 64);
    ctx.restore();

    ctx.fillStyle = 'rgba(125,232,255,0.75)';
    ctx.font = '11px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('CORE', pad + 12, 24);

    ctx.fillStyle = '#eafaff';
    ctx.shadowColor = '#39c8ff';
    ctx.shadowBlur = 14;
    ctx.font = 'bold ' + Math.round(Math.min(26, w * 0.075)) + 'px ' + MONO;
    ctx.fillText(String(this.score), pad + 12, 48);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(150,200,255,0.6)';
    ctx.font = '10px ' + MONO;
    ctx.fillText('BEST ' + this.best, pad + 12, 64);

    // 扇区指示
    const sw = 108;
    const sx = (w - sw) / 2;
    ctx.save();
    sciPanel(ctx, sx, 8, sw, 34, 8);
    ctx.restore();
    ctx.fillStyle = 'rgba(160,220,255,0.8)';
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('SECTOR', w / 2, 21);
    ctx.fillStyle = '#7de8ff';
    ctx.shadowColor = '#39c8ff';
    ctx.shadowBlur = 12;
    ctx.font = 'bold 15px ' + MONO;
    ctx.fillText(pad2(this.sector), w / 2, 36);
    ctx.shadowBlur = 0;

    // 返回按钮
    const bw = 62;
    const bh = 24;
    const bx = w - pad - bw;
    const by = 10;
    this._backRect = { x: bx, y: by, w: bw, h: bh };
    ctx.save();
    sciPanel(ctx, bx, by, bw, bh, 6);
    ctx.restore();
    ctx.fillStyle = 'rgba(190,225,255,0.9)';
    ctx.font = '12px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹ HOME', bx + bw / 2, by + bh / 2 + 1);

    // 下一个能量球
    const nx = w - pad - 16;
    const ny = by + bh + 26;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(150,200,255,0.6)';
    ctx.font = '10px ' + MONO;
    ctx.fillText('NEXT', nx - 18, ny + 4);
    ctx.save();
    ctx.strokeStyle = 'rgba(125,232,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash && ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(nx, ny, 14, 0, TAU);
    ctx.stroke();
    ctx.restore();
    drawPlanet(ctx, nx, ny, this.nextLevel, 9, 0.95, true, this.time);

    // 连击提示
    if (this.combo > 1) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(125,232,255,' + (0.6 + 0.4 * Math.sin(this.time * 9)) + ')';
      ctx.font = 'bold 12px ' + MONO;
      ctx.fillText('OVERDRIVE x' + this.combo, w / 2, 58);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  MergeGame.prototype._scanlines = function (ctx) {
    const h = this.height;
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#9fe8ff';
    for (let y = 0; y < h; y += 5) {
      ctx.fillRect(0, y, this.width, 1);
    }
    ctx.restore();
  };

  MergeGame.prototype._hint = function (ctx) {
    const a = Math.max(0, 1 - this.hintT / 3);
    ctx.globalAlpha = a * 0.8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7de8ff';
    ctx.font = '13px ' + MONO;
    ctx.fillText('DRAG TO AIM · RELEASE TO DROP', this.width / 2, (this.topY + this.floorY) / 2 + 60);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  MergeGame.prototype._over = function (ctx) {
    const w = this.width;
    const h = this.height;
    ctx.fillStyle = 'rgba(4,6,16,0.78)';
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(w * 0.86, 350);
    const ph = Math.min(h * 0.44, 330);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    ctx.save();
    sciFrame(ctx, px, py, pw, ph);
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, 'rgba(16,26,58,0.98)');
    g.addColorStop(1, 'rgba(8,12,30,0.98)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ff5f7a';
    ctx.shadowColor = '#ff2d55';
    ctx.shadowBlur = 16;
    ctx.font = 'bold 24px ' + MONO;
    ctx.fillText('SYSTEM FAILURE', w / 2, py + 52);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(160,200,255,0.7)';
    ctx.font = '12px ' + MONO;
    ctx.fillText('CONTAINMENT BREACH AT SECTOR ' + pad2(this.sector), w / 2, py + 78);

    ctx.fillStyle = 'rgba(140,190,240,0.7)';
    ctx.font = '11px ' + MONO;
    ctx.fillText('FINAL SCORE', w / 2, py + 108);

    ctx.fillStyle = '#7de8ff';
    ctx.shadowColor = '#39c8ff';
    ctx.shadowBlur = 16;
    ctx.font = 'bold 40px ' + MONO;
    ctx.fillText(String(this.score), w / 2, py + 150);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(160,200,255,0.8)';
    ctx.font = '12px ' + MONO;
    ctx.fillText('BEST ' + this.best, w / 2, py + 178);

    const bw = Math.min(pw * 0.72, 220);
    const bh = 46;
    const bx = w / 2 - bw / 2;
    const by = py + ph - bh - 16;
    this._restartRect = { x: bx, y: by, w: bw, h: bh };

    ctx.save();
    const bg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    bg.addColorStop(0, '#39c8ff');
    bg.addColorStop(1, '#7b6bff');
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(57,200,255,0.6)';
    ctx.shadowBlur = 18;
    sciPanel(ctx, bx, by, bw, bh, 10);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#04121f';
    ctx.font = 'bold 16px ' + MONO;
    ctx.textBaseline = 'middle';
    ctx.fillText('REBOOT', w / 2, by + bh / 2 + 1);

    const hy = by - 30;
    this._homeRect = { x: w / 2 - 80, y: hy, w: 160, h: 24 };
    ctx.fillStyle = 'rgba(170,205,255,0.75)';
    ctx.font = '12px ' + MONO;
    ctx.fillText('‹ BACK TO BASE', w / 2, hy + 16);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  /* ----------------------------- 绘制工具 ----------------------------- */
  // 切角面板
  function sciPanel(ctx, x, y, w, h, cut) {
    cut = cut || 10;
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
    ctx.fillStyle = 'rgba(20,36,70,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,232,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function sciFrame(ctx, x, y, w, h) {
    const cut = 22;
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
  }

  function drawRing(ctx, x, y, r, p, alpha, back) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    ctx.scale(1, 0.4);
    const rr = r * 1.6;
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = p.c1;
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath();
    if (back) ctx.arc(0, 0, rr, Math.PI, TAU);
    else ctx.arc(0, 0, rr, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanet(ctx, x, y, level, drawR, alpha, flat, time) {
    const p = PLANETS[level];
    const r = drawR;
    if (r <= 0.2) return;
    const t = time || 0;

    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;

    if (!flat) {
      ctx.shadowColor = p.glow || p.c2;
      ctx.shadowBlur = r * 0.85;
    }

    if (p.ring) drawRing(ctx, x, y, r, p, 0.5, true);

    const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, Math.max(0.5, r * 0.08), x, y, r * 1.02);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, p.c1);
    g.addColorStop(0.72, mixHex(p.c1, p.c2, 0.55));
    g.addColorStop(1, p.c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;

    // 表面纹理 / 能量纹路
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, TAU);
    ctx.clip();
    ctx.globalAlpha *= 0.18;
    ctx.strokeStyle = p.glow || '#ffffff';
    ctx.lineWidth = Math.max(1, r * 0.06);
    for (let i = 0; i < 3; i++) {
      const yy = y - r + ((i + 0.5) * r * 2) / 3 + Math.sin(t * 1.4 + i) * r * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, yy, r * 1.05, r * 0.22, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    if (p.ring) drawRing(ctx, x, y, r, p, 0.9, false);

    // 恒星脉动
    if (p.sun) {
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 1.5 * pulse);
      gg.addColorStop(0, 'rgba(255,226,120,0.55)');
      gg.addColorStop(1, 'rgba(255,176,32,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 * pulse, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 高光
    const hg = ctx.createRadialGradient(
      x - r * 0.36,
      y - r * 0.42,
      Math.max(0.5, r * 0.02),
      x - r * 0.36,
      y - r * 0.42,
      r * 0.55
    );
    hg.addColorStop(0, 'rgba(255,255,255,0.7)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    // 外环辉光
    ctx.strokeStyle = 'rgba(' + (p.glow ? hexToRgb(p.glow) : '140,220,255') + ',0.55)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  function hexToRgb(hex) {
    const c = parseHex(hex);
    return c[0] + ',' + c[1] + ',' + c[2];
  }

  return MergeGame;
});
