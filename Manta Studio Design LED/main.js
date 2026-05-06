/* ============================================================
   MAIN — GSAP choreography
   - Hero word reveal (synchronised across back/front halves)
   - Section reveals on scroll
   - Manta parallax + ambient drift
   ============================================================ */

(function () {
  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------- HERO WORD REVEAL --------
     The words live across two separate <h1>s (one behind the manta,
     one in front), but the user should perceive ONE continuous motion.
     We do this in three steps:
       1. Build a single ordered array following reading order.
       2. Set their initial state explicitly inside the same timeline,
          so there's no flash if fonts load late.
       3. Use a single timeline with a tight stagger so each word
          starts before the previous finishes — overlapping motion
          reads as one flowing reveal rather than four discrete ones. */
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

      // Lock the initial state in the same timeline so a late-loading
      // font can never produce a flash of fully-revealed words.
      heroTL.set(orderedWords, { yPercent: 110, opacity: 0 });

      heroTL.to(orderedWords, {
        yPercent: 0,
        opacity: 1,
        duration: 1.1,
        ease: "power3.out",
        stagger: {
          each: 0.09,        // tight enough that motion overlaps
          from: "start",
        },
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

  /* -------- SECTION REVEALS --------
     Sections slide up over the fixed manta as the user scrolls. */
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

  /* -------- MANTA PARALLAX + AMBIENT DRIFT -------- */
  const manta = document.getElementById("manta");
  if (manta && !prefersReduced) {
    // Slow parallax tied to page scroll
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

    // Ambient breath — keeps it alive even when not scrolling
    gsap.to(manta, {
      y: 14,
      duration: 7,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  }

  /* -------- HERO HEADLINE COUNTER-PARALLAX --------
     Headline drifts up slightly faster than the manta, deepening the layer effect.
     Both back and front headline halves move identically so the weave is preserved. */
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