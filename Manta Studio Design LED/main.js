/* ============================================================
   AUROS — Liquid Engine v0.17 (Deep Sea Radar)

   Course correction from v0.16's "solid 3D terrain" toward a tiny-
   dots radar/sonar look. THREE.InstancedMesh -> THREE.Points,
   fbm dropped entirely in favor of pure rolling sine waves, mouse
   becomes a Y-only ripple effect (no XY displacement / no parted
   channel), bloom removed, palette back to navy + lavender.

   Pipeline: ShaderMaterial -> direct renderer.render() (no composer).
   ============================================================ */

import * as THREE from "three";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) {
    console.warn("[Auros] No #auros-canvas element found; engine not started.");
    return;
  }

  const NAVY = 0x01050F;

  /* -------- Scene + camera -------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.05,
    20
  );
  const camBaseY = 1.00;
  const camBaseZ = 1.50;
  camera.position.set(0, camBaseY, camBaseZ);
  camera.lookAt(0, 0, -0.5);

  /* -------- Renderer -------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(NAVY, 1);

  /* -------- Geometry: 480,000 Points in an XZ grid -------- */
  const GRID_W = 800;
  const GRID_D = 600;
  const GRID_X = 4.8;
  const GRID_Z = 4.0;
  const TOTAL  = GRID_W * GRID_D;

  const positions = new Float32Array(TOTAL * 3);
  for (let i = 0; i < GRID_D; i++) {
    for (let j = 0; j < GRID_W; j++) {
      const idx = (i * GRID_W + j) * 3;
      positions[idx + 0] = (j / (GRID_W - 1) - 0.5) * GRID_X;
      positions[idx + 1] = 0.0;
      positions[idx + 2] = (i / (GRID_D - 1) - 0.5) * GRID_Z;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:      { value: 0 },
    uMouse:     { value: new THREE.Vector2(0, 0) },
    uDisplace:  { value: 0 },
    uPointSize: { value: 4.0 },     // ~3-4 px at typical depth — small radar pip
    uHeight:    { value: 0.20 },
  };

  /* -------- Shaders -------- */
  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uDisplace;
    uniform float uPointSize;
    uniform float uHeight;

    varying float vHeight;

    void main() {
      vec3 pos = position;
      vec2 p2  = pos.xz;

      /* Pure sine-wave topography — no fbm, no jagged noise.
         Two overlaid sines: dominant X-rolling + secondary Z-rolling. */
      float h1 = sin(p2.x * 0.5 + uTime * 0.50) * 0.70;
      float h2 = sin(p2.z * 0.4 + uTime * 0.30) * 0.30;
      float h  = h1 + h2;

      /* ---- Mouse ripple: Y-axis only, no XY displacement ----
         Vertical lift gives a peak under the cursor; concentric rings
         emit outgoing sine waves that decay with uDisplace. */
      vec2 toM = p2 - uMouse;
      float d = length(toM);
      float envelope = exp(-d * 1.5) * uDisplace;

      // Vertical lift
      h += envelope * 0.30;

      // Concentric outgoing rings
      float ringPhase = d * 14.0 - uTime * 5.0;
      h += sin(ringPhase) * envelope * 0.25;

      /* Apply combined height to Y. */
      pos.y = h * uHeight;

      vec4 mvPos    = modelViewMatrix * vec4(pos, 1.0);
      gl_Position   = projectionMatrix * mvPos;
      gl_PointSize  = max(uPointSize / -mvPos.z, 1.0);

      vHeight = h * 0.5 + 0.5;
    }
  `;

  const fragmentShader = /* glsl */ `
    varying float vHeight;

    /* Lavender #BB9AF7. Single color modulated mildly by height for depth. */
    const vec3 cLavender = vec3(0.7333, 0.6039, 0.9686);

    void main() {
      /* Sharp circular point — no AA blur. */
      vec2 cc = gl_PointCoord - 0.5;
      float r2 = dot(cc, cc);
      if (r2 > 0.25) discard;

      /* Mild height-driven brightness — valleys dimmer, peaks full lavender.
         Stays within the lavender hue; no second color introduced. */
      vec3 col = cLavender * (0.55 + vHeight * 0.55);

      /* Flat 0.7 alpha on every point per the brief. */
      gl_FragColor = vec4(col, 0.70);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,           // opacity: 0.7 baked into fragment alpha
    depthTest:   true,
    depthWrite:  false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /* -------- Mouse: raycast NDC -> ground plane -------- */
  const raycaster   = new THREE.Raycaster();
  const ndcMouse    = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint    = new THREE.Vector3();

  let mouseTargetX = 0, mouseTargetZ = 0;
  let mouseSmoothX = 0, mouseSmoothZ = 0;
  let mousePrevX   = 0, mousePrevZ   = 0;
  let displaceEnergy = 0;

  let camTargetX = 0, camTargetY = 0;
  let camSmoothX = 0, camSmoothY = 0;
  let tiltTargetX = 0, tiltTargetZ = 0;
  let tiltSmoothX = 0, tiltSmoothZ = 0;

  window.addEventListener("pointermove", (e) => {
    const nx = e.clientX / window.innerWidth;
    const ny = e.clientY / window.innerHeight;

    ndcMouse.x =  nx * 2 - 1;
    ndcMouse.y = -(ny * 2 - 1);
    raycaster.setFromCamera(ndcMouse, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      mouseTargetX = hitPoint.x;
      mouseTargetZ = hitPoint.z;
    }

    /* Subtle camera parallax + mesh tilt — kept from v0.16. */
    camTargetX  =  (nx - 0.5) * 0.25;
    camTargetY  =  (0.5 - ny) * 0.15;
    tiltTargetX = -(ny - 0.5) * 0.08;
    tiltTargetZ = -(nx - 0.5) * 0.05;
  }, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* -------- Tick — viscous lerps, direct render -------- */
  const TAU         = 0.60;
  const FOLLOW      = 0.12;
  const ENERGY_K    = 25.0;
  const ENERGY_MAX  = 1.5;
  const TILT_LERP   = 0.04;
  const CAM_LERP    = 0.035;

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    /* Smoothed mouse position. */
    mouseSmoothX += (mouseTargetX - mouseSmoothX) * FOLLOW;
    mouseSmoothZ += (mouseTargetZ - mouseSmoothZ) * FOLLOW;

    /* Displacement energy — only used to fade ripple rings + lift. */
    const dx = mouseTargetX - mousePrevX;
    const dz = mouseTargetZ - mousePrevZ;
    mousePrevX = mouseTargetX;
    mousePrevZ = mouseTargetZ;

    const speed = Math.sqrt(dx * dx + dz * dz);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    /* Mesh tilt. */
    tiltSmoothX += (tiltTargetX - tiltSmoothX) * TILT_LERP;
    tiltSmoothZ += (tiltTargetZ - tiltSmoothZ) * TILT_LERP;
    points.rotation.x = tiltSmoothX;
    points.rotation.z = tiltSmoothZ;

    /* Camera parallax. */
    camSmoothX += (camTargetX - camSmoothX) * CAM_LERP;
    camSmoothY += (camTargetY - camSmoothY) * CAM_LERP;
    camera.position.set(camSmoothX, camBaseY + camSmoothY, camBaseZ);
    camera.lookAt(0, 0, -0.5);

    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmoothX, mouseSmoothZ);
    uniforms.uDisplace.value = displaceEnergy;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.17 — Deep Sea Radar · Three.js", THREE.REVISION,
              "·", TOTAL.toLocaleString(), "Points");
})();