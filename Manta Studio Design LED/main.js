/* ============================================================
   AUROS — Procedural Manta Volume v1.6

   First attempt at a real 3D volumetric manta (vs. the height-field
   relief in v1.5). If this falls short of the reference image we
   switch to a Sketchfab GLTF model.

   Architecture:
   - Two height-field surfaces (top + bottom) sharing a silhouette
     edge. Top arches into the dorsal bulge, bottom flattens into the
     belly. Both go to zero at the silhouette edge -> they meet ->
     closed volume.
   - Geometry is built per-triangle by a custom BufferGeometry: only
     triangles inside the silhouette are emitted, so there's no flat
     glass slab around the manta.
   - Two cone-shaped cephalic horns at the head.
   - A thin tube tail trailing behind.
   - All children of one Group, same glass material on every mesh.

   Manta math (closed-form):
     silhouette(x, y)  -> 0 or 1, parabolic taper
     midZ(x, y)        -> centerline; wing tips curl downward
     thickness(x, y)   -> body bulge (parabolic across both axes)
     top    = midZ + 0.6 * thickness    (dorsal arch)
     bottom = midZ - 0.4 * thickness    (flatter belly)

   Camera repositioned to 3/4 top-down to match the reference.
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

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
     CAMERA — 3/4 top-down to match reference framing
     ============================================================ */
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0.0, 1.7, 3.0);
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
     FLOOR RIPPLE TEXTURE — concentric iridescent bands.
     Foreshortens to ellipses naturally under 3/4 camera angle.
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

  /* ============================================================
     FRACTURE NORMAL MAP — internal cracks visible through transmission
     ============================================================ */
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
    for (let i = 0; i < 50; i++) {
      const r = 70 + Math.random() * 80;
      const g = 70 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, 255, 0.55)`;
      ctx.lineWidth = 1 + Math.random() * 2;
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
     MANTA MATH
     ============================================================ */
  const WING_HALF = 1.6;     // wing tip x-extent
  const Y_FRONT_0 = 0.55;    // y at nose, x=0
  const Y_BACK_0  = -0.30;   // body back at x=0
  const TAIL_TIP  = -1.2;    // tail tip y

  function silhouette(x, y) {
    const ax = Math.abs(x);
    if (ax > WING_HALF) return 0;
    const xN = ax / WING_HALF;
    const taper = Math.max(0, 1 - xN * xN);
    const yFront = Y_FRONT_0 * taper + 0.05;   // small constant for rounded nose
    const yBack  = Y_BACK_0  * taper;
    return (y >= yBack && y <= yFront) ? 1 : 0;
  }

  function wingCurl(x) {
    // Wings dip downward at tips. Subtle curl.
    const xN = Math.abs(x) / WING_HALF;
    return -Math.pow(xN, 3.2) * 0.28;
  }

  function midZ(x, y) {
    // Centerline of the manta volume. Wings curl, body stays neutral.
    return wingCurl(x);
  }

  function thicknessAt(x, y) {
    const sil = silhouette(x, y);
    if (sil === 0) return 0;

    const ax = Math.abs(x);
    const xN = ax / WING_HALF;
    const taper = Math.max(0, 1 - xN * xN);
    const yFront = Y_FRONT_0 * taper + 0.05;
    const yBack  = Y_BACK_0  * taper;

    // Cross-body parabola: 1 at midline, 0 at front/back edges.
    const yMid  = (yFront + yBack) * 0.5;
    const yHalf = Math.max((yFront - yBack) * 0.5, 1e-3);
    const yLocal = (y - yMid) / yHalf;
    const yProfile = Math.max(0, 1 - yLocal * yLocal);

    // Wing taper: 1 at center, sharp falloff to thin wings.
    const wingProfile = Math.pow(taper, 0.55);

    let t = yProfile * wingProfile * 0.50;

    // Subtle organic ribbing on the body
    t += Math.sin(y * 9.0)  * 0.012 * wingProfile * yProfile;
    t += Math.sin(ax * 7.0) * 0.010 * wingProfile * yProfile;

    return Math.max(0, t);
  }

  function topZ(x, y)    { return midZ(x, y) + 0.6 * thicknessAt(x, y); }
  function bottomZ(x, y) { return midZ(x, y) - 0.4 * thicknessAt(x, y); }

  /* ============================================================
     CUSTOM BUFFER GEOMETRY — only emit triangles inside silhouette
     ============================================================ */
  function buildMantaSurface(side /* "top" | "bottom" */) {
    const segs = 160;
    const W = WING_HALF * 2 + 0.1;     // a hair wider than wingspan
    const H = (Y_FRONT_0 + 0.05) - Y_BACK_0 + 0.15;
    const yCenter = ((Y_FRONT_0 + 0.05) + Y_BACK_0) * 0.5;

    const positions = [];
    const uvs = [];
    const indices = [];

    // Build vertex grid
    for (let j = 0; j <= segs; j++) {
      const v = j / segs;
      const y = yCenter + (v - 0.5) * H;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const x = (u - 0.5) * W;
        const z = (side === "top") ? topZ(x, y) : bottomZ(x, y);
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }

    // Helper: is this grid cell inside the silhouette?
    // We require all 4 corners inside so we don't get jagged half-quads.
    function gridInside(i, j) {
      const u = i / segs, v = j / segs;
      const x = (u - 0.5) * W, y = yCenter + (v - 0.5) * H;
      return silhouette(x, y) > 0;
    }

    // Build quad indices
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        // Only emit if all 4 corners are inside the silhouette.
        if (!gridInside(i,   j))   continue;
        if (!gridInside(i+1, j))   continue;
        if (!gridInside(i,   j+1)) continue;
        if (!gridInside(i+1, j+1)) continue;

        const a = j * (segs + 1) + i;
        const b = a + 1;
        const c = a + (segs + 1);
        const d = c + 1;

        if (side === "top") {
          // CCW from above (normals point +Z)
          indices.push(a, c, b);
          indices.push(b, c, d);
        } else {
          // CW from above (normals point -Z)
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /* ============================================================
     SILHOUETTE EDGE WALL — closes the volume crisply.
     For each grid cell on the silhouette boundary, emit a vertical
     quad connecting top to bottom. This gives the side profile
     of the manta, like the rim of a sliced fruit.
     ============================================================ */
  function buildEdgeWall() {
    const segs = 160;
    const W = WING_HALF * 2 + 0.1;
    const H = (Y_FRONT_0 + 0.05) - Y_BACK_0 + 0.15;
    const yCenter = ((Y_FRONT_0 + 0.05) + Y_BACK_0) * 0.5;

    const positions = [];
    const uvs = [];
    const indices = [];

    function pushQuad(p0, p1, p2, p3) {
      const base = positions.length / 3;
      positions.push(...p0, ...p1, ...p2, ...p3);
      uvs.push(0, 0,  1, 0,  0, 1,  1, 1);
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }

    function vert(x, y, side) {
      const z = (side === "top") ? topZ(x, y) : bottomZ(x, y);
      return [x, y, z];
    }

    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs,     u1 = (i + 1) / segs;
        const v0 = j / segs,     v1 = (j + 1) / segs;
        const x0 = (u0 - 0.5) * W, x1 = (u1 - 0.5) * W;
        const y0 = yCenter + (v0 - 0.5) * H, y1 = yCenter + (v1 - 0.5) * H;

        const s00 = silhouette(x0, y0);
        const s10 = silhouette(x1, y0);
        const s01 = silhouette(x0, y1);
        const s11 = silhouette(x1, y1);
        const inside = s00 + s10 + s01 + s11;

        // Boundary cells: some corners inside, some outside.
        if (inside === 0 || inside === 4) continue;

        // For each cell edge that crosses the boundary, emit a vertical quad.
        // Edge bottom (y0): between (x0, y0) and (x1, y0)
        if (s00 !== s10) {
          const xm = s00 ? x1 : x0;  // the inside x... actually need both ends
          // Connect inside vertex to silhouette boundary at outside.
          // Simplification: just connect (x0,y0) top -> (x0,y0) bottom etc.
          // We emit a wall along the inside edge.
          const ix = s00 ? x0 : x1;
          const ox = s00 ? x1 : x0;
          // We'll only build wall along the inside vertex column.
          // Actually emit wall at the inside corner.
          pushQuad(
            vert(ix, y0, "top"),
            vert(ix, y0, "bottom"),
            // Step toward the outside but stay just inside (boundary point ~= inside)
            // For simplicity: same x, but at y midway? No — just emit single vertical quad
            // at the inside corner extending up.
            vert(ix, y0 + (y1 - y0) * 0.0001, "top"),
            vert(ix, y0 + (y1 - y0) * 0.0001, "bottom")
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /* ============================================================
     HORNS (cephalic fins) — two thin cones at front of head
     ============================================================ */
  function makeHorn(sign /* +1 left, -1 right */) {
    const geo = new THREE.ConeGeometry(0.028, 0.32, 14, 6, false);
    geo.translate(0, 0.16, 0);   // pivot at base
    geo.rotateZ(sign * -0.18);   // splay outward
    geo.rotateX(-0.35);          // tip forward (smaller -Y)
    geo.translate(sign * 0.10, 0.50, 0.06);
    return geo;
  }

  /* ============================================================
     TAIL — thin tube along a spline
     ============================================================ */
  function makeTail() {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.00, -0.28,  0.00),
      new THREE.Vector3(0.02, -0.55,  0.01),
      new THREE.Vector3(0.04, -0.85,  0.00),
      new THREE.Vector3(0.05, TAIL_TIP, -0.04)
    ]);
    return new THREE.TubeGeometry(curve, 48, 0.014, 8, false);
  }

  /* ============================================================
     GLASS MATERIAL
     ============================================================ */
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 1.2,
    envMapIntensity: 3.0,
    attenuationDistance: 0.55,
    attenuationColor: new THREE.Color(0xC0E8FF),
    transparent: true,
    side: THREE.FrontSide,           // top + bottom both have correct outward normals
    normalMap: fractureNormal,
    normalScale: new THREE.Vector2(0.35, 0.35)
  });

  /* ============================================================
     ASSEMBLE THE MANTA
     ============================================================ */
  const mantaGroup = new THREE.Group();

  const topMesh    = new THREE.Mesh(buildMantaSurface("top"),    glassMaterial);
  const bottomMesh = new THREE.Mesh(buildMantaSurface("bottom"), glassMaterial);
  topMesh.castShadow = true;
  bottomMesh.castShadow = true;

  const leftHorn   = new THREE.Mesh(makeHorn(+1), glassMaterial);
  const rightHorn  = new THREE.Mesh(makeHorn(-1), glassMaterial);
  leftHorn.castShadow = true;
  rightHorn.castShadow = true;

  const tailMesh   = new THREE.Mesh(makeTail(), glassMaterial);
  tailMesh.castShadow = true;

  mantaGroup.add(topMesh, bottomMesh, leftHorn, rightHorn, tailMesh);
  scene.add(mantaGroup);

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
  floor.position.y = -1.2;
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
  poolLight.target.position.set(0, -1.2, 0);
  scene.add(poolLight.target);
  scene.add(poolLight);

  /* ============================================================
     Tick loop — gentle sway only, no bloom
     ============================================================ */
  function tick(tMs) {
    const tSec = tMs * 0.001;
    mantaGroup.rotation.z = Math.sin(tSec * 0.15) * 0.04;
    mantaGroup.position.y = Math.sin(tSec * 0.20) * 0.04;

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

  console.log("[Auros] v1.6 — Procedural Manta Volume · Three.js", THREE.REVISION);
})();
