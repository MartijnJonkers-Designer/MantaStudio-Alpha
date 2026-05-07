/* ============================================================
   AUROS — Liquid Engine v0.12 (Halftone topology mesh)

   Same fbm liquid math as v0.11 underneath, but rendered as a
   halftone dot pattern instead of a smooth gradient. The dot grid
   is sampled in the SAME domain-warped coordinates as the height
   field, so dot rows visibly bend along the wave contours and
   swirl around the mouse-driven ripple — matching the topographical
   "point mesh" look of the reference image.

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
  renderer.setClearColor(0x1A1B26, 1);

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
       cValley = #1A1B26 (slate)  cPeak = #BB9AF7 (soft lavender) */
    const vec3  cValley     = vec3(0.1020, 0.1059, 0.1490);
    const vec3  cPeak       = vec3(0.7333, 0.6039, 0.9686);

    /* Halftone tuning. */
    const float DOT_DENSITY = 70.0;     // dots per unit in warped-coord space
    const float DOT_BASE    = 0.16;     // base dot radius
    const float DOT_GROW    = 0.10;     // additional radius from height

    void main() {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 p = (vUv - 0.5) * aspect;

      /* Mouse ripple wake (snappy v0.2 settle). */
      vec2 mp = (uMouse - 0.5) * aspect;
      vec2 toM = p - mp;
      float d = length(toM);
      vec2 ripple = (toM / (d + 0.001)) * exp(-d * 2.5) * uDisplace * 0.20;

      /* Domain-warped fbm — same height field as v0.11. */
      float t = uTime * 0.08;
      vec2 q = p * 1.6 + ripple;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float h = fbm(q2 + vec2(t * 0.5));
      h = h * 0.5 + 0.5;                      // [0, 1]

      /* Pseudo-perspective: dots slightly larger in the lower viewport,
         smaller toward the top. Fakes a 3D point-cloud foreshortening
         without doing actual 3D. */
      float depth = mix(1.15, 0.85, vUv.y);

      /* Halftone grid in the WARPED coordinate.
         Because we sample fract() on q2 (which has the domain warp baked in),
         the dot grid bends and swirls along the wave contours, exactly the
         topographical look from the reference. */
      vec2 dotCoord = q2 * DOT_DENSITY;
      vec2 dotCell  = fract(dotCoord) - 0.5;
      float dotDist = length(dotCell);

      /* Dot radius: mild height modulation + perspective scale. */
      float dotRadius = (DOT_BASE + h * DOT_GROW) * depth;
      float dotMask   = 1.0 - smoothstep(dotRadius - 0.04, dotRadius + 0.04, dotDist);

      /* Color the dot by height: dim slate-tinted in valleys, full lavender on peaks.
         Smoothstep on h biases the contrast curve so peaks pop more. */
      float colT     = smoothstep(0.20, 0.85, h);
      vec3  dotColor = mix(cValley * 0.85, cPeak, colT);

      /* Inside dot region: dotColor. Outside: pure slate (the gaps between dots). */
      vec3 col = mix(cValley, dotColor, dotMask);

      /* Edge vignette in aspect-corrected space — soft fade into slate at corners.
         Pattern stays full-strength across most of the viewport, fades out
         in the outer 25–30%. */
      float vR   = length(p);
      float edge = 1.0 - smoothstep(0.60, 1.15, vR);
      col = mix(cValley, col, edge);

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

  /* -------- Subtle bloom on the brightest dots --------
     Dropped strength from 0.30 (v0.11) to 0.15 — enough to feel
     atmospheric without blurring the halftone pattern out. */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.15,    // strength
    0.55,    // radius
    0.40     // threshold — only the brightest dots bloom
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

  const TAU        = 0.60;
  const FOLLOW     = 0.12;
  const ENERGY_K   = 25.0;
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

  console.log("[Auros] Liquid Engine v0.12 — halftone topology mesh · Three.js", THREE.REVISION);
})();