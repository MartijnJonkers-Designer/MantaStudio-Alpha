"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

export interface ParallaxItem {
  src: string;
  title: string;
  category: string;
}

interface HorizontalParallaxGalleryProps {
  items: ParallaxItem[];
  heading?: string;
  eyebrow?: string;
}

const SPRING = { stiffness: 100, damping: 30, mass: 0.8 };

export default function HorizontalParallaxGallery({
  items,
  heading = "Selected Work",
  eyebrow = "Portfolio",
}: HorizontalParallaxGalleryProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Measure horizontal travel = trackWidth - viewportWidth.
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const distance = trackRef.current.scrollWidth - window.innerWidth;
      setTravel(distance > 0 ? distance : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [items.length]);

  // Map vertical scroll progress (0→1) to horizontal travel (0 → -travel px),
  // then smooth with the heavy spring physics requested.
  const xRaw = useTransform(scrollYProgress, [0, 1], [0, -travel]);
  const x = useSpring(xRaw, SPRING);

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-black text-white"
      // Outer height controls how much vertical scroll drives the horizontal pan.
      // ~100vh per card after the first feels natural with the heavy spring.
      style={{ height: `${Math.max(items.length, 2) * 100}vh` }}
    >
      <div className="sticky top-0 flex h-screen w-full flex-col overflow-hidden">
        {/* Section header pinned with the gallery */}
        <div className="z-10 flex items-end justify-between px-8 pt-12 md:px-12 md:pt-16">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
              {eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              {heading}
            </h2>
          </div>
          <p className="hidden text-xs uppercase tracking-[0.25em] text-white/40 md:block">
            Scroll to explore →
          </p>
        </div>

        {/* Horizontal track */}
        <div className="relative flex flex-1 items-center">
          <motion.div
            ref={trackRef}
            style={{ x }}
            className="flex items-center gap-8 pl-8 pr-[20vw] md:gap-12 md:pl-12"
          >
            {items.map((item, i) => (
              <ProjectCard key={`${item.title}-${i}`} item={item} index={i} />
            ))}
          </motion.div>
        </div>

        {/* Faint scroll indicator */}
        <div className="z-10 flex items-center gap-3 px-8 pb-8 md:px-12 md:pb-12">
          <div className="h-px flex-1 bg-white/10">
            <motion.div
              className="h-full bg-white/60"
              style={{
                scaleX: scrollYProgress,
                transformOrigin: "left center",
              }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
            {String(items.length).padStart(2, "0")} Projects
          </span>
        </div>
      </div>
    </section>
  );
}

function ProjectCard({
  item,
  index,
}: {
  item: ParallaxItem;
  index: number;
}) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20%" }}
      transition={{ type: "spring", ...SPRING, delay: index * 0.05 }}
      whileHover={{ scale: 1.015 }}
      className="group relative h-[60vh] w-[70vw] shrink-0 overflow-hidden rounded-2xl bg-white/5 md:h-[70vh] md:w-[55vw] lg:w-[42vw]"
    >
      {/* Plain <img> on purpose: avoids next/image remote-host config for placeholder URLs. */}
      <img
        src={item.src}
        alt={item.title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
      />

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Number marker */}
      <div className="absolute left-6 top-6 text-[10px] uppercase tracking-[0.35em] text-white/70">
        {String(index + 1).padStart(2, "0")} / {/* count badge */}
      </div>

      {/* Caption */}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6 md:p-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">
            {item.category}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight md:text-3xl">
            {item.title}
          </h3>
        </div>
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors group-hover:border-white group-hover:text-white md:flex">
          →
        </span>
      </figcaption>
    </motion.figure>
  );
}
