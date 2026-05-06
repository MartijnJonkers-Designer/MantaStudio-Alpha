/* ────────────────────────────────────────────────────────────────
   Manta Works — scroll choreography
   Sections:  Constants · Utils · Master scroll · Weld · Spine
              · Manta · HUD · Vertebrae · Marine snow
   ──────────────────────────────────────────────────────────────── */

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.normalizeScroll(true);


/* ── Constants ─────────────────────────────────────────────────── */

const TOTAL_M = 6000;                       // total descent depth
const DEPTH = {                             // scroll-progress milestones
  sunlight: 1000 / TOTAL_M,                 // 0.167
  twilight: 2000 / TOTAL_M,                 // 0.333
  hadal:    5640 / TOTAL_M,                 // 0.94
};

// Background colour stops, keyed to scroll progress.
// Linear interpolation between adjacent stops; below the last stop, holds.
// Five zones matching the descent: surface teal → sunlight blue →
// twilight purple → abyssal blue → black hadal floor.
const BG_STOPS = [
  { p: 0.00, rgb: [ 8,  42,  56] },   // #082a38 — teal surface (slightly brighter than midnight)
  { p: 0.17, rgb: [ 6,  28,  72] },   // #061c48 — sunlight blue, deepening
  { p: 0.40, rgb: [22,  16,  64] },   // #161040 — twilight transition (slight violet cast)
  { p: 0.55, rgb: [10,  10,  44] },   // #0a0a2c — abyssal blue
  { p: 0.85, rgb: [ 0,   0,   0] },   // #000000 — true black, hadopelagic
];


/* ── Utils ─────────────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);

// Linear interpolation across a stop array; clamps at both ends.
function interpStops(stops, p) {
  if (p <= stops[0].p) return stops[0].rgb;
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i].p) {
      const a = stops[i - 1], b = stops[i];
      const t = (p - a.p) / (b.p - a.p);
      return a.rgb.map((v, k) => Math.round(v + (b.rgb[k] - v) * t));
    }
  }
  return stops[stops.length - 1].rgb;
}

// Idle drift loop — small sinusoidal motion on a single property.
// Used for manta float, spine sway, body breath.
// Returns the tween so callers can kill() it later if needed.
function drift(target, prop, value, duration, delay = 0) {
  return gsap.to(target, {
    [prop]: value,
    duration, ease: 'sine.inOut',
    repeat: -1, yoyo: true, delay,
  });
}

// Scroll-bound fade with start/end as progress fractions of maxScroll.
function fadeOnScroll(el, fromVars, toVars, startP, endP) {
  if (!el) return;
  gsap.fromTo(el, fromVars, {
    ...toVars,
    ease: toVars.ease || 'power2.out',
    scrollTrigger: {
      trigger: document.documentElement,
      start: () => ScrollTrigger.maxScroll(window) * startP,
      end:   () => ScrollTrigger.maxScroll(window) * endP,
      scrub: true,
    },
  });
}


/* ── Master scroll ─────────────────────────────────────────────────
   One ScrollTrigger drives everything that wants global progress —
   background colour, depth counter, parallax multiplier. Subscribers
   read from `progress` on each tick. Avoids stacking duplicate
   triggers on document.documentElement.
   ──────────────────────────────────────────────────────────────── */

let progress = 0;          // 0 → 1, updated each scroll tick
let depthMultiplier = 1;   // marine-snow parallax accelerator past 50%

const depthEl = $('depthValue');

ScrollTrigger.create({
  trigger: document.documentElement,
  start: 'top top',
  end:   () => ScrollTrigger.maxScroll(window),
  scrub: true,
  onUpdate: (self) => {
    progress = Math.min(1, self.progress);

    // Depth counter (0 → 6000 m).
    if (depthEl) {
      const m = Math.round(progress * TOTAL_M);
      depthEl.textContent = `— ${m.toLocaleString()} m`;
    }

    // Background colour interpolation.
    const [r, g, b] = interpStops(BG_STOPS, progress);
    document.body.style.backgroundColor = `rgb(${r},${g},${b})`;

    // Marine-snow rises faster past halfway (pressure parallax).
    depthMultiplier = progress <= 0.5 ? 1 : 1 + ((progress - 0.5) / 0.5) * 2;
  },
});


/* ── Weld ──────────────────────────────────────────────────────────
   Spine SVG sits absolutely inside #hero. Its top edge is welded to
   the bottom edge of the manta container so the path begins at the
   tail tip. Both offsetTop and offsetHeight are layout-flow values,
   independent of scroll, so this only needs to run on load + resize.
   ──────────────────────────────────────────────────────────────── */

const spineSvg = $('spine-svg');
const mantaContainer = $('mantaContainer');

let weldScheduled = false;
function weld() {
  if (weldScheduled) return;
  weldScheduled = true;
  requestAnimationFrame(() => {
    spineSvg.style.top = (mantaContainer.offsetTop + mantaContainer.offsetHeight) + 'px';
    weldScheduled = false;
  });
}
window.addEventListener('load', weld);
window.addEventListener('resize', () => { weld(); ScrollTrigger.refresh(); });
weld();


/* ── Spine ─────────────────────────────────────────────────────────
   Three layered paths share the same `d`: glow (volumetric trailing
   bloom), texture (always-on dashed echo), and the crisp main line.
   getTotalLength() is much larger than the maximum strokeDashoffset
   we'll consume during scroll, so the line draws smoothly without
   ever finishing. Glow path syncs offset with the main path so the
   bloom tracks the leading edge.
   ──────────────────────────────────────────────────────────────── */

const drawPath     = $('draw-path');
const drawPathGlow = $('draw-path-glow');
const pathLen      = drawPath.getTotalLength();

gsap.set(drawPath, {
  strokeDasharray: pathLen,
  strokeDashoffset: pathLen,
  force3D: true,
});
gsap.set(drawPathGlow, {
  strokeDasharray: pathLen,
  strokeDashoffset: pathLen,
  force3D: true,
});

gsap.to(drawPath, {
  strokeDashoffset: 0,
  ease: 'none',
  force3D: true,
  scrollTrigger: {
    trigger: document.documentElement,
    start: 'top top',
    end:   () => ScrollTrigger.maxScroll(window),
    scrub: true,
    onUpdate: (self) => {
      const offset = Math.max(0, pathLen * (1 - Math.min(1, self.progress)));
      const offsetStr = offset.toFixed(2);
      drawPath.style.strokeDashoffset     = offsetStr;
      drawPathGlow.style.strokeDashoffset = offsetStr;
    },
  },
});

// Spine micro-sway — gentle current drift, two phases.
drift('#spine-svg', 'x', '+=8', 3.2);
drift('#spine-svg', 'y', '+=4', 4.7, 1.2);


/* ── Vertebra accent nodes ─────────────────────────────────────────
   13 ornamental clusters pinned along the spine path at ~460m
   intervals. Each is a small geometric mark (diamond + lateral
   spikes). Nodes scale + fade in as the leading edge of the draw
   reaches their position on the path.
   ──────────────────────────────────────────────────────────────── */

const NODE_DEPTHS_M = [];
for (let m = 460; m <= 6000; m += 460) NODE_DEPTHS_M.push(m);
// → [460, 920, 1380, 1840, 2300, 2760, 3220, 3680, 4140, 4600, 5060, 5520, 5980]

(function buildVertebraNodes() {
  const accentsGroup = $('vertebra-accents');
  if (!accentsGroup) return;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  NODE_DEPTHS_M.forEach((depthM) => {
    // Map depth (0–6000m) to position along the path.
    // The path covers all 16,000 SVG units; depth 6000m corresponds
    // to scroll progress 1.0 which is near the end of the path.
    const frac = depthM / TOTAL_M;
    const pt   = drawPath.getPointAtLength(pathLen * frac);

    // Build cluster group: diamond core + two horizontal spikes.
    // All positioned relative to (pt.x, pt.y).
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'v-node');
    group.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);

    // Central diamond (rotated square)
    const diamond = document.createElementNS(SVG_NS, 'rect');
    diamond.setAttribute('x', '-6');
    diamond.setAttribute('y', '-6');
    diamond.setAttribute('width',  '12');
    diamond.setAttribute('height', '12');
    diamond.setAttribute('transform', 'rotate(45)');
    diamond.setAttribute('fill', '#e8c96a');
    diamond.setAttribute('stroke', '#f5e080');
    diamond.setAttribute('stroke-width', '0.5');
    group.appendChild(diamond);

    // Two horizontal spikes (small triangles on each side)
    const spikeL = document.createElementNS(SVG_NS, 'path');
    spikeL.setAttribute('d', 'M -8 0 L -18 -2 L -18 2 Z');
    spikeL.setAttribute('fill', '#c9a84c');
    group.appendChild(spikeL);

    const spikeR = document.createElementNS(SVG_NS, 'path');
    spikeR.setAttribute('d', 'M 8 0 L 18 -2 L 18 2 Z');
    spikeR.setAttribute('fill', '#c9a84c');
    group.appendChild(spikeR);

    // Inner highlight dot
    const core = document.createElementNS(SVG_NS, 'circle');
    core.setAttribute('r', '1.6');
    core.setAttribute('fill', '#fff8d8');
    group.appendChild(core);

    accentsGroup.appendChild(group);

    // Initial state: invisible, scaled down. GSAP owns transforms.
    gsap.set(group, {
      opacity: 0,
      scale: 0,
      transformOrigin: '50% 50%',
    });

    // Scroll trigger: each node's window is centered on its depth,
    // 80m wide on either side (so it animates in over a small window
    // as the leading edge passes through). Nodes stay visible after.
    const triggerP = depthM / TOTAL_M;
    const enterStart = Math.max(0, triggerP - 0.013);
    const enterEnd   = Math.min(1, triggerP + 0.013);

    gsap.to(group, {
      opacity: 1,
      scale: 1,
      ease: 'back.out(1.6)',
      scrollTrigger: {
        trigger: document.documentElement,
        start: () => ScrollTrigger.maxScroll(window) * enterStart,
        end:   () => ScrollTrigger.maxScroll(window) * enterEnd,
        scrub: 0.6,
      },
    });
  });
})();


/* ── Manta ─────────────────────────────────────────────────────────
   Three layers of idle motion (suspended at surface):
   1. Container drift (X + Y at different periods) — feels suspended.
   2. Body breath (scale + Y bob) — slow chest pulse.
   3. Wing flap — each wing pivots from its inner edge, asymmetric
      phase so the motion never looks robotic.

   Plus scroll-driven dive choreography (responds to user input):
   4. Dive bank — over the first ~10% of scroll, manta scales down
      and pitches forward (rotateX) like a creature angling into a
      descent.
   5. Fade-out — manta and all its idle tweens are killed by the
      time scroll reaches ~17% (the Sunlight Zone milestone, 1000m).
   ──────────────────────────────────────────────────────────────── */

// Idle motion — captured in an array so we can kill all of it
// once the manta fades out (no point burning CPU on an invisible element).
const mantaIdleTweens = [
  drift('#mantaContainer', 'y', '-18px', 3.8),
  drift('#mantaContainer', 'x',   '8px', 5.2, 0.7),
  drift('#mantaBodyGroup', 'scale', 1.04, 3.4),
  drift('#mantaBodyGroup', 'y',    '+=4', 4.2, 0.6),
];

gsap.set('#mantaBodyGroup', { transformOrigin: '50% 50%' });

// Wings — flap is scaleY compression + small skew. ~4s full cycle.
// Captured too so we can kill them with the rest on fade-out.
const mantaWingTweens = [];
function flap(selector, skewDir, origin, delay = 0) {
  const t = gsap.to(selector, {
    scaleY: 0.62,
    skewX: skewDir,
    y: 6,
    duration: 2.0,
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
    transformOrigin: origin,
    delay,
  });
  mantaWingTweens.push(t);
  return t;
}
flap('#wingLeft',   4, '0% 50%');
flap('#wingRight', -4, '100% 50%', 0.04);


// ── Dive choreography ──────────────────────────────────────────────
// Manta container needs perspective for rotateX to read as a 3D pitch
// rather than a flat squish.
gsap.set('#mantaContainer', {
  transformPerspective: 800,
  transformOrigin: '50% 50%',
});

// Dive bank — first 600px of scroll. Scale down + nose-down.
// Idle drift tweens are KILLED on the first scroll tick to prevent
// them from overwriting the dive's transform. They get rebuilt only
// if the user scrolls all the way back to top (onLeaveBack).
let idleKilled = false;
gsap.to('#mantaContainer', {
  scale: 0.6,             // exaggerated for visibility — was 0.8
  rotationX: 35,          // exaggerated for visibility — was 15
  y: -200,                // also push it up so it's unmistakably moving
  ease: 'none',
  scrollTrigger: {
    trigger: 'body',
    start: 'top top',
    end: '+=600',
    scrub: true,
    id: 'manta-dive',
    onUpdate: () => {
      // First scroll tick: kill the idle drift tweens that are
      // fighting the dive's transform. Only need to do this once.
      if (!idleKilled) {
        mantaIdleTweens.forEach((t) => t && t.kill());
        idleKilled = true;
      }
    },
    onLeaveBack: () => {
      // Returned to top — rebuild idle drift so manta floats again.
      idleKilled = false;
      mantaIdleTweens.length = 0;
      mantaIdleTweens.push(
        drift('#mantaContainer', 'y', '-18px', 3.8),
        drift('#mantaContainer', 'x',   '8px', 5.2, 0.7),
        drift('#mantaBodyGroup', 'scale', 1.04, 3.4),
        drift('#mantaBodyGroup', 'y',    '+=4', 4.2, 0.6),
      );
    },
  },
});

// Fade-out — 600px to 1200px of scroll. Manta is gone before the
// hero fully exits the top of the viewport.
gsap.to('#mantaContainer', {
  opacity: 0,
  ease: 'power2.in',
  scrollTrigger: {
    trigger: 'body',
    start: 'top+=600 top',
    end:   'top+=1200 top',
    scrub: true,
    id: 'manta-fade',
    onLeave: () => {
      // Past 1000m — manta is invisible, kill its idle motion.
      mantaIdleTweens.forEach((t) => t && t.kill());
      mantaWingTweens.forEach((t) => t && t.kill());
    },
    onEnterBack: () => {
      // Scrolled back up — restart the idle motion so the manta
      // looks alive when it reappears.
      mantaIdleTweens.length = 0;
      mantaIdleTweens.push(
        drift('#mantaContainer', 'y', '-18px', 3.8),
        drift('#mantaContainer', 'x',   '8px', 5.2, 0.7),
        drift('#mantaBodyGroup', 'scale', 1.04, 3.4),
        drift('#mantaBodyGroup', 'y',    '+=4', 4.2, 0.6),
      );
      mantaWingTweens.length = 0;
      flap('#wingLeft',   4, '0% 50%');
      flap('#wingRight', -4, '100% 50%', 0.04);
    },
  },
});


/* ── Title fade ────────────────────────────────────────────────── */

if ($('titleBlock')) {
  gsap.to('#titleBlock', {
    opacity: 0, ease: 'none',
    scrollTrigger: {
      trigger: 'body',
      start: 'top top',
      end: '+=500',
      scrub: true,
      id: 'title-fade',
    },
  });
}


/* ── HUD: scroll hint, milestones, branding reveal, back-to-top ── */

const scrollHint = $('scrollHint');
window.addEventListener('scroll', () => {
  if (scrollHint && window.scrollY > 80) scrollHint.classList.add('gone');
}, { passive: true });

// Each milestone fades in around its target depth, and (optionally)
// fades out a short while later. enterP / exitP are progress fractions.
function milestoneAt(id, enterP, exitP) {
  const el = $(id);
  if (!el) return;
  fadeOnScroll(el, { opacity: 0, x: -12 }, { opacity: 1, x: 0 },
               enterP, enterP + 0.06);
  if (exitP < 1) {
    fadeOnScroll(el, {}, { opacity: 0, ease: 'power1.in' },
                 exitP, exitP + 0.06);
  }
}
milestoneAt('ms-sunlight', DEPTH.sunlight, 0.28);
milestoneAt('ms-twilight', DEPTH.twilight, 0.62);
milestoneAt('ms-hadal',    DEPTH.hadal,    1.0);

// Branding reveal — fades in over the final 6% of scroll.
fadeOnScroll($('branding-reveal'),
  { opacity: 0, y: 24 },
  { opacity: 1, y: 0, ease: 'power2.out' },
  DEPTH.hadal, 1.0);

// Abyss floor — sandy reveal at the very bottom.
// Starts a touch earlier than branding so the floor is settled when text appears.
fadeOnScroll($('abyss-floor'),
  { opacity: 0 },
  { opacity: 1, ease: 'power2.out' },
  0.92, 1.0);

// Ambient gold haze above the floor — fades in same window.
fadeOnScroll($('abyss-floor-glow'),
  { opacity: 0 },
  { opacity: 1, ease: 'power2.out' },
  0.92, 1.0);

// Back-to-top — fades in alongside branding, claims pointer events.
const bttEl = $('back-to-top');
if (bttEl) {
  gsap.fromTo('#back-to-top',
    { opacity: 0, y: 16 },
    {
      opacity: 1, y: 0,
      duration: 1.8, ease: 'power2.out',
      scrollTrigger: {
        trigger: document.documentElement,
        start: () => ScrollTrigger.maxScroll(window) * DEPTH.hadal,
        end:   () => ScrollTrigger.maxScroll(window),
        scrub: true,
        onEnter:     () => { bttEl.style.pointerEvents = 'auto'; },
        onLeaveBack: () => { bttEl.style.pointerEvents = 'none'; },
      },
    },
  );
  bttEl.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}


/* ── Vertebra system ───────────────────────────────────────────────
   Wrapped in window.load so layout is settled before measuring.
   Each panel has a 1200m lifecycle: 300m emerge + 600m hold + 300m
   exit, mapped to a paused timeline scrubbed by ScrollTrigger.
   The leader line origin tracks the spine point via getPointAtLength
   on every tick; the destination tracks the panel's bounding box
   only while the panel is visible.
   ──────────────────────────────────────────────────────────────── */

const VERTEBRA_DATA = [
  { depth:  750, id: 'v-750',  side: 'right' },
  { depth: 2250, id: 'v-2250', side: 'left'  },
  { depth: 3750, id: 'v-3750', side: 'right' },
  { depth: 5250, id: 'v-5250', side: 'left'  },
];

window.addEventListener('load', function vertebraSystem() {
  const linesSvg = $('v-lines-svg');
  if (!spineSvg || !drawPath || !linesSvg) return;

  const totalLen = drawPath.getTotalLength();
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Map a depth in metres to a viewport point on the spine path.
  function depthToVP(metres) {
    const frac = Math.min(1, metres / TOTAL_M);
    const pt   = drawPath.getPointAtLength(totalLen * frac);
    const rect = spineSvg.getBoundingClientRect();
    const vb   = spineSvg.viewBox.baseVal;
    return {
      x: rect.left + pt.x * (rect.width  / vb.width),
      y: rect.top  + pt.y * (rect.height / vb.height),
    };
  }

  // Per-panel gradient — gold at spine end, transparent at panel end.
  function makeLineGradient(id) {
    let defs = linesSvg.querySelector('defs');
    if (!defs) defs = linesSvg.insertBefore(
      document.createElementNS(SVG_NS, 'defs'), linesSvg.firstChild);

    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.id = id;
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    [['0%', '1'], ['100%', '0.1']].forEach(([offset, opacity]) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', '#d4af37');
      stop.setAttribute('stop-opacity', opacity);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    return grad;
  }

  function addVertebra(cfg) {
    const panel = $(cfg.id);
    if (!panel) { console.warn('vertebra not found:', cfg.id); return; }

    const isRight = cfg.side !== 'left';
    const startX  = isRight ? -100 : 100;

    // Spine dot (fixed, follows path point on every tick).
    const dot = document.createElement('div');
    dot.className = 'v-dot';
    document.body.appendChild(dot);

    // Leader line (in shared SVG, with its own gradient).
    const line = document.createElementNS(SVG_NS, 'line');
    line.className = 'v-line';
    ['x1', 'y1', 'x2', 'y2'].forEach((a) => line.setAttribute(a, 0));
    linesSvg.appendChild(line);

    const grad = makeLineGradient(cfg.id + '-grad');
    line.setAttribute('stroke', `url(#${grad.id})`);

    // Initial state — GSAP owns all transforms (CSS sets none).
    gsap.set(panel, {
      x: startX, y: 100,
      scale: 0.9,
      autoAlpha: 0,
      rotationY: isRight ? -35 : 35,
      transformPerspective: 1200,
      transformOrigin: isRight ? 'left center' : 'right center',
    });
    gsap.set(dot,  { autoAlpha: 0 });
    gsap.set(line, { opacity: 0 });

    // tether: positions dot + panel anchor on every scroll tick.
    function tether() {
      const pt = depthToVP(cfg.depth);
      dot.style.left  = pt.x + 'px';
      dot.style.top   = pt.y + 'px';
      panel.style.top = pt.y + 'px';
    }

    // updateLine: only runs while panel is in its trigger window.
    function updateLine() {
      const pt = depthToVP(cfg.depth);
      const visible = parseFloat(panel.style.opacity || '0') > 0.01;

      if (visible) {
        const pr = panel.getBoundingClientRect();
        if (pr.width > 0) {
          const lx = isRight ? pr.left : pr.right;
          const ly = pr.top + pr.height / 2;
          grad.setAttribute('x1', pt.x); grad.setAttribute('y1', pt.y);
          grad.setAttribute('x2', lx);   grad.setAttribute('y2', ly);
          line.setAttribute('x1', pt.x); line.setAttribute('y1', pt.y);
          line.setAttribute('x2', lx);   line.setAttribute('y2', ly);
        }
      } else {
        line.setAttribute('x2', pt.x);
        line.setAttribute('y2', pt.y);
      }
    }

    ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end:   () => ScrollTrigger.maxScroll(window),
      onUpdate: tether,
    });
    window.addEventListener('resize', tether, { passive: true });

    // 1200m total lifecycle, starting 300m before nominal depth.
    const frac     = cfg.depth / TOTAL_M;
    const winStart = Math.max(0.03, frac - 300 / TOTAL_M);
    const winEnd   = winStart + 1200 / TOTAL_M;

    // Timeline phases (0→1): 0.25 entry / 0.50 hold / 0.25 exit.
    const tl = gsap.timeline({ paused: true });
    tl
      .to(panel, { x: 0, y: 0, scale: 1, rotationY: 0, autoAlpha: 1,
                   ease: 'power2.out', duration: 0.25 }, 0)
      .to(dot,   { autoAlpha: 1, ease: 'power2.out', duration: 0.18 }, 0.05)
      .to(line,  { opacity: 1,   ease: 'power2.out', duration: 0.20 }, 0.06)
      .to(panel, { x: 0, y: 0, scale: 1, rotationY: 0, autoAlpha: 1,
                   ease: 'none', duration: 0.50 }, 0.25)
      .to(panel, { y: -100, autoAlpha: 0, scale: 0.93,
                   ease: 'power1.in', duration: 0.25 }, 0.75)
      .to(dot,   { autoAlpha: 0, ease: 'power1.in', duration: 0.18 }, 0.77)
      .to(line,  { opacity: 0,   ease: 'power1.in', duration: 0.18 }, 0.77);

    ScrollTrigger.create({
      trigger: document.documentElement,
      start:     () => ScrollTrigger.maxScroll(window) * winStart,
      end:       () => ScrollTrigger.maxScroll(window) * winEnd,
      scrub: 1.5,
      animation: tl,
      onUpdate: updateLine,
      onEnter:     () => { panel.style.pointerEvents = 'auto'; },
      onLeave:     () => { panel.style.pointerEvents = 'none'; },
      onLeaveBack: () => {
        panel.style.pointerEvents = 'none';
        gsap.set(panel, {
          x: startX, y: 100, scale: 0.9, autoAlpha: 0,
          rotationY: isRight ? -35 : 35,
        });
        gsap.set(dot,  { autoAlpha: 0 });
        gsap.set(line, { opacity: 0 });
      },
      onEnterBack: () => { panel.style.pointerEvents = 'auto'; },
    });
  }

  VERTEBRA_DATA.forEach(addVertebra);
  ScrollTrigger.refresh();
});


/* ── Marine snow + bioluminescent jellies ─────────────────────────
   Two layered systems on one canvas:
   – Flakes: 100 small particles, color-varied (cool whites,
     pale gold, faint cyan) with occasional bright pulses.
   – Jellies: 5 large, slow, soft-glowing creatures drifting up.
   Both use depthMultiplier from the master scroll trigger so
   they accelerate as the user descends past 50%.
   ──────────────────────────────────────────────────────────────── */

const canvas = $('snow-canvas');
const ctx    = canvas.getContext('2d');
const onResize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
onResize();
window.addEventListener('resize', onResize, { passive: true });

const rand = (a, b) => Math.random() * (b - a) + a;

// Three palettes for variety. Each entry: [core RGB, halo RGB].
const FLAKE_PALETTES = [
  { core: '255, 240, 200', halo: '212, 175,  55' },  // pale gold (most common)
  { core: '210, 235, 250', halo: '120, 180, 220' },  // cool white-blue
  { core: '180, 230, 235', halo:  '90, 180, 200' },  // faint cyan
];

class Flake {
  constructor(init) { this.reset(init); }
  reset(init = false) {
    this.x      = rand(0, canvas.width);
    this.y      = init ? rand(0, canvas.height) : canvas.height + 4;
    this.baseVy = rand(0.06, 0.44);
    this.vx     = rand(-0.06, 0.06);
    this.r      = rand(0.4, 2.0);
    this.alpha  = rand(0.10, 0.55);
    this.phase  = rand(0, Math.PI * 2);
    this.dPhase = rand(0.004, 0.018);
    // Most flakes are pale gold (idx 0); ~30% cool variants for color life.
    const roll = Math.random();
    this.palette = roll < 0.7 ? FLAKE_PALETTES[0]
                : roll < 0.9 ? FLAKE_PALETTES[1]
                :              FLAKE_PALETTES[2];
    // Rare flakes get a "pulse" — periodically brightening like
    // bioluminescent triggers. ~8% of population.
    this.pulses     = Math.random() < 0.08;
    this.pulseClock = rand(0, 200);
  }
  step() {
    this.y -= this.baseVy * depthMultiplier;
    this.x += this.vx;
    this.phase += this.dPhase;
    this.alpha = Math.max(0.04, Math.min(0.70,
      this.alpha + Math.sin(this.phase) * 0.007));
    if (this.pulses) {
      this.pulseClock += 1;
      // Bright burst every ~250 frames, lasting ~30 frames.
      if (this.pulseClock > 250) {
        this.alpha = Math.min(0.95, this.alpha + 0.04);
        if (this.pulseClock > 280) this.pulseClock = 0;
      }
    }
    if (this.y < -4) this.reset();
  }
  draw() {
    const { core, halo } = this.palette;
    const radius = this.r * 3.2;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
    g.addColorStop(0,   `rgba(${core}, ${this.alpha})`);
    g.addColorStop(0.5, `rgba(${halo}, ${this.alpha * 0.32})`);
    g.addColorStop(1,   `rgba(${halo}, 0)`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // Bright core
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${core}, ${this.alpha * 0.88})`;
    ctx.fill();
  }
}

// Jellyfish — sparse, large, slow, color-distinct.
const JELLY_PALETTES = [
  { core: '180, 220, 240', halo: '100, 160, 220' },  // pale blue
  { core: '230, 200, 240', halo: '160, 110, 200' },  // violet
  { core: '255, 230, 180', halo: '212, 175,  55' },  // warm gold
];

class Jelly {
  constructor(init) { this.reset(init); }
  reset(init = false) {
    this.x      = rand(canvas.width * 0.05, canvas.width * 0.95);
    this.y      = init ? rand(0, canvas.height) : canvas.height + 80;
    this.baseVy = rand(0.10, 0.22);
    this.vx     = rand(-0.04, 0.04);
    this.r      = rand(28, 56);
    this.alpha  = rand(0.10, 0.22);
    this.phase  = rand(0, Math.PI * 2);
    this.dPhase = rand(0.006, 0.014);
    this.palette = JELLY_PALETTES[Math.floor(Math.random() * JELLY_PALETTES.length)];
  }
  step() {
    this.y -= this.baseVy * depthMultiplier;
    this.x += this.vx + Math.sin(this.phase) * 0.3;
    this.phase += this.dPhase;
    if (this.y < -120) this.reset();
  }
  draw() {
    const { core, halo } = this.palette;
    const breath = 1 + Math.sin(this.phase) * 0.06;
    const radius = this.r * breath;
    // Soft outer halo
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
    g.addColorStop(0,    `rgba(${core}, ${this.alpha})`);
    g.addColorStop(0.45, `rgba(${halo}, ${this.alpha * 0.4})`);
    g.addColorStop(1,    `rgba(${halo}, 0)`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // Bright bell core
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.18 * breath, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${core}, ${this.alpha * 1.6})`;
    ctx.fill();
  }
}

const flakes = Array.from({ length: 100 }, () => new Flake(true));
const jellies = Array.from({ length: 5 },  () => new Jelly(true));
(function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Jellies first (behind flakes visually)
  jellies.forEach((j) => { j.step(); j.draw(); });
  flakes.forEach((f) => { f.step(); f.draw(); });
  requestAnimationFrame(loop);
})();


/* ── Audio framework (commented out until ambient .mp3 is ready) ──
   Web Audio API low-pass filter tightens with depth so sound becomes
   muffled below ~3000m. Wire filterNode.frequency to scroll progress
   when uncommenting.
   ──────────────────────────────────────────────────────────────── */
/*
const audioSrc = './ambient-deep.mp3';
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx, sourceNode, filterNode, gainNode;

async function initAudio() {
  audioCtx = new AudioCtx();
  const buf = await (await fetch(audioSrc)).arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(buf);

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = decoded;
  sourceNode.loop = true;

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 4000;
  filterNode.Q.value = 0.8;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.6;

  sourceNode.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  sourceNode.start(0);
}

ScrollTrigger.create({
  trigger: document.documentElement,
  start: 'top top',
  end:   () => ScrollTrigger.maxScroll(window),
  onUpdate: (self) => {
    if (!filterNode) return;
    const cutoff = 4000 - self.progress * 3600;
    filterNode.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.1);
  },
});

document.addEventListener('click',      initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });
*/


/* ── Final refresh — run after all triggers are registered ─────── */
ScrollTrigger.refresh();