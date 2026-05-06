import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names safely.
 *
 * Combines `clsx` (conditional classes) with `tailwind-merge`
 * (deduplicates conflicting Tailwind utilities, e.g. `p-2 p-4` -> `p-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
