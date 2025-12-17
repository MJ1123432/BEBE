(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const loveBtn = document.getElementById("loveBtn");
  const loveOverlay = document.getElementById("loveOverlay");
  const bouquetBtn = document.getElementById("bouquetBtn");
  const clearBtn = document.getElementById("clearBtn");
  const hint = document.getElementById("hint");

  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    t: 0,
    lastNow: 0,
    blooms: [],
    particles: [],
    love: {
      timerId: null,
      until: 0,
      nextPulse: 0,
      open: false,
    },
    fireworks: {
      active: false,
      until: 0,
      rockets: [],
      sparks: [],
      lastSpawn: 0,
    },
    bokeh: [],
    pointer: {
      x: 0,
      y: 0,
      isDown: false,
      downX: 0,
      downY: 0,
      lastX: 0,
      lastY: 0,
      windTarget: 0,
      wind: 0,
      parallaxX: 0,
      parallaxY: 0,
      id: null,
    },
    doubleTap: {
      lastTime: 0,
      lastX: 0,
      lastY: 0,
    },
    reducedMotion: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  const palette = {
    petals: ["#ff3b6b", "#ff5fa0", "#ff7aa8", "#ff2d55", "#ff4b87"],
    glow: ["rgba(255, 59, 107, 0.30)", "rgba(255, 122, 168, 0.24)", "rgba(255, 59, 107, 0.18)"],
    stem: ["#2bd18f", "#2acb7f", "#1cae6f"],
    stamen: ["#ffd1e1", "#ffe7f0", "#ffd36b"],
    fireworks: ["#ff3b6b", "#ff7aa8", "#ffd1e1", "#ffffff", "#ff2d55"],
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  class FireworkRocket {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = rand(-35, 35);
      this.vy = -rand(420, 620);
      this.ax = rand(-8, 8);
      this.ay = 230;
      this.life = rand(0.9, 1.35);
      this.age = 0;
      this.trail = [];
      this.color = palette.fireworks[Math.floor(Math.random() * palette.fireworks.length)];
    }
    update(dt) {
      this.age += dt;
      this.vx += this.ax * dt;
      this.vy += this.ay * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 10) this.trail.shift();
      const t = this.age / this.life;
      return t >= 1 || this.vy > -40;
    }
    render(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        const a = i / this.trail.length;
        ctx.globalAlpha = a * 0.45;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.0 + a * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  class FireworkSpark {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      const a = rand(-Math.PI, Math.PI);
      const sp = rand(140, 520);
      this.vx = Math.cos(a) * sp;
      this.vy = Math.sin(a) * sp;
      this.ay = 260;
      this.drag = rand(0.88, 0.94);
      this.life = rand(0.9, 1.7);
      this.age = 0;
      this.r = rand(1.2, 2.6);
      this.color = color;
      this.a = 1;
    }
    update(dt) {
      this.age += dt;
      const t = clamp(this.age / this.life, 0, 1);
      this.a = 1 - t;
      this.vx *= Math.pow(this.drag, dt * 60);
      this.vy *= Math.pow(this.drag, dt * 60);
      this.vy += this.ay * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return t >= 1;
    }
    render(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = this.a;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = this.a * 0.18;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function setCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    state.dpr = dpr;
    state.w = Math.max(1, Math.floor(rect.width));
    state.h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(state.w * dpr);
    canvas.height = Math.floor(state.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeBokeh() {
    state.bokeh.length = 0;
    const count = Math.round(clamp((state.w * state.h) / 42000, 10, 32));
    for (let i = 0; i < count; i++) {
      state.bokeh.push({
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        r: rand(18, 90),
        a: rand(0.06, 0.16),
        s: rand(0.12, 0.5),
      });
    }
  }

  class Bloom {
    constructor(x, y, scale = 1) {
      this.x = x;
      this.y = y;
      this.scale = scale;

      this.seed = Math.random() * 1000;
      this.petalCount = Math.round(rand(8, 14));
      this.petalColor = palette.petals[Math.floor(Math.random() * palette.petals.length)];
      this.petalColor2 = palette.petals[Math.floor(Math.random() * palette.petals.length)];
      this.glow = palette.glow[Math.floor(Math.random() * palette.glow.length)];
      this.stemColor = palette.stem[Math.floor(Math.random() * palette.stem.length)];

      this.stemLen = rand(120, 240) * scale;
      this.headRadius = rand(18, 34) * scale;
      this.leafCount = Math.random() < 0.8 ? 2 : 1;
      this.bloomDelay = rand(0.1, 0.35);

      this.age = 0;
      this.life = rand(6.5, 9.0);
      this.dead = false;
    }

    update(dt) {
      this.age += dt;
      if (this.age > this.life) this.dead = true;
    }

    render(ctx, wind) {
      const t = clamp(this.age / this.life, 0, 1);
      const stemT = easeOutCubic(clamp(t / 0.5, 0, 1));
      const bloomT = easeInOutCubic(clamp((t - this.bloomDelay) / 0.55, 0, 1));
      const sway = wind * (0.7 + 0.4 * Math.sin(this.seed + state.t * 0.7));

      const baseX = this.x + state.pointer.parallaxX * 18;
      const baseY = this.y + state.pointer.parallaxY * 18;

      const topY = baseY - this.stemLen * stemT;
      const bend = sway * (0.35 + 0.65 * stemT) * this.stemLen * 0.25;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const grad = ctx.createLinearGradient(baseX, baseY, baseX + bend, topY);
      grad.addColorStop(0, "rgba(12, 90, 60, 0.00)");
      grad.addColorStop(0.18, this.stemColor);
      grad.addColorStop(1, "rgba(42, 203, 127, 0.30)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = 6 * this.scale;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(
        baseX + bend * 0.2,
        lerp(baseY, topY, 0.35),
        baseX + bend * 0.7,
        lerp(baseY, topY, 0.7),
        baseX + bend,
        topY
      );
      ctx.stroke();

      if (this.leafCount > 0) {
        for (let i = 0; i < this.leafCount; i++) {
          const at = lerp(0.35, 0.75, i / Math.max(1, this.leafCount - 1));
          const px = lerp(baseX, baseX + bend, at);
          const py = lerp(baseY, topY, at);
          const dir = i % 2 === 0 ? -1 : 1;
          const leafLen = (40 + 22 * Math.sin(this.seed * 2 + i)) * this.scale;
          const open = stemT;
          drawLeaf(ctx, px, py, dir, leafLen, open, this.stemColor);
        }
      }

      drawFlowerHead(ctx, baseX + bend, topY, this, bloomT, sway);
      ctx.restore();
    }
  }

  function drawLeaf(ctx, x, y, dir, len, open, color) {
    const w = len * 0.55;
    const ang = dir * (0.75 + 0.25 * open);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(open, open);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "rgba(255,255,255,0.02)");
    g.addColorStop(0.25, color);
    g.addColorStop(1, "rgba(18, 209, 143, 0.12)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.4, -w, len, 0);
    ctx.quadraticCurveTo(len * 0.4, w, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  function drawPetalInner(ctx, angle, r, open, bloom) {
    const len = r * lerp(1.05, 1.55, open);
    const width = r * lerp(0.45, 0.78, open);
    const lift = r * lerp(0.1, 0.26, open);

    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -lift);

    const g = ctx.createLinearGradient(0, -r * 0.1, 0, -len);
    g.addColorStop(0, "rgba(255, 255, 255, 0.85)");
    g.addColorStop(0.35, bloom.petalColor2);
    g.addColorStop(1, bloom.petalColor);

    ctx.fillStyle = g;
    ctx.globalAlpha = lerp(0.0, 0.95, open);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(width, -len * 0.55, 0, -len);
    ctx.quadraticCurveTo(-width, -len * 0.55, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStamen(ctx, centerR, open, seed) {
    const dots = Math.round(lerp(8, 18, open));
    const ring = centerR * lerp(0.4, 0.85, open);
    const dotR = centerR * lerp(0.09, 0.13, open);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2 + 0.3 * Math.sin(seed + i);
      const rr = ring * (0.82 + 0.22 * Math.sin(seed * 2 + i));
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;

      const c = palette.stamen[i % palette.stamen.length];
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x, y, dotR * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFlowerHead(ctx, x, y, bloom, open, sway) {
    const r = bloom.headRadius;
    const petals = bloom.petalCount;
    const rot = sway * 0.55;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = bloom.glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.9 + 0.4 * open), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const wobble = 0.15 * Math.sin(bloom.seed * 3 + i * 1.7 + state.t * 1.2);
      const pOpen = open * (0.85 + 0.15 * Math.sin(bloom.seed + i));
      drawPetal(ctx, a + wobble, r, pOpen, bloom);
    }

    const innerPetals = Math.round(clamp(petals * 0.6, 5, 10));
    for (let i = 0; i < innerPetals; i++) {
      const a = (i / innerPetals) * Math.PI * 2 + 0.22;
      const wobble = 0.18 * Math.sin(bloom.seed * 2 + i * 2.3 + state.t * 1.35);
      const pOpen = open * 0.92;
      drawPetalInner(ctx, a + wobble, r * 0.72, pOpen, bloom);
    }

    const centerR = r * lerp(0.35, 0.52, open);
    const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, centerR * 1.4);
    cg.addColorStop(0, "rgba(255, 245, 250, 0.95)");
    cg.addColorStop(0.35, "rgba(255, 197, 220, 0.92)");
    cg.addColorStop(1, "rgba(255, 59, 107, 0.70)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, centerR, 0, Math.PI * 2);
    ctx.fill();

    drawStamen(ctx, centerR, open, bloom.seed);
    ctx.restore();
  }

  function drawPetal(ctx, angle, r, open, bloom) {
    const len = r * lerp(1.2, 2.05, open);
    const width = r * lerp(0.55, 0.95, open);
    const lift = r * lerp(0.15, 0.45, open);
    const tip = r * lerp(0.55, 1.0, open);

    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -lift);

    const g = ctx.createLinearGradient(0, -r * 0.2, 0, -len);
    g.addColorStop(0, bloom.petalColor2);
    g.addColorStop(0.45, bloom.petalColor);
    g.addColorStop(1, "rgba(255,255,255,0.90)");

    ctx.fillStyle = g;
    ctx.globalAlpha = lerp(0.0, 1.0, open);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(width, -len * 0.55, 0, -len);
    ctx.quadraticCurveTo(-width, -len * 0.55, 0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = lerp(0.0, 0.22, open);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -tip);
    ctx.quadraticCurveTo(0, -len * 0.5, 0, -len);
    ctx.stroke();
    ctx.restore();
  }

  class HeartParticle {
    constructor(x, y, size = 16, burst = false) {
      this.x = x;
      this.y = y;
      const ang = burst ? rand(-Math.PI, Math.PI) : rand(-0.8, 0.8);
      const sp = burst ? rand(120, 320) : rand(25, 70);
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp - (burst ? rand(120, 260) : rand(80, 160));
      this.ax = rand(-12, 12);
      this.ay = burst ? rand(90, 160) : rand(55, 95);
      this.r = size;
      this.rot = rand(-Math.PI, Math.PI);
      this.vr = rand(-2.2, 2.2);
      this.a = 1;
      this.life = burst ? rand(0.9, 1.6) : rand(1.8, 3.2);
      this.age = 0;
      this.color = palette.petals[Math.floor(Math.random() * palette.petals.length)];
    }

    update(dt) {
      this.age += dt;
      const t = clamp(this.age / this.life, 0, 1);
      this.a = 1 - t;
      this.vx += this.ax * dt;
      this.vy += this.ay * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.vr * dt;
      return t >= 1;
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.globalAlpha = this.a;
      ctx.fillStyle = this.color;
      drawHeartPath(ctx, this.r);
      ctx.fill();
      ctx.globalAlpha = this.a * 0.22;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      drawHeartPath(ctx, this.r * 1.12);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  function drawHeartPath(ctx, r) {
    const s = r;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(s * 0.6, -s * 0.1, s * 1.1, s * 0.35, 0, s * 1.1);
    ctx.bezierCurveTo(-s * 1.1, s * 0.35, -s * 0.6, -s * 0.1, 0, s * 0.35);
    ctx.closePath();
  }

  class Spark {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      const a = rand(-Math.PI, Math.PI);
      const sp = rand(60, 220);
      this.vx = Math.cos(a) * sp;
      this.vy = Math.sin(a) * sp;
      this.life = rand(0.4, 0.9);
      this.age = 0;
      this.r = rand(1.0, 2.2);
      this.a = 1;
    }
    update(dt) {
      this.age += dt;
      const t = clamp(this.age / this.life, 0, 1);
      this.a = 1 - t;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.98;
      this.vy *= 0.98;
      return t >= 1;
    }
    render(ctx) {
      ctx.save();
      ctx.globalAlpha = this.a;
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnBloom(x, y, scale = 1) {
    const b = new Bloom(x, y, scale);
    state.blooms.push(b);
    for (let i = 0; i < 8; i++) state.particles.push(new Spark(x + rand(-8, 8), y + rand(-8, 8)));
  }

  function heartBurst(x, y) {
    const count = state.reducedMotion ? 10 : 20;
    for (let i = 0; i < count; i++) {
      state.particles.push(new HeartParticle(x, y, rand(8, 16), true));
      if (i % 2 === 0) state.particles.push(new Spark(x, y));
    }
  }

  function ambientHearts(dt) {
    if (state.reducedMotion) return;
    const rate = clamp((state.w * state.h) / 7000000, 0.05, 0.22);
    if (Math.random() < rate * dt * 60) {
      state.particles.push(new HeartParticle(rand(0, state.w), state.h + 30, rand(10, 18), false));
    }
  }

  function fireworkBurst(x, y) {
    const count = state.reducedMotion ? 40 : 90;
    const color = palette.fireworks[Math.floor(Math.random() * palette.fireworks.length)];
    for (let i = 0; i < count; i++) {
      state.fireworks.sparks.push(new FireworkSpark(x, y, color));
      if (!state.reducedMotion && i % 9 === 0) state.particles.push(new HeartParticle(x, y, rand(7, 12), true));
    }
  }

  function maybeSpawnFireworks(dt) {
    if (!state.fireworks.active) return;
    if (state.t > state.fireworks.until) {
      state.fireworks.active = false;
      return;
    }

    const rate = state.reducedMotion ? 0.55 : 1.35;
    state.fireworks.lastSpawn += dt;
    const interval = 1 / rate;
    if (state.fireworks.lastSpawn >= interval) {
      state.fireworks.lastSpawn = 0;
      const x = rand(state.w * 0.12, state.w * 0.88);
      state.fireworks.rockets.push(new FireworkRocket(x, state.h + 10));
    }
  }

  function drawBackground() {
    ctx.clearRect(0, 0, state.w, state.h);

    const px = state.pointer.parallaxX;
    const py = state.pointer.parallaxY;

    const g = ctx.createRadialGradient(
      state.w * (0.2 + px * 0.06),
      state.h * (0.12 + py * 0.06),
      20,
      state.w * 0.5,
      state.h * 0.5,
      Math.max(state.w, state.h)
    );
    g.addColorStop(0, "rgba(255, 59, 107, 0.14)");
    g.addColorStop(0.55, "rgba(255, 122, 168, 0.06)");
    g.addColorStop(1, "rgba(18, 0, 24, 0.00)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);

    for (const b of state.bokeh) {
      b.y -= b.s;
      if (b.y + b.r < -20) {
        b.y = state.h + b.r + 20;
        b.x = Math.random() * state.w;
      }
      const gg = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r);
      gg.addColorStop(0, `rgba(255, 122, 168, ${b.a})`);
      gg.addColorStop(1, "rgba(255, 122, 168, 0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function render(now) {
    const n = now / 1000;
    const dt = clamp(n - (state.lastNow || n), 0, 0.033);
    state.lastNow = n;
    state.t = n;

    state.pointer.wind += (state.pointer.windTarget - state.pointer.wind) * (1 - Math.pow(0.001, dt));
    state.pointer.windTarget *= Math.pow(0.02, dt);

    drawBackground();
    ambientHearts(dt);
    maybeLovePulse(dt);
    maybeSpawnFireworks(dt);

    for (const bloom of state.blooms) {
      bloom.update(dt);
      bloom.render(ctx, state.pointer.wind);
    }
    state.blooms = state.blooms.filter((b) => !b.dead);

    for (let i = state.fireworks.rockets.length - 1; i >= 0; i--) {
      const r = state.fireworks.rockets[i];
      const explode = r.update(dt);
      r.render(ctx);
      if (explode) {
        state.fireworks.rockets.splice(i, 1);
        fireworkBurst(r.x, r.y);
      }
    }

    for (let i = state.fireworks.sparks.length - 1; i >= 0; i--) {
      const s = state.fireworks.sparks[i];
      const dead = s.update(dt);
      s.render(ctx);
      if (dead) state.fireworks.sparks.splice(i, 1);
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      const dead = p.update(dt);
      p.render(ctx);
      if (dead) state.particles.splice(i, 1);
    }

    requestAnimationFrame(render);
  }

  function clientPosFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX ?? 0) - rect.left;
    const cy = (e.clientY ?? 0) - rect.top;
    return {
      x: clamp(cx, 0, rect.width),
      y: clamp(cy, 0, rect.height),
    };
  }

  function handleTap(x, y) {
    const bottomPad = Math.max(18, state.h * 0.08);
    const clampedY = clamp(y, state.h * 0.28, state.h - bottomPad);
    const scale = clamp(state.w / 520, 0.75, 1.15);
    spawnBloom(x, clampedY, scale);
  }

  function setHintVisible(v) {
    if (!hint) return;
    hint.classList.toggle("is-visible", v);
  }

  function closeLoveOverlay() {
    if (!loveOverlay) return;
    loveOverlay.classList.remove("is-visible");
    loveOverlay.setAttribute("aria-hidden", "true");
    state.love.open = false;
    state.love.until = 0;
    if (state.love.timerId != null) {
      window.clearTimeout(state.love.timerId);
      state.love.timerId = null;
    }
  }

  function openLoveOverlay() {
    if (!loveOverlay) return;
    loveOverlay.classList.add("is-visible");
    loveOverlay.setAttribute("aria-hidden", "false");
    state.love.open = true;
    state.love.until = state.t + 10;
    state.love.nextPulse = state.t + 0.25;

    if (state.love.timerId != null) window.clearTimeout(state.love.timerId);
    state.love.timerId = window.setTimeout(() => {
      closeLoveOverlay();
    }, 10000);
  }

  function maybeLovePulse(dt) {
    if (!state.love.open) return;
    if (state.t > state.love.until) {
      closeLoveOverlay();
      return;
    }
    if (state.t < state.love.nextPulse) return;
    state.love.nextPulse = state.t + (state.reducedMotion ? 1.2 : 0.65);
    const x = state.w * rand(0.28, 0.72);
    const y = state.h * rand(0.22, 0.48);
    const count = state.reducedMotion ? 6 : 10;
    for (let i = 0; i < count; i++) state.particles.push(new HeartParticle(x, y, rand(8, 14), true));
  }

  function initInteractions() {
    setHintVisible(true);
    window.setTimeout(() => setHintVisible(false), 3200);

    const onPointerDown = (e) => {
      if (e.target && (e.target.closest && e.target.closest("button"))) return;
      canvas.setPointerCapture(e.pointerId);
      const p = clientPosFromEvent(e);
      state.pointer.isDown = true;
      state.pointer.downX = p.x;
      state.pointer.downY = p.y;
      state.pointer.lastX = p.x;
      state.pointer.lastY = p.y;
      state.pointer.id = e.pointerId;

      const now = performance.now();
      const dt = now - state.doubleTap.lastTime;
      const dx = p.x - state.doubleTap.lastX;
      const dy = p.y - state.doubleTap.lastY;
      const close = dx * dx + dy * dy < 42 * 42;
      if (dt < 320 && close) {
        heartBurst(p.x, p.y);
        state.doubleTap.lastTime = 0;
      } else {
        state.doubleTap.lastTime = now;
        state.doubleTap.lastX = p.x;
        state.doubleTap.lastY = p.y;
      }
    };

    const onPointerMove = (e) => {
      const p = clientPosFromEvent(e);
      state.pointer.x = p.x;
      state.pointer.y = p.y;

      state.pointer.parallaxX = (p.x / state.w - 0.5) * 2;
      state.pointer.parallaxY = (p.y / state.h - 0.5) * 2;

      if (!state.pointer.isDown || state.pointer.id !== e.pointerId) return;
      const dx = p.x - state.pointer.lastX;
      state.pointer.windTarget += dx * 0.015;
      state.pointer.lastX = p.x;
      state.pointer.lastY = p.y;
    };

    const onPointerUp = (e) => {
      if (state.pointer.id !== e.pointerId) return;
      const p = clientPosFromEvent(e);
      const moved = Math.hypot(p.x - state.pointer.downX, p.y - state.pointer.downY);
      if (moved < 12) handleTap(p.x, p.y);
      state.pointer.isDown = false;
      state.pointer.id = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerup", onPointerUp, { passive: true });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: true });

    window.addEventListener(
      "mousemove",
      (e) => {
        if (state.pointer.isDown) return;
        const p = clientPosFromEvent(e);
        state.pointer.parallaxX = (p.x / state.w - 0.5) * 2;
        state.pointer.parallaxY = (p.y / state.h - 0.5) * 2;
      },
      { passive: true }
    );

    bouquetBtn?.addEventListener("click", () => {
      const n = state.reducedMotion ? 6 : 10;
      const cx = state.w * 0.5;
      const baseY = state.h * 0.78;
      for (let i = 0; i < n; i++) {
        const x = cx + rand(-state.w * 0.26, state.w * 0.26);
        const y = baseY + rand(-state.h * 0.08, state.h * 0.05);
        const scale = clamp(state.w / 560, 0.72, 1.2) * rand(0.8, 1.1);
        spawnBloom(x, y, scale);
      }
      heartBurst(cx, state.h * 0.35);
    });

    clearBtn?.addEventListener("click", () => {
      state.blooms.length = 0;
      state.particles.length = 0;
      for (let i = 0; i < 18; i++) state.particles.push(new HeartParticle(rand(0, state.w), rand(0, state.h), rand(10, 18), false));
    });

    loveBtn?.addEventListener("click", () => {
      openLoveOverlay();
      const cx = state.w * 0.5;
      const cy = state.h * 0.38;
      heartBurst(cx, cy);
      fireworkBurst(cx, cy);
      state.fireworks.active = true;
      state.fireworks.until = state.t + (state.reducedMotion ? 2.8 : 6.0);
      state.fireworks.lastSpawn = 0;
    });

    loveOverlay?.addEventListener(
      "pointerdown",
      () => {
        closeLoveOverlay();
      },
      { passive: true }
    );

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!loveOverlay) return;
      closeLoveOverlay();
    });
  }

  function seedScene() {
    const baseY = state.h * 0.82;
    const n = clamp(Math.round(state.w / 190), 2, 5);
    for (let i = 0; i < n; i++) {
      const x = state.w * (0.2 + (i / (n - 1 || 1)) * 0.6) + rand(-16, 16);
      const scale = clamp(state.w / 600, 0.72, 1.15) * rand(0.9, 1.12);
      spawnBloom(x, baseY + rand(-12, 12), scale);
    }
  }

  function init() {
    setCanvasSize();
    makeBokeh();
    seedScene();
    initInteractions();
    requestAnimationFrame(render);
  }

  window.addEventListener(
    "resize",
    () => {
      setCanvasSize();
      makeBokeh();
    },
    { passive: true }
  );

  init();
})();

