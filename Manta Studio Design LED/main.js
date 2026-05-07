/* ============================================================
   AUROS — Cinematic v1.0 (post-processing, no compromises)

   v0.29 was material-perfect but lacked atmospheric soul.
   This is a ground-up rebuild around shaders + bloom.

   1. THE BODY (BULGE):
      CanvasTexture radial gradient (white center -> black edge)
      applied as displacementMap on the manta material.
      displacementScale: 0.8 -> thick body, thin wings.

   2. THE ATMOSPHERE (BLOOM):
      EffectComposer + UnrealBloomPass.
      strength 2.0, radius 0.5, threshold 0.1.
      Arctic-blue pulse bleeds into the white space.

   3. THE FLOOR (TARGET):
      PlaneGeometry @ y = -2, MeshPhysicalMaterial
      transmission 0.5, roughness 0.2.
      Manta casts a shadow onto it.

   4. INTERNAL FRACTURES:
      Procedural noise CanvasTexture as normalMap with
      bezier "crack" overlays. We see fractures, not glass.

   5. LIGHTING:
      Key light is a RectAreaLight (long rectangular highlights,
      not round sun-dot). RectAreaLight cannot cast shadows in
      three.js, so a low-intensity DirectionalLight handles
      shadow projection only.
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

(function () {
  const canvas = document.getElementById("auros-canvas");
  if (!canvas) return;

  // RectAreaLight needs its uniforms initialized once before use.
  RectAreaLightUniformsLib.init();

  const BG_COLOR    = 0xFFFFFF;
  const ARCTIC_BLUE = 0x00FFFF;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 4.0);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // PMREM environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.0).texture;

  /* ============================================================
     PROCEDURAL TEXTURES
     ============================================================ */

  // 1. DISPLACEMENT MAP — radial white-to-black gradient
  //    White (1.0) at center pushes outward = body bulge.
  //    Black (0.0) at edges leaves the wings flat.
  function makeDisplacementTexture() {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    const grad = ctx.createRadialGradient(
      size * 0.5, size * 0.5, 0,
      size * 0.5, size * 0.5, size * 0.5
    );
    grad.addColorStop(0.0, "#FFFFFF");
    grad.addColorStop(0.4, "#A0A0A0");
    grad.addColorStop(1.0, "#000000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;   // displacement is data, not color
    return tex;
  }

  // 2. NORMAL MAP — high-frequency noise + bezier "crack" lines
  //    Around tangent-space neutral (128, 128, 255) so the surface
  //    only deviates locally. Cracks are off-axis pushes that read
  //    as fractures inside the ice.
  function makeFractureNormalTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    // Base noise
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const nx = 128 + (Math.random() - 0.5) * 50;
      const ny = 128 + (Math.random() - 0.5) * 50;
      d[i]     = nx;
      d[i + 1] = ny;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Bezier crack lines — strong off-axis normals
    ctx.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      const r = 80 + Math.random() * 80;
      const g = 80 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, 255, 0.55)`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const x0 = Math.random() * size;
      const y0 = Math.random() * size;
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(
        x0 + (Math.random() - 0.5) * 300,
        y0 + (Math.random() - 0.5) * 300,
        x0 + (Math.random() - 0.5) * 300,
        y0 + (Math.random() - 0.5) * 300,
        x0 + (Math.random() - 0.5) * 400,
        y0 + (Math.random() - 0.5) * 400
      );
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  const displacementMap = makeDisplacementTexture();
  const fractureNormal  = makeFractureNormalTexture();

  /* ============================================================
     GEOMETRY — stealth manta, heavily subdivided so displacement
     and normalMap have vertices to push around.
     ============================================================ */
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.6);
  shape.bezierCurveTo(0.2, 0.6, 0.5, 0.1, 1.6, 0);
  shape.bezierCurveTo(0.5, -0.2, 0.1, -0.3, 0.05, -0.9);
  shape.lineTo(-0.05, -0.9);
  shape.bezierCurveTo(-0.1, -0.3, -0.5, -0.2, -1.6, 0);
  shape.bezierCurveTo(-0.5, 0.1, -0.2, 0.6, 0, 0.6);

  const extrudeSettings = {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.1,
    bevelSegments: 24,    // up from 16 — more verts for displacement
    curveSegments: 64,    // up from 40 — smoother + more verts
    steps: 8              // subdivide depth axis for displacement
  };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();
  geometry.computeVertexNormals();

  /* ============================================================
     MATERIAL — diamond glass + displacement + fractures
     ============================================================ */
  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 2.5,
    envMapIntensity: 5.0,
    attenuationDistance: 0.25,
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    emissive: new THREE.Color(ARCTIC_BLUE),
    emissiveIntensity: 0.0,

    // v1.1 — body bulge (was scale 0.8 / bias -0.4: mesh self-inverted because
    // edge UVs computed to -0.4 along normal on a 0.05-thick extrude, folding
    // front and back faces through each other). Bias 0 ensures only outward push.
    displacementMap: displacementMap,
    displacementScale: 0.25,
    displacementBias: 0.0,

    // v1.0 — internal fractures
    normalMap: fractureNormal,
    normalScale: new THREE.Vector2(1.4, 1.4)
  });

  const manta = new THREE.Mesh(geometry, mantaMaterial);
  manta.rotation.x = -0.2;
  manta.castShadow = true;
  manta.receiveShadow = false;
  scene.add(manta);

  // Inner glow — cyan pointlight inside the wing.
  const innerLight = new THREE.PointLight(0x00FFFF, 2.0, 3, 2);
  manta.add(innerLight);

  /* ============================================================
     FLOOR — refractive plane that catches the shadow.
     ============================================================ */
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.2,
    transmission: 0.5,
    ior: 1.45,
    thickness: 0.5,
    transparent: true,
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.0;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ============================================================
     LIGHTING — RectAreaLight key + shadow-only directional + rim
     ============================================================ */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.3));

  // KEY: RectAreaLight — long rectangular highlights, not a round sun-dot.
  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 8.0, 4.0, 1.0);
  keyLight.position.set(1, 3, 2);
  keyLight.lookAt(0, 0, 0);
  scene.add(keyLight);

  // SHADOW CASTER: RectAreaLight cannot cast shadows in three.js,
  // so a low-intensity DirectionalLight handles shadow projection only.
  const shadowLight = new THREE.DirectionalLight(0xFFFFFF, 0.6);
  shadowLight.position.set(1, 3, 2);
  shadowLight.target.position.set(0, 0, 0);
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(2048, 2048);
  shadowLight.shadow.camera.left   = -3;
  shadowLight.shadow.camera.right  =  3;
  shadowLight.shadow.camera.top    =  3;
  shadowLight.shadow.camera.bottom = -3;
  shadowLight.shadow.camera.near   = 0.1;
  shadowLight.shadow.camera.far    = 20;
  shadowLight.shadow.bias          = -0.0005;
  shadowLight.shadow.radius        = 4;
  scene.add(shadowLight);
  scene.add(shadowLight.target);

  // RIM: backlight from upper-back-left.
  const rimLight = new THREE.SpotLight(0xFFFFFF, 10.0);
  rimLight.position.set(-2, 2, -2);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight.target);
  scene.add(rimLight);

  /* ============================================================
     POST-PROCESSING — EffectComposer + UnrealBloomPass
     ============================================================ */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  // v1.1 — threshold raised from 0.1 to 1.05. On a white background (luminance 1.0),
  // threshold 0.1 made the entire frame exceed threshold, so bloom blurred everything
  // into white-on-white slop and the transmissive manta vanished. Threshold must be
  // ABOVE white BG luminance — only the HDR-bright emissive pulse (now peak 3.0) blooms.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    2.0,   // strength (per spec)
    0.5,   // radius   (per spec)
    1.05   // threshold (was 0.1 — see comment above)
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());   // tone-map + colorspace correction

  /* ============================================================
     Tick loop
     ============================================================ */
  function tick(tMs) {
    const tSec = tMs * 0.001;
    manta.rotation.y = Math.sin(tSec * 0.1) * 0.15;
    manta.position.y = Math.sin(tSec * 0.15) * 0.05;

    // Pulse — exponential falloff every 4 seconds. v1.1: peak * 3.0 (was 1.0).
    // Peak must exceed bloom threshold (1.05) AND exceed white BG luminance to
    // bloom selectively. With ACES tone mapping the peak compresses to a clean
    // cyan flash rather than blowing out to white.
    const phase = (tSec % 4.0) / 4.0;
    const peak = Math.exp(-phase * 8.0);
    mantaMaterial.emissiveIntensity = peak * 3.0;

    composer.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ============================================================
     Resize — both renderer and composer.
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

  console.log("[Auros] v1.1 — Cinematic fix (bloom threshold, displacement bias) · Three.js", THREE.REVISION);
})();
