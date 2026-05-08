/* ============================================================
   AUROS v1.26 — Clean slate.

   User: 'just get rid of the bloom and shaders. I just want to see
   small interactive waves underneath or around the manta'.

   Stripped from previous versions:
   - EffectComposer / RenderPass / UnrealBloomPass / OutputPass
   - Fresnel onBeforeCompile injection on the glass material
   - Iridescence
   - Vignette overlay div
   - All HDR ripple band stuff
   - All diagnostic noise
   - Magnetic CTA (CTA is hidden anyway)

   Kept (because they're the actual job):
   - Cartoon manta GLB with auto-fit, glass material override, swim animation
   - Cursor-driven small wave shader on the floor (this is the new BG)
   - Cursor-driven manta tilt
   - Direct renderer.render — no composer, no passes
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  RectAreaLightUniformsLib.init();

  /* ---------- Scene ---------- */
  const scene = new THREE.Scene();
  scene.background = (() => {
    // Soft white-to-off-white vertical gradient.
    const c = document.createElement("canvas");
    c.width = 2; c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#FFFFFF");
    grad.addColorStop(1.0, "#F5F5F8");
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
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.0).texture;

  /* ---------- Glass material for the manta ---------- */
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.05,
    transmission: 1.0,
    ior: 1.5,
    thickness: 1.5,
    envMapIntensity: 1.5,
    attenuationDistance: 1.5,
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    side: THREE.DoubleSide
  });

  /* ---------- Floor: small interactive waves via vertex displacement ----------
     Plane subdivided 128x128 so the vertex shader has resolution to push.
     Cursor sets the wave origin. Time animates them outward. Layered sin
     waves at three frequencies give a natural water-ripple feel. Brightness
     is faked from vertex height so crests look lighter, troughs darker —
     no real lighting needed.
     -------------------------------------------------------------------- */
  const floorGeo = new THREE.PlaneGeometry(20, 20, 128, 128);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vHeight;
      uniform float uTime;
      uniform vec2  uMouse;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Wave origin follows cursor (clamped to small UV offset)
        vec2 center = vec2(0.5) + uMouse * 0.10;
        float dist = length(uv - center);

        // Three layered sin waves — different frequencies and decay rates.
        // Negative time coefficient => waves travel OUTWARD from origin.
        // exp(-dist * k) decays amplitude with distance so the ripples
        // are concentrated near the cursor, fading at the edges.
        float wave = 0.0;
        wave += sin(dist * 35.0 - uTime * 2.5) * exp(-dist * 4.0) * 0.030;
        wave += sin(dist * 22.0 - uTime * 1.7) * exp(-dist * 3.0) * 0.020;
        wave += sin(dist * 50.0 - uTime * 3.2) * exp(-dist * 5.0) * 0.012;

        pos.z += wave;
        vHeight = wave;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vHeight;

      void main() {
        vec3 baseColor = vec3(0.94, 0.95, 0.97);

        // Crest -> brighter, trough -> darker. Fakes lighting on the surface.
        float t = smoothstep(-0.025, 0.025, vHeight);
        vec3 color = mix(baseColor * 0.88, baseColor * 1.06, t);

        gl_FragColor = vec4(color, 1.0);
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

  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 6.0, 4.0, 1.0);
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

      // Override material on every mesh.
      mantaModel.traverse((child) => {
        if (child.isMesh) {
          child.material = glassMaterial;
          child.castShadow = true;
        }
      });

      // Auto-fit. Cartoon model is well-behaved — Box3.setFromObject works.
      const bbox = new THREE.Box3().setFromObject(mantaModel);
      const size = bbox.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      const scale = 2.2 / longest;

      // Wrap in Group, scale + rotate, then post-shift to centre.
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

      // Animation.
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(mantaModel);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
      }

      console.log(`[Auros] manta loaded · scale=${scale.toFixed(3)} · clips=${gltf.animations?.length ?? 0}`);
    },
    undefined,
    (err) => console.error("[Auros] GLTF load failed:", err)
  );

  /* ---------- Tick loop ---------- */
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

  console.log("[Auros] v1.26 — Clean slate, small interactive waves, no bloom · Three.js", THREE.REVISION);
})();
