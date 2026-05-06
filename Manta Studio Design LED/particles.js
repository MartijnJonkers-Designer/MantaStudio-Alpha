/* ============================================================
   INTERACTION — cursor crosshair + live HUD

   Cursor: direct pointer-driven (no lerp, no RAF).
   HUD:    pointermove updates instantly, AND a 90ms setInterval
           re-renders LAT/LON with the last-known mouse position
           plus a tiny ±0.0015 jitter so the readout flickers even
           when the cursor is still — "live system" feel.
   ============================================================ */

(function () {
  const cursor = document.getElementById("cursor");
  const hudLat = document.getElementById("hud-lat");
  const hudLon = document.getElementById("hud-lon");
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  let lastMouseX = window.innerWidth * 0.5;
  let lastMouseY = window.innerHeight * 0.5;

  function fmtCoord(v) { return (v >= 0 ? "+" : "") + v.toFixed(3); }

  function renderHUD(jitter) {
    if (!hudLat || !hudLon) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const jX = jitter ? (Math.random() - 0.5) * 0.0015 : 0;
    const jY = jitter ? (Math.random() - 0.5) * 0.0015 : 0;
    hudLat.textContent = fmtCoord((lastMouseY / h) - 0.5 + jY);
    hudLon.textContent = fmtCoord((lastMouseX / w) - 0.5 + jX);
  }

  /* Pointer: instant cursor update + instant HUD update (no jitter on movement
     so the readout responds 1:1 when actually being moved). */
  window.addEventListener("pointermove", (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (cursor && !isCoarsePointer) {
      cursor.style.setProperty("--cursor-x", e.clientX + "px");
      cursor.style.setProperty("--cursor-y", e.clientY + "px");
    }
    renderHUD(false);
  }, { passive: true });

  /* Live flicker: re-render HUD every 90ms with jitter — makes the
     readout feel "active" even when nothing is moving. */
  setInterval(() => renderHUD(true), 90);

  /* Initial paint */
  renderHUD(false);
})();