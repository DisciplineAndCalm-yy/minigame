/*
 * 《小动物消消乐》—— Q 版萌宠「三消 + 堆叠」玩法
 *
 * - 牌阵由多层小动物堆叠而成，每堆只能点最上面那张
 * - 点中的小动物会「飞」进底部槽位，集齐 3 只同款即消除
 * - 难度梯度：第 1 关为熟悉关；第 2 关起跳入高难（对应旧第 9 关难度），
 *   之后仅通过「增加花色种类」与「增加堆叠层数」持续加码，槽位恒为 7
 * - 全部图形为 Canvas 程序化绘制的 Q 版小动物（12 种，靠轮廓 + 配色区分）
 */
(function (factory) {
  const AnimalGame = factory();
  if (typeof module === 'object' && module.exports) module.exports = AnimalGame;
  const g =
    typeof globalThis !== 'undefined' ? globalThis
      : typeof GameGlobal !== 'undefined' ? GameGlobal
        : typeof window !== 'undefined' ? window : this;
  if (g) g.SheepGame = AnimalGame;
})(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Baloo 2","Nunito","PingFang SC","Microsoft YaHei",sans-serif';
  const CAPACITY = 7;

  /* ---------------- 12 种 Q 版小动物 ---------------- */
  const ANIMALS = [
    { name: '兔兔', card: '#ffdcea', accent: '#ff7fa8' },
    { name: '喵喵', card: '#ffd9ab', accent: '#ff7f6a' },
    { name: '熊熊', card: '#e0b98a', accent: '#8a5220' },
    { name: '熊猫', card: '#dfe6ee', accent: '#23232c' },
    { name: '猪猪', card: '#ffc9de', accent: '#ff6f9d' },
    { name: '蛙蛙', card: '#d3f0a8', accent: '#5aa62c' },
    { name: '狗狗', card: '#ffe2a0', accent: '#d98a2b' },
    { name: '小鸡', card: '#fff08a', accent: '#ff9410' },
    { name: '狐狸', card: '#ff9d70', accent: '#d63a12' },
    { name: '企鹅', card: '#a8c4de', accent: '#141d33' },
    { name: '绵羊', card: '#eef3f7', accent: '#7c8a99' },
    { name: '猴子', card: '#e4cfef', accent: '#6b3f22' },
  ];

  // 真实叫声文件名（顺序与 ANIMALS 对应）
  const ANIMAL_SFX = ['rabbit', 'cat', 'bear', 'panda', 'pig', 'frog', 'dog', 'chicken', 'fox', 'penguin', 'sheep', 'monkey'];

  /* ---------------- 关卡难度梯度 ---------------- */
  // 槽位恒为 7；难度只靠「花色种类」与「堆叠层数」提升
  const LEVELS = [
    { tiles: 12, types: 3, depth: 1 }, // 第 1 关：熟悉关
    { tiles: 54, types: 8, depth: 4 }, // 第 2 关：跳跃式进入高难（≈ 旧第 9 关）
    { tiles: 57, types: 9, depth: 4 },
    { tiles: 60, types: 10, depth: 4 },
    { tiles: 63, types: 11, depth: 5 },
    { tiles: 66, types: 12, depth: 5 },
  ];

  function levelConfig(level) {
    const base = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
    const extra = Math.max(0, level - LEVELS.length);
    return {
      tiles: base.tiles + extra * 4,
      types: Math.min(ANIMALS.length, base.types),
      depth: Math.min(6, base.depth + Math.floor(extra / 2)),
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function easeOutBack(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function shuffleArr(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
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

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.72);
    ctx.bezierCurveTo(x + s, y - s * 0.05, x + s * 0.52, y - s * 0.95, x, y - s * 0.22);
    ctx.bezierCurveTo(x - s * 0.52, y - s * 0.95, x - s, y - s * 0.05, x, y + s * 0.72);
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

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  // 当前绘制的小动物眨眼程度（0~1），由 drawAnimalFace 设置，drawEyes 读取
  let eyeBlink = 0;

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }

  function drawEyes(ctx, x, y, dx, r, dark) {
    if (eyeBlink > 0.55) {
      // 眨眼：画成弯弯的闭眼弧线
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1.2, r * 0.85);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x - dx, y + r * 0.25, r, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + dx, y + r * 0.25, r, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      return;
    }
    const open = 1 - eyeBlink * 1.4;
    if (open <= 0.05) return;
    ctx.fillStyle = dark;
    ell(ctx, x - dx, y, r, r * open);
    ctx.fill();
    ell(ctx, x + dx, y, r, r * open);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ell(ctx, x - dx + r * 0.4, y - r * 0.3 * open, r * 0.34, r * 0.34 * open);
    ctx.fill();
    ell(ctx, x + dx + r * 0.4, y - r * 0.3 * open, r * 0.34, r * 0.34 * open);
    ctx.fill();
  }

  function drawBlush(ctx, x, y, dx, r, color) {
    ctx.fillStyle = color;
    ell(ctx, x - dx, y, r, r * 0.7);
    ctx.fill();
    ell(ctx, x + dx, y, r, r * 0.7);
    ctx.fill();
  }

  // 绘制 Q 版小动物脸部：kind 对应 ANIMALS 下标，box 为可用尺寸
  // anim: { blink, tilt, squashX, squashY } 控制表情与形变
  function drawAnimalFace(ctx, kind, cx, cy, box, anim) {
    anim = anim || {};
    const R = box * 0.3;
    const hx = cx;
    const hy = cy + box * 0.05;
    const dark = '#3a2f3a';
    eyeBlink = anim.blink || 0;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(anim.tilt || 0);
    ctx.scale(anim.squashX || 1, anim.squashY || 1);
    ctx.translate(-hx, -hy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (kind === 0) {
      // 兔兔：长耳朵
      ctx.fillStyle = '#ffffff';
      ell(ctx, hx - R * 0.48, hy - R * 1.5, R * 0.34, R * 1.1, -0.18);
      ctx.fill();
      ell(ctx, hx + R * 0.48, hy - R * 1.5, R * 0.34, R * 1.1, 0.18);
      ctx.fill();
      ctx.fillStyle = '#ffc2d6';
      ell(ctx, hx - R * 0.48, hy - R * 1.48, R * 0.16, R * 0.78, -0.18);
      ctx.fill();
      ell(ctx, hx + R * 0.48, hy - R * 1.48, R * 0.16, R * 0.78, 0.18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, hx, hy, R);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.08, R * 0.34, R * 0.13, dark);
      drawBlush(ctx, hx, hy + R * 0.28, R * 0.62, R * 0.16, 'rgba(255,130,165,0.5)');
      ctx.fillStyle = '#ff9eb8';
      ell(ctx, hx, hy + R * 0.22, R * 0.12, R * 0.09);
      ctx.fill();
    }

    if (kind === 1) {
      // 喵喵：尖耳 + 胡须
      ctx.fillStyle = '#ffb877';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.9, hy - R * 0.5);
      ctx.lineTo(hx - R * 0.55, hy - R * 1.25);
      ctx.lineTo(hx - R * 0.05, hy - R * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + R * 0.9, hy - R * 0.5);
      ctx.lineTo(hx + R * 0.55, hy - R * 1.25);
      ctx.lineTo(hx + R * 0.05, hy - R * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.72, hy - R * 0.58);
      ctx.lineTo(hx - R * 0.52, hy - R * 1.0);
      ctx.lineTo(hx - R * 0.3, hy - R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + R * 0.72, hy - R * 0.58);
      ctx.lineTo(hx + R * 0.52, hy - R * 1.0);
      ctx.lineTo(hx + R * 0.3, hy - R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb877';
      circle(ctx, hx, hy, R);
      ctx.fill();
      // 猫的浅色吻部 + 胡须垫
      ctx.fillStyle = '#ffe0c4';
      ell(ctx, hx, hy + R * 0.34, R * 0.56, R * 0.4);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.06, R * 0.34, R * 0.13, dark);
      drawBlush(ctx, hx, hy + R * 0.24, R * 0.6, R * 0.15, 'rgba(255,110,140,0.5)');
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      ctx.moveTo(hx, hy + R * 0.18);
      ctx.lineTo(hx + R * 0.12, hy + R * 0.32);
      ctx.lineTo(hx - R * 0.12, hy + R * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = R * 0.05;
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(hx + s * R * 0.55, hy + R * 0.18);
        ctx.lineTo(hx + s * R, hy + R * 0.08);
        ctx.moveTo(hx + s * R * 0.55, hy + R * 0.3);
        ctx.lineTo(hx + s * R, hy + R * 0.36);
        ctx.stroke();
      }
    }

    if (kind === 2) {
      // 熊熊：圆耳 + 浅色口鼻
      ctx.fillStyle = '#a9744a';
      circle(ctx, hx - R * 0.78, hy - R * 0.72, R * 0.34);
      ctx.fill();
      circle(ctx, hx + R * 0.78, hy - R * 0.72, R * 0.34);
      ctx.fill();
      ctx.fillStyle = '#c08a5a';
      circle(ctx, hx, hy, R);
      ctx.fill();
      ctx.fillStyle = '#f0d9ba';
      ell(ctx, hx, hy + R * 0.36, R * 0.5, R * 0.34);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.16, R * 0.38, R * 0.13, dark);
      ctx.fillStyle = '#5a3d28';
      ell(ctx, hx, hy + R * 0.24, R * 0.17, R * 0.13);
      ctx.fill();
    }

    if (kind === 3) {
      // 熊猫：黑耳 + 黑眼圈
      ctx.fillStyle = '#2f2f38';
      circle(ctx, hx - R * 0.8, hy - R * 0.7, R * 0.36);
      ctx.fill();
      circle(ctx, hx + R * 0.8, hy - R * 0.7, R * 0.36);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, hx, hy, R);
      ctx.fill();
      ctx.fillStyle = '#2f2f38';
      ell(ctx, hx - R * 0.38, hy - R * 0.1, R * 0.24, R * 0.3, -0.4);
      ctx.fill();
      ell(ctx, hx + R * 0.38, hy - R * 0.1, R * 0.24, R * 0.3, 0.4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, hx - R * 0.36, hy - R * 0.08, R * 0.1);
      ctx.fill();
      circle(ctx, hx + R * 0.36, hy - R * 0.08, R * 0.1);
      ctx.fill();
      ctx.fillStyle = '#2f2f38';
      ell(ctx, hx, hy + R * 0.24, R * 0.14, R * 0.1);
      ctx.fill();
    }

    if (kind === 4) {
      // 猪猪：软耳 + 猪鼻
      ctx.fillStyle = '#ffb0c8';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.86, hy - R * 0.5);
      ctx.lineTo(hx - R * 0.5, hy - R);
      ctx.lineTo(hx - R * 0.16, hy - R * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + R * 0.86, hy - R * 0.5);
      ctx.lineTo(hx + R * 0.5, hy - R);
      ctx.lineTo(hx + R * 0.16, hy - R * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffc2d4';
      circle(ctx, hx, hy, R);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.28, R * 0.34, R * 0.12, dark);
      ctx.fillStyle = '#ff9eb8';
      ell(ctx, hx, hy + R * 0.26, R * 0.36, R * 0.26);
      ctx.fill();
      ctx.fillStyle = '#d96a92';
      circle(ctx, hx - R * 0.13, hy + R * 0.26, R * 0.06);
      ctx.fill();
      circle(ctx, hx + R * 0.13, hy + R * 0.26, R * 0.06);
      ctx.fill();
    }

    if (kind === 5) {
      // 蛙蛙：鼓眼 + 大嘴
      ctx.fillStyle = '#9ad85a';
      circle(ctx, hx - R * 0.5, hy - R * 0.62, R * 0.36);
      ctx.fill();
      circle(ctx, hx + R * 0.5, hy - R * 0.62, R * 0.36);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, hx - R * 0.5, hy - R * 0.62, R * 0.22);
      ctx.fill();
      circle(ctx, hx + R * 0.5, hy - R * 0.62, R * 0.22);
      ctx.fill();
      ctx.fillStyle = dark;
      circle(ctx, hx - R * 0.5, hy - R * 0.6, R * 0.1);
      ctx.fill();
      circle(ctx, hx + R * 0.5, hy - R * 0.6, R * 0.1);
      ctx.fill();
      ctx.fillStyle = '#9ad85a';
      ell(ctx, hx, hy + R * 0.1, R * 0.92, R * 0.78);
      ctx.fill();
      ctx.strokeStyle = '#4f7f28';
      ctx.lineWidth = R * 0.08;
      ctx.beginPath();
      ctx.arc(hx, hy + R * 0.12, R * 0.58, 0.18, Math.PI - 0.18);
      ctx.stroke();
    }

    if (kind === 6) {
      // 狗狗：垂耳 + 舌头
      ctx.fillStyle = '#a9744a';
      ell(ctx, hx - R * 0.92, hy - R * 0.1, R * 0.34, R * 0.6, 0.3);
      ctx.fill();
      ell(ctx, hx + R * 0.92, hy - R * 0.1, R * 0.34, R * 0.6, -0.3);
      ctx.fill();
      ctx.fillStyle = '#d8a878';
      circle(ctx, hx, hy, R);
      ctx.fill();
      ctx.fillStyle = '#f5e6d4';
      ell(ctx, hx, hy + R * 0.42, R * 0.58, R * 0.4);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.16, R * 0.36, R * 0.13, dark);
      ctx.fillStyle = '#4a3222';
      ell(ctx, hx, hy + R * 0.24, R * 0.16, R * 0.12);
      ctx.fill();
      ctx.fillStyle = '#ff8fa3';
      ell(ctx, hx, hy + R * 0.52, R * 0.12, R * 0.15);
      ctx.fill();
    }

    if (kind === 7) {
      // 小鸡：呆毛 + 尖喙
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = R * 0.16;
      ctx.beginPath();
      ctx.moveTo(hx, hy - R * 0.95);
      ctx.quadraticCurveTo(hx - R * 0.1, hy - R * 1.35, hx + R * 0.18, hy - R * 1.3);
      ctx.stroke();
      ctx.fillStyle = '#ffe066';
      circle(ctx, hx, hy, R);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.12, R * 0.34, R * 0.13, dark);
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.16, hy + R * 0.18);
      ctx.lineTo(hx + R * 0.16, hy + R * 0.18);
      ctx.lineTo(hx, hy + R * 0.44);
      ctx.closePath();
      ctx.fill();
    }

    if (kind === 8) {
      // 狐狸：尖耳 + 白尖 + 白下巴
      ctx.fillStyle = '#ff9a5c';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.95, hy - R * 0.45);
      ctx.lineTo(hx - R * 0.62, hy - R * 1.3);
      ctx.lineTo(hx - R * 0.02, hy - R * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + R * 0.95, hy - R * 0.45);
      ctx.lineTo(hx + R * 0.62, hy - R * 1.3);
      ctx.lineTo(hx + R * 0.02, hy - R * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd8c0';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.78, hy - R * 0.58);
      ctx.lineTo(hx - R * 0.6, hy - R * 1.06);
      ctx.lineTo(hx - R * 0.34, hy - R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + R * 0.78, hy - R * 0.58);
      ctx.lineTo(hx + R * 0.6, hy - R * 1.06);
      ctx.lineTo(hx + R * 0.34, hy - R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff9a5c';
      circle(ctx, hx, hy, R);
      ctx.fill();
      // 狐狸的白脸盘（明显区别于猫）
      ctx.fillStyle = '#fff4ea';
      ell(ctx, hx, hy + R * 0.3, R * 0.72, R * 0.56);
      ctx.fill();
      ell(ctx, hx - R * 0.62, hy + R * 0.24, R * 0.26, R * 0.3);
      ctx.fill();
      ell(ctx, hx + R * 0.62, hy + R * 0.24, R * 0.26, R * 0.3);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.12, R * 0.34, R * 0.12, '#3a2a22');
      ctx.fillStyle = '#3a2a22';
      ell(ctx, hx, hy + R * 0.26, R * 0.15, R * 0.12);
      ctx.fill();
    }

    if (kind === 9) {
      // 企鹅：深色头 + 白肚 + 橙喙
      ctx.fillStyle = '#33425f';
      circle(ctx, hx, hy, R);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ell(ctx, hx, hy + R * 0.22, R * 0.7, R * 0.64);
      ctx.fill();
      ctx.fillStyle = '#33425f';
      circle(ctx, hx - R * 0.34, hy - R * 0.12, R * 0.13);
      ctx.fill();
      circle(ctx, hx + R * 0.34, hy - R * 0.12, R * 0.13);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      circle(ctx, hx - R * 0.3, hy - R * 0.16, R * 0.045);
      ctx.fill();
      circle(ctx, hx + R * 0.38, hy - R * 0.16, R * 0.045);
      ctx.fill();
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.13, hy + R * 0.06);
      ctx.lineTo(hx + R * 0.13, hy + R * 0.06);
      ctx.lineTo(hx, hy + R * 0.28);
      ctx.closePath();
      ctx.fill();
    }

    if (kind === 10) {
      // 绵羊：一圈蓬松羊毛 + 小脸
      ctx.fillStyle = '#ffffff';
      const puff = [
        [-0.62, -0.1, 0.34], [-0.34, -0.5, 0.36], [0.06, -0.62, 0.34],
        [0.44, -0.46, 0.34], [0.66, -0.06, 0.32], [0.5, 0.36, 0.32],
        [0.12, 0.54, 0.34], [-0.32, 0.5, 0.32], [-0.62, 0.24, 0.3],
      ];
      for (let i = 0; i < puff.length; i++) {
        circle(ctx, hx + puff[i][0] * R, hy + puff[i][1] * R, puff[i][2] * R);
        ctx.fill();
      }
      // 脸
      ctx.fillStyle = '#6f7b8a';
      ell(ctx, hx, hy + R * 0.16, R * 0.4, R * 0.34);
      ctx.fill();
      // 耳朵
      ctx.fillStyle = '#5d6875';
      ell(ctx, hx - R * 0.5, hy + R * 0.02, R * 0.16, R * 0.1, -0.5);
      ctx.fill();
      ell(ctx, hx + R * 0.5, hy + R * 0.02, R * 0.16, R * 0.1, 0.5);
      ctx.fill();
      // 眼睛
      ctx.fillStyle = '#2f2f38';
      circle(ctx, hx - R * 0.15, hy + R * 0.12, R * 0.06);
      ctx.fill();
      circle(ctx, hx + R * 0.15, hy + R * 0.12, R * 0.06);
      ctx.fill();
      // 鼻孔 + 嘴
      ctx.fillStyle = '#4a5560';
      circle(ctx, hx - R * 0.05, hy + R * 0.28, R * 0.03);
      ctx.fill();
      circle(ctx, hx + R * 0.05, hy + R * 0.28, R * 0.03);
      ctx.fill();
    }

    if (kind === 11) {
      // 猴子：大耳 + 浅色脸盘
      ctx.fillStyle = '#a9744a';
      circle(ctx, hx - R * 0.92, hy - R * 0.1, R * 0.36);
      ctx.fill();
      circle(ctx, hx + R * 0.92, hy - R * 0.1, R * 0.36);
      ctx.fill();
      ctx.fillStyle = '#b07a4f';
      circle(ctx, hx, hy, R);
      ctx.fill();
      ctx.fillStyle = '#ffe2c8';
      ell(ctx, hx, hy + R * 0.06, R * 0.66, R * 0.7);
      ctx.fill();
      drawEyes(ctx, hx, hy - R * 0.16, R * 0.32, R * 0.12, '#3a2a22');
      ctx.fillStyle = '#7a4f30';
      circle(ctx, hx - R * 0.1, hy + R * 0.24, R * 0.05);
      ctx.fill();
      circle(ctx, hx + R * 0.1, hy + R * 0.24, R * 0.05);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawAnimalTile(ctx, x, y, size, type, alpha, anim) {
    const a = ANIMALS[type] || ANIMALS[0];
    const half = size * 0.44;
    const r = size * 0.26;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'rgba(120,140,150,0.22)';
    roundRect(ctx, x - half + 1, y - half + size * 0.07, half * 2, half * 2, r);
    ctx.fill();
    const g = ctx.createLinearGradient(x, y - half, x, y + half);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, a.card);
    g.addColorStop(1, a.card);
    ctx.fillStyle = g;
    roundRect(ctx, x - half, y - half, half * 2, half * 2, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    roundRect(ctx, x - half + size * 0.06, y - half + size * 0.06, half * 2 - size * 0.12, half * 2 - size * 0.12, r * 0.8);
    ctx.stroke();

    // 底部主色条：缩小后也能凭颜色快速区分
    ctx.save();
    roundRect(ctx, x - half, y - half, half * 2, half * 2, r);
    ctx.clip();
    ctx.fillStyle = a.accent;
    ctx.fillRect(x - half, y + half - size * 0.12, half * 2, size * 0.12);
    ctx.restore();

    drawAnimalFace(ctx, type, x, y, size * 0.98, anim);
    ctx.restore();
  }

  /* ---------------- 动物专属粒子符号 ---------------- */
  const GLYPHS = [
    'paw',   // 兔兔：爪印
    'note',  // 喵喵：音符
    'heart', // 熊熊：爱心
    'bubble',// 熊猫：泡泡
    'pig',   // 猪猪：爱心圈
    'leaf',  // 蛙蛙：荷叶
    'bone',  // 狗狗：骨头
    'spark', // 小鸡：星星闪
    'leaf2', // 狐狸：枫叶
    'snow',  // 企鹅：雪花
    'flower',// 考拉：小花
    'bean',  // 猴子：果子
  ];

  function drawGlyph(ctx, kind, x, y, r, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (kind === 'paw') {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.25, r * 0.46, r * 0.38, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.5;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.6 - r * 0.1, r * 0.19, r * 0.24, a, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 'note') {
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.6);
      ctx.lineTo(r * 0.1, r * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-r * 0.22, r * 0.5, r * 0.3, r * 0.22, -0.3, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.6);
      ctx.quadraticCurveTo(r * 0.7, -r * 0.4, r * 0.45, r * 0.05);
      ctx.lineWidth = r * 0.16;
      ctx.stroke();
    } else if (kind === 'heart') {
      heartPath(ctx, 0, 0, r * 0.9);
      ctx.fill();
    } else if (kind === 'bubble') {
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.4;
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.28, r * 0.18, 0, TAU);
      ctx.fill();
    } else if (kind === 'pig') {
      ctx.lineWidth = r * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.66, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.22, r * 0.1, r * 0.11, 0, TAU);
      ctx.arc(r * 0.22, r * 0.1, r * 0.11, 0, TAU);
      ctx.fill();
    } else if (kind === 'leaf' || kind === 'leaf2') {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.6, 0, 0, r * 0.7);
      ctx.quadraticCurveTo(-r * 0.6, 0, 0, -r * 0.7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(0, r * 0.6);
      ctx.stroke();
    } else if (kind === 'bone') {
      ctx.lineWidth = r * 0.26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.4);
      ctx.lineTo(r * 0.42, r * 0.4);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const sx = i < 2 ? -1 : 1;
        const sy = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.arc(sx * r * 0.52, sy * r * 0.52, r * 0.24, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 'spark') {
      starPath(ctx, 0, 0, r * 0.85, r * 0.32, 0);
      ctx.fill();
    } else if (kind === 'snow') {
      ctx.lineWidth = r * 0.14;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(a) * r * 0.7, -Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.stroke();
      }
    } else if (kind === 'flower') {
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, r * 0.32, r * 0.24, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, TAU);
      ctx.fill();
    } else if (kind === 'bean') {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.42, r * 0.6, 0.5, 0, TAU);
      ctx.fill();
    } else {
      starPath(ctx, 0, 0, r * 0.8, r * 0.35, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  function AnimalGame(opts) {
    opts = opts || {};
    this.opts = opts;
    this.storage = opts.storage || null;
    this.width = opts.width || 0;
    this.height = opts.height || 0;
    this.nav = null;

    this.best = this._loadBest();
    this.bestLevel = this._loadBestLevel();
    this.time = 0;
    this.capacity = CAPACITY;

    this.tiles = [];
    this.tray = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.ambient = [];

    this._layout();
    this._initSparkles();
    this.reset();
  }

  AnimalGame.prototype._loadBest = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('animal.best'), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  };

  AnimalGame.prototype._loadBestLevel = function () {
    try {
      const v = parseInt(this.storage && this.storage.get('animal.level'), 10);
      return isNaN(v) ? 1 : v;
    } catch (e) {
      return 1;
    }
  };

  AnimalGame.prototype._save = function () {
    try {
      if (this.storage) {
        this.storage.set('animal.best', String(this.best));
        this.storage.set('animal.level', String(this.bestLevel));
      }
    } catch (e) {
      /* ignore */
    }
  };

  // BGM 紧凑度随关卡提升：第 1 关休闲，之后逐步紧凑
  AnimalGame.prototype._syncIntensity = function () {
    if (!this.opts.audio) return;
    const v = this.level <= 1 ? 0.12 : Math.min(0.92, 0.52 + (this.level - 2) * 0.08);
    this.opts.audio.setIntensity(v);
  };

  /* ----------------------------- 布局 ----------------------------- */
  AnimalGame.prototype._layout = function () {
    const w = this.width;
    const h = this.height;
    this.pad = Math.max(12, w * 0.05);
    this.hudH = Math.max(64, h * 0.105);
    this.basketH = Math.max(74, h * 0.145);
    this.basketTop = h - this.basketH - this.pad * 0.4;

    const boardTopY = this.hudH + 8;
    const boardBottomY = this.basketTop - 14;
    const cols = 6;
    const rows = 6;
    const S = Math.min((w - this.pad * 2) / cols, (boardBottomY - boardTopY) / rows) * 0.98;
    this.tileSize = S;
    this.gridCols = cols;
    this.gridRows = rows;
    this.gridLeft = (w - cols * S) / 2;
    this.gridTop = boardTopY + ((boardBottomY - boardTopY) - rows * S) / 2;

    this.slotSize = Math.min((w - this.pad * 2) / CAPACITY - 6, this.basketH * 0.66);
    this.slotGap = Math.min(8, this.slotSize * 0.16);
    const totalW = CAPACITY * this.slotSize + (CAPACITY - 1) * this.slotGap;
    this.trayLeft = (w - totalW) / 2;
    this.trayTop = this.basketTop + (this.basketH - this.slotSize) / 2 + 6;
    this.trayCenterX = w / 2;
    this.trayCenterY = this.trayTop + this.slotSize / 2;
  };

  AnimalGame.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    this._layout();
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t.state === 'board') {
        const p = this._cellPos(t.col, t.row, t.z);
        t.x = p.x;
        t.y = p.y;
      }
    }
  };

  AnimalGame.prototype._cellPos = function (col, row, z) {
    const S = this.tileSize;
    const off = S * 0.08;
    return {
      x: this.gridLeft + col * S + S / 2 + z * off,
      y: this.gridTop + row * S + S / 2 - z * off,
    };
  };

  /* ----------------------------- 关卡 ----------------------------- */
  AnimalGame.prototype.reset = function () {
    this._layout();
    this.tiles = [];
    this.tray = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.ambient = [];
    this.score = 0;
    this.combo = 0;
    this.lastMatch = -9;
    this.level = 1;
    this.state = 'play';
    this.magicUses = 3;
    this._genBoard();
    this._syncIntensity();
  };

  AnimalGame.prototype.onEnter = function () {
    this.reset();
  };

  AnimalGame.prototype._genBoard = function () {
    this.tiles = [];
    const cfg = levelConfig(this.level);
    this.typeCount = cfg.types;

    const cols = this.gridCols;
    const rows = this.gridRows;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const corner = (c === 0 || c === cols - 1) && (r === 0 || r === rows - 1);
        if (corner) continue;
        cells.push([c, r]);
      }
    }

    const target = Math.min(cfg.tiles, cells.length * cfg.depth);
    const depthOf = {};
    const positions = [];
    let remain = target;
    let guard = 0;
    while (remain > 0 && guard < 8000) {
      guard++;
      let totalW = 0;
      const weights = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i][0];
        const r = cells[i][1];
        const d = depthOf[c + ',' + r] || 0;
        if (d >= cfg.depth) {
          weights.push(0);
          continue;
        }
        const cx = Math.abs(c - (cols - 1) / 2) / cols;
        const cy = Math.abs(r - (rows - 1) / 2) / rows;
        const center = 1 - Math.min(1, cx + cy);
        const wgt = 0.35 + center * 1.8;
        weights.push(wgt);
        totalW += wgt;
      }
      if (totalW <= 0) break;
      let pick = Math.random() * totalW;
      let idx = 0;
      for (let i = 0; i < weights.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          idx = i;
          break;
        }
      }
      const c = cells[idx][0];
      const r = cells[idx][1];
      const key = c + ',' + r;
      const d = depthOf[key] || 0;
      depthOf[key] = d + 1;
      positions.push([c, r, d]);
      remain--;
    }
    while (positions.length % 3 !== 0) positions.pop();

    // 花色按「三张一组」分配再打乱，保证一定可消
    const triples = positions.length / 3;
    const typeList = [];
    for (let t = 0; t < triples; t++) {
      const ty = t % this.typeCount;
      typeList.push(ty, ty, ty);
    }
    shuffleArr(typeList);

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const pos = this._cellPos(p[0], p[1], p[2]);
      this.tiles.push({
        col: p[0],
        row: p[1],
        z: p[2],
        type: typeList[i],
        x: pos.x,
        y: pos.y,
        state: 'board',
        spawnT: Math.random() * 0.25,
        fly: null,
        phase: Math.random() * TAU,
        blinkAt: 1.5 + Math.random() * 4,
        blinkT: 0,
        pop: 0,
        tilt: 0,
      });
    }

    this.tiles.sort(function (a, b) {
      if (a.z !== b.z) return a.z - b.z;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  };

  /* ----------------------------- 交互 ----------------------------- */
  AnimalGame.prototype._hitRect = function (r, x, y) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };

  AnimalGame.prototype._isTop = function (tile) {
    const arr = this.tiles;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (t.state === 'board' && t.col === tile.col && t.row === tile.row && t.z > tile.z) {
        return false;
      }
    }
    return true;
  };

  AnimalGame.prototype._pickAt = function (x, y) {
    const half = this.tileSize * 0.46;
    let best = null;
    const arr = this.tiles;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (t.state !== 'board') continue;
      if (Math.abs(x - t.x) > half || Math.abs(y - t.y) > half) continue;
      if (!this._isTop(t)) continue;
      if (!best || t.z > best.z) best = t;
    }
    return best;
  };

  AnimalGame.prototype.pointerDown = function (x, y) {
    if (this.state === 'levelup') {
      if (this._hitRect(this._nextRect, x, y)) {
        this._sound('tap');
        this.level += 1;
        if (this.level > this.bestLevel) {
          this.bestLevel = this.level;
          this._save();
        }
        this.state = 'play';
        this._genBoard();
        this.tray = [];
        this._syncIntensity();
      } else if (this._hitRect(this._homeRect, x, y)) {
        this._sound('tap');
        if (this.nav) this.nav.back();
      }
      return;
    }

    if (this.state === 'over') {
      if (this._hitRect(this._retryRect, x, y)) {
        this._sound('tap');
        this.reset();
      } else if (this._hitRect(this._homeRect, x, y)) {
        this._sound('tap');
        if (this.nav) this.nav.back();
      }
      return;
    }

    if (this._hitRect(this._backRect, x, y)) {
      this._sound('tap');
      if (this.nav) this.nav.back();
      return;
    }

    if (this._hitRect(this._magicRect, x, y)) {
      if (this.magicUses > 0) this._magic();
      return;
    }

    const t = this._pickAt(x, y);
    if (t) this._selectTile(t);
  };

  AnimalGame.prototype.pointerMove = function () {};
  AnimalGame.prototype.pointerUp = function () {};

  AnimalGame.prototype._magic = function () {
    this.magicUses -= 1;
    const types = [];
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].state === 'board') types.push(this.tiles[i].type);
    }
    shuffleArr(types);
    let k = 0;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].state === 'board') this.tiles[i].type = types[k++];
    }
    this._burst(this.trayCenterX, this.trayCenterY, '#ffd93d', 'star');
    this._sound('whoosh');
  };

  AnimalGame.prototype._selectTile = function (t) {
    let flying = 0;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].state === 'flying') flying += 1;
    }
    if (this.tray.length + flying >= this.capacity) {
      this._gameOver();
      return;
    }
    const slotIndex = Math.min(this.tray.length + flying, this.capacity - 1);
    const tx = this.trayLeft + slotIndex * (this.slotSize + this.slotGap) + this.slotSize / 2;
    const ty = this.trayTop + this.slotSize / 2;
    t.state = 'flying';
    t.fly = { t: 0, dur: 0.3, x0: t.x, y0: t.y, x1: tx, y1: ty };
    t.sqx = 1.18;
    t.sqy = 0.78;
    t.tilt = 0;

    // 点击瞬间的弹跳圈 + 小星星
    this._popRing(t.x, t.y, ANIMALS[t.type].accent);
    this._burst(t.x, t.y, ANIMALS[t.type].accent, 'glyph', t.type);
    this._sound('pop');
    this._playAnimal(t.type);
  };

  // 点击反馈：扩散圆环
  AnimalGame.prototype._popRing = function (x, y, color) {
    this.rings = this.rings || [];
    this.rings.push({ x: x, y: y, r: 6, spd: 180, life: 0.4, max: 0.4, color: color });
  };

  AnimalGame.prototype._afterArrive = function (t) {
    t.state = 'tray';
    this.tray.push(t);
    this._resolveMatches();
    if (this.state !== 'play') return;
    if (this.tray.length >= this.capacity) {
      this._gameOver();
      return;
    }
    this._checkClear();
  };

  AnimalGame.prototype._resolveMatches = function () {
    let loops = 0;
    while (loops++ < 6) {
      const counts = {};
      for (let i = 0; i < this.tray.length; i++) {
        const ty = this.tray[i].type;
        counts[ty] = (counts[ty] || 0) + 1;
      }
      let found = -1;
      for (const k in counts) {
        if (counts[k] >= 3) {
          found = parseInt(k, 10);
          break;
        }
      }
      if (found < 0) break;

      let removed = 0;
      for (let i = this.tray.length - 1; i >= 0 && removed < 3; i--) {
        if (this.tray[i].type === found) {
          this.tray[i].state = 'gone';
          this.tray.splice(i, 1);
          removed += 1;
        }
      }

      if (this.time - this.lastMatch < 1.2) this.combo += 1;
      else this.combo = 1;
      this.lastMatch = this.time;

      const pts = 100 * this.combo;
      this.score += pts;
      this._burst(this.trayCenterX, this.trayCenterY, ANIMALS[found].accent, 'glyph', found);
      this._text('+' + pts, ANIMALS[found].accent, this.trayCenterX, this.trayCenterY - 26);
      if (this.combo > 1) {
        this._text('COMBO x' + this.combo, '#ff7fa8', this.trayCenterX, this.trayCenterY - 56);
      }
      this._playAnimal(found);
      this._sound('match');
    }
  };

  AnimalGame.prototype._checkClear = function () {
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t.state === 'board' || t.state === 'flying') return;
    }
    this.state = 'levelup';
    this.score += 300 + this.level * 100;
    if (this.score > this.best) {
      this.best = this.score;
      this._save();
    }
    this._burst(this.width / 2, this.height * 0.42, '#ff89a8', 'confetti');
    this._sound('levelup');

    // 彩带雨：从顶部持续落下
    this.rainTimer = 0;
  };

  AnimalGame.prototype._gameOver = function () {
    if (this.state === 'over') return;
    this.state = 'over';
    if (this.score > this.best) {
      this.best = this.score;
      this._save();
    }
    this._sound('over');
  };

  AnimalGame.prototype._sound = function (name, level) {
    if (this.opts.sound) {
      try {
        this.opts.sound(name, level);
      } catch (e) {
        /* ignore */
      }
    }
  };

  // 播放某只动物的叫声：优先真实录音，失败回退合成音
  AnimalGame.prototype._playAnimal = function (type) {
    const audio = this.opts.audio;
    if (audio && audio.playSample) {
      const key = ANIMAL_SFX[type] || 'cat';
      // 轻微随机音高，避免连续同款完全一致
      const rate = 0.94 + Math.random() * 0.12;
      if (audio.playSample(key, 0.85, rate)) return;
    }
    this._sound('animal', type);
  };

  /* ----------------------------- 特效 ----------------------------- */
  AnimalGame.prototype._burst = function (x, y, color, kind, type) {
    const n = kind === 'confetti' ? 30 : kind === 'rain' ? 3 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const spd = 70 + Math.random() * 220;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 70,
        g: 520,
        r: (kind === 'rain' ? 5 : 4) + Math.random() * 5,
        life: 0.6 + Math.random() * 0.5,
        max: 1.1,
        color: color,
        kind: kind || 'glyph',
        glyph: type != null ? GLYPHS[type] : 'heart',
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 9,
      });
    }
  };

  AnimalGame.prototype._text = function (text, color, x, y) {
    this.texts.push({ text: text, color: color, x: x, y: y, life: 0.9, max: 0.9, vy: 46, born: this.time });
  };

  AnimalGame.prototype.update = function (dt) {
    if (dt > 0.05) dt = 0.05;
    this.time += dt;

    this.ambientTimer = (this.ambientTimer || 0) + dt;
    if (this.ambientTimer > 0.55) {
      this.ambientTimer = 0;
      const kinds = ['bubble', 'note', 'spark', 'heart', 'flower', 'leaf'];
      const colors = ['#ffb3c6', '#a8e6c9', '#ffe08a', '#b9e4f7', '#d4c9f7', '#ffc2a8'];
      const k = Math.floor(Math.random() * kinds.length);
      this.ambient.push({
        x: Math.random() * this.width,
        y: this.height + 12,
        vy: -(16 + Math.random() * 18),
        r: 4 + Math.random() * 5,
        a: 0.45,
        ph: Math.random() * TAU,
        color: colors[k],
        glyph: kinds[k],
        rot: Math.random() * TAU,
      });
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const p = this.ambient[i];
      p.y += p.vy * dt;
      p.x += Math.sin(this.time * 1.2 + p.ph) * 10 * dt;
      p.rot += dt * 0.8;
      if (p.y < -20) this.ambient.splice(i, 1);
    }

    // 结算时的彩带雨
    if (this.state === 'levelup') {
      this.rainTimer = (this.rainTimer || 0) + dt;
      if (this.rainTimer > 0.06) {
        this.rainTimer = 0;
        const rc = ['#ff89a8', '#ffd93d', '#8ef0a0', '#7de8ff', '#c9a4ff'][Math.floor(Math.random() * 5)];
        this.particles.push({
          x: Math.random() * this.width,
          y: -10,
          vx: (Math.random() - 0.5) * 30,
          vy: 60 + Math.random() * 60,
          g: 40,
          r: 4 + Math.random() * 4,
          life: 2.2,
          max: 2.2,
          color: rc,
          kind: 'confetti',
          rot: Math.random() * TAU,
          spin: (Math.random() - 0.5) * 7,
        });
      }
    }

    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t.state === 'flying' && t.fly) {
        t.fly.t += dt / t.fly.dur;
        const k = clamp(t.fly.t, 0, 1);
        const e = easeOutCubic(k);
        t.x = t.fly.x0 + (t.fly.x1 - t.fly.x0) * e;
        t.y = t.fly.y0 + (t.fly.y1 - t.fly.y0) * e - Math.sin(Math.PI * k) * 60;
        // 飞行中旋转 + 挤压拉伸
        t.tilt = Math.sin(Math.PI * k) * 0.5;
        const stretch = Math.sin(Math.PI * k);
        t.sqx = 1 + stretch * 0.22;
        t.sqy = 1 - stretch * 0.16;
        // 拖尾
        if (Math.random() < dt * 30) {
          this.particles.push({
            x: t.x,
            y: t.y,
            vx: (Math.random() - 0.5) * 30,
            vy: 20 + Math.random() * 30,
            g: 120,
            r: this.tileSize * 0.13,
            life: 0.35,
            max: 0.35,
            color: ANIMALS[t.type].accent,
            kind: 'puff',
            rot: 0,
            spin: 0,
          });
        }
        if (t.fly.t >= 1) {
          t.fly = null;
          t.pop = 1;
          this._afterArrive(t);
        }
      } else if (t.state === 'board') {
        if (t.spawnT < 0.3) t.spawnT += dt;

        // 呼吸起伏
        const br = Math.sin(this.time * 1.9 + t.phase);
        t.sqy = 1 + br * 0.045;
        t.sqx = 1 - br * 0.045;
        // 偶尔歪头
        t.tilt = Math.sin(this.time * 0.7 + t.phase * 1.3) * 0.07;

        // 偶尔蹦跳一下（让棋盘活起来）
        t.hopT = (t.hopT || 0) + dt;
        if (t.hopT > t.hopNext) {
          t.hopT = 0;
          t.hopNext = 4 + Math.random() * 9;
          t.hopping = 0.45;
        }
        if (t.hopping > 0) {
          t.hopping -= dt;
          const hp = Math.sin((1 - t.hopping / 0.45) * Math.PI);
          t.sqy = 1 + hp * 0.16;
          t.sqx = 1 - hp * 0.12;
          t.tilt = Math.sin(this.time * 0.7 + t.phase * 1.3) * 0.07 + hp * 0.22 * (t.phase > Math.PI ? 1 : -1);
        }

        // 眨眼
        t.blinkT += dt;
        if (t.blinkT > t.blinkAt) {
          t.blinkT = 0;
          t.blinkAt = 2 + Math.random() * 5;
          t.blinking = 0.18;
        }
        if (t.blinking > 0) {
          t.blinking -= dt;
          t.blink = 1 - Math.abs(t.blinking - 0.09) / 0.09;
          if (t.blinking <= 0) t.blink = 0;
        }

        // 被压住的小动物偶尔探头
        if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 3);
      } else if (t.state === 'tray') {
        const br = Math.sin(this.time * 2.6 + t.phase);
        t.sqy = 1 + br * 0.06;
        t.sqx = 1 - br * 0.06;
        t.tilt = Math.sin(this.time * 1.3 + t.phase) * 0.09;
      }
    }

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

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y -= t.vy * dt;
    }

    // 扩散圆环
    for (let i = (this.rings || []).length - 1; i >= 0; i--) {
      const rr = this.rings[i];
      rr.life -= dt;
      if (rr.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      rr.r += rr.spd * dt;
    }
  };

  /* ----------------------------- 绘制 ----------------------------- */
  AnimalGame.prototype.render = function (ctx) {
    this._bg(ctx);
    this._board(ctx);
    this._basket(ctx);
    this._particles(ctx);
    this._texts(ctx);
    this._hud(ctx);
    if (this.state === 'levelup') this._levelUp(ctx);
    else if (this.state === 'over') this._over(ctx);
  };

  AnimalGame.prototype._bg = function (ctx) {
    const w = this.width;
    const h = this.height;

    // 若已加载主题背景图：铺底 + 视差漂移 + 动态光效
    if (this.bgImage && this.bgImage.width) {
      const iw = this.bgImage.width;
      const ih = this.bgImage.height;
      const scale = Math.max(w / iw, h / ih) * 1.06;
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (w - dw) / 2 + Math.sin(this.time * 0.16) * 6;
      const dy = (h - dh) / 2 + Math.cos(this.time * 0.12) * 5;
      ctx.drawImage(this.bgImage, dx, dy, dw, dh);

      // 缓慢呼吸的暖色光罩
      const warm = ctx.createLinearGradient(0, 0, 0, h);
      warm.addColorStop(0, 'rgba(255,255,255,0.10)');
      warm.addColorStop(0.5, 'rgba(255,255,255,0)');
      warm.addColorStop(1, 'rgba(120,200,150,0.10)');
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, w, h);

      // 太阳位置的旋转光芒
      this._sunRays(ctx, w * 0.2, h * 0.13, 0.22);
      // 缓慢飘过的云
      this._driftClouds(ctx);
      // 闪耀的星点/花粉
      this._sparkleLayer(ctx);
      this._ambientLayer(ctx);
      return;
    }

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffeef6');
    g.addColorStop(0.45, '#eaf6ff');
    g.addColorStop(0.8, '#f2ffe9');
    g.addColorStop(1, '#eafbe3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 旋转的太阳光芒
    ctx.save();
    ctx.translate(w * 0.18, h * 0.11);
    ctx.rotate(this.time * 0.12);
    ctx.globalAlpha = 0.16;
    const rays = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.75);
    rays.addColorStop(0, 'rgba(255,240,170,0.95)');
    rays.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = rays;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const a = (i * TAU) / 8;
      ctx.lineTo(Math.cos(a - 0.07) * w * 0.75, Math.sin(a - 0.07) * w * 0.75);
      ctx.lineTo(Math.cos(a + 0.07) * w * 0.75, Math.sin(a + 0.07) * w * 0.75);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 会笑的太阳
    const sx = w * 0.18;
    const sy = h * 0.11;
    const sr = Math.min(w, h) * 0.05;
    ctx.save();
    ctx.fillStyle = 'rgba(255,235,150,0.9)';
    ctx.shadowColor = 'rgba(255,220,90,0.8)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,180,80,0.95)';
    ctx.beginPath();
    ctx.arc(sx - sr * 0.3, sy - sr * 0.15, sr * 0.09, 0, TAU);
    ctx.arc(sx + sr * 0.3, sy - sr * 0.15, sr * 0.09, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,150,60,0.95)';
    ctx.lineWidth = Math.max(1.5, sr * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sx, sy + sr * 0.12, sr * 0.36, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();

    const glow = ctx.createRadialGradient(w * 0.25, h * 0.12, 0, w * 0.25, h * 0.12, w * 0.85);
    glow.addColorStop(0, 'rgba(255,255,255,0.6)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h * 0.6);

    this._cloud(ctx, w * 0.2, h * 0.2, 1.0, 0.5);
    this._cloud(ctx, w * 0.8, h * 0.34, 0.75, 0.38);
    this._cloud(ctx, w * 0.52, h * 0.56, 0.6, 0.26);

    // 远山 + 近草坡（视差）
    ctx.save();
    ctx.fillStyle = 'rgba(150,215,175,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.86);
    for (let x = 0; x <= w; x += 12) {
      const y = h * 0.84 + Math.sin(x * 0.012 + this.time * 0.25) * h * 0.012;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const gr = ctx.createLinearGradient(0, h * 0.8, 0, h);
    gr.addColorStop(0, 'rgba(190,240,190,0)');
    gr.addColorStop(1, 'rgba(160,225,170,0.6)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, h * 0.8, w, h * 0.2);

    // 会摆动的草
    ctx.save();
    ctx.strokeStyle = 'rgba(120,200,140,0.55)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const blades = 22;
    for (let i = 0; i < blades; i++) {
      const bx = ((i + 0.5) / blades) * w + Math.sin(this.time * 0.6 + i) * 3;
      const by = h - 4;
      const sway = Math.sin(this.time * 1.8 + i * 0.9) * 6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + sway * 0.5, by - 12, bx + sway, by - 20);
      ctx.stroke();
    }
    ctx.restore();

    // 漂浮的活泼元素
    this._ambientLayer(ctx);
  };

  AnimalGame.prototype._ambientLayer = function (ctx) {
    for (let i = 0; i < this.ambient.length; i++) {
      const p = this.ambient[i];
      ctx.globalAlpha = p.a;
      if (p.glyph === 'bubble') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = p.a * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.22, 0, TAU);
        ctx.fill();
      } else if (p.glyph === 'note') {
        drawGlyph(ctx, 'note', p.x, p.y, p.r * 1.4, p.rot, p.color);
      } else if (p.glyph === 'spark') {
        drawGlyph(ctx, 'spark', p.x, p.y, p.r * 1.2, p.rot, p.color);
      } else {
        drawGlyph(ctx, p.glyph, p.x, p.y, p.r * 1.3, p.rot, p.color);
      }
    }
    ctx.globalAlpha = 1;
  };

  AnimalGame.prototype._sunRays = function (ctx, cx, cy, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.1);
    ctx.globalAlpha = alpha;
    const r = Math.max(this.width, this.height);
    const rays = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
    rays.addColorStop(0, 'rgba(255,244,180,0.95)');
    rays.addColorStop(1, 'rgba(255,244,180,0)');
    ctx.fillStyle = rays;
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.05) * r * 0.6, Math.sin(a - 0.05) * r * 0.6);
      ctx.lineTo(Math.cos(a + 0.05) * r * 0.6, Math.sin(a + 0.05) * r * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  AnimalGame.prototype._driftClouds = function (ctx) {
    const w = this.width;
    const h = this.height;
    const span = w + 300;
    for (let i = 0; i < 3; i++) {
      const speed = 12 + i * 6;
      const x = ((this.time * speed + i * 320) % span) - 150;
      const y = h * (0.16 + i * 0.06);
      const s = 30 + i * 12;
      ctx.save();
      ctx.globalAlpha = 0.35 - i * 0.06;
      ctx.fillStyle = '#ffffff';
      const puffs = [[-1, 0, 0.85], [0, -0.3, 1.05], [0.95, 0, 0.8], [0.42, 0.2, 0.7], [-0.55, 0.2, 0.68]];
      ctx.beginPath();
      for (const p of puffs) {
        ctx.moveTo(x + p[0] * s + p[2] * s, y + p[1] * s);
        ctx.arc(x + p[0] * s, y + p[1] * s, p[2] * s, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  };

  AnimalGame.prototype._sparkleLayer = function (ctx) {
    if (!this.sparkles) return;
    for (let i = 0; i < this.sparkles.length; i++) {
      const s = this.sparkles[i];
      s.y -= s.vy * 0.016;
      s.ph += 0.016;
      if (s.y < -6) {
        s.y = this.height + 6;
        s.x = Math.random() * this.width;
      }
      const a = 0.3 + 0.5 * Math.abs(Math.sin(s.ph * 2.2));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      const r = s.r * (0.7 + 0.3 * Math.sin(s.ph * 3));
      starPath(ctx, s.x, s.y, r, r * 0.4, s.ph);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // 设置主题背景图
  AnimalGame.prototype.setBackground = function (img) {
    this.bgImage = img;
  };

  AnimalGame.prototype._initSparkles = function () {
    this.sparkles = [];
    const n = 22;
    const colors = ['#ffffff', '#fff4c0', '#ffd0e6', '#c9f0ff'];
    for (let i = 0; i < n; i++) {
      this.sparkles.push({
        x: Math.random() * (this.width || 400),
        y: Math.random() * (this.height || 800),
        r: 2 + Math.random() * 3.5,
        vy: 8 + Math.random() * 18,
        ph: Math.random() * TAU,
        color: colors[i % colors.length],
      });
    }
  };

  AnimalGame.prototype._cloud = function (ctx, x, y, s, alpha) {
    const drift = Math.sin(this.time * 0.25 + x * 0.01) * 8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    const r = 16 * s;
    const puffs = [
      [-r, 0, r * 0.85],
      [0, -r * 0.28, r * 1.05],
      [r * 0.95, 0, r * 0.8],
      [r * 0.4, r * 0.2, r * 0.7],
      [-r * 0.55, r * 0.18, r * 0.68],
    ];
    ctx.beginPath();
    for (let i = 0; i < puffs.length; i++) {
      ctx.moveTo(x + drift + puffs[i][0] + puffs[i][2], y + puffs[i][1]);
      ctx.arc(x + drift + puffs[i][0], y + puffs[i][1], puffs[i][2], 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  };

  AnimalGame.prototype._board = function (ctx) {
    const arr = this.tiles;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (t.state !== 'board' && t.state !== 'flying') continue;
      const isTop = t.state === 'flying' ? true : this._isTop(t);
      const pop = t.state === 'flying' ? 1 : t.spawnT < 0.28 ? 0.6 + 0.4 * easeOutBack(t.spawnT / 0.28) : 1;

      // 被压住的小动物微微探头 + 头顶小气泡提示
      let y = t.y;
      let lift = 0;
      if (t.state === 'board' && !isTop) {
        lift = Math.sin(this.time * 2.4 + t.phase) * 0.06 + 0.04;
        y -= this.tileSize * lift;
      }

      const anim = {
        blink: t.blink || 0,
        tilt: t.tilt || 0,
        squashX: t.sqx || 1,
        squashY: t.sqy || 1,
      };

      drawAnimalTile(ctx, t.x, y, this.tileSize * pop, t.type, isTop ? 1 : 0.82, anim);

      // 探头的小气泡
      if (lift > 0.05) {
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.25 * Math.sin(this.time * 3 + t.phase);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(t.x + this.tileSize * 0.2, y - this.tileSize * 0.36, this.tileSize * 0.06, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x + this.tileSize * 0.28, y - this.tileSize * 0.47, this.tileSize * 0.04, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  AnimalGame.prototype._basket = function (ctx) {
    const Ts = this.slotSize;
    const gap = this.slotGap;
    const x0 = this.trayLeft;
    const y0 = this.trayTop;

    ctx.save();
    const bx = x0 - 12;
    const by = y0 - 8;
    const bw = CAPACITY * Ts + (CAPACITY - 1) * gap + 24;
    const bh = Ts + 26;
    roundRect(ctx, bx, by, bw, bh, 20);
    const g = ctx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(226,240,228,0.95)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(120,170,140,0.35)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 20);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < CAPACITY; i++) {
      const x = this.trayLeft + i * (Ts + gap);
      ctx.save();
      roundRect(ctx, x, y0, Ts, Ts, Ts * 0.24);
      ctx.fillStyle = 'rgba(160,190,175,0.16)';
      ctx.fill();
      ctx.setLineDash && ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(140,175,160,0.4)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < this.tray.length; i++) {
      const t = this.tray[i];
      const x = this.trayLeft + i * (Ts + gap) + Ts / 2;
      const y = y0 + Ts / 2;
      // 落槽弹跳
      let pop = 1;
      if (t.pop > 0) {
        pop = 1 + Math.sin(t.pop * Math.PI) * 0.35;
      }
      drawAnimalTile(ctx, x, y - (t.pop > 0 ? Math.sin(t.pop * Math.PI) * Ts * 0.22 : 0), Ts * pop, t.type, 1, {
        blink: t.blink || 0,
        tilt: t.tilt || 0,
        squashX: t.sqx || 1,
        squashY: t.sqy || 1,
      });
      let same = 0;
      for (let k = 0; k < this.tray.length; k++) if (this.tray[k].type === t.type) same++;
      if (same > 1) {
        ctx.save();
        ctx.fillStyle = '#ff89a8';
        circle(ctx, x + Ts * 0.36, y - Ts * 0.36, Ts * 0.2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.round(Ts * 0.26) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(same), x + Ts * 0.36, y - Ts * 0.35);
        ctx.restore();
      }
    }
  };

  AnimalGame.prototype._particles = function (ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a;

      if (p.kind === 'puff') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 1.6), 0, TAU);
        ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r * 0.5, -p.r * 0.22, p.r, p.r * 0.44);
        ctx.restore();
      } else if (p.kind === 'glyph') {
        drawGlyph(ctx, p.glyph || 'heart', p.x, p.y, p.r, p.rot, p.color);
      } else {
        drawGlyph(ctx, p.kind, p.x, p.y, p.r, p.rot, p.color);
      }
    }
    ctx.globalAlpha = 1;

    // 扩散圆环
    for (let i = 0; i < (this.rings || []).length; i++) {
      const rr = this.rings[i];
      ctx.globalAlpha = Math.max(0, rr.life / rr.max) * 0.8;
      ctx.strokeStyle = rr.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rr.x, rr.y, rr.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  AnimalGame.prototype._texts = function (ctx) {
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      const k = Math.max(0, Math.min(1, t.life / t.max));
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 弹跳放大
      const age = 1 - k;
      const sc = 1 + Math.sin(Math.min(1, age * 3) * Math.PI) * 0.35;
      ctx.font = 'bold ' + Math.round(22 * sc) + 'px ' + FONT;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  AnimalGame.prototype._hud = function (ctx) {
    const w = this.width;
    const pad = this.pad;

    ctx.save();
    roundRect(ctx, pad, 10, 104, 40, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.shadowColor = 'rgba(120,160,190,0.3)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ff89a8';
    heartPath(ctx, pad + 22, 30, 9);
    ctx.fill();
    ctx.fillStyle = '#5b4a63';
    ctx.font = 'bold 19px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.score), pad + 38, 31);

    // 连击指示器：跳动的小火焰 + 倍率
    if (this.combo > 1 && this.time - this.lastMatch < 1.4) {
      const k = (this.time - this.lastMatch) / 1.4;
      const bounce = Math.sin(this.time * 9) * 3;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = '#ff7f4d';
      const fx = pad + 96;
      const fy = 26 + bounce;
      ctx.beginPath();
      ctx.moveTo(fx, fy - 9);
      ctx.quadraticCurveTo(fx + 6, fy - 1, fx + 3, fy + 5);
      ctx.quadraticCurveTo(fx, fy + 8, fx - 4, fy + 4);
      ctx.quadraticCurveTo(fx - 7, fy, fx, fy - 9);
      ctx.fill();
      ctx.fillStyle = '#ffd93d';
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillText('x' + this.combo, fx + 9, 31);
      ctx.restore();
    }

    const bw = 104;
    const bx = (w - bw) / 2;
    ctx.save();
    roundRect(ctx, bx, 10, bw, 40, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(120,160,190,0.35)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffc24a';
    starPath(ctx, bx + 20, 30, 9, 4.2, Math.sin(this.time * 2) * 0.2);
    ctx.fill();
    ctx.fillStyle = '#5b4a63';
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('第 ' + this.level + ' 关', bx + 34, 31);

    const mw = 96;
    const mx = w - pad - mw;
    ctx.save();
    roundRect(ctx, mx, 10, mw, 40, 20);
    ctx.fillStyle = this.magicUses > 0 ? 'rgba(255,255,255,0.92)' : 'rgba(240,240,240,0.6)';
    ctx.shadowColor = 'rgba(120,160,190,0.3)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
    this._magicRect = { x: mx, y: 10, w: mw, h: 40 };
    drawWand(ctx, mx + 22, 30, 9);
    ctx.fillStyle = this.magicUses > 0 ? '#6a7bff' : '#b9b9c4';
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('魔法 ' + this.magicUses, mx + 38, 31);

    let remain = 0;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].state === 'board') remain += 1;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(90,110,120,0.75)';
    ctx.font = '13px ' + FONT;
    ctx.fillText('剩余 ' + remain + ' · 花色 ' + this.typeCount + ' 种 · 槽位 ' + this.tray.length + '/' + CAPACITY, w / 2, 62);

    this._backRect = { x: w - pad - 58, y: this.hudH - 4, w: 58, h: 26 };
    ctx.save();
    roundRect(ctx, this._backRect.x, this._backRect.y, 58, 26, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(90,110,120,0.9)';
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹ 首页', w - pad - 29, this.hudH + 9);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  AnimalGame.prototype._levelUp = function (ctx) {
    const w = this.width;
    const h = this.height;
    ctx.fillStyle = 'rgba(90,70,110,0.35)';
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(w * 0.84, 340);
    const ph = Math.min(h * 0.42, 320);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2 - 20;

    ctx.save();
    roundRect(ctx, px, py, pw, ph, 28);
    const g = ctx.createLinearGradient(px, py, px, py + ph);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(1, 'rgba(255,236,246,0.98)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,140,180,0.5)';
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < 5; i++) {
      const a = this.time * 1.4 + (i * TAU) / 5;
      const sx = w / 2 + Math.cos(a) * (pw * 0.36);
      const sy = py + 40 + Math.sin(a) * 16;
      ctx.fillStyle = 'rgba(255,200,80,' + (0.5 + 0.5 * Math.sin(a * 2)) + ')';
      starPath(ctx, sx, sy, 9, 4, a);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff89a8';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText('关卡达成！', w / 2, py + 76);

    ctx.fillStyle = 'rgba(120,100,130,0.8)';
    ctx.font = '14px ' + FONT;
    ctx.fillText('第 ' + this.level + ' 关完成 · 下一关难度提升', w / 2, py + 108);

    ctx.fillStyle = '#7a6a8a';
    ctx.font = '12px ' + FONT;
    ctx.fillText('本局得分', w / 2, py + 138);

    ctx.fillStyle = '#ff89a8';
    ctx.font = 'bold 42px ' + FONT;
    ctx.fillText(String(this.score), w / 2, py + 182);

    const bw = Math.min(pw * 0.72, 220);
    const bh = 50;
    const bx = w / 2 - bw / 2;
    const by = py + ph - bh - 26;
    this._nextRect = { x: bx, y: by, w: bw, h: bh };

    ctx.save();
    const bg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    bg.addColorStop(0, '#ffb3c6');
    bg.addColorStop(1, '#ffc24a');
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(255,150,180,0.6)';
    ctx.shadowBlur = 18;
    roundRect(ctx, bx, by, bw, bh, 25);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px ' + FONT;
    ctx.textBaseline = 'middle';
    ctx.fillText('下一关 →', w / 2, by + bh / 2 + 1);

    const hw = 160;
    const hx = w / 2 - hw / 2;
    const hy = by - 32;
    this._homeRect = { x: hx, y: hy, w: hw, h: 26 };
    ctx.fillStyle = 'rgba(140,120,150,0.8)';
    ctx.font = '14px ' + FONT;
    ctx.fillText('返回首页', w / 2, hy + 16);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  AnimalGame.prototype._over = function (ctx) {
    const w = this.width;
    const h = this.height;
    ctx.fillStyle = 'rgba(90,70,110,0.38)';
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(w * 0.84, 340);
    const ph = Math.min(h * 0.42, 320);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2 - 10;

    ctx.save();
    roundRect(ctx, px, py, pw, ph, 28);
    const g = ctx.createLinearGradient(px, py, px, py + ph);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(1, 'rgba(238,240,255,0.98)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(150,160,220,0.5)';
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.restore();

    // 哭脸小动物
    const cx = w / 2;
    const cy = py + 56;
    ctx.fillStyle = '#ffe3ec';
    circle(ctx, cx, cy, 26);
    ctx.fill();
    ctx.fillStyle = '#5b4a63';
    circle(ctx, cx - 9, cy - 4, 3);
    ctx.fill();
    circle(ctx, cx + 9, cy - 4, 3);
    ctx.fill();
    ctx.strokeStyle = '#5b4a63';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + 12, 8, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,180,255,0.8)';
    ell(ctx, cx - 10, cy + 8, 3, 5);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7b6b8a';
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText('槽位塞满啦…', w / 2, py + 118);

    ctx.fillStyle = 'rgba(120,100,130,0.8)';
    ctx.font = '14px ' + FONT;
    ctx.fillText('到达第 ' + this.level + ' 关 · 最高 ' + this.bestLevel + ' 关', w / 2, py + 148);

    ctx.fillStyle = '#ff89a8';
    ctx.font = 'bold 40px ' + FONT;
    ctx.fillText(String(this.score), w / 2, py + 194);

    const bw = Math.min(pw * 0.72, 220);
    const bh = 50;
    const bx = w / 2 - bw / 2;
    const by = py + ph - bh - 26;
    this._retryRect = { x: bx, y: by, w: bw, h: bh };

    ctx.save();
    const bg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    bg.addColorStop(0, '#ffb3c6');
    bg.addColorStop(1, '#c9a4ff');
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(255,150,190,0.55)';
    ctx.shadowBlur = 18;
    roundRect(ctx, bx, by, bw, bh, 25);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px ' + FONT;
    ctx.textBaseline = 'middle';
    ctx.fillText('再试一次', w / 2, by + bh / 2 + 1);

    const hw = 160;
    const hx = w / 2 - hw / 2;
    const hy = by - 32;
    this._homeRect = { x: hx, y: hy, w: hw, h: 26 };
    ctx.fillStyle = 'rgba(140,120,150,0.8)';
    ctx.font = '14px ' + FONT;
    ctx.fillText('返回首页', w / 2, hy + 16);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  function drawWand(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.7);
    ctx.strokeStyle = '#c9a4ff';
    ctx.lineWidth = s * 0.32;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.6);
    ctx.lineTo(s * 0.5, -s * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#ffd93d';
    starPath(ctx, s * 0.6, -s * 0.6, s * 0.5, s * 0.22, 0);
    ctx.fill();
    ctx.restore();
  }

  return AnimalGame;
});
