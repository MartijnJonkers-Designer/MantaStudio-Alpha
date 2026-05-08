/* ============================================================
   AUROS v1.27 — Cinematic Sculpt (4 layers)

   Direction from user: stop chasing one perfect material, build
   layered shading that emulates a path-traced render.

   Layer 1 — Cracked Ice:
     Procedural noise + bezier crack texture used as both normalMap
     and roughnessMap on the glass. The high-roughness crack pixels
     create darker "veins" inside the ice; the noise gives subtle
     surface variation between cracks.

   Layer 2 — Fresnel Rim Glow:
     onBeforeCompile injection adds a Fresnel term to
     totalEmissiveRadiance: bright white at glancing angles, zero
     face-on. Edges glow > bloom threshold > soft halo around manta.

   Layer 3 — Aura Ripples:
     Floor is a ShaderMaterial with concentric HDR cyan/lavender
     bands (vec3 values >1.0 so they cross bloom threshold). The
     bands cycle through cyan #00FFFF and lavender #E6E6FA along
     radius, animated outward over time. Cursor moves the centre.

   Layer 4 — Studio Environment:
     PMREM-baked RoomEnvironment provides the IBL for reflections
     and refractions on the glass. Without this the manta reads
     as plastic.

   Post: EffectComposer + UnrealBloomPass at threshold 1.1 — only
   Fresnel rim emissive and HDR floor bands cross. Off-white BG
   stays clean.
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

  /* ---------- Scene ---------- */
  const scene = new THREE.Scene();
  scene.background = (() => {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#F2F4F8");   // v1.29 — cool grey-white, matches reference BG
    grad.addColorStop(1.0, "#E8EBF1");   // v1.29 — slightly deeper at bottom for depth
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  /* ---------- Camera ---------- */
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0.0, 1.1, 3.2);
  camera.lookAt(0.0, 0.0, 0.0);

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;          // v1.28 — was 1.0; dim global ~15%
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* ---------- Layer 4: Studio Environment (IBL) ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.0).texture;

  /* ============================================================
     Layer 1 — Cracked Ice texture.
     Two-pass procedural: pseudo-Perlin background + bezier crack lines.
     Used as BOTH normalMap (subtle surface deviation) AND roughnessMap
     (high-roughness crack lines = dark veins, low-roughness elsewhere
     = clean glass).
     ============================================================ */
  function makeCrackTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    // Pseudo-Perlin background — layered cosines + jitter.
    // Result is a soft mottled grey field that reads as organic noise.
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        let n = 0;
        n += Math.cos(x * 0.013) * Math.cos(y * 0.013) * 0.50;
        n += Math.cos(x * 0.031 + 1.3) * Math.cos(y * 0.031 + 2.7) * 0.30;
        n += Math.cos(x * 0.067 + 3.1) * Math.cos(y * 0.067 + 4.5) * 0.15;
        n += (Math.random() - 0.5) * 0.05;
        const v = 200 + n * 30;            // mostly bright (low-roughness baseline)
        d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Bezier crack lines drawn DARK — these will be high-roughness "veins".
    ctx.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(20, 20, 20, ${0.5 + Math.random() * 0.4})`;
      ctx.lineWidth = 1.5 + Math.random() * 2.5;
      const x0 = Math.random() * size;
      const y0 = Math.random() * size;
      const angle = Math.random() * Math.PI * 2;
      const length = 200 + Math.random() * 500;
      const x1 = x0 + Math.cos(angle) * length;
      const y1 = y0 + Math.sin(angle) * length;
      const cx1 = x0 + Math.cos(angle) * length * 0.33 + (Math.random() - 0.5) * 80;
      const cy1 = y0 + Math.sin(angle) * length * 0.33 + (Math.random() - 0.5) * 80;
      const cx2 = x0 + Math.cos(angle) * length * 0.66 + (Math.random() - 0.5) * 80;
      const cy2 = y0 + Math.sin(angle) * length * 0.66 + (Math.random() - 0.5) * 80;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
      ctx.stroke();

      // Branching crack
      if (Math.random() > 0.5) {
        const t = 0.3 + Math.random() * 0.4;
        const bx = x0 + (x1 - x0) * t;
        const by = y0 + (y1 - y0) * t;
        const bAng = angle + (Math.random() - 0.5) * 1.6;
        const bLen = length * (0.25 + Math.random() * 0.2);
        ctx.lineWidth = 1.0 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
        ctx.stroke();
      }
    }

    // Hairline secondary cracks for density.
    for (let i = 0; i < 100; i++) {
      ctx.strokeStyle = `rgba(50, 50, 50, ${0.2 + Math.random() * 0.3})`;
      ctx.lineWidth = 0.5 + Math.random() * 0.8;
      const x0 = Math.random() * size, y0 = Math.random() * size;
      const angle = Math.random() * Math.PI * 2;
      const length = 60 + Math.random() * 160;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(angle) * length, y0 + Math.sin(angle) * length);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  const crackTexture = makeCrackTexture();

  /* ============================================================
     Glass material with Layer 1 (noise maps) + Layer 2 prep.
     ============================================================ */
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.0,                                 // base glass roughness
    roughnessMap: crackTexture,                     // Layer 1: cracks darken via roughness
    transmission: 1.0,
    ior: 1.5,
    thickness: 1.5,
    envMapIntensity: 0.6,                           // v1.29 — was 1.0; less white reflection on glass
    attenuationDistance: 1.2,
    attenuationColor: new THREE.Color(0x80B8DD),    // v1.29 — was 0xC8E8FF; saturated cyan-blue tint
    transparent: true,
    side: THREE.DoubleSide,
    normalMap: crackTexture,                        // Layer 1: cracks visible as relief
    normalScale: new THREE.Vector2(0.10, 0.10)      // user spec: 0.1 — subtle
  });

  /* ============================================================
     Layer 2 — Fresnel rim glow shader injection.
     Adds bright white emissive at glancing angles. The emissive
     contribution rides through bloom since its luminance > threshold.
     ============================================================ */
  glassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.fresnelPower     = { value: 2.5 };
    shader.uniforms.fresnelIntensity = { value: 0.20 };  // v1.29 — was 0.6; hint, not halo (no flashbang)
    shader.uniforms.fresnelColor     = { value: new THREE.Color(0xFFFFFF) };

    shader.fragmentShader =
      `uniform float fresnelPower;
       uniform float fresnelIntensity;
       uniform vec3  fresnelColor;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       float fresnelTerm = pow(
         1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0),
         fresnelPower
       );
       totalEmissiveRadiance += fresnelColor * fresnelTerm * fresnelIntensity;`
    );
  };

  /* ============================================================
     Layer 3 — Aura ripples on the floor.
     ShaderMaterial with HDR cyan + lavender bands cycling along
     radius and time. HDR values exceed bloom threshold so the
     bands glow. Cursor moves the centre.

     Cyan target  : #00FFFF (0, 1, 1) -> boosted to (0.4, 1.6, 1.5)
     Lavender     : #E6E6FA (0.90, 0.90, 0.98) -> boosted to (1.45, 1.40, 1.55)
     ============================================================ */
  const floorGeo = new THREE.PlaneGeometry(20, 20, 1, 1);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) }
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
      uniform vec2  uMouse;

      void main() {
        vec2 center = vec2(0.5) + uMouse * 0.10;
        vec2 offset = vUv - center;
        float dist = length(offset);

        // Soft radial fade so the floor blends into BG.
        float fade = 1.0 - smoothstep(0.10, 0.45, dist);

        // Three layered ripples — wide bands, expand outward.
        float w1 = sin(dist * 18.0 - uTime * 0.95);
        float w2 = sin(dist * 11.0 - uTime * 0.55);
        float w3 = sin(dist * 26.0 - uTime * 1.30);
        float ripple = (w1 * 0.5 + w2 * 0.3 + w3 * 0.2);

        // Hue cycles cyan <-> lavender along radius and time.
        float hueT = sin(dist * 3.5 - uTime * 0.30) * 0.5 + 0.5;

        // v1.29 — saturated turquoise + pink-violet matching the reference image.
        // Higher peaks for vibrancy after ACES tonemap; manta's own brightness
        // is dialed way down (Fresnel 0.20, envMap 0.6) so the bands can glow
        // without the manta competing as another bright source.
        vec3 cyan     = vec3(0.30, 1.70, 1.55);
        vec3 lavender = vec3(1.60, 1.15, 1.60);
        vec3 bandColor = mix(cyan, lavender, hueT);

        // Off-white base sits below threshold, never glows.
        vec3 base = vec3(0.96, 0.97, 0.99);

        // Soft band falloff for diffuse edges.
        float bandStrength = (ripple * 0.5 + 0.5);
        bandStrength = pow(bandStrength, 1.4);
        float alpha = bandStrength * fade * 0.95;

        vec3 finalColor = mix(base, bandColor, alpha);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  scene.add(floor);

  /* ---------- Lighting ---------- */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.4));

  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 8.0, 4.0, 1.0);
  keyLight.position.set(1, 3, 2);
  keyLight.lookAt(0, 0, 0);
  scene.add(keyLight);

  const shadowLight = new THREE.DirectionalLight(0xFFFFFF, 0.5);
  shadowLight.position.set(1, 3, 2);
  shadowLight.target.position.set(0, 0, 0);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(1024, 1024);
  shadowLight.shadow.camera.left = -3; shadowLight.shadow.camera.right = 3;
  shadowLight.shadow.camera.top = 3;   shadowLight.shadow.camera.bottom = -3;
  shadowLight.shadow.camera.near = 0.1; shadowLight.shadow.camera.far = 20;
  shadowLight.shadow.bias = -0.0005;
  shadowLight.shadow.radius = 4;
  scene.add(shadowLight);
  scene.add(shadowLight.target);

  const rimLight = new THREE.SpotLight(0xFFFFFF, 8.0);
  rimLight.position.set(-2, 2, -2);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight.target);
  scene.add(rimLight);

  /* ---------- Cursor state ---------- */
  const mouse       = new THREE.Vector2(0, 0);
  const smoothMouse = new THREE.Vector2(0, 0);
  const BASE_ROT_Y  = 3 * Math.PI / 10;
  const BASE_ROT_X  = -0.05;

  window.addEventListener("pointermove", (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ---------- Manta load ---------- */
  let manta = null;
  let mixer = null;
  const clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.load(
    "cartoon_manta_ray_animated.glb",
    (gltf) => {
      const mantaModel = gltf.scene;
      mantaModel.traverse((child) => {
        if (child.isMesh) {
          child.material = glassMaterial;
          child.castShadow = true;
        }
      });

      const bbox = new THREE.Box3().setFromObject(mantaModel);
      const size = bbox.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      const scale = 2.2 / longest;

      manta = new THREE.Group();
      manta.add(mantaModel);
      manta.scale.setScalar(scale);
      manta.rotation.y = BASE_ROT_Y;
      manta.rotation.x = BASE_ROT_X;
      scene.add(manta);

      manta.updateMatrixWorld(true);
      const worldBbox = new THREE.Box3().setFromObject(manta);
      const worldCenter = worldBbox.getCenter(new THREE.Vector3());
      manta.position.sub(worldCenter);

      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(mantaModel);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
      }

      console.log(`[Auros] manta loaded · scale=${scale.toFixed(3)} · clips=${gltf.animations?.length ?? 0}`);
    },
    undefined,
    (err) => console.error("[Auros] GLTF load failed:", err)
  );

  /* ============================================================
     Post-processing — bloom catches Fresnel rim + HDR floor bands.
     ============================================================ */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.30,   // v1.29 — was 0.15; visible band glow
    0.70,   // v1.29 — was 0.50; wider soft halo
    1.10    // v1.29 — was 1.20; bands catch easier
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ---------- Tick ---------- */
  function tick() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    smoothMouse.x += (mouse.x - smoothMouse.x) * 0.06;
    smoothMouse.y += (mouse.y - smoothMouse.y) * 0.06;

    if (manta) {
      manta.rotation.y = BASE_ROT_Y + smoothMouse.x * 0.18;
      manta.rotation.x = BASE_ROT_X + smoothMouse.y * 0.12;
    }

    floorMat.uniforms.uTime.value = clock.elapsedTime;
    floorMat.uniforms.uMouse.value.copy(smoothMouse);

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

  console.log("[Auros] v1.29 — Reference color match (saturated bands, dim manta, cool BG) · Three.js", THREE.REVISION);
})();
