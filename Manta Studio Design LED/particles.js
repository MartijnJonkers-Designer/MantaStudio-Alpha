/* ============================================================
   INTERACTION RAF — cursor crosshair + HUD readouts

   The manta is now a static panel in the hero sidebar, so there's
   no manta-follow logic anymore. Just two things:
     1. Cursor crosshair: direct on pointermove, no lerp
     2. HUD LAT/LON updates: minimal RAF (or skip RAF entirely since
        we update on pointermove anyway — simpler to update inline)

   File kept under "particles.js" for HTML script-tag stability.
   ============================================================ */

(function () {
  const cursor = document.getElementById("cursor");
  const hudLat = document.getElementById("hud-lat");
  const hudLon = document.getElementById("hud-lon");

  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  function fmtCoord(v) { return (v >= 0 ? "+" : "") + v.toFixed(3); }

  /* Cursor crosshair: native cursor is hidden via CSS body { cursor: none }.
     This element IS the cursor. Direct pointer-driven (no lerp) for the
     precision-tool feel. */
  if (cursor && !isCoarsePointer) {
    window.addEventListener("pointermove", (e) => {
      cursor.style.setProperty("--cursor-x", e.clientX + "px");
      cursor.style.setProperty("--cursor-y", e.clientY + "px");
    }, { passive: true });
  }

  /* HUD readouts: piggyback on pointermove. Update inline — no RAF needed
     since the values only change when the pointer moves. */
  window.addEventListener("pointermove", (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (hudLat) hudLat.textContent = fmtCoord((e.clientY / h) - 0.5);
    if (hudLon) hudLon.textContent = fmtCoord((e.clientX / w) - 0.5);
  }, { passive: true });
})();