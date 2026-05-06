"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from "framer-motion";

interface ImmersiveHeroProps {
  eyebrow?: string;
  title: string;
  description: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

const SPRING = { stiffness: 100, damping: 30, mass: 0.8 };

export default function ImmersiveHero({
  eyebrow = "Creative Studio · Netherlands",
  title,
  description,
  primaryCta,
  secondaryCta,
}: ImmersiveHeroProps) {
  const sectionRef = useRef<HTMLElement | null>(null);

  // Mouse-reactive gradient position. Defaults centered.
  const mx = useMotionValue(50);
  const my = useMotionValue(40);
  const smx = useSpring(mx, SPRING);
  const smy = useSpring(my, SPRING);

  // Secondary "warm" gradient drifts in the opposite direction for parallax depth.
  const wx = useMotionValue(50);
  const wy = useMotionValue(60);
  const swx = useSpring(wx, SPRING);
  const swy = useSpring(wy, SPRING);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      mx.set(px);
      my.set(py);
      // Inverse for the warm layer for a subtle counter-parallax.
      wx.set(100 - px);
      wy.set(100 - py);
    };

    el.addEventListener("mousemove", handle);
    return () => el.removeEventListener("mousemove", handle);
  }, [mx, my, wx, wy]);

  const cyanLayer = useMotionTemplate`radial-gradient(60% 60% at ${smx}% ${smy}%, rgba(124,255,203,0.32), rgba(0,0,0,0) 65%)`;
  const blueLayer = useMotionTemplate`radial-gradient(70% 70% at ${smx}% ${smy}%, rgba(56,189,248,0.18), rgba(0,0,0,0) 70%)`;
  const warmLayer = useMotionTemplate`radial-gradient(55% 55% at ${swx}% ${swy}%, rgba(249,115,22,0.18), rgba(0,0,0,0) 70%)`;

  // Split the title at the colon for a two-stanza display.
  const [lead, ...rest] = title.split(":");
  const trailing = rest.join(":").trim();

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen w-full overflow-hidden bg-black text-white"
    >
      {/* Base black + grain */}
      <div className="absolute inset-0 bg-black" />

      {/* Mouse-reactive gradient layers */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: cyanLayer }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{ background: blueLayer }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{ background: warmLayer }}
      />

      {/* Faint vignette + grid overlay for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Top-left brand mark */}
      <header className="relative z-10 flex items-center justify-between p-8 md:p-12">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", ...SPRING }}
          className="flex items-center gap-3"
        >
          <div
            className="h-3 w-3 rounded-full"
            style={{
              background:
                "radial-gradient(circle, #7CFFCB 0%, rgba(124,255,203,0) 70%)",
              boxShadow: "0 0 20px rgba(124,255,203,0.6)",
            }}
          />
          <span className="text-sm font-medium tracking-[0.2em] uppercase text-white/80">
            MantaStudio
          </span>
        </motion.div>

        <motion.nav
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", ...SPRING, delay: 0.05 }}
          className="hidden md:flex items-center gap-8 text-xs uppercase tracking-[0.25em] text-white/60"
        >
          <a href="#work" className="hover:text-white transition-colors">
            Work
          </a>
          <a href="#studio" className="hover:text-white transition-colors">
            Studio
          </a>
          <a href="#contact" className="hover:text-white transition-colors">
            Contact
          </a>
        </motion.nav>
      </header>

      {/* Headline block — bottom-left to mirror agency framing */}
      <div className="relative z-10 flex min-h-[calc(100vh-160px)] items-end px-8 md:px-12 pb-16 md:pb-24">
        <div className="w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", ...SPRING, delay: 0.1 }}
            className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#7CFFCB] shadow-[0_0_10px_#7CFFCB]" />
            <span className="text-xs uppercase tracking-[0.25em] text-white/80">
              {eyebrow}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", ...SPRING, delay: 0.2 }}
            className="text-balance text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl lg:text-[8.5rem]"
          >
            <span className="block text-white">{lead}:</span>
            {trailing && (
              <span
                className="mt-2 block bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, #FFFFFF 0%, #7CFFCB 35%, #38BDF8 65%, #FFFFFF 100%)",
                }}
              >
                {trailing}
              </span>
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", ...SPRING, delay: 0.3 }}
            className="mt-8 max-w-xl text-base leading-relaxed text-white/70 md:text-lg"
          >
            {description}
          </motion.p>

          {(primaryCta || secondaryCta) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", ...SPRING, delay: 0.4 }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              {primaryCta && (
                <a
                  href={primaryCta.href}
                  className="group relative inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-sm font-medium uppercase tracking-[0.18em] text-black transition-transform hover:scale-[1.02]"
                >
                  {primaryCta.label}
                  <span className="inline-block h-2 w-2 rounded-full bg-[#7CFFCB] transition-transform group-hover:translate-x-1" />
                </a>
              )}
              {secondaryCta && (
                <a
                  href={secondaryCta.href}
                  className="inline-flex items-center gap-3 rounded-full border border-white/20 px-8 py-4 text-sm font-medium uppercase tracking-[0.18em] text-white/80 transition-colors hover:border-white/40 hover:text-white"
                >
                  {secondaryCta.label}
                </a>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom-right meta */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0.5 }}
        className="absolute bottom-8 right-8 z-10 hidden flex-col items-end gap-1 text-right text-[10px] uppercase tracking-[0.3em] text-white/40 md:flex"
      >
        <span>Amsterdam · 52.37°N 4.89°E</span>
        <span>Est. 2026</span>
      </motion.div>
    </section>
  );
}
