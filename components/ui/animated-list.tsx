"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";

import { stagger, staggerItem, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * AnimatedList — Wraps children in a stagger container.
 *
 * Usage:
 * <AnimatedList>
 *   {items.map(item => <AnimatedListItem key={item.id}>...</AnimatedListItem>)}
 * </AnimatedList>
 */
export function AnimatedList({
  children,
  className,
  delay = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={stagger(delay)}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedListItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * ContentSwap — AnimatePresence wrapper for skeleton → content transitions.
 *
 * Usage:
 * <ContentSwap loading={isLoading} skeleton={<Skeleton />}>
 *   {content}
 * </ContentSwap>
 */
export function ContentSwap({
  loading,
  skeleton,
  children,
  className,
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="skeleton"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={className}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
