/*
 * 首页 / 游戏选择 —— 科幻控制台风格
 * 两张卡片分别进入《星际合成》与《咩咩消消乐》，右上角可切换静音。
 */
(function (factory) {
  const HomeScene = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = HomeScene;
  }
  const g =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof GameGlobal !== 'undefined'
        ? GameGlobal
        : typeof window !== 'undefined'
          ? window
          : this;
  if (g) g.HomeScene = HomeScene;
})(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Baloo 2","Nunito","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = '"Share Tech Mono","Consolas","Menlo","PingFang SC",monospace';

  const CARDS = [
    {
      key: 'merge',
      tag: 'SYNTHESIS',
      title: '星际合成',
      desc: '投放能量球 · 融合进化',
      accent: '#7de8ff',
      accent2: '#6a7bff',
      bestKey: 'nova.best',
      extraKey: 'nova.sector',
      extraLabel: '最高扇区',
      icon: 'orb',
    },
    {
      key: 'sheep',
      tag: 'WOOLLY TILES',
      title: '小动物消消乐',
      desc: '萌宠堆叠 · 三消解压',
      accent: '#ffb3c6',
      accent2: '#ffc24a',
      bestKey: 'animal.best',
      extraKey: 'animal.level',
      extraLabel: '最高关卡',
      icon: 'sheep',
    },
    {
      key: 'lumina',
      tag: 'STAR LOGIC',
      title: '星图点灯',
      desc: '点亮星图 · 烧脑解谜',
      accent: '#ffe08a',
      accent2: '#7de8ff',
      bestKey: 'lumina.best',
      extraKey: 'lumina.level',
      extraLabel: '最高关卡',
      icon: 'stars',
    },
    {
      key: 'dash',
      tag: 'STAR DASH',
      title: '星驰穿梭',
      desc: '狂飙走位 · 动作解谜',
      accent: '#7de8ff',
      accent2: '#b39bff',
      bestKey: 'dash.best',
      extraKey: 'dash.sector',
      extraLabel: '最高扇区',
      icon: 'dash',
    },
    {
      key: 'quest',
      tag: 'STAR SAGA',
      title: '星旅者',
      desc: '动作冒险 · 多线剧情',
      accent: '#ffd93d',
      accent2: '#ff8fa8',
      bestKey: 'quest.best',
      extraKey: 'quest.endings',
      extraLabel: '解锁结局',
      icon: 'sword',
    },
  ];

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

  function sciPanel(ctx, x, y, w, h, cut) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
  }

  function starPath(ctx, x, y, outer, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  function HomeScene(opts) {
    opts = opts || {};
    this.width = opts.width || 0;
    this.height = opts.height || 0;
    this.storage = opts.storage || null;
    this.audio = opts.audio || null;
    this.nav = null;
    this.time = 0;
    this.stars = [];
    this.floaters = [];
    this.press = -1;
    this.pressT = 0;
    this._layout();
    this._genStars();
    this._genFloaters();
  }

  HomeScene.prototype._genFloaters = function () {
    const n = 14;
    this.floaters = [];
    for (let i = 0; i < n; i++) {
      this.floaters.push({
        x: Math.random(),
        y: Math.random(),
        r: 6 + Math.random() * 16,
        vy: 0.01 + Math.random() * 0.03,
        ph: Math.random() * TAU,
        shape: Math.floor(Math.random() * 3), // 0 圆 1 三角 2 星
        color: ['rgba(125,232,255,', 'rgba(179,155,255,', 'rgba(255,158,201,'][Math.floor(Math.random() * 3)],
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 0.4,
      });
    }
  };

  HomeScene.prototype._read = function (key) {
    try {
      const v = parseInt(this.storage && this.storage.get(key), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  };

  HomeScene.prototype._layout = function () {
    const w = this.width;
    const h = this.height;
    this.pad = Math.max(16, w * 0.06);
    this.titleY = h * 0.185;
    this.subtitleY = this.titleY + Math.max(20, h * 0.03);

    const cardCount = CARDS.length;
    const cardW = Math.min(w - this.pad * 2, 360);
    const gap = Math.max(10, h * (cardCount >= 5 ? 0.018 : 0.028));
    // 卡片多时压缩每张高度，保证全部容纳在标题与页脚之间
    const maxBlockH = h * 0.93 - (this.subtitleY + 40);
    const minCardH = cardCount >= 5 ? 74 : 92;
    const cardH = Math.min(
      Math.max(h * (cardCount >= 5 ? 0.125 : 0.16), minCardH),
      152,
      (maxBlockH - gap * (cardCount - 1)) / cardCount
    );
    const blockH = cardH * cardCount + gap * (cardCount - 1);
    const top = this.subtitleY + (cardCount >= 5 ? 26 : 40);
    const bottom = h * 0.93;
    const cardsTop = top + Math.max(0, (bottom - top - blockH) / 2);

    this.cardRects = [];
    for (let i = 0; i < cardCount; i++) {
      this.cardRects.push({ x: (w - cardW) / 2, y: cardsTop + i * (cardH + gap), w: cardW, h: cardH });
    }
    this.mute = { x: w - this.pad - 38, y: this.pad * 0.7, w: 38, h: 38 };
  };

  HomeScene.prototype._genStars = function () {
    const count = Math.min(120, Math.floor((this.width * this.height) / 7000));
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: 0.4 + Math.random() * 1.5,
        ph: Math.random() * TAU,
        sp: 0.5 + Math.random() * 2.2,
      });
    }
  };

  HomeScene.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    this._layout();
    this._genStars();
    this._genFloaters();
  };

  HomeScene.prototype.onEnter = function () {};

  HomeScene.prototype.update = function (dt) {
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    if (this.pressT > 0) this.pressT -= dt;

    // 浮游装饰
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      f.y -= f.vy * dt;
      f.rot += f.spin * dt;
      if (f.y < -0.06) {
        f.y = 1.06;
        f.x = Math.random();
      }
    }
  };

  HomeScene.prototype._hit = function (r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };

  HomeScene.prototype.pointerDown = function (x, y) {
    if (this._hit(this.mute, x, y)) {
      if (this.audio) {
        this.audio.toggleMute();
        this.audio.sfx('tap');
      }
      return;
    }
    for (let i = 0; i < this.cardRects.length; i++) {
      if (this._hit(this.cardRects[i], x, y)) {
        if (this.audio) this.audio.sfx('tap');
        this.press = i;
        this.pressT = 0.18;
        const key = CARDS[i] && CARDS[i].key;
        if (this.nav && key) this.nav.goto(key);
        return;
      }
    }
  };

  HomeScene.prototype.pointerMove = function () {};
  HomeScene.prototype.pointerUp = function () {};

  HomeScene.prototype.render = function (ctx) {
    this._bg(ctx);
    this._floaters(ctx);
    this._title(ctx);
    for (let i = 0; i < CARDS.length; i++) {
      this._card(ctx, this.cardRects[i], CARDS[i], i);
    }
    this._mute(ctx);
    this._footer(ctx);
  };

  // 浮游几何装饰（圆 / 三角 / 星），缓慢上升 + 旋转，营造氛围
  HomeScene.prototype._floaters = function (ctx) {
    const w = this.width;
    const h = this.height;
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      const a = 0.06 + 0.06 * Math.abs(Math.sin(this.time * 0.8 + f.ph));
      ctx.save();
      ctx.translate(f.x * w, f.y * h);
      ctx.rotate(f.rot);
      ctx.fillStyle = f.color + a + ')';
      ctx.strokeStyle = f.color + a * 1.6 + ')';
      ctx.lineWidth = 1.2;
      if (f.shape === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, f.r, 0, TAU);
        ctx.fill();
      } else if (f.shape === 1) {
        ctx.beginPath();
        ctx.moveTo(0, -f.r);
        ctx.lineTo(f.r * 0.87, f.r * 0.5);
        ctx.lineTo(-f.r * 0.87, f.r * 0.5);
        ctx.closePath();
        ctx.stroke();
      } else {
        starPath(ctx, 0, 0, f.r, f.r * 0.42, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  HomeScene.prototype._bg = function (ctx) {
    const w = this.width;
    const h = this.height;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060b22');
    g.addColorStop(0.55, '#04071a');
    g.addColorStop(1, '#02040e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    this._nebula(ctx, w * 0.22, h * 0.18, w * 0.72, 60, 90, 255, 0.2);
    this._nebula(ctx, w * 0.88, h * 0.72, w * 0.7, 0, 190, 255, 0.15);
    this._nebula(ctx, w * 0.4, h * 0.96, w * 0.66, 190, 40, 160, 0.14);

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const a = 0.25 + 0.7 * Math.abs(Math.sin(this.time * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dbeaff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 底部透视网格
    const horizon = h * 0.8;
    ctx.save();
    ctx.strokeStyle = 'rgba(90,160,255,0.14)';
    ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * (w / 14), horizon);
      ctx.lineTo(w / 2 + i * (w / 3.2), h);
      ctx.stroke();
    }
    const scroll = (this.time * 0.3) % 1;
    for (let i = 0; i < 7; i++) {
      const t = (i + scroll) / 7;
      const y = horizon + Math.pow(t, 2.2) * (h - horizon);
      ctx.globalAlpha = 0.12 + t * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  HomeScene.prototype._nebula = function (ctx, x, y, r, cr, cg, cb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  HomeScene.prototype._title = function (ctx) {
    const w = this.width;
    const size = Math.round(Math.min(32, w * 0.095));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    const grad = ctx.createLinearGradient(w * 0.22, 0, w * 0.78, 0);
    grad.addColorStop(0, '#7de8ff');
    grad.addColorStop(0.5, '#b39bff');
    grad.addColorStop(1, '#ff9ec9');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(120,180,255,' + (0.3 + 0.25 * pulse) + ')';
    ctx.shadowBlur = 22;
    ctx.font = 'bold ' + size + 'px ' + FONT;
    ctx.fillText('迷你游戏厅', w / 2, this.titleY);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(160,200,255,0.6)';
    ctx.font = Math.round(Math.min(12, w * 0.036)) + 'px ' + MONO;
    ctx.fillText('MINI  ARCADE', w / 2, this.subtitleY);
  };

  HomeScene.prototype._card = function (ctx, r, data, index) {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2 + index * 1.4);

    // 按压反馈：该卡被按下时轻微缩小 + 加强辉光（0.18s 内回弹）
    let pressScale = 1;
    let pressBoost = 0;
    if (this.press === index && this.pressT > 0) {
      const k = this.pressT / 0.18;
      pressScale = 1 - 0.04 * k;
      pressBoost = 1;
    }
    ctx.save();
    if (pressScale !== 1) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      ctx.translate(cx, cy);
      ctx.scale(pressScale, pressScale);
      ctx.translate(-cx, -cy);
    }

    ctx.save();
    ctx.shadowColor = data.accent;
    ctx.shadowBlur = 18 + 12 * pulse + 24 * pressBoost;
    sciPanel(ctx, r.x, r.y, r.w, r.h, 18);
    const bg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    bg.addColorStop(0, 'rgba(16,28,60,0.95)');
    bg.addColorStop(1, 'rgba(8,12,30,0.95)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    // 渐变描边
    ctx.save();
    const eg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    eg.addColorStop(0, data.accent);
    eg.addColorStop(1, data.accent2);
    ctx.strokeStyle = eg;
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.lineWidth = 1.6;
    sciPanel(ctx, r.x, r.y, r.w, r.h, 18);
    ctx.stroke();
    ctx.restore();

    // 左侧色条
    ctx.save();
    ctx.fillStyle = data.accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(r.x + 1, r.y + r.h * 0.18, 3, r.h * 0.64);
    ctx.restore();

    const iconSize = r.h * 0.58;
    const iconX = r.x + 20 + iconSize / 2;
    const iconY = r.y + r.h / 2;
    this._icon(ctx, data.icon, iconX, iconY, iconSize, data);

    const textX = r.x + 20 + iconSize + 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = data.accent;
    ctx.font = 'bold ' + Math.round(Math.min(11, r.h * 0.1)) + 'px ' + MONO;
    ctx.fillText(data.tag, textX, r.y + r.h * 0.28);

    ctx.fillStyle = '#f2f8ff';
    ctx.font = 'bold ' + Math.round(Math.min(23, r.h * 0.2)) + 'px ' + FONT;
    ctx.fillText(data.title, textX, r.y + r.h * 0.5);

    ctx.fillStyle = 'rgba(175,205,245,0.72)';
    ctx.font = Math.round(Math.min(12, r.h * 0.105)) + 'px ' + FONT;
    ctx.fillText(data.desc, textX, r.y + r.h * 0.68);

    const best = this._read(data.bestKey);
    const extra = this._read(data.extraKey);
    ctx.fillStyle = 'rgba(175,205,245,0.85)';
    ctx.font = Math.round(Math.min(12, r.h * 0.105)) + 'px ' + MONO;
    ctx.fillText('最高分 ' + best + '  ·  ' + data.extraLabel + ' ' + extra, textX, r.y + r.h * 0.86);

    // 右侧启动提示
    ctx.textAlign = 'center';
    ctx.fillStyle = data.accent;
    ctx.globalAlpha = 0.65 + 0.35 * pulse;
    ctx.font = 'bold ' + Math.round(r.h * 0.14) + 'px ' + MONO;
    ctx.fillText('PLAY', r.x + r.w - 34, r.y + r.h * 0.5);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.restore();
  };

  HomeScene.prototype._icon = function (ctx, kind, cx, cy, size, data) {
    if (kind === 'sword') {
      // 星旅者：发光星剑 + 星核光球
      const t = this.time || 0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
      const g = size * 0.5;
      // 星核光球（左上）
      const orbX = cx - size * 0.24;
      const orbY = cy - size * 0.24;
      const orbR = size * 0.14;
      const og = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, orbR);
      og.addColorStop(0, '#fff7d6');
      og.addColorStop(0.5, data.accent);
      og.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(orbX, orbY, orbR * (1 + 0.15 * pulse), 0, TAU);
      ctx.fill();
      // 剑身（斜向）
      ctx.save();
      ctx.translate(cx + size * 0.04, cy + size * 0.04);
      ctx.rotate(-Math.PI / 4 + Math.sin(t * 1.5) * 0.05);
      // 光晕
      const bg = ctx.createLinearGradient(0, -g, 0, g);
      bg.addColorStop(0, 'rgba(125,232,255,0.9)');
      bg.addColorStop(0.5, 'rgba(200,240,255,0.95)');
      bg.addColorStop(1, 'rgba(120,180,255,0.5)');
      ctx.fillStyle = bg;
      ctx.shadowColor = '#7de8ff';
      ctx.shadowBlur = size * 0.3;
      // 剑刃
      ctx.beginPath();
      ctx.moveTo(0, -g);
      ctx.lineTo(g * 0.16, -g * 0.2);
      ctx.lineTo(g * 0.12, g * 0.42);
      ctx.lineTo(-g * 0.12, g * 0.42);
      ctx.lineTo(-g * 0.16, -g * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // 护手
      ctx.fillStyle = data.accent2;
      ctx.fillRect(-g * 0.36, g * 0.42, g * 0.72, g * 0.14);
      // 剑柄
      ctx.fillStyle = '#2a3550';
      ctx.fillRect(-g * 0.08, g * 0.56, g * 0.16, g * 0.42);
      ctx.restore();
      // 剑尖星芒
      starPath(ctx, cx + g * 0.7, cy - g * 0.7, size * 0.12 * (0.8 + 0.4 * pulse), size * 0.05, 0);
      ctx.fillStyle = '#eaf6ff';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (kind === 'dash') {
      // 星驰穿梭：飞船 + 三车道 + 速度线
      const t = this.time || 0;
      // 三车道竖线
      ctx.save();
      ctx.strokeStyle = 'rgba(125,232,255,0.4)';
      ctx.lineWidth = Math.max(1, size * 0.02);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * size * 0.22, cy - size * 0.42);
        ctx.lineTo(cx + i * size * 0.22, cy + size * 0.42);
        ctx.stroke();
      }
      // 速度线（向上滚动）
      for (let i = 0; i < 6; i++) {
        const ly = cy - size * 0.4 + ((t * 120 + i * 22) % (size * 0.8));
        ctx.globalAlpha = 0.25 + 0.35 * ((ly - (cy - size * 0.4)) / (size * 0.8));
        ctx.strokeStyle = '#bff0ff';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.beginPath();
        ctx.moveTo(cx + (i % 3 - 1) * size * 0.22, ly);
        ctx.lineTo(cx + (i % 3 - 1) * size * 0.22, ly + size * 0.12);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // 飞船（三角 + 尾焰）
      const bob = Math.sin(t * 3) * size * 0.02;
      const r = size * 0.16;
      const sx = cx;
      const sy = cy + size * 0.02 + bob;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, sy - r * 1.2);
      ctx.lineTo(sx - r, sy + r * 0.9);
      ctx.lineTo(sx, sy + r * 0.4);
      ctx.lineTo(sx + r, sy + r * 0.9);
      ctx.closePath();
      const g = ctx.createLinearGradient(sx, sy - r, sx, sy + r);
      g.addColorStop(0, '#eaf6ff');
      g.addColorStop(0.5, '#7de8ff');
      g.addColorStop(1, '#3b6bd8');
      ctx.fillStyle = g;
      ctx.shadowColor = '#39c8ff';
      ctx.shadowBlur = size * 0.3;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      // 尾焰
      const fl = r * (1 + 0.5 * Math.sin(t * 30));
      const fg = ctx.createLinearGradient(sx, sy + r * 0.5, sx, sy + r * 0.5 + fl);
      fg.addColorStop(0, 'rgba(180,240,255,0.9)');
      fg.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.35, sy + r * 0.6);
      ctx.lineTo(sx + r * 0.35, sy + r * 0.6);
      ctx.lineTo(sx, sy + r * 0.6 + fl);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'stars') {
      // 星图点灯：九宫格星灯 + 高亮十字
      const t = this.time || 0;
      const g = 3;
      const step = size * 0.3;
      const originX = cx - step;
      const originY = cy - step;
      const litCells = [0, 1, 2, 4, 6, 8]; // 固定的点灯图案
      for (let i = 0; i < g; i++) {
        for (let j = 0; j < g; j++) {
          const idx = i * g + j;
          const x = originX + j * step;
          const y = originY + i * step;
          const lit = litCells.indexOf(idx) >= 0;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + idx);
          if (lit) {
            const gg = ctx.createRadialGradient(x, y, 0, x, y, step * 0.5);
            gg.addColorStop(0, 'rgba(255,236,160,' + (0.85 * (0.6 + 0.4 * pulse)) + ')');
            gg.addColorStop(1, 'rgba(255,190,90,0)');
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(x, y, step * 0.5, 0, TAU);
            ctx.fill();
          }
          starPath(ctx, x, y, step * 0.24 * (lit ? 1 + pulse * 0.1 : 1), step * 0.1, 0);
          ctx.fillStyle = lit ? '#ffdf86' : 'rgba(120,150,205,0.55)';
          ctx.fill();
        }
      }
      // 高亮十字
      ctx.strokeStyle = 'rgba(125,232,255,' + (0.4 + 0.3 * Math.sin(t * 3)) + ')';
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.beginPath();
      ctx.moveTo(originX + step, originY - step * 0.55);
      ctx.lineTo(originX + step, originY + step * 2.55);
      ctx.moveTo(originX - step * 0.55, originY + step);
      ctx.lineTo(originX + step * 2.55, originY + step);
      ctx.stroke();
    } else if (kind === 'orb') {
      // 科幻：一大一小两颗能量球正在融合 + 轨道环 + 火花
      const r = size * 0.36;
      const t = this.time || 0;
      const mx = cx + Math.sin(t * 1.6) * size * 0.12;
      const my = cy - size * 0.12 + Math.cos(t * 1.6) * size * 0.06;

      // 轨道环（后半）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.42);
      ctx.scale(1, 0.34);
      ctx.strokeStyle = 'rgba(140,220,255,0.55)';
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, Math.PI, TAU);
      ctx.stroke();
      ctx.restore();

      // 主能量球
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.32, data.accent);
      g.addColorStop(0.72, '#3b63d8');
      g.addColorStop(1, '#14265e');
      ctx.save();
      ctx.shadowColor = data.accent;
      ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 融合中的小能量球
      const g2 = ctx.createRadialGradient(mx - r * 0.2, my - r * 0.2, 1, mx, my, r * 0.5);
      g2.addColorStop(0, '#ffffff');
      g2.addColorStop(1, data.accent2 || '#6a7bff');
      ctx.save();
      ctx.shadowColor = data.accent2 || '#6a7bff';
      ctx.shadowBlur = size * 0.4;
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 环前半
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.42);
      ctx.scale(1, 0.34);
      ctx.strokeStyle = 'rgba(200,240,255,0.9)';
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      // 融合火花
      for (let i = 0; i < 5; i++) {
        const a = t * 3 + (i * TAU) / 5;
        const dx = cx + Math.cos(a) * r * 1.15;
        const dy = cy + Math.sin(a) * r * 0.9;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6 + i);
        ctx.fillStyle = '#bff0ff';
        starPath(ctx, dx, dy, size * 0.05, size * 0.02, a);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // 萌宠：圆润小兔子牌 + 三消点缀
      const s = size * 0.86;
      const t = this.time || 0;
      const bob = Math.sin(t * 2.4) * size * 0.03;

      ctx.save();
      ctx.translate(cx, cy + bob);
      // 耳朵
      ctx.fillStyle = '#ffffff';
      ell(ctx, -s * 0.22, -s * 0.42, s * 0.1, s * 0.34, -0.16);
      ctx.fill();
      ell(ctx, s * 0.22, -s * 0.42, s * 0.1, s * 0.34, 0.16);
      ctx.fill();
      ctx.fillStyle = '#ffc2d6';
      ell(ctx, -s * 0.22, -s * 0.42, s * 0.045, s * 0.24, -0.16);
      ctx.fill();
      ell(ctx, s * 0.22, -s * 0.42, s * 0.045, s * 0.24, 0.16);
      ctx.fill();
      // 脸
      ctx.save();
      ctx.shadowColor = 'rgba(120,150,180,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, '#ffd4e2');
      g.addColorStop(1, '#ff8fb0');
      ctx.fillStyle = g;
      circle(ctx, 0, 0, s * 0.52);
      ctx.fill();
      ctx.restore();
      // 眼睛
      ctx.fillStyle = '#4a3b52';
      circle(ctx, -s * 0.16, -s * 0.02, s * 0.06);
      ctx.fill();
      circle(ctx, s * 0.16, -s * 0.02, s * 0.06);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      circle(ctx, -s * 0.14, -s * 0.06, s * 0.024);
      ctx.fill();
      circle(ctx, s * 0.18, -s * 0.06, s * 0.024);
      ctx.fill();
      // 腮红
      ctx.fillStyle = 'rgba(255,110,150,0.45)';
      ell(ctx, -s * 0.3, s * 0.12, s * 0.09, s * 0.06);
      ctx.fill();
      ell(ctx, s * 0.3, s * 0.12, s * 0.09, s * 0.06);
      ctx.fill();
      // 鼻 + 嘴
      ctx.fillStyle = '#ff7fa2';
      ell(ctx, 0, s * 0.08, s * 0.05, s * 0.038);
      ctx.fill();
      ctx.strokeStyle = '#4a3b52';
      ctx.lineWidth = Math.max(1.2, s * 0.028);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-s * 0.05, s * 0.13, s * 0.07, 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.05, s * 0.13, s * 0.07, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.restore();

      // 三消点缀：3 颗小方糖
      const dots = [[-s * 0.62, s * 0.34, '#ffcf5a'], [s * 0.62, s * 0.34, '#7ee0a8'], [0, s * 0.62, '#8fc4ff']];
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const scale = 0.85 + 0.15 * Math.sin(t * 3 + i * 1.3);
        roundRect(ctx, cx + d[0] - s * 0.08 * scale, cy + bob + d[1] - s * 0.08 * scale, s * 0.16 * scale, s * 0.16 * scale, s * 0.05);
        ctx.fillStyle = d[2];
        ctx.fill();
      }
    }
  };

  HomeScene.prototype._mute = function (ctx) {
    const r = this.mute;
    const muted = this.audio ? this.audio.isMuted() : false;
    ctx.save();
    sciPanel(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = 'rgba(20,36,70,0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,232,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = muted ? 'rgba(255,110,135,0.95)' : 'rgba(160,225,255,0.95)';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(-3, -3);
    ctx.lineTo(1, -7);
    ctx.lineTo(1, 7);
    ctx.lineTo(-3, 3);
    ctx.lineTo(-7, 3);
    ctx.closePath();
    ctx.fill();
    if (muted) {
      ctx.beginPath();
      ctx.moveTo(4, -4);
      ctx.lineTo(9, 4);
      ctx.moveTo(9, -4);
      ctx.lineTo(4, 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(1, 0, 6, -0.8, 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(1, 0, 10, -0.8, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  };

  HomeScene.prototype._footer = function (ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(150,190,240,0.5)';
    ctx.font = '11px ' + MONO;
    ctx.fillText('SELECT A GAME TO START', this.width / 2, this.height - 14);
    ctx.textAlign = 'left';
  };

  return HomeScene;
});
