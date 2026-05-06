/* ============================================================
   AUROS — Liquid Engine v0.10 (Obsidian + dense gold flow)

   v0.9 baseline: real brand asset, luma-masked, ripple-warped.
   v0.10 intensifies the luxury:
     - Background shifts to obsidian black (#030305) so gold pops harder
     - Sharper luma mask (smoothstep 0.42..0.55) — crisp logo edge
     - Slow ambient current: a low-frequency fbm drifting at uTime*0.02,
       visible as flowing gold veins everywhere, including across the logo
     - Brighter logo: shimmer range expanded to mix(0.95, 1.30, ...)
     - Specular glints: pow(shimmer, 8.0) mixed toward warm white,
       so the silhouette reads as lit-from-within, not painted on top
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
  renderer.setClearColor(0x030305, 1);   // obsidian black

  /* -------- Placeholder texture --------
     Until the SVG loads, sample a 1×1 black pixel so the luminance
     mask returns 0 everywhere and nothing renders in the logo region. */
  const placeholderTex = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1, 1,
    THREE.RGBAFormat
  );
  placeholderTex.needsUpdate = true;

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:       { value: 0 },
    uMouse:      { value: new THREE.Vector2(0.5, 0.5) },
    uDisplace:   { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uLogo:       { value: placeholderTex },
    uLogoReady:  { value: 0.0 },   // 0 while loading, 1 once swapped
  };

  /* -------- Load the real brand asset --------
     manta-logo.svg ships in the same folder. SVG content is a base64-
     embedded raster (1448×1086) so the browser rasterizes it via the
     <img> path inside TextureLoader. Same-origin = no CORS issues. */
  const loader = new THREE.TextureLoader();
  loader.load(
    "./manta-logo.svg",
    (texture) => {
      texture.wrapS     = THREE.ClampToEdgeWrapping;
      texture.wrapT     = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      uniforms.uLogo.value      = texture;
      uniforms.uLogoReady.value = 1.0;
      console.log("[Auros] Logo loaded:", texture.image.width, "×", texture.image.height);
    },
    undefined,
    (err) => console.error("[Auros] Logo load failed:", err)
  );

  /* -------- Shaders -------- */
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float       uTime;
    uniform vec2        uMouse;
    uniform float       uDisplace;
    uniform vec2        uResolution;
    uniform sampler2D   uLogo;
    uniform float       uLogoReady;
    varying vec2        vUv;

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

    /* Brand palette.
       cValley = #030305 (obsidian black, the page ground)
       cPeak   = #D4AF37 (muted metallic gold)
       cSpec   = warm white for specular glints inside the logo */
    const vec3 cValley = vec3(0.0118, 0.0118, 0.0196);
    const vec3 cPeak   = vec3(0.8314, 0.6863, 0.2157);
    const vec3 cSpec   = vec3(1.0000, 0.9200, 0.7000);

    /* Logo footprint within aspect-corrected viewport.
       Source SVG is 1448×1086 ≈ 4:3, so logo height = width / 1.333.
       Slight upward offset keeps the silhouette above the bottom wordmark. */
    const vec2  LOGO_SCALE  = vec2(0.80, 0.60);
    const float LOGO_OFFSET = -0.10;

    /* rec709 luminance for the mask. */
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 p = (vUv - 0.5) * aspect;
      p.y -= LOGO_OFFSET;

      /* Mouse ripple wake. */
      vec2 mp = (uMouse - 0.5) * aspect;
      mp.y -= LOGO_OFFSET;
      vec2 toM = p - mp;
      float d = length(toM);
      vec2 ripple = (toM / (d + 0.001)) * exp(-d * 2.5) * uDisplace * 0.20;

      /* Ambient warp — gentle drift even when the cursor is still. */
      float t = uTime * 0.04;
      vec2 ambientWarp = vec2(
        fbm(p * 1.4 + vec2(t * 0.7, 0.0)),
        fbm(p * 1.4 + vec2(0.0, t * 0.5))
      ) * 0.035;

      vec2 totalWarp = ripple + ambientWarp;

      /* ---- Slow ambient current ----
         Low-frequency FBM drifting at uTime*0.02 — gives a constant
         flow of gold across the entire field (including the logo)
         even when the cursor is still. This is what makes the surface
         feel alive instead of static. */
      float slowT = uTime * 0.02;
      float slowCurrent = fbm(p * 1.3 + vec2(slowT, slowT * 0.5));
      slowCurrent = slowCurrent * 0.5 + 0.5;
      slowCurrent = smoothstep(0.50, 0.82, slowCurrent);

      /* ---- Luminance-masked logo sample (sharper edge) ----
         smoothstep band tightened from 0.40..0.60 to 0.42..0.55
         so the silhouette reads crisp against obsidian, not muddy. */
      vec2 logoP  = p - totalWarp;
      vec2 logoUv = logoP / LOGO_SCALE + 0.5;
      vec3 logoSample = texture2D(uLogo, logoUv).rgb;
      float lum  = dot(logoSample, LUMA);
      float mask = smoothstep(0.42, 0.55, lum) * uLogoReady;

      /* ---- Brushed-metal shimmer + specular glints ----
         shimmer is the same high-freq fbm as before, but the modulation
         range is widened from ±15% to ~0.95..1.30 so the logo is brighter
         than ambient peaks. Specular: pow(shimmer, 8.0) sharpens isolated
         glint points; mix toward cSpec lifts them toward warm white,
         which is what makes the silhouette look lit-from-within. */
      float shimmer = fbm(p * 8.0 + totalWarp * 4.0 + vec2(t * 1.2));
      shimmer = shimmer * 0.5 + 0.5;

      vec3 metallicGold = cPeak * mix(0.95, 1.30, shimmer);
      // Slow current modulates the gold's brightness gently (±10%) too,
      // so the flow visibly washes across the logo surface.
      metallicGold *= mix(0.90, 1.10, slowCurrent);

      // Specular: bright glints where shimmer spikes, lifted toward warm white.
      float spec = pow(shimmer, 8.0);
      metallicGold = mix(metallicGold, cSpec, spec * 0.55);

      /* ---- Background ambient field ----
         Two contributions, combined via max():
           - vBg:         the existing high-contrast fbm peaks
           - slowCurrent: the new long-period flow (also drives logo)
         Both feed into the same gold mix, so the field reads as
         continuous gold flow rather than scattered dots. */
      vec2 q = p * 2.0 + ripple;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float vBg = fbm(q2 + vec2(t * 0.5));
      vBg = vBg * 0.5 + 0.5;
      vBg = smoothstep(0.66, 0.92, vBg);
      vBg = pow(vBg, 1.2);

      float ambient = max(vBg * 0.55, slowCurrent * 0.50);

      /* ---- Composite ----
         Logo dominates inside its mask region (with shimmer + glints);
         ambient gold flow shows everywhere else. The source SVG's navy
         never contributes — only its luminance feeds the mask. */
      vec3 logoCol    = mix(cValley, metallicGold,  mask);
      vec3 ambientCol = mix(cValley, cPeak,         ambient);
      vec3 col        = mix(ambientCol, logoCol,    mask);

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

  /* -------- Post-processing: bloom 0.10 (gold elements only) -------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.10,    // strength
    0.60,    // radius
    0.35     // threshold
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  /* -------- Mouse tracking -------- */
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

  /* -------- Tick — v0.4 viscosity preserved -------- */
  const TAU        = 1.20;
  const FOLLOW     = 0.07;
  const ENERGY_K   = 15.0;
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

  console.log("[Auros] Liquid Engine v0.10 — obsidian + dense gold flow · Three.js", THREE.REVISION);
})();