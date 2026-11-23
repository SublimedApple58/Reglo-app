"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { DatePickerInput } from "@/components/ui/date-picker";
import { DurationField } from "@/components/pages/Autoscuole/DurationField";
import { TimePickerInput } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Dialog "Proponi un altro orario" (consorzio, azione "Sposta" della richiesta
 * guida) — riproduzione 1:1 del prototipo Consorzi.html (computed styles):
 * card flottante 480px radius 22 ombra 0 26px 70px, SENZA overlay scuro (il
 * ghost tratteggiato in agenda resta visibile e si aggiorna mentre scegli),
 * campi Giorno/Orario (43px radius 12 bordo #e2e2e2), chips Durata pill,
 * select "Veicolo del consorzio" con "Da assegnare", footer Annulla underline
 * + CTA "Proponi orario" navy pill. Vedi docs/features/consorzio.md.
 */

const DIALOG_WIDTH = 480;

type Props = {
  open: boolean;
  onClose: () => void;
  ymd: string;
  time: string;
  durationMinutes: number;
  vehicleId: string | null;
  vehicles: Array<{ id: string; name: string }>;
  onChange: (patch: {
    ymd?: string;
    time?: string;
    durationMinutes?: number;
    vehicleId?: string | null;
  }) => void;
  submitting: boolean;
  onSubmit: () => void;
};

export function ProposeSlotDialog({
  open,
  onClose,
  ymd,
  time,
  durationMinutes,
  vehicleId,
  vehicles,
  onChange,
  submitting,
  onSubmit,
}: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // capture: intercetta l'Escape PRIMA del listener della GuideRequestCard
    // (che altrimenti chiuderebbe anche la card sottostante).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!mounted) return null;

  // Su schermi stretti il dialog prende la larghezza disponibile (12px di
  // margine per lato) invece di uscire dal bordo.
  const width = Math.min(DIALOG_WIDTH, window.innerWidth - 24);
  const left = Math.max(12, (window.innerWidth - width) / 2);
  const top = Math.max(76, Math.min(180, window.innerHeight - 560));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="propose-slot-dialog"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed z-50 max-h-[calc(100dvh-24px)] overflow-y-auto rounded-[22px] bg-white px-5 pb-[25px] pt-[26px] sm:px-[30px] text-left shadow-[0_26px_70px_rgba(10,20,30,0.3),0_0_0_1px_rgba(0,0,0,0.04)] [line-height:normal]"
          style={{ width, left, top }}
        >
          <button
            type="button"
            aria-label="Chiudi proposta"
            onClick={onClose}
            className="absolute right-[22px] top-[22px] flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] text-[#484848] transition-colors hover:bg-[#e6e6e6]"
          >
            <X className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </button>

          <h3 className="pr-10 text-[21px] font-bold text-[#222222]">
            Proponi un altro orario
          </h3>
          <p className="mt-1.5 max-w-[386px] text-[13.5px] font-medium leading-[1.5] text-[#929292]">
            Il blocco tratteggiato in agenda si aggiorna mentre scegli.
            L&apos;autoscuola riceve la proposta e conferma.
          </p>

          <div className="mt-[19px] grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-x-3.5">
            <div>
              <div className="mb-[7px] text-[13px] font-semibold text-[#222222]">Giorno</div>
              <DatePickerInput
                value={ymd}
                onChange={(v) => onChange({ ymd: v })}
                className="h-[43px] rounded-[12px] border-[#e2e2e2] px-3.5 text-[14px] font-semibold text-[#222222]"
              />
            </div>
            <div>
              <div className="mb-[7px] text-[13px] font-semibold text-[#222222]">Orario</div>
              <TimePickerInput
                freeInput
                value={time}
                onChange={(v) => onChange({ time: v })}
                className="h-[43px] w-full rounded-[12px] border-[#e2e2e2] px-3.5 text-[14px] font-semibold text-[#222222]"
              />
            </div>
          </div>

          {/* REG-757: lo stesso campo degli esami — fino a 4 ore, o fine libera. */}
          <div className="mt-[18px]">
            <DurationField
              startTime={time || "09:00"}
              durationMin={durationMinutes}
              onDurationChange={(minutes) => onChange({ durationMinutes: minutes })}
              labelClassName="mb-0.5 text-[#222222]"
            />
          </div>

          <div className="mt-4">
            <div className="mb-[7px] text-[13px] font-semibold text-[#222222]">
              Veicolo del consorzio
            </div>
            <Select
              value={vehicleId ?? "none"}
              onValueChange={(v) => onChange({ vehicleId: v === "none" ? null : v })}
            >
              <SelectTrigger className="h-[43px] w-full cursor-pointer rounded-lg border-[#e2e2e2] px-3.5 text-[14px] font-semibold text-[#222222] shadow-none focus:ring-0">
                <SelectValue placeholder="Da assegnare" />
              </SelectTrigger>
              <SelectContent className="z-[70]">
                <SelectItem value="none" className="cursor-pointer">
                  Da assegnare
                </SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id} className="cursor-pointer">
                    {vehicle.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-[30px] flex items-center justify-between">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="cursor-pointer text-[14px] font-semibold text-[#222222] underline underline-offset-[3px] transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              Annulla
            </button>
            <Button
              type="button"
              size="bare"
              loading={submitting}
              onClick={onSubmit}
              className="flex min-w-[143px] px-[26px] py-[13px] text-[14px]"
            >
              Proponi orario
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
