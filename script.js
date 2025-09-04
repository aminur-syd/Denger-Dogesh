(() => {
  const W = 420, H = 640;
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let scaleX = 1, scaleY = 1;
  const TARGET_FPS = 60;
  const FIXED_DT = 1 / TARGET_FPS;
  const MIN_RENDER_MS = 1000 / TARGET_FPS;
  let accMs = 0;
  let lastTimeMs = 0;
  let lastRenderMs = 0;
  let bc, bctx, bufDpr = 1;
  const GRAD = { sky: null, sun: null };
  const SUN = { x: W - 80, y: 110, r: 42 };
  function computeBufDpr() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    return isFS ? 1.75 : 1;
  }

  function createBackBuffer() {
    bufDpr = computeBufDpr();
    bc = document.createElement('canvas');
    bc.width = Math.round(W * bufDpr);
    bc.height = Math.round(H * bufDpr);
    bctx = bc.getContext('2d');
    bctx.setTransform(bufDpr, 0, 0, bufDpr, 0, 0);
    bctx.imageSmoothingEnabled = false;
    const sky = bctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ffd9a3');
    sky.addColorStop(0.55, '#f2e6c8');
    sky.addColorStop(1, '#ebe7df');
    GRAD.sky = sky;
    const sun = bctx.createRadialGradient(SUN.x, SUN.y, 8, SUN.x, SUN.y, SUN.r);
    sun.addColorStop(0, 'rgba(255,230,150,0.95)');
    sun.addColorStop(1, 'rgba(255,230,150,0)');
    GRAD.sun = sun;
    if (typeof drawRoadDamage === 'function') drawRoadDamage._cache = new Map();
  }
  function resizeCanvas() {
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.floor(rect.width || W));
    const cssH = Math.max(1, Math.floor(rect.height || H));
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    scaleX = c.width / W;
    scaleY = c.height / H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const desired = computeBufDpr();
    if (Math.abs(desired - bufDpr) > 0.01) {
      createBackBuffer();
    } else if (typeof drawRoadDamage === 'function') {
      drawRoadDamage._cache = new Map();
    }
  }
  function applyFullscreenLayout() {
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (fs) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let targetW = vw;
      let targetH = Math.round(targetW * H / W);
      if (targetH > vh) {
        targetH = vh;
        targetW = Math.round(targetH * W / H);
      }
      c.style.width = targetW + 'px';
      c.style.height = targetH + 'px';
    } else {
      c.style.width = '';
      c.style.height = '';
    }
    resizeCanvas();
  }
  function renderFrame() {
    draw(bctx);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bc, 0, 0, c.width, c.height);
    if (score !== lastScoreDrawn) {
      if (scoreEl) scoreEl.textContent = String(score);
      lastScoreDrawn = score;
    }
  }
  function onFullscreenChange() {
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('is-fullscreen', fs);
    if (fsBtn) fsBtn.textContent = fs ? 'Exit Fullscreen' : 'Fullscreen';
    createBackBuffer();
    applyFullscreenLayout();
  }
  window.addEventListener('resize', () => { applyFullscreenLayout(); if (!running) renderFrame(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { applyFullscreenLayout(); if (!running) renderFrame(); }, 60));
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  c.addEventListener('contextmenu', e => e.preventDefault());
  const scoreEl = document.getElementById('score');
  const restartBtn = document.getElementById('restart');
  const fsBtn = document.getElementById('fullscreen');
  const exitFsBtn = document.getElementById('exit-fs');
  const goOverlay = document.getElementById('gameover-overlay');
  const goScoreEl = document.getElementById('go-score');
  const goRestartBtn = document.getElementById('go-restart');
  const introOverlay = document.getElementById('intro-overlay');
  const BUILD_CACHE = new Map();

  const GROUND_Y = H - 90;
  const FOOTPATH_H = 18;
  const RUN_Y = GROUND_Y - FOOTPATH_H;
  const GRAVITY = 1500;
  const JUMP_V = -650;
  const BASE_SPEED = 200;
  const ACCEL = 5;
  const COYOTE_TIME = 0.18;
  const JUMP_BUFFER = 0.18;
  const SPRITE_FRAMES = 0;
  const SPRITE_FPS = 12;
  const MIN_OBS_GAP = 100;
  const ROAD_SEG_W = 110;

  const dogImg = new Image();
  dogImg.src = 'essentials/dog.png';
  const DOG_SPRITE = { ready: false, frames: 1, fw: 0, fh: 0 };
  dogImg.onload = () => {
    const ratio = dogImg.width / dogImg.height;
    const inferred = Math.max(1, Math.round(ratio));
    const frames = Math.max(1, SPRITE_FRAMES || inferred);
    DOG_SPRITE.frames = frames;
    DOG_SPRITE.fw = Math.floor(dogImg.width / frames);
    DOG_SPRITE.fh = dogImg.height;
    DOG_SPRITE.ready = true;
    const aspect = DOG_SPRITE.fw / DOG_SPRITE.fh;
    if (isFinite(aspect) && aspect > 0) {
      dog.w = Math.round(dog.h * aspect);
    }
    if (!running && introOverlay && introOverlay.classList.contains('show')) {
      draw(bctx);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bc, 0, 0, c.width, c.height);
    }
  };

  const goAudio = new Audio();
  goAudio.src = 'essentials/game-over-sound.mp3';
  goAudio.preload = 'auto';
  goAudio.volume = 0.6;
  let goPlayed = false;
  let goTimer = null;
  let ac;
  let audioUnlocked = false;
  const JUMP_SRC = 'essentials/Dog jump.mp3';
  const JUMP_POOL_SIZE = 6;
  const jumpPool = Array.from({ length: JUMP_POOL_SIZE }, () => {
    const a = new Audio();
    a.src = JUMP_SRC;
    a.preload = 'auto';
    a.volume = 0.65;
    return a;
  });
  let jumpIdx = 0;
  function unlockAudioOnce() {
    if (audioUnlocked) return; audioUnlocked = true;
    try {
      const prev = goAudio.volume; goAudio.volume = 0;
      const p = goAudio.play();
      if (p && p.then) p.then(() => { goAudio.pause(); goAudio.currentTime = 0; goAudio.volume = prev; }).catch(() => { goAudio.volume = prev; });
    } catch(_) {}
    try { ac && ac.state === 'suspended' && ac.resume(); } catch(_) {}
    try {
      for (const a of jumpPool) {
        const pv = a.volume; a.volume = 0;
        const pr = a.play();
        if (pr && pr.then) pr.then(() => { a.pause(); a.currentTime = 0; a.volume = pv; }).catch(() => { a.volume = pv; });
      }
    } catch(_) {}
  }
  window.addEventListener('keydown', unlockAudioOnce, { once: true });
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
  function fallbackBeep() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(440, ac.currentTime);
      g.gain.setValueAtTime(0.001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.26);
    } catch (_) {}
  }
  function playJumpSound() {
    try {
      const a = jumpPool[jumpIdx++ % JUMP_POOL_SIZE];
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }
  function playGameOver() {
    if (goPlayed) return;
    const start = 3.0, end = 7.0;
    const startPlayback = () => {
      try {
        const clipEnd = isFinite(goAudio.duration) ? Math.min(end, goAudio.duration) : end;
        goAudio.pause();
        goAudio.currentTime = start;
        const p = goAudio.play();
        if (p && p.catch) p.catch(() => fallbackBeep());
        const onTU = () => {
          if (goAudio.currentTime >= clipEnd) {
            goAudio.pause();
            goAudio.removeEventListener('timeupdate', onTU);
            if (goTimer) { clearTimeout(goTimer); goTimer = null; }
          }
        };
        goAudio.addEventListener('timeupdate', onTU);
        if (goTimer) clearTimeout(goTimer);
        goTimer = setTimeout(() => { onTU(); }, (clipEnd - start + 0.1) * 1000);
      } catch (_) { fallbackBeep(); }
    };
    if (isFinite(goAudio.duration) && goAudio.duration > 0) startPlayback();
    else if (goAudio.readyState >= 1) startPlayback();
    else goAudio.addEventListener('loadedmetadata', startPlayback, { once: true });
    goPlayed = true;
  }

  let running = false, gameOver = false, tPrev = 0, lastSpawn = 0;
  let elapsed = 0, obstaclesPassed = 0, score = 0, speed = BASE_SPEED;
  let worldX = 0;
  let clouds = [];
  let lastScoreDrawn = -1;
  let highScore = 0;
  try {
    const hs = localStorage.getItem('dd_highscore');
    if (hs) highScore = Math.max(0, parseInt(hs, 10) || 0);
  } catch (_) {}

  const dog = { x: 64, y: RUN_Y - 70, w: 98, h: 100, vy: 0, onGround: true, leg: 0 };
  const obstacles = [];
  let coyoteT = 0, jumpBufT = 0;
  let animClock = 0;

  const keys = new Set();
  window.addEventListener('keydown', e => {
    if ([' ', 'Space', 'ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); jumpBufT = JUMP_BUFFER; }
    keys.add(e.key);
    if (e.key === 'r' || e.key === 'R') restart();
  });
  window.addEventListener('keyup', e => {
    if ([' ', 'Space', 'ArrowUp', 'w', 'W'].includes(e.key) && dog.vy < 0) {
      dog.vy *= 0.55;
    }
    keys.delete(e.key);
  });
  restartBtn.addEventListener('click', restart);
  if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
  if (exitFsBtn) exitFsBtn.addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  });
  if (goRestartBtn) goRestartBtn.addEventListener('click', restart);

  let lastTapTime = 0;
  function onPointerDown(e) {
    e.preventDefault();
  if (introOverlay && introOverlay.classList.contains('show')) return;
    const now = performance.now();
    if (gameOver && now - lastTapTime < 350) {
      restart();
      lastTapTime = 0;
      return;
    }
    lastTapTime = now;
    jumpBufT = JUMP_BUFFER;
  }
  function onPointerUp(e) {
    e.preventDefault();
  if (introOverlay && introOverlay.classList.contains('show')) return;
    if (dog.vy < 0) dog.vy *= 0.55;
  }
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointerup', onPointerUp);

  function startFromIntro() {
    if (introOverlay && introOverlay.classList.contains('show')) {
      introOverlay.classList.remove('show');
      restart();
    }
  }
  window.addEventListener('pointerdown', startFromIntro);
  window.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && introOverlay && introOverlay.classList.contains('show')) {
      e.preventDefault(); startFromIntro();
    }
  });

  function doJump() {
    dog.vy = JUMP_V;
    dog.onGround = false;
    coyoteT = 0; jumpBufT = 0;
    playJumpSound();
  }

  function restart() {
    running = true; gameOver = false; tPrev = performance.now(); lastSpawn = 0;
    elapsed = 0; obstaclesPassed = 0; score = 0; speed = BASE_SPEED;
    dog.x = 64; dog.y = RUN_Y - dog.h; dog.vy = 0; dog.onGround = true; dog.leg = 0;
    obstacles.length = 0;
    initClouds();
    if (goTimer) { clearTimeout(goTimer); goTimer = null; }
    goAudio.pause();
    goPlayed = false;
  if (goOverlay) { goOverlay.hidden = true; goOverlay.classList.remove('show'); }
  document.body.classList.add('is-playing');
  if (scoreEl) scoreEl.textContent = '0';
  accMs = 0; lastTimeMs = 0; lastRenderMs = 0;
  requestAnimationFrame(tick);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rectsOverlap(a, b) { return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y); }
  function insetRect(x, y, w, h, l, t, r, b) {
    const nx = x + l;
    const ny = y + t;
    const nw = Math.max(1, w - l - r);
    const nh = Math.max(1, h - t - b);
    return { x: nx, y: ny, w: nw, h: nh };
  }
  function getDogHitbox(d) {
    const l = Math.max(8, Math.floor(d.w * 0.14));
    const r = l;
    const t = Math.max(8, Math.floor(d.h * 0.12));
    const b = Math.max(6, Math.floor(d.h * 0.10));
    return insetRect(d.x, d.y, d.w, d.h, l, t, r, b);
  }
  function getObstacleHitbox(o) {
    if (o.kind === 'gap') {
      return { x: o.x, y: RUN_Y - 2, w: o.w, h: 4 };
    }
    const baseL = Math.max(4, Math.floor(o.w * 0.12));
    const baseR = baseL;
    const baseT = Math.max(6, Math.floor(o.h * 0.18));
    const baseB = Math.max(4, Math.floor(o.h * 0.08));
    return insetRect(o.x, o.y, o.w, o.h, baseL, baseT, baseR, baseB);
  }
  function spawnObstacle() {
    const r = Math.random();
    const last = obstacles.length ? obstacles[obstacles.length - 1] : null;
    let o;
    if (r < 0.35) {
      const w = 34 + Math.random() * 26;
      const h = 46 + Math.random() * 24;
      const color = ['#d24141', '#3d72d8', '#2db36b', '#d6922f', '#7a4bd6'][Math.floor(Math.random() * 5)];
      o = { kind: 'vacuum', w, h, y: RUN_Y - h, color };
    } else if (r < 0.65) {
      const w = 24 + Math.random() * 36;
      const h = 16 + Math.random() * 22;
      const tone = ['#6c6860', '#7a756b', '#5d5a54', '#706a62'][Math.floor(Math.random() * 4)];
      o = { kind: 'stone', w, h, y: RUN_Y - h, color: tone, variant: Math.floor(Math.random() * 3) };
    } else if (r < 0.9) {
      const w = 26 + Math.random() * 16;
      const h = 18 + Math.random() * 10;
      const squash = 0.8 + Math.random() * 0.25;
      const skew = (Math.random() * 2 - 1) * 0.18;
      o = { kind: 'bag', w, h, y: RUN_Y - h, alpha: 0.9, squash, skew };
    } else {
      const w = 44 + Math.random() * 50;
      const depth = 12 + Math.random() * 8;
      o = { kind: 'gap', w, h: depth, y: RUN_Y - Math.min(8, depth), depth };
    }
    const baseX = W + o.w + Math.random() * 60;
    const minX = last ? (last.x + last.w + MIN_OBS_GAP) : baseX;
    o.x = Math.max(baseX, minX);
    obstacles.push(o);
  }

  function update(dt) {
    elapsed += dt;
    speed = BASE_SPEED + elapsed * ACCEL;
    worldX += speed * dt;
    updateClouds(dt);
    score = Math.floor(elapsed * 10) + obstaclesPassed;
    jumpBufT = Math.max(0, jumpBufT - dt);
    dog.vy += GRAVITY * dt;
    dog.y += dog.vy * dt;
    if (dog.y + dog.h >= RUN_Y) { dog.y = RUN_Y - dog.h; dog.vy = 0; dog.onGround = true; }
    else { dog.onGround = false; }
    animClock += dt * (dog.onGround ? Math.min(1.8, speed / BASE_SPEED) : 0.9);
    if (dog.onGround) coyoteT = COYOTE_TIME; else coyoteT = Math.max(0, coyoteT - dt);
    if (running && jumpBufT > 0 && (dog.onGround || coyoteT > 0)) doJump();
    dog.leg += (dog.onGround ? speed : speed * 0.4) * dt;
    lastSpawn += dt;
    const interval = Math.max(1.3, 2.6 - elapsed * 0.045);
    if (elapsed > 1.2 && lastSpawn > interval) { lastSpawn = 0; spawnObstacle(); }
    for (const o of obstacles) o.x -= speed * dt;
    for (const o of obstacles) {
      if (o.kind === 'bag') {
        o.t = (o.t || 0) + dt;
        const sq = (o.squash || 1);
        o.y = RUN_Y - o.h * sq;
      }
    }
    while (obstacles.length && obstacles[0].x + obstacles[0].w < -20) { obstacles.shift(); obstaclesPassed += 1; }
    for (const o of obstacles) {
      if (o.kind === 'gap') {
        const footY = dog.y + dog.h;
        if (footY >= RUN_Y - 1) {
          const footL = dog.x + dog.w * 0.25;
          const footR = dog.x + dog.w * 0.75;
          if (!(footR < o.x || (o.x + o.w) < footL)) { gameOver = true; running = false; }
        }
        continue;
      }
      const dhb = getDogHitbox(dog);
      const ohb = getObstacleHitbox(o);
      if (rectsOverlap(dhb, ohb)) { gameOver = true; running = false; }
    }
  }

  function tick(now) {
    if (!running) return;
    if (!lastTimeMs) lastTimeMs = now;
    let delta = now - lastTimeMs;
    if (delta > 250) delta = 250;
    lastTimeMs = now;
    accMs += delta;
    let steps = 0;
    while (accMs >= MIN_RENDER_MS && steps < 5) { update(FIXED_DT); accMs -= MIN_RENDER_MS; steps++; }
    if (now - lastRenderMs >= MIN_RENDER_MS - 0.5) { renderFrame(); lastRenderMs = now; }
    if (running) requestAnimationFrame(tick);
    else if (gameOver) {
      if (score > highScore) {
        highScore = score;
        try { localStorage.setItem('dd_highscore', String(highScore)); } catch (_) {}
      }
      playGameOver();
      if (goOverlay) {
        if (goScoreEl) goScoreEl.textContent = String(score);
        goOverlay.hidden = false;
        goOverlay.classList.add('show');
      }
      document.body.classList.remove('is-playing');
      renderFrame();
    }
  }

  function draw(ctx) {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = GRAD.sky || '#ebe7df';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = GRAD.sun || 'rgba(255,230,150,0.4)';
    ctx.beginPath();
    ctx.arc(SUN.x, SUN.y, SUN.r, 0, Math.PI * 2);
    ctx.fill();

    drawClouds(ctx);

    const tOffset = Math.floor((worldX * 0.35) % 120);
    for (let x = -140 - tOffset; x < W + 140; x += 120) {
      drawPalm(ctx, x, GROUND_Y - 18, 16);
    }

    const baseY = RUN_Y;
    const spacing = 148;
    const bOffset = Math.floor((worldX * 0.6) % spacing);
    const baseIdx = Math.floor(worldX * 0.6 / spacing);
    ctx.save();
    ctx.filter = document.body.classList.contains('is-fullscreen') ? 'none' : 'blur(1.2px)';
    ctx.globalAlpha = 0.96;
    for (let x = -spacing - bOffset, i = 0; x < W + spacing; x += spacing, i++) {
      const idx = baseIdx + i - 1;
      const palette = ['#e6d3b2','#d7e7e1','#f0d2d2','#e7e7f6'];
      const bw = 84 + (Math.abs(idx * 19) % 40);
      const bh = 96 + (Math.abs(idx * 23) % 60);
      const fill = palette[((idx % palette.length) + palette.length) % palette.length];
      const tile = getBuildingTile(idx, bw, bh, fill);
      ctx.drawImage(tile, x, baseY - bh);
    }
    ctx.restore();

    const FP_Y = GROUND_Y - FOOTPATH_H;
    ctx.fillStyle = '#312a26';
    ctx.fillRect(0, FP_Y - 2, W, 2);
    const stripeW = 16;
    const period = stripeW * 2;
    const stripeOffset = Math.floor((worldX * 0.6) % period);
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let x = -period - stripeOffset; x < W + period; x += period) {
      ctx.fillStyle = '#dec74a';
      ctx.fillRect(Math.floor(x), FP_Y, stripeW, FOOTPATH_H);
      ctx.fillStyle = '#eeeee8';
      ctx.fillRect(Math.floor(x + stripeW), FP_Y, stripeW, FOOTPATH_H);
    }
    ctx.restore();
    let gg = ctx.createLinearGradient(0, FP_Y, 0, FP_Y + FOOTPATH_H);
    gg.addColorStop(0, 'rgba(0,0,0,0.12)');
    gg.addColorStop(0.6, 'rgba(0,0,0,0.08)');
    gg.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, FP_Y, W, FOOTPATH_H);
    const segW = 96;
    const scroll = worldX * 0.6;
    const fpBaseIdx = Math.floor(scroll / segW);
    const fpOff = Math.floor(scroll % segW);
    const fpRngFunc = (seed) => new RNG(0x51ed1bad ^ (seed * 0x9e3779b1));
    for (let x = -segW - fpOff, i = 0; x < W + segW; x += segW, i++) {
      const fpRng = fpRngFunc(fpBaseIdx + i);
      const specks = fpRng.int(5, 10);
      for (let s = 0; s < specks; s++) {
        const sx = x + fpRng.range(0, segW);
        const sy = FP_Y + fpRng.range(2, FOOTPATH_H - 3);
        const sw = fpRng.range(2, 6);
        const sh = fpRng.range(1, 3);
        ctx.fillStyle = `rgba(0,0,0,${fpRng.range(0.08, 0.18)})`;
        ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.floor(sw), Math.floor(sh));
      }
      if (fpRng.next() < 0.6) {
        const sx = x + fpRng.range(4, segW - 12);
        const sy = FP_Y + fpRng.range(2, FOOTPATH_H - 4);
        const sw = fpRng.range(8, 18);
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.floor(sw), 2);
      }
    }

    ctx.fillStyle = '#353535';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    const laneY = GROUND_Y + Math.min(40, (H - GROUND_Y) * 0.45);
    const dashOffset = Math.floor((worldX * 0.6) % 56);
    ctx.fillStyle = '#ffffffb3';
    for (let x = -60 - dashOffset; x < W + 60; x += 56) {
      ctx.fillRect(x, laneY, 28, 4);
    }

    drawRoadDamage(ctx);

    drawDog(ctx, dog);

  for (const o of obstacles) drawObstacle(ctx, o);

    drawScore(ctx);
  }

  function drawPalm(ctx, x, baseY, h) {
    ctx.fillStyle = '#6b4f2a';
    ctx.fillRect(x, baseY - h, 3, h);
    ctx.fillStyle = '#3a6f3a';
    ctx.beginPath();
    ctx.moveTo(x + 1, baseY - h);
    ctx.quadraticCurveTo(x - 10, baseY - h - 8, x - 2, baseY - h + 2);
    ctx.quadraticCurveTo(x + 12, baseY - h - 8, x + 4, baseY - h + 2);
    ctx.fill();
  }

  function getBuildingTile(stableIndex, w, h, fill) {
    const key = `${stableIndex}:${Math.floor(w)}x${Math.floor(h)}:${fill}`;
    if (BUILD_CACHE.has(key)) return BUILD_CACHE.get(key);
    const tile = document.createElement('canvas');
    tile.width = Math.max(1, Math.floor(w));
    tile.height = Math.max(1, Math.floor(h));
    const t = tile.getContext('2d');
    t.fillStyle = fill;
    t.fillRect(0, 0, w, h);
    t.fillStyle = '#0000001a';
    t.fillRect(0, 0, w, 3);
    const seed = ((stableIndex|0) * 2654435761) ^ ((w|0) * 19349663) ^ ((h|0) * 83492791);
    const rng = new RNG(seed >>> 0);
    const g = t.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(120,90,60,0.08)');
    g.addColorStop(0.6, 'rgba(60,40,30,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.16)');
    t.fillStyle = g;
    t.fillRect(0, 0, w, h);
    const grimeCount = Math.max(4, Math.floor(h / 26));
    for (let i = 0; i < grimeCount; i++) {
      const gw = rng.range(10, Math.min(40, w * 0.6));
      const gh = rng.range(3, 12);
      const gx = rng.range(2, w - gw - 2);
      const gy = rng.range(8, h - gh - 8);
      t.fillStyle = `rgba(50,40,30,${rng.range(0.06, 0.16)})`;
      t.fillRect(gx, gy, gw, gh);
      if (rng.next() < 0.45) {
        const sx = gx + rng.range(-2, 2);
        const sl = rng.range(8, Math.min(24, h - gy));
        t.fillStyle = 'rgba(0,0,0,0.05)';
        t.fillRect(sx, gy, 2, sl);
      }
    }
    const cols = Math.max(3, Math.floor((w - 20) / 16));
    const rows = Math.max(4, Math.floor((h - 30) / 22));
    const cellW = (w - 20) / cols;
    const cellH = (h - 26) / rows;
    for (let ry = 0; ry < rows; ry++) {
      for (let cxI = 0; cxI < cols; cxI++) {
        const wx = 10 + cxI * cellW + 1;
        const wy = 8 + ry * cellH;
        const ww = Math.min(10, cellW * 0.55);
        const wh = Math.min(12, cellH * 0.55);
        const lit = rng.next() < 0.08;
        t.fillStyle = lit ? 'rgba(255,226,150,0.85)' : 'rgba(190,170,140,0.7)';
        t.fillRect(wx, wy, ww, wh);
        if (rng.next() < 0.22) {
          const bx = Math.floor(wx - 2);
          const by = Math.floor(wy + wh + 2);
          const bw2 = Math.max(12, Math.min(18, Math.floor(ww + 6)));
          const broken = rng.next() < 0.35;
          t.fillStyle = '#5b4a3d';
          t.fillRect(bx, by, bw2, 3);
          if (broken) {
            const notch = Math.floor(rng.range(3, Math.min(6, bw2 * 0.5)));
            t.fillStyle = '#3a312b';
            t.fillRect(bx + bw2 - notch, by, notch, 3);
          }
        }
      }
    }
    BUILD_CACHE.set(key, tile);
    return tile;
  }

  function drawDog(ctx, d) {
    if (DOG_SPRITE.ready) {
      if (DOG_SPRITE.frames > 1) {
        const idx = Math.floor(animClock * SPRITE_FPS) % DOG_SPRITE.frames;
        const sx = idx * DOG_SPRITE.fw;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(dogImg, sx, 0, DOG_SPRITE.fw, DOG_SPRITE.fh, Math.round(d.x), Math.round(d.y), Math.round(d.w), Math.round(d.h));
        ctx.restore();
      } else {
        const bobAmp = d.onGround ? 2 : 1;
        const bob = Math.sin(animClock * 10) * bobAmp;
        const drawY = Math.round(d.y + bob);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(dogImg, 0, 0, DOG_SPRITE.fw || dogImg.width, DOG_SPRITE.fh || dogImg.height,
          Math.round(d.x), drawY, Math.round(d.w), Math.round(d.h));
        ctx.restore();
        if (d.onGround) {
          const gait = Math.sin(animClock * 8);
          const pawY = drawY + d.h - 6;
          const baseW = Math.max(6, Math.floor(d.w * 0.14));
          const pawH = 4;
          const centerX = d.x + d.w * 0.5;
          const baseSpread = d.w * 0.18;
          const spreadAmp = d.w * 0.08;
          const spread = baseSpread + gait * spreadAmp;
          const leftX = Math.round(centerX - spread - baseW * (1 - 0.1 * gait) / 2);
          const rightX = Math.round(centerX + spread - baseW * (1 + 0.1 * gait) / 2);
          const leftW = Math.round(baseW * (1 - 0.1 * gait));
          const rightW = Math.round(baseW * (1 + 0.1 * gait));
          ctx.fillStyle = '#00000033';
          roundRect(ctx, leftX, pawY, leftW, pawH, 2, true);
          roundRect(ctx, rightX, pawY, rightW, pawH, 2, true);
        }
      }
      return;
    }
    ctx.fillStyle = '#90f1ff';
    roundRect(ctx, d.x, d.y, d.w, d.h, 6, true);
    ctx.fillStyle = '#7ad8e6';
    roundRect(ctx, d.x + d.w - 14, d.y - 10, 10, 12, 4, true);
    roundRect(ctx, d.x - 8, d.y + 6, 10, 6, 3, true);
    const phase = Math.sin(d.leg * 0.25);
    const legOff = d.onGround ? 3 : 1;
    ctx.fillStyle = '#74cfe0';
    roundRect(ctx, d.x + 10, d.y + d.h - 5, 10, 5 + legOff * (phase > 0 ? 1 : 0), 2, true);
    roundRect(ctx, d.x + d.w - 20, d.y + d.h - 5, 10, 5 + legOff * (phase < 0 ? 1 : 0), 2, true);
  }

  function drawObstacle(ctx, o) {
    switch (o.kind) {
      case 'vacuum':
        drawVacuum(ctx, o.x, o.y, o.w, o.h, o.color);
        break;
      case 'bag':
        drawPlasticBag(ctx, o.x, o.y, o.w, o.h, o.alpha || 0.9, o.squash || 1, o.skew || 0);
        break;
      case 'stone':
        drawStone(ctx, o.x, o.y, o.w, o.h, o.color, o.variant || 0);
        break;
      case 'gap':
        drawGap(ctx, o.x, o.w, o.h);
        break;
      default:
        drawVacuum(ctx, o.x, o.y, o.w, o.h, o.color);
        break;
    }
  }

  function drawVacuum(ctx, x, y, w, h, bodyColor = '#d24141') {
    const bx = x, by = y, bw = w, bh = h;
    const bodyH = bh * 0.55;
    const bodyY = by + (bh - bodyH);
    const r = Math.max(6, Math.min(12, bw * 0.25));
    ctx.save();
    ctx.fillStyle = bodyColor;
    roundRect(ctx, Math.floor(bx), Math.floor(bodyY), Math.floor(bw), Math.floor(bodyH), Math.floor(r), true);
    const g = ctx.createLinearGradient(bx, bodyY, bx, bodyY + bodyH);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g;
    roundRect(ctx, Math.floor(bx), Math.floor(bodyY), Math.floor(bw), Math.floor(bodyH), Math.floor(r), true);
    const wheelR = Math.max(3, Math.min(6, bw * 0.16));
    ctx.fillStyle = '#20242a';
    ctx.beginPath();
    ctx.arc(bx + bw * 0.22, by + bh - wheelR, wheelR, 0, Math.PI * 2);
    ctx.arc(bx + bw * 0.78, by + bh - wheelR, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b0b7c3';
    ctx.lineWidth = Math.max(2, Math.floor(bw * 0.08));
    ctx.lineCap = 'round';
    ctx.beginPath();
    const neckX = bx + bw * 0.6;
    const neckY = bodyY + bodyH * 0.25;
    ctx.moveTo(neckX, neckY);
    ctx.quadraticCurveTo(bx + bw * 0.85, bodyY - bh * 0.15, bx + bw * 0.4, bodyY - bh * 0.08);
    ctx.stroke();
    const nozW = Math.max(10, bw * 0.55);
    const nozH = Math.max(4, Math.min(8, bh * 0.12));
    const nozX = bx + bw * 0.12;
    const nozY = bodyY - nozH - 2;
    ctx.fillStyle = '#2d3340';
    roundRect(ctx, Math.floor(nozX), Math.floor(nozY), Math.floor(nozW), Math.floor(nozH), 3, true);
    ctx.fillStyle = '#9aa3b2';
    roundRect(ctx, Math.floor(bx + bw * 0.18), Math.floor(bodyY + bodyH * 0.1), Math.floor(bw * 0.64), Math.floor(bodyH * 0.22), Math.floor(r * 0.6), true);

    ctx.restore();
  }

  function drawPlasticBag(ctx, x, y, w, h, alpha, squash, skew) {
    ctx.save();
    const shH = 2;
    ctx.globalAlpha = 0.18 * alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, RUN_Y - 0.5, w * 0.46, shH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.transform(1, 0, skew, squash, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.25);
    ctx.quadraticCurveTo(w * 0.08, h * 0.08, w * 0.3, h * 0.03);
    ctx.lineTo(w * 0.36, h * 0.03);
    ctx.quadraticCurveTo(w * 0.38, h * 0.12, w * 0.4, h * 0.16);
    ctx.lineTo(w * 0.6, h * 0.16);
    ctx.quadraticCurveTo(w * 0.62, h * 0.08, w * 0.64, h * 0.03);
    ctx.lineTo(w * 0.7, h * 0.03);
    ctx.quadraticCurveTo(w * 0.92, h * 0.06, w * 0.78, h * 0.26);
    ctx.quadraticCurveTo(w * 0.94, h * 0.5, w * 0.82, h * 0.82);
    ctx.quadraticCurveTo(w * 0.58, h * 1.0, w * 0.34, h * 0.94);
    ctx.quadraticCurveTo(w * 0.12, h * 0.78, w * 0.18, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = Math.max(0.08, alpha - 0.28);
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.38);
    ctx.quadraticCurveTo(w * 0.52, h * 0.24, w * 0.66, h * 0.42);
    ctx.quadraticCurveTo(w * 0.52, h * 0.34, w * 0.4, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h * 0.62);
    ctx.quadraticCurveTo(w * 0.42, h * 0.7, w * 0.58, h * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawStone(ctx, x, y, w, h, color, variant) {
    ctx.save();
    const base = color || '#6c6860';
    ctx.fillStyle = base;
    const rx = x, ry = y, rw = w, rh = h;
    ctx.beginPath();
    const k = variant % 3;
    ctx.moveTo(rx, ry + rh);
    ctx.lineTo(rx, ry + rh * 0.45);
    if (k === 0) {
      ctx.quadraticCurveTo(rx + rw * 0.2, ry, rx + rw * 0.5, ry + rh * 0.2);
    } else if (k === 1) {
      ctx.quadraticCurveTo(rx + rw * 0.3, ry + rh * 0.1, rx + rw * 0.6, ry + rh * 0.22);
    } else {
      ctx.quadraticCurveTo(rx + rw * 0.15, ry + rh * 0.08, rx + rw * 0.55, ry + rh * 0.18);
    }
    ctx.quadraticCurveTo(rx + rw * 0.85, ry + rh * 0.35, rx + rw, ry + rh * 0.5);
    ctx.lineTo(rx + rw, ry + rh);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(rx, ry, rx, ry + rh);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawGap(ctx, oOrX, wMaybe, depthMaybe) {
    const isObj = typeof oOrX === 'object';
    const x = isObj ? oOrX.x : oOrX;
    const w = isObj ? oOrX.w : wMaybe;
    const depth = isObj ? (oOrX.depth || oOrX.h) : depthMaybe;
    const top = RUN_Y;
    const d = Math.max(8, depth || 12);
    ctx.save();
    const yTop = top - 1;
    const steps = Math.max(6, Math.floor(w / 10));
    const seed = ((Math.floor(x) * 2654435761) ^ 0x9e3779b9) >>> 0;
    let s = seed;
    const rand = () => (s = (1664525 * s + 1013904223) >>> 0, (s / 4294967296) - 0.5);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.floor(x + w * t);
      const jitter = Math.sin((t + (x % 7) * 0.37) * Math.PI * 3) * 3.0 + rand() * 1.4;
      const py = yTop + jitter;
      pts.push({ x: px, y: py });
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const cpx = pts[i].x;
      const cpy = pts[i].y;
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(cpx, cpy, mx, my);
    }
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    if (prev) ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
    ctx.lineTo(Math.floor(x + w), Math.floor(top + d));
    ctx.lineTo(Math.floor(x), Math.floor(top + d));
    ctx.closePath();
  ctx.fillStyle = '#0d0d10';
  ctx.fill();
  const lip = Math.min(4, d * 0.4);
  const lipGrad = ctx.createLinearGradient(0, yTop - 1, 0, yTop + lip + 1);
  lipGrad.addColorStop(0, 'rgba(230,230,220,0.28)');
  lipGrad.addColorStop(1, 'rgba(230,230,220,0.0)');
  ctx.fillStyle = lipGrad;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(Math.floor(x + w), yTop + lip);
  ctx.lineTo(Math.floor(x), yTop + lip);
  ctx.closePath();
  ctx.fill();
  const edgeGrad = ctx.createLinearGradient(0, top - 2, 0, top + 6);
  edgeGrad.addColorStop(0, 'rgba(255,255,255,0.14)');
  edgeGrad.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y + 1);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + 1);
  ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const rubbleN = Math.max(2, Math.floor(w / 32));
    for (let i = 0; i < rubbleN; i++) {
      const rx = Math.floor(x + 4 + (w - 8) * (i / rubbleN));
      const rw = 2 + ((i * 13) % 3);
      ctx.fillRect(rx, top - 2, rw, 2);
    }
    ctx.restore();
  }

  function drawScore(ctx) {
    if (document.body.classList.contains('is-fullscreen')) return;
    const text = `Score: ${score}`;
    const best = `Best: ${highScore}`;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = "700 22px 'Luckiest Guy', system-ui, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2b2b2b';
    ctx.fillStyle = '#ffe27a';
    ctx.strokeText(text, 10, 10);
    ctx.fillText(text, 10, 10);
    ctx.font = "700 18px 'Luckiest Guy', system-ui, sans-serif";
    ctx.strokeText(best, 10, 36);
    ctx.fillText(best, 10, 36);
    ctx.restore();
  }

  function initClouds() {
    clouds.length = 0;
    const bands = [
      { y: 70, speed: 12, scale: 1.1, alpha: 0.75 },
      { y: 130, speed: 18, scale: 1.0, alpha: 0.7 },
      { y: 180, speed: 24, scale: 0.9, alpha: 0.65 }
    ];
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b];
      for (let i = 0; i < 4; i++) {
        const w = 70 + Math.random() * 90;
        clouds.push({
          x: Math.random() * (W + 180) - 90,
          y: band.y + (Math.random() * 16 - 8),
          w,
          h: 22 + Math.random() * 10,
          speed: band.speed * (0.8 + Math.random() * 0.4),
          alpha: band.alpha * (0.85 + Math.random() * 0.3),
          scale: band.scale * (0.9 + Math.random() * 0.3)
        });
      }
    }
  }

  function updateClouds(dt) {
    const margin = 120;
    for (const cl of clouds) {
      cl.x -= cl.speed * dt;
      if (cl.x < -margin - cl.w) {
        cl.x = W + margin + Math.random() * 120;
        cl.y += (Math.random() * 14 - 7);
      }
      cl.y = Math.max(40, Math.min(220, cl.y));
    }
  }

  function drawClouds(ctx) {
    for (const cl of clouds) {
      ctx.globalAlpha = cl.alpha;
      ctx.fillStyle = '#ffffff';
      drawCloudShape(ctx, cl.x, cl.y, cl.w * cl.scale, cl.h * cl.scale);
      ctx.globalAlpha = 1;
    }
  }

  function drawCloudShape(ctx, x, y, w, h) {
    const r = h / 2;
    ctx.beginPath();
    ctx.arc(x + r * 1.2, y, r, Math.PI * 0.2, Math.PI * 1.2);
    ctx.arc(x + r * 2.1, y - r * 0.4, r * 1.1, Math.PI * 0.9, Math.PI * 1.8);
    ctx.arc(x + r * 3.2, y - r * 0.1, r * 0.9, Math.PI, Math.PI * 1.95);
    ctx.arc(x + w - r * 1.2, y + r * 0.1, r * 0.95, Math.PI * 1.3, Math.PI * 2);
    ctx.lineTo(x + w - r * 0.8, y + r * 0.9);
    ctx.quadraticCurveTo(x + w * 0.5, y + r * 1.2, x + r * 0.6, y + r * 0.9);
    ctx.closePath();
    ctx.fill();
  }

  function RNG(seed) { this.s = seed >>> 0; }
  RNG.prototype.next = function() { this.s = (1664525 * this.s + 1013904223) >>> 0; return this.s / 4294967296; };
  RNG.prototype.range = function(a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function(a, b) { return Math.floor(this.range(a, b + 1)); };

  function drawRoadDamage(ctx) {
    const top = GROUND_Y;
    const bottom = H;
    const roadH = bottom - top;
    const segW = ROAD_SEG_W;
    const scroll = worldX * 0.6;
    const baseIdx = Math.floor(scroll / segW);
    const offset = Math.floor(scroll % segW);
    const cache = (drawRoadDamage._cache = drawRoadDamage._cache || new Map());
    const getTile = (idx) => {
      if (cache.has(idx)) return cache.get(idx);
      const rng = new RNG(0x9e3779b9 ^ (idx * 0x85ebca6b));
      const tile = document.createElement('canvas');
      tile.width = Math.max(1, Math.floor(segW * bufDpr));
      tile.height = Math.max(1, Math.floor(roadH * bufDpr));
      const tctx = tile.getContext('2d');
      tctx.setTransform(bufDpr, 0, 0, bufDpr, 0, 0);
      const cracks = rng.int(3, 6);
      tctx.strokeStyle = 'rgba(0,0,0,0.55)';
      tctx.lineWidth = 1;
      for (let c = 0; c < cracks; c++) {
        let cx0 = rng.range(6, segW - 6);
        let cy0 = rng.range(8, roadH - 10);
        const len = rng.int(14, 26);
        tctx.beginPath();
        tctx.moveTo(cx0, cy0);
        for (let k = 0; k < len; k++) {
          cx0 += rng.range(-4, 4);
          cy0 += rng.range(-1.6, 1.6);
          tctx.lineTo(cx0, cy0);
        }
        tctx.stroke();
        if (rng.next() < 0.35) {
          tctx.beginPath();
          tctx.moveTo(cx0, cy0);
          for (let b = 0; b < 10; b++) {
            cx0 += rng.range(-3, 3);
            cy0 += rng.range(-3, 3);
            tctx.lineTo(cx0, cy0);
          }
          tctx.stroke();
        }
      }
      const potholes = rng.int(0, 2);
      for (let p = 0; p < potholes; p++) {
        const px = rng.range(12, segW - 12);
        const py = rng.range(roadH * 0.25, roadH * 0.95);
        const r = rng.range(6, 16);
        tctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const rr = r + rng.range(-2.5, 2.5);
          const vx = px + Math.cos(a) * rr;
          const vy = py + Math.sin(a) * rr * 0.75;
          if (a === 0) tctx.moveTo(vx, vy); else tctx.lineTo(vx, vy);
        }
        tctx.closePath();
        tctx.fillStyle = 'rgba(20,20,20,0.9)';
        tctx.fill();
        tctx.strokeStyle = 'rgba(240,240,240,0.08)';
        tctx.lineWidth = 1.5;
        tctx.stroke();
      }
      cache.set(idx, tile);
      return tile;
    };
    for (let x = -segW - offset, i = 0; x < W + segW; x += segW, i++) {
      const idx = baseIdx + i - 1;
      const tile = getTile(idx);
      ctx.drawImage(tile, Math.floor(x), top, segW, roadH);
    }
  }

  async function toggleFullscreen() {
    try {
      const el = document.documentElement;
      const isFS = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFS) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      }
    } catch (_) {}
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill(); else ctx.stroke();
  }

  createBackBuffer();
  resizeCanvas();
  document.body.classList.remove('is-playing');
  if (introOverlay) introOverlay.classList.add('show');
  dog.y = RUN_Y - dog.h; dog.vy = 0; dog.onGround = true;
  draw(bctx);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bc, 0, 0, c.width, c.height);
})();
