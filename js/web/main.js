/*
 * 网页版适配层：把 DOM canvas / Pointer 事件 / WebAudio / localStorage
 * 交给场景管理器 App，并同步页脚播放器（曲目名 / 静音按钮）。
 */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const trackEl = document.getElementById('trackName');
  const footbar = document.getElementById('footbar');
  const muteBtn = document.getElementById('muteBtn');

  /* ---------------- 本地存储 ---------------- */
  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        /* ignore */
      }
    },
  };

  /* ---------------- 音频 ---------------- */
  function createAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    return new AC();
  }
  const audio = new window.AudioEngine(createAudioContext);

  function playSfx(name, level) {
    audio.sfx(name, level);
  }

  /* ---------------- 真实动物叫声样本加载 ---------------- */
  audio.setSampleLoader(function (path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('fetch ' + path);
      return r.arrayBuffer();
    });
  }, 'assets/sfx/');
  const ANIMAL_KEYS = ['rabbit', 'cat', 'bear', 'panda', 'pig', 'frog', 'dog', 'chicken', 'fox', 'penguin', 'sheep', 'monkey'];

  /* ---------------- 尺寸 ---------------- */
  let dpr = 1;
  function measure() {
    const rect = canvas.getBoundingClientRect();
    return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
  }
  const size = measure();

  /* ---------------- 场景 ---------------- */
  const scenes = {
    home: new window.HomeScene({ width: size.w, height: size.h, storage: storage, audio: audio }),
    merge: new window.MergeGame({
      width: size.w,
      height: size.h,
      sound: playSfx,
      storage: storage,
      audio: audio,
    }),
    sheep: new window.SheepGame({
      width: size.w,
      height: size.h,
      sound: playSfx,
      storage: storage,
      audio: audio,
    }),
  };

  /* ---------------- 主题背景图 ---------------- */
  function loadImage(src, onload) {
    const img = new window.Image();
    img.onload = function () {
      if (onload) onload(img);
    };
    img.src = src;
    return img;
  }
  const bgAnimal = loadImage('assets/bg/bg-animal.jpg', function (img) {
    scenes.sheep.setBackground(img);
  });
  const bgSpace = loadImage('assets/bg/bg-space.jpg', function (img) {
    scenes.merge.setBackground(img);
  });

  function onSceneChange(name, track) {
    if (trackEl) trackEl.textContent = audio.trackTitle(track);
    if (footbar) footbar.classList.add('playing');
  }

  const app = new window.App({
    scenes: scenes,
    width: size.w,
    height: size.h,
    audio: audio,
    start: 'home',
    onSceneChange: onSceneChange,
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    app.resize(w, h);
  }

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- 指针输入 ---------------- */
  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  let samplesLoaded = false;
  function unlockAudio() {
    audio.unlock();
    if (footbar) footbar.classList.add('playing');
    if (!samplesLoaded) {
      samplesLoaded = true;
      audio.loadSamples(ANIMAL_KEYS);
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    unlockAudio();
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    const p = toLocal(e);
    app.pointerDown(p.x, p.y);
  });

  canvas.addEventListener('pointermove', function (e) {
    const p = toLocal(e);
    app.pointerMove(p.x, p.y);
  });

  canvas.addEventListener('pointerup', function (e) {
    const p = toLocal(e);
    app.pointerUp(p.x, p.y);
  });

  canvas.addEventListener('pointercancel', function () {
    app.pointerUp();
  });

  /* ---------------- 页脚静音按钮 ---------------- */
  let lastMuted = null;
  function syncMuteButton() {
    const muted = audio.isMuted();
    if (muted === lastMuted) return;
    lastMuted = muted;
    if (muteBtn) {
      muteBtn.textContent = muted ? '🔇' : '🔊';
      muteBtn.classList.toggle('off', muted);
    }
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      unlockAudio();
      audio.toggleMute();
      syncMuteButton();
    });
  }

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;

    app.update(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    app.render(ctx);

    syncMuteButton();

    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

  window.__app = app;
  window.__audio = audio;
})();
