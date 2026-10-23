/*
 * 《星旅者 · Star Wanderer》—— 角色扮演 · 动作战斗 · 多结局
 *
 * 故事：星海的核心「星核」破碎，平衡崩坏。你是最后的「星守」，
 * 带着微弱的核心碎片穿越三段旅程，最终面对吞噬一切的「核心吞噬者」。
 * 沿途的抉择（仁慈 / 力量）会改变你的「光暗」倾向，并决定结局。
 *
 * 玩法：
 *  - 剧情：打字机对白 + 立绘 + 选项抉择推进章节。
 *  - 战斗：实时点按攻击（斩击）积攒能量，满能量放「星爆」清场；
 *    每战一次「星愈」回血；击败敌人获得经验、升级提升攻血。
 *  - 多结局：最终抉择 + 光暗倾向 → 真·创世 / 光辉守护 / 虚空主宰 / 平凡旅人。
 *
 * 全图形 Canvas 程序化绘制，无图片素材。
 */
(function (factory) {
  const StarQuest = factory();
  if (typeof module === 'object' && module.exports) module.exports = StarQuest;
  const g =
    typeof globalThis !== 'undefined' ? globalThis
      : typeof GameGlobal !== 'undefined' ? GameGlobal
        : typeof window !== 'undefined' ? window : this;
  if (g) g.StarQuest = StarQuest;
})(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Baloo 2","Nunito","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = '"Share Tech Mono","Consolas","Menlo","PingFang SC",monospace';

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
  function starPath(ctx, x, y, outer, inner, rot) {
    const spikes = 5;
    ctx.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
      const rad = k % 2 === 0 ? outer : inner;
      const a = (Math.PI / spikes) * k - Math.PI / 2 + (rot || 0);
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  // 四角星芒
  function sparkle(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.28, y - r * 0.28);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.28, y + r * 0.28);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.28, y + r * 0.28);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - r * 0.28, y - r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 敌人图鉴 ---------------- */
  const ENEMIES = {
    wisp: { name: '虚空游魂', hp: 42, atk: 6, period: 2.0, xp: 30, color: '#b39bff', accent: '#7de8ff' },
    sentinel: { name: '堕落哨卫', hp: 150, atk: 11, period: 1.6, xp: 120, color: '#ff9a5a', accent: '#ffd93d', boss: true },
    shard: { name: '记忆残片', hp: 64, atk: 8, period: 1.8, xp: 48, color: '#8fd6ff', accent: '#b39bff' },
    echo: { name: '回声之影', hp: 240, atk: 15, period: 1.4, xp: 170, color: '#c9a4ff', accent: '#ff9ec9', boss: true },
    devourer: { name: '核心吞噬者', hp: 430, atk: 20, period: 1.2, xp: 320, color: '#ff6a8a', accent: '#ffd93d', boss: true, final: true },
  };

  /* ---------------- 剧情节点图 ---------------- */
  const NODES = {
    start: {
      chapter: '序章 · 破碎的星核',
      chapterColor: '#7de8ff',
      type: 'story',
      lines: [
        { who: '旁白', text: '星海的最深处，维系万物的「星核」在一夜间碎裂。' },
        { who: '旁白', text: '光与暗失去平衡，星辰一颗颗熄灭。' },
        { who: '旅者', text: '……我在哪里？', color: '#eaf3ff' },
        { who: '光之灵', text: '你醒啦，最后的「星守」。星核碎了，只有你还能把碎片带回去。', color: '#8ef0a0' },
        { who: '光之灵', text: '前方有虚空游魂挡住了去路，小心点。', color: '#8ef0a0' },
      ],
      next: 'fight1',
    },
    fight1: { type: 'battle', enemies: ['wisp', 'wisp'], next: 'afterFight1' },
    afterFight1: {
      type: 'story',
      lines: [
        { who: '光之灵', text: '打得漂亮！它们只是被黑暗吸引的流浪者。', color: '#8ef0a0' },
        { who: '旅者', text: '前面好像还有更强的气息……', color: '#eaf3ff' },
      ],
      next: 'choice1',
    },
    choice1: {
      type: 'choice',
      prompt: '废墟中，一名受伤的星民向你伸出手，他体内残留着一缕星核能量。',
      options: [
        { label: '救下他，守护这份光', align: 1, next: 'boss1intro' },
        { label: '取走能量，我需要力量', align: -1, next: 'boss1intro' },
      ],
    },
    boss1intro: {
      type: 'story',
      lines: [
        { who: '旁白', text: '地动山摇，一座被黑暗寄生的巨大哨卫苏醒。' },
        { who: '堕落哨卫', text: '擅闯者……交、出、碎、片。', color: '#ff9a5a' },
      ],
      next: 'boss1',
    },
    boss1: { type: 'battle', enemies: ['sentinel'], next: 'interlude' },
    interlude: {
      chapter: '第二章 · 记忆回廊',
      chapterColor: '#b39bff',
      type: 'story',
      lines: [
        { who: '光之灵', text: '哨卫碎了……第一块星核碎片归位了。', color: '#8ef0a0' },
        { who: '旁白', text: '碎片带你坠入一片破碎的记忆回廊。' },
        { who: '低语', text: '你也在逃避吗？逃避曾经失去的一切……', color: '#c9a4ff' },
        { who: '旅者', text: '不。我选择面对。', color: '#eaf3ff' },
      ],
      next: 'choice2',
    },
    choice2: {
      type: 'choice',
      prompt: '回廊深处，映出你心底最深的记忆。你选择如何对待它？',
      options: [
        { label: '拥抱它，与过去和解', align: 1, next: 'fight2' },
        { label: '斩断它，不再被牵绊', align: -1, next: 'fight2' },
      ],
    },
    fight2: { type: 'battle', enemies: ['shard', 'shard', 'shard'], next: 'boss2intro' },
    boss2intro: {
      type: 'story',
      lines: [
        { who: '回声之影', text: '我就是你——被黑暗放大的你。', color: '#c9a4ff' },
        { who: '回声之影', text: '战胜我，或成为我。', color: '#c9a4ff' },
      ],
      next: 'boss2',
    },
    boss2: { type: 'battle', enemies: ['echo'], next: 'finalIntro' },
    finalIntro: {
      chapter: '终章 · 核心之渊',
      chapterColor: '#ff9ec9',
      type: 'story',
      lines: [
        { who: '光之灵', text: '只剩最后一块碎片了……可它已被吞入深渊。', color: '#8ef0a0' },
        { who: '旅者', text: '那就到深渊里去。', color: '#eaf3ff' },
        { who: '核心吞噬者', text: '渺小的星守……把你的光，也交给我吧。', color: '#ff6a8a' },
      ],
      next: 'boss3',
    },
    boss3: { type: 'battle', enemies: ['devourer'], next: 'finalChoice' },
    finalChoice: {
      type: 'choice',
      prompt: '星核在你掌中重新聚合。此刻，你拥有决定它命运的力量。',
      options: [
        { label: '献出光芒，重塑星海', align: 2, final: 'light' },
        { label: '独揽核心，主宰虚空', align: -2, final: 'dark' },
        { label: '熄灭核心，归于平凡', align: 0, final: 'neutral' },
      ],
    },
  };

  /* ---------------- 结局 ---------------- */
  const ENDINGS = {
    E_true: {
      id: 'E_true',
      tag: 'TRUE ENDING',
      title: '真·光辉创世',
      color: '#ffe08a',
      accent: '#8ef0a0',
      text: [
        '你以纯澈的光辉献祭自我，星核重燃，比以往更亮。',
        '万星归位，星海再度流转，众星民传颂着「星守」之名。',
        '而你的光，永远留在了每一颗星辰里。',
      ],
    },
    E_light: {
      id: 'E_light',
      tag: 'GOOD ENDING',
      title: '光辉守护者',
      color: '#7de8ff',
      accent: '#8ef0a0',
      text: [
        '你归还了星核，虽未燃尽自我，却已重燃群星。',
        '你成为守望星海的旅者，在有需要的地方点亮微光。',
      ],
    },
    E_dark: {
      id: 'E_dark',
      tag: 'DARK ENDING',
      title: '虚空主宰',
      color: '#c9a4ff',
      accent: '#ff6a8a',
      text: [
        '你独揽了星核的全部力量，黑暗在你脚下臣服。',
        '旧日的星海寂静，唯余你意志的回响——新秩序，由你书写。',
      ],
    },
    E_neutral: {
      id: 'E_neutral',
      tag: 'NORMAL ENDING',
      title: '平凡旅人',
      color: '#9fb4d8',
      accent: '#8fd6ff',
      text: [
        '你让星核归于沉寂，结束了它的争夺，也结束了浩劫。',
        '你卸下星守之名，走上一条无人记得的路，自在而平静。',
      ],
    },
  };

  /* ---------------- 核心 ---------------- */
  function StarQuest(opts) {
    opts = opts || {};
    this.opts = opts;
    this.storage = opts.storage || null;
    this.nav = null;
    this.width = opts.width || 0;
    this.height = opts.height || 0;

    this.bestLevel = this._loadNum('quest.best');
    this.endingsFound = this._loadNum('quest.endings');

    this.time = 0;
    this._layout();
    this._genBg();
    this.reset();
  }

  StarQuest.prototype._loadNum = function (key) {
    try {
      const v = parseInt(this.storage && this.storage.get(key), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  };
  StarQuest.prototype._save = function () {
    try {
      if (this.storage) {
        this.storage.set('quest.best', String(this.bestLevel));
        this.storage.set('quest.endings', String(this.endingsFound));
      }
    } catch (e) {
      /* ignore */
    }
  };

  StarQuest.prototype._layout = function () {
    const w = this.width;
    const h = this.height;
    this.pad = Math.max(12, w * 0.045);
    this.barH = Math.max(74, h * 0.12);
    this.topH = Math.max(56, h * 0.085);

    this.backR = { x: this.pad * 0.7, y: this.pad * 0.55, w: 40, h: 32 };

    // 战斗按钮
    const bw = Math.min(112, (w - this.pad * 2 - 16) / 2);
    const by = h - this.barH + (this.barH - 46) / 2 + 6;
    this.skillR = { x: w / 2 - bw - 6, y: by, w: bw, h: 46 };
    this.healR = { x: w / 2 + 6, y: by, w: bw, h: 46 };

    // 剧情对话框区域（点击推进）
    this.dialogR = { x: this.pad, y: h * 0.6, w: w - this.pad * 2, h: h * 0.34 };

    // 结局按钮
    const pw = Math.min(150, w * 0.42);
    const cy = h * 0.74;
    this.pBtn = { x: w / 2 - pw - 8, y: cy, w: pw, h: 48 };
    this.pBtn2 = { x: w / 2 + 8, y: cy, w: pw, h: 48 };
  };

  StarQuest.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    this._layout();
    this._genBg();
    if (this.battle && this.state === 'battle') this._layoutBattle();
    if (this.state === 'choice' && this.choice) this._layoutChoice();
  };

  StarQuest.prototype._genBg = function () {
    const n = Math.min(90, Math.floor((this.width * this.height) / 11000));
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: 0.4 + Math.random() * 1.5,
        sp: 0.4 + Math.random() * 1.8,
        ph: Math.random() * TAU,
      });
    }
    // 动态氛围粒子（余烬 / 浮屑 / 核心火花），位置用归一化坐标 + 时间驱动
    this.bgBits = [];
    const bn = Math.min(40, Math.floor((this.width * this.height) / 26000));
    for (let i = 0; i < bn; i++) {
      this.bgBits.push({
        x0: Math.random(),
        y0: Math.random(),
        r: 0.8 + Math.random() * 2.6,
        sp: 0.02 + Math.random() * 0.06,
        ph: Math.random() * TAU,
        drift: (Math.random() - 0.5) * 0.04,
        kind: Math.floor(Math.random() * 3),
      });
    }
  };

  StarQuest.prototype.reset = function () {
    this._layout();
    this.time = 0;
    this.state = 'story'; // story | choice | battle | ending
    this.alignment = 0; // 正=光 负=暗
    this.nodeId = 'start';
    this.pendingFinal = null;
    this.atkCd = 0;
    this.flashT = 0;
    this.slashes = [];

    // 角色
    this.hero = {
      name: '星守 · 旅者',
      level: 1,
      hp: 100,
      maxHp: 100,
      atk: 12,
      exp: 0,
      expNext: 120,
      energy: 0,
      combo: 0,
      comboT: 0,
      lifesteal: 0,
      critDmg: 0,
    };

    this.ending = null;
    this.banner = null;
    this.particles = [];
    this.texts = [];
    this.floats = [];
    this.chapterPulse = 1.2;

    this._enterNode('start');
  };

  StarQuest.prototype.onEnter = function () {
    this.reset();
  };

  /* ----------------------------- 节点进入 ----------------------------- */
  const NODE_ACT = {
    start: 'ember', fight1: 'ember', afterFight1: 'ember', choice1: 'ember', boss1intro: 'ember', boss1: 'ember',
    interlude: 'abyss', choice2: 'abyss', fight2: 'abyss', boss2intro: 'abyss', boss2: 'abyss',
    finalIntro: 'core', boss3: 'core', finalChoice: 'core',
  };

  StarQuest.prototype._enterNode = function (id) {
    const node = NODES[id];
    if (!node) return;
    this.nodeId = id;
    this.state = node.type;
    this.act = NODE_ACT[id] || this.act || 'ember';

    if (node.chapter) {
      this._bannerChapter(node.chapter, node.chapterColor || '#7de8ff');
    }

    if (node.type === 'story') {
      this.dlg = { lines: node.lines, idx: 0, chars: 0, reveal: 0, nextColor: node.lines[0].color };
      this.next = node.next;
    } else if (node.type === 'choice') {
      this.choice = { prompt: node.prompt, options: node.options, rects: [] };
      this._layoutChoice();
    } else if (node.type === 'battle') {
      this._startBattle(node);
    }

    // 背景音乐：战斗/Boss 切换，剧情回到冒险主题
    if (node.type === 'battle') {
      const isBoss = node.enemies.some((t) => ENEMIES[t] && ENEMIES[t].boss);
      this._playTrack(isBoss ? 'boss' : 'battle');
    } else {
      this._playTrack('adventure');
    }

    this._sound(node.type === 'battle' ? 'whoosh' : 'tap');
  };

  StarQuest.prototype._playTrack = function (name) {
    if (this.opts.audio && this.opts.audio.playTrack) {
      try {
        this.opts.audio.playTrack(name);
      } catch (e) {
        /* ignore */
      }
    }
  };

  StarQuest.prototype._layoutChoice = function () {
    const w = this.width;
    const h = this.height;
    const opts = this.choice.options;
    const n = opts.length;
    const bh = Math.min(56, (h * 0.5) / n);
    const gap = 12;
    const totalH = n * bh + (n - 1) * gap;
    const top = h * 0.52 - totalH / 2 + (n - 1) * 0;
    const bw = Math.min(w - this.pad * 2, 360);
    this.choice.rects = [];
    for (let i = 0; i < n; i++) {
      this.choice.rects.push({
        x: (w - bw) / 2,
        y: top + i * (bh + gap),
        w: bw,
        h: bh,
        idx: i,
      });
    }
  };

  StarQuest.prototype._bannerChapter = function (text, color) {
    this.banner = { text: text, color: color, t: 0, max: 2.4 };
    this.chapterPulse = 1;
  };

  /* ----------------------------- 战斗 ----------------------------- */
  StarQuest.prototype._startBattle = function (node) {
    this.battle = {
      enemies: [],
      over: false,
      won: false,
      healUsed: false,
      hitFlash: 0,
      shakeT: 0,
    };
    const self = this;
    node.enemies.forEach(function (type, i) {
      const def = ENEMIES[type];
      self.battle.enemies.push({
        type: type,
        def: def,
        hp: def.hp,
        maxHp: def.hp,
        atkTimer: def.period * (0.6 + i * 0.25),
        windup: 0,
        hurtT: 0,
        deadT: 0,
        x: 0,
        y: 0,
        phase: Math.random() * TAU,
      });
    });
    this.battle.next = node.next;
    // 记录进入战斗时的血量（战败则回到此节点重试）
    this.checkpoint = this.nodeId;
    this._layoutBattle();
    this._sound('whoosh');
  };

  StarQuest.prototype._layoutBattle = function () {
    const w = this.width;
    const n = this.battle ? this.battle.enemies.length : 1;
    const arenaTop = this.topH + 8;
    const arenaBottom = this.height - this.barH - 8;
    this.arena = { x: 0, y: arenaTop, w: w, h: arenaBottom - arenaTop };
    this.heroPos = { x: w * 0.26, y: arenaTop + (arenaBottom - arenaTop) * 0.52 };
    this.enemies_layout(n);
  };

  StarQuest.prototype.enemies_layout = function (n) {
    const w = this.width;
    const arenaTop = this.arena.y;
    const arenaH = this.arena.h;
    const startX = w * 0.52;
    const endX = w * 0.9;
    for (let i = 0; i < this.battle.enemies.length; i++) {
      const e = this.battle.enemies[i];
      const t = n <= 1 ? 0.6 : i / (n - 1);
      e.x = lerp(startX, endX, n <= 1 ? 0.6 : t);
      e.baseY = arenaTop + arenaH * (n <= 1 ? 0.5 : 0.32 + 0.36 * (i % 2));
      e.y = e.baseY;
    }
  };

  /* ----------------------------- 输入 ----------------------------- */
  StarQuest.prototype._hit = function (r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };

  StarQuest.prototype.pointerDown = function (x, y) {
    if (this._hit(this.backR, x, y)) {
      if (this.nav) this.nav.back();
      return;
    }

    if (this.state === 'story') {
      this._advanceStory();
      return;
    }
    if (this.state === 'choice') {
      for (let i = 0; i < this.choice.rects.length; i++) {
        if (this._hit(this.choice.rects[i], x, y)) {
          this._choose(i);
          return;
        }
      }
      return;
    }
    if (this.state === 'battle') {
      if (this._hit(this.skillR, x, y)) {
        this._useSkill();
        return;
      }
      if (this._hit(this.healR, x, y)) {
        this._useHeal();
        return;
      }
      // 点按战斗区域 → 斩击
      if (y > this.arena.y && y < this.arena.y + this.arena.h) {
        this._attackTap(x, y);
      }
      return;
    }
    if (this.state === 'ending') {
      if (this._hit(this.pBtn, x, y)) this.reset();
      else if (this._hit(this.pBtn2, x, y) && this.nav) this.nav.back();
      return;
    }
  };

  StarQuest.prototype.pointerMove = function () {};
  StarQuest.prototype.pointerUp = function () {};

  StarQuest.prototype._advanceStory = function () {
    const dlg = this.dlg;
    const line = dlg.lines[dlg.idx];
    if (dlg.reveal < line.text.length) {
      dlg.reveal = line.text.length; // 先补全当前行
      return;
    }
    dlg.idx += 1;
    dlg.reveal = 0;
    if (dlg.idx >= dlg.lines.length) {
      if (this.next) this._enterNode(this.next);
      return;
    }
    this._sound('tap');
  };

  StarQuest.prototype._choose = function (idx) {
    const opt = this.choice.options[idx];
    this.alignment += opt.align || 0;
    this._sound('tap');
    if (opt.final) {
      this.pendingFinal = opt.final;
      this._resolveEnding(opt.final);
      return;
    }
    if (opt.next) this._enterNode(opt.next);
  };

  StarQuest.prototype._resolveEnding = function (kind) {
    let ending;
    if (kind === 'light') {
      ending = this.alignment >= 2 ? ENDINGS.E_true : ENDINGS.E_light;
    } else if (kind === 'dark') {
      ending = ENDINGS.E_dark;
    } else {
      ending = ENDINGS.E_neutral;
    }
    this.state = 'ending';
    this.ending = ending;
    this.endT = 0;
    // 记录结局
    const bit = { E_true: 1, E_light: 2, E_dark: 4, E_neutral: 8 }[ending.id] || 0;
    try {
      const prev = parseInt(this.storage && this.storage.get('quest.seen'), 10) || 0;
      const merged = prev | bit;
      if (this.storage) this.storage.set('quest.seen', String(merged));
      this.endingsFound = 0;
      for (let b = 0; b < 4; b++) if (merged & (1 << b)) this.endingsFound++;
    } catch (e) {
      /* ignore */
    }
    this._sound('levelup');
    // 星光爆发
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * TAU;
      const spd = 60 + Math.random() * 240;
      this.particles.push({
        x: this.width / 2,
        y: this.height * 0.4,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 50,
        g: 120,
        r: 1.5 + Math.random() * 3,
        life: 1 + Math.random() * 1.2,
        max: 2.2,
        color: ending.color,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  };

  /* ----------------------------- 战斗动作 ----------------------------- */
  StarQuest.prototype._aliveEnemies = function () {
    return this.battle.enemies.filter(function (e) {
      return e.hp > 0 && e.deadT <= 0;
    });
  };

  StarQuest.prototype._frontEnemy = function () {
    const alive = this._aliveEnemies();
    return alive.length ? alive[0] : null;
  };

  StarQuest.prototype._attackTap = function (x, y) {
    if (this.state !== 'battle' || this.battle.over) return;
    if (this.atkCd > 0) return;
    this.atkCd = 0.34;
    const target = this._frontEnemy();
    if (!target) return;
    this.hero.combo = Math.min(9, this.hero.combo + 1);
    this.hero.comboT = 1.4;
    const crit = Math.random() < 0.18;
    let dmg = this.hero.atk * (1 + this.hero.combo * 0.08);
    if (crit) dmg *= 1.8 + (this.hero.critDmg || 0);
    dmg = Math.round(dmg);
    this._damageEnemy(target, dmg, crit);
    // 光之天赋：吸血回复
    if (this.hero.lifesteal > 0) {
      const heal = Math.max(1, Math.round(dmg * this.hero.lifesteal));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
      this._floatText('+' + heal, '#8ef0a0', this.heroPos.x, this.heroPos.y - 30);
    }
    this.hero.energy = Math.min(100, this.hero.energy + 8);
    this._sound(crit ? 'pop' : 'tile');
    // 斩击特效
    this._slash(target.x, target.y);
  };

  StarQuest.prototype._damageEnemy = function (e, dmg, crit) {
    e.hp -= dmg;
    e.hurtT = 0.2;
    this._floatText('-' + dmg, crit ? '#ffd93d' : '#ffd0d8', e.x, e.y - 40, crit);
    if (e.hp <= 0 && e.deadT <= 0) {
      e.hp = 0;
      e.deadT = 0.5;
      this._onEnemyKilled(e);
    }
  };

  StarQuest.prototype._onEnemyKilled = function (e) {
    this.hero.energy = Math.min(100, this.hero.energy + 15);
    this._gainExp(e.def.xp);
    this._burst(e.x, e.y, e.def.color);
    this._sound('pop');
    if (this._aliveEnemies().length === 0 && !this.battle.over) {
      this.battle.over = true;
      this.battle.won = true;
      this.battle.winT = 0.9;
    }
  };

  StarQuest.prototype._gainExp = function (xp) {
    const h = this.hero;
    h.exp += xp;
    while (h.exp >= h.expNext) {
      h.exp -= h.expNext;
      h.level += 1;
      h.maxHp += 22;
      h.atk += 5;
      h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.45));
      h.expNext = Math.round(h.expNext * 1.35) + 20;
      this._floatText('LEVEL UP!', '#8ef0a0', this.heroPos.x, this.heroPos.y - 70, true);
      this._burst(this.heroPos.x, this.heroPos.y, '#8ef0a0');
      this._sound('levelup');
      // 天赋成长：随光暗倾向获得不同被动（光→吸血/生命，暗→暴击/攻击）
      if (this.alignment > 0) {
        h.lifesteal = Math.min(0.5, (h.lifesteal || 0) + 0.06);
        h.maxHp += 8;
        this._floatText('天赋·汲光：吸血↑', '#8ef0a0', this.heroPos.x, this.heroPos.y - 96);
      } else if (this.alignment < 0) {
        h.critDmg = (h.critDmg || 0) + 0.15;
        h.atk += 2;
        this._floatText('天赋·噬力：暴击↑', '#ff8fa8', this.heroPos.x, this.heroPos.y - 96);
      } else {
        h.maxHp += 6;
        h.atk += 1;
        this._floatText('天赋·平衡', '#cfe0ff', this.heroPos.x, this.heroPos.y - 96);
      }
      if (h.level > this.bestLevel) {
        this.bestLevel = h.level;
        this._save();
      }
    }
  };

  StarQuest.prototype._useSkill = function () {
    if (this.state !== 'battle' || this.battle.over) return;
    const h = this.hero;
    if (h.energy < 100) {
      this._floatText('能量不足', '#ff9fae', this.heroPos.x, this.heroPos.y - 60);
      this._sound('over');
      return;
    }
    h.energy = 0;
    const alive = this._aliveEnemies();
    for (let i = 0; i < alive.length; i++) {
      this._damageEnemy(alive[i], Math.round(h.atk * 2.6), true);
    }
    this._burst(this.width * 0.6, this.heroPos.y, '#7de8ff');
    this._flash();
    this._sound('sun');
  };

  StarQuest.prototype._useHeal = function () {
    if (this.state !== 'battle' || this.battle.over) return;
    if (this.battle.healUsed) {
      this._floatText('已用过', '#9fb4d8', this.heroPos.x, this.heroPos.y - 60);
      return;
    }
    this.battle.healUsed = true;
    const h = this.hero;
    const amt = Math.round(h.maxHp * 0.4);
    h.hp = Math.min(h.maxHp, h.hp + amt);
    this._floatText('+' + amt, '#8ef0a0', this.heroPos.x, this.heroPos.y - 50, true);
    this._burst(this.heroPos.x, this.heroPos.y, '#8ef0a0');
    this._sound('win');
  };

  StarQuest.prototype._heroHurt = function (dmg) {
    const h = this.hero;
    h.hp -= dmg;
    this.battle.hitFlash = 0.25;
    this.battle.shakeT = 0.3;
    this._floatText('-' + dmg, '#ff7a8a', this.heroPos.x, this.heroPos.y - 40);
    this._sound('over');
    if (h.hp <= 0) {
      h.hp = 0;
      this._heroDefeated();
    }
  };

  StarQuest.prototype._heroDefeated = function () {
    this.battle.over = true;
    this.battle.defeat = true;
    this.battle.defeatT = 0;
  };

  /* ----------------------------- 反馈特效 ----------------------------- */
  StarQuest.prototype._sound = function (name) {
    if (this.opts.sound) {
      try {
        this.opts.sound(name);
      } catch (e) {
        /* ignore */
      }
    }
  };
  StarQuest.prototype._floatText = function (text, color, x, y, big) {
    this.floats.push({ text: text, color: color, x: x, y: y, life: 0.9, max: 0.9, big: !!big, vy: -46 });
  };
  StarQuest.prototype._slash = function (x, y) {
    this.slashes = this.slashes || [];
    this.slashes.push({ x: x, y: y, t: 0, life: 0.22 });
  };
  StarQuest.prototype._burst = function (x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      const spd = 50 + Math.random() * 180;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        g: 180,
        r: 1.5 + Math.random() * 2.5,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        color: color,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  };
  StarQuest.prototype._flash = function () {
    this.flashT = 0.3;
  };

  /* ----------------------------- 更新 ----------------------------- */
  StarQuest.prototype.update = function (dt) {
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.max) this.banner = null;
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    // 浮字
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    // 斩击
    if (this.slashes) {
      for (let i = this.slashes.length - 1; i >= 0; i--) {
        this.slashes[i].t += dt;
        if (this.slashes[i].t > this.slashes[i].life) this.slashes.splice(i, 1);
      }
    }

    if (this.state === 'story' && this.dlg) {
      const line = this.dlg.lines[this.dlg.idx];
      if (line && this.dlg.reveal < line.text.length) {
        this.dlg.reveal = Math.min(line.text.length, this.dlg.reveal + dt * 38);
      }
    }

    if (this.state === 'battle') this._updateBattle(dt);
    if (this.state === 'ending') this.endT += dt;
  };

  StarQuest.prototype._updateBattle = function (dt) {
    const b = this.battle;
    if (b.hitFlash > 0) b.hitFlash -= dt;
    if (b.shakeT > 0) b.shakeT -= dt;

    // 连击计时
    if (this.hero.comboT > 0) {
      this.hero.comboT -= dt;
      if (this.hero.comboT <= 0) this.hero.combo = 0;
    }

    if (b.over) {
      b.winT -= dt;
      if (b.won && b.winT <= 0) {
        // 进入下一节点
        if (b.next) this._enterNode(b.next);
      } else if (b.defeat) {
        b.defeatT += dt;
        if (b.defeatT > 1.4) this._battleRetry();
      }
      return;
    }

    // 敌人
    const arenaTop = this.arena.y;
    const arenaH = this.arena.h;
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      if (e.hurtT > 0) e.hurtT -= dt;
      if (e.deadT > 0) {
        e.deadT -= dt;
        continue;
      }
      if (e.hp <= 0) continue;
      e.y = e.baseY + Math.sin(this.time * 2 + e.phase) * 6;
      e.atkTimer -= dt;
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          // 命中英雄
          this._heroHurt(e.def.atk);
          e.atkTimer = e.def.period;
        }
      } else if (e.atkTimer <= 0.45 && e.windup <= 0) {
        // 起手预警
        e.windup = 0.45;
      }
    }
  };

  StarQuest.prototype._battleRetry = function () {
    // 战败：回到本战斗起点，血量回满一半，能量清零
    this.hero.hp = this.hero.maxHp;
    this.hero.energy = 0;
    this.hero.combo = 0;
    this._enterNode(this.checkpoint || 'start');
  };

  /* ----------------------------- 渲染 ----------------------------- */
  StarQuest.prototype.render = function (ctx) {
    this._bg(ctx);

    if (this.state === 'battle') {
      this._renderBattle(ctx);
    } else {
      // 剧情 / 抉择：显示立绘氛围
      this._renderScene(ctx);
    }

    this._particles(ctx);

    if (this.state === 'story') this._renderStory(ctx);
    else if (this.state === 'choice') this._renderChoice(ctx);
    else if (this.state === 'ending') this._renderEnding(ctx);

    this._topBar(ctx);
    this._bannerDraw(ctx);

    if (this.flashT > 0) {
      ctx.fillStyle = 'rgba(200,240,255,' + this.flashT * 0.7 + ')';
      ctx.fillRect(0, 0, this.width, this.height);
    }
  };

  StarQuest.prototype._bg = function (ctx) {
    const w = this.width;
    const h = this.height;
    const act = this.act || 'ember';

    // 各章节主题色
    const theme = {
      ember: { top: '#1a0e0a', mid: '#0d0a1a', bot: '#05060f', a: [255, 130, 70], b: [255, 200, 90] },
      abyss: { top: '#0a0a22', mid: '#0c0820', bot: '#04050f', a: [150, 110, 255], b: [110, 200, 255] },
      core: { top: '#1c0710', mid: '#140616', bot: '#05040c', a: [255, 90, 130], b: [255, 210, 90] },
    }[act];

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.top);
    g.addColorStop(0.5, theme.mid);
    g.addColorStop(1, theme.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const neb = (x, y, r, rgb, a) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')');
      gr.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    // 章节专属远景
    if (act === 'core') {
      // 中央脉动星核（破碎感）
      const cx = w / 2;
      const cy = h * 0.32;
      const pr = Math.min(w, h) * 0.2;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.6);
      neb(cx, cy, pr * 2.6, theme.a, 0.22 + 0.1 * pulse);
      // 破碎环
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.time * 0.15);
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = 'rgba(255,120,150,' + (0.35 - k * 0.08) + ')';
        ctx.lineWidth = 4 - k;
        const rr = pr * (0.7 + k * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, rr, k * 1.4, k * 1.4 + 4.2);
        ctx.stroke();
      }
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
      cg.addColorStop(0, 'rgba(255,230,160,' + (0.5 + 0.3 * pulse) + ')');
      cg.addColorStop(0.4, 'rgba(255,90,130,0.5)');
      cg.addColorStop(1, 'rgba(120,20,60,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (act === 'abyss') {
      neb(w * 0.5, h * 0.4, w * 0.9, theme.a, 0.16);
      neb(w * 0.8, h * 0.7, w * 0.6, theme.b, 0.12);
      // 悬浮镜面碎片
      for (let i = 0; i < 5; i++) {
        const sx = w * (0.15 + 0.18 * i) + Math.sin(this.time * 0.3 + i) * 16;
        const sy = h * (0.2 + 0.12 * ((i * 7) % 5)) + Math.cos(this.time * 0.25 + i) * 12;
        const ss = 14 + (i % 3) * 10;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.time * 0.2 + i);
        ctx.fillStyle = 'rgba(150,180,255,' + (0.12 + 0.06 * Math.sin(this.time + i)) + ')';
        ctx.strokeStyle = 'rgba(180,210,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -ss);
        ctx.lineTo(ss * 0.5, 0);
        ctx.lineTo(0, ss);
        ctx.lineTo(-ss * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // ember：废墟光柱 + 暖光
      neb(w * 0.3, h * 0.25, w * 0.8, theme.a, 0.18);
      neb(w * 0.8, h * 0.62, w * 0.6, theme.b, 0.1);
      // 远处残柱剪影
      ctx.fillStyle = 'rgba(10,6,4,0.55)';
      for (let i = 0; i < 5; i++) {
        const bx = w * (0.08 + i * 0.21);
        const bh = h * (0.18 + ((i * 5) % 4) * 0.05);
        ctx.fillRect(bx, h * 0.46 - bh, w * 0.05, bh + h * 0.1);
        ctx.fillRect(bx - w * 0.01, h * 0.46 - bh, w * 0.07, 6);
      }
    }

    // 星空
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const a = 0.2 + 0.55 * Math.abs(Math.sin(this.time * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = act === 'core' ? '#ffd9c8' : act === 'abyss' ? '#c8d6ff' : '#ffe6cc';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 动态氛围粒子
    if (this.bgBits) {
      for (let i = 0; i < this.bgBits.length; i++) {
        const b = this.bgBits[i];
        let py = (b.y0 - this.time * b.sp) % 1;
        if (py < 0) py += 1;
        const px = (b.x0 + Math.sin(this.time * 0.5 + b.ph) * b.drift) * w;
        const yy = py * h;
        if (act === 'ember') {
          // 上升余烬
          const a = 0.4 + 0.4 * Math.sin(this.time * 3 + b.ph);
          ctx.globalAlpha = a * (0.6);
          ctx.fillStyle = '#ffb060';
          ctx.beginPath();
          ctx.arc(px, yy, b.r, 0, TAU);
          ctx.fill();
        } else if (act === 'abyss') {
          // 漂浮微光
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.time * 2 + b.ph);
          ctx.fillStyle = '#a9c8ff';
          sparkle(ctx, px, yy, b.r * 1.6, '#bcd4ff', 0.6);
        } else {
          // 核心火花
          ctx.globalAlpha = 0.35 + 0.4 * Math.sin(this.time * 4 + b.ph);
          ctx.fillStyle = '#ffd0a0';
          ctx.fillRect(px - b.r * 0.5, yy - b.r * 0.5, b.r, b.r);
        }
      }
      ctx.globalAlpha = 1;
    }
  };

  // 剧情场景：中央立绘 + 情绪光晕
  StarQuest.prototype._renderScene = function (ctx) {
    const cx = this.width / 2;
    const cy = this.height * 0.34;
    const r = Math.min(this.width, this.height) * 0.18;

    // 光晕
    const gg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
    gg.addColorStop(0, 'rgba(140,220,255,0.22)');
    gg.addColorStop(0.5, 'rgba(120,120,255,0.12)');
    gg.addColorStop(1, 'rgba(80,60,160,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.4, 0, TAU);
    ctx.fill();

    // 光环
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.25);
    ctx.strokeStyle = 'rgba(150,210,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash && ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash && ctx.setLineDash([]);
    ctx.restore();

    // 立绘：星守剪影（斗篷 + 星核）
    this._drawHeroPortrait(ctx, cx, cy, r);

    // 环绕星尘
    for (let i = 0; i < 6; i++) {
      const a = this.time * 0.8 + (i * TAU) / 6;
      const rr = r * 1.85;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.7;
      sparkle(ctx, px, py, 5, '#cfe8ff', 0.6);
    }
  };

  // 星守剪影立绘
  StarQuest.prototype._drawHeroPortrait = function (ctx, cx, cy, r) {
    ctx.save();
    // 斗篷
    const cg = ctx.createLinearGradient(cx, cy - r, cx, cy + r * 1.3);
    cg.addColorStop(0, '#3a5bd8');
    cg.addColorStop(1, '#16204a');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.9);
    ctx.quadraticCurveTo(cx - r * 1.1, cy - r * 0.2, cx - r * 0.9, cy + r * 1.3);
    ctx.lineTo(cx + r * 0.9, cy + r * 1.3);
    ctx.quadraticCurveTo(cx + r * 1.1, cy - r * 0.2, cx, cy - r * 0.9);
    ctx.closePath();
    ctx.fill();
    // 兜帽
    ctx.fillStyle = '#22306a';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.55, r * 0.6, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#0a1128';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.45, r * 0.42, Math.PI, TAU);
    ctx.fill();
    // 面容微光（眼睛）
    const blink = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    ctx.fillStyle = 'rgba(140,230,255,' + (0.6 + 0.4 * blink) + ')';
    ctx.beginPath();
    ctx.arc(cx - r * 0.16, cy - r * 0.5, r * 0.06, 0, TAU);
    ctx.arc(cx + r * 0.16, cy - r * 0.5, r * 0.06, 0, TAU);
    ctx.fill();
    // 胸前星核
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
    const sg = ctx.createRadialGradient(cx, cy + r * 0.2, 0, cx, cy + r * 0.2, r * 0.5);
    sg.addColorStop(0, 'rgba(255,240,180,' + (0.7 + 0.3 * pulse) + ')');
    sg.addColorStop(0.5, 'rgba(140,220,255,0.5)');
    sg.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.2, r * 0.5, 0, TAU);
    ctx.fill();
    starPath(ctx, cx, cy + r * 0.2, r * 0.22, r * 0.09, this.time * 0.6);
    ctx.fillStyle = '#fff7d6';
    ctx.fill();
    ctx.restore();
  };

  /* ---------------- 剧情对话 ---------------- */
  StarQuest.prototype._renderStory = function (ctx) {
    const r = this.dialogR;
    const dlg = this.dlg;
    const line = dlg.lines[dlg.idx];

    // 对话框
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 18);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, 'rgba(18,28,58,0.94)');
    g.addColorStop(1, 'rgba(10,16,36,0.94)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,232,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 角色名标签
    const nameW = 110;
    ctx.save();
    roundRect(ctx, r.x + 16, r.y - 16, nameW, 30, 10);
    ctx.fillStyle = 'rgba(40,60,120,0.95)';
    ctx.fill();
    ctx.strokeStyle = line.color || '#7de8ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = line.color || '#7de8ff';
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(line.who || '', r.x + 16 + nameW / 2, r.y - 1);

    // 正文（打字机 + 自动换行）
    ctx.fillStyle = '#e6eeff';
    ctx.font = Math.round(Math.min(16, this.width * 0.043)) + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const shown = line.text.slice(0, Math.floor(dlg.reveal));
    this._wrapText(ctx, shown, r.x + 20, r.y + 26, r.w - 40, 24);

    // 继续提示（闪烁三角）
    if (dlg.reveal >= line.text.length) {
      const a = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#7de8ff';
      const tx = r.x + r.w - 24;
      const ty = r.y + r.h - 20;
      ctx.beginPath();
      ctx.moveTo(tx - 6, ty - 6);
      ctx.lineTo(tx + 6, ty - 6);
      ctx.lineTo(tx, ty + 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  };

  StarQuest.prototype._wrapText = function (ctx, text, x, y, maxW, lineH) {
    let line = '';
    let cy = y;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        ctx.fillText(line, x, cy);
        line = '';
        cy += lineH;
        continue;
      }
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        line = ch;
        cy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  };

  /* ---------------- 抉择 ---------------- */
  StarQuest.prototype._renderChoice = function (ctx) {
    const w = this.width;
    // 提示语
    ctx.fillStyle = 'rgba(230,238,255,0.92)';
    ctx.font = Math.round(Math.min(17, w * 0.045)) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this._wrapTextCenter(ctx, this.choice.prompt, w / 2, this.choice.rects[0].y - 60, w - this.pad * 2, 26);

    for (let i = 0; i < this.choice.rects.length; i++) {
      const r = this.choice.rects[i];
      const opt = this.choice.options[i];
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2 + i);
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(40,58,110,0.95)');
      g.addColorStop(1, 'rgba(22,32,66,0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      const accent = opt.align > 0 ? '#8ef0a0' : opt.align < 0 ? '#ff8fa8' : '#7de8ff';
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.5 + 0.4 * pulse;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      // 左侧色条
      ctx.fillStyle = accent;
      ctx.fillRect(r.x + 6, r.y + r.h * 0.22, 3, r.h * 0.56);

      ctx.fillStyle = '#eaf3ff';
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opt.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  StarQuest.prototype._wrapTextCenter = function (ctx, text, cx, y, maxW, lineH) {
    let line = '';
    let cy = y;
    const lines = [];
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const startY = cy - (lines.length - 1) * lineH * 0.5;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, startY + i * lineH);
    }
  };

  /* ---------------- 战斗场景 ---------------- */
  StarQuest.prototype._renderBattle = function (ctx) {
    const b = this.battle;
    ctx.save();
    if (b.shakeT > 0) {
      const s = b.shakeT * 10;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    // 竞技场地板光环
    const hx = this.heroPos.x;
    const hy = this.heroPos.y + this._heroR() * 1.1;
    ctx.strokeStyle = 'rgba(125,232,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(hx, hy, this._heroR() * 1.6, this._heroR() * 0.5, 0, 0, TAU);
    ctx.stroke();

    // 敌人
    for (let i = 0; i < b.enemies.length; i++) {
      this._drawEnemy(ctx, b.enemies[i]);
    }
    // 英雄
    if (!b.defeat) this._drawHeroBattle(ctx);
    // 斩击
    if (this.slashes) {
      for (let i = 0; i < this.slashes.length; i++) {
        const s = this.slashes[i];
        const k = s.t / s.life;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = '#eaf6ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 26 + k * 10, -0.9 + k * 0.5, 0.9 + k * 0.5);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    // 受击红闪
    if (b.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,60,90,' + b.hitFlash * 0.5 + ')';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    this._renderBattleHud(ctx);
    this._renderFloats(ctx);

    if (b.over && b.defeat) this._renderDefeat(ctx);
    if (b.over && b.won) this._renderVictory(ctx);
  };

  StarQuest.prototype._heroR = function () {
    return Math.min(this.arena ? this.arena.h * 0.12 : 26, 34);
  };

  StarQuest.prototype._drawHeroBattle = function (ctx) {
    const x = this.heroPos.x;
    const y = this.heroPos.y;
    const r = this._heroR();
    const bob = Math.sin(this.time * 3) * 3;
    ctx.save();
    // 斗篷
    const cg = ctx.createLinearGradient(x, y - r, x, y + r);
    cg.addColorStop(0, '#3a5bd8');
    cg.addColorStop(1, '#16204a');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.8 + bob);
    ctx.quadraticCurveTo(x - r, y - r * 0.1, x - r * 0.8, y + r);
    ctx.lineTo(x + r * 0.8, y + r);
    ctx.quadraticCurveTo(x + r, y - r * 0.1, x, y - r * 0.8 + bob);
    ctx.closePath();
    ctx.fill();
    // 头
    ctx.fillStyle = '#22306a';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.55 + bob, r * 0.5, 0, TAU);
    ctx.fill();
    // 眼睛
    const blink = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    ctx.fillStyle = 'rgba(140,230,255,' + (0.6 + 0.4 * blink) + ')';
    ctx.beginPath();
    ctx.arc(x - r * 0.15, y - r * 0.55 + bob, r * 0.06, 0, TAU);
    ctx.arc(x + r * 0.15, y - r * 0.55 + bob, r * 0.06, 0, TAU);
    ctx.fill();
    // 星核
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
    const sg = ctx.createRadialGradient(x, y + r * 0.15, 0, x, y + r * 0.15, r * 0.45);
    sg.addColorStop(0, 'rgba(255,240,180,' + (0.7 + 0.3 * pulse) + ')');
    sg.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.15, r * 0.45, 0, TAU);
    ctx.fill();
    // 能量满时环绕光环
    if (this.hero.energy >= 100) {
      ctx.strokeStyle = 'rgba(255,220,120,' + (0.5 + 0.4 * pulse) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.3, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  };

  StarQuest.prototype._drawEnemy = function (ctx, e) {
    if (e.deadT > 0) {
      // 消散
      const a = e.deadT / 0.5;
      ctx.save();
      ctx.globalAlpha = a;
      const r = this._enemyR() * (e.def.boss ? 1.35 : 1);
      const gg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 2.4);
      gg.addColorStop(0, e.def.color);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * (2.6 - a * 1.4), 0, TAU);
      ctx.fill();
      // 消散碎片
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU + a * 2;
        const dd = r * (1.6 - a) * 1.4;
        const px = e.x + Math.cos(ang) * dd;
        const py = e.y + Math.sin(ang) * dd;
        ctx.globalAlpha = a * 0.8;
        sparkle(ctx, px, py, r * 0.2, e.def.accent, a);
      }
      ctx.restore();
      return;
    }
    if (e.hp <= 0) return;

    const type = e.type;
    const r = this._enemyR() * (e.def.boss ? 1.32 : 1);
    const hurt = e.hurtT > 0;

    // 地面投影
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + r * (e.def.boss ? 1.1 : 0.95), r * 0.9, r * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 敌体光晕
    ctx.save();
    const gg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 1.9);
    gg.addColorStop(0, 'rgba(255,120,150,0.22)');
    gg.addColorStop(1, 'rgba(255,120,150,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.9, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(e.x, e.y);
    if (hurt) ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);

    if (type === 'wisp') this._drawWisp(ctx, r, e, hurt);
    else if (type === 'shard') this._drawShard(ctx, r, e, hurt);
    else if (type === 'sentinel') this._drawSentinel(ctx, r, e, hurt);
    else if (type === 'echo') this._drawEcho(ctx, r, e, hurt);
    else if (type === 'devourer') this._drawDevourer(ctx, r, e, hurt);
    else this._drawPoly(ctx, r, e, hurt);

    ctx.restore();

    // 起手预警：红色扩散环
    if (e.windup > 0) {
      const k = 1 - e.windup / 0.45;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ff5a6a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + (1 - k) * r * 1.7, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 血条
    if (e.def.boss || e.hp < e.maxHp) {
      const bw = Math.max(r * 2.2, 46);
      const bx = e.x - bw / 2;
      const by = e.y - r * (e.def.boss ? 1.4 : 1.2) - (e.def.boss ? 16 : 10);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, bx - 1, by - 1, bw + 2, 7, 3.5);
      ctx.fill();
      const hpR = clamp(e.hp / e.maxHp, 0, 1);
      const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      hg.addColorStop(0, e.def.boss ? '#ff3a5a' : '#ff8a4a');
      hg.addColorStop(1, e.def.boss ? '#ff9a5a' : '#ffd93d');
      ctx.fillStyle = hg;
      roundRect(ctx, bx, by, bw * hpR, 5, 2.5);
      ctx.fill();
      if (e.def.boss) {
        ctx.fillStyle = 'rgba(255,225,235,0.9)';
        ctx.font = 'bold 9px ' + MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(e.def.name, e.x, by - 3);
      }
    }
  };

  // 虚空游魂：幽浮水滴 + 拖尾触须 + 单眼
  StarQuest.prototype._drawWisp = function (ctx, r, e, hurt) {
    const t = this.time;
    const bob = Math.sin(t * 2.5 + e.phase) * r * 0.08;
    // 拖尾
    ctx.save();
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.25 - k * 0.06;
      ctx.fillStyle = e.def.accent;
      ctx.beginPath();
      ctx.ellipse(Math.sin(t * 3 + k) * r * 0.2, r * (0.5 + k * 0.35) + bob, r * (0.5 - k * 0.12), r * 0.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // 主体（水滴形）
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3 + bob, r * 0.1, 0, bob, r);
    grad.addColorStop(0, hurt ? '#ffffff' : '#e6ddff');
    grad.addColorStop(0.5, e.def.color);
    grad.addColorStop(1, '#5a3aa0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -r + bob);
    ctx.bezierCurveTo(r * 0.95, -r * 0.3 + bob, r * 0.72, r * 0.85 + bob, 0, r * 0.9 + bob);
    ctx.bezierCurveTo(-r * 0.72, r * 0.85 + bob, -r * 0.95, -r * 0.3 + bob, 0, -r + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hurt ? '#fff' : 'rgba(180,150,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 单眼
    ctx.fillStyle = '#0a0820';
    ctx.beginPath();
    ctx.ellipse(0, bob - r * 0.05, r * 0.3, r * 0.38, 0, 0, TAU);
    ctx.fill();
    const blink = 0.6 + 0.4 * Math.sin(this.time * 3 + e.phase);
    ctx.fillStyle = 'rgba(140,230,255,' + blink + ')';
    ctx.beginPath();
    ctx.arc(-r * 0.08, bob - r * 0.14, r * 0.1, 0, TAU);
    ctx.fill();
  };

  // 记忆残片：旋转的符文菱形碎片
  StarQuest.prototype._drawShard = function (ctx, r, e, hurt) {
    const rot = this.time * 1.4 + e.phase;
    ctx.rotate(rot);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + e.phase);
    // 外框菱形
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.62, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, hurt ? '#ffffff' : e.def.accent);
    g.addColorStop(0.5, e.def.color);
    g.addColorStop(1, '#20304a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = hurt ? '#fff' : 'rgba(180,220,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 内部符文
    ctx.rotate(-rot * 1.6);
    ctx.strokeStyle = 'rgba(230,245,255,' + (0.5 + 0.4 * pulse) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.5);
    ctx.lineTo(r * 0.3, 0);
    ctx.lineTo(0, r * 0.5);
    ctx.lineTo(-r * 0.3, 0);
    ctx.closePath();
    ctx.stroke();
    // 核心光
    ctx.fillStyle = 'rgba(180,230,255,' + (0.6 + 0.4 * pulse) + ')';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, TAU);
    ctx.fill();
  };

  // 堕落哨卫：棱角装甲 + 独眼护盾 + 双角
  StarQuest.prototype._drawSentinel = function (ctx, r, e, hurt) {
    const t = this.time;
    // 双角
    ctx.fillStyle = '#3a2418';
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.5, -r * 0.7);
      ctx.lineTo(s * r * 0.95, -r * 1.25);
      ctx.lineTo(s * r * 0.55, -r * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    // 主体方甲
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, hurt ? '#ffffff' : e.def.accent);
    g.addColorStop(0.45, e.def.color);
    g.addColorStop(1, '#3a1e10');
    ctx.fillStyle = g;
    ctx.beginPath();
    const sides = 8;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU + Math.PI / 8;
      const rr = r * (0.82 + 0.18 * Math.abs(Math.sin(i * 1.6 + e.phase)));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hurt ? '#fff' : 'rgba(255,200,120,0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 护甲纹理
    ctx.strokeStyle = 'rgba(60,30,16,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.1);
    ctx.lineTo(r * 0.5, -r * 0.1);
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(0, r * 0.6);
    ctx.stroke();
    // 独眼（发光）
    const eye = 0.6 + 0.4 * Math.sin(t * 5);
    const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.4);
    eg.addColorStop(0, '#fff2c0');
    eg.addColorStop(0.5, 'rgba(255,90,90,' + eye + ')');
    eg.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff2a4a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, TAU);
    ctx.fill();
    // 环绕碎屑
    for (let i = 0; i < 4; i++) {
      const a = t * 1.2 + (i / 4) * TAU;
      sparkle(ctx, Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, r * 0.1, '#ffd93d', 0.7);
    }
  };

  // 回声之影：镜面人形 + 涟漪重影
  StarQuest.prototype._drawEcho = function (ctx, r, e, hurt) {
    const t = this.time;
    // 涟漪重影
    for (let k = 2; k >= 0; k--) {
      ctx.globalAlpha = 0.14 - k * 0.04;
      ctx.fillStyle = e.def.accent;
      ctx.beginPath();
      ctx.ellipse(Math.sin(t + k) * r * 0.18 * k, 0, r * (0.85 + k * 0.18), r * (1.05 + k * 0.18), 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 披风人形
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, hurt ? '#ffffff' : e.def.accent);
    g.addColorStop(0.5, e.def.color);
    g.addColorStop(1, '#2a1640');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 1.0, -r * 0.5, r * 0.85, r);
    ctx.quadraticCurveTo(0, r * 0.7, -r * 0.85, r);
    ctx.quadraticCurveTo(-r * 1.0, -r * 0.5, 0, -r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hurt ? '#fff' : 'rgba(230,200,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 兜帽空洞 + 两点眼光
    ctx.fillStyle = '#12071f';
    ctx.beginPath();
    ctx.arc(0, -r * 0.4, r * 0.42, Math.PI, TAU);
    ctx.fill();
    const blink = 0.5 + 0.5 * Math.sin(t * 4 + e.phase);
    ctx.fillStyle = 'rgba(255,140,200,' + blink + ')';
    ctx.beginPath();
    ctx.arc(-r * 0.16, -r * 0.42, r * 0.07, 0, TAU);
    ctx.arc(r * 0.16, -r * 0.42, r * 0.07, 0, TAU);
    ctx.fill();
    // 胸口镜像裂光
    ctx.strokeStyle = 'rgba(255,220,255,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, r * 0.2);
    ctx.lineTo(0, r * 0.45);
    ctx.lineTo(r * 0.3, r * 0.2);
    ctx.stroke();
  };

  // 核心吞噬者：旋转巨眼 + 破碎环 + 触须（最终 Boss）
  StarQuest.prototype._drawDevourer = function (ctx, r, e, hurt) {
    const t = this.time;
    // 外环破碎瓣
    ctx.save();
    ctx.rotate(t * 0.5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.save();
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -r * 1.5, 0, -r);
      g.addColorStop(0, 'rgba(255,90,130,0)');
      g.addColorStop(1, hurt ? 'rgba(255,255,255,0.9)' : 'rgba(255,120,150,0.8)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, -r);
      ctx.lineTo(r * 0.16, -r);
      ctx.lineTo(0, -r * (1.5 + 0.2 * Math.sin(t * 3 + i)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 主球体
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, hurt ? '#ffffff' : '#ffdfe8');
    g.addColorStop(0.4, e.def.color);
    g.addColorStop(1, '#3a0416');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // 巨眼
    ctx.fillStyle = '#2a0410';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, TAU);
    ctx.fill();
    // 虹膜扫视
    const look = Math.sin(t * 1.5) * r * 0.18;
    const ig = ctx.createRadialGradient(look, -r * 0.05, 0, look, 0, r * 0.5);
    ig.addColorStop(0, '#fff2b0');
    ig.addColorStop(0.5, '#ff6a3a');
    ig.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(look, 0, r * 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0208';
    ctx.beginPath();
    ctx.ellipse(look, 0, r * 0.12, r * 0.34, 0, 0, TAU);
    ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(look - r * 0.1, -r * 0.12, r * 0.08, 0, TAU);
    ctx.fill();
  };

  StarQuest.prototype._drawPoly = function (ctx, r, e, hurt) {
    ctx.rotate((this.time * 0.8 + e.phase) * 0.3);
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const rr = r * (0.78 + 0.22 * Math.sin(i * 2.1 + e.phase));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = e.def.color;
    ctx.fill();
    ctx.strokeStyle = hurt ? '#fff' : e.def.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  StarQuest.prototype._enemyR = function () {
    return Math.min(this.arena ? this.arena.h * 0.1 : 22, 30);
  };

  StarQuest.prototype._renderBattleHud = function (ctx) {
    const w = this.width;
    const h = this.height;
    const barY = h - this.barH;

    // 英雄血条 + 经验 + 等级
    const hero = this.hero;
    ctx.save();
    const hx = this.pad;
    const hy = barY + 12;
    const hw = w - this.pad * 2;
    // 头像圆
    ctx.beginPath();
    ctx.arc(hx + 16, hy + 18, 16, 0, TAU);
    const ag = ctx.createLinearGradient(hx, hy, hx + 32, hy + 36);
    ag.addColorStop(0, '#3a5bd8');
    ag.addColorStop(1, '#16204a');
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.strokeStyle = '#7de8ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#eaf3ff';
    ctx.font = 'bold 13px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Lv' + hero.level, hx + 16, hy + 18);

    // 血条
    const bx = hx + 40;
    const bw = hw - 40;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, bx, hy + 3, bw, 12, 6);
    ctx.fill();
    const hpR = clamp(hero.hp / hero.maxHp, 0, 1);
    const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, '#ff6a8a');
    hg.addColorStop(1, '#ff9a5a');
    ctx.fillStyle = hg;
    roundRect(ctx, bx, hy + 3, bw * hpR, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(hero.hp) + ' / ' + hero.maxHp, bx + bw / 2, hy + 9);

    // 经验条
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, bx, hy + 19, bw, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#8ef0a0';
    roundRect(ctx, bx, hy + 19, bw * clamp(hero.exp / hero.expNext, 0, 1), 6, 3);
    ctx.fill();

    // 能量条
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, bx, hy + 28, bw, 6, 3);
    ctx.fill();
    const full = hero.energy >= 100;
    ctx.fillStyle = full ? '#ffd93d' : '#7de8ff';
    roundRect(ctx, bx, hy + 28, bw * clamp(hero.energy / 100, 0, 1), 6, 3);
    ctx.fill();
    ctx.restore();

    // 技能 / 星愈按钮
    this._drawActionBtn(ctx, this.skillR, '⚡ 星爆', full ? '#ffd93d' : 'rgba(90,110,150,0.5)', full);
    this._drawActionBtn(ctx, this.healR, '✚ 星愈', this.battle.healUsed ? 'rgba(90,110,150,0.4)' : '#8ef0a0', !this.battle.healUsed);

    // 连击
    if (hero.combo >= 3) {
      ctx.fillStyle = '#ffd93d';
      ctx.font = 'bold 18px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 10);
      ctx.fillText('COMBO x' + hero.combo, this.pad, this.arena.y + 20);
      ctx.globalAlpha = 1;
    }
  };

  StarQuest.prototype._drawActionBtn = function (ctx, r, label, accent, enabled) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, enabled ? 'rgba(50,70,120,0.95)' : 'rgba(40,50,80,0.7)');
    g.addColorStop(1, enabled ? 'rgba(30,44,86,0.95)' : 'rgba(30,36,60,0.7)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = enabled ? '#eaf3ff' : 'rgba(150,170,200,0.6)';
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.restore();
  };

  StarQuest.prototype._renderFloats = function (ctx) {
    ctx.textAlign = 'center';
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i];
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = 'bold ' + (f.big ? 20 : 15) + 'px ' + FONT;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  StarQuest.prototype._renderVictory = function (ctx) {
    const w = this.width;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ef0a0';
    ctx.font = 'bold 28px ' + FONT;
    ctx.shadowColor = '#8ef0a0';
    ctx.shadowBlur = 20;
    ctx.fillText('战斗胜利！', w / 2, this.arena.y + this.arena.h * 0.4);
    ctx.restore();
  };

  StarQuest.prototype._renderDefeat = function (ctx) {
    const w = this.width;
    ctx.save();
    ctx.fillStyle = 'rgba(20,4,10,0.6)';
    ctx.fillRect(0, 0, w, this.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8fa8';
    ctx.font = 'bold 28px ' + FONT;
    ctx.shadowColor = '#ff5a6a';
    ctx.shadowBlur = 20;
    ctx.fillText('星光黯淡……', w / 2, this.arena.y + this.arena.h * 0.4);
    ctx.fillStyle = 'rgba(200,220,255,0.8)';
    ctx.font = '14px ' + FONT;
    ctx.fillText('正在重整旗鼓……', w / 2, this.arena.y + this.arena.h * 0.4 + 34);
    ctx.restore();
  };

  /* ---------------- 顶栏（返回 + 章节 + 光暗倾向） ---------------- */
  StarQuest.prototype._topBar = function (ctx) {
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

    // 光暗倾向条（右上）
    const aw = 80;
    const ax = w - this.pad - aw;
    const ay = this.backR.y + this.backR.h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, ax, ay - 4, aw, 8, 4);
    ctx.fill();
    // 中点
    const mid = ax + aw / 2;
    ctx.fillStyle = 'rgba(200,210,240,0.4)';
    ctx.fillRect(mid - 0.5, ay - 6, 1, 12);
    // 指针
    const ak = clamp(this.alignment / 4, -1, 1);
    const px = mid + ak * (aw / 2);
    ctx.fillStyle = this.alignment > 0 ? '#8ef0a0' : this.alignment < 0 ? '#ff8fa8' : '#cfe0ff';
    ctx.beginPath();
    ctx.arc(px, ay, 5, 0, TAU);
    ctx.fill();
    // 标签
    ctx.fillStyle = 'rgba(150,200,255,0.6)';
    ctx.font = '9px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('光', ax - 10, ay + 3);
    ctx.textAlign = 'right';
    ctx.fillText('暗', ax + aw + 10, ay + 3);
    ctx.restore();
  };

  StarQuest.prototype._bannerDraw = function (ctx) {
    if (!this.banner) return;
    const b = this.banner;
    const k = b.t / b.max;
    let a = 1;
    if (k < 0.12) a = k / 0.12;
    else if (k > 0.75) a = (1 - k) / 0.25;
    a = clamp(a, 0, 1);
    const w = this.width;
    const y = this.height * 0.2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const tw = Math.min(w * 0.82, 320);
    const g = ctx.createLinearGradient(w / 2 - tw / 2, 0, w / 2 + tw / 2, 0);
    g.addColorStop(0, 'rgba(10,16,38,0)');
    g.addColorStop(0.5, 'rgba(10,16,38,0.7)');
    g.addColorStop(1, 'rgba(10,16,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w / 2 - tw / 2, y - 26, tw, 44);
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
    ctx.font = 'bold 19px ' + FONT;
    ctx.fillText(b.text, w / 2, y);
    ctx.restore();
  };

  /* ---------------- 结局 ---------------- */
  StarQuest.prototype._renderEnding = function (ctx) {
    const w = this.width;
    const h = this.height;
    const e = this.ending;
    const t = this.endT || 0;
    const fade = clamp(t / 0.6, 0, 1);

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(3,6,16,0.82)';
    ctx.fillRect(0, 0, w, h);

    // 顶部光环
    const cg = ctx.createRadialGradient(w / 2, h * 0.28, 0, w / 2, h * 0.28, w * 0.7);
    cg.addColorStop(0, 'rgba(255,224,138,0.16)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, w, h * 0.6);

    // 标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = e.color;
    ctx.font = 'bold 12px ' + MONO;
    ctx.fillText(e.tag, w / 2, h * 0.18);

    // 结局标题（发光）
    ctx.fillStyle = e.color;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 24;
    ctx.font = 'bold ' + Math.round(Math.min(30, w * 0.08)) + 'px ' + FONT;
    ctx.fillText(e.title, w / 2, h * 0.18 + 34);
    ctx.shadowBlur = 0;

    // 结局徽章（星章）
    const bx = w / 2;
    const by = h * 0.36;
    const br = Math.min(w, h) * 0.09;
    ctx.save();
    ctx.translate(bx, by);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, br * 2);
    sg.addColorStop(0, e.accent);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = fade * (0.4 + 0.3 * pulse);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, br * 2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = fade;
    starPath(ctx, 0, 0, br, br * 0.44, t * 0.4);
    ctx.fillStyle = e.color;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();

    // 结语文本
    ctx.fillStyle = 'rgba(225,235,255,0.92)';
    ctx.font = Math.round(Math.min(15, w * 0.04)) + 'px ' + FONT;
    const startY = h * 0.36 + br * 2 + 24;
    for (let i = 0; i < e.text.length; i++) {
      this._wrapTextCenter(ctx, e.text[i], w / 2, startY + i * 42, w - this.pad * 4, 22);
    }

    // 收集进度
    ctx.fillStyle = 'rgba(160,190,255,0.6)';
    ctx.font = '12px ' + MONO;
    ctx.fillText('已解锁结局 ' + this.endingsFound + ' / 4 · 最高等级 Lv' + this.bestLevel, w / 2, h * 0.6);
    ctx.restore();

    // 按钮（不透明度跟随淡入）
    ctx.save();
    ctx.globalAlpha = fade;
    this._drawActionBtn(ctx, this.pBtn, '再玩一次', '#7de8ff', true);
    this._drawActionBtn(ctx, this.pBtn2, '回首页', '#b39bff', true);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  StarQuest.prototype._particles = function (ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      sparkle(ctx, 0, 0, p.r * 1.8, p.color, a);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  return StarQuest;
});
