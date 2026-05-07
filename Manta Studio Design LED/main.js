/* ============================================================
   AUROS — Ethereal Ice (v0.21)

   Pivots the geometry from v0.20's TorusKnot back to an extruded
   manta-wing silhouette — a 10-point aerodynamic chevron Shape with
   heavy bevel. Material, env map, inner glow, pulse, HUDs, magnetic
   CTA all preserved from v0.20.

   - 10-point Shape pre-bevel ~0.8 x 0.7 units
   - ExtrudeGeometry with depth 0.10, bevelSize 0.50, bevelThickness 0.50
     (per brief — heavy bevel rounds the slab into a faceted gemstone)
   - 8 bevel segments for smooth large-bevel curves
   - MeshPhysicalMaterial unchanged: transmission 1.0, thickness 5.0,
     roughness 0.05, ior 1.5
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
  camera.position.set(0, 0, 4);            // per v0.23 — head-on view
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

  /* -------- Geometry: precision manta silhouette via quadraticCurveTo --------
     Per v0.23 brief — coordinate map drawn with smooth Bezier curves
     for swept aerodynamic wings. Pre-bevel bbox: 2.4 x 1.0 (X: -1.2..+1.2,
     Y: -0.6..+0.4). Bevel adds 0.10 outward + 0.15 each side in Z.
     Final bbox ~2.6 x 1.2 x 0.35 — head-on visible at camera z=4 / FOV 45. */
  const mantaShape = new THREE.Shape();
  mantaShape.moveTo(0.0, 0.4);                              // Nose / head
  mantaShape.quadraticCurveTo( 0.1,  0.4,   1.2,  0.0);     // -> right wing tip
  mantaShape.quadraticCurveTo( 0.1, -0.2,   0.0, -0.6);     // -> tail point
  mantaShape.quadraticCurveTo(-0.1, -0.2,  -1.2,  0.0);     // -> left wing tip
  mantaShape.quadraticCurveTo(-0.1,  0.4,   0.0,  0.4);     // -> back to nose

  const extrudeSettings = {
    depth:           0.05,    // per v0.23 brief — flat aerodynamic monolith
    bevelEnabled:    true,
    bevelSegments:   8,       // per v0.23 brief
    bevelSize:       0.10,    // per v0.23 brief
    bevelThickness:  0.15,    // per v0.23 brief
    curveSegments:   24,      // smooth quadratic curves
  };
  const geometry = new THREE.ExtrudeGeometry(mantaShape, extrudeSettings);
  geometry.center();
  /* No rotateX — geometry stays in XY plane so its broad face points
     at the camera (which is now head-on at z=4). */

  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color:               0xFFFFFF,    // per v0.23 brief — pure white, ice from env
    metalness:           0.0,         // per v0.23 brief
    transmission:        1.0,
    thickness:           2.5,
    roughness:           0.02,        // per v0.23 brief — near-mirror smooth
    ior:                 1.5,
    envMapIntensity:     2.5,         // per v0.23 brief — boost env reflections
    attenuationDistance: 1.5,
    attenuationColor:    new THREE.Color(0xC0DDE8),
    clearcoat:           0.7,
    clearcoatRoughness:  0.08,
    emissive:            new THREE.Color(ARCTIC_BLUE),
    emissiveIntensity:   0.0,         // animated by pulse
    side:                THREE.DoubleSide,
  });

  const manta = new THREE.Mesh(geometry, mantaMaterial);
  /* No initial pitch tilt — head-on camera view is the point. */
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

    // Idle rocking — slow yaw around vertical (silhouette stays visible
    // since manta now lies in XY plane facing camera) + small bob.
    manta.rotation.y = Math.sin(tSec * 0.15) * 0.20;
    manta.rotation.x = Math.sin(tSec * 0.20) * 0.06;
    manta.position.y = Math.sin(tSec * 0.20) * 0.04;

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

  console.log("[Auros] v0.23 — Precision Manta Silhouette · Three.js", THREE.REVISION);
})();