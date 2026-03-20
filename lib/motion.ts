/**
 * Reglo Design System — Motion Primitives
 *
 * Centralized animation config for Framer Motion (motion/react).
 * Maps 1:1 to DESIGN_SYSTEM.md §8.
 */

import type { Transition, Variants } from "motion/react";

/* ─── Springs (§8.2) ─── */
export const spring = {
  snappy: { type: "spring", damping: 20, stiffness: 300 } as Transition,
  bouncy: { type: "spring", damping: 12, stiffness: 200 } as Transition,
  gentle: { type: "spring", damping: 22, stiffness: 240 } as Transition,
  elastic: { type: "spring", damping: 8, stiffness: 150 } as Transition,
};

export const timing = {
  swift: { duration: 0.2, ease: [0.33, 1, 0.68, 1] } as Transition,
  slowReveal: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } as Transition,
};

/* ─── Press feedback (§8.4) ─── */
export const tapScale = {
  standard: { scale: 0.97 },
  light: { scale: 0.92 },
  cta: { scale: 0.96, opacity: 0.88 },
};

/* ─── Hover (§4 prompt) ─── */
export const hoverLift = {
  y: -2,
  boxShadow: "0 8px 25px rgba(0,0,0,0.08)",
};

/* ─── Stagger container + item (§8.5) ─── */
export const stagger = (delay = 0.06): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: delay },
  },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 20, stiffness: 260 },
  },
};

/* ─── Page transition (§8.8) ─── */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: { opacity: 0, y: -8 },
};

/* ─── Fade in (generic) ─── */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
  },
};

/* ─── Skeleton → Content swap (§8.5) ─── */
export const skeletonExit = {
  opacity: 0,
  transition: { duration: 0.15 },
};

export const contentEnter = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.3 },
};

/* ─── Dialog / Modal (§8.7) ─── */
export const dialogOverlay: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const dialogContent: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", damping: 22, stiffness: 260 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

/* ─── Toast (§8.9) ─── */
export const toastVariants: Variants = {
  hidden: { opacity: 0, y: -30, scale: 0.92 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      damping: 18,
      stiffness: 300,
      opacity: { duration: 0.2 },
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: { duration: 0.25 },
  },
};

/* ─── Shake for errors (§8.6) ─── */
export const shakeVariants: Variants = {
  idle: { x: 0 },
  shake: {
    x: [0, -8, 8, -6, 6, 0],
    transition: { duration: 0.3 },
  },
};

/* ─── Counter bounce (§8.6) ─── */
export const counterBounce = {
  initial: { scale: 0.85, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: spring.bouncy,
};
