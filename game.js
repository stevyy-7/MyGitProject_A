(function(){
  "use strict";
 
  // ---------- Canvas / sizing ----------
  const W = 400, H = 650;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const frame = document.getElementById('frame');
 
  function resize(){
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 20;
    const scale = Math.min(maxW / W, maxH / H, 1.6);
    const w = Math.floor(W*scale), h = Math.floor(H*scale);
    frame.style.width = w+'px';
    frame.style.height = h+'px';
    canvas.style.width = w+'px';
    canvas.style.height = h+'px';
  }
  window.addEventListener('resize', resize);
  resize();
 
  // ---------- Constants ----------
  const GRAVITY = 0.42;
  const JUMP_V = -11.2;
  const MOVE_SPEED = 4.3;
  const PLAYER_W = 20, PLAYER_H = 26;
  const PLAT_W = 62, PLAT_H = 13;
 
  // ---------- State ----------
  let state = 'start'; // start | playing | over
  let highScore = 0;
 
  let player, camY, platforms, rocks, particles, stars, mist;
  let score = 0;
  let obstacleTimer = 0;
  let obstacleInterval = 1500;
  let elapsed = 0;
  let shake = {x:0,y:0,t:0};
  let deathCause = '';
  let lastLandY = 0;
 
  const keys = {left:false, right:false};
  let touchLeft = false, touchRight = false;
 
  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
 
  // ---------- Init / reset ----------
  function initWorld(){
    player = { x: W/2 - PLAYER_W/2, y: 560, vx:0, vy: JUMP_V, w:PLAYER_W, h:PLAYER_H, facing:1, squash:1 };
    camY = 0;
    platforms = [];
    rocks = [];
    particles = [];
    score = 0;
    obstacleTimer = 900;
    obstacleInterval = 1600;
    elapsed = 0;
    lastLandY = player.y;
 
    // starting platform right under player
    platforms.push(makePlatform(W/2 - PLAT_W/2, 600, 'normal'));
    let y = 600;
    while (y > -H){
      y -= rand(68, 96);
      platforms.push(makePlatform(rand(10, W-10-PLAT_W), y, pickType()));
    }
 
    stars = [];
    for(let i=0;i<60;i++){
      stars.push({ x: rand(0,W), y: rand(0,H*3), r: rand(0.5,1.8), p: rand(0,Math.PI*2), layer: Math.random()<0.5?1:2 });
    }
    mist = [];
    for(let i=0;i<5;i++){
      mist.push({ x: rand(0,W), y: rand(0,H*3), w: rand(120,220), speedFactor: 0.15 });
    }
  }
 
  function pickType(){
    const r = Math.random();
    if (r < 0.15) return 'moving';
    if (r < 0.28) return 'crumble';
    return 'normal';
  }
 
  function makePlatform(x,y,type){
    const p = { x, y, w:PLAT_W, h:PLAT_H, type, state:'idle', timer:0 };
    if (type === 'moving'){
      p.vx = rand(1,1.9) * (Math.random()<0.5?-1:1);
      p.minX = 6; p.maxX = W - 6 - PLAT_W;
    }
    return p;
  }
 
  function highestPlatformY(){
    let m = 0;
    for (const p of platforms) if (p.y < m) m = p.y;
    return m;
  }
 
  // ---------- Input ----------
  window.addEventListener('keydown', e=>{
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left = true;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right = true;
    if (e.code==='Space'||e.code==='ArrowUp'){
      e.preventDefault();
      handlePrimary();
    }
  });
  window.addEventListener('keyup', e=>{
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left = false;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right = false;
  });
 
  const tzLeft = document.getElementById('tzLeft');
  const tzRight = document.getElementById('tzRight');
  tzLeft.addEventListener('touchstart', e=>{ e.preventDefault(); touchLeft = true; handlePrimary(); }, {passive:false});
  tzLeft.addEventListener('touchend', e=>{ e.preventDefault(); touchLeft = false; }, {passive:false});
  tzRight.addEventListener('touchstart', e=>{ e.preventDefault(); touchRight = true; handlePrimary(); }, {passive:false});
  tzRight.addEventListener('touchend', e=>{ e.preventDefault(); touchRight = false; }, {passive:false});
  // mouse fallback for desktop testing via click-drag
  let mouseDown = false;
  canvas.addEventListener('mousedown', e=>{
    mouseDown = true;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX-rect.left) / rect.width * W;
    if (mx < W/2) touchLeft = true; else touchRight = true;
    handlePrimary();
  });
  window.addEventListener('mouseup', ()=>{ mouseDown=false; touchLeft=false; touchRight=false; });
 
  function handlePrimary(){
    if (state === 'start' || state === 'over') startGame();
  }
 
  document.getElementById('startScreen').addEventListener('click', startGame);
  document.getElementById('overScreen').addEventListener('click', startGame);
 
  function startGame(){
    initWorld();
    state = 'playing';
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('overScreen').classList.add('hidden');
  }
 
  // ---------- Update ----------
  function update(dt){
    elapsed += dt;
 
    // difficulty curve
    obstacleInterval = Math.max(430, 1550 - score*3.6);
    const rockSpeedMin = 2.6 + Math.min(score*0.012, 5);
    const rockSpeedMax = 4.4 + Math.min(score*0.018, 7);
 
    // input
    const left = keys.left || touchLeft;
    const right = keys.right || touchRight;
    if (left && !right){ player.vx = -MOVE_SPEED; player.facing = -1; }
    else if (right && !left){ player.vx = MOVE_SPEED; player.facing = 1; }
    else { player.vx *= 0.7; if (Math.abs(player.vx)<0.05) player.vx = 0; }
 
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
 
    // wrap
    if (player.x + player.w < 0) player.x = W;
    if (player.x > W) player.x = -player.w;
 
    // squash recovery
    player.squash += (1 - player.squash) * 0.2;
 
    // platform collisions (only when falling)
    if (player.vy > 0){
      for (const p of platforms){
        if (p.state === 'gone') continue;
        const px1 = p.x, px2 = p.x + p.w;
        const footPrev = player.y + player.h - player.vy;
        const foot = player.y + player.h;
        if (foot >= p.y && footPrev <= p.y + 6 &&
            player.x + player.w*0.7 > px1 && player.x + player.w*0.3 < px2){
          player.y = p.y - player.h;
          player.vy = JUMP_V;
          player.squash = 1.35;
          spawnLandParticles(player.x + player.w/2, p.y);
          if (p.type === 'crumble' && p.state === 'idle'){
            p.state = 'crumbling'; p.timer = 220;
          }
        }
      }
    }
 
    // moving platforms
    for (const p of platforms){
      if (p.type === 'moving'){
        p.x += p.vx;
        if (p.x < p.minX){ p.x = p.minX; p.vx *= -1; }
        if (p.x > p.maxX){ p.x = p.maxX; p.vx *= -1; }
      }
      if (p.state === 'crumbling'){
        p.timer -= dt;
        if (p.timer <= 0) p.state = 'gone';
      }
    }
 
    // camera follow (only moves up)
    const followLine = 260;
    if (player.y - camY < followLine){
      const dy = followLine - (player.y - camY);
      camY -= dy;
      score = Math.max(score, Math.floor(-camY / 8));
    }
 
    // generate platforms upward
    while (highestPlatformY() - camY > -140){
      const gap = rand(66, 100) + Math.min(score*0.06, 46);
      const ny = highestPlatformY() - gap;
      platforms.push(makePlatform(rand(10, W-10-PLAT_W), ny, pickType()));
    }
    // cleanup below
    platforms = platforms.filter(p => p.y - camY < H + 60 && p.state !== 'gone');
 
    // rocks spawn
    obstacleTimer -= dt;
    if (obstacleTimer <= 0){
      obstacleTimer = obstacleInterval * rand(0.75,1.25);
      const r = rand(11,16);
      rocks.push({
        x: rand(r, W-r),
        y: camY - 30,
        vy: rand(rockSpeedMin, rockSpeedMax),
        vx: rand(-0.4,0.4),
        r,
        rot: rand(0,Math.PI*2),
        rotSpeed: rand(-0.05,0.05),
        trail: []
      });
    }
    for (const rock of rocks){
      rock.trail.push({x:rock.x, y:rock.y});
      if (rock.trail.length > 4) rock.trail.shift();
      rock.y += rock.vy;
      rock.x += rock.vx;
      rock.rot += rock.rotSpeed;
    }
    rocks = rocks.filter(r => r.y - camY < H + 40);
 
    // collisions: rock vs player
    for (const rock of rocks){
      const sy = rock.y - camY;
      const cx = clamp(rock.x, player.x, player.x+player.w);
      const cy = clamp(sy, player.y - camY, player.y - camY + player.h);
      const dx = rock.x - cx, dy = sy - cy;
      if (dx*dx + dy*dy < rock.r*rock.r*0.75){
        die('crushed');
        break;
      }
    }
 
    // particles
    for (const pt of particles){ pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life -= dt; }
    particles = particles.filter(p=>p.life>0);
 
    // death by falling
    if (player.y - camY > H + 30){
      die('fell');
    }
 
    // shake decay
    if (shake.t > 0){ shake.t -= dt; } else { shake.x=0; shake.y=0; }
  }
 
  function spawnLandParticles(x,y){
    for (let i=0;i<5;i++){
      particles.push({ x, y, vx: rand(-1.4,1.4), vy: rand(-1.6,-0.2), life: 260, r: rand(1.5,3), color:'rgba(220,225,235,0.8)' });
    }
  }
  function spawnDeathParticles(x,y,color){
    for (let i=0;i<18;i++){
      particles.push({ x, y, vx: rand(-3,3), vy: rand(-4,1), life: 500, r: rand(2,4), color });
    }
  }
 
  function die(cause){
    if (state !== 'playing') return;
    deathCause = cause;
    spawnDeathParticles(player.x+player.w/2, player.y - camY + player.h/2, cause==='crushed' ? 'rgba(225,85,84,0.9)' : 'rgba(180,190,210,0.9)');
    shake = {x:0,y:0,t:260};
    flashScreen();
    highScore = Math.max(highScore, score);
    state = 'over';
    setTimeout(showOverScreen, 320);
  }
 
  function flashScreen(){
    const el = document.getElementById('flash');
    el.style.transition = 'none';
    el.style.opacity = '0.5';
    requestAnimationFrame(()=>{
      el.style.transition = 'opacity 300ms ease-out';
      el.style.opacity = '0';
    });
  }
 
  function showOverScreen(){
    document.getElementById('overTitle').textContent = deathCause === 'crushed' ? 'CRUSHED' : 'YOU FELL';
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalBest').textContent = highScore;
    document.getElementById('overScreen').classList.remove('hidden');
  }
 
  // ---------- Draw ----------
  function draw(){
    ctx.save();
    if (shake.t > 0){
      ctx.translate(rand(-4,4)*(shake.t/260), rand(-4,4)*(shake.t/260));
    }
 
    // background
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#0a0e1f');
    g.addColorStop(1, '#232a4d');
    ctx.fillStyle = g;
    ctx.fillRect(-8,-8,W+16,H+16);
 
    // stars parallax
    for (const s of stars){
      const sy = ((s.y - camY*0.3) % (H*3) + H*3) % (H*3);
      if (sy > H) continue;
      const tw = 0.6 + 0.4*Math.sin(elapsed*0.002 + s.p);
      ctx.globalAlpha = tw * (s.layer===1?0.5:0.9);
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(s.x, sy, s.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
 
    // mist parallax
    for (const m of mist){
      const my = ((m.y - camY*m.speedFactor) % (H*3) + H*3) % (H*3);
      if (my > H+40) continue;
      const grad = ctx.createRadialGradient(m.x, my, 0, m.x, my, m.w);
      grad.addColorStop(0,'rgba(120,140,190,0.10)');
      grad.addColorStop(1,'rgba(120,140,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(m.x, my, m.w, m.w*0.4, 0, 0, Math.PI*2);
      ctx.fill();
    }
 
    // platforms
    for (const p of platforms){
      if (p.state === 'gone') continue;
      const sy = p.y - camY;
      if (sy < -20 || sy > H+20) continue;
      drawPlatform(p, sy);
    }
 
    // rocks
    for (const rock of rocks){
      const sy = rock.y - camY;
      // trail
      for (let i=0;i<rock.trail.length;i++){
        const t = rock.trail[i];
        const tsy = t.y - camY;
        ctx.globalAlpha = 0.12 * (i+1)/rock.trail.length;
        ctx.fillStyle = '#e15554';
        ctx.beginPath();
        ctx.arc(t.x, tsy, rock.r*0.8, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawRock(rock.x, sy, rock.r, rock.rot);
    }
 
    // particles
    for (const pt of particles){
      ctx.globalAlpha = clamp(pt.life/400, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
 
    // player
    if (state !== 'over'){
      drawPlayer();
    }
 
    ctx.restore();
  }
 
  function drawPlatform(p, sy){
    const wobble = p.state==='crumbling' ? Math.sin(elapsed*0.05)*2 : 0;
    ctx.save();
    ctx.translate(wobble,0);
    let base = '#565b6b', edge = '#8489a0', glow = null;
    if (p.type === 'moving'){ base = '#3a6b6a'; edge = '#59a29e'; glow='rgba(79,209,197,0.35)'; }
    if (p.type === 'crumble'){ base = '#6b4a3a'; edge = '#a17357'; glow = p.state==='crumbling' ? 'rgba(225,85,84,0.45)' : null; }
 
    if (glow){
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = base;
    ctx.fillRect(p.x, sy, p.w, p.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = edge;
    ctx.fillRect(p.x, sy, p.w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x, sy+p.h-2, p.w, 2);
    ctx.restore();
  }
 
  function drawRock(x,y,r,rot){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(rot);
    ctx.beginPath();
    const pts = 7;
    for (let i=0;i<pts;i++){
      const a = (i/pts)*Math.PI*2;
      const rr = r * (0.8 + 0.25*Math.sin(i*2.1));
      const px = Math.cos(a)*rr, py = Math.sin(a)*rr;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
    ctx.fillStyle = '#5b5142';
    ctx.fill();
    ctx.fillStyle = 'rgba(225,85,84,0.25)';
    ctx.beginPath();
    ctx.arc(0,0,r*0.4,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
 
  function drawPlayer(){
    const sx = player.x, sy = player.y - camY;
    const cx = sx + player.w/2;
    ctx.save();
    ctx.translate(cx, sy + player.h);
    ctx.scale(1/player.squash, player.squash);
    ctx.translate(-cx, -(sy+player.h));
 
    // scarf
    ctx.fillStyle = '#e15554';
    ctx.beginPath();
    const sway = Math.sin(elapsed*0.012)*4 - player.facing*3;
    ctx.moveTo(cx - player.facing*4, sy+6);
    ctx.quadraticCurveTo(cx - player.facing*10 + sway, sy+12, cx - player.facing*6 + sway, sy+20);
    ctx.quadraticCurveTo(cx - player.facing*4, sy+14, cx - player.facing*2, sy+8);
    ctx.fill();
 
    // body
    ctx.fillStyle = '#4fd1c5';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(sx, sy+10, player.w, player.h-10, 4) : ctx.rect(sx, sy+10, player.w, player.h-10);
    ctx.fill();
 
    // head
    ctx.fillStyle = '#f2d6b3';
    ctx.beginPath();
    ctx.arc(cx, sy+7, 7, 0, Math.PI*2);
    ctx.fill();
 
    // eyes
    ctx.fillStyle = '#1a1c26';
    ctx.beginPath();
    ctx.arc(cx + player.facing*2.5, sy+6, 1.3, 0, Math.PI*2);
    ctx.fill();
 
    ctx.restore();
  }
 
  // ---------- Loop ----------
  let last = performance.now();
  function loop(now){
    let dt = now - last;
    last = now;
    if (dt > 50) dt = 50;
 
    if (state === 'playing'){
      update(dt);
      document.getElementById('scoreEl').textContent = score;
      document.getElementById('bestEl').textContent = highScore;
    }
    draw();
    requestAnimationFrame(loop);
  }
 
  document.getElementById('bestEl').textContent = highScore;
  requestAnimationFrame(loop);
})();
