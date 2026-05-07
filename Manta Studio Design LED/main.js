/* ============================================================
   AUROS — Ethereal Ice (v0.20)

   v0.19 changed two things per brief:
     - Geometry: ExtrudeGeometry (manta silhouette) -> TorusKnotGeometry
       flattened on Z. NOTE: this is a knotted ribbon, not a manta
       silhouette. Procedural primitives can't yield the sculpted
       manta from the reference; a .glb model would.
     - Material params bumped per spec: thickness 5.0, roughness 0.05,
       ior 1.5. Inner PointLight added as a child of the mesh so it
       'glows from within' as the knot rotates.
     - Env map (RoomEnvironment + PMREMGenerator) preserved — the
       transmission needs something to refract.
     - CTA gets a silver border.
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) {
    console.error("[Auros] No #auros-canvas element found.");
    return;
  }

  const BG_COLOR    = 0xF5F5F7;
  const ARCTIC_BLUE = 0x00FFFF;

  /* -------- Scene + camera -------- */
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.set(0, 0.6, 2.5);
  camera.lookAt(0, 0, 0);

  /* -------- Renderer (per brief: antialias true, pixelRatio capped at 2) -------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(BG_COLOR, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  /* -------- Environment map for transmission/refraction --------
     RoomEnvironment is a small procedural studio scene that PMREM
     bakes into a cubemap. Without an env, transmission has nothing
     to refract through and the ice looks flat-tinted. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  /* -------- Geometry: flattened TorusKnot per brief --------
     TorusKnotGeometry(10, 3, 100, 16) at native scale is huge
     (bbox ~26x26x6). Scaled to 0.04 horizontal, 0.004 vertical
     so it fits the camera frame and reads as a flat ribbon. */
  const geometry = new THREE.TorusKnotGeometry(10, 3, 100, 16);
  geometry.scale(0.04, 0.04, 0.004);

  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color:               0xE8F4FF,    // pale icy blue
    transmission:        1.0,         // per brief
    thickness:           5.0,         // per brief — heavy refraction
    roughness:           0.05,        // per brief — near-smooth
    ior:                 1.5,         // per brief
    attenuationDistance: 1.5,
    attenuationColor:    new THREE.Color(0xC0DDE8),
    clearcoat:           0.7,
    clearcoatRoughness:  0.08,
    emissive:            new THREE.Color(ARCTIC_BLUE),
    emissiveIntensity:   0.0,         // animated by pulse
    side:                THREE.DoubleSide,
  });

  const manta = new THREE.Mesh(geometry, mantaMaterial);
  manta.rotation.x = -0.25;           // slight forward tilt to show depth
  scene.add(manta);

  /* -------- Inner glow PointLight --------
     Child of the mesh so it follows rotation/position. Pale icy
     blue, moderate intensity, range limited to within the knot. */
  const innerLight = new THREE.PointLight(0xC0E8FF, 1.5, 2.5, 1.5);
  innerLight.position.set(0, 0.05, 0);
  manta.add(innerLight);

  /* -------- Lights --------
     Soft ambient + directional gives the ice subtle highlights even
     where the env map is uniform. */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.4));

  const keyLight = new THREE.DirectionalLight(0xFFFFFF, 1.2);
  keyLight.position.set(1.5, 2.5, 1.0);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xCCDDFF, 0.5);
  fillLight.position.set(-1.5, 1.0, -1.0);
  scene.add(fillLight);

  /* -------- Resize -------- */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* -------- Tick: idle rock + cyan pulse -------- */
  const PULSE_PERIOD = 4.0;           // seconds between pulses
  function tick(tMs) {
    const tSec = tMs * 0.001;

    // Idle rocking — slow yaw + sine bob in Y
    manta.rotation.y = Math.sin(tSec * 0.30) * 0.18;
    manta.position.y = Math.sin(tSec * 0.45) * 0.04;

    // Cyan pulse: phase 0..1 over PULSE_PERIOD, with a sharp peak
    // near phase 0 that quickly decays. emissive set to arctic blue,
    // intensity oscillates between 0 and ~0.4.
    const phase = (tSec % PULSE_PERIOD) / PULSE_PERIOD;
    const peak  = Math.exp(-phase * 6.0);   // sharp falling exponential
    mantaMaterial.emissiveIntensity = peak * 0.40;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* -------- Magnetic CTA button --------
     When the cursor is within 100px of the button center, translate
     the button toward the cursor with strength scaling by proximity.
     Outside that radius, snap back to the centered base position. */
  const cta = document.getElementById("cta");
  if (cta) {
    const RADIUS = 100;
    const STRENGTH = 0.40;

    window.addEventListener("pointermove", (e) => {
      const rect = cta.getBoundingClientRect();
      const cx = rect.left + rect.width  * 0.5;
      const cy = rect.top  + rect.height * 0.5;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RADIUS) {
        const pull = 1.0 - dist / RADIUS;          // 0..1 (closer = stronger)
        const ox = dx * pull * STRENGTH;
        const oy = dy * pull * STRENGTH;
        cta.style.transform =
          `translate(calc(-50% + ${ox.toFixed(2)}px), ${oy.toFixed(2)}px)`;
      } else {
        cta.style.transform = "translate(-50%, 0)";
      }
    }, { passive: true });

    cta.addEventListener("click", () => {
      console.log("[Auros] CTA clicked — REQUEST BRIEFING");
    });
  }

  console.log("[Auros] v0.20 — Refractive TorusKnot · Three.js", THREE.REVISION);
})();