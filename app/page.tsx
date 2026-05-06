"use client";

import GlowCursor from "@/components/ui/glow-cursor";
import ImmersiveHero from "@/components/ui/immersive-hero";
import HorizontalParallaxGallery, {
  type ParallaxItem,
} from "@/components/ui/horizontal-parallax-gallery";

const PROJECTS: ParallaxItem[] = [
  {
    src: "https://picsum.photos/seed/manta-tide/1200/1500",
    title: "Tide & Form",
    category: "Brand · Identity",
  },
  {
    src: "https://picsum.photos/seed/manta-noord/1200/1500",
    title: "Noord Atelier",
    category: "Web · Editorial",
  },
  {
    src: "https://picsum.photos/seed/manta-vapor/1200/1500",
    title: "Vapor Cooperative",
    category: "Product · Motion",
  },
  {
    src: "https://picsum.photos/seed/manta-kade/1200/1500",
    title: "Kade Kollektief",
    category: "Art Direction",
  },
  {
    src: "https://picsum.photos/seed/manta-stilte/1200/1500",
    title: "Stilte Studios",
    category: "Brand · Web",
  },
];

export default function Home() {
  return (
    <main className="bg-black text-white">
      <GlowCursor />

      <ImmersiveHero
        title="MantaStudio: Crafting Digital Depth from the Netherlands."
        description="A creative practice for ambitious brands. We design slow, deliberate digital experiences — built on craft, weight, and quiet motion."
        primaryCta={{ label: "View the Work", href: "#work" }}
        secondaryCta={{ label: "Start a Project", href: "#contact" }}
      />

      <div id="work">
        <HorizontalParallaxGallery items={PROJECTS} />
      </div>

      <footer
        id="contact"
        className="relative border-t border-white/10 bg-black px-8 py-24 md:px-12 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
            Contact
          </p>
          <h3 className="mt-6 max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-tight md:text-6xl">
            Let&apos;s build something with depth.
          </h3>
          <a
            href="mailto:hello@mantastudio.nl"
            className="mt-10 inline-flex items-center gap-3 text-lg text-white/80 hover:text-white"
          >
            hello@mantastudio.nl
            <span className="inline-block h-2 w-2 rounded-full bg-[#7CFFCB]" />
          </a>

          <div className="mt-16 flex flex-col items-start justify-between gap-4 text-[10px] uppercase tracking-[0.3em] text-white/40 md:flex-row md:items-end">
            <span>MantaStudio · Amsterdam, NL</span>
            <span>© {new Date().getFullYear()} MantaStudio</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
