/* ============================================================
   INTERACTION — cursor crosshair + HUD readouts

   No particles, no manta-follow, no RAF — the manta is now a static
   icon and the cursor / HUD just react to pointermove inline.
   File kept under "particles.js" for HTML script-tag stability.
   ============================================================ */

(function () {
  const cursor = document.getElementById("cursor");
  const hudLat = document.getElementById("hud-lat");
  const hudLon = document.getElementById("hud-lon");
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  function fmtCoord(v) { return (v >= 0 ? "+" : "") + v.toFixed(3); }

  window.addEventListener("pointermove", (e) => {
    if (cursor && !isCoarsePointer) {
      cursor.style.setProperty("--cursor-x", e.clientX + "px");
      cursor.style.setProperty("--cursor-y", e.clientY + "px");
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (hudLat) hudLat.textContent = fmtCoord((e.clientY / h) - 0.5);
    if (hudLon) hudLon.textContent = fmtCoord((e.clientX / w) - 0.5);
  }, { passive: true });
})();