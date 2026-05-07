/* ============================================================
   AUROS — Liquid Engine v0.13 (3D point cloud topology)

   Architectural shift: OrthographicCamera + full-screen quad ->
   PerspectiveCamera + THREE.Points with 108,000 vertices in a
   BufferGeometry grid. The fbm + ripple math now lives in the
   VERTEX shader, displacing each point's Y axis to create real
   3D peaks and valleys.

   - 360 x 300 grid (108,000 points), 4.8 x 4.0 world units
   - Camera at (0, 1.0, 1.5), look at (0, 0, -0.5) — tilted ~27° down
   - Mouse projected to the ground plane via Raycaster
   - Sharp circular point discard (no anti-aliased blur)
   - Specular fake: peaks favor upper-left light direction
   - No post-processing — direct renderer.render() for max crispness
   ============================================================ */

import * as THREE from "three";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) {
    console.warn("[Auros] No #auros-canvas element found; engine not started.");
    return;
  }

  const SLATE = 0x1A1B26;

  /* -------- Scene + camera -------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SLATE);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.05,
    20
  );
  camera.position.set(0, 1.0, 1.5);
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
  renderer.setClearColor(SLATE, 1);

  /* -------- Geometry: 108,000 points in a regular XZ grid --------
     Y starts at 0 for every vertex; the vertex shader displaces Y
     each frame. The grid extends 4.8 x 4.0 world units, which the
     camera viewing-frustum compresses into a topographical horizon. */
  const GRID_W = 360;        // points across X
  const GRID_D = 300;        // points across Z
  const GRID_X = 4.8;        // world units across X
  const GRID_Z = 4.0;        // world units across Z
  const TOTAL  = GRID_W * GRID_D;   // 108,000

  const positions = new Float32Array(TOTAL * 3);
  for (let i = 0; i < GRID_D; i++) {
    for (let j = 0; j < GRID_W; j++) {
      const idx = (i * GRID_W + j) * 3;
      positions[idx + 0] = (j / (GRID_W - 1) - 0.5) * GRID_X;   // x
      positions[idx + 1] = 0.0;                                  // y (will be displaced)
      positions[idx + 2] = (i / (GRID_D - 1) - 0.5) * GRID_Z;   // z
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:      { value: 0 },
    uMouse:     { value: new THREE.Vector2(0, 0) },   // mouse projected to XZ ground plane
    uDisplace:  { value: 0 },
    uPointSize: { value: 5.5 },                        // base size; vertex scales by 1/depth
    uHeight:    { value: 0.18 },                       // peak height in world units
  };

  /* -------- Shaders -------- */
  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uDisplace;
    uniform float uPointSize;
    uniform float uHeight;

    varying float vHeight;
    varying vec2  vScreenUv;

    /* Stefan Gustavson 2D simplex noise (public domain). */
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

    float snoise(vec2 v) {
      const vec4 C = vec4( 0.211324865405187,  0.366025403784439,
                          -0.577350269189626,  0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                     + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0, x0),
                              dot(x12.xy, x12.xy),
                              dot(x12.zw, x12.zw)), 0.0);
      m = m * m;
      m = m * m;
      vec3 x  = 2.0 * fract(p * C.www) - 1.0;
      vec3 h  = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * snoise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 pos = position;
      vec2 p2  = pos.xz;            // 2D point on the ground plane

      /* Domain-warped fbm — same shape as v0.11/v0.12. */
      float t = uTime * 0.08;
      vec2 q = p2 * 1.6;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float h = fbm(q2 + vec2(t * 0.5));      // ~[-1, 1]

      /* Mouse ripple: bumps points up near the cursor's ground projection.
         exp falloff with radius 2.5; uDisplace JS-side decays exponentially. */
      vec2 toM   = p2 - uMouse;
      float d    = length(toM);
      float bump = exp(-d * 2.5) * uDisplace * 0.5;
      h += bump;

      /* Apply height to Y axis. */
      pos.y = h * uHeight;

      /* Standard MVP. */
      vec4 mvPos     = modelViewMatrix * vec4(pos, 1.0);
      gl_Position    = projectionMatrix * mvPos;

      /* Perspective-aware point size: distant points smaller, close points
         larger. Min 1px so they never disappear. */
      gl_PointSize = max(uPointSize / -mvPos.z, 1.0);

      /* Pass to fragment. */
      vHeight   = h * 0.5 + 0.5;                                // [0, 1]
      vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5; // 0..1 screen UV
    }
  `;

  const fragmentShader = /* glsl */ `
    varying float vHeight;
    varying vec2  vScreenUv;

    /* Palette.
       cValley = #1A1B26 (slate)
       cPeak   = #BB9AF7 (soft lavender) */
    const vec3 cValley = vec3(0.1020, 0.1059, 0.1490);
    const vec3 cPeak   = vec3(0.7333, 0.6039, 0.9686);

    void main() {
      /* Sharp circular point — no AA blur. */
      vec2 cc = gl_PointCoord - 0.5;
      float r2 = dot(cc, cc);
      if (r2 > 0.25) discard;

      /* Color by height. */
      vec3 col = mix(cValley, cPeak, smoothstep(0.20, 0.85, vHeight));

      /* Specular fake: peaks favoring upper-left light direction.
         Compute screen-space alignment with light vector (-1, +1) (top-left),
         clamp to [0, 1], multiply by height, sharpen with pow, tint cool. */
      vec2 toLight   = vec2(-1.0, 1.0);
      float align    = dot(normalize(toLight), (vScreenUv - 0.5) * 2.0);
      align          = clamp(align * 0.5 + 0.5, 0.0, 1.0);
      float spec     = pow(vHeight * align, 4.0) * 0.7;
      col           += spec * vec3(0.55, 0.55, 0.65);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: false,
    depthTest:   true,
    depthWrite:  true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /* -------- Mouse: raycast NDC -> ground plane (y=0) --------
     The cursor's screen position projects to a point on the y=0 plane in
     world space. That XZ position drives the ripple origin in the vertex
     shader. */
  const raycaster   = new THREE.Raycaster();
  const ndcMouse    = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint    = new THREE.Vector3();

  let mouseTargetX = 0, mouseTargetZ = 0;
  let mouseSmoothX = 0, mouseSmoothZ = 0;
  let mousePrevX   = 0, mousePrevZ   = 0;
  let displaceEnergy = 0;

  window.addEventListener("pointermove", (e) => {
    ndcMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    ndcMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndcMouse, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      mouseTargetX = hitPoint.x;
      mouseTargetZ = hitPoint.z;
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* -------- Tick — v0.2 snappy viscosity -------- */
  const TAU        = 0.60;
  const FOLLOW     = 0.12;
  const ENERGY_K   = 25.0;
  const ENERGY_MAX = 1.5;

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    mouseSmoothX += (mouseTargetX - mouseSmoothX) * FOLLOW;
    mouseSmoothZ += (mouseTargetZ - mouseSmoothZ) * FOLLOW;

    const dx = mouseTargetX - mousePrevX;
    const dz = mouseTargetZ - mousePrevZ;
    const speed = Math.sqrt(dx * dx + dz * dz);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    mousePrevX = mouseTargetX;
    mousePrevZ = mouseTargetZ;

    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmoothX, mouseSmoothZ);
    uniforms.uDisplace.value = displaceEnergy;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.13 — 3D point cloud topology · Three.js", THREE.REVISION,
              "·", TOTAL.toLocaleString(), "points");
})();