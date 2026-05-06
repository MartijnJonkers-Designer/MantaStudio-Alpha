/* ============================================================
   MAIN — GSAP choreography (Friedman scroll: clip-path wipe)
   - Hero: timeline reveals headline lines + sidebar items in sequence
   - Sections: scroll-triggered clip-path wipe
   - All reveals: ease "expo.out", duration 0.8
   ============================================================ */

(function () {
  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SNAP_DURATION = 0.8;
  const SNAP_EASE = "expo.out";
  const REVEALED = "inset(0 0 0 0)";
  const HIDDEN   = "inset(0 0 100% 0)";

  /* -------- HERO TIMELINE --------
     Reveal headline lines first (one after another), then the sidebar
     items below. The clip-path goes from inset(0 0 100% 0) — fully
     clipped from the bottom (invisible) — to inset(0 0 0 0). */
  const heroLines = document.querySelectorAll(".hero__headline .line");
  const heroSidebar = document.querySelectorAll(".hero__sidebar [data-reveal]");

  if (prefersReduced) {
    gsap.set([...heroLines, ...heroSidebar], { clipPath: REVEALED });
  } else if (heroLines.length || heroSidebar.length) {
    const tl = gsap.timeline({ delay: 0.25 });
    if (heroLines.length) {
      tl.set(heroLines, { clipPath: HIDDEN });
      tl.to(heroLines, {
        clipPath: REVEALED,
        duration: SNAP_DURATION,
        ease: SNAP_EASE,
        stagger: 0.07,
      });
    }
    if (heroSidebar.length) {
      tl.to(heroSidebar, {
        clipPath: REVEALED,
        duration: SNAP_DURATION,
        ease: SNAP_EASE,
        stagger: 0.10,
      }, "-=0.50");                /* overlap with the headline tail */
    }
  }

  /* -------- SECTION REVEALS — scroll-triggered clip-path wipe -------- */
  gsap.utils.toArray("section:not(.hero) [data-reveal], footer [data-reveal]").forEach((el) => {
    if (prefersReduced) {
      gsap.set(el, { clipPath: REVEALED });
      return;
    }
    gsap.to(el, {
      clipPath: REVEALED,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none reverse",
      },
    });
  });

  /* -------- FONT-LOAD REFRESH -------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
})();