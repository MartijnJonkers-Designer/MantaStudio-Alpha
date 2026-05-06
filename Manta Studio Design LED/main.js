/* ============================================================
   MAIN — GSAP choreography (Brutalist / High-Precision Tech)

   All entrance reveals: ease "expo.out", duration 0.8 — the snap.
   Manta tilt: quickTo on rotation, duration 0.5 (tighter than v3).
   Manta scroll parallax retained; ambient breath REMOVED (no slow drift).
   ============================================================ */

(function () {
  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SNAP_DURATION = 0.8;
  const SNAP_EASE = "expo.out";

  /* -------- HERO WORD REVEAL --------
     Single timeline across both <h1>s so the four words read as one
     synchronised motion. Tight stagger so each starts before the
     previous lands — high tension, no perceptible gap. */
  const orderedWords = [
    ...document.querySelectorAll(".line--we .word"),
    ...document.querySelectorAll(".line--make .word"),
    ...document.querySelectorAll(".line--good .word"),
    ...document.querySelectorAll(".line--shit .word"),
  ];

  if (orderedWords.length) {
    if (prefersReduced) {
      gsap.set(orderedWords, { y: 0, opacity: 1 });
    } else {
      const heroTL = gsap.timeline({ delay: 0.3 });
      heroTL.set(orderedWords, { yPercent: 110, opacity: 0 });
      heroTL.to(orderedWords, {
        yPercent: 0,
        opacity: 1,
        duration: SNAP_DURATION,
        ease: SNAP_EASE,
        stagger: { each: 0.06, from: "start" },   /* tighter than v3 */
      });
    }
  }

  /* -------- HERO SHOWREEL CTA -------- */
  const heroReveals = document.querySelectorAll(".hero [data-reveal]:not(.word)");
  if (heroReveals.length) {
    gsap.to(heroReveals, {
      opacity: 1, y: 0,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      stagger: 0.08,
      delay: 1.0,
    });
  }

  /* -------- CORNER MARKERS — slam in around the manta -------- */
  const markers = document.querySelectorAll(".stage__manta-marker");
  if (markers.length && !prefersReduced) {
    gsap.from(markers, {
      scale: 1.6,
      opacity: 0,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      stagger: 0.05,
      delay: 0.6,
      transformOrigin: "center center",
    });
  }

  /* -------- SECTION REVEALS -------- */
  gsap.utils.toArray("section [data-reveal], footer [data-reveal]").forEach((el) => {
    gsap.to(el, {
      opacity: 1, y: 0,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none reverse",
      },
    });
  });

  /* -------- MANTA SCROLL PARALLAX + TILT --------
     yPercent (parallax) and rotation (tilt) compose as separate transform
     components; they don't fight each other. Ambient breath REMOVED —
     the brief calls for snap, not slow drifting. */
  const manta = document.getElementById("manta");
  if (manta && !prefersReduced) {
    // Slow scroll-tied parallax (this one stays smooth via scrub — it's
    // a scroll-coupled effect, not an entrance animation).
    gsap.to(manta, {
      yPercent: 14,
      scale: 1.04,
      ease: "none",
      scrollTrigger: {
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.0,
      },
    });

    // Tilt — cursor x maps to ±5deg lean. Tighter quickTo (0.5) for
    // the high-precision-tool feel.
    const rotateTo = gsap.quickTo(manta, "rotation", {
      duration: 0.5,
      ease: "power3.out",
    });
    window.addEventListener("pointermove", (e) => {
      rotateTo(((e.clientX / window.innerWidth) - 0.5) * 10);
    }, { passive: true });
  }

  /* -------- HERO HEADLINE COUNTER-PARALLAX -------- */
  const headlines = document.querySelectorAll(".hero__headline");
  if (headlines.length && !prefersReduced) {
    gsap.to(headlines, {
      yPercent: -25,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 1,
      },
    });
  }

  /* -------- FONT-LOAD REFRESH -------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
})();