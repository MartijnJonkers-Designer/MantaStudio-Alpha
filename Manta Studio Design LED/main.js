/* ============================================================
   AUROS v2.0-prototype — Particle Manta

   Aesthetic pivot: dot-particle manta on soft pastel BG.
   Killed everything from the glass-refraction pipeline.

   What's here:
   - Soft pastel pink-lavender gradient background
   - Cartoon manta GLB loaded, vertices extracted as point cloud
   - Custom Points shader: each particle drifts gently via sin/cos
     of position + time, soft circular sprite, color gradient
     across the manta's body
   - Additive blending so overlapping particles brighten -> glow
   - Direct renderer.render, no post-processing
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  /* ---------- Scene ---------- */
  const scene = new THREE.Scene();
  scene.background = (() => {
    // Soft pastel pink-lavender gradient
    const c = document.createElement("canvas");
    c.width = 2; c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#F5E8EE");   // pale pink top
    grad.addColorStop(0.5, "#E8DCEC");   // lavender middle
    grad.addColorStop(1.0, "#D8CDE2");   // deeper lavender bottom
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  /* ---------- Camera ---------- */
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0.0, 1.0, 3.0);
  camera.lookAt(0.0, 0.0, 0.0);

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  /* ---------- Particle material ---------- */
  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2  uMouse;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec3 pos = position;

        // Gentle drift — each particle swims a little around its anchor.
        // Using position-based offsets so neighbouring particles drift in sync,
        // creating the "flowing field" feel.
        float t = uTime;
        pos.x += sin(t * 0.7 + position.y * 4.0 + position.z * 3.0) * 0.025;
        pos.y += cos(t * 0.5 + position.x * 3.5 + position.z * 2.5) * 0.020;
        pos.z += sin(t * 0.6 + position.x * 3.0 + position.y * 4.0) * 0.025;

        // Cursor pull — particles lean toward the cursor very slightly
        pos.xy += uMouse * 0.04;

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPos;

        // Size attenuated by distance from camera (further = smaller).
        gl_PointSize = 7.0 * (1.0 / -mvPos.z);   // v2.1 — was 4.5; bigger so they read

        // v2.1 — DARKER palette than the BG, so particles show as soft shadows
        // and highlights against the pale pink-lavender field. The previous
        // light palette + additive blending = white wash.
        vec3 highlight = vec3(0.78, 0.72, 0.88);   // pale violet (only slightly darker than BG)
        vec3 mid       = vec3(0.55, 0.48, 0.72);   // mid violet
        vec3 deep      = vec3(0.35, 0.28, 0.50);   // deep violet (shadow areas)

        float topT = smoothstep(-0.4, 0.4, position.y);
        float depthT = smoothstep(-0.5, 0.5, position.z);

        vec3 c1 = mix(deep, mid, depthT);
        vColor = mix(c1, highlight, topT * 0.7);

        // v2.1 — solid alpha; with normal blending we don't need to fight transparency.
        vAlpha = 0.85;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        if (dist > 0.5) discard;

        float a = smoothstep(0.5, 0.10, dist) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,        // v2.1 — was AdditiveBlending; particles
                                           // need to be DARKER than the light BG, so
                                           // additive (which only ever brightens) is wrong.
    depthWrite: false
  });

  /* ---------- Cursor ---------- */
  const mouse       = new THREE.Vector2(0, 0);
  const smoothMouse = new THREE.Vector2(0, 0);
  window.addEventListener("pointermove", (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ---------- Manta load ---------- */
  let manta = null;
  const clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.load(
    "cartoon_manta_ray_animated.glb",
    (gltf) => {
      // Walk the GLB and collect every position attribute we can find.
      const allPositions = [];
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.geometry && child.geometry.attributes.position) {
          const arr = child.geometry.attributes.position.array;
          for (let i = 0; i < arr.length; i++) allPositions.push(arr[i]);
        }
      });

      console.log(`[Auros] particle manta: ${allPositions.length / 3} source points`);

      // Densify by adding interpolated midpoints between every pair of
      // consecutive vertices. Quick way to get a more populated cloud
      // without re-meshing. ~3x point count.
      const dense = [];
      for (let i = 0; i + 2 < allPositions.length; i += 3) {
        dense.push(allPositions[i], allPositions[i+1], allPositions[i+2]);
      }
      // Add midpoints between consecutive triples
      for (let i = 0; i + 5 < allPositions.length; i += 3) {
        const ax = allPositions[i],     ay = allPositions[i+1], az = allPositions[i+2];
        const bx = allPositions[i+3],   by = allPositions[i+4], bz = allPositions[i+5];
        dense.push((ax+bx)*0.5, (ay+by)*0.5, (az+bz)*0.5);
        dense.push(ax + (bx-ax)*0.25, ay + (by-ay)*0.25, az + (bz-az)*0.25);
        dense.push(ax + (bx-ax)*0.75, ay + (by-ay)*0.75, az + (bz-az)*0.75);
      }

      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute("position", new THREE.Float32BufferAttribute(dense, 3));

      // v2.1 — pre-centre the geometry vertices BEFORE wrapping. This makes
      // rotation pivot cleanly around the geometric centre instead of relying
      // on post-transform Box3 math (which was placing things wrong).
      pointGeo.computeBoundingBox();
      const bbCenter = pointGeo.boundingBox.getCenter(new THREE.Vector3());
      const bbSize   = pointGeo.boundingBox.getSize(new THREE.Vector3());
      pointGeo.translate(-bbCenter.x, -bbCenter.y, -bbCenter.z);
      pointGeo.computeBoundingBox();   // refresh after translate

      const longest = Math.max(bbSize.x, bbSize.y, bbSize.z);
      const scale = 2.4 / longest;

      const points = new THREE.Points(pointGeo, particleMat);

      manta = new THREE.Group();
      manta.add(points);
      manta.scale.setScalar(scale);
      manta.rotation.y = 3 * Math.PI / 10;
      manta.rotation.x = -0.05;
      // No position.sub needed — geometry already centred.
      scene.add(manta);

      console.log(`[Auros] particle manta loaded · scale=${scale.toFixed(3)} · final points=${dense.length / 3}`);
    },
    undefined,
    (err) => console.error("[Auros] GLTF load failed:", err)
  );

  /* ---------- Tick ---------- */
  const BASE_ROT_Y = 3 * Math.PI / 10;
  const BASE_ROT_X = -0.05;

  function tick() {
    smoothMouse.x += (mouse.x - smoothMouse.x) * 0.06;
    smoothMouse.y += (mouse.y - smoothMouse.y) * 0.06;

    if (manta) {
      manta.rotation.y = BASE_ROT_Y + smoothMouse.x * 0.20;
      manta.rotation.x = BASE_ROT_X + smoothMouse.y * 0.12;
    }

    particleMat.uniforms.uTime.value = clock.getElapsedTime();
    particleMat.uniforms.uMouse.value.copy(smoothMouse);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- Resize ---------- */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  console.log("[Auros] v2.1-prototype — Particle manta (normal blending, dark palette, geom-centered) · Three.js", THREE.REVISION);
})();
