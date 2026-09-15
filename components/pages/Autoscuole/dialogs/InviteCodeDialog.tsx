"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { instructorInitials } from "@/lib/autoscuole/instructor-initials";

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
  const [keysOpen, setKeysOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) setKeysOpen(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="invite-code-dialog"
        onEscapeKeyDown={(e) => {
          // Esc chiude prima il pannello delle chiavi, poi il dialog.
          if (keysOpen) {
            e.preventDefault();
            setKeysOpen(false);
          }
        }}
        className={cn(
          "block w-[512px] max-w-[calc(100vw-32px)] overflow-visible rounded-[20px] border-0 p-0 text-center shadow-[rgba(0,0,0,0.18)_0_8px_32px_0] transition-[margin-left] duration-300 ease-out",
          // Pannello affiancato: la coppia dialog + pannello resta centrata (340 + 16 di stacco = 178 per lato).
          keysOpen && "min-[960px]:-ml-[178px]",
        )}
      >
        <div className="max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[20px] px-5 pb-6 pt-8 sm:px-9 sm:pb-8 sm:pt-10">
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
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-[12px] border border-[#dddddd] bg-[#f7f7f7] px-3.5 py-3.5 sm:px-[18px]",
              instructorKeys.length > 0 ? "mb-2.5" : "mb-7",
            )}
          >
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

          {/* Chiavi istruttori autonomi: una riga compatta, la lista si apre nel pannello affiancato */}
          {instructorKeys.length > 0 && (
            <button
              type="button"
              data-testid="instructor-keys-toggle"
              aria-expanded={keysOpen}
              aria-controls="instructor-keys-panel"
              onClick={() => setKeysOpen((v) => !v)}
              className={cn(
                "mb-7 flex w-full cursor-pointer select-none items-center gap-3 rounded-[12px] border bg-white px-3.5 py-3 text-left transition-[border-color,background] duration-150 sm:px-[18px]",
                keysOpen ? "border-[#222222] bg-[#f7f7f7]" : "border-[#dddddd] hover:border-[#b0b0b0] hover:bg-[#fafafa]",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold leading-[normal] text-[#222222]">Chiavi istruttori autonomi</div>
                <div className="mt-[3px] truncate text-[12px] font-medium leading-[normal] text-[#929292]">
                  Chi le usa viene assegnato direttamente all&apos;istruttore
                </div>
              </div>
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#ececf0] px-2 text-[12px] font-semibold leading-none text-[#222222] [font-variant-numeric:tabular-nums]">
                {instructorKeys.length}
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6a6a6a"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={cn("shrink-0 transition-transform duration-200", keysOpen && "min-[960px]:rotate-180")}
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
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
        </div>

        {keysOpen && instructorKeys.length > 0 && (
          <InstructorKeysPanel
            instructors={instructorKeys}
            copiedCode={copiedCode}
            onCopy={onCopy}
            onClose={() => setKeysOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InstructorKeysPanel({
  instructors,
  copiedCode,
  onCopy,
  onClose,
}: {
  instructors: AutonomousInstructor[];
  copiedCode: string | null;
  onCopy: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const list = q
    ? instructors.filter((i) => i.name.toLowerCase().includes(q) || (i.inviteCode ?? "").toLowerCase().includes(q))
    : instructors;

  return (
    <div
      id="instructor-keys-panel"
      role="region"
      aria-label="Chiavi istruttori autonomi"
      data-testid="instructor-keys-panel"
      className={cn(
        "absolute inset-0 z-10 flex flex-col overflow-hidden rounded-[20px] bg-white text-left",
        "animate-in fade-in-0 duration-200",
        // Da 960px il pannello si affianca al dialog invece di coprirlo.
        "min-[960px]:inset-auto min-[960px]:left-[calc(100%+16px)] min-[960px]:top-0 min-[960px]:max-h-full min-[960px]:w-[340px] min-[960px]:shadow-[rgba(0,0,0,0.18)_0_8px_32px_0] min-[960px]:slide-in-from-left-3",
      )}
    >
      <div className="relative shrink-0 px-6 pb-4 pt-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi le chiavi istruttori"
          className="reglo-focus-ring absolute right-4 top-4 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="#222" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="pr-10 text-[17px] font-bold leading-[normal] tracking-[-0.2px] text-[#222222]">
          Chiavi istruttori
        </div>
        <p className="mt-1.5 text-[12px] font-medium leading-[1.5] text-[#6a6a6a]">
          Chi si registra con la chiave di un istruttore viene iscritto all&apos;autoscuola e assegnato direttamente a
          lui.
        </p>
        {instructors.length > 6 && (
          <label className="mt-4 flex h-10 items-center gap-2 rounded-[10px] border border-[#dddddd] bg-white px-3 transition-colors focus-within:border-[#222222]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#929292" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca istruttore o codice"
              aria-label="Cerca istruttore o codice"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#222222] outline-none placeholder:text-[#a8a8a8] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Svuota la ricerca"
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#dddddd] transition-colors hover:bg-[#cfcfd6]"
              >
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2 2l8 8M10 2l-8 8" stroke="#222" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#ececf0] px-3 py-2">
        {list.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] font-medium text-[#929292]">Nessun istruttore trovato</div>
        ) : (
          list.map((instr) => (
            <div
              key={instr.id}
              data-testid="instructor-key-row"
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-[#f7f7f7]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d9f2f4] text-[12.5px] font-bold leading-none text-[#0e7490]">
                {instructorInitials(instr.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold leading-[normal] text-[#222222]">{instr.name}</div>
                <div className="mt-[3px] text-[12px] font-semibold leading-[normal] tracking-[1.5px] text-[#6a6a6a] [font-variant-numeric:tabular-nums]">
                  {instr.inviteCode}
                </div>
              </div>
              <button type="button" onClick={() => onCopy(instr.inviteCode!)} className={CHIP_BUTTON}>
                {copiedCode === instr.inviteCode ? "Copiato ✓" : "Copia"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
