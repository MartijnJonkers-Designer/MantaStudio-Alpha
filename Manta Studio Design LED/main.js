/* ============================================================
   MAIN — GSAP choreography
   - Hero word reveal (synchronised across back/front halves)
   - Section reveals on scroll
   - Manta parallax + ambient drift + mouse-driven tilt
   ============================================================ */

(function () {
  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------- HERO WORD REVEAL -------- */
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
        duration: 1.1,
        ease: "power3.out",
        stagger: { each: 0.09, from: "start" },
      });
    }
  }

  /* -------- HERO SHOWREEL CTA -------- */
  const heroReveals = document.querySelectorAll(".hero [data-reveal]:not(.word)");
  if (heroReveals.length) {
    gsap.to(heroReveals, {
      opacity: 1, y: 0,
      duration: 1, ease: "expo.out",
      stagger: 0.1, delay: 1.2,
    });
  }

  /* -------- SECTION REVEALS -------- */
  gsap.utils.toArray("section [data-reveal], footer [data-reveal]").forEach((el) => {
    gsap.to(el, {
      opacity: 1, y: 0,
      duration: 1.1, ease: "expo.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none reverse",
      },
    });
  });

  /* -------- MANTA PARALLAX + AMBIENT DRIFT + TILT --------
     Three concurrent GSAP animations on the same #manta element.
     yPercent (parallax) + y (breath) + rotation (tilt) compose as separate
     transform components into a single matrix per tick — no fighting. */
  const manta = document.getElementById("manta");
  if (manta && !prefersReduced) {
    // Slow scroll-driven parallax
    gsap.to(manta, {
      yPercent: 14,
      scale: 1.06,
      ease: "none",
      scrollTrigger: {
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2,
      },
    });

    // Ambient breath — keeps the silhouette alive when not scrolling
    gsap.to(manta, {
      y: 14,
      duration: 7,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });

    // Tilt — cursor x maps to ±5deg lean. quickTo tweens smoothly
    // toward each new target without queueing up tweens per pointermove.
    const rotateTo = gsap.quickTo(manta, "rotation", {
      duration: 0.7,
      ease: "power2.out",
    });
    window.addEventListener("pointermove", (e) => {
      // (clientX/innerWidth - 0.5) is in -0.5..+0.5 → multiply by 10 for ±5deg
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