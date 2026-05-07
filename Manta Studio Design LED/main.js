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
  camera.position.set(0, 0, 5.0);          // wings span ~75% of screen at FOV 45
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

  /* -------- Geometry: cubic-Bezier manta silhouette per v0.24 vertex map --------
     Pre-bevel bbox: 3.0 x 1.3 (X: -1.5..+1.5, Y: -0.8..+0.5).
     Wings extend wider; tail extends deeper than v0.23 — sharper sweep.
     Bevel 0.05 is only 1.6% of width — keeps wing tips pointy.
     Final bbox ~3.1 x 1.4 x 0.22 — wings span ~75% of screen at z=5.0. */
  const mantaShape = new THREE.Shape();
  mantaShape.moveTo(0,    0.5);                                       // Head
  mantaShape.bezierCurveTo( 0.3,  0.5,   0.8,  0.2,   1.5,  0);       // Top of right wing -> tip
  mantaShape.bezierCurveTo( 0.8, -0.2,   0.2, -0.3,   0.05, -0.8);    // Bottom of right wing -> tail
  mantaShape.lineTo(-0.05, -0.8);                                     // Tail tip
  mantaShape.bezierCurveTo(-0.2, -0.3,  -0.8, -0.2,  -1.5,  0);       // Bottom of left wing -> tip
  mantaShape.bezierCurveTo(-0.8,  0.2,  -0.3,  0.5,   0,    0.5);     // Top of left wing -> head

  const extrudeSettings = {
    depth:           0.02,    // per v0.24 brief — very thin slab
    bevelEnabled:    true,
    bevelSegments:   3,       // per v0.24 brief
    bevelSize:       0.05,    // per v0.24 brief — small bevel preserves sharp tips
    bevelThickness:  0.10,    // per v0.24 brief
    curveSegments:   32,      // dense sampling so cubic Beziers stay smooth
  };
  const geometry = new THREE.ExtrudeGeometry(mantaShape, extrudeSettings);
  geometry.center();
  /* No rotateX — geometry stays in XY plane facing the camera at z=5. */

  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color:               0xFFFFFF,    // pure white — ice color comes from env
    metalness:           0.0,
    transmission:        1.0,         // per v0.24 brief
    thickness:           2.0,         // per v0.24 brief (down from 2.5)
    roughness:           0.02,
    ior:                 1.5,         // per v0.24 brief
    envMapIntensity:     3.0,         // per v0.24 brief (up from 2.5)
    attenuationDistance: 1.5,
    attenuationColor:    new THREE.Color(0xFFFFFF),  // white — no internal blue tint
    transparent:         true,        // per v0.24 brief
    opacity:             1.0,         // per v0.24 brief
    emissive:            new THREE.Color(ARCTIC_BLUE),
    emissiveIntensity:   0.0,         // animated by pulse
    side:                THREE.DoubleSide,
    /* clearcoat removed in v0.24 — was contributing to 'plastic' feel */
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

  console.log("[Auros] v0.24 — Vertex-Mapped Manta · Three.js", THREE.REVISION);
})();