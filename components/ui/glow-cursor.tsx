"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface GlowCursorProps {
  color?: string;
  size?: number;
}

export default function GlowCursor({
  color = "#7CFFCB",
  size = 28,
}: GlowCursorProps) {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);

  const springConfig = { stiffness: 100, damping: 30, mass: 0.6 };
  const sx = useSpring(x, springConfig);
  const sy = useSpring(y, springConfig);

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    if (isCoarse) return;

    setEnabled(true);

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] mix-blend-screen"
      style={{ x: sx, y: sy }}
    >
      <motion.svg
        width={size * 6}
        height={size * 6}
        viewBox={`0 0 ${size * 6} ${size * 6}`}
        style={{
          transform: `translate(-${size * 3}px, -${size * 3}px)`,
        }}
      >
        <defs>
          <radialGradient id="glow-cursor-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="40%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer pulsing halo */}
        <motion.circle
          cx={size * 3}
          cy={size * 3}
          r={size * 2.6}
          fill="url(#glow-cursor-halo)"
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "50%", originY: "50%" }}
        />

        {/* Mid soft ring */}
        <motion.circle
          cx={size * 3}
          cy={size * 3}
          r={size * 1.1}
          fill="none"
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={1}
          animate={{ scale: [1, 1.25, 1], opacity: [0.45, 0.15, 0.45] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "50%", originY: "50%" }}
        />

        {/* Crisp inner dot */}
        <circle
          cx={size * 3}
          cy={size * 3}
          r={3}
          fill={color}
          opacity={0.95}
        />
      </motion.svg>
    </motion.div>
  );
}
