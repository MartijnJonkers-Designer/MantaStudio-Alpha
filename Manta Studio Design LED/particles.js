/* ============================================================
   INTERACTION RAF — cursor crosshair + manta-follow + HUD

   File kept under the "particles.js" filename for HTML-script-tag stability,
   but the actual particle physics has been removed in the v4 stealth refit.
   This file now ONLY drives the three coupled interactions:
     1. Cursor crosshair: direct on pointermove, no lerp — precision-tool feel
     2. Manta-follow translate via CSS var on .stage__manta-follow
     3. HUD readouts (LAT/LON), updated each frame from mouse position
   ============================================================ */

(function () {
  const mantaFollow = document.getElementById("manta-follow");
  const cursor = document.getElementById("cursor");
  const hudLat = document.getElementById("hud-lat");
  const hudLon = document.getElementById("hud-lon");

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  /* Tuning */
  const FOLLOW_FACTOR_MANTA = 0.10;     /* tighter than v3's 0.06 — snappier track */
  const FOLLOW_STRENGTH_X   = 0.12;
  const FOLLOW_STRENGTH_Y   = 0.08;

  let w = window.innerWidth;
  let h = window.innerHeight;
  let mouseX = 0.5, mouseY = 0.5;
  let mantaOffsetX = 0, mantaOffsetY = 0;
  let running = true;

  function fmtCoord(v) { return (v >= 0 ? "+" : "") + v.toFixed(3); }

  function updateMantaFollow() {
    const targetX = (mouseX - 0.5) * w * FOLLOW_STRENGTH_X;
    const targetY = (mouseY - 0.5) * h * FOLLOW_STRENGTH_Y;
    mantaOffsetX += (targetX - mantaOffsetX) * FOLLOW_FACTOR_MANTA;
    mantaOffsetY += (targetY - mantaOffsetY) * FOLLOW_FACTOR_MANTA;
    if (mantaFollow) {
      mantaFollow.style.setProperty("--manta-follow-x", mantaOffsetX.toFixed(2) + "px");
      mantaFollow.style.setProperty("--manta-follow-y", mantaOffsetY.toFixed(2) + "px");
    }
  }

  function updateHUD() {
    if (hudLat) hudLat.textContent = fmtCoord(mouseY - 0.5);
    if (hudLon) hudLon.textContent = fmtCoord(mouseX - 0.5);
  }

  function step() {
    if (!running) return;
    updateMantaFollow();
    updateHUD();
    requestAnimationFrame(step);
  }

  /* Cursor crosshair: direct pointer-driven, no lerp. The native cursor is
     hidden via CSS (body { cursor: none }), so this element IS the cursor. */
  if (cursor && !isCoarsePointer) {
    window.addEventListener("pointermove", (e) => {
      cursor.style.setProperty("--cursor-x", e.clientX + "px");
      cursor.style.setProperty("--cursor-y", e.clientY + "px");
    }, { passive: true });
  }

  /* Single source of truth for mouse-driven systems */
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
    resizeTimer = setTimeout(() => {
      w = window.innerWidth;
      h = window.innerHeight;
    }, 120);
  });

  if (prefersReduced) {
    /* Static: render HUD once at center, no RAF, no follow. */
    updateHUD();
    return;
  }

  requestAnimationFrame(step);
})();