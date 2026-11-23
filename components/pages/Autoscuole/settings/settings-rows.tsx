"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Mattoni del pane «Promemoria e notifiche» (REG-767), sullo stesso impianto
 * di «Prenotazioni e allievi»: sezioni con un titolo, righe titolo + una riga
 * grigia + controllo a destra, divisori sottili. Niente card né pillole: la
 * gerarchia la fa la tipografia, e un glifo a un colore accanto al titolo
 * (come le righe dei promemoria di sempre) aiuta a riconoscere la voce.
 */

export type SettingsIcon = React.ComponentType<{ className?: string; strokeWidth?: string | number }>;

export function SettingsSection({
  title,
  icon: Icon,
  description,
  action,
  children,
  className,
  id,
  testId,
}: {
  title: string;
  icon?: SettingsIcon;
  /** Solo quando serve a capire la sezione. */
  description?: React.ReactNode;
  /** Link o comando allineato al titolo («Vedi tutti»). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  testId?: string;
}) {
  return (
    <section id={id} data-testid={testId} className={cn("scroll-mt-6", className)}>
      <div className="flex items-end justify-between gap-4">
        <h3 className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.1px] text-[#222222]">
          {Icon ? <Icon className="size-[19px] shrink-0" strokeWidth={1.9} /> : null}
          {title}
        </h3>
        {action}
      </div>
      {description ? (
        <p className="mt-1 max-w-[620px] text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
          {description}
        </p>
      ) : null}
      <div className="mt-2 divide-y divide-[#ebebeb]">{children}</div>
    </section>
  );
}

/**
 * Una riga: titolo, descrizione facoltativa, controllo a destra. Con
 * `stackOnMobile` il controllo (una select) va sotto il titolo sotto i 640px,
 * così a 390px non schiaccia il testo. I toggle restano sempre a destra.
 */
export function SettingsRow({
  title,
  icon: Icon,
  description,
  control,
  stackOnMobile,
  dim,
  children,
  testId,
}: {
  title: string;
  icon?: SettingsIcon;
  description?: React.ReactNode;
  control?: React.ReactNode;
  stackOnMobile?: boolean;
  /** Riga non disponibile: titolo grigio. */
  dim?: boolean;
  /** Dettagli che si aprono sotto la riga (orari, destinatari). */
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="py-5" data-testid={testId}>
      <div
        className={cn(
          "flex justify-between gap-x-6 gap-y-3",
          stackOnMobile ? "flex-col sm:flex-row sm:items-center" : "items-center",
        )}
      >
        <div className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 text-[15px] font-semibold",
              dim ? "text-[#929292]" : "text-[#222222]",
            )}
          >
            {Icon ? (
              <Icon
                className={cn("size-[17px] shrink-0", dim && "text-[#b4b4b4]")}
                strokeWidth={2}
              />
            ) : null}
            {title}
          </div>
          {description ? (
            <div className="mt-0.5 max-w-[560px] text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
              {description}
            </div>
          ) : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Etichetta di un gruppo di righe dentro una sezione («Promemoria», «Solo
 * nell'app»): grigia e piccola, con una nota facoltativa. Niente linea sotto
 * (i divisori del gruppo stanno sul fondo delle righe), così le fa da titolo.
 */
export function SettingsGroupLabel({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="!border-b-0 pb-1 pt-6 first:pt-3">
      <div className="text-[13px] font-semibold text-[#929292]">{children}</div>
      {note ? (
        <p className="mt-1 max-w-[560px] text-[13px] font-medium leading-relaxed text-[#6a6a6a]">{note}</p>
      ) : null}
    </div>
  );
}

/** Parametro della riga (minuti, orario) e canali, affiancati; a 390px vanno a capo. */
export function RowControls({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>;
}

/** Dettagli che compaiono quando l'interruttore è acceso: altezza + dissolvenza, 250ms. */
export function SettingsReveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
          exit={{ height: 0, opacity: 0, overflow: "hidden" }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Riga interna ai dettagli: etichetta piccola a sinistra, controllo a destra. */
export function SettingsSubRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-[13.5px] font-medium text-[#6a6a6a]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Select della stessa misura di «Prenotazioni e allievi». */
export const SETTINGS_SELECT_TRIGGER =
  "h-11 w-full rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 text-sm font-medium text-[#222222] shadow-none hover:border-[#929292] focus:border-[#222222] focus:ring-0 sm:w-[200px]";
