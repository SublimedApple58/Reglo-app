"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CreditCard, FileText, KeyRound, Lock, Receipt } from "lucide-react";

import { cn } from "@/lib/utils";

type PaneKey = "credenziali" | "documenti" | "abbonamento";

const PANES: Array<{ key: PaneKey; label: string; icon: React.ReactNode }> = [
  { key: "credenziali", label: "Credenziali", icon: <KeyRound className="size-6" strokeWidth={1.9} /> },
  { key: "documenti", label: "Contratto e fattura", icon: <FileText className="size-6" strokeWidth={1.9} /> },
  { key: "abbonamento", label: "Abbonamento", icon: <CreditCard className="size-6" strokeWidth={1.9} /> },
];

/**
 * Area personale (overlay full-screen stile Impostazioni, dal proto
 * #section-areapersonale). I contenuti sono in gran parte in arrivo: nessun
 * backend esiste ancora per vault credenziali, contratto/fatture e
 * abbonamento — le pane mostrano lo scaffold del design con stati onesti.
 */
export function AutoscuoleAreaPersonalePage() {
  const router = useRouter();
  const [pane, setPane] = React.useState<PaneKey>("credenziali");

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white"
      data-testid="autoscuole-area-personale-page"
    >
      {/* ── Header overlay ── */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#dddddd] px-6 lg:px-10">
        <Image
          src="/images/nav/logo-reglo-tight.png"
          alt="Reglo"
          width={30}
          height={30}
          className="select-none object-contain"
        />
        <button
          type="button"
          onClick={() => router.push("/user/autoscuole")}
          className="cursor-pointer select-none rounded-full px-[22px] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#f2f2f2]"
        >
          Fatto
        </button>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        <div className="grid w-full max-w-[1280px] min-h-0 grid-cols-1 md:grid-cols-[400px_1fr]">
          {/* ── Sidebar ── */}
          <div className="min-h-0 overflow-y-auto border-b border-[#ebebeb] px-6 py-6 md:border-b-0 md:border-r md:py-12 md:pl-10 md:pr-12 lg:pl-0">
            <h1 className="mb-8 text-[28px] font-bold tracking-[-0.6px] text-foreground">
              Area personale
            </h1>
            <div className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5">
              {PANES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPane(item.key)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-4 rounded-[10px] px-5 py-4 text-left text-lg transition-colors",
                    pane === item.key
                      ? "bg-[#e8e8e8] font-semibold text-foreground"
                      : "font-medium text-[#444444] hover:bg-[#ebebeb] hover:text-foreground",
                  )}
                >
                  {item.icon}
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="min-h-0 min-w-0 overflow-y-auto px-6 py-8 md:px-10 md:py-12 lg:pl-12 lg:pr-0">
            {pane === "credenziali" && (
              <div>
                <h2 className="mb-[18px] text-2xl font-bold tracking-[-0.3px] text-foreground">
                  Credenziali
                </h2>
                <div className="mb-4 max-w-[680px] overflow-hidden rounded-2xl border border-[#ebebeb]">
                  <div className="flex items-center gap-3 border-b border-[#ebebeb] bg-[#f7f9ff] px-[22px] py-[13px]">
                    <Lock className="size-[18px] text-[#2a6fdb]" strokeWidth={1.8} />
                    <span className="text-[13.5px] font-semibold text-[#2a6fdb]">
                      Vault sicuro · cifrato end-to-end
                    </span>
                  </div>
                  <div className="px-[22px] py-8 text-center">
                    <p className="mx-auto max-w-[420px] text-sm font-medium leading-relaxed text-[#6a6a6a]">
                      Il vault credenziali della tua autoscuola verrà attivato dal team Reglo.
                      Qui troverai le credenziali custodite in modo sicuro, con condivisione
                      tramite link protetti e a scadenza.
                    </p>
                  </div>
                </div>
                <div className="max-w-[680px] rounded-[10px] border border-[#f0e060] bg-[#fffce0] px-[18px] py-[13px]">
                  <div className="mb-1.5 text-xs font-bold text-[#7a6a00]">
                    Custodia delle credenziali
                  </div>
                  <div className="text-xs font-medium leading-relaxed text-[#7a6a00]">
                    Reglo conserva e gestisce le credenziali di accesso. La condivisione avviene
                    esclusivamente tramite link protetti e temporanei:{" "}
                    <strong>non inviare mai le credenziali via email, chat o documenti condivisi</strong>.
                    In caso di sospetto accesso non autorizzato, il team Reglo interviene
                    tempestivamente per assisterti.
                  </div>
                </div>
              </div>
            )}

            {pane === "documenti" && (
              <div>
                <h2 className="mb-9 text-2xl font-bold tracking-[-0.3px] text-foreground">
                  Contratto e fattura
                </h2>
                <div className="mb-8 flex max-w-[680px] items-center gap-[18px] rounded-[14px] border border-[#ebebeb] px-[22px] py-5">
                  <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff]">
                    <FileText className="size-[22px] text-[#2a6fdb]" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-foreground">
                      Contratto di servizio Reglo
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
                      Sarà disponibile qui non appena caricato dal team Reglo.
                    </div>
                  </div>
                </div>
                <div className="max-w-[680px]">
                  <div className="flex flex-col items-center rounded-[14px] border border-dashed border-[#dddddd] px-6 py-10 text-center">
                    <Receipt className="mb-3 size-7 text-[#c1c1c1]" strokeWidth={1.5} />
                    <div className="mb-1 text-sm font-semibold text-foreground">
                      Nessuna fattura disponibile
                    </div>
                    <div className="text-[13px] font-medium text-[#929292]">
                      Le fatture del tuo abbonamento compariranno qui.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pane === "abbonamento" && (
              <div>
                <h2 className="mb-8 text-2xl font-bold tracking-[-0.3px] text-foreground">
                  Abbonamento
                </h2>
                <div className="max-w-[680px] rounded-[14px] border border-[#ebebeb] p-[22px]">
                  <div className="text-[17px] font-bold text-foreground">Il tuo piano</div>
                  <div className="mt-1.5 text-[13.5px] font-medium text-[#929292]">
                    Il dettaglio del piano, con il riepilogo delle voci e il totale mensile, sarà
                    disponibile qui a breve.
                  </div>
                  <div className="my-[18px] h-px bg-[#efefef]" />
                  <div className="text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
                    Per modifiche al piano, posti istruttore o disdette contatta il team Reglo:
                    ti rispondiamo in giornata.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
