/* ============================================================
   AUROS — Sculpted Monolith v1.5

   Paradigm shift: the manta is no longer an extruded silhouette.
   It's now a height-field sampled across a high-resolution plane.
   Same closed-form "manta math" that drove the dot cloud earlier in
   the project — body thick (high Z), wings thin (low Z), tail trailing.

   What changed vs v1.4:
   - Removed: ExtrudeGeometry, Shape silhouette, displacementMap,
     Fresnel via onBeforeCompile, emissive cyan pulse, inner PointLight,
     EffectComposer / RenderPass / UnrealBloomPass / OutputPass.
   - Added: mantaHeight(x, y) analytic height function.
     PlaneGeometry(3.4, 1.7, 128, 128) sampled per-vertex.
     side: DoubleSide on the material so the relief reads from any angle.
   - Renderer now uses plain renderer.render(scene, camera). No bloom.

   Kept: gradient background, iridescent floor + ripples, RectAreaLight
   key + shadow-casting DirectionalLight + rim SpotLight + top-down
   pool SpotLight, manta sway animation, magnetic CTA.
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();

  /* ============================================================
     SCENE BACKGROUND — soft gradient
     ============================================================ */
  function makeBackgroundGradient() {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#FFFFFF");
    grad.addColorStop(1.0, "#FAFAFA");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  scene.background = makeBackgroundGradient();

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 4.0);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;          // restored from 0.8 — no bloom threshold to fight
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // PMREM environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.0).texture;

  /* ============================================================
     FLOOR RIPPLE TEXTURE — concentric iridescent bands
     ============================================================ */
  function makeRippleTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#F4F6FA";
    ctx.fillRect(0, 0, size, size);
    const cx = size * 0.5, cy = size * 0.5, maxR = size * 0.6;
    for (let r = 4; r < maxR; r += 3) {
      const t = r / maxR;
      const hue = 180 + Math.sin(t * 7.0) * 50 + 30 * t;
      const sat = 65 - t * 25;
      const light = 78 + Math.sin(t * 22.0) * 8;
      const alpha = 0.22 * (1.0 - t * 0.7);
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let r = 14; r < maxR; r += 28) {
      const t = r / maxR;
      const hue = 200 + Math.sin(t * 4.0) * 50;
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 70%, 88%, ${(0.35 * (1.0 - t)).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const edgeGrad = ctx.createRadialGradient(cx, cy, maxR * 0.7, cx, cy, size * 0.5);
    edgeGrad.addColorStop(0.0, "rgba(255,255,255,0)");
    edgeGrad.addColorStop(1.0, "rgba(255,255,255,1)");
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  const rippleMap = makeRippleTexture();

  /* ============================================================
     MANTA HEIGHT FUNCTION — closed-form analytic sculpt.

     Coordinates: x in [-1.6, 1.6] (wing tips), y in [-0.9, 0.6]
     (tail tip to nose). Returns Z thickness in [0, ~0.5].

     Body silhouette: parabolic taper between yFront and yBack,
     both shrinking quadratically with |x|.
     Body thickness: parabolic across both axes (peaks at midline,
     zero at silhouette edges) times wing taper (thick at center,
     thin at wing tip).
     Tail: narrow strip below body, thin pinch toward y=-0.9.
     Ribs: superimposed sinusoidal modulation, body-only.
     ============================================================ */
  function mantaHeight(x, y) {
    const ax = Math.abs(x);
    if (ax > 1.6) return 0;

    const xNorm = ax / 1.6;                          // 0 at midline, 1 at wing tip
    const taper = Math.max(0, 1 - xNorm * xNorm);    // parabolic silhouette taper
    const yFront =  0.60 * taper;                    // front edge at this x
    const yBack  = -0.30 * taper;                    // body back edge at this x

    // ----- Body region -----
    if (y >= yBack && y <= yFront) {
      const yMid  = (yFront + yBack) * 0.5;
      const yHalf = Math.max((yFront - yBack) * 0.5, 1e-3);
      const yLocal = (y - yMid) / yHalf;             // -1 .. +1 across body
      const yProfile = Math.max(0, 1 - yLocal * yLocal);   // 1 at midline, 0 at front/back
      const wingProfile = Math.pow(taper, 0.6);            // 1 at center, smooth taper

      let h = yProfile * wingProfile * 0.50;

      // Organic ribbing — fine sinusoidal modulation, body only.
      h += Math.sin(ax * 9.0)  * 0.018 * wingProfile;
      h += Math.sin(y  * 18.0) * 0.010 * wingProfile;

      return Math.max(0, h);
    }

    // ----- Tail region -----
    if (y < yBack && y > -0.9) {
      const tailY = (y + 0.9) / 0.6;                 // 0 at tip, 1 at base
      const tailWidth = 0.12 * tailY;
      if (ax > tailWidth) return 0;
      const tailX = ax / Math.max(tailWidth, 1e-3);
      return (1 - tailX * tailX) * tailY * 0.06;
    }

    return 0;
  }

  /* ============================================================
     SCULPTED PLANE GEOMETRY
     128x128 segments -> 16641 vertices.
     ============================================================ */
  const SEGMENTS = 128;
  const planeGeo = new THREE.PlaneGeometry(3.4, 1.7, SEGMENTS, SEGMENTS);
  const pos = planeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, mantaHeight(x, y));
  }
  pos.needsUpdate = true;
  planeGeo.computeVertexNormals();

  /* ============================================================
     MATERIAL — clean glass, no emissive paint
     ============================================================ */
  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 1.0,
    envMapIntensity: 3.0,
    attenuationDistance: 0.55,
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    side: THREE.DoubleSide      // sculpted relief reads from front and back
  });

  const manta = new THREE.Mesh(planeGeo, mantaMaterial);
  manta.castShadow = true;
  manta.receiveShadow = false;
  scene.add(manta);

  /* ============================================================
     FLOOR — iridescent ripple plane
     ============================================================ */
  const floorGeo = new THREE.PlaneGeometry(20, 20, 64, 64);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    map: rippleMap,
    metalness: 0.0,
    roughness: 0.35,
    transmission: 0.2,
    ior: 1.45,
    thickness: 0.5,
    transparent: true,
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.0;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ============================================================
     LIGHTING
     ============================================================ */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.3));

  // KEY: RectAreaLight — long rectangular highlights.
  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 8.0, 4.0, 1.0);
  keyLight.position.set(1, 3, 2);
  keyLight.lookAt(0, 0, 0);
  scene.add(keyLight);

  // SHADOW CASTER: low-intensity DirectionalLight.
  const shadowLight = new THREE.DirectionalLight(0xFFFFFF, 0.6);
  shadowLight.position.set(1, 3, 2);
  shadowLight.target.position.set(0, 0, 0);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(2048, 2048);
  shadowLight.shadow.camera.left   = -3;
  shadowLight.shadow.camera.right  =  3;
  shadowLight.shadow.camera.top    =  3;
  shadowLight.shadow.camera.bottom = -3;
  shadowLight.shadow.camera.near   = 0.1;
  shadowLight.shadow.camera.far    = 20;
  shadowLight.shadow.bias          = -0.0005;
  shadowLight.shadow.radius        = 4;
  scene.add(shadowLight);
  scene.add(shadowLight.target);

  // RIM: backlight from upper-back-left.
  const rimLight = new THREE.SpotLight(0xFFFFFF, 10.0);
  rimLight.position.set(-2, 2, -2);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight.target);
  scene.add(rimLight);

  // POOL: top-down SpotLight on floor.
  const poolLight = new THREE.SpotLight(0xFFFFFF, 60.0, 8.0, Math.PI / 7, 0.55, 1.4);
  poolLight.position.set(0, 4.0, 0);
  poolLight.target.position.set(0, -2.0, 0);
  scene.add(poolLight.target);
  scene.add(poolLight);

  /* ============================================================
     Tick loop — plain renderer.render. No bloom.
     ============================================================ */
  function tick(tMs) {
    const tSec = tMs * 0.001;
    manta.rotation.y = Math.sin(tSec * 0.1) * 0.15;
    manta.position.y = Math.sin(tSec * 0.15) * 0.05;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ============================================================
     Resize
     ============================================================ */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* ============================================================
     Magnetic CTA (preserved)
     ============================================================ */
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

  console.log("[Auros] v1.5 — Sculpted Monolith (height-field, no bloom) · Three.js", THREE.REVISION);
})();
