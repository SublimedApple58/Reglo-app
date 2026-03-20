"use client";

import Lottie from "lottie-react";
import { AnimatePresence, motion } from "motion/react";
import carAnimation from "@/assets/Car.json";

export function LottieLoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center"
        >
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white px-8 py-5 shadow-card-primary">
            <Lottie
              animationData={carAnimation}
              loop
              style={{ width: 180, height: 180 }}
            />
            <span className="text-sm font-medium text-muted-foreground">
              Caricamento...
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
