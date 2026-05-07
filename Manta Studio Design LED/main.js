/* ============================================================
   AUROS — Liquid Engine v0.16 (Manta Core: obsidian + molten gold)

   Full architectural rebuild toward the concept render's volumetric
   gold topography. Switches from THREE.Points to THREE.InstancedMesh
   with billboarded PlaneGeometry quads, scales density ~3x to 480k
   instances, swaps to the obsidian/gold palette, and replaces the
   radial cursor push with a perpendicular-to-motion channel wake.

   Performance reality: 480k instances is the practical ceiling for
   per-instance fbm in the vertex shader at 60fps on consumer GPUs.
   "20x" from the brief was not achievable interactively; this is ~3x.

   Pipeline:
     ShaderMaterial (InstancedMesh) -> RenderPass -> UnrealBloomPass
       -> OutputPass
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

  const OBSIDIAN = 0x030305;

  /* -------- Scene + camera --------
     Wider FOV than v0.15 (60 vs 55) for stronger perspective. Camera
     positioned for a roughly 30° downward pitch — topographic but not
     bird's-eye. Position is updated per-frame with mouse parallax. */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(OBSIDIAN);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.05,
    20
  );
  const camBaseY = 0.85;
  const camBaseZ = 1.30;
  const camLookY = 0.0;
  const camLookZ = -0.40;
  camera.position.set(0, camBaseY, camBaseZ);
  camera.lookAt(0, camLookY, camLookZ);

  /* -------- Renderer -------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(OBSIDIAN, 1);

  /* -------- InstancedMesh: 480,000 billboarded quads --------
     Each instance's position is baked into instanceMatrix at startup.
     The vertex shader extracts that XZ position, computes height each
     frame from fbm + sine + ripple, and offsets the base quad's local
     vertices along camera-aligned right/up axes (billboard). */
  const GRID_W = 800;
  const GRID_D = 600;
  const GRID_X = 4.8;
  const GRID_Z = 4.0;
  const TOTAL  = GRID_W * GRID_D;   // 480,000

  const baseGeometry = new THREE.PlaneGeometry(0.008, 0.008);

  /* -------- Uniforms -------- */
  const uniforms = {
    uTime:      { value: 0 },
    uMouse:     { value: new THREE.Vector2(0, 0) },
    uMouseVel:  { value: new THREE.Vector2(0, 0) },
    uDisplace:  { value: 0 },
    uHeight:    { value: 0.22 },     // peak amplitude in world units
  };

  /* -------- Shaders -------- */
  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform vec2  uMouseVel;
    uniform float uDisplace;
    uniform float uHeight;

    varying float vHeight;
    varying vec2  vQuadUv;
    varying vec2  vScreenUv;

    /* Stefan Gustavson 2D simplex noise. */
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

    void main() {
      /* Per-instance world position from instanceMatrix translation column. */
      vec3 instancePos = vec3(instanceMatrix[3]);
      vec2 p2 = instancePos.xz;

      /* ---- Ambient field: dramatic sine wave dominant + fbm detail ----
         Per the brief, the sine is the PRIMARY motion. fbm halved
         to 0.5 contribution so it's only surface texture. */
      float t = uTime * 0.07;
      vec2 q = p2 * 1.4;
      vec2 warp = vec2(
        fbm(q + vec2(t,         0.0      )),
        fbm(q + vec2(0.0,       t * 0.8  ))
      );
      vec2 q2 = q + warp * 0.55;
      float h_fbm = fbm(q2 + vec2(t * 0.5)) * 0.50;

      // Slow viscous wing flap, long wavelength, dominant amplitude.
      float wing = sin(p2.x * 0.5 + uTime * 0.40) * 1.0;

      float h = wing + h_fbm;

      /* ---- Mouse cursor effects (5 layered) ---- */
      vec2 toM = p2 - uMouse;
      float d = length(toM);
      float envClose = exp(-d * 3.0);
      float envBroad = exp(-d * 1.5);

      // 1. Vertical lift — sharp narrow peak at cursor
      h += envClose * uDisplace * 0.55;

      // 2. Concentric outgoing ripples
      float ringPhase = d * 14.0 - uTime * 5.0;
      h += sin(ringPhase) * envBroad * uDisplace * 0.10;

      // 3. Tangential swirl — perpendicular to radial
      vec2 radial  = (d > 0.001) ? toM / d : vec2(0.0);
      vec2 tangent = vec2(-radial.y, radial.x);
      vec2 swirl   = tangent * envBroad * uDisplace * 0.08;
      instancePos.x += swirl.x;
      instancePos.z += swirl.y;

      // 4. Channel push — particles pushed perpendicular to mouse motion
      //    direction, leaving a parted channel along the path of motion.
      float speed2 = dot(uMouseVel, uMouseVel);
      if (speed2 > 0.00005) {
        vec2 motionUnit = uMouseVel / sqrt(speed2);
        vec2 motionPerp = vec2(-motionUnit.y, motionUnit.x);
        float perpDist  = dot(toM, motionPerp);
        // Localize the channel band along the line of motion
        float along     = abs(dot(toM, motionUnit));
        float bandFalloff = exp(-along * 1.5) * exp(-abs(perpDist) * 1.0);
        vec2 channel = motionPerp * sign(perpDist)
                      * bandFalloff * sqrt(speed2) * 0.18;
        instancePos.x += channel.x;
        instancePos.z += channel.y;
      }

      // 5. Motion wake — particles get carried in cursor's direction
      vec2 wake = uMouseVel * envBroad * 0.10;
      instancePos.x += wake.x;
      instancePos.z += wake.y;

      /* Apply combined height. */
      instancePos.y = h * uHeight;

      /* ---- Billboard: rotate quad vertices to face camera ----
         viewMatrix's first/second columns are world-space right/up. */
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 worldPos = instancePos + right * position.x + up * position.y;

      vec4 mvPos    = viewMatrix * vec4(worldPos, 1.0);
      gl_Position   = projectionMatrix * mvPos;

      vHeight   = h * 0.4 + 0.5;                                  // [~0, 1] band
      vQuadUv   = uv;
      vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
    }
  `;

  const fragmentShader = /* glsl */ `
    varying float vHeight;
    varying vec2  vQuadUv;
    varying vec2  vScreenUv;

    /* Palette — obsidian -> dim slate-blue -> molten gold -> near-white. */
    const vec3 cValley = vec3(0.0118, 0.0118, 0.0196);   // #030305
    const vec3 cMid    = vec3(0.0784, 0.0902, 0.1255);   // dim slate-blue
    const vec3 cGold   = vec3(0.8314, 0.6863, 0.2157);   // #D4AF37
    const vec3 cSpec   = vec3(1.0000, 0.9500, 0.5000);   // bright crest highlight

    void main() {
      /* Sharp circular discard from quad UV. */
      vec2 cc = vQuadUv - 0.5;
      float r2 = dot(cc, cc);
      if (r2 > 0.25) discard;

      /* Two-stop palette: valleys -> mid -> gold by height. */
      float tA = smoothstep(0.0, 0.40, vHeight);    // valley -> mid
      float tB = smoothstep(0.45, 0.85, vHeight);   // mid -> gold
      vec3 col = mix(cValley, cMid, tA);
      col      = mix(col,     cGold, tB);

      /* Crest "veins of light" — push the highest peaks toward bright
         yellow-white so they exceed the bloom threshold and halo into
         continuous golden streams when overlapping. */
      float crestBoost = pow(smoothstep(0.65, 0.95, vHeight), 1.5);
      col = mix(col, cSpec, crestBoost * 0.55);

      /* Soft specular favoring upper-left light direction. */
      vec2 toLight = normalize(vec2(-1.0, 1.0));
      float align  = clamp(dot(toLight, (vScreenUv - 0.5) * 2.0) * 0.5 + 0.5, 0.0, 1.0);
      float spec   = pow(vHeight * align, 4.0) * 0.6;
      col += spec * vec3(0.55, 0.45, 0.20);

      /* Dynamic opacity — valleys nearly invisible, peaks solid. */
      float alpha = 0.18 + 0.82 * smoothstep(0.05, 0.65, vHeight);

      gl_FragColor = vec4(col, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest:   true,
    depthWrite:  false,
  });

  const mesh = new THREE.InstancedMesh(baseGeometry, material, TOTAL);
  mesh.frustumCulled = false;       // we displace verts past their original bounds

  /* Bake instance matrices once (only XZ position; Y comes from shader). */
  const tmpMat = new THREE.Matrix4();
  let idx = 0;
  for (let zi = 0; zi < GRID_D; zi++) {
    for (let xi = 0; xi < GRID_W; xi++) {
      const wx = (xi / (GRID_W - 1) - 0.5) * GRID_X;
      const wz = (zi / (GRID_D - 1) - 0.5) * GRID_Z;
      tmpMat.makeTranslation(wx, 0, wz);
      mesh.setMatrixAt(idx++, tmpMat);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  /* -------- Post-processing: bloom (stronger than v0.15 for veins) -------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.30,    // strength    — visible halo for crest veins
    0.55,    // radius
    0.50     // threshold   — only crest-boosted pixels bloom
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  /* -------- Mouse: raycast NDC -> ground plane -------- */
  const raycaster   = new THREE.Raycaster();
  const ndcMouse    = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint    = new THREE.Vector3();

  let mouseTargetX = 0, mouseTargetZ = 0;
  let mouseSmoothX = 0, mouseSmoothZ = 0;
  let mousePrevX   = 0, mousePrevZ   = 0;
  let mouseVelX    = 0, mouseVelZ    = 0;
  let displaceEnergy = 0;

  /* Camera parallax + mesh tilt — both lerp slowly for viscous feel. */
  let camTargetX = 0, camTargetY = 0;
  let camSmoothX = 0, camSmoothY = 0;
  let tiltTargetX = 0, tiltTargetZ = 0;
  let tiltSmoothX = 0, tiltSmoothZ = 0;

  window.addEventListener("pointermove", (e) => {
    const nx = e.clientX / window.innerWidth;
    const ny = e.clientY / window.innerHeight;

    ndcMouse.x =  nx * 2 - 1;
    ndcMouse.y = -(ny * 2 - 1);
    raycaster.setFromCamera(ndcMouse, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      mouseTargetX = hitPoint.x;
      mouseTargetZ = hitPoint.z;
    }

    /* Camera position parallax — small offset toward mouse. */
    camTargetX = (nx - 0.5) * 0.30;
    camTargetY = (0.5 - ny) * 0.20;

    /* Mesh tilt — slight scene rotation. */
    tiltTargetX = -(ny - 0.5) * 0.10;
    tiltTargetZ = -(nx - 0.5) * 0.06;
  }, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  /* -------- Tick — viscous lerps -------- */
  const TAU         = 0.60;
  const FOLLOW      = 0.12;
  const ENERGY_K    = 25.0;
  const ENERGY_MAX  = 1.5;
  const VEL_DECAY   = 0.88;
  const VEL_INJECT  = 4.5;
  const TILT_LERP   = 0.04;
  const CAM_LERP    = 0.035;

  let lastT = 0;
  function tick(tMs) {
    const tSec = tMs * 0.001;
    const dt   = lastT === 0 ? 0.016 : Math.min((tMs - lastT) * 0.001, 0.05);
    lastT = tMs;

    /* Smoothed mouse position. */
    mouseSmoothX += (mouseTargetX - mouseSmoothX) * FOLLOW;
    mouseSmoothZ += (mouseTargetZ - mouseSmoothZ) * FOLLOW;

    /* Velocity tracking for wake + channel. */
    const dx = mouseTargetX - mousePrevX;
    const dz = mouseTargetZ - mousePrevZ;
    mouseVelX = mouseVelX * VEL_DECAY + dx * VEL_INJECT;
    mouseVelZ = mouseVelZ * VEL_DECAY + dz * VEL_INJECT;
    mousePrevX = mouseTargetX;
    mousePrevZ = mouseTargetZ;

    /* Displacement energy. */
    const speed = Math.sqrt(dx * dx + dz * dz);
    displaceEnergy = Math.min(displaceEnergy + speed * ENERGY_K, ENERGY_MAX);
    displaceEnergy *= Math.exp(-dt / TAU);

    /* Mesh tilt. */
    tiltSmoothX += (tiltTargetX - tiltSmoothX) * TILT_LERP;
    tiltSmoothZ += (tiltTargetZ - tiltSmoothZ) * TILT_LERP;
    mesh.rotation.x = tiltSmoothX;
    mesh.rotation.z = tiltSmoothZ;

    /* Camera parallax — smooth lerp toward mouse-driven offset. */
    camSmoothX += (camTargetX - camSmoothX) * CAM_LERP;
    camSmoothY += (camTargetY - camSmoothY) * CAM_LERP;
    camera.position.set(camSmoothX, camBaseY + camSmoothY, camBaseZ);
    camera.lookAt(0, camLookY, camLookZ);

    /* Push uniforms. */
    uniforms.uTime.value     = tSec;
    uniforms.uMouse.value.set(mouseSmoothX, mouseSmoothZ);
    uniforms.uMouseVel.value.set(mouseVelX, mouseVelZ);
    uniforms.uDisplace.value = displaceEnergy;

    composer.render();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  console.log("[Auros] Liquid Engine v0.16 — Manta Core (obsidian + gold) · Three.js", THREE.REVISION,
              "·", TOTAL.toLocaleString(), "instances");
})();