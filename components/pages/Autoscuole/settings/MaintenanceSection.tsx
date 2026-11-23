"use client";

import React from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { activateCompanyMaintenance } from "@/lib/actions/maintenance.actions";
import { confirmsCompanyName, type MaintenanceScope } from "@/lib/maintenance";

const SCOPE_OPTIONS: Array<{ value: MaintenanceScope; title: string; body: string }> = [
  {
    value: "OWNER_ONLY",
    title: "Solo te",
    body: "Web e app del titolare. Istruttori e allievi continuano a usare l'app.",
  },
  {
    value: "EVERYONE",
    title: "Tutti",
    body: "Anche istruttori e allievi. Si fermano promemoria, WhatsApp e segreteria.",
  },
];

/**
 * REG-773 — riga «Modalità manutenzione» in fondo a Informazioni aziendali, con
 * il dialogo di conferma (ambito + nome dell'autoscuola scritto). È un'azione
 * che il titolare non può annullare: lo sblocco lo fa solo il backoffice.
 * Vedi docs/features/maintenance-mode.md.
 */
export function MaintenanceSection({ companyName }: { companyName: string }) {
  const toast = useFeedbackToast();
  const params = useParams<{ locale?: string }>();
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<MaintenanceScope>("OWNER_ONLY");
  const [typed, setTyped] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const confirmed = confirmsCompanyName(typed, companyName);

  const reset = () => {
    setScope("OWNER_ONLY");
    setTyped("");
  };

  const handleConfirm = async () => {
    if (!confirmed || saving) return;
    setSaving(true);
    const res = await activateCompanyMaintenance({ scope, confirmName: typed });
    if (!res.success) {
      setSaving(false);
      toast.error({ description: res.message ?? "Non è stato possibile attivare la manutenzione." });
      return;
    }
    // Da qui ogni richiesta è bloccata: si va alla schermata dedicata.
    const locale = params?.locale ?? "it";
    window.location.assign(`/${locale}/manutenzione`);
  };

  return (
    <>
      <div className="border-t border-[#ebebeb] py-5">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Image
              src="/images/3d/barriera-riga-3d.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 select-none object-contain"
            />
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">Modalità manutenzione</p>
              <p className="mt-1 text-sm font-medium text-[#6a6a6a]">
                Blocca subito l&apos;accesso all&apos;account. Solo Reglo può riattivarlo.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="bare"
            onClick={() => setOpen(true)}
            className="h-10 px-[18px] text-sm"
          >
            Attiva
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-[500px] gap-0 rounded-[28px] p-[26px] pt-[26px]">
          <DialogTitle className="pr-10 text-[22px] font-semibold tracking-[-0.3px] text-foreground">
            Metti in manutenzione
          </DialogTitle>
          <DialogDescription className="mt-2 pr-6 text-[15px] font-medium leading-relaxed text-[#6a6a6a]">
            L&apos;account si blocca subito. Nessun dato viene cancellato, ma{" "}
            <span className="font-semibold text-foreground">non potrai riattivarlo tu</span>: lo
            sblocco lo fa solo Reglo.
          </DialogDescription>

          <p className="mb-2 mt-6 text-[17px] font-semibold text-foreground">chi blocchi</p>
          <div
            role="radiogroup"
            className="rounded-[18px] border border-black/[0.06] bg-white px-4 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.16),inset_0_-2.5px_4px_rgba(0,0,0,0.035)]"
          >
            {SCOPE_OPTIONS.map((option, index) => {
              const selected = scope === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setScope(option.value)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 py-3.5 text-left",
                    index < SCOPE_OPTIONS.length - 1 && "border-b border-[#ebebeb]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-foreground">{option.title}</span>
                    <span className="mt-0.5 block text-[13.5px] font-medium leading-snug text-[#6a6a6a]">
                      {option.body}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      "mt-0.5 size-5 shrink-0 text-foreground transition-opacity duration-200 ease-out",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                    strokeWidth={2.4}
                  />
                </button>
              );
            })}
          </div>

          <label className="mt-6 block text-sm font-medium text-[#6a6a6a]">
            Per confermare scrivi <span className="font-semibold text-foreground">{companyName}</span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleConfirm();
              }}
              placeholder={companyName}
              autoComplete="off"
              className="mt-2 block h-[50px] w-full rounded-[14px] bg-white px-4 text-base font-medium text-foreground shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),inset_0_2px_5px_rgba(0,0,0,0.08)] outline-none placeholder:text-[#b0b0b0] focus:shadow-[inset_0_0_0_1.5px_#222222]"
            />
          </label>

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="bare"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="h-12 px-6 text-[15px]"
            >
              Annulla
            </Button>
            <Button
              type="button"
              size="bare"
              disabled={!confirmed}
              loading={saving}
              onClick={() => void handleConfirm()}
              className="h-12 min-w-[220px] px-6 text-[15px]"
            >
              Metti in manutenzione
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
