/* ============================================================
   AUROS — Cinematic v1.3 (Sleek Glacier Monolith)

   Reference image: iridescent floor pool, cyan/lavender concentric
   rings, bright-edged crystal manta with fractured surface, soft
   off-white sky.

   Changes vs v1.2:
   1. Floor ripples — CanvasTexture, concentric cyan/lavender bands
      drawn at HSL hue shifts. Floor transmission dropped 0.5 -> 0.2
      so the rings actually read.
   2. Manta surface — fractureNormal punched up (normalScale 1.4 -> 2.0)
      so the ice cracks read as fractures, not plastic.
   3. Fresnel — onBeforeCompile injects a fresnel term that adds white
      light to totalEmissiveRadiance at glancing angles. Edges glow
      bright white, center stays clear/refractive.
   4. No more fog — bloom threshold 1.0 -> 1.1; scene.background is
      now a 2x512 vertical CanvasTexture gradient (#FFFFFF -> #FAFAFA).
   5. Top-down SpotLight — tight cone aimed at floor origin creates the
      "pooling" effect on the ripples.

   v0.29 -> v1.0: introduced bloom, displacement, floor, fractures,
   RectAreaLight key.
   v1.0 -> v1.1: fixed mesh self-inversion + bloom-against-white-BG fog.
   v1.1 -> v1.2: grey-tinted manta + opacity 0.9 + tighter bloom.
   v1.2 -> v1.3: glacier-monolith look (this file).
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

  RectAreaLightUniformsLib.init();

  const ARCTIC_BLUE = 0x00FFFF;

  const scene = new THREE.Scene();

  /* ============================================================
     SCENE BACKGROUND — soft gradient (#FFFFFF top -> #FAFAFA bottom)
     ============================================================ */
  function makeBackgroundGradient() {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 512;
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

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 4.0);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // PMREM environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.0).texture;

  /* ============================================================
     PROCEDURAL TEXTURES
     ============================================================ */

  // 1. DISPLACEMENT MAP — radial white-to-black gradient, drives body bulge.
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
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
  }

  // 2. NORMAL MAP — high-frequency noise + bezier crack lines for fracture look.
  function makeFractureNormalTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    // Base noise around tangent-space neutral
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const nx = 128 + (Math.random() - 0.5) * 60;
      const ny = 128 + (Math.random() - 0.5) * 60;
      d[i]     = nx;
      d[i + 1] = ny;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Crack lines as off-axis normals
    ctx.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const r = 60 + Math.random() * 100;
      const g = 60 + Math.random() * 100;
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, 255, 0.65)`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
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

  // 3. FLOOR RIPPLE TEXTURE — concentric iridescent cyan/lavender bands.
  function makeRippleTexture() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    // Base — soft off-white field
    ctx.fillStyle = "#F4F6FA";
    ctx.fillRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.5;
    const maxR = size * 0.6;

    // Concentric rings, hue shifting from cyan (180) to lavender (270) and back.
    // Two overlapping passes give the iridescent shimmer.
    for (let r = 4; r < maxR; r += 3) {
      const t = r / maxR;
      const hue = 180 + Math.sin(t * 7.0) * 50 + 30 * t;   // 180 -> ~280
      const sat = 65 - t * 25;
      const light = 78 + Math.sin(t * 22.0) * 8;
      const alpha = 0.22 * (1.0 - t * 0.7);
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Brighter highlight rings every 28px for the "ripple" punch
    for (let r = 14; r < maxR; r += 28) {
      const t = r / maxR;
      const hue = 200 + Math.sin(t * 4.0) * 50;
      ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 70%, 88%, ${(0.35 * (1.0 - t)).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer edge fade to white so floor blends into BG
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

  const displacementMap = makeDisplacementTexture();
  const fractureNormal  = makeFractureNormalTexture();
  const rippleMap       = makeRippleTexture();

  /* ============================================================
     GEOMETRY — stealth manta, heavily subdivided.
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
    bevelSegments: 24,
    curveSegments: 64,
    steps: 8
  };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();
  geometry.computeVertexNormals();

  /* ============================================================
     MANTA MATERIAL — diamond glass + Fresnel edge glow
     ============================================================ */
  const mantaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x888888,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 2.5,
    envMapIntensity: 5.0,
    attenuationDistance: 0.25,
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    opacity: 0.9,
    emissive: new THREE.Color(ARCTIC_BLUE),
    emissiveIntensity: 0.0,

    displacementMap: displacementMap,
    displacementScale: 0.25,
    displacementBias: 0.0,

    normalMap: fractureNormal,
    normalScale: new THREE.Vector2(2.0, 2.0)   // v1.3 — was 1.4; punchier fractures
  });

  // FRESNEL via onBeforeCompile.
  // Adds white emissive at glancing angles -> bright edges, clear center.
  // Uses the standard view-space varyings vNormal (declared by normal_pars_fragment)
  // and vViewPosition (declared by viewport_pars_fragment / set in vertex stage).
  const fresnelUniforms = {
    fresnelPower:     { value: 2.5 },
    fresnelIntensity: { value: 1.6 },
    fresnelColor:     { value: new THREE.Color(0xFFFFFF) }
  };
  mantaMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.fresnelPower     = fresnelUniforms.fresnelPower;
    shader.uniforms.fresnelIntensity = fresnelUniforms.fresnelIntensity;
    shader.uniforms.fresnelColor     = fresnelUniforms.fresnelColor;

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
       totalEmissiveRadiance += fresnelColor * fresnelTerm * fresnelIntensity;
      `
    );
  };

  const manta = new THREE.Mesh(geometry, mantaMaterial);
  manta.rotation.x = -0.2;
  manta.castShadow = true;
  manta.receiveShadow = false;
  scene.add(manta);

  // Inner cyan PointLight — stays inside the wing, glows from within.
  const innerLight = new THREE.PointLight(0x00FFFF, 2.0, 3, 2);
  manta.add(innerLight);

  /* ============================================================
     FLOOR — iridescent ripple plane, anchor of the scene.
     ============================================================ */
  const floorGeo = new THREE.PlaneGeometry(20, 20, 64, 64);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    map: rippleMap,
    metalness: 0.0,
    roughness: 0.35,         // a bit hazier so the spotlight pool reads
    transmission: 0.2,       // v1.3 — was 0.5; rings show through clearly
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
     LIGHTING
     ============================================================ */
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.3));

  // KEY: RectAreaLight — long rectangular highlights.
  const keyLight = new THREE.RectAreaLight(0xFFFFFF, 8.0, 4.0, 1.0);
  keyLight.position.set(1, 3, 2);
  keyLight.lookAt(0, 0, 0);
  scene.add(keyLight);

  // SHADOW CASTER: low-intensity DirectionalLight (RectAreaLight can't cast shadows).
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

  // POOL: top-down SpotLight — creates the bright pool on the floor ripples.
  const poolLight = new THREE.SpotLight(0xFFFFFF, 60.0, 8.0, Math.PI / 7, 0.55, 1.4);
  poolLight.position.set(0, 4.0, 0);
  poolLight.target.position.set(0, -2.0, 0);
  scene.add(poolLight.target);
  scene.add(poolLight);

  /* ============================================================
     POST-PROCESSING
     ============================================================ */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  // Selective bloom — only HDR pulse + Fresnel rim cross threshold 1.1.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,   // strength
    0.5,   // radius
    1.1    // threshold (v1.3 — was 1.0; tighter selection, no fog)
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ============================================================
     Tick loop
     ============================================================ */
  function tick(tMs) {
    const tSec = tMs * 0.001;
    manta.rotation.y = Math.sin(tSec * 0.1) * 0.15;
    manta.position.y = Math.sin(tSec * 0.15) * 0.05;

    // Pulse — peak 3.0 (HDR, exceeds bloom threshold).
    const phase = (tSec % 4.0) / 4.0;
    const peak = Math.exp(-phase * 8.0);
    mantaMaterial.emissiveIntensity = peak * 3.0;

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

  console.log("[Auros] v1.3 — Sleek Glacier Monolith (ripples + fresnel + pool) · Three.js", THREE.REVISION);
})();
