/* ============================================================
   AUROS — Liquid Engine v0.2 (liquid mercury surface)

   Step 2: full-screen GLSL fragment shader rendering a domain-warped
   fbm surface. High-contrast (deep black valleys, sharp bright peaks)
   with viscous mouse-driven displacement that settles over ~1.5s.

   Architecture:
     - OrthographicCamera + PlaneGeometry(2, 2) full-screen quad
     - Vertex shader bypasses camera transforms (position is NDC directly)
     - Fragment shader: simplex noise -> fbm -> domain warp -> contrast
     - Mouse: JS-side lerp + exponential energy decay (tau = 0.6s)
     - Single draw call per frame
   ============================================================ */

/* "three" resolves via the importmap declared in Index.html. */
import * as THREE from "three";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) {
    console.warn("[Auros] No #auros-canvas element found; engine not started.");
    return;
  }

  /* -------- Scene + camera + renderer -------- */
  const scene = new THREE.Scene();

  /* Camera transform is bypassed in the vertex shader, so its values don't
     matter — Three.js just needs a camera object to call .render() with. */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:       { value: 0 },
    uMouse:      { value: new THREE.Vector2(0.5, 0.5) },
    uDisplace:   { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  };

  /* -------- Vertex shader: pass UV through, position as NDC --------
     PlaneGeometry(2, 2) has vertex positions in [-1, 1] which is exactly
     clip space, so we skip projectionMatrix * modelViewMatrix entirely. */
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  /* -------- Fragment shader: liquid mercury -------- */
  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uDisplace;
    uniform vec2  uResolution;
    varying vec2  vUv;

    /* Stefan Gustavson 2D simplex noise (public domain).
       Returns a value approximately in [-1, 1]. */
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

    /* Fractional Brownian Motion: stack 5 octaves of simplex with each
       octave doubling frequency and halving amplitude. Output ~[-1, 1]. */
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
      /* Aspect-correct UV so circular ripples stay round on wide screens. */
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 p = (vUv - 0.5) * aspect;

      /* Mouse ripple wake: radial outward push from smoothed cursor.
         JS feeds uDisplace as an exponentially-decaying energy value
         driven by mouse speed, so this push fades over ~1.5s after motion. */
      vec2 mp = (uMouse - 0.5) * aspect;
      vec2 toM = p - mp;
      float d = length(toM);
      vec2 ripple = (toM / (d + 0.001)) * exp(-d * 2.5) * uDisplace * 0.20;

      /* Domain-warped fbm — the viscous flow.
         We sample fbm twice to get a (warpX, warpY) vector, then use that
         vector to offset the input to a third fbm call. The surface bends
         through itself instead of being a flat noise field. */
      float t = uTime * 0.10;
      vec2 q = p * 1.6 + ripple;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float v = fbm(q2 + vec2(t * 0.5));

      /* High-contrast finish: deep black valleys, sharp bright peaks.
         The smoothstep narrows the bright band; pow softens its edge
         just enough to read as light reflecting on liquid, not a hard mask. */
      v = v * 0.5 + 0.5;
      v = smoothstep(0.55, 0.92, v);
      v = pow(v, 0.85);

      gl_FragColor = vec4(vec3(v), 1.0);
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

  /* -------- Mouse tracking --------
     mouseTarget is the raw cursor position (0..1, y-flipped to GL space).
     mouseSmooth lerps toward target with factor 0.12.
     displaceEnergy accumulates per-frame speed * 25, capped at 1.5,
     and decays exponentially with tau = 0.6s. Settles in ~1.5-2s. */
  const mouseTarget = { x: 0.5, y: 0.5 };
  const mouseSmooth = { x: 0.5, y: 0.5 };
  const mousePrev   = { x: 0.5, y: 0.5 };
  let displaceEnergy = 0;

  window.addEventListener("pointermove", (e) => {
    mouseTarget.x = e.clientX / window.innerWidth;
    mouseTarget.y = 1.0 - e.clientY / window.innerHeight;   // GL y-up
  }, { passive: true });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  });

  /* -------- Tick loop --------
     dt-based exponential decay so settle time is frame-rate independent.
     Vector2 uniforms reused via .set() to avoid allocation churn. */
  const TAU       = 0.6;     // displacement decay time-constant (s)
  const FOLLOW    = 0.12;    // mouse smoothing lerp factor
  const ENERGY_K  = 25.0;    // mouse-speed -> energy multiplier
  const ENERGY_MAX = 1.5;

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    /* Smooth-follow cursor */
    mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * FOLLOW;
    mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * FOLLOW;

    /* Velocity injection + exponential decay */
    const dx = mouseTarget.x - mousePrev.x;
    const dy = mouseTarget.y - mousePrev.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    mousePrev.x = mouseTarget.x;
    mousePrev.y = mouseTarget.y;

    /* Push uniforms */
    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmooth.x, mouseSmooth.y);
    uniforms.uDisplace.value = displaceEnergy;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.2 — fbm shader online · Three.js", THREE.REVISION);
})();