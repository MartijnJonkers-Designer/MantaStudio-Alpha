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
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // PMREM environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.0).texture;

  /* ============================================================
     PROCEDURAL TEXTURES — ripples (floor) + fractures (manta normal)
     ============================================================ */
  function makeRippleTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#F4F6FA";
    ctx.fillRect(0, 0, size, size);
    const cx = size * 0.5, cy = size * 0.5, maxR = size * 0.6;
    for (let r = 4; r < maxR; r += 3) {
      const t = r / maxR;
      const hue = 180 + Math.sin(t * 7.0) * 50 + 30 * t;
      const sat = 65 - t * 25;
      const light = 78 + Math.sin(t * 22.0) * 8;
      const alpha = 0.22 * (1.0 - t * 0.7);
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let r = 14; r < maxR; r += 28) {
      const t = r / maxR;
      const hue = 200 + Math.sin(t * 4.0) * 50;
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 70%, 88%, ${(0.35 * (1.0 - t)).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const edgeGrad = ctx.createRadialGradient(cx, cy, maxR * 0.7, cx, cy, size * 0.5);
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
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const nx = 128 + (Math.random() - 0.5) * 30;
      const ny = 128 + (Math.random() - 0.5) * 30;
      d[i] = nx; d[i+1] = ny; d[i+2] = 255; d[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      const r = 80 + Math.random() * 80;
      const g = 80 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, 255, 0.50)`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      const x0 = Math.random() * size, y0 = Math.random() * size;
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(
        x0 + (Math.random() - 0.5) * 250, y0 + (Math.random() - 0.5) * 250,
        x0 + (Math.random() - 0.5) * 250, y0 + (Math.random() - 0.5) * 250,
        x0 + (Math.random() - 0.5) * 350, y0 + (Math.random() - 0.5) * 350
      );
      ctx.stroke();
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
    ior: 1.52,
    thickness: 1.2,
    envMapIntensity: 3.0,
    attenuationDistance: 0.30,        // v1.8 — was 0.55; deeper cyan saturation
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    side: THREE.DoubleSide,
    normalMap: fractureNormal,
    normalScale: new THREE.Vector2(0.65, 0.65)   // v1.8 — was 0.35; punchier cracks
  });

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

      // 2. Auto-fit: center at origin, scale longest axis to 3 units.
      const bbox = new THREE.Box3().setFromObject(manta);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      const scale = 3.0 / longest;
      manta.position.sub(center.multiplyScalar(scale));
      manta.scale.setScalar(scale);

      // v1.8 — diagonal orientation to match reference
      // (head toward lower-left, tail toward upper-right of frame).
      // If the manta ends up facing the wrong way, flip the sign of rotation.y.
      manta.rotation.y = -Math.PI / 5;   // ~-36° around vertical axis
      manta.rotation.x = -0.15;          // slight nose-down tip

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
     FLOOR — iridescent ripple plane
     ============================================================ */
  const floorGeo = new THREE.PlaneGeometry(20, 20, 64, 64);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    map: rippleMap,
    metalness: 0.0,
    roughness: 0.35,
    transmission: 0.2,
    ior: 1.45,
    thickness: 0.5,
    transparent: true,
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ============================================================
     LIGHTING
     ============================================================ */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.3));

  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 8.0, 4.0, 1.0);
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
     Tick loop — drive animation mixer if present
     ============================================================ */
  function tick() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    renderer.render(scene, camera);
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

  console.log("[Auros] v1.8 — Alignment pass 1 (rotation, cyan, cracks) · Three.js", THREE.REVISION);
})();
