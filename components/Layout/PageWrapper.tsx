"use client";

import type { ReactElement, ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { pageTransition } from "@/lib/motion";

/**
 * Lightweight page wrapper without sidebar dependency.
 * Used by autoscuole pages inside AutoscuoleShell.
 */
export function PageWrapper({
  children,
  title,
  subTitle,
  hideHero = false,
}: {
  children?: ReactNode;
  title?: string;
  subTitle?: ReactNode;
  hideHero?: boolean;
}): ReactElement {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {!hideHero && title && (
        <header className="space-y-1.5">
          <h1 className="ds-section-primary text-foreground">{title}</h1>
          {subTitle ? (
            typeof subTitle === "string" ? (
              <p className="text-sm text-muted-foreground">{subTitle}</p>
            ) : (
              subTitle
            )
          ) : null}
        </header>
      )}

      <motion.section
        className="flex flex-1 flex-col"
        variants={pageTransition}
        initial="initial"
        animate="animate"
      >
        {children}
      </motion.section>
    </div>
  );
}
