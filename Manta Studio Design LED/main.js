/* ============================================================
   AUROS — Liquid Engine v0.7 (Integrated brand shader)

   The MantaWorks manta silhouette is baked into the same fragment
   shader as the fbm liquid surface. The logo is sampled at the same
   ripple-displaced UV as the rest of the field, so mouse motion
   physically warps the brand mark instead of just the water around it.

   buildLogoTexture() draws an APPROXIMATE manta silhouette into a
   1024x512 canvas (three overlapping blurred ellipses: main body,
   right tail, left wing sweep). The trace is hand-tuned from the
   reference image — not pixel-perfect to the brand. Swap the canvas
   drawing for an SVG path / rendered image when the real asset is
   available; the rest of the integration architecture stays the same.

   Pipeline unchanged from v0.3-v0.6:
     ShaderMaterial -> RenderPass -> UnrealBloomPass -> OutputPass
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

  /* -------- Logo texture: procedural canvas trace --------
     Three overlapping blurred ellipses approximating the manta wing
     silhouette from the brand image. Drawn into a 1024x512 (2:1) canvas,
     wrapped to ClampToEdge so out-of-region samples return black. */
  function buildLogoTexture() {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    const g = c.getContext("2d");

    g.fillStyle = "#000000";
    g.fillRect(0, 0, 1024, 512);

    g.fillStyle = "#FFFFFF";
    g.filter = "blur(8px)";

    // Main wing body — wide swept ellipse, slightly tilted
    g.save();
    g.translate(450, 256);
    g.rotate(-0.06);
    g.scale(1.05, 0.40);
    g.beginPath();
    g.arc(0, 0, 380, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Right tail extension — narrower, angled up-right
    g.save();
    g.translate(820, 230);
    g.rotate(0.30);
    g.scale(1.30, 0.25);
    g.beginPath();
    g.arc(0, 0, 130, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Left wing extension — long sweep, angled down-left
    g.save();
    g.translate(180, 240);
    g.rotate(-0.25);
    g.scale(1.50, 0.30);
    g.beginPath();
    g.arc(0, 0, 200, 0, Math.PI * 2);
    g.fill();
    g.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
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
  renderer.setClearColor(0x01050F, 1);   // deep midnight navy

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:       { value: 0 },
    uMouse:      { value: new THREE.Vector2(0.5, 0.5) },
    uDisplace:   { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uLogo:       { value: buildLogoTexture() },
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
    uniform float       uTime;
    uniform vec2        uMouse;
    uniform float       uDisplace;
    uniform vec2        uResolution;
    uniform sampler2D   uLogo;
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
       cValley = #01050F (deep midnight navy)
       cPeak   = #D4AF37 (muted gold) */
    const vec3 cValley = vec3(0.0039, 0.0196, 0.0588);
    const vec3 cPeak   = vec3(0.8314, 0.6863, 0.2157);

    /* Logo footprint within aspect-corrected viewport.
       Texture is 2:1; we stretch p by these factors so the logo
       fits cleanly into the central 70% width region.
       Slight upward offset so the logo sits above the wordmark. */
    const vec2  LOGO_SCALE  = vec2(0.70, 0.35);
    const float LOGO_OFFSET = -0.12;       // shift logo UP toward upper half

    void main() {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 p = (vUv - 0.5) * aspect;
      p.y -= LOGO_OFFSET;                  // move our origin so 0,0 is the logo center

      /* Mouse ripple wake. */
      vec2 mp = (uMouse - 0.5) * aspect;
      mp.y -= LOGO_OFFSET;
      vec2 toM = p - mp;
      float d = length(toM);
      vec2 ripple = (toM / (d + 0.001)) * exp(-d * 2.5) * uDisplace * 0.20;

      /* Ambient warp — tiny noise field that lets the surface (and the logo)
         drift gently even when the cursor is still. Scaled down so it
         doesn't compete with the mouse wake. */
      float t = uTime * 0.04;
      vec2 ambientWarp = vec2(
        fbm(p * 1.4 + vec2(t * 0.7, 0.0)),
        fbm(p * 1.4 + vec2(0.0, t * 0.5))
      ) * 0.035;

      vec2 totalWarp = ripple + ambientWarp;

      /* ---- Logo sample (warped UV) ----
         The same totalWarp that distorts the fbm field also distorts
         the logo lookup, so ripples physically bend the silhouette. */
      vec2 logoP  = p - totalWarp;
      vec2 logoUv = logoP / LOGO_SCALE + 0.5;
      float logoMaskRaw = texture2D(uLogo, logoUv).r;
      /* Soft falloff so the silhouette feathers into the surrounding liquid. */
      float logoMask = smoothstep(0.15, 0.65, logoMaskRaw);

      /* Molten surface: high-frequency fbm modulates the logo brightness
         so it doesn't read as a flat gold patch. */
      float surface = fbm(p * 4.5 + totalWarp + vec2(t * 1.3));
      surface = surface * 0.5 + 0.5;
      float logoMolten = logoMask * mix(0.65, 1.0, surface);

      /* ---- Background fbm peaks (v0.6 math, unchanged) ---- */
      vec2 q = p * 2.0 + ripple;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float vBg = fbm(q2 + vec2(t * 0.5));
      vBg = vBg * 0.5 + 0.5;
      vBg = smoothstep(0.68, 0.92, vBg);
      vBg = pow(vBg, 1.3);

      /* Combine: logo dominates inside its region; ambient peaks scatter
         elsewhere at reduced intensity (the brand mark is the focal point). */
      float v = max(logoMolten, vBg * 0.55);

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

  /* -------- Post-processing: bloom 0.10 (gold elements only) -------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.10,    // strength
    0.60,    // radius
    0.35     // threshold (only gold passes; navy bg is far below)
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

  console.log("[Auros] Liquid Engine v0.7 — integrated brand shader · Three.js", THREE.REVISION);
})();