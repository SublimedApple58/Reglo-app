"use client";

import { motion } from "motion/react";

/**
 * FadeIn — apparizione morbida del contenuto reale al posto dello skeleton
 * (fade + leggera risalita). Montarlo quando i dati sono pronti:
 *
 *   {loading ? <Skeleton ... /> : <FadeIn>{contenuto}</FadeIn>}
 */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
