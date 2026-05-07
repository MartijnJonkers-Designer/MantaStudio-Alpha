/* ============================================================
   AUROS — Liquid Engine v0.18 (minimal hard-reset baseline)

   Stripped to the absolute minimum that renders. No mouse, no tilt,
   no parallax, no raycaster, no post-processing. If THIS doesn't
   show lavender dots on navy, the problem is outside the code.

   - 30,000 THREE.Points in a 200 x 150 grid
   - Pure sine-wave displacement (no fbm, no ripple, no bump)
   - 3 uniforms: uTime, uPointSize, uHeight (each used in shader)
   - Sharp circular discard, no transparency edge cases
   - Direct renderer.render(), no composer
   ============================================================ */

import * as THREE from "three";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) {
    console.error("[Auros] No #auros-canvas element found.");
    return;
  }

  const NAVY = 0x01050F;

  /* -------- Scene + camera -------- */
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.0, 2.0);
  camera.lookAt(0, 0, 0);

  /* -------- Renderer -------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(NAVY, 1);

  /* -------- Geometry: 30,000 Points -------- */
  const GW = 200;
  const GD = 150;
  const TOTAL = GW * GD;
  const positions = new Float32Array(TOTAL * 3);
  let i = 0;
  for (let z = 0; z < GD; z++) {
    for (let x = 0; x < GW; x++) {
      positions[i++] = (x / (GW - 1) - 0.5) * 4.0;
      positions[i++] = 0.0;
      positions[i++] = (z / (GD - 1) - 0.5) * 3.0;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  /* -------- Uniforms (3 total, all consumed by shader) -------- */
  const uniforms = {
    uTime:      { value: 0 },
    uPointSize: { value: 4.0 },
    uHeight:    { value: 0.30 },
  };

  /* -------- Vertex shader -------- */
  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uPointSize;
    uniform float uHeight;

    varying float vHeight;

    void main() {
      vec3 pos = position;

      // Two overlaid sines — smooth rolling left-to-right primary wave
      // plus a secondary cross-wave for organic variation.
      float h1 = sin(pos.x * 0.70 + uTime * 0.60) * 0.70;
      float h2 = sin(pos.z * 0.50 + uTime * 0.40) * 0.30;
      float h  = h1 + h2;

      pos.y = h * uHeight;

      vec4 mv  = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = max(uPointSize / -mv.z, 1.0);

      vHeight = h * 0.5 + 0.5;
    }
  `;

  /* -------- Fragment shader -------- */
  const fragmentShader = /* glsl */ `
    varying float vHeight;

    void main() {
      // Sharp circular point — no AA, no transparency edge cases.
      vec2 cc = gl_PointCoord - 0.5;
      if (dot(cc, cc) > 0.25) discard;

      vec3 lavender = vec3(0.7333, 0.6039, 0.9686);
      vec3 col = lavender * (0.55 + vHeight * 0.55);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: false,           // opaque + discard, no blending edge cases
    depthTest:   true,
    depthWrite:  true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /* -------- Tick — direct render, no extras -------- */
  function tick(tMs) {
    uniforms.uTime.value = tMs * 0.001;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.18 — minimal baseline · Three.js", THREE.REVISION,
              "·", TOTAL.toLocaleString(), "Points");
})();