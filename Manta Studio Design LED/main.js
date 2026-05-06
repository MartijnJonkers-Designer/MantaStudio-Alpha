/* ============================================================
   AUROS — Liquid Engine v0.1 (baseline)

   Step 1: load Three.js, mount an empty WebGL scene to the
   #auros-canvas, render in a RAF tick. The scene is empty on
   purpose — this commit establishes that the engine is alive
   and the render loop is ticking. Liquid logic comes in later steps.
   ============================================================ */

import * as THREE from "https://unpkg.com/three@0.170.0/build/three.module.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) {
    console.warn("[Auros] No #auros-canvas element found; engine not started.");
    return;
  }

  /* Scene + camera + renderer */
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,                                       // fov
    window.innerWidth / window.innerHeight,   // aspect
    0.1,                                      // near
    1000                                      // far
  );
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 1);

  /* Resize handling */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* Tick — empty scene for now, but the loop is alive. */
  function tick() {
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  console.log("[Auros] Liquid Engine v0.1 baseline online — Three.js", THREE.REVISION);
})();