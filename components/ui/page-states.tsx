"use client";

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fadeInUp, spring } from "@/lib/motion";

export function PageLoadingState({
  label = "Caricamento in corso...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[220px] w-full items-center justify-center rounded-lg border border-border bg-white p-6 shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function PageEmptyState({
  title = "Nessun risultato",
  description = "Non ci sono elementi da mostrare.",
  className,
  action,
}: {
  title?: string;
  description?: string;
  className?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      className={cn(
        "flex min-h-[240px] w-full items-center justify-center rounded-lg border border-border bg-white p-6 shadow-card",
        className,
      )}
    >
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-pink-50">
          <Inbox className="h-5 w-5 text-primary" />
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action ? (
          <div className="pt-1">
            <Button type="button" variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function PageErrorState({
  title = "Errore nel caricamento",
  description = "Si è verificato un problema durante il caricamento dei dati.",
  className,
  action,
}: {
  title?: string;
  description?: string;
  className?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      className={cn(
        "flex min-h-[240px] w-full items-center justify-center rounded-lg border border-border bg-white p-6 shadow-card",
        className,
      )}
    >
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-pink-200 bg-[#FEF2F2]">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action ? (
          <div className="pt-1">
            <Button type="button" variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
