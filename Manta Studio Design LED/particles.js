/* ============================================================
   MARINE SNOW — lightweight canvas particle system
   Drifting depth-layered motes. Auto-scales to viewport,
   pauses when tab is hidden, respects reduced-motion.
   ============================================================ */

(function () {
  const canvas = document.getElementById("particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  let w = 0, h = 0;
  let particles = [];
  let running = true;
  let pointerX = 0.5, pointerY = 0.5;

  function targetCount() {
    const area = window.innerWidth * window.innerHeight;
    // Slightly lower density than v1 — keeps mobile silky
    return Math.min(110, Math.max(35, Math.floor(area / 11000)));
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function seed() {
    const n = targetCount();
    particles = [];
    for (let i = 0; i < n; i++) particles.push(makeParticle(true));
  }

  function makeParticle(initial) {
    const layer = Math.random();
    const depth = layer < 0.55 ? 0 : layer < 0.85 ? 1 : 2;
    const sizeByDepth   = [[0.6, 1.4], [1.2, 2.4], [2.0, 3.6]][depth];
    const speedByDepth  = [0.06, 0.14, 0.26][depth];
    const opacityByDepth = [0.22, 0.42, 0.65][depth];

    return {
      x: rand(0, w),
      y: initial ? rand(0, h) : rand(-40, -10),
      r: rand(sizeByDepth[0], sizeByDepth[1]),
      vy: speedByDepth * rand(0.7, 1.3),
      vx: rand(-0.06, 0.06),
      drift: rand(0, Math.PI * 2),
      driftSpeed: rand(0.003, 0.012),
      driftAmp: rand(0.2, 0.7),
      alpha: opacityByDepth * rand(0.6, 1),
      depth,
    };
  }

  function step() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);

    const px = (pointerX - 0.5) * 12;
    const py = (pointerY - 0.5) * 6;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      p.drift += p.driftSpeed;
      p.x += p.vx + Math.sin(p.drift) * p.driftAmp * 0.05;
      p.y += p.vy;

      const dx = p.x + px * (p.depth + 1) * 0.3;
      const dy = p.y + py * (p.depth + 1) * 0.3;

      if (p.y - p.r > h + 20 || p.x < -40 || p.x > w + 40) {
        Object.assign(p, makeParticle(false));
        continue;
      }

      const grd = ctx.createRadialGradient(dx, dy, 0, dx, dy, p.r * 3);
      grd.addColorStop(0,   `rgba(255, 255, 255, ${p.alpha})`);
      grd.addColorStop(0.4, `rgba(220, 230, 245, ${p.alpha * 0.4})`);
      grd.addColorStop(1,   "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(dx, dy, p.r * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(step);
  }

  // Pointer parallax (also wired to touch via pointer events)
  window.addEventListener("pointermove", (e) => {
    pointerX = e.clientX / w;
    pointerY = e.clientY / h;
  }, { passive: true });

  // Pause when tab hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      requestAnimationFrame(step);
    }
  });

  // Respect reduced motion — render a single frame and stop
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    resize();
    running = false;
    requestAnimationFrame(() => {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(p => {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    return;
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  resize();
  requestAnimationFrame(step);
})();