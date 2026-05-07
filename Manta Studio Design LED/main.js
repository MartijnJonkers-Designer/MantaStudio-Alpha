/* ============================================================
   AUROS — Liquid Engine v0.14 (Manta propulsion physics)

   v0.13 baseline: 108k-point BufferGeometry grid with vertex-shader
   fbm displacement, perspective camera, raycast mouse->ground.
   v0.14 layers in 'manta' physics:
     - Sine wing-flap wave traveling left->right (long wavelength)
     - Mouse pushes points radially in XY + motion-direction wake
     - Valley dots fade toward transparent; peak dots glow brighter
     - Subtle scene tilt on points group based on mouse position
   Motion stays viscous — slow lerp factors throughout.
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

  /* -------- Geometry: 108,000 points in a regular XZ grid -------- */
  const GRID_W = 360;
  const GRID_D = 300;
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
    uMouse:     { value: new THREE.Vector2(0, 0) },     // ground-plane projection
    uMouseVel:  { value: new THREE.Vector2(0, 0) },     // smoothed velocity vector
    uDisplace:  { value: 0 },
    uPointSize: { value: 5.5 },
    uHeight:    { value: 0.18 },
  };

  /* -------- Shaders -------- */
  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform vec2  uMouseVel;
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
      vec2 p2  = pos.xz;

      /* Domain-warped fbm height (existing). */
      float t = uTime * 0.08;
      vec2 q = p2 * 1.6;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float h = fbm(q2 + vec2(t * 0.5));

      /* Manta wing flap: long-wavelength sine traveling left -> right.
         freq 0.7 -> wavelength ~9 units (>1 grid width).
         time mult 0.7 -> period ~9 seconds. Slow, rhythmic. */
      float wing = sin(pos.x * 0.7 + uTime * 0.7) * 0.45;
      h += wing;

      /* Mouse interaction: vertical bump + radial XY push + motion wake. */
      vec2 toM = p2 - uMouse;
      float d = length(toM);
      float falloff = exp(-d * 2.5) * uDisplace;

      // 1. Vertical bump (peaks rise where cursor is)
      h += falloff * 0.40;

      // 2. Radial XY push — particles flee the cursor's ground projection
      vec2 pushDir = (d > 0.001) ? toM / d : vec2(0.0);
      pos.x += pushDir.x * falloff * 0.04;
      pos.z += pushDir.y * falloff * 0.04;

      // 3. Motion-direction wake — particles get carried in cursor's motion direction.
      //    Combined with the radial push, this produces a streamlined trail.
      vec2 wake = uMouseVel * exp(-d * 2.0) * 0.10;
      pos.x += wake.x;
      pos.z += wake.y;

      /* Apply combined height to Y. */
      pos.y = h * uHeight;

      /* Standard MVP. */
      vec4 mvPos     = modelViewMatrix * vec4(pos, 1.0);
      gl_Position    = projectionMatrix * mvPos;

      /* Perspective-aware point size. */
      gl_PointSize = max(uPointSize / -mvPos.z, 1.0);

      /* Pass to fragment. */
      vHeight   = h * 0.5 + 0.5;
      vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
    }
  `;

  const fragmentShader = /* glsl */ `
    varying float vHeight;
    varying vec2  vScreenUv;

    /* Palette. */
    const vec3 cValley = vec3(0.1020, 0.1059, 0.1490);
    const vec3 cPeak   = vec3(0.7333, 0.6039, 0.9686);

    void main() {
      /* Sharp circular point. */
      vec2 cc = gl_PointCoord - 0.5;
      float r2 = dot(cc, cc);
      if (r2 > 0.25) discard;

      /* Color by height. */
      vec3 col = mix(cValley, cPeak, smoothstep(0.20, 0.85, vHeight));

      /* Crest glow boost — peaks brighten beyond their base lavender. */
      col *= 0.70 + smoothstep(0.40, 0.90, vHeight) * 0.55;

      /* Specular fake — peaks favoring upper-left light. */
      vec2 toLight = normalize(vec2(-1.0, 1.0));
      float align = dot(toLight, (vScreenUv - 0.5) * 2.0);
      align = clamp(align * 0.5 + 0.5, 0.0, 1.0);
      float spec = pow(vHeight * align, 4.0) * 0.75;
      col += spec * vec3(0.55, 0.55, 0.65);

      /* Dynamic opacity: valleys fade, peaks stay solid. */
      float alpha = 0.25 + 0.75 * smoothstep(0.0, 0.65, vHeight);

      gl_FragColor = vec4(col, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,           // valley dots use alpha
    depthTest:   true,
    depthWrite:  false,          // avoid sort artifacts on overlapping translucent points
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
  let mouseVelX    = 0, mouseVelZ    = 0;          // smoothed velocity
  let displaceEnergy = 0;

  /* Tilt state: lerps toward target driven by raw NDC mouse position. */
  let tiltTargetX = 0, tiltTargetZ = 0;
  let tiltSmoothX = 0, tiltSmoothZ = 0;

  window.addEventListener("pointermove", (e) => {
    const nx = e.clientX / window.innerWidth;
    const ny = e.clientY / window.innerHeight;

    /* Raycast for ground-plane mouse position. */
    ndcMouse.x =  nx * 2 - 1;
    ndcMouse.y = -(ny * 2 - 1);
    raycaster.setFromCamera(ndcMouse, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      mouseTargetX = hitPoint.x;
      mouseTargetZ = hitPoint.z;
    }

    /* Tilt: mouse top -> tilt forward (rotation.x positive),
             mouse right -> tilt right side down (rotation.z negative).
       Magnitudes capped ~5.7°. */
    tiltTargetX = -(ny - 0.5) * 0.10;
    tiltTargetZ = -(nx - 0.5) * 0.06;
  }, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* -------- Tick — viscous lerps for the manta feel -------- */
  const TAU         = 0.60;
  const FOLLOW      = 0.12;
  const ENERGY_K    = 25.0;
  const ENERGY_MAX  = 1.5;
  const VEL_DECAY   = 0.88;     // per-frame factor — wake fades over ~0.5s
  const VEL_INJECT  = 4.5;      // amplification of frame-to-frame mouse delta
  const TILT_LERP   = 0.04;     // slow, viscous

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    /* Smoothed mouse position (existing). */
    mouseSmoothX += (mouseTargetX - mouseSmoothX) * FOLLOW;
    mouseSmoothZ += (mouseTargetZ - mouseSmoothZ) * FOLLOW;

    /* Frame velocity — accumulate, decay. */
    const dx = mouseTargetX - mousePrevX;
    const dz = mouseTargetZ - mousePrevZ;
    mouseVelX = mouseVelX * VEL_DECAY + dx * VEL_INJECT;
    mouseVelZ = mouseVelZ * VEL_DECAY + dz * VEL_INJECT;
    mousePrevX = mouseTargetX;
    mousePrevZ = mouseTargetZ;

    /* Displacement energy (existing snappy v0.2 viscosity). */
    const speed = Math.sqrt(dx * dx + dz * dz);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    /* Tilt lerp — slow approach to target. */
    tiltSmoothX += (tiltTargetX - tiltSmoothX) * TILT_LERP;
    tiltSmoothZ += (tiltTargetZ - tiltSmoothZ) * TILT_LERP;
    points.rotation.x = tiltSmoothX;
    points.rotation.z = tiltSmoothZ;

    /* Push uniforms. */
    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmoothX, mouseSmoothZ);
    uniforms.uMouseVel.value.set(mouseVelX, mouseVelZ);
    uniforms.uDisplace.value = displaceEnergy;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.14 — manta propulsion · Three.js", THREE.REVISION,
              "·", TOTAL.toLocaleString(), "points");
})();