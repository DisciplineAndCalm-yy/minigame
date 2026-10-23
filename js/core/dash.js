/*
 * 《星驰穿梭 · Star Dash》—— 休闲解压 + 烧脑走位的「动作 + 解谜」跑酷
 *
 * 玩法：
 *  - 三车道纵向穿梭，飞船在底部，星岩 / 星屑 / 星门从上方压下。
 *  - 撞到星岩损失一颗护盾；护盾归零则结束。
 *  - 收集星屑攒「跃迁能量」；能量满后可点「跃迁」短时无敌冲刺（清场加分）。
 *  - 每通过一道「星门」需要满足能量/护盾条件，逼迫玩家在「抢星屑」与「保命」
 *    之间权衡——这是解谜层：走位即规划，何时贪星、何时保守，需要提前判断。
 *
 * 烧脑 & 公平：
 *  - 障碍按「安全车道随机游走」生成（每次最多移动一格），因此必定存在一条
 *    纯靠走位即可通过的路径；难度来自速度提升与需要提前预判的双岩封锁。
 *  - 星屑沿安全路径与其临道生成，最优解 = 在安全路线上顺路多吃星屑。
 *
 * 手感 & 解压：柔和霓虹网格、视差星空、飞船拖尾粒子、星屑吸附、跃迁闪光。
 */
(function (factory) {
  const StarDash = factory();
  if (typeof module === 'object' && module.exports) module.exports = StarDash;
  const g =
    typeof globalThis !== 'undefined' ? globalThis
      : typeof GameGlobal !== 'undefined' ? GameGlobal
        : typeof window !== 'undefined' ? window : this;
  if (g) g.StarDash = StarDash;
})(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Baloo 2","Nunito","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = '"Share Tech Mono","Consolas","Menlo","PingFang SC",monospace';
  const LANES = 3;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
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
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  /* ---------------- 难度梯度（按扇区） ---------------- */
  function sectorConfig(sector) {
    const s = Math.max(1, sector);
    return {
      speed: Math.min(720, 280 + s * 28), // 世界下压速度 px/s
      rowGap: Math.max(170, 270 - s * 6), // 行间距
      rockChance: Math.min(0.8, 0.34 + s * 0.035), // 每行出现星岩的概率
      doubleChance: s < 3 ? 0 : Math.min(0.45, (s - 2) * 0.05), // 双岩封锁，3 区后才有
      starChance: 0.78,
      gateEvery: Math.max(2, 5 - Math.floor(s / 3)), // 每隔几行一道星门
    };
  }

  function StarDash(opts) {
    opts = opts || {};
    this.opts = opts;
    this.storage = opts.storage || null;
    this.nav = null;
    this.width = opts.width || 0;
    this.height = opts.height || 0;

    this.best = this._loadBest();
    this.bestSector = this._loadBestSector();

    this.time = 0;
    this._layout();
    this._genStars();
    this.reset();
  }

  StarDash.prototype._loadBest = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('dash.best'), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  };
  StarDash.prototype._loadBestSector = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('dash.sector'), 10);
      return isNaN(v) || v < 1 ? 1 : v;
    } catch (e) {
      return 1;
    }
  };
  StarDash.prototype._save = function () {
    try {
      if (this.storage) {
        this.storage.set('dash.best', String(this.best));
        this.storage.set('dash.sector', String(this.bestSector));
      }
    } catch (e) {
      /* ignore */
    }
  };

  StarDash.prototype._layout = function () {
    const w = this.width;
    const h = this.height;
    this.pad = Math.max(12, w * 0.045);
    this.hudH = Math.max(58, h * 0.09);
    this.barH = Math.max(70, h * 0.11);

    this.top = this.hudH + 6;
    this.bottom = h - this.barH;
    this.laneW = w / LANES;
    this.laneCenters = [];
    for (let i = 0; i < LANES; i++) this.laneCenters.push(this.laneW * (i + 0.5));

    this.shipY = this.bottom - Math.max(56, h * 0.09);
    this.shipR = Math.min(this.laneW * 0.26, 30);

    this.backR = { x: this.pad * 0.7, y: this.pad * 0.55, w: 40, h: 32 };
    const bw = Math.min(140, (w - this.pad * 2 - 12) / 2);
    const by = h - this.barH + (this.barH - 42) / 2 + 4;
    this.warpR = { x: w / 2 - bw - 6, y: by, w: bw, h: 42 };
    this.pauseR = { x: w / 2 + 6, y: by, w: bw, h: 42 };
    // 结算
    const pw = Math.min(150, w * 0.42);
    const cy = h * 0.62;
    this.pBtn = { x: w / 2 - pw - 8, y: cy, w: pw, h: 50 };
    this.pBtn2 = { x: w / 2 + 8, y: cy, w: pw, h: 50 };
  };

  StarDash.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    this._layout();
    this._genStars();
  };

  StarDash.prototype._genStars = function () {
    const n = Math.min(110, Math.floor((this.width * this.height) / 9000));
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: 0.4 + Math.random() * 1.6,
        sp: 0.4 + Math.random() * 2,
        ph: Math.random() * TAU,
        par: 0.2 + Math.random() * 0.8,
      });
    }
  };

  StarDash.prototype.reset = function () {
    this._layout();
    this.time = 0;
    this.score = 0;
    this.sector = 1;
    this.shields = 3;
    this.maxShields = 3;
    this.energy = 0; // 0..100
    this.warpT = 0; // 跃迁剩余时间
    this.state = 'play';
    this.overT = 0;
    this.shakeT = 0;
    this.flashT = 0;

    this.entities = []; // 星岩/星屑/星门
    this.particles = [];
    this.rings = [];
    this.texts = [];

    this.curLane = 1;
    this.targetLane = 1;
    this.shipX = this.laneCenters[1];
    this.shipVX = 0;

    this.safeLane = 1;
    this.spawnY = this.top - 20;
    this.nextRowY = this.top - 20;
    this.spawnAcc = 0;
    this.rowCount = 0;
    this.worldSpeed = 300;
    this.dist = 0;
    this.lastTime = 0;

    // 特殊波次
    this.special = null; // { type:'meteor'|'blackhole', left }
    this.holeLane = -1;
    this.rowsUntilSpecial = 7;
    this.banner = null; // { text, sub, color, t, max }
    this.bgTint = 0; // 黑洞时背景紫染强度 0..1

    this._applySector();
  };

  StarDash.prototype.onEnter = function () {
    this.reset();
  };

  StarDash.prototype._applySector = function () {
    const cfg = sectorConfig(this.sector);
    this.cfg = cfg;
    this.worldSpeed = cfg.speed;
    if (this.opts.audio && this.opts.audio.setIntensity) {
      this.opts.audio.setIntensity(clamp(0.2 + this.sector * 0.06, 0, 0.85));
    }
  };

  StarDash.prototype._startSpecial = function (type) {
    if (type === 'meteor') {
      this.special = { type: 'meteor', left: 3 };
      this._banner('陨石雨来袭', '流星密布 · 稳住走位', '#ff9a5a');
      this._sound('over');
    } else {
      this.special = { type: 'blackhole', left: 4 };
      // 黑洞占据一个车道，选一个（避开飞船当前道，避免秒杀）
      let lane = Math.floor(Math.random() * LANES);
      if (lane === this.targetLane) lane = (lane + 1) % LANES;
      this.holeLane = lane;
      this._banner('黑洞生成', '引力扭曲 · 远离奇点', '#b39bff');
      this._sound('over');
    }
  };

  StarDash.prototype._banner = function (text, sub, color) {
    this.banner = { text: text, sub: sub, color: color, t: 0, max: 2.2 };
  };

  /* ----------------------------- 关卡生成 ----------------------------- */
  // 以「安全车道随机游走」放置星岩，保证始终存在一条可达的安全路径
  StarDash.prototype._genRow = function () {
    const cfg = this.cfg;
    const baseY = this.nextRowY;
    this.rowCount += 1;

    // —— 特殊波次调度 ——
    if (!this.special) {
      this.rowsUntilSpecial -= 1;
      if (this.rowsUntilSpecial <= 0) {
        // 3 区之后才出现特殊波次，交替两种
        if (this.sector >= 3) {
          const type = Math.random() < 0.5 ? 'meteor' : 'blackhole';
          this._startSpecial(type);
        }
        this.rowsUntilSpecial = 6 + Math.floor(Math.random() * 4);
      }
    }

    // 黑洞波次：持续若干行，期间每行在该洞车道放黑洞（不可通过），
    // 其余车道按正常安全规则；同时提高背景紫染。
    if (this.special && this.special.type === 'blackhole') {
      const row = [];
      // 让安全道避开黑洞车道
      let next = this.safeLane + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 0 : 1);
      next = clamp(next, 0, LANES - 1);
      if (next === this.holeLane) next = clamp(next + 1, 0, LANES - 1);
      if (next === this.holeLane) next = clamp(next - 2, 0, LANES - 1);
      this.safeLane = next;
      // 黑洞占一格
      row.push({ kind: 'hole', lane: this.holeLane, y: baseY, r: this.laneW * 0.42, spin: 0 });
      // 星屑沿安全道
      if (Math.random() < cfg.starChance) {
        row.push({ kind: 'star', lane: next, y: baseY, r: this.laneW * 0.2, taken: false, phase: Math.random() * TAU });
      }
      for (let i = 0; i < row.length; i++) this.entities.push(row[i]);
      this.entities.push({ kind: 'mark', lane: next, y: baseY, gate: false });
      this.bgTint = 0.6;
      this.special.left -= 1;
      if (this.special.left <= 0) {
        this.special = null;
        this.holeLane = -1;
      }
      return;
    }

    // 陨石雨波次：连续若干行，制造密集下落的陨石（仍保证安全道可通过），
    // 视觉上以“meteor”标记出火焰拖尾。
    if (this.special && this.special.type === 'meteor') {
      const row = [];
      let next = this.safeLane + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 0 : 1);
      next = clamp(next, 0, LANES - 1);
      const prevSafe = this.safeLane;
      this.safeLane = next;
      const passable = {};
      passable[prevSafe] = true;
      passable[next] = true;
      for (let i = 0; i < LANES; i++) {
        if (passable[i]) continue;
        // 陨石雨几乎填满非安全道
        if (Math.random() < 0.92) {
          row.push({ kind: 'rock', lane: i, y: baseY, r: this.laneW * 0.3, spin: Math.random() * TAU, seed: Math.random(), meteor: true });
        }
      }
      if (Math.random() < cfg.starChance) {
        row.push({ kind: 'star', lane: next, y: baseY, r: this.laneW * 0.2, taken: false, phase: Math.random() * TAU });
      }
      for (let i = 0; i < row.length; i++) this.entities.push(row[i]);
      this.entities.push({ kind: 'mark', lane: next, y: baseY, gate: false });
      this.special.left -= 1;
      if (this.special.left <= 0) this.special = null;
      return;
    }

    const row = [];

    // 下一格安全车道（最多移动一格）
    let next = this.safeLane + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 0 : 1);
    next = clamp(next, 0, LANES - 1);
    const prevSafe = this.safeLane;
    this.safeLane = next;

    // 星门
    const isGate = this.rowCount % cfg.gateEvery === 0;
    if (isGate) {
      const need = 20 + Math.floor(this.sector / 2) * 10;
      row.push({ kind: 'gate', lane: next, y: baseY, need: need, hit: false });
    } else {
      // 在若干车道上放星岩，但「上一格安全道」与「本格安全道」必须通畅，
      // 确保从上一安全道能移动到本安全道。
      const passable = {};
      passable[prevSafe] = true;
      passable[next] = true;
      for (let i = 0; i < LANES; i++) {
        if (passable[i]) continue;
        if (Math.random() < cfg.rockChance) {
          row.push({ kind: 'rock', lane: i, y: baseY, r: this.laneW * 0.34, spin: Math.random() * TAU, seed: Math.random() });
        }
      }
      // 双岩封锁：额外在非安全道再硬塞一颗（仅当存在两颗不同非安全道时）
      if (Math.random() < cfg.doubleChance) {
        for (let i = 0; i < LANES; i++) {
          if (passable[i]) continue;
          const has = row.some(function (e) {
            return e.kind === 'rock' && e.lane === i;
          });
          if (!has) {
            row.push({ kind: 'rock', lane: i, y: baseY, r: this.laneW * 0.34, spin: Math.random() * TAU, seed: Math.random() });
            break;
          }
        }
      }
      // 星屑：安全道上高概率，临道偶尔有（奖励走位）
      if (Math.random() < cfg.starChance) {
        row.push({ kind: 'star', lane: next, y: baseY, r: this.laneW * 0.2, taken: false, phase: Math.random() * TAU });
      }
      if (Math.random() < 0.35) {
        let alt = Math.floor(Math.random() * LANES);
        if (alt !== next && !row.some((e) => e.kind === 'rock' && e.lane === alt)) {
          row.push({ kind: 'star', lane: alt, y: baseY, r: this.laneW * 0.2, taken: false, phase: Math.random() * TAU });
        }
      }
    }

    for (let i = 0; i < row.length; i++) this.entities.push(row[i]);

    // 隐形「安全车道标记」：不参与渲染/碰撞，仅供内部判定与调试参考
    this.entities.push({ kind: 'mark', lane: next, y: baseY, gate: isGate });

    // 扇区推进
    const seg = 6;
    if (this.rowCount % seg === 0) {
      this.sector += 1;
      if (this.sector > this.bestSector) this.bestSector = this.sector;
      this._applySector();
      this._sound('levelup');
    }
  };

  /* ----------------------------- 输入 ----------------------------- */
  StarDash.prototype._hit = function (r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };

  StarDash.prototype._laneFromX = function (x) {
    return clamp(Math.floor(x / this.laneW), 0, LANES - 1);
  };

  StarDash.prototype.pointerDown = function (x, y) {
    if (this._hit(this.backR, x, y)) {
      if (this.nav) this.nav.back();
      return;
    }
    if (this.state === 'over') {
      if (this._hit(this.pBtn, x, y)) this.reset();
      else if (this._hit(this.pBtn2, x, y) && this.nav) this.nav.back();
      return;
    }
    if (this._hit(this.warpR, x, y)) {
      this._tryWarp();
      return;
    }
    // 点按 → 切换到对应车道
    const lane = this._laneFromX(x);
    if (lane !== this.targetLane) {
      this.targetLane = lane;
      this._sound('tap');
    }
  };

  StarDash.prototype.pointerMove = function (x, y) {
    if (this.state !== 'play') return;
    if (y > this.top && y < this.bottom) {
      const lane = this._laneFromX(x);
      if (lane !== this.targetLane) this.targetLane = lane;
    }
  };

  StarDash.prototype.pointerUp = function () {};

  StarDash.prototype._tryWarp = function () {
    if (this.state !== 'play') return;
    if (this.energy < 100) {
      this._sound('over');
      this._float('能量不足', '#ff8f9c', this.width / 2, this.bottom - 90);
      return;
    }
    this.energy = 0;
    this.warpT = 1.5;
    this.flashT = 0.35;
    this._sound('sun');
  };

  /* ----------------------------- 更新 ----------------------------- */
  StarDash.prototype.update = function (dt) {
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;

    // 背景星滚动（视差）
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.y += this.worldSpeed * s.par * dt;
      if (s.y > this.height) {
        s.y = -4;
        s.x = Math.random() * this.width;
      }
    }

    if (this.state === 'over') {
      this.overT += dt;
      this._updateParticles(dt);
      return;
    }

    if (this.warpT > 0) this.warpT -= dt;

    // 黑洞引力：若存在活跃黑洞，飞船被向洞车道拉扯（需靠换道对抗）
    let holePull = 0;
    if (this.holeLane >= 0 && this.special && this.special.type === 'blackhole') {
      const holeX = this.laneCenters[this.holeLane];
      const d = holeX - this.shipX;
      holePull = clamp(d * 0.9, -90, 90); // 每秒像素级拉扯
    }

    // 飞船横向缓动到目标车道（叠加黑洞拉扯）
    const tx = this.laneCenters[this.targetLane];
    const k = Math.min(1, dt * 14);
    this.shipX = lerp(this.shipX, tx, k) + holePull * dt;
    this.shipX = clamp(this.shipX, this.laneW * 0.15, this.width - this.laneW * 0.15);
    // 用当前所在车道（含拉扯）作为碰撞车道
    this.curLane = this.targetLane;

    this.bgTint += ((this.special && this.special.type === 'blackhole' ? 0.6 : 0) - this.bgTint) * Math.min(1, dt * 3);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.max) this.banner = null;
    }

    const spd = this.warpT > 0 ? this.worldSpeed * 1.9 : this.worldSpeed;
    this.dist += spd * dt;

    // 生成新行：按 scroll 距离累加，每滚动一个行间距在顶部生成一队
    this.spawnAcc += spd * dt;
    while (this.spawnAcc >= this.cfg.rowGap) {
      this.spawnAcc -= this.cfg.rowGap;
      this.nextRowY = this.top - 20;
      this._genRow();
    }

    // 飞船拖尾
    if (Math.random() < dt * 40) {
      this.particles.push({
        x: this.shipX + rand(-4, 4),
        y: this.shipY + this.shipR * 0.6,
        vx: rand(-20, 20),
        vy: rand(60, 140),
        g: 0,
        r: rand(1.5, 3.5),
        life: 0.4,
        max: 0.4,
        color: this.warpT > 0 ? '#bff0ff' : '#7de8ff',
        rot: 0,
        spin: 0,
      });
    }

    // 实体移动 + 碰撞
    const shipR = this.shipR;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.y += spd * dt;
      if (e.y > this.bottom + 60) {
        this.entities.splice(i, 1);
        continue;
      }

      if (e.kind === 'rock') {
        e.spin += dt * 1.4;
        const dx = Math.abs(this.laneCenters[e.lane] - this.shipX);
        const collideY = Math.abs(e.y - this.shipY) < e.r + shipR * 0.8;
        if (collideY && dx < e.r + shipR * 0.6) {
          if (this.warpT > 0) {
            // 跃迁中撞碎星岩
            this._boom(this.laneCenters[e.lane], e.y, '#ffd93d');
            this.score += 30;
            this._float('+30', '#ffd93d', this.laneCenters[e.lane], e.y);
            this.entities.splice(i, 1);
            this._sound('pop');
            continue;
          }
          // 撞到护盾/结束
          this.entities.splice(i, 1);
          this._hitRock();
          continue;
        }
      } else if (e.kind === 'hole') {
        e.spin += dt * 2.2;
        const dx = Math.abs(this.laneCenters[e.lane] - this.shipX);
        const collideY = Math.abs(e.y - this.shipY) < e.r * 0.9 + shipR * 0.6;
        // 黑洞吸入的星尘粒子（视觉）
        if (Math.random() < dt * 30) {
          const a = Math.random() * TAU;
          const rr = e.r * (1.2 + Math.random() * 0.8);
          this.particles.push({
            x: this.laneCenters[e.lane] + Math.cos(a) * rr,
            y: e.y + Math.sin(a) * rr,
            vx: -Math.cos(a) * rr * 2.4,
            vy: -Math.sin(a) * rr * 2.4 - spd * 0.2,
            g: 0,
            r: 1 + Math.random() * 1.8,
            life: 0.5,
            max: 0.5,
            color: '#b39bff',
            rot: 0,
            spin: 0,
          });
        }
        if (collideY && dx < e.r + shipR * 0.5) {
          if (this.warpT > 0) {
            // 跃迁可穿过黑洞并额外加分
            this._boom(this.laneCenters[e.lane], e.y, '#b39bff');
            this.score += 50;
            this._float('+50', '#b39bff', this.laneCenters[e.lane], e.y);
            this.entities.splice(i, 1);
            this._sound('pop');
            continue;
          }
          this.entities.splice(i, 1);
          this._hitRock();
          continue;
        }
      } else if (e.kind === 'star') {
        if (e.taken) continue;
        const dx = Math.abs(this.laneCenters[e.lane] - this.shipX);
        if (Math.abs(e.y - this.shipY) < e.r + shipR && dx < e.r + shipR) {
          e.taken = true;
          this.score += 12;
          this.energy = Math.min(100, this.energy + 9);
          this._sparkle(this.laneCenters[e.lane], e.y);
          this._sound('sparkle');
          this.entities.splice(i, 1);
        }
      } else if (e.kind === 'gate') {
        if (e.hit) continue;
        if (e.y > this.shipY - 6) {
          e.hit = true;
          // 通过星门：需要能量达标，否则扣护盾
          if (this.energy >= e.need) {
            this.score += 60;
            this._float('星门 +60', '#8ef0a0', this.width / 2, this.shipY - 40);
            this._sound('win');
          } else {
            this._float('能量不足！', '#ff8f9c', this.width / 2, this.shipY - 40);
            this._hitRock();
          }
          this.entities.splice(i, 1);
        }
      }
    }

    this._updateParticles(dt);
    this._updateRings(dt);
    this._updateTexts(dt);
  };

  StarDash.prototype._hitRock = function () {
    if (this.warpT > 0) return;
    this.shields -= 1;
    this.shakeT = 0.45;
    this._boom(this.shipX, this.shipY, '#ff7a8a');
    this._sound('over');
    if (this.shields <= 0) {
      this.shields = 0;
      this._gameOver();
    }
  };

  StarDash.prototype._gameOver = function () {
    if (this.state === 'over') return;
    this.state = 'over';
    this.overT = 0;
    if (this.score > this.best) this.best = this.score;
    if (this.sector > this.bestSector) this.bestSector = this.sector;
    this._save();
    this._sound('over');
  };

  StarDash.prototype._updateParticles = function (dt) {
    const CAP = 260;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0 || this.particles.length > CAP * 1.5) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  };
  StarDash.prototype._updateRings = function (dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r += dt * r.grow;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  };
  StarDash.prototype._updateTexts = function (dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= dt * 40;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  };

  /* ----------------------------- 反馈 ----------------------------- */
  StarDash.prototype._sound = function (name, level) {
    if (this.opts.sound) {
      try {
        this.opts.sound(name, level);
      } catch (e) {
        /* ignore */
      }
    }
  };
  StarDash.prototype._float = function (text, color, x, y) {
    this.texts.push({ text: text, color: color, x: x, y: y, life: 0.9, max: 0.9 });
  };
  StarDash.prototype._boom = function (x, y, color) {
    this.rings.push({ x: x, y: y, r: 6, grow: 220, life: 0.4, max: 0.4, color: color });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const spd = 60 + Math.random() * 200;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        g: 200,
        r: 2 + Math.random() * 3,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        color: color,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 9,
      });
    }
  };
  StarDash.prototype._sparkle = function (x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU;
      const spd = 30 + Math.random() * 90;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        g: 80,
        r: 1 + Math.random() * 2,
        life: 0.35 + Math.random() * 0.3,
        max: 0.65,
        color: '#ffe9a8',
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  };

  /* ----------------------------- 渲染 ----------------------------- */
  StarDash.prototype.render = function (ctx) {
    this._bg(ctx);

    ctx.save();
    if (this.shakeT > 0) {
      const s = this.shakeT * 14;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    this._lanes(ctx);
    this._entities(ctx);
    this._particles(ctx);
    this._rings(ctx);
    if (this.state === 'play') this._ship(ctx);
    this._texts(ctx);
    ctx.restore();

    this._hud(ctx);
    this._bar(ctx);
    this._banner(ctx);
    if (this.flashT > 0) {
      ctx.fillStyle = 'rgba(180,240,255,' + this.flashT * 0.8 + ')';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.state === 'over') this._over(ctx);
  };

  StarDash.prototype._bg = function (ctx) {
    const w = this.width;
    const h = this.height;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050a1e');
    g.addColorStop(0.5, '#070d24');
    g.addColorStop(1, '#0a0f2c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const neb = (x, y, r, cr, cg, cb, a) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')');
      gr.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(w * 0.2, h * 0.22, w * 0.72, 40, 90, 200, 0.2);
    neb(w * 0.9, h * 0.6, w * 0.66, 150, 40, 160, 0.14);

    // 远景行星（缓慢漂移），增强纵深感
    const px = w * 0.78 + Math.sin(this.time * 0.08) * 8;
    const py = h * 0.16;
    const pr = Math.min(w, h) * 0.16;
    const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.2, px, py, pr);
    pg.addColorStop(0, 'rgba(120,150,255,0.35)');
    pg.addColorStop(0.7, 'rgba(60,70,150,0.22)');
    pg.addColorStop(1, 'rgba(30,30,80,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
    // 行星环
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.4);
    ctx.scale(1, 0.3);
    ctx.strokeStyle = 'rgba(150,180,255,0.18)';
    ctx.lineWidth = pr * 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, pr * 1.4, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 黑洞紫染
    if (this.bgTint > 0.01) {
      neb(w * 0.5, h * 0.5, Math.max(w, h), 150, 60, 220, 0.16 * this.bgTint);
    }

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const a = 0.25 + 0.65 * Math.abs(Math.sin(this.time * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
      // 大星带十字星芒
      if (s.r > 1.2) {
        ctx.strokeStyle = 'rgba(200,225,255,' + (a * 0.7) + ')';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(s.x - s.r * 3, s.y);
        ctx.lineTo(s.x + s.r * 3, s.y);
        ctx.moveTo(s.x, s.y - s.r * 3);
        ctx.lineTo(s.x, s.y + s.r * 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  // 三车道透视 + 滚动网格
  StarDash.prototype._lanes = function (ctx) {
    const w = this.width;
    ctx.save();
    // 车道分隔线
    ctx.strokeStyle = 'rgba(125,232,255,0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(this.laneW * i, this.top);
      ctx.lineTo(this.laneW * i, this.bottom);
      ctx.stroke();
    }
    // 滚动横线
    const gap = 60;
    const off = (this.dist * 1) % gap;
    ctx.strokeStyle = 'rgba(125,232,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = this.top + off; y < this.bottom; y += gap) {
      ctx.globalAlpha = clamp((y - this.top) / (this.bottom - this.top), 0.05, 0.4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  StarDash.prototype._entities = function (ctx) {
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      const cx = this.laneCenters[e.lane];
      if (e.kind === 'rock') {
        if (e.meteor) this._drawMeteor(ctx, cx, e.y, e.r, e.spin, e.seed);
        else this._drawRock(ctx, cx, e.y, e.r, e.spin, e.seed);
      } else if (e.kind === 'star') {
        this._drawStar(ctx, cx, e.y, e.r, e.phase);
      } else if (e.kind === 'gate') {
        this._drawGate(ctx, cx, e.y, e.need);
      } else if (e.kind === 'hole') {
        this._drawHole(ctx, cx, e.y, e.r, e.spin);
      }
    }
  };

  // 陨石：拖尾火焰 + 炽热岩体
  StarDash.prototype._drawMeteor = function (ctx, x, y, r, spin, seed) {
    // 火焰拖尾（向上）
    const tl = r * 3.4;
    const tg = ctx.createLinearGradient(x, y - tl, x, y + r);
    tg.addColorStop(0, 'rgba(255,120,40,0)');
    tg.addColorStop(0.5, 'rgba(255,150,60,0.5)');
    tg.addColorStop(1, 'rgba(255,200,90,0.95)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y);
    ctx.quadraticCurveTo(x, y - tl, x + r * 0.7, y);
    ctx.closePath();
    ctx.fill();
    // 炽热核心
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    gg.addColorStop(0, 'rgba(255,240,180,0.95)');
    gg.addColorStop(0.4, 'rgba(255,150,60,0.8)');
    gg.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, TAU);
    ctx.fill();
    // 岩体
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const rr = r * (0.72 + 0.28 * Math.sin(i * 2.1 + seed * 9));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g2 = ctx.createLinearGradient(-r, -r, r, r);
    g2.addColorStop(0, '#ffe6a0');
    g2.addColorStop(0.5, '#ff8a3a');
    g2.addColorStop(1, '#a03010');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.restore();
  };

  // 黑洞：旋转吸积盘 + 事件视界
  StarDash.prototype._drawHole = function (ctx, x, y, r, spin) {
    // 吸积盘光晕
    const gg = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
    gg.addColorStop(0, 'rgba(20,6,40,0.95)');
    gg.addColorStop(0.45, 'rgba(120,60,220,0.5)');
    gg.addColorStop(0.75, 'rgba(180,120,255,0.28)');
    gg.addColorStop(1, 'rgba(120,60,220,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TAU);
    ctx.fill();
    // 旋转吸积臂
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(200,150,255,0.8)';
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const base = (k / 3) * TAU;
      for (let t = 0; t <= 1; t += 0.1) {
        const rr = r * (1.5 - t * 1.1);
        const a = base + t * 3.2;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    // 事件视界（纯黑）
    ctx.fillStyle = '#05000f';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,130,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, TAU);
    ctx.stroke();
  };

  StarDash.prototype._drawRock = function (ctx, x, y, r, spin, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    // 发光
    const gg = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
    gg.addColorStop(0, 'rgba(255,120,140,0.4)');
    gg.addColorStop(1, 'rgba(255,120,140,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, TAU);
    ctx.fill();
    // 多边形岩体
    ctx.beginPath();
    const sides = 7;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const rr = r * (0.78 + 0.22 * Math.sin(i * 2.3 + seed * 10));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g2 = ctx.createLinearGradient(-r, -r, r, r);
    g2.addColorStop(0, '#7a4a58');
    g2.addColorStop(0.5, '#5a3340');
    g2.addColorStop(1, '#3a2030');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,160,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(255,190,200,0.5)';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.18, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  StarDash.prototype._drawStar = function (ctx, x, y, r, phase) {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + phase);
    ctx.save();
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    gg.addColorStop(0, 'rgba(255,236,160,' + (0.5 + 0.3 * pulse) + ')');
    gg.addColorStop(1, 'rgba(255,210,90,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, TAU);
    ctx.fill();
    // 五角星
    const spikes = 5;
    const inner = r * 0.46;
    ctx.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
      const rad = k % 2 === 0 ? r * (1 + pulse * 0.12) : inner;
      const a = (Math.PI / spikes) * k - Math.PI / 2 + this.time * 1.2;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const lg = ctx.createLinearGradient(x, y - r, x, y + r);
    lg.addColorStop(0, '#fff7d6');
    lg.addColorStop(1, '#ffbe4a');
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.restore();
  };

  StarDash.prototype._drawGate = function (ctx, x, y, need) {
    const w = this.width;
    // 横跨全屏的能量门，安全车道处留缺口
    ctx.save();
    const gap = this.laneW;
    const gx0 = x - gap * 0.5;
    const gx1 = x + gap * 0.5;
    const ok = this.energy >= need;
    const col = ok ? 'rgba(120,240,170,' : 'rgba(255,150,120,';
    // 上/下光束
    for (let seg = 0; seg < 2; seg++) {
      const sx = seg === 0 ? 0 : gx1;
      const sw = seg === 0 ? gx0 : w - gx1;
      const g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
      g.addColorStop(0, col + '0.05)');
      g.addColorStop(0.5, col + '0.5)');
      g.addColorStop(1, col + '0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(sx, y - 8, sw, 16);
    }
    // 脉冲缺口框
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    ctx.strokeStyle = col + (0.6 + 0.3 * pulse) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(gx0, y - 10, gap, 20);
    // 需求文字
    ctx.fillStyle = ok ? '#8ef0a0' : '#ff9fae';
    ctx.font = 'bold 11px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡' + need, x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  };

  StarDash.prototype._ship = function (ctx) {
    const x = this.shipX;
    const y = this.shipY;
    const r = this.shipR;
    ctx.save();
    // 护盾光环
    if (this.shields > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.strokeStyle = this.warpT > 0 ? 'rgba(140,240,255,0.9)' : 'rgba(125,232,255,' + (0.3 + 0.3 * pulse) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, TAU);
      ctx.stroke();
    }
    // 飞船三角
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x - r * 0.8, y + r * 0.75);
    ctx.lineTo(x, y + r * 0.35);
    ctx.lineTo(x + r * 0.8, y + r * 0.75);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#eaf6ff');
    g.addColorStop(0.5, '#7de8ff');
    g.addColorStop(1, '#3b6bd8');
    ctx.fillStyle = g;
    ctx.save();
    ctx.shadowColor = '#39c8ff';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
    // 驾驶舱
    ctx.fillStyle = '#0a1a3a';
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.24, r * 0.36, 0, 0, TAU);
    ctx.fill();
    // 尾焰
    const flame = r * (0.9 + 0.4 * Math.sin(this.time * 30));
    const fg = ctx.createLinearGradient(x, y + r * 0.4, x, y + r * 0.4 + flame);
    fg.addColorStop(0, 'rgba(180,240,255,0.9)');
    fg.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.32, y + r * 0.5);
    ctx.lineTo(x + r * 0.32, y + r * 0.5);
    ctx.lineTo(x, y + r * 0.5 + flame);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  StarDash.prototype._particles = function (ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  StarDash.prototype._rings = function (ctx) {
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const a = clamp(r.life / r.max, 0, 1);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  StarDash.prototype._texts = function (ctx) {
    ctx.textAlign = 'center';
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      const a = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  StarDash.prototype._banner = function (ctx) {
    if (!this.banner) return;
    const b = this.banner;
    const k = b.t / b.max; // 0..1
    // 淡入淡出 + 轻微上浮
    let a = 1;
    if (k < 0.15) a = k / 0.15;
    else if (k > 0.8) a = (1 - k) / 0.2;
    a = clamp(a, 0, 1);
    const w = this.width;
    const y = this.hudH + 40 - k * 10;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    // 发光条
    const tw = Math.min(w * 0.8, 300);
    const g = ctx.createLinearGradient(w / 2 - tw / 2, 0, w / 2 + tw / 2, 0);
    g.addColorStop(0, 'rgba(10,16,38,0)');
    g.addColorStop(0.5, 'rgba(10,16,38,0.72)');
    g.addColorStop(1, 'rgba(10,16,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w / 2 - tw / 2, y - 22, tw, 46);
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(b.text, w / 2, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(210,225,255,0.85)';
    ctx.font = '12px ' + MONO;
    ctx.fillText(b.sub, w / 2, y + 18);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  StarDash.prototype._hud = function (ctx) {
    const w = this.width;

    // 返回
    ctx.save();
    roundRect(ctx, this.backR.x, this.backR.y, this.backR.w, this.backR.h, 9);
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

    // 分数（左）
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(150,200,255,0.6)';
    ctx.font = '10px ' + MONO;
    ctx.fillText('SCORE', this.pad, this.backR.y + 12);
    ctx.fillStyle = '#eaf3ff';
    ctx.font = 'bold ' + Math.round(Math.min(22, w * 0.058)) + 'px ' + MONO;
    ctx.fillText(String(this.score), this.pad, this.backR.y + 38);

    // 扇区（右）
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(150,200,255,0.6)';
    ctx.font = '10px ' + MONO;
    ctx.fillText('SECTOR', w - this.pad, this.backR.y + 12);
    ctx.fillStyle = '#7de8ff';
    ctx.font = 'bold ' + Math.round(Math.min(22, w * 0.058)) + 'px ' + MONO;
    ctx.fillText((this.sector < 10 ? '0' : '') + this.sector, w - this.pad, this.backR.y + 38);

    // 护盾（中上）
    ctx.textAlign = 'center';
    const sy = this.backR.y + 14;
    for (let i = 0; i < this.maxShields; i++) {
      const px = w / 2 + (i - (this.maxShields - 1) / 2) * 22;
      const on = i < this.shields;
      ctx.beginPath();
      ctx.arc(px, sy, 6, 0, TAU);
      if (on) {
        ctx.fillStyle = '#7de8ff';
        ctx.save();
        ctx.shadowColor = '#39c8ff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(80,110,150,0.4)';
        ctx.fill();
      }
    }
    ctx.textAlign = 'left';
  };

  StarDash.prototype._bar = function (ctx) {
    const w = this.width;
    const bar = this.barH;
    const y0 = this.height - bar;

    // 能量条
    const ex = this.pad;
    const ew = w - this.pad * 2;
    const ehh = 12;
    const ey = y0 + 12;
    roundRect(ctx, ex, ey, ew, ehh, 6);
    ctx.fillStyle = 'rgba(40,60,100,0.6)';
    ctx.fill();
    const fill = (ew) * (this.energy / 100);
    if (fill > 2) {
      roundRect(ctx, ex, ey, fill, ehh, 6);
      const eg = ctx.createLinearGradient(ex, 0, ex + ew, 0);
      eg.addColorStop(0, '#7de8ff');
      eg.addColorStop(1, '#b39bff');
      ctx.fillStyle = eg;
      if (this.energy >= 100) {
        ctx.save();
        ctx.shadowColor = '#7de8ff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(200,225,255,0.85)';
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('跃迁能量 ' + Math.floor(this.energy) + '%', ex + 4, ey + ehh / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    // 跃迁按钮
    const ready = this.energy >= 100;
    this._drawBtn(ctx, this.warpR, '⚡ 跃迁', ready ? '#7de8ff' : 'rgba(90,110,150,0.5)', ready);
  };

  StarDash.prototype._drawBtn = function (ctx, r, label, accent, enabled) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, enabled ? 'rgba(50,70,120,0.95)' : 'rgba(40,50,80,0.7)');
    g.addColorStop(1, enabled ? 'rgba(30,44,86,0.95)' : 'rgba(30,36,60,0.7)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = enabled ? '#eaf3ff' : 'rgba(150,170,200,0.6)';
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.restore();
  };

  StarDash.prototype._over = function (ctx) {
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,20,0.7)';
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
    ctx.strokeStyle = 'rgba(255,120,140,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9fae';
    ctx.font = 'bold ' + Math.round(Math.min(30, pw * 0.1)) + 'px ' + FONT;
    ctx.fillText('护盾耗尽', w / 2, py + 60);

    ctx.fillStyle = 'rgba(200,220,255,0.85)';
    ctx.font = Math.round(Math.min(15, pw * 0.05)) + 'px ' + FONT;
    ctx.fillText('本次得分 ' + this.score, w / 2, py + 102);
    ctx.fillStyle = 'rgba(180,210,255,0.6)';
    ctx.fillText('到达扇区 ' + this.sector + '  ·  最高分 ' + this.best, w / 2, py + 130);

    this.pBtn.y = py + ph - 70;
    this.pBtn2.y = py + ph - 70;
    this._drawBtn(ctx, this.pBtn, '再来一次', '#7de8ff', true);
    this._drawBtn(ctx, this.pBtn2, '回首页', '#b39bff', true);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  return StarDash;
});
