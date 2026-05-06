/* ============================================================
   BACKGROUND SYSTEM — sensor-grain field + manta-follow + mouse-glow + HUD

   Stealth/Laboratory aesthetic. One RAF loop drives:
     1. Manta-follow translate (lerp 0.06)        — heavy/expensive feel
     2. Mouse-glow translate    (lerp 0.18)        — reticle feel
     3. HUD readouts            (every frame)      — LAT/LON tracker
     4. Particle field          (2000 desktop)     — sensor-grain flicker
        - All white (no mint per Monochrome+1)
        - Per-frame alpha modulation = high-ISO noise
        - Repulsion + wake from manta center
        - Drift reduced; particles are mostly stationary

   Pauses on visibility-hidden, single-frame fallback for reduced-motion.
   ============================================================ */

(function () {
  const canvas = document.getElementById("particles");
  const mantaFollow = document.getElementById("manta-follow");
  const mouseGlow = document.getElementById("mouse-glow");
  const hudLat = document.getElementById("hud-lat");
  const hudLon = document.getElementById("hud-lon");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const isMobile = window.innerWidth < 760;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------- Tuning -------- */
  const TARGET_COUNT          = isMobile ? 700 : 2000;
  const SIZE_MIN              = 0.4;
  const SIZE_MAX              = 1.0;
  const FLICKER_AMOUNT        = 0.65;     // alpha varies ±32.5% per frame
  const REPULSE_RADIUS        = isMobile ? 160 : 220;
  const REPULSE_RADIUS_2      = REPULSE_RADIUS * REPULSE_RADIUS;
  const REPULSE_STRENGTH      = 380;
  const WAKE_STRENGTH         = 0.045;
  const WAKE_SPEED_THRESHOLD  = 0.04;
  const DRIFT_STRENGTH        = 0.008;    // halved — grain is mostly static
  const DAMPING               = 0.92;
  const FOLLOW_FACTOR_MANTA   = 0.06;     // heavy/expensive settle
  const FOLLOW_FACTOR_GLOW    = 0.18;     // tighter — reticle pulls toward cursor
  const FOLLOW_STRENGTH_X     = 0.10;
  const FOLLOW_STRENGTH_Y     = 0.06;

  /* -------- State -------- */
  let w = 0, h = 0;
  let particles = [];
  let running = true;
  let mouseX = 0.5, mouseY = 0.5;
  let mantaOffsetX = 0, mantaOffsetY = 0;
  let lastMantaOffsetX = 0, lastMantaOffsetY = 0;
  let glowX = 0, glowY = 0;

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function fmtCoord(v) { return (v >= 0 ? "+" : "") + v.toFixed(3); }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    glowX = w * 0.5;
    glowY = h * 0.5;
    if (particles.length === 0) seed();
    else {
      for (const p of particles) {
        if (p.x < 0 || p.x > w) p.x = rand(0, w);
        if (p.y < 0 || p.y > h) p.y = rand(0, h);
      }
    }
  }

  function seed() {
    particles = new Array(TARGET_COUNT);
    for (let i = 0; i < TARGET_COUNT; i++) {
      const depth = Math.random();
      particles[i] = {
        x: rand(0, w),
        y: rand(0, h),
        vx: 0, vy: 0,
        r: SIZE_MIN + depth * (SIZE_MAX - SIZE_MIN),
        alpha: 0.30 + depth * 0.45,        // 0.30..0.75 base
      };
    }
  }

  function updateMantaFollow() {
    const targetX = (mouseX - 0.5) * w * FOLLOW_STRENGTH_X;
    const targetY = (mouseY - 0.5) * h * FOLLOW_STRENGTH_Y;
    lastMantaOffsetX = mantaOffsetX;
    lastMantaOffsetY = mantaOffsetY;
    mantaOffsetX += (targetX - mantaOffsetX) * FOLLOW_FACTOR_MANTA;
    mantaOffsetY += (targetY - mantaOffsetY) * FOLLOW_FACTOR_MANTA;
    if (mantaFollow) {
      mantaFollow.style.setProperty("--manta-follow-x", mantaOffsetX.toFixed(2) + "px");
      mantaFollow.style.setProperty("--manta-follow-y", mantaOffsetY.toFixed(2) + "px");
    }
  }

  function updateMouseGlow() {
    const tx = mouseX * w;
    const ty = mouseY * h;
    glowX += (tx - glowX) * FOLLOW_FACTOR_GLOW;
    glowY += (ty - glowY) * FOLLOW_FACTOR_GLOW;
    if (mouseGlow) {
      mouseGlow.style.setProperty("--mouse-x", glowX.toFixed(2) + "px");
      mouseGlow.style.setProperty("--mouse-y", glowY.toFixed(2) + "px");
    }
  }

  function updateHUD() {
    if (hudLat) hudLat.textContent = fmtCoord(mouseY - 0.5);
    if (hudLon) hudLon.textContent = fmtCoord(mouseX - 0.5);
  }

  function step() {
    if (!running) return;

    updateMantaFollow();
    updateMouseGlow();
    updateHUD();

    const mantaCx = w * 0.5 + mantaOffsetX;
    const mantaCy = h * 0.5 + mantaOffsetY;
    const mantaVx = mantaOffsetX - lastMantaOffsetX;
    const mantaVy = mantaOffsetY - lastMantaOffsetY;
    const mantaSpeed2 = mantaVx * mantaVx + mantaVy * mantaVy;
    const mantaMoving = mantaSpeed2 > WAKE_SPEED_THRESHOLD;
    let mantaSpeed = 0, mantaDirX = 0, mantaDirY = 0;
    if (mantaMoving) {
      mantaSpeed = Math.sqrt(mantaSpeed2);
      mantaDirX = mantaVx / mantaSpeed;
      mantaDirY = mantaVy / mantaSpeed;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 1)";

    /* Single render pass — all particles are white now (Monochrome+1).
       fillStyle set once, globalAlpha varies per particle for flicker. */
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Subtle brownian — sensor grain is mostly stationary
      p.vx += (Math.random() - 0.5) * DRIFT_STRENGTH * 2;
      p.vy += (Math.random() - 0.5) * DRIFT_STRENGTH * 2;

      // Repulsion + wake from manta
      const dx = p.x - mantaCx;
      const dy = p.y - mantaCy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < REPULSE_RADIUS_2 && dist2 > 1) {
        const dist = Math.sqrt(dist2);
        const falloff = 1 - dist / REPULSE_RADIUS;
        const repulse = REPULSE_STRENGTH * falloff / dist2;
        p.vx += dx * repulse;
        p.vy += dy * repulse;
        if (mantaMoving) {
          const wake = WAKE_STRENGTH * mantaSpeed * falloff;
          p.vx += mantaDirX * wake;
          p.vy += mantaDirY * wake;
        }
      }

      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;

      // Wrap edges
      if (p.x < -2) p.x = w + 2;
      else if (p.x > w + 2) p.x = -2;
      if (p.y < -2) p.y = h + 2;
      else if (p.y > h + 2) p.y = -2;

      // Flicker: alpha * (0.675..1.325) for high-ISO sensor-noise feel
      const flickerAlpha = p.alpha * (1 - FLICKER_AMOUNT * 0.5 + Math.random() * FLICKER_AMOUNT);
      ctx.globalAlpha = flickerAlpha;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(step);
  }

  /* Pointer tracking — single source of truth for everything */
  window.addEventListener("pointermove", (e) => {
    mouseX = e.clientX / w;
    mouseY = e.clientY / h;
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      requestAnimationFrame(step);
    }
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  if (prefersReduced) {
    resize();
    running = false;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    for (const p of particles) {
      ctx.globalAlpha = p.alpha * 0.7;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
    return;
  }

  resize();
  requestAnimationFrame(step);
})();