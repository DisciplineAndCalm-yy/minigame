/*
 * 微信小游戏适配层：把 wx canvas / 触摸事件 / 存储 / WebAudio
 * 交给场景管理器 App，由它负责首页与各小游戏的切换。
 */
const AudioEngine = require('../core/audio.js');
const MergeGame = require('../core/game.js');
const SheepGame = require('../core/sheep.js');
const HomeScene = require('../core/home.js');
const App = require('../core/app.js');

const canvas = wx.createCanvas();
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const W = info.screenWidth;
const H = info.screenHeight;

canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');

/* ---------------- 本地存储 ---------------- */
const storage = {
  get(key) {
    try {
      const v = wx.getStorageSync(key);
      return v === '' || v === undefined ? null : v;
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      wx.setStorageSync(key, value);
    } catch (e) {
      /* ignore */
    }
  },
};

/* ---------------- 音频 ---------------- */
function createAudioContext() {
  if (!wx.createWebAudioContext) return null;
  return wx.createWebAudioContext();
}
const audio = new AudioEngine(createAudioContext);

// 真实动物叫声样本：微信端从本地包读取 ArrayBuffer
audio.setSampleLoader(function (path) {
  return new Promise(function (resolve, reject) {
    try {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath: path,
        success: function (res) {
          resolve(res.data);
        },
        fail: function (err) {
          reject(err);
        },
      });
    } catch (e) {
      reject(e);
    }
  });
}, 'assets/sfx/');
const ANIMAL_KEYS = ['rabbit', 'cat', 'bear', 'panda', 'pig', 'frog', 'dog', 'chicken', 'fox', 'penguin', 'sheep', 'monkey'];

function playSfx(name, level) {
  audio.sfx(name, level);
}

/* ---------------- 场景 ---------------- */
const scenes = {
  home: new HomeScene({ width: W, height: H, storage: storage, audio: audio }),
  merge: new MergeGame({ width: W, height: H, sound: playSfx, storage: storage, audio: audio }),
  sheep: new SheepGame({ width: W, height: H, sound: playSfx, storage: storage, audio: audio }),
};

const app = new App({ scenes: scenes, width: W, height: H, audio: audio, start: 'home' });

/* ---------------- 主题背景图 ---------------- */
function loadImage(src, onload) {
  if (!wx.createImage) return;
  const img = wx.createImage();
  img.onload = function () {
    if (onload) onload(img);
  };
  img.src = src;
  return img;
}
loadImage('assets/bg/bg-animal.jpg', function (img) {
  scenes.sheep.setBackground(img);
});
loadImage('assets/bg/bg-space.jpg', function (img) {
  scenes.merge.setBackground(img);
});

/* ---------------- 触摸输入 ---------------- */
let samplesLoaded = false;
wx.onTouchStart(function (e) {
  audio.unlock();
  if (!samplesLoaded) {
    samplesLoaded = true;
    audio.loadSamples(ANIMAL_KEYS);
  }
  const t = e.touches && e.touches[0];
  if (t) app.pointerDown(t.clientX, t.clientY);
});

wx.onTouchMove(function (e) {
  const t = e.touches && e.touches[0];
  if (t) app.pointerMove(t.clientX, t.clientY);
});

wx.onTouchEnd(function (e) {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  if (t) app.pointerUp(t.clientX, t.clientY);
  else app.pointerUp();
});

wx.onTouchCancel(function () {
  app.pointerUp();
});

/* ---------------- 主循环 ---------------- */
let last = Date.now();
function loop() {
  const now = Date.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  app.update(dt);
  app.render(ctx);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
