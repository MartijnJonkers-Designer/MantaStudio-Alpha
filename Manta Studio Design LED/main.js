/* ============================================================
   AUROS v2.1 — Digital Silk (real this time)

   v2.0 was sampling vertex positions, which clusters points at
   triangle corners — that's the "wireframe" look you saw. Real
   fix: MeshSurfaceSampler distributes points uniformly across
   the actual surface area of the mesh.

   The recipe:
   - 50,000 surface-sampled points on the manta
   - Soft circular alpha-map texture for each point (radial
     gradient -> bokeh / soft star feel, not square pixels)
   - Pale lavender-white colour (#F3E5F5)
   - Per-pixel HDR brightness boost at each point's centre so
     bloom catches the cores -> "made of light, not lines"
   - UnrealBloomPass with high threshold so ONLY the bright
     particle cores bloom (BG stays clean white)
   - Layered sin-wave silk undulation through the wings
   - Mouse proximity drift + glow boost
   - Pure white BG, no fog, no fade
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader }          from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler }  from "three/addons/math/MeshSurfaceSampler.js";
import { EffectComposer }      from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass }          from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass }     from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass }          from "three/addons/postprocessing/OutputPass.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  /* ---------- Scene: pure white BG ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xFFFFFF);

  /* ---------- Camera ---------- */
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0.0, 1.0, 3.0);
  camera.lookAt(0.0, 0.0, 0.0);

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  /* ============================================================
     Soft circular alpha texture — the "bokeh / star" sprite for each
     point. Radial gradient: solid centre, soft fade to transparent
     at the edge. Replaces the harsh smoothstep pixels of v2.0.
     ============================================================ */
  function makePointTexture() {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0.00, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.20, "rgba(255, 255, 255, 0.85)");
    grad.addColorStop(0.50, "rgba(255, 255, 255, 0.30)");
    grad.addColorStop(1.00, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const pointTex = makePointTexture();

  /* ============================================================
     Particle ShaderMaterial.
     ============================================================ */
  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:     { value: 0 },
      uMouse:    { value: new THREE.Vector2(0, 0) },
      uPointTex: { value: pointTex }
    },

    vertexShader: `
      uniform float uTime;
      uniform vec2  uMouse;
      varying float vMouseGlow;

      void main() {
        vec3 pos = position;

        // SILK WAVE — three layered sines moving across the wings
        // and body. Wings ripple like fabric.
        float t = uTime;
        pos.y += sin(position.x * 3.5 - t * 1.2) * 0.040;
        pos.y += sin(position.z * 4.0 - t * 0.8) * 0.025;
        pos.y += sin(position.x * 6.0 + position.z * 2.0 - t * 1.5) * 0.018;

        // PROJECT to screen for mouse proximity calc
        vec4 mvPos   = modelViewMatrix * vec4(pos, 1.0);
        vec4 clipPos = projectionMatrix * mvPos;
        vec2 ndc     = clipPos.xy / clipPos.w;

        // Mouse proximity — particles near cursor glow brighter and drift
        float mouseDist = length(ndc - uMouse);
        vMouseGlow      = 1.0 - smoothstep(0.0, 0.30, mouseDist);

        // Drift toward cursor (screen-space) for proximate dots
        vec2 toMouse = (uMouse - ndc) * 0.04 * vMouseGlow;
        clipPos.xy  += toMouse * clipPos.w;

        gl_Position = clipPos;

        // Size: base + extra near cursor + distance attenuation
        gl_PointSize = (5.0 + vMouseGlow * 5.0) * (1.0 / -mvPos.z);
      }
    `,

    fragmentShader: `
      uniform sampler2D uPointTex;
      varying float vMouseGlow;

      void main() {
        // Sample soft alpha map — this is what makes the dots bokeh-soft
        // instead of harsh squares.
        vec4 tex = texture2D(uPointTex, gl_PointCoord);
        float a = tex.a;
        if (a < 0.01) discard;

        // Base colour: pale lavender-white per spec (#F3E5F5)
        vec3 color = vec3(0.953, 0.898, 0.961);

        // HDR brightness boost where alpha is highest (centre of the dot).
        // Pixels above bloom threshold get the bloom halo -> "made of light".
        float intensity = 1.0 + a * 1.6;

        // Mouse-proximate dots glow toward white and brighter
        intensity *= 1.0 + vMouseGlow * 0.7;
        color = mix(color, vec3(1.0), vMouseGlow * 0.4);

        gl_FragColor = vec4(color * intensity, a * 0.90);
      }
    `,

    transparent: true,
    blending:    THREE.NormalBlending,
    depthWrite:  false
  });

  /* ---------- Cursor ---------- */
  const mouse       = new THREE.Vector2(0, 0);
  const smoothMouse = new THREE.Vector2(0, 0);
  window.addEventListener("pointermove", (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ============================================================
     Manta load — surface-sample 50k points across the mesh.
     ============================================================ */
  const NUM_POINTS = 50000;
  let manta = null;
  const clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.load(
    "cartoon_manta_ray_animated.glb",
    (gltf) => {
      // Find the largest mesh in the GLB to sample from.
      let sourceMesh = null;
      let largestVertCount = 0;
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.geometry && child.geometry.attributes.position) {
          const n = child.geometry.attributes.position.count;
          if (n > largestVertCount) {
            largestVertCount = n;
            sourceMesh = child;
          }
        }
      });
      if (!sourceMesh) {
        console.error("[Auros] No mesh in GLB to sample from");
        return;
      }

      // MeshSurfaceSampler needs a regular Mesh (not SkinnedMesh) for
      // proper triangle-area sampling. Wrap the geometry in a temp Mesh.
      // We sample the BIND POSE surface — animation data isn't applied.
      const sampleMesh = new THREE.Mesh(
        sourceMesh.geometry,
        new THREE.MeshBasicMaterial()
      );
      const sampler = new MeshSurfaceSampler(sampleMesh).build();

      // Sample N points uniformly across the surface area.
      const positions = new Float32Array(NUM_POINTS * 3);
      const tempVec = new THREE.Vector3();
      for (let i = 0; i < NUM_POINTS; i++) {
        sampler.sample(tempVec);
        positions[i * 3]     = tempVec.x;
        positions[i * 3 + 1] = tempVec.y;
        positions[i * 3 + 2] = tempVec.z;
      }

      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

      // Pre-centre the geometry so rotation pivots around the centre.
      pointGeo.computeBoundingBox();
      const bbCenter = pointGeo.boundingBox.getCenter(new THREE.Vector3());
      const bbSize   = pointGeo.boundingBox.getSize(new THREE.Vector3());
      pointGeo.translate(-bbCenter.x, -bbCenter.y, -bbCenter.z);

      const longest = Math.max(bbSize.x, bbSize.y, bbSize.z);
      const scale = 2.4 / longest;

      const points = new THREE.Points(pointGeo, particleMat);

      manta = new THREE.Group();
      manta.add(points);
      manta.scale.setScalar(scale);
      manta.rotation.y = 3 * Math.PI / 10;     // diagonal pose
      manta.rotation.x = -0.05;
      scene.add(manta);

      console.log(`[Auros] silk manta · ${NUM_POINTS} surface-sampled dots · scale=${scale.toFixed(3)}`);
    },
    undefined,
    (err) => console.error("[Auros] GLTF load failed:", err)
  );

  /* ============================================================
     Post-processing: bloom catches HDR particle cores.
     Threshold high so the white BG (linear 1.0) doesn't bloom.
     Only particle pixels boosted to >1.5 by the centre intensity
     pass cross threshold and produce the soft halo.
     ============================================================ */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,    // strength — the constellation aura
    0.85,   // radius — soft, wide halo
    1.20    // threshold — only HDR particle cores qualify
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ---------- Tick ---------- */
  const BASE_ROT_Y = 3 * Math.PI / 10;
  const BASE_ROT_X = -0.05;

  function tick() {
    smoothMouse.x += (mouse.x - smoothMouse.x) * 0.06;
    smoothMouse.y += (mouse.y - smoothMouse.y) * 0.06;

    if (manta) {
      manta.rotation.y = BASE_ROT_Y + smoothMouse.x * 0.18;
      manta.rotation.x = BASE_ROT_X + smoothMouse.y * 0.10;
    }

    particleMat.uniforms.uTime.value = clock.getElapsedTime();
    particleMat.uniforms.uMouse.value.copy(smoothMouse);

    composer.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- Resize ---------- */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------- CTA ---------- */
  const cta = document.getElementById("cta");
  if (cta) {
    cta.addEventListener("click", () => {
      console.log("[Auros] CTA clicked — REQUEST BRIEFING");
    });
  }

  console.log("[Auros] v2.1 Digital Silk — surface-sampled point cloud + bloom · Three.js", THREE.REVISION);
})();
