(() => {
  const W = 420, H = 640;
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  // crisper pixel look for sprites
  ctx.imageSmoothingEnabled = false;
  const scoreEl = document.getElementById('score');
  const restartBtn = document.getElementById('restart');

  // --- Runner config ---
  const GROUND_Y = H - 90;
  const GRAVITY = 1500; // px/s^2 (slightly floatier)
  const JUMP_V = -650;  // smooth jump arc
  const BASE_SPEED = 200; // slower start
  const ACCEL = 5; // gentler acceleration
  const COYOTE_TIME = 0.18; // more lenient
  const JUMP_BUFFER = 0.18; // more lenient
  // Sprite animation config
  const SPRITE_FRAMES = 0; // set >0 to force a frame count if auto-detect fails
  const SPRITE_FPS = 12;  // animation speed when running

  // --- Assets (dog sprite) ---
  const dogImg = new Image();
  dogImg.src = 'essentials/dog.png'; // dog sprite in essentials folder
  const DOG_SPRITE = { ready: false, frames: 1, fw: 0, fh: 0 };
  dogImg.onload = () => {
    // Assume a horizontal strip of frames; if width >> height, infer frame count by ratio
    const ratio = dogImg.width / dogImg.height;
    const inferred = Math.max(1, Math.round(ratio));
    const frames = Math.max(1, SPRITE_FRAMES || inferred);
    DOG_SPRITE.frames = frames;
    DOG_SPRITE.fw = Math.floor(dogImg.width / frames);
    DOG_SPRITE.fh = dogImg.height;
    DOG_SPRITE.ready = true;
    // adjust dog width to keep sprite aspect, keep height the same
    const aspect = DOG_SPRITE.fw / DOG_SPRITE.fh;
    if (isFinite(aspect) && aspect > 0) {
      dog.w = Math.round(dog.h * aspect);
    }
  };

  // --- Audio ---
  const goAudio = new Audio();
  goAudio.src = 'essentials/game-over-sound.mp3'; // play 03-07s segment
  goAudio.preload = 'auto';
  goAudio.volume = 0.6;
  let goPlayed = false;
  let goTimer = null;
  let ac; // AudioContext fallback
  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return; audioUnlocked = true;
    try {
      // attempt to prime HTMLAudio element silently
      const prev = goAudio.volume; goAudio.volume = 0;
      const p = goAudio.play();
      if (p && p.then) p.then(() => { goAudio.pause(); goAudio.currentTime = 0; goAudio.volume = prev; }).catch(() => { goAudio.volume = prev; });
    } catch(_) {}
    try { ac && ac.state === 'suspended' && ac.resume(); } catch(_) {}
  }
  // unlock on first user interaction
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
        // stop at end using timeupdate and a safety timer
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
    else if (goAudio.readyState >= 1) startPlayback(); // HAVE_METADATA
    else goAudio.addEventListener('loadedmetadata', startPlayback, { once: true });
    goPlayed = true;
  }

  // --- Game state ---
  let running = false, gameOver = false, tPrev = 0, lastSpawn = 0;
  let elapsed = 0, obstaclesPassed = 0, score = 0, speed = BASE_SPEED;
  let worldX = 0; // accumulated world distance for parallax

  const dog = { x: 64, y: GROUND_Y - 70, w: 98, h: 100, vy: 0, onGround: true, leg: 0 };
  /** obstacles are {x,y,w,h} moving left at world speed */
  const obstacles = [];
  let coyoteT = 0, jumpBufT = 0;
  let animClock = 0; // drives sprite animation

  // --- Input ---
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if ([' ', 'Space', 'ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); jumpBufT = JUMP_BUFFER; }
    keys.add(e.key);
    if (e.key === 'r' || e.key === 'R') restart();
  });
  window.addEventListener('keyup', e => {
    // variable jump height: early release shortens jump
    if ([' ', 'Space', 'ArrowUp', 'w', 'W'].includes(e.key) && dog.vy < 0) {
      dog.vy *= 0.55;
    }
    keys.delete(e.key);
  });
  restartBtn.addEventListener('click', restart);

  function doJump() {
    dog.vy = JUMP_V;
    dog.onGround = false;
    coyoteT = 0; jumpBufT = 0;
  }

  function restart() {
    running = true; gameOver = false; tPrev = performance.now(); lastSpawn = 0;
    elapsed = 0; obstaclesPassed = 0; score = 0; speed = BASE_SPEED;
    dog.x = 64; dog.y = GROUND_Y - dog.h; dog.vy = 0; dog.onGround = true; dog.leg = 0;
    obstacles.length = 0;
  if (goTimer) { clearTimeout(goTimer); goTimer = null; }
  goAudio.pause();
  goPlayed = false;
    loop(performance.now());
  }

  // --- Helpers ---
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rectsOverlap(a, b) { return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y); }
  function spawnObstacle() {
    // random box or tall obstacle (smaller/easier)
    const type = Math.random();
    const w = type < 0.5 ? 20 + Math.random() * 16 : 16 + Math.random() * 10;
    const h = type < 0.5 ? 22 + Math.random() * 20 : 42 + Math.random() * 26;
    const x = W + w + Math.random() * 60;
    const y = GROUND_Y - h;
    obstacles.push({ x, y, w, h });
  }

  // --- Loop ---
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.033, (now - (tPrev || now)) / 1000);
    tPrev = now;

  // world progression
    elapsed += dt;
  speed = BASE_SPEED + elapsed * ACCEL;
  worldX += speed * dt;
    score = Math.floor(elapsed * 10) + obstaclesPassed; // time + passed obstacles

  // physics: dog
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
  // sprite animation clock (faster when running on ground)
  animClock += dt * (dog.onGround ? Math.min(1.8, speed / BASE_SPEED) : 0.9);
  // coyote time and buffered jump
  if (dog.onGround) coyoteT = COYOTE_TIME; else coyoteT = Math.max(0, coyoteT - dt);
  if (running && jumpBufT > 0 && (dog.onGround || coyoteT > 0)) doJump();
    dog.leg += (dog.onGround ? speed : speed * 0.4) * dt;

    // spawn rhythm (shorter intervals over time)
    lastSpawn += dt;
    const interval = Math.max(1.3, 2.6 - elapsed * 0.045);
    if (elapsed > 1.2 && lastSpawn > interval) {
      lastSpawn = 0;
      spawnObstacle();
      // sometimes chain a second obstacle for difficulty
      if (Math.random() < Math.min(0.12, elapsed * 0.01)) {
        setTimeout(() => obstacles.length && spawnObstacle(), 120 + Math.random() * 220);
      }
    }

    // update obstacles (move left by world speed)
    for (const o of obstacles) o.x -= speed * dt;
    while (obstacles.length && obstacles[0].x + obstacles[0].w < -20) {
      obstacles.shift();
      obstaclesPassed += 1;
    }

    // collisions
    for (const o of obstacles) {
      if (rectsOverlap({ x: dog.x + 8, y: dog.y + 6, w: dog.w - 16, h: dog.h - 12 }, o)) {
        gameOver = true; running = false;
      }
    }

    // draw
    draw(ctx);
    scoreEl.textContent = `Score: ${score}`;

  if (running) requestAnimationFrame(loop);
  else if (gameOver) { drawGameOver(ctx); playGameOver(); }
  }

  function draw(ctx) {
    ctx.clearRect(0, 0, W, H);

    // Sky gradient (warm Indian morning tone)
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ffd9a3');
    sky.addColorStop(0.55, '#f2e6c8');
    sky.addColorStop(1, '#ebe7df');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Sun glow
    const sunX = W - 80, sunY = 110, sunR = 42;
    const sun = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, sunR);
    sun.addColorStop(0, 'rgba(255,230,150,0.95)');
    sun.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

  // (Removed skyline block silhouettes)

    // Mid-ground palms/trees, medium parallax
    const tOffset = (worldX * 0.35) % 120;
    for (let x = -140 - tOffset; x < W + 140; x += 120) {
      drawPalm(ctx, x, GROUND_Y - 18, 16);
    }

    // Street-side buildings (synced with road), draw behind curb
    const baseY = GROUND_Y - 8; // top of road curb
    const spacing = 148;
    const bOffset = (worldX * 0.6) % spacing; // sync close to road speed
    for (let x = -spacing - bOffset, i = 0; x < W + spacing; x += spacing, i++) {
      const bw = 62 + ((i * 19) % 30); // 62-92
      const bh = 54 + ((i * 23) % 42); // 54-96
      const palette = ['#e6d3b2','#d7e7e1','#f0d2d2','#e7e7f6'];
      const fill = palette[i % palette.length];
      drawStreetBuilding(ctx, x, baseY, bw, bh, fill);
    }

    // Road surface
    ctx.fillStyle = '#353535';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // Median curb with black-yellow pattern at top of road
    const curbY = GROUND_Y - 8;
    const curbOffset = (worldX * 0.45) % 28;
    for (let x = -40 - curbOffset; x < W + 40; x += 28) {
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(x, curbY, 14, 6);
      ctx.fillStyle = '#1f1f1f';
      ctx.fillRect(x + 14, curbY, 14, 6);
    }
    // Center dashed lane marking
    const laneY = GROUND_Y + Math.min(40, (H - GROUND_Y) * 0.45);
    const dashOffset = (worldX * 0.6) % 48;
    ctx.fillStyle = '#ffffffcc';
    for (let x = -60 - dashOffset; x < W + 60; x += 48) {
      ctx.fillRect(x, laneY, 24, 4);
    }
    // Edge lines (faint)
    ctx.fillStyle = '#ffffff33';
    ctx.fillRect(0, GROUND_Y + 8, W, 2);
    ctx.fillRect(0, GROUND_Y + (H - GROUND_Y) - 10, W, 2);

    // Dog
    drawDog(ctx, dog);

    // Obstacles
    ctx.fillStyle = '#ff6b6b';
    for (const o of obstacles) roundRect(ctx, o.x, o.y, o.w, o.h, 6, true);
  }

  function drawPalm(ctx, x, baseY, h) {
    // trunk
    ctx.fillStyle = '#6b4f2a';
    ctx.fillRect(x, baseY - h, 3, h);
    // leaves
    ctx.fillStyle = '#3a6f3a';
    ctx.beginPath();
    ctx.moveTo(x + 1, baseY - h);
    ctx.quadraticCurveTo(x - 10, baseY - h - 8, x - 2, baseY - h + 2);
    ctx.quadraticCurveTo(x + 12, baseY - h - 8, x + 4, baseY - h + 2);
    ctx.fill();
  }

  function drawStreetBuilding(ctx, x, baseY, w, h, fill) {
    // main body
    ctx.fillStyle = fill;
    ctx.fillRect(x, baseY - h, w, h);
    // subtle roof and shadow
    ctx.fillStyle = '#0000001a';
    ctx.fillRect(x, baseY - h - 3, w, 3);
    // door
    ctx.fillStyle = '#8a6a4d';
    const doorW = Math.min(18, Math.max(12, Math.floor(w * 0.18)));
    ctx.fillRect(x + 6, baseY - Math.min(26, Math.floor(h * 0.35)), doorW, Math.min(26, Math.floor(h * 0.35)));
    // windows grid (soft)
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
      // If sprite sheet has multiple frames, cycle them; else bob to simulate gait
      if (DOG_SPRITE.frames > 1) {
        const idx = Math.floor(animClock * SPRITE_FPS) % DOG_SPRITE.frames;
        const sx = idx * DOG_SPRITE.fw;
        ctx.drawImage(dogImg, sx, 0, DOG_SPRITE.fw, DOG_SPRITE.fh, Math.round(d.x), Math.round(d.y), Math.round(d.w), Math.round(d.h));
      } else {
        const bobAmp = d.onGround ? 2 : 1;
        const bob = Math.sin(animClock * 10) * bobAmp; // subtle bobbing to imply steps
        const drawY = Math.round(d.y + bob);
        ctx.drawImage(dogImg, 0, 0, DOG_SPRITE.fw || dogImg.width, DOG_SPRITE.fh || dogImg.height,
          Math.round(d.x), drawY, Math.round(d.w), Math.round(d.h));
        // Simple animated paws to mimic leg motion when on ground
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
    // Fallback: simple vector dog
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

  function drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(10,12,28,.72)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e6e6f0';
    ctx.font = '700 28px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Game Over', W / 2, H / 2 - 16);
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillText(`Final Score: ${score}`, W / 2, H / 2 + 10);
    ctx.fillText('Press R or click Restart', W / 2, H / 2 + 36);
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

  // start once
  restart();
})();
