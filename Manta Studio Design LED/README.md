\# Manta Works — Editorial Landing v2



A high-end, design-led landing page modeled on the dogstudio.co mobile composition: a stacked left-aligned \*\*Playfair Display\*\* headline that physically weaves through a fixed, glowing manta ray.



\## Structure



```

manta-works/

├── index.html          # Hero (layered) + Intro + About + Services + Vision + Footer

├── css/

│   └── styles.css      # All styling, design tokens, responsive rules

├── js/

│   ├── particles.js    # Marine snow canvas system

│   └── main.js         # GSAP load + scroll choreography

└── assets/

&#x20;   └── manta.png       # ← drop your high-res manta visual here

```



\## The layering trick (the whole point)



The hero's "weave" effect is achieved with \*\*two identical-position headline blocks\*\* stacked at different `z-index`es, sandwiching the manta:



| Layer | z-index | Element                                     |

|-------|---------|---------------------------------------------|

| BACK  | 1       | `.hero\_\_headline--back` (lines: Move / The) |

| MID   | 2       | `.stage\_\_manta` (the manta image)           |

| FRONT | 3       | `.hero\_\_headline--front` (lines: We / Deep.)|



Both `<h1>` elements use `position: absolute` with the \*\*same top/left/right\*\* values. Each line uses `padding-top` (`0`, `1em`, `2em`, `3em`) to lock its vertical slot. Because both halves share the exact same coordinate system, the front and back lines stack into one cohesive headline — but the manta passes through the middle.



To swap which words go in front vs behind, just move them between the two `<h1>` blocks.



\## Drop in the manta image



1\. Save your manta visual as `assets/manta.png` (transparent PNG, \~1500–2000px wide).

2\. In `index.html` find the `.stage\_\_manta` block and:

&#x20;  - Uncomment the `<img>` line.

&#x20;  - Delete the placeholder `<svg>` block below it.

3\. If your manta sits on a dark plate already, you may want to remove the `drop-shadow` filter from `.stage\_\_manta img` in `styles.css`.



\## Design tokens



Everything is centralized in `:root` at the top of `styles.css`:



\- `--c-bg-1/2/3` — abyss, lifted, deeper-lifted

\- `--c-ink` / `--c-ink-soft` / `--c-ink-mute` — type hierarchy

\- `--c-accent` — coral red (used only on the period and the showreel button)

\- `--c-bloom-1/2` — aurora purple/teal (the ambient bloom in the stage)

\- `--f-display` Playfair Display

\- `--f-ui` Inter



\## What's included



\- \*\*Fixed background stage\*\* — gradient → animated aurora → manta → particles → grain → vignette

\- \*\*Hero\*\* — layered headline with z-index weaving, per-word reveal in reading order, coral period accent, showreel CTA

\- \*\*Intro\*\* — large-type lede + secondary copy + social row (lifted directly from the dogstudio rhythm)

\- \*\*About / Services / Vision\*\* sections with index labels, asymmetric italic accents, and `data-reveal` scroll-ins

\- \*\*Marine snow\*\* — depth-layered canvas particles, density auto-scales, pauses on tab blur, respects reduced-motion

\- \*\*Film grain\*\* — pure CSS via inline SVG turbulence

\- \*\*GSAP\*\* — synchronised hero word stagger, scroll-triggered section reveals, manta parallax + ambient breath, headline counter-parallax

\- \*\*Mobile-first\*\* — type scale, padding, and nav layout all adapt below 760px



\## Smooth-scroll on mobile



The brief calls out buttery mobile scrolling, so this build deliberately does NOT use scroll-jacking or smooth-scroll libraries (Lenis, Locomotive). The reveals use `scrub: false` triggers that fire at fixed scroll positions, and only the manta uses `scrub` — that's the one place a tiny lag is acceptable and reads as ambient drift rather than friction.



\## Where to take it next



\- Replace the SVG placeholder with the real manta PNG and tune drop-shadow / blend-mode to taste

\- Consider a small custom cursor (circle that scales on hovering links) for desktop polish

\- Add a work / case studies grid between Services and Vision

\- Wire the contact CTA into a real form or mailto pipeline

