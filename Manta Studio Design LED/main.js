/* ============================================================
   MAIN — GSAP load-time clip-path reveals

   No ScrollTrigger — the app fits within (or near) one viewport,
   so all reveals fire on load with a stagger.
   ============================================================ */

(function () {
  if (typeof gsap === "undefined") return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SNAP_DURATION = 0.8;
  const SNAP_EASE = "expo.out";
  const REVEALED = "inset(0 0 0 0)";
  const HIDDEN   = "inset(0 0 100% 0)";

  const reveals = document.querySelectorAll("[data-reveal]");
  if (!reveals.length) return;

  if (prefersReduced) {
    gsap.set(reveals, { clipPath: REVEALED });
    return;
  }

  /* Headline lines first (4 of them, tighter stagger), then everything
     else with a slightly looser cascade. The selectors are queried twice
     so the headline always leads. */
  const headlineLines = document.querySelectorAll(".headline .line[data-reveal]");
  const otherReveals  = document.querySelectorAll("[data-reveal]:not(.line)");

  const tl = gsap.timeline({ delay: 0.2 });

  if (headlineLines.length) {
    tl.set(headlineLines, { clipPath: HIDDEN });
    tl.to(headlineLines, {
      clipPath: REVEALED,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      stagger: 0.06,
    });
  }
  if (otherReveals.length) {
    tl.set(otherReveals, { clipPath: HIDDEN });
    tl.to(otherReveals, {
      clipPath: REVEALED,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      stagger: 0.08,
    }, "-=0.45");      /* overlap with the headline tail */
  }
})();