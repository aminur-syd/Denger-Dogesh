(() => {
  const W = 420, H = 640;
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let scaleX = 1, scaleY = 1;
  const GRAD = { sky: null, sun: null };
  const SUN = { x: W - 80, y: 110, r: 42 };
  function resizeCanvas() {
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.floor(rect.width || W));
    const cssH = Math.max(1, Math.floor(rect.height || H));
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    scaleX = c.width / W;
    scaleY = c.height / H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ffd9a3');
    sky.addColorStop(0.55, '#f2e6c8');
    sky.addColorStop(1, '#ebe7df');
    GRAD.sky = sky;
    const sun = ctx.createRadialGradient(SUN.x, SUN.y, 8, SUN.x, SUN.y, SUN.r);
    sun.addColorStop(0, 'rgba(255,230,150,0.95)');
    sun.addColorStop(1, 'rgba(255,230,150,0)');
    GRAD.sun = sun;
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
  function onFullscreenChange() {
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('is-fullscreen', fs);
    if (fsBtn) fsBtn.textContent = fs ? 'Exit Fullscreen' : 'Fullscreen';
    applyFullscreenLayout();
  }
  window.addEventListener('resize', () => { applyFullscreenLayout(); if (!running) draw(ctx); });
  window.addEventListener('orientationchange', () => setTimeout(() => { applyFullscreenLayout(); if (!running) draw(ctx); }, 60));
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

  const GROUND_Y = H - 90;
  const GRAVITY = 1500;
  const JUMP_V = -650;
  const BASE_SPEED = 200;
  const ACCEL = 5;
  const COYOTE_TIME = 0.18;
  const JUMP_BUFFER = 0.18;
  const SPRITE_FRAMES = 0;
  const SPRITE_FPS = 12;

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
  };

  const goAudio = new Audio();
  goAudio.src = 'essentials/game-over-sound.mp3';
  goAudio.preload = 'auto';
  goAudio.volume = 0.6;
  let goPlayed = false;
  let goTimer = null;
  let ac;
  let audioUnlocked = false;
  const JUMP_SRC = 'essentials/jump.mp3';
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
      // Prime jump sounds silently
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
    } catch (_) { /* ignore */ }
  }
  function playJumpSound() {
    try {
      const a = jumpPool[jumpIdx++ % JUMP_POOL_SIZE];
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* ignore */ }
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

  const dog = { x: 64, y: GROUND_Y - 70, w: 98, h: 100, vy: 0, onGround: true, leg: 0 };
  /** obstacles are {x,y,w,h} moving left at world speed */
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
    if (dog.vy < 0) dog.vy *= 0.55;
  }
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointerup', onPointerUp);

  function doJump() {
    dog.vy = JUMP_V;
    dog.onGround = false;
    coyoteT = 0; jumpBufT = 0;
  playJumpSound();
  }

  function restart() {
    running = true; gameOver = false; tPrev = performance.now(); lastSpawn = 0;
    elapsed = 0; obstaclesPassed = 0; score = 0; speed = BASE_SPEED;
    dog.x = 64; dog.y = GROUND_Y - dog.h; dog.vy = 0; dog.onGround = true; dog.leg = 0;
    obstacles.length = 0;
  initClouds();
  if (goTimer) { clearTimeout(goTimer); goTimer = null; }
  goAudio.pause();
  goPlayed = false;
  if (goOverlay) { goOverlay.hidden = true; goOverlay.classList.remove('show'); }
    loop(performance.now());
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rectsOverlap(a, b) { return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y); }
  function spawnObstacle() {
    const type = Math.random();
    const w = type < 0.5 ? 20 + Math.random() * 16 : 16 + Math.random() * 10;
    const h = type < 0.5 ? 22 + Math.random() * 20 : 42 + Math.random() * 26;
    const x = W + w + Math.random() * 60;
    const y = GROUND_Y - h;
    obstacles.push({ x, y, w, h });
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.033, (now - (tPrev || now)) / 1000);
    tPrev = now;

    elapsed += dt;
    speed = BASE_SPEED + elapsed * ACCEL;
    worldX += speed * dt;
    updateClouds(dt);
    score = Math.floor(elapsed * 10) + obstaclesPassed;

    jumpBufT = Math.max(0, jumpBufT - dt);
    dog.vy += GRAVITY * dt;
    dog.y += dog.vy * dt;
    if (dog.y + dog.h >= GROUND_Y) {
      dog.y = GROUND_Y - dog.h;
      dog.vy = 0;
      dog.onGround = true;
    } else {
      dog.onGround = false;
    }
    animClock += dt * (dog.onGround ? Math.min(1.8, speed / BASE_SPEED) : 0.9);
    if (dog.onGround) coyoteT = COYOTE_TIME; else coyoteT = Math.max(0, coyoteT - dt);
    if (running && jumpBufT > 0 && (dog.onGround || coyoteT > 0)) doJump();
    dog.leg += (dog.onGround ? speed : speed * 0.4) * dt;

    lastSpawn += dt;
    const interval = Math.max(1.3, 2.6 - elapsed * 0.045);
    if (elapsed > 1.2 && lastSpawn > interval) {
      lastSpawn = 0;
      spawnObstacle();
      if (Math.random() < Math.min(0.12, elapsed * 0.01)) {
        setTimeout(() => obstacles.length && spawnObstacle(), 120 + Math.random() * 220);
      }
    }

    for (const o of obstacles) o.x -= speed * dt;
    while (obstacles.length && obstacles[0].x + obstacles[0].w < -20) {
      obstacles.shift();
      obstaclesPassed += 1;
    }

    for (const o of obstacles) {
      if (rectsOverlap({ x: dog.x + 8, y: dog.y + 6, w: dog.w - 16, h: dog.h - 12 }, o)) {
        gameOver = true; running = false;
      }
    }

    draw(ctx);
    scoreEl.textContent = `Score: ${score}`;

    if (running) requestAnimationFrame(loop);
    else if (gameOver) {
      playGameOver();
      if (goOverlay) {
        if (goScoreEl) goScoreEl.textContent = `Final Score: ${score}`;
        goOverlay.hidden = false;
        goOverlay.classList.add('show');
      }
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

    const tOffset = (worldX * 0.35) % 120;
    for (let x = -140 - tOffset; x < W + 140; x += 120) {
      drawPalm(ctx, x, GROUND_Y - 18, 16);
    }

    const baseY = GROUND_Y - 8;
    const spacing = 148;
    const bOffset = (worldX * 0.6) % spacing;
    const baseIdx = Math.floor(worldX * 0.6 / spacing);
    for (let x = -spacing - bOffset, i = 0; x < W + spacing; x += spacing, i++) {
      const idx = baseIdx + i - 1;
      const palette = ['#e6d3b2','#d7e7e1','#f0d2d2','#e7e7f6'];
      const bw = 62 + (Math.abs(idx * 19) % 30);
      const bh = 54 + (Math.abs(idx * 23) % 42);
      const fill = palette[((idx % palette.length) + palette.length) % palette.length];
      drawStreetBuilding(ctx, x, baseY, bw, bh, fill);
    }

    ctx.fillStyle = '#353535';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    const curbY = GROUND_Y - 8;
    const curbOffset = (worldX * 0.45) % 28;
    for (let x = -40 - curbOffset; x < W + 40; x += 28) {
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(x, curbY, 14, 6);
      ctx.fillStyle = '#1f1f1f';
      ctx.fillRect(x + 14, curbY, 14, 6);
    }
    const laneY = GROUND_Y + Math.min(40, (H - GROUND_Y) * 0.45);
    const dashOffset = (worldX * 0.6) % 48;
    ctx.fillStyle = '#ffffffcc';
    for (let x = -60 - dashOffset; x < W + 60; x += 48) {
      ctx.fillRect(x, laneY, 24, 4);
    }
    ctx.fillStyle = '#ffffff33';
    ctx.fillRect(0, GROUND_Y + 8, W, 2);
    ctx.fillRect(0, GROUND_Y + (H - GROUND_Y) - 10, W, 2);

    drawDog(ctx, dog);

    ctx.fillStyle = '#ff6b6b';
    for (const o of obstacles) roundRect(ctx, o.x, o.y, o.w, o.h, 6, true);

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

  function drawStreetBuilding(ctx, x, baseY, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, baseY - h, w, h);
    ctx.fillStyle = '#0000001a';
    ctx.fillRect(x, baseY - h - 3, w, 3);
    ctx.fillStyle = '#8a6a4d';
    const doorW = Math.min(18, Math.max(12, Math.floor(w * 0.18)));
    ctx.fillRect(x + 6, baseY - Math.min(26, Math.floor(h * 0.35)), doorW, Math.min(26, Math.floor(h * 0.35)));
    const cols = Math.max(2, Math.floor((w - 20) / 20));
    const rows = Math.max(2, Math.floor((h - 20) / 22));
    ctx.fillStyle = '#ffdfa6cc';
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const wx = x + 10 + cx * ((w - 20) / cols) + 1;
        const wy = baseY - h + 8 + ry * ((h - 26) / rows);
        ctx.fillRect(wx, wy, 8, 10);
      }
    }
  }

  function drawDog(ctx, d) {
    if (DOG_SPRITE.ready) {
      if (DOG_SPRITE.frames > 1) {
        const idx = Math.floor(animClock * SPRITE_FPS) % DOG_SPRITE.frames;
        const sx = idx * DOG_SPRITE.fw;
        ctx.drawImage(dogImg, sx, 0, DOG_SPRITE.fw, DOG_SPRITE.fh, Math.round(d.x), Math.round(d.y), Math.round(d.w), Math.round(d.h));
      } else {
        const bobAmp = d.onGround ? 2 : 1;
        const bob = Math.sin(animClock * 10) * bobAmp;
        const drawY = Math.round(d.y + bob);
        ctx.drawImage(dogImg, 0, 0, DOG_SPRITE.fw || dogImg.width, DOG_SPRITE.fh || dogImg.height,
          Math.round(d.x), drawY, Math.round(d.w), Math.round(d.h));
        if (d.onGround) {
          const phase = Math.sin(animClock * 8);
          const pawY = drawY + d.h - 6;
          const pawW = Math.max(6, Math.floor(d.w * 0.14));
          const pawH = 4;
          ctx.fillStyle = '#00000033';
          roundRect(ctx, d.x + d.w * 0.25 + phase * 3, pawY, pawW, pawH, 2, true);
          roundRect(ctx, d.x + d.w * 0.62 - phase * 3, pawY, pawW, pawH, 2, true);
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

  

  function drawScore(ctx) {
    const text = `Score: ${score}`;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = "700 22px 'Luckiest Guy', system-ui, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2b2b2b';
    ctx.fillStyle = '#ffe27a';
    ctx.strokeText(text, 10, 10);
    ctx.fillText(text, 10, 10);
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

  resizeCanvas();
  restart();
})();
