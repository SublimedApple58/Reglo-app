"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// Dialog "Chiave di accesso" (REG-407): replica 1:1 del prototipo
// `Chiave di accesso.html` (Ruzzu) — misure, colori e copy presi dal file.

const QR_PDF_HREF = "/file/reglo-scarica-app.pdf";
const QR_PDF_NAME = "Reglo - Scarica l'app.pdf";

const KEY_PATH =
  "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z";

const CHIP_BUTTON =
  "flex h-8 min-w-[72px] shrink-0 cursor-pointer select-none items-center justify-center rounded-[8px] border border-[#cfcfdc] bg-[#eeeef4] px-3 text-[13px] font-semibold text-[#1a1a2e] transition-[background] duration-150 hover:bg-[#e2e2ea]";

type AutonomousInstructor = { id: string; name: string; inviteCode: string | null };

export function InviteCodeDialog({
  open,
  onOpenChange,
  inviteCode,
  autonomousInstructors,
  copiedCode,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteCode: string | null;
  autonomousInstructors: AutonomousInstructor[];
  copiedCode: string | null;
  onCopy: (code: string) => void;
}) {
  const instructorKeys = autonomousInstructors.filter((instr) => instr.inviteCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="invite-code-dialog"
        className="block w-[512px] max-w-[calc(100vw-32px)] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[20px] border-0 px-5 pb-6 pt-8 text-center sm:px-9 sm:pb-8 sm:pt-10 shadow-[rgba(0,0,0,0.18)_0_8px_32px_0]"
      >
        <img
          src="/images/3d/chiave-3d.png"
          alt=""
          width={88}
          height={88}
          className="mx-auto mb-5 block size-[88px] object-contain"
        />
        <DialogTitle className="mb-1.5 text-[22px] font-bold leading-[normal] tracking-[-0.3px] text-[#222222]">
          Chiave di accesso
        </DialogTitle>
        <DialogDescription className="mb-7 text-[14px] font-medium leading-[1.5] text-[#6a6a6a]">
          Condividi questo codice per dare accesso a Reglo. Al momento della registrazione, chi utilizza questa
          chiave verrà automaticamente associato alla tua autoscuola.
        </DialogDescription>

        {/* Codice */}
        <div className="mb-7 flex items-center justify-between gap-3 rounded-[12px] border border-[#dddddd] bg-[#f7f7f7] px-3.5 py-3.5 sm:px-[18px]">
          <div className="flex items-center gap-2.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#929292"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={KEY_PATH} />
              <circle cx="16.5" cy="7.5" r=".5" fill="#929292" />
            </svg>
            <span className="hidden text-[12px] font-medium leading-[normal] text-[#929292] min-[400px]:inline">Il tuo codice</span>
          </div>
          <div className="flex items-center gap-3">
            <span data-testid="invite-code-value" className="text-[18px] font-bold leading-[normal] tracking-[2px] text-[#222222]">
              {inviteCode}
            </span>
            <button type="button" onClick={() => inviteCode && onCopy(inviteCode)} className={CHIP_BUTTON}>
              {copiedCode === inviteCode ? "Copiato ✓" : "Copia"}
            </button>
          </div>
        </div>

        {/* Chiavi istruttori autonomi: non nel prototipo (che non ne ha), stesso linguaggio visivo */}
        {instructorKeys.length > 0 && (
          <div className="mb-7 text-left">
            <p className="mb-1 text-[12px] font-bold text-[#222222]">Chiavi istruttori autonomi</p>
            <p className="mb-3 text-[12px] font-medium leading-[1.5] text-[#6a6a6a]">
              Chi si registra con la chiave di un istruttore viene iscritto all&apos;autoscuola e assegnato
              direttamente a lui.
            </p>
            <div className="overflow-hidden rounded-[12px] border border-[#dddddd] bg-[#f7f7f7]">
              {instructorKeys.map((instr, idx) => (
                <div
                  key={instr.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-[18px] py-3",
                    idx < instructorKeys.length - 1 && "border-b border-[#dddddd]",
                  )}
                >
                  <span className="truncate text-[13px] font-semibold text-[#222222]">{instr.name}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[15px] font-bold tracking-[2px] text-[#222222]">{instr.inviteCode}</span>
                    <button type="button" onClick={() => onCopy(instr.inviteCode!)} className={CHIP_BUTTON}>
                      {copiedCode === instr.inviteCode ? "Copiato ✓" : "Copia"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR per gli allievi */}
        <div className="mb-5 flex items-center gap-3 rounded-[12px] border border-[#dddddd] bg-[#f7f7f7] px-3 py-3.5 text-left sm:gap-4 sm:px-4">
          <a
            href={QR_PDF_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Apri il PDF con i QR"
            className="flex h-[93px] w-[68px] shrink-0 flex-col gap-1 overflow-hidden rounded-[6px] border border-[#dddddd] bg-white px-[5px] py-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
          >
            <div className="h-px bg-[#222222]" />
            <div className="h-1 w-[80%] rounded-[1px] bg-[#222222]" />
            <div className="h-1 w-[60%] rounded-[1px] bg-[#222222]" />
            <div className="h-0.5 w-[90%] rounded-[1px] bg-[#bbbbbb]" />
            <div className="h-0.5 w-[85%] rounded-[1px] bg-[#bbbbbb]" />
            <div className="mt-auto flex gap-[3px]">
              <img src="/images/chiave-accesso/qr-app-store.png" alt="" className="block size-5" />
              <img src="/images/chiave-accesso/qr-google-play.png" alt="" className="block size-5" />
            </div>
            <div className="h-px bg-[#222222]" />
          </a>
          <div className="min-w-0 flex-1">
            <div className="mb-[3px] text-[14px] font-bold leading-[normal] text-[#222222]">QR per gli allievi</div>
            <div className="text-[12px] font-medium leading-[1.5] text-[#6a6a6a]">
              Foglio A4 con i QR per scaricare l&apos;app. Stampalo e appendilo in sede.
            </div>
          </div>
          <a href={QR_PDF_HREF} download={QR_PDF_NAME} className={cn(CHIP_BUTTON, "gap-[7px] no-underline")}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1a1a2e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M4 21h16" />
            </svg>
            PDF
          </a>
        </div>

        {/* Note sulla distribuzione */}
        <div className="rounded-[10px] border border-[#f0e060] bg-[#fffce0] px-[18px] py-4 text-left">
          <div className="mb-1.5 text-[12px] font-bold leading-[normal] text-[#7a6a00]">Note sulla distribuzione</div>
          <div className="text-[12px] font-medium leading-[1.6] text-[#7a6a00]">
            Reglo declina ogni responsabilità per distribuzioni improprie del codice che comportino l&apos;esposizione
            dei dati di accesso a terzi:{" "}
            <strong>la corretta gestione e custodia del materiale è a esclusivo carico dell&apos;utilizzatore</strong>.
            In caso di accessi non autorizzati,{" "}
            <strong>il team Reglo è disponibile a intervenire tempestivamente</strong> per assistere e supportare
            nella risoluzione del problema.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
