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
    this.trackByScene = { home: 'menu', merge: 'sci', sheep: 'cute' };
    this.currentName = null;

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

    const track = this.trackByScene[name] || 'menu';
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

  App.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
    for (const key in this.scenes) {
      const scene = this.scenes[key];
      if (scene && scene.resize) scene.resize(w, h);
    }
  };

  App.prototype.update = function (dt) {
    const scene = this.scenes[this.currentName];
    if (scene && scene.update) scene.update(dt);
  };

  App.prototype.render = function (ctx) {
    const scene = this.scenes[this.currentName];
    if (scene && scene.render) scene.render(ctx);
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
