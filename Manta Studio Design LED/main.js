/* ============================================================
   AUROS — Liquid Engine v0.11 (Slate & Lavender reset)

   Clean reset to the v0.2 architecture with a new palette.
   No logo masking, no luma tracing, no ambient current, no specular,
   no slow drift, no heavy viscosity. Just:
     - fbm liquid surface (5 octaves + domain warping)
     - mouse ripple wake (snappy v0.2 settle, ~1.5s)
     - slate-to-lavender palette mix
     - subtle bloom on the lavender peaks

   Palette:
     cValley = #1A1B26 (Tokyo Night slate)
     cPeak   = #BB9AF7 (soft lavender)
     headline period accent = #9ECE6A (pale lime, in CSS)
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

  /* -------- Scene + camera + renderer -------- */
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x1A1B26, 1);   // Tokyo Night slate

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:       { value: 0 },
    uMouse:      { value: new THREE.Vector2(0.5, 0.5) },
    uDisplace:   { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  };

  /* -------- Shaders -------- */
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uDisplace;
    uniform vec2  uResolution;
    varying vec2  vUv;

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

    /* Palette.
       cValley = #1A1B26 (Tokyo Night slate)
       cPeak   = #BB9AF7 (soft lavender) */
    const vec3 cValley = vec3(0.1020, 0.1059, 0.1490);
    const vec3 cPeak   = vec3(0.7333, 0.6039, 0.9686);

    void main() {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 p = (vUv - 0.5) * aspect;

      /* Mouse ripple wake. */
      vec2 mp = (uMouse - 0.5) * aspect;
      vec2 toM = p - mp;
      float d = length(toM);
      vec2 ripple = (toM / (d + 0.001)) * exp(-d * 2.5) * uDisplace * 0.20;

      /* v0.2 flow speed — 0.10 (snappier than the heavy v0.4-0.10 era's 0.04). */
      float t = uTime * 0.10;
      vec2 q = p * 1.6 + ripple;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float v = fbm(q2 + vec2(t * 0.5));

      /* v0.2 contrast curve: gradient peaks, not crushed. */
      v = v * 0.5 + 0.5;
      v = smoothstep(0.55, 0.92, v);
      v = pow(v, 0.85);

      vec3 col = mix(cValley, cPeak, v);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest:  false,
    depthWrite: false,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  /* -------- Post-processing: subtle bloom on lavender peaks -------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.30,    // strength    — moderate
    0.60,    // radius
    0.35     // threshold   — only lavender peaks bloom; slate bg is below
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  /* -------- Mouse tracking — v0.2 snappy viscosity -------- */
  const mouseTarget = { x: 0.5, y: 0.5 };
  const mouseSmooth = { x: 0.5, y: 0.5 };
  const mousePrev   = { x: 0.5, y: 0.5 };
  let displaceEnergy = 0;

  window.addEventListener("pointermove", (e) => {
    mouseTarget.x = e.clientX / window.innerWidth;
    mouseTarget.y = 1.0 - e.clientY / window.innerHeight;
  }, { passive: true });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  });

  /* v0.2 settings restored — snappy, not the heavy v0.4-0.10 era. */
  const TAU        = 0.60;   // wake settle (~1.5s)
  const FOLLOW     = 0.12;   // mouse smoothing
  const ENERGY_K   = 25.0;   // speed -> energy
  const ENERGY_MAX = 1.5;

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * FOLLOW;
    mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * FOLLOW;

    const dx = mouseTarget.x - mousePrev.x;
    const dy = mouseTarget.y - mousePrev.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    mousePrev.x = mouseTarget.x;
    mousePrev.y = mouseTarget.y;

    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmooth.x, mouseSmooth.y);
    uniforms.uDisplace.value = displaceEnergy;

    composer.render();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.11 — Slate & Lavender reset · Three.js", THREE.REVISION);
})();