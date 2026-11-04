"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LocationInviteCode } from "@/lib/actions/autoscuole-location-invites.actions";

// Dialog "Chiave di accesso" (REG-407): replica 1:1 del prototipo
// `Chiave di accesso.html` (Ruzzu) — misure, colori e copy presi dal file.

const QR_PDF_HREF = "/file/reglo-scarica-app.pdf";
const QR_PDF_NAME = "Reglo - Scarica l'app.pdf";
const INSTRUCTORS_HREF = "/user/autoscuole?tab=settings&pane=instructors";

const KEY_PATH =
  "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z";

const CHIP_BUTTON =
  "flex h-8 min-w-[72px] shrink-0 cursor-pointer select-none items-center justify-center rounded-[8px] border border-[#d4d4d4] bg-[#f0f0f0] px-3 text-[13px] font-semibold text-[#111111] transition-[background] duration-150 hover:bg-[#e6e6e6]";

type AutonomousInstructor = { id: string; name: string; inviteCode: string | null };

/** REG-706: codici per luogo. `null` = non ancora caricati (la sezione non c'è). */
export type LocationInviteCodes = { enabled: boolean; locations: LocationInviteCode[] } | null;

// Stati sovrapposti nella stessa cella: si incrociano in 200 ms (opacità +
// sfocatura per il codice, opacità + spostamento di 4px per l'etichetta).
const STACK = "[grid-area:1/1]";
const FADE = "transition-[opacity,filter] duration-200 ease-out";
const SLIDE = "transition-[opacity,transform] duration-200 ease-out";

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.1 12.3a1 1 0 0 1 0-.6C3.5 7.9 7.4 5 12 5s8.5 2.9 9.9 6.7a1 1 0 0 1 0 .6C20.5 16.1 16.6 19 12 19s-8.5-2.9-9.9-6.7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="8" width="13" height="13" rx="2.5" />
      <path d="M5 16a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// Una riga: codice nascosto (sei punti) finché non si preme «Mostra»; poi lo
// stesso bottone copia, e per 1,6 s dice «Copiato».
function LocationCodeRow({ location }: { location: LocationInviteCode }) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const code = location.code;
  const onPress = () => {
    if (!code) return;
    if (!revealed) {
      setRevealed(true);
      return;
    }
    navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  const step = !revealed ? 0 : copied ? 2 : 1;
  const label = (index: number) =>
    cn(
      STACK,
      SLIDE,
      "inline-flex items-center justify-center gap-1.5",
      step === index ? "translate-y-0 opacity-100" : step > index ? "-translate-y-1 opacity-0" : "translate-y-1 opacity-0",
    );

  return (
    <div data-testid="location-invite-row" className="flex min-h-[62px] items-center gap-3.5 py-3 pl-4 pr-3 border-t border-[#ededed] first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold leading-[normal] text-[#222222]">{location.name}</div>
        {location.address && (
          <div className="mt-0.5 truncate text-[12px] font-medium leading-[normal] text-[#929292]">{location.address}</div>
        )}
      </div>
      <div className="grid h-6 w-24 shrink-0 items-center justify-items-end">
        <span aria-hidden className={cn(STACK, FADE, "flex gap-1.5", revealed ? "opacity-0 blur-[3px]" : "opacity-100 blur-0")}>
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} className="block size-1.5 rounded-full bg-[#c9c9c9]" />
          ))}
        </span>
        <span
          data-testid="location-invite-code"
          aria-hidden={!revealed}
          className={cn(
            STACK,
            FADE,
            "text-[15px] font-semibold leading-[normal] tracking-[1.6px] text-[#222222]",
            revealed ? "opacity-100 blur-0" : "select-none opacity-0 blur-[3px]",
          )}
        >
          {revealed ? code : "······"}
        </span>
      </div>
      <button
        type="button"
        data-testid="location-invite-button"
        disabled={!code}
        onClick={onPress}
        aria-label={!revealed ? `Mostra il codice di ${location.name}` : `Copia il codice di ${location.name}`}
        className={cn(CHIP_BUTTON, "grid w-24 min-w-0 overflow-hidden disabled:cursor-default disabled:opacity-50")}
      >
        <span aria-hidden className={label(0)}>
          <EyeIcon />
          Mostra
        </span>
        <span aria-hidden className={label(1)}>
          <CopyIcon />
          Copia
        </span>
        <span aria-hidden className={label(2)}>
          <CheckIcon />
          Copiato
        </span>
      </button>
    </div>
  );
}

function LocationCodesSection({ locations }: { locations: LocationInviteCode[] }) {
  return (
    <div data-testid="location-invite-codes" className="mb-7 text-left animate-in fade-in-0 duration-200">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold leading-[normal] text-[#222222]">Codici per luogo</span>
        <span className="text-[12px] font-medium leading-[normal] text-[#929292]">
          {locations.length} {locations.length === 1 ? "luogo" : "luoghi"}
        </span>
      </div>
      <div className="mb-3 text-[12px] font-medium leading-[1.5] text-[#6a6a6a]">
        Chi si registra con il codice di un luogo vede solo le disponibilità di quel luogo.
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[#dddddd] bg-white">
        {locations.map((location) => (
          <LocationCodeRow key={location.id} location={location} />
        ))}
      </div>
    </div>
  );
}

export function InviteCodeDialog({
  open,
  onOpenChange,
  inviteCode,
  autonomousInstructors,
  copiedCode,
  onCopy,
  locationCodes = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteCode: string | null;
  autonomousInstructors: AutonomousInstructor[];
  copiedCode: string | null;
  onCopy: (code: string) => void;
  locationCodes?: LocationInviteCodes;
}) {
  const router = useRouter();
  const hasInstructorKeys = autonomousInstructors.some((instr) => instr.inviteCode);

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

        {/* Chiavi dei singoli istruttori: si consultano nel dettaglio istruttore (scheda Codice) */}
        {hasInstructorKeys && (
          <button
            type="button"
            data-testid="instructor-keys-link"
            onClick={() => {
              onOpenChange(false);
              router.push(INSTRUCTORS_HREF);
            }}
            className="group -mt-4 mb-7 block w-full cursor-pointer select-none text-center text-[13px] font-medium leading-[1.5] text-[#6a6a6a]"
          >
            Per consultare le chiavi dei singoli istruttori vai nella{" "}
            <span className="font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-all group-hover:decoration-2">
              sezione Istruttori
            </span>
          </button>
        )}

        {/* REG-706: codici per luogo, solo con «Disponibilità per luogo» accesa */}
        {locationCodes?.enabled && locationCodes.locations.length > 0 && (
          <LocationCodesSection locations={locationCodes.locations} />
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
              stroke="#111111"
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
