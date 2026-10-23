/*
 * 场景管理器：在「首页 / 星际合成 / 咩咩消消乐」之间切换，
 * 转发输入与渲染，并在切换场景时自动切换背景音乐。
 */
(function (factory) {
  const App = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = App;
  }
  const g =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof GameGlobal !== 'undefined'
        ? GameGlobal
        : typeof window !== 'undefined'
          ? window
          : this;
  if (g) g.App = App;
})(function () {
  'use strict';

  function App(opts) {
    opts = opts || {};
    this.scenes = opts.scenes || {};
    this.width = opts.width || 0;
    this.height = opts.height || 0;
    this.audio = opts.audio || null;
    this.onSceneChange = opts.onSceneChange || null;
    // 每个场景可用的 BGM 列表：首次进入用第一个，之后可通过切歌按钮轮换
    this.tracksByScene = {
      home: ['menu', 'victory'],
      merge: ['sci', 'neon'],
      sheep: ['cute', 'cozy'],
      lumina: ['puzzle', 'menu'],
      dash: ['action', 'neon'],
      quest: ['adventure', 'action'],
    };
    this.trackByScene = { home: 'menu', merge: 'sci', sheep: 'cute', lumina: 'puzzle', dash: 'action', quest: 'adventure' };
    this.trackIndex = {};
    this.currentName = null;
    this.transT = 0;
    this.transDur = 0.42;

    const self = this;
    const nav = {
      goto: function (name) {
        self.goto(name);
      },
      back: function () {
        self.goto('home');
      },
    };

    for (const key in this.scenes) {
      const scene = this.scenes[key];
      if (!scene) continue;
      scene.nav = nav;
      if (scene.resize) scene.resize(this.width, this.height);
    }

    this.goto(opts.start || 'home');
  }

  App.prototype.goto = function (name) {
    const scene = this.scenes[name];
    if (!scene) return;
    if (this.currentName === name) return;

    const prev = this.scenes[this.currentName];
    if (prev && prev.onExit) prev.onExit();

    this.currentName = name;
    if (scene.onEnter) scene.onEnter();
    this.transT = this.transDur; // 触发切换过渡

    // 首次进入该场景用首选曲目；trackByScene 作为“该场景默认曲目”的引用
    const list = this.tracksByScene[name] || ['menu'];
    if (this.trackIndex[name] == null) this.trackIndex[name] = 0;
    const track = list[this.trackIndex[name] % list.length];
    this.trackByScene[name] = track;

    if (this.audio) {
      if (name === 'home') this.audio.setIntensity(0.12);
      this.audio.playTrack(track);
    }
    if (this.onSceneChange) {
      try {
        this.onSceneChange(name, track);
      } catch (e) {
        /* ignore */
      }
    }
  };

  // 轮换当前场景的 BGM（供页脚“切歌”按钮调用），返回新曲目名
  App.prototype.nextTrack = function () {
    const name = this.currentName;
    const list = this.tracksByScene[name];
    if (!list || list.length <= 1) return this.trackByScene[name];
    this.trackIndex[name] = ((this.trackIndex[name] || 0) + 1) % list.length;
    const track = list[this.trackIndex[name]];
    this.trackByScene[name] = track;
    if (this.audio) this.audio.playTrack(track);
    if (this.onSceneChange) {
      try {
        this.onSceneChange(name, track);
      } catch (e) {
        /* ignore */
      }
    }
    return track;
  };

  App.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    for (const key in this.scenes) {
      const scene = this.scenes[key];
      if (scene && scene.resize) scene.resize(w, h);
    }
  };

  App.prototype.update = function (dt) {
    if (this.transT > 0) this.transT -= dt;
    const scene = this.scenes[this.currentName];
    if (scene && scene.update) scene.update(dt);
  };

  App.prototype.render = function (ctx) {
    const scene = this.scenes[this.currentName];
    if (scene && scene.render) scene.render(ctx);

    // 场景切换过渡：进入瞬间从上向下扫过一层柔光 + 轻微黑场渐隐，提升切换质感
    if (this.transT > 0) {
      const dur = this.transDur || 0.42;
      const k = 1 - this.transT / dur; // 0→1
      // 黑场：开头不透明，迅速淡出
      const black = Math.max(0, 1 - k * 2.4) * 0.55;
      if (black > 0.001) {
        ctx.fillStyle = 'rgba(2,6,18,' + black + ')';
        ctx.fillRect(0, 0, this.width, this.height);
      }
      // 扫光带
      const bandY = k * (this.height + 200) - 100;
      const g = ctx.createLinearGradient(0, bandY - 80, 0, bandY + 80);
      g.addColorStop(0, 'rgba(125,232,255,0)');
      g.addColorStop(0.5, 'rgba(125,232,255,' + (0.18 * (1 - k)) + ')');
      g.addColorStop(1, 'rgba(179,155,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, bandY - 80, this.width, 160);
    }
  };

  App.prototype.pointerDown = function (x, y) {
    const scene = this.scenes[this.currentName];
    if (scene && scene.pointerDown) scene.pointerDown(x, y);
  };

  App.prototype.pointerMove = function (x, y) {
    const scene = this.scenes[this.currentName];
    if (scene && scene.pointerMove) scene.pointerMove(x, y);
  };

  App.prototype.pointerUp = function (x, y) {
    const scene = this.scenes[this.currentName];
    if (scene && scene.pointerUp) scene.pointerUp(x, y);
  };

  return App;
});
