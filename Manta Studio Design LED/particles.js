/* ============================================================
   BACKGROUND SYSTEM — high-density canvas particles + manta-follow

   One RAF loop drives two coupled systems:
   1. Manta-follow:    smooths the cursor toward the .stage__manta-follow
                       wrapper via a CSS variable. Lerp factor gives the
                       "heavy/expensive" settle. Inner #manta keeps its
                       independent GSAP animations untouched.
   2. Particle field:  1100 (desktop) / 380 (mobile) tiny mint+white dots.
                       Repulsed by the manta within REPULSE_RADIUS.
                       Wake force in the manta's direction-of-motion when
                       the manta is moving fast enough to register.
                       Brownian drift keeps the field alive when idle.

   Pauses on visibility-hidden, single-frame fallback for reduced-motion.
   ============================================================ */

(function () {
  const canvas = document.getElementById("particles");
  const mantaFollow = document.getElementById("manta-follow");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const isMobile = window.innerWidth < 760;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------- Tuning -------- */
  const TARGET_COUNT          = isMobile ? 380 : 1100;
  const MINT_RATIO            = 0.30;     // 30% mint, 70% white
  const SIZE_MIN              = 0.5;
  const SIZE_MAX              = 1.6;
  const REPULSE_RADIUS        = isMobile ? 160 : 220;
  const REPULSE_RADIUS_2      = REPULSE_RADIUS * REPULSE_RADIUS;
  const REPULSE_STRENGTH      = 380;      // peak force at edge of repulse zone
  const WAKE_STRENGTH         = 0.045;    // multiplier on manta speed
  const WAKE_SPEED_THRESHOLD  = 0.04;     // squared px/frame, ~0.2 px/frame
  const DRIFT_STRENGTH        = 0.018;    // brownian random walk per axis
  const DAMPING               = 0.92;
  const FOLLOW_FACTOR         = 0.06;     // lerp toward target each frame
  const FOLLOW_STRENGTH_X     = 0.10;     // max manta drift = 10% of viewport width
  const FOLLOW_STRENGTH_Y     = 0.06;     // less vertical drift, feels grounded

  /* -------- State -------- */
  let w = 0, h = 0;
  let particles = [];
  let running = true;
  let mouseX = 0.5, mouseY = 0.5;       // normalized 0..1 of viewport
  let mantaOffsetX = 0, mantaOffsetY = 0;
  let lastMantaOffsetX = 0, lastMantaOffsetY = 0;

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (particles.length === 0) seed();
    else {
      // Reflow particles that ended up outside the new bounds
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
        vx: rand(-0.05, 0.05),
        vy: rand(-0.05, 0.05),
        r: SIZE_MIN + depth * (SIZE_MAX - SIZE_MIN),
        alpha: 0.35 + depth * 0.45,        // 0.35..0.80 — subtle depth
        mint: Math.random() < MINT_RATIO,
      };
    }
  }

  function updateMantaFollow() {
    const targetX = (mouseX - 0.5) * w * FOLLOW_STRENGTH_X;
    const targetY = (mouseY - 0.5) * h * FOLLOW_STRENGTH_Y;
    lastMantaOffsetX = mantaOffsetX;
    lastMantaOffsetY = mantaOffsetY;
    mantaOffsetX += (targetX - mantaOffsetX) * FOLLOW_FACTOR;
    mantaOffsetY += (targetY - mantaOffsetY) * FOLLOW_FACTOR;
    if (mantaFollow) {
      mantaFollow.style.setProperty("--manta-follow-x", mantaOffsetX.toFixed(2) + "px");
      mantaFollow.style.setProperty("--manta-follow-y", mantaOffsetY.toFixed(2) + "px");
    }
  }

  function step() {
    if (!running) return;

    updateMantaFollow();

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

    /* Pass 1: physics for ALL particles, render WHITE.
       Two render passes (white then mint) so we set fillStyle exactly twice
       per frame. globalAlpha varies per particle for atmospheric depth. */
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Brownian drift
      p.vx += (Math.random() - 0.5) * DRIFT_STRENGTH * 2;
      p.vy += (Math.random() - 0.5) * DRIFT_STRENGTH * 2;

      // Repulsion + wake (one pass through the manta-relative geometry)
      const dx = p.x - mantaCx;
      const dy = p.y - mantaCy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < REPULSE_RADIUS_2 && dist2 > 1) {
        const dist = Math.sqrt(dist2);
        const falloff = 1 - dist / REPULSE_RADIUS;
        // Repulsion: outward force, falls off toward edge of repulse zone
        const repulse = REPULSE_STRENGTH * falloff / dist2;
        p.vx += dx * repulse;
        p.vy += dy * repulse;
        // Wake: push in manta's direction of motion when it's moving
        if (mantaMoving) {
          const wake = WAKE_STRENGTH * mantaSpeed * falloff;
          p.vx += mantaDirX * wake;
          p.vy += mantaDirY * wake;
        }
      }

      // Damping prevents runaway velocity and gives particles a settle
      p.vx *= DAMPING;
      p.vy *= DAMPING;

      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Wrap edges (no respawn churn — the field is conservative)
      if (p.x < -2) p.x = w + 2;
      else if (p.x > w + 2) p.x = -2;
      if (p.y < -2) p.y = h + 2;
      else if (p.y > h + 2) p.y = -2;

      // Render only the white particles in this pass
      if (!p.mint) {
        ctx.globalAlpha = p.alpha;
        // fillRect is ~3x faster than arc+fill at sub-2px sizes,
        // and visually indistinguishable from a circle this small.
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }

    /* Pass 2: render MINT particles. Physics already updated in pass 1. */
    ctx.fillStyle = "rgba(124, 255, 203, 1)";    // --c-accent (#7CFFCB)
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.mint) {
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(step);
  }

  /* Pointer tracking — single source of truth for both manta-follow
     and particle repulsion. Touch-only devices keep mouseX/Y at 0.5
     (viewport center), so the manta stays centered without a pointer. */
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
    // Render a single static frame, no animation, no manta-follow
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      ctx.fillStyle = p.mint
        ? `rgba(124, 255, 203, ${p.alpha * 0.7})`
        : `rgba(255, 255, 255, ${p.alpha * 0.7})`;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    return;
  }

  resize();
  requestAnimationFrame(step);
})();