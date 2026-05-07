/* ============================================================
   AUROS — Ethereal Ice v0.28 (Pro Max tuning)

   User-supplied tuning pass:
     - White bg #FFFFFF, camera pulled in to z=4.0
     - Wider/sharper manta (wings ±1.6, nose 0.6, tail -0.9)
     - Heavier extrusion: depth 0.05, bevelThickness 0.20, 16 segments
     - Stronger refraction: thickness 2.5, ior 1.52, envMapIntensity 5.0
     - Slight metalness 0.1 for highlight catch
     - Drama lighting: KeyLight 7.0 + SpotLight rim 10.0
     - Brighter pulse (peak * 1.5) with sharper decay (exp(-phase*8))
   AmbientLight + fillLight + inner PointLight removed per user spec.
   Magnetic CTA block preserved from v0.27.
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  // PRO MAX COLORS
  const BG_COLOR = 0xFFFFFF; // Pure white background for high-end feel
  const ARCTIC_BLUE = 0x00FFFF;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 4.0); // Moved closer for impact
  camera.lookAt(0, 0, 0);          // explicit — safe with new camera position

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2; // Brighter exposure for "glints"

  // FIX: PRO MAX ENVIRONMENT
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  // Cranked the intensity of the environment generation
  scene.environment = pmrem.fromScene(envScene, 0.0).texture;

  // GEOMETRY: THE STEALTH MANTA (Fixed Coordinates)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.6); // Sharper Nose
  shape.bezierCurveTo(0.2, 0.6, 0.5, 0.1, 1.6, 0); // Extended Wings
  shape.bezierCurveTo(0.5, -0.2, 0.1, -0.3, 0.05, -0.9); // Tail
  shape.lineTo(-0.05, -0.9);
  shape.bezierCurveTo(-0.1, -0.3, -0.5, -0.2, -1.6, 0);
  shape.bezierCurveTo(-0.5, 0.1, -0.2, 0.6, 0, 0.6);

  const extrudeSettings = {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.2, // Thicker bevel = more light bending
    bevelSize: 0.1,
    bevelSegments: 16,
    curveSegments: 40
  };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();

  // MATERIAL: THE CRYSTAL MONOLITH
  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1, // Added slight metalness to catch highlights
    roughness: 0.01,
    transmission: 1.0,
    ior: 1.52,
    thickness: 2.5, // Increased for that "Deep Ice" look
    envMapIntensity: 5.0, // FORCED SPARKLE
    attenuationDistance: 0.4,
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    emissive: new THREE.Color(ARCTIC_BLUE),
    emissiveIntensity: 0.0,
  });

  const manta = new THREE.Mesh(geometry, mantaMaterial);
  // Slight tilt to catch the key light on the face
  manta.rotation.x = -0.2;
  scene.add(manta);

  // LIGHTING: THE "DIAMOND" SETUP
  const keyLight = new THREE.DirectionalLight(0xFFFFFF, 7.0); // Overdrive
  keyLight.position.set(1, 3, 2);
  scene.add(keyLight);

  const rimLight = new THREE.SpotLight(0xFFFFFF, 10.0);
  rimLight.position.set(-2, 2, -2); // Backlight to catch the edges
  scene.add(rimLight);

  /* -------- Tick loop -------- */
  function tick(tMs) {
    const tSec = tMs * 0.001;
    manta.rotation.y = Math.sin(tSec * 0.1) * 0.15; // Slower, heavier
    manta.position.y = Math.sin(tSec * 0.15) * 0.05;

    // Pulse Logic
    const phase = (tSec % 4.0) / 4.0;
    const peak = Math.exp(-phase * 8.0);
    mantaMaterial.emissiveIntensity = peak * 1.5; // Brighter glow

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Resize + Magnetic CTA logic stays the same
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* -------- Magnetic CTA (preserved from v0.27) --------
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
        const pull = 1.0 - dist / RADIUS;
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

  console.log("[Auros] v0.28 — Pro Max tuning · Three.js", THREE.REVISION);
})();