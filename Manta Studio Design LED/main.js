/* ============================================================
   AUROS — Liquid Engine v0.15 (Vortex + ripple rings)

   v0.14 baseline + reference-image-driven additions:
     - Tangential swirl around cursor (spirals form)
     - Concentric ripple rings (outward sinusoidal waves)
     - Sharper localized peak at cursor (vertical lift)
     - Density bump: 108k -> 172,800 points (480 x 360)
     - Brighter peak color + subtle bloom for crest glow

   Pipeline:
     ShaderMaterial -> RenderPass -> UnrealBloomPass (subtle) -> OutputPass
   ============================================================ */

import * as THREE from "three";
import { EffectComposer }    from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass }        from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass }   from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass }        from "three/addons/postprocessing/OutputPass.js";

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

  /* -------- Geometry: 172,800 points (denser than v0.13/14) -------- */
  const GRID_W = 480;
  const GRID_D = 360;
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
    uMouseVel:  { value: new THREE.Vector2(0, 0) },
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

      /* ---- Ambient field: domain-warped fbm + manta wing flap ---- */
      float t = uTime * 0.08;
      vec2 q = p2 * 1.6;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float h = fbm(q2 + vec2(t * 0.5));

      // Long-wavelength sine — slow rhythmic flap traveling left -> right
      float wing = sin(pos.x * 0.7 + uTime * 0.7) * 0.45;
      h += wing;

      /* ---- Mouse interaction (5 layered effects) ----
         Each effect uses its own falloff envelope so they coexist
         without competing — sharp peak at center, ripples mid-range,
         spiral around cursor, wake along motion direction. */
      vec2 toM = p2 - uMouse;
      float d = length(toM);
      float envClose = exp(-d * 3.0);   // tight (vertical lift, radial push)
      float envBroad = exp(-d * 1.5);   // mid (rings, swirl, wake)

      // 1. Vertical lift — narrow peak right at cursor
      h += envClose * uDisplace * 0.55;

      // 2. Concentric ripple rings — sin(distance - time) creates outgoing waves
      float ringPhase = d * 14.0 - uTime * 5.0;
      h += sin(ringPhase) * envBroad * uDisplace * 0.10;

      // 3. Radial outward push — particles flee cursor
      vec2 radial = (d > 0.001) ? toM / d : vec2(0.0);
      pos.x += radial.x * envClose * uDisplace * 0.05;
      pos.z += radial.y * envClose * uDisplace * 0.05;

      // 4. Tangential swirl — perpendicular to radial. Combined with the
      //    radial push, particles trace spirals around the cursor.
      vec2 tangent = vec2(-radial.y, radial.x);
      pos.x += tangent.x * envBroad * uDisplace * 0.08;
      pos.z += tangent.y * envBroad * uDisplace * 0.08;

      // 5. Motion wake — particles get carried in cursor's direction of motion
      vec2 wake = uMouseVel * envBroad * 0.10;
      pos.x += wake.x;
      pos.z += wake.y;

      /* ---- Final position ---- */
      pos.y = h * uHeight;

      vec4 mvPos     = modelViewMatrix * vec4(pos, 1.0);
      gl_Position    = projectionMatrix * mvPos;
      gl_PointSize   = max(uPointSize / -mvPos.z, 1.0);

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

      /* Crest glow boost — peaks brighten beyond their lavender base. */
      col *= 0.70 + smoothstep(0.40, 0.90, vHeight) * 0.55;

      /* Near-white-lavender boost on the brightest crests — pushes those
         pixels above the bloom threshold so they halo cleanly. */
      float crestBoost = pow(smoothstep(0.55, 0.95, vHeight), 1.5);
      col = mix(col, vec3(1.00, 0.95, 1.05), crestBoost * 0.45);

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
    transparent: true,
    depthTest:   true,
    depthWrite:  false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /* -------- Post-processing: subtle bloom on crest highlights --------
     threshold 0.40 ensures only the near-white-lavender peak boost
     pixels bloom; the valley dots are far below threshold. */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.15,    // strength    — subtle halo on crests
    0.50,    // radius
    0.40     // threshold   — only crest-boosted pixels bloom
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  /* -------- Mouse: raycast NDC -> ground plane -------- */
  const raycaster   = new THREE.Raycaster();
  const ndcMouse    = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint    = new THREE.Vector3();

  let mouseTargetX = 0, mouseTargetZ = 0;
  let mouseSmoothX = 0, mouseSmoothZ = 0;
  let mousePrevX   = 0, mousePrevZ   = 0;
  let mouseVelX    = 0, mouseVelZ    = 0;
  let displaceEnergy = 0;

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

    tiltTargetX = -(ny - 0.5) * 0.10;
    tiltTargetZ = -(nx - 0.5) * 0.06;
  }, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  /* -------- Tick — viscous lerps (v0.14 settings) -------- */
  const TAU         = 0.60;
  const FOLLOW      = 0.12;
  const ENERGY_K    = 25.0;
  const ENERGY_MAX  = 1.5;
  const VEL_DECAY   = 0.88;
  const VEL_INJECT  = 4.5;
  const TILT_LERP   = 0.04;

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    mouseSmoothX += (mouseTargetX - mouseSmoothX) * FOLLOW;
    mouseSmoothZ += (mouseTargetZ - mouseSmoothZ) * FOLLOW;

    const dx = mouseTargetX - mousePrevX;
    const dz = mouseTargetZ - mousePrevZ;
    mouseVelX = mouseVelX * VEL_DECAY + dx * VEL_INJECT;
    mouseVelZ = mouseVelZ * VEL_DECAY + dz * VEL_INJECT;
    mousePrevX = mouseTargetX;
    mousePrevZ = mouseTargetZ;

    const speed = Math.sqrt(dx * dx + dz * dz);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    tiltSmoothX += (tiltTargetX - tiltSmoothX) * TILT_LERP;
    tiltSmoothZ += (tiltTargetZ - tiltSmoothZ) * TILT_LERP;
    points.rotation.x = tiltSmoothX;
    points.rotation.z = tiltSmoothZ;

    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmoothX, mouseSmoothZ);
    uniforms.uMouseVel.value.set(mouseVelX, mouseVelZ);
    uniforms.uDisplace.value = displaceEnergy;

    composer.render();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.15 — vortex + ripple rings · Three.js", THREE.REVISION,
              "·", TOTAL.toLocaleString(), "points");
})();