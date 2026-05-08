/* ============================================================
   AUROS v2.0 — Digital Silk

   Hard reset from the glass/ice direction. The new spec:
   - GEOMETRY: keep the manta GLB, convert to THREE.Points, hide
     the original mesh entirely.
   - DOTS: custom ShaderMaterial. Small, soft-edged circular sprites.
     Crisp white with lavender/silver glow (slightly darker than the
     pure-white BG so they show as soft silvery dots).
   - DENSITY: enough to define wing/body shape clearly.
   - MOVEMENT: wave animation through the points so the wings feel
     like silk rippling. Layered sine waves along wing-span and
     body axes.
   - INTERACTION: mouse-proximity glow — particles near the cursor
     in screen space brighten and slightly enlarge.
   - BACKGROUND: pure white, no fog, no gradient.
   - UI: the REQUEST BRIEFING button is visible, floating cleanly
     over the particle field.

   Stripped: glass material, all post-processing, fresnel injections,
   ripple shader floor, vignette overlay, HDR ripples, IBL tweaks.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
     Particle ShaderMaterial — the heart of v2.0
     ============================================================ */
  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) }
    },

    vertexShader: `
      uniform float uTime;
      uniform vec2  uMouse;

      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vec3 pos = position;

        // ---- SILK WAVE ----
        // Layered sine waves running along the wing-span axis (X) and the
        // body axis (Z). Phase based on each particle's anchor position
        // so neighbours stay in sync — the wave "travels" across the wings
        // like fabric rippling.
        float t = uTime;
        float waveA = sin(position.x * 3.5 - t * 1.2) * 0.040;
        float waveB = sin(position.z * 4.0 - t * 0.8) * 0.025;
        float waveC = sin(position.x * 6.0 + position.z * 2.0 - t * 1.5) * 0.018;
        pos.y += waveA + waveB + waveC;

        // ---- MOUSE PROXIMITY ----
        // Project to NDC, measure distance to mouse, boost size and
        // brightness for nearby particles.
        vec4 mvPos   = modelViewMatrix * vec4(pos, 1.0);
        vec4 clipPos = projectionMatrix * mvPos;
        vec2 ndc     = clipPos.xy / clipPos.w;

        float mouseDist = length(ndc - uMouse);
        float mouseProx = 1.0 - smoothstep(0.0, 0.35, mouseDist);

        // Tiny screen-space displacement toward the cursor for proximate dots
        vec2 toMouse = (uMouse - ndc) * 0.04 * mouseProx;
        clipPos.xy += toMouse * clipPos.w;

        gl_Position  = clipPos;

        // Size: base + extra near cursor + distance attenuation
        gl_PointSize = (5.5 + mouseProx * 5.0) * (1.0 / -mvPos.z);

        // ---- COLOUR ----
        // Crisp white centre with lavender/silver glow.
        // Particles need to be DARKER than pure white so they read against
        // the white BG — using silvery-violet tones for that "silk dust" feel.
        vec3 highlight = vec3(0.96, 0.93, 1.00);   // pale lavender-white
        vec3 mid       = vec3(0.78, 0.74, 0.88);   // silvery lavender
        vec3 deep      = vec3(0.55, 0.50, 0.72);   // deep silver-violet (shadow zones)

        float topT   = smoothstep(-0.4, 0.4, position.y);    // top of body lighter
        float depthT = smoothstep(-0.5, 0.5, position.z);    // depth front->back
        vec3 c1      = mix(deep, mid, depthT);
        vec3 baseColor = mix(c1, highlight, topT * 0.8);

        // Mouse-proximate particles glow toward white
        vColor = mix(baseColor, vec3(1.0, 1.0, 1.0), mouseProx * 0.6);

        // Solid alpha — normal blending stacks layers cleanly
        vAlpha = 0.85 + mouseProx * 0.15;
      }
    `,

    fragmentShader: `
      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        if (dist > 0.5) discard;

        // Soft circular falloff — center solid, edges blend.
        float core = smoothstep(0.5, 0.18, dist);
        gl_FragColor = vec4(vColor, core * vAlpha);
      }
    `,

    transparent:  true,
    blending:     THREE.NormalBlending,
    depthWrite:   false
  });

  /* ---------- Cursor ---------- */
  const mouse       = new THREE.Vector2(0, 0);
  const smoothMouse = new THREE.Vector2(0, 0);

  window.addEventListener("pointermove", (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ---------- Manta load: extract positions, build dense point cloud ---------- */
  let manta = null;
  const clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.load(
    "cartoon_manta_ray_animated.glb",
    (gltf) => {
      // Collect every vertex position from every mesh in the GLB.
      // We DO NOT add the mesh to the scene — only use its vertices.
      const allPositions = [];
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.geometry && child.geometry.attributes.position) {
          const arr = child.geometry.attributes.position.array;
          for (let i = 0; i < arr.length; i++) allPositions.push(arr[i]);
        }
      });

      // Densify: for each pair of consecutive vertices, add interpolated
      // points at 10/25/40/60/75/90% — produces ~7x the source density.
      const dense = [];
      for (let i = 0; i + 2 < allPositions.length; i += 3) {
        dense.push(allPositions[i], allPositions[i+1], allPositions[i+2]);
      }
      const lerps = [0.10, 0.25, 0.40, 0.50, 0.60, 0.75, 0.90];
      for (let i = 0; i + 5 < allPositions.length; i += 3) {
        const ax = allPositions[i],   ay = allPositions[i+1], az = allPositions[i+2];
        const bx = allPositions[i+3], by = allPositions[i+4], bz = allPositions[i+5];
        for (const t of lerps) {
          dense.push(
            ax + (bx - ax) * t,
            ay + (by - ay) * t,
            az + (bz - az) * t
          );
        }
      }

      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute("position", new THREE.Float32BufferAttribute(dense, 3));

      // Pre-centre the geometry vertices so rotation pivots around the centre.
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
      manta.rotation.y = 3 * Math.PI / 10;     // diagonal pose ~7-8 o'clock
      manta.rotation.x = -0.05;
      scene.add(manta);

      console.log(`[Auros] silk manta · ${dense.length / 3} dots · scale=${scale.toFixed(3)}`);
    },
    undefined,
    (err) => console.error("[Auros] GLTF load failed:", err)
  );

  /* ---------- Tick loop ---------- */
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

  /* ---------- CTA click handler ---------- */
  const cta = document.getElementById("cta");
  if (cta) {
    cta.addEventListener("click", () => {
      console.log("[Auros] CTA clicked — REQUEST BRIEFING");
    });
  }

  console.log("[Auros] v2.0 Digital Silk — particle manta · Three.js", THREE.REVISION);
})();
