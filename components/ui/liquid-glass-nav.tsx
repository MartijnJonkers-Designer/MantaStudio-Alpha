"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LiquidGlassNav — Floating, pill-shaped, glassmorphism navigation for MantaStudio.
 *
 * Inspired by Apple iOS 26 "Liquid Glass" + 21st.dev floating-pill patterns:
 *  - Backdrop-blurred dark glass with a hue-shifting border (cyan #7CFFCB → blue #38BDF8)
 *  - framer-motion shared-layout active highlight (layoutId)
 *  - Morphs (shrinks + intensifies blur) on scroll past 80px
 *  - Mobile: collapses to logo + hamburger that reveals a glassy dropdown
 *
 * Mounted in app/layout.tsx so it floats above all content.
 */

export interface LiquidGlassNavItem {
  label: string;
  href: string;
}

interface LiquidGlassNavProps {
  items?: LiquidGlassNavItem[];
  cta?: { label: string; href: string };
}

const DEFAULT_ITEMS: LiquidGlassNavItem[] = [
  { label: "Work", href: "#work" },
  { label: "Studio", href: "#studio" },
  { label: "Approach", href: "#approach" },
  { label: "Contact", href: "#contact" },
];

const SPRING = { type: "spring" as const, stiffness: 100, damping: 30, mass: 0.8 };

export default function LiquidGlassNav({
  items = DEFAULT_ITEMS,
  cta = { label: "Start a Project", href: "#contact" },
}: LiquidGlassNavProps) {
  const [activeHref, setActiveHref] = useState<string>(items[0]?.href ?? "");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // Scroll-driven morph
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      <motion.nav
        aria-label="Primary"
        initial={reduceMotion ? false : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.05 }}
        className={cn(
          "fixed left-1/2 z-50 -translate-x-1/2",
          "transition-[top,padding] duration-500 ease-out",
          scrolled ? "top-3" : "top-6",
        )}
      >
        {/* Outer hue-shifting gradient border (mask-composited so the inside stays glassy) */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full p-[1px]",
            "[mask:linear-gradient(#000,#000)_content-box,linear-gradient(#000,#000)]",
            "[mask-composite:exclude] [-webkit-mask-composite:xor]",
          )}
          style={{
            background:
              "linear-gradient(120deg, rgba(124,255,203,0.55) 0%, rgba(56,189,248,0.45) 45%, rgba(255,255,255,0.10) 70%, rgba(124,255,203,0.35) 100%)",
          }}
        />

        {/* Glass pill */}
        <div
          className={cn(
            "relative flex items-center gap-2 rounded-full",
            "border border-white/10",
            "bg-white/[0.04]",
            "shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]",
            "transition-[padding,backdrop-filter] duration-500 ease-out",
            scrolled
              ? "px-2 py-1.5 backdrop-blur-2xl"
              : "px-3 py-2 backdrop-blur-xl",
          )}
        >
          {/* Brand */}
          <a
            href="#top"
            aria-label="MantaStudio — home"
            className={cn(
              "group relative flex items-center gap-2 rounded-full px-3 py-1.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CFFCB] focus-visible:ring-offset-0",
            )}
          >
            <span
              className="h-2 w-2 rounded-full bg-[#7CFFCB]"
              style={{ boxShadow: "0 0 12px rgba(124,255,203,0.85)" }}
            />
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-white/85 group-hover:text-white">
              MantaStudio
            </span>
          </a>

          {/* Hairline divider */}
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/10 md:block" />

          {/* Items */}
          <ul className="relative hidden items-center md:flex">
            {items.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.href} className="relative">
                  <a
                    href={item.href}
                    onClick={() => setActiveHref(item.href)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative inline-flex items-center rounded-full px-4 py-1.5",
                      "text-xs uppercase tracking-[0.22em] transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CFFCB]",
                      isActive ? "text-white" : "text-white/60 hover:text-white/90",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="liquid-nav-active-pill"
                        aria-hidden
                        transition={SPRING}
                        className="absolute inset-0 rounded-full"
                        style={{
                          background:
                            "linear-gradient(120deg, rgba(124,255,203,0.20) 0%, rgba(56,189,248,0.18) 100%)",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 24px rgba(124,255,203,0.15)",
                          border: "1px solid rgba(124,255,203,0.25)",
                        }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>

          {/* CTA */}
          <a
            href={cta.href}
            onClick={() => setActiveHref(cta.href)}
            className={cn(
              "ml-1 hidden items-center gap-2 rounded-full px-4 py-1.5 md:inline-flex",
              "text-xs font-medium uppercase tracking-[0.22em] text-black",
              "transition-transform hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CFFCB] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            )}
            style={{
              background:
                "linear-gradient(120deg, #FFFFFF 0%, #7CFFCB 45%, #38BDF8 100%)",
              boxShadow:
                "0 0 24px rgba(124,255,203,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            {cta.label}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </a>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="liquid-nav-mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
            className={cn(
              "ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full md:hidden",
              "text-white/80 transition-colors hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CFFCB]",
            )}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile dropdown — glassy panel */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="liquid-nav-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "fixed left-1/2 z-40 w-[min(92vw,420px)] -translate-x-1/2 md:hidden",
              scrolled ? "top-16" : "top-20",
            )}
          >
            <div
              className={cn(
                "rounded-3xl border border-white/10 bg-white/[0.05] p-3 backdrop-blur-2xl",
                "shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]",
              )}
            >
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => {
                        setActiveHref(item.href);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-2xl px-4 py-3",
                        "text-sm uppercase tracking-[0.22em] text-white/80",
                        "transition-colors hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {item.label}
                      <ArrowUpRight className="h-4 w-4 opacity-60" strokeWidth={2} />
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href={cta.href}
                onClick={() => setMobileOpen(false)}
                className="mt-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium uppercase tracking-[0.22em] text-black"
                style={{
                  background:
                    "linear-gradient(120deg, #FFFFFF 0%, #7CFFCB 45%, #38BDF8 100%)",
                }}
              >
                {cta.label}
                <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
