/* ============================================================
   AUROS — GLTF Manta v1.7

   Switched off the procedural geometry. We now load a Sketchfab manta
   ray GLTF model and override every mesh's material with our glass.

   Pipeline:
   1. GLTFLoader fetches cartoon_manta_ray_animated.glb (~2 MB).
   2. On load: traverse the scene tree, replace every material with
      the shared glass MeshPhysicalMaterial, enable shadow casting.
   3. Auto-fit: compute the model's bounding box, center it at origin,
      scale so the longest axis is ~3 units (fits the camera framing).
   4. If the GLB ships animation clips, hook them up to an
      AnimationMixer driven from a delta clock in the tick loop.

   Kept from v1.6: scene background gradient, iridescent floor +
   ripple texture, RectAreaLight key + shadow-casting DirectionalLight
   + rim SpotLight + top-down pool SpotLight, magnetic CTA, no bloom.

   Removed from v1.6: silhouette / midZ / thickness math,
   buildMantaSurface, buildEdgeWall, makeHorn, makeTail, manual
   sway animation (the GLB's own swim animation handles motion).
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();

  /* ============================================================
     SCENE BACKGROUND — soft gradient
     ============================================================ */
  function makeBackgroundGradient() {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#FFFFFF");
    grad.addColorStop(1.0, "#FAFAFA");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  scene.background = makeBackgroundGradient();

  /* ============================================================
     CAMERA — 3/4 top-down to match reference
     ============================================================ */
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0.0, 1.8, 3.2);
  camera.lookAt(0.0, -0.05, 0.0);

  /* ============================================================
     RENDERER
     ============================================================ */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;     // v1.12 — was 1.0; dim global ~25%
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // PMREM environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.0).texture;

  /* ============================================================
     PROCEDURAL TEXTURES — ripples (floor) + fractures (manta normal)
     ============================================================ */
  // v1.11 — much more saturated bands, looser spacing, clearer cyan/lavender alternation
  function makeRippleTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#F8FAFD";
    ctx.fillRect(0, 0, size, size);
    const cx = size * 0.5, cy = size * 0.5, maxR = size * 0.6;

    // Dense fine rings — alpha 3x stronger, saturation pegged
    for (let r = 4; r < maxR; r += 4) {
      const t = r / maxR;
      const hue = 185 + Math.sin(t * 6.0) * 75;     // sweeps 110 (cyan) <-> 260 (lavender)
      const sat = 85;                                // was variable; now hard-pegged
      const light = 72 + Math.sin(t * 18.0) * 6;
      const alpha = 0.55 * (1.0 - t * 0.5);          // was 0.22 * ... = roughly 2.5x more opaque
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, ${sat}%, ${light.toFixed(1)}%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Punchier highlight rings every 32px
    for (let r = 18; r < maxR; r += 32) {
      const t = r / maxR;
      const hue = 195 + Math.sin(t * 3.5) * 65;
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 90%, 75%, ${(0.75 * (1.0 - t)).toFixed(3)})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Soft edge fade so floor blends into BG
    const edgeGrad = ctx.createRadialGradient(cx, cy, maxR * 0.65, cx, cy, size * 0.5);
    edgeGrad.addColorStop(0.0, "rgba(255,255,255,0)");
    edgeGrad.addColorStop(1.0, "rgba(255,255,255,1)");
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function makeFractureNormalTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    // Subtle base noise (less than v1.8)
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const nx = 128 + (Math.random() - 0.5) * 12;
      const ny = 128 + (Math.random() - 0.5) * 12;
      d[i] = nx; d[i+1] = ny; d[i+2] = 255; d[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Long, mostly-straight ice fractures with strong off-axis normals.
    // alpha 0.95 (was 0.50), width 2-5 (was 1-2.5).
    ctx.lineCap = "round";
    for (let i = 0; i < 30; i++) {
      const r = 30 + Math.random() * 80;
      const g = 30 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, 255, 0.95)`;
      ctx.lineWidth = 2 + Math.random() * 3;

      const x0 = Math.random() * size;
      const y0 = Math.random() * size;
      const angle = Math.random() * Math.PI * 2;
      const length = 250 + Math.random() * 500;
      const x1 = x0 + Math.cos(angle) * length;
      const y1 = y0 + Math.sin(angle) * length;

      // Slight curvature via bezier control points along the angle.
      const cx1 = x0 + Math.cos(angle) * length * 0.33 + (Math.random() - 0.5) * 80;
      const cy1 = y0 + Math.sin(angle) * length * 0.33 + (Math.random() - 0.5) * 80;
      const cx2 = x0 + Math.cos(angle) * length * 0.66 + (Math.random() - 0.5) * 80;
      const cy2 = y0 + Math.sin(angle) * length * 0.66 + (Math.random() - 0.5) * 80;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
      ctx.stroke();

      // 50% chance: a branching crack
      if (Math.random() > 0.5) {
        const t = 0.3 + Math.random() * 0.4;
        const bx = x0 + (x1 - x0) * t;
        const by = y0 + (y1 - y0) * t;
        const bAng = angle + (Math.random() - 0.5) * 1.6;
        const bLen = length * (0.25 + Math.random() * 0.2);
        ctx.lineWidth = 1.5 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.5, 1.5);
    return tex;
  }

  const rippleMap      = makeRippleTexture();
  const fractureNormal = makeFractureNormalTexture();

  /* ============================================================
     GLASS MATERIAL — applied to every mesh in the loaded GLTF
     ============================================================ */
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.65,
    thickness: 6.0,                              // v1.14 — was 4.0; more cyan absorption depth
    envMapIntensity: 2.0,
    attenuationDistance: 0.4,
    attenuationColor: new THREE.Color(0x3FA0E5), // v1.14 — was 0x70BFFF; much deeper cyan-blue
    transparent: true,
    side: THREE.DoubleSide,
    clearcoat: 0.5,
    clearcoatRoughness: 0.04,
    iridescence: 0.3,                            // v1.14 — added; subtle blue-pink shifts at angles
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400],
    normalMap: fractureNormal,
    normalScale: new THREE.Vector2(1.5, 1.5)
  });

  // v1.14 — Fresnel-darkening shader injection.
  // Multiplies the final fragment color by a dark cyan tint at glancing
  // angles to simulate total internal reflection at silhouette edges.
  // Uses standard view-space varyings (vNormal, vViewPosition).
  const fresnelUniforms = {
    fresnelPower:    { value: 2.5 },
    fresnelStrength: { value: 0.45 },
    fresnelTint:     { value: new THREE.Color(0x1A4880) }   // dark blue
  };
  glassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.fresnelPower    = fresnelUniforms.fresnelPower;
    shader.uniforms.fresnelStrength = fresnelUniforms.fresnelStrength;
    shader.uniforms.fresnelTint     = fresnelUniforms.fresnelTint;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       uniform float fresnelPower;
       uniform float fresnelStrength;
       uniform vec3  fresnelTint;`
    );

    // Inject just before the colorspace conversion: at this point gl_FragColor
    // has the full transmission + clearcoat + iridescence result. We modulate it.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <colorspace_fragment>",
      `float fresnelTerm = pow(
         1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0),
         fresnelPower
       );
       vec3 fresnelMul = mix(vec3(1.0), fresnelTint, fresnelTerm * fresnelStrength);
       gl_FragColor.rgb *= fresnelMul;
       #include <colorspace_fragment>`
    );
  };

  /* ============================================================
     LOAD THE MANTA GLTF
     ============================================================ */
  let manta = null;          // populated when GLTF finishes loading
  let mixer = null;          // animation mixer, if model has clips
  const clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.load(
    "cartoon_manta_ray_animated.glb",
    (gltf) => {
      manta = gltf.scene;

      // 1. Override every material with the shared glass.
      let meshCount = 0;
      manta.traverse((child) => {
        if (child.isMesh) {
          child.material = glassMaterial;
          child.castShadow = true;
          child.receiveShadow = false;
          meshCount++;
        }
      });

      // 2. Auto-fit: center at origin, scale longest axis to 2 units.
      // v1.10 — was 3.0; manta exceeded camera frame width (~2.5u at FOV 38°
      // from distance 3.67), eating the BG. 2.0 leaves ~25% margin.
      const bbox = new THREE.Box3().setFromObject(manta);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      const scale = 2.0 / longest;
      manta.position.sub(center.multiplyScalar(scale));
      manta.scale.setScalar(scale);

      // v1.10 — head moved from 1-2 o'clock (v1.9 was 180° wrong) to ~7-8.
      // Sign flipped: -7*PI/10 -> +3*PI/10 (equivalent rotation, opposite hemisphere).
      // If still off, dial is rotation.y — each clock hour ≈ +/- PI/6 (30°).
      manta.rotation.y = 3 * Math.PI / 10;    // ~+54°, head at ~7-8 o'clock
      manta.rotation.x = -0.05;               // slight nose-down tip

      // 3. Animation mixer (if any clips).
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(manta);
        for (const clip of gltf.animations) {
          mixer.clipAction(clip).play();
        }
      }

      scene.add(manta);
      console.log(
        `[Auros] GLTF loaded · meshes=${meshCount} · scale=${scale.toFixed(3)} · clips=${gltf.animations?.length ?? 0}`
      );
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        const pct = (xhr.loaded / xhr.total * 100).toFixed(0);
        console.log(`[Auros] GLTF loading: ${pct}%`);
      }
    },
    (err) => {
      console.error("[Auros] GLTF load failed:", err);
    }
  );

  /* ============================================================
     FLOOR — animated ShaderMaterial with real moving ripples
     v1.14 — replaced static CanvasTexture with a ShaderMaterial.
     uTime drives concentric sin-wave bands expanding outward, with
     hue cycling between cyan and lavender. No more dead pixels.
     ============================================================ */
  const floorGeo = new THREE.PlaneGeometry(20, 20, 1, 1);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;

      void main() {
        vec2 offset = vUv - vec2(0.5);
        float dist = length(offset);

        // Soft radial fade so the floor blends into BG
        float fade = smoothstep(0.45, 0.10, dist);

        // Three layered ripples at different frequencies / phases.
        // The negative uTime coefficient makes them expand outward.
        float w1 = sin(dist * 65.0 - uTime * 1.2);
        float w2 = sin(dist * 42.0 - uTime * 0.7);
        float w3 = sin(dist * 95.0 - uTime * 1.6);
        float ripple = (w1 * 0.5 + w2 * 0.3 + w3 * 0.2);

        // Color cycles between cyan and lavender along the radius and over time
        float hueT = sin(dist * 4.5 - uTime * 0.4) * 0.5 + 0.5;
        vec3 cyan     = vec3(0.30, 0.85, 1.00);
        vec3 lavender = vec3(0.82, 0.68, 1.00);
        vec3 bandColor = mix(cyan, lavender, hueT);

        // Off-white base
        vec3 base = vec3(0.96, 0.97, 0.99);

        // Ripple defines opacity, fade attenuates it
        float alpha = (ripple * 0.5 + 0.5) * fade * 0.45;
        vec3 finalColor = mix(base, bandColor, alpha);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  // Note: ShaderMaterial doesn't auto-receive shadows — pool light
  // shadow on floor is sacrificed for moving ripples. Trade looks
  // good in practice because the ripples themselves dominate the
  // floor visual.
  scene.add(floor);

  /* ============================================================
     LIGHTING
     ============================================================ */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.3));

  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 12.0, 4.0, 1.0);   // v1.13 — was 8.0; punchier dorsal hot-spots
  keyLight.position.set(1, 3, 2);
  keyLight.lookAt(0, 0, 0);
  scene.add(keyLight);

  const shadowLight = new THREE.DirectionalLight(0xFFFFFF, 0.6);
  shadowLight.position.set(1, 3, 2);
  shadowLight.target.position.set(0, 0, 0);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(2048, 2048);
  shadowLight.shadow.camera.left = -3; shadowLight.shadow.camera.right = 3;
  shadowLight.shadow.camera.top = 3;   shadowLight.shadow.camera.bottom = -3;
  shadowLight.shadow.camera.near = 0.1; shadowLight.shadow.camera.far = 20;
  shadowLight.shadow.bias = -0.0005;    shadowLight.shadow.radius = 4;
  scene.add(shadowLight);
  scene.add(shadowLight.target);

  const rimLight = new THREE.SpotLight(0xFFFFFF, 10.0);
  rimLight.position.set(-2, 2, -2);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight.target);
  scene.add(rimLight);

  const poolLight = new THREE.SpotLight(0xFFFFFF, 60.0, 8.0, Math.PI / 7, 0.55, 1.4);
  poolLight.position.set(0, 4.0, 0);
  poolLight.target.position.set(0, -1.4, 0);
  scene.add(poolLight.target);
  scene.add(poolLight);

  /* ============================================================
     POST-PROCESSING — selective bloom on highlights only
     v1.11 — back from v1.5+ era, but tuned much tighter:
     threshold 1.05 keeps the off-white BG well below threshold,
     so only specular hot-spots and cyan attenuation peaks bloom.
     ============================================================ */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.25,   // v1.13 — was 0.15; bloom now reads above noise floor
    0.6,    // radius
    1.25    // threshold preserved — only brightest pixels qualify
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ============================================================
     Tick loop — drive animation mixer if present, then composer
     ============================================================ */
  function tick() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    floorMat.uniforms.uTime.value = clock.elapsedTime;   // v1.14 — drive shader animation
    composer.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ============================================================
     Resize
     ============================================================ */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
  });

  /* ============================================================
     Magnetic CTA (preserved)
     ============================================================ */
  const cta = document.getElementById("cta");
  if (cta) {
    const RADIUS = 100;
    const STRENGTH = 0.40;

    window.addEventListener("pointermove", (e) => {
      const rect = cta.getBoundingClientRect();
      const cx = rect.left + rect.width  * 0.5;
      const cy = rect.top  + rect.height * 0.5;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RADIUS) {
        const pull = 1.0 - dist / RADIUS;
        const ox = dx * pull * STRENGTH;
        const oy = dy * pull * STRENGTH;
        cta.style.transform =
          `translate(calc(-50% + ${ox.toFixed(2)}px), ${oy.toFixed(2)}px)`;
      } else {
        cta.style.transform = "translate(-50%, 0)";
      }
    }, { passive: true });

    cta.addEventListener("click", () => {
      console.log("[Auros] CTA clicked — REQUEST BRIEFING");
    });
  }

  console.log("[Auros] v1.14 — Bold pass: animated floor shader + fresnel-darkened cyan + iridescence · Three.js", THREE.REVISION);
})();
