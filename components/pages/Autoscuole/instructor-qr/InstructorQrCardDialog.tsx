"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  InstructorQrCard,
  QR_CARD_FILMS,
  type QrCardFormat,
} from "@/components/pages/Autoscuole/instructor-qr/InstructorQrCard";

// REG-451 — anteprima "Card QR — <istruttore>" (prototipo `QR Istruttore.html`):
// formato verticale/orizzontale, sfondo da film, Scarica PNG (A4 794×1123 @2x
// con linee di taglio) e Stampa (A4, stessa pagina).

const SHEET_W = 794;
const SHEET_H = 1123;
const PRINT_SHEET_ID = "__print-sheet";

const PRINT_CSS = `@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #ffffff !important; }
  body > *:not(#${PRINT_SHEET_ID}) { display: none !important; }
  #${PRINT_SHEET_ID} { display: block !important; }
  /* Chrome stampa senza "Grafica in background" di default: senza questo spariscono
     sfondo navy, foto e riquadro bianco del QR e il testo bianco resta su bianco. */
  #${PRINT_SHEET_ID}, #${PRINT_SHEET_ID} * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}`;

export function InstructorQrCardDialog({
  open,
  onClose,
  instructorName,
  companyName,
  code,
  qrValue,
}: {
  open: boolean;
  onClose: () => void;
  instructorName: string;
  companyName: string;
  code: string;
  qrValue: string;
}) {
  const [format, setFormat] = React.useState<QrCardFormat>("vert");
  const [filmKey, setFilmKey] = React.useState(QR_CARD_FILMS[0].key);
  const [downloadLabel, setDownloadLabel] = React.useState("Scarica PNG");
  const [wrapSize, setWrapSize] = React.useState<{ w: number; h: number } | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);

  const film = QR_CARD_FILMS.find((f) => f.key === filmKey) ?? QR_CARD_FILMS[0];

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Il prototipo scala la card per stare nel riquadro: min(0.72, h/cardH, w/cardW).
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!open || !el) return;
    const measure = () => setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const cardH = format === "horiz" ? 380 : 660;
  const cardW = format === "horiz" ? 600 : 340;
  const wh = wrapSize?.h ?? 470;
  const ww = wrapSize?.w ?? 560;
  const scale = Math.min(0.72, (wh - 8) / cardH, (ww - 8) / cardW);

  const makeSheetClone = () => {
    const src = sheetRef.current;
    if (!src) return null;
    const clone = src.cloneNode(true) as HTMLDivElement;
    clone.removeAttribute("data-testid");
    Object.assign(clone.style, {
      transform: "none",
      position: "static",
      width: "210mm",
      height: "297mm",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20mm",
      boxShadow: "none",
      borderRadius: "0",
      background: "#ffffff",
    });
    clone.querySelectorAll<HTMLElement>("[data-print-only]").forEach((n) => {
      n.style.display = "flex";
    });
    const inner = clone.querySelector<HTMLElement>("[data-print-only]")?.parentElement;
    if (inner) inner.style.padding = "26px";
    return clone;
  };

  const printCard = () => {
    const clone = makeSheetClone();
    if (!clone) return;
    document.getElementById(PRINT_SHEET_ID)?.remove();
    const wrap = document.createElement("div");
    wrap.id = PRINT_SHEET_ID;
    wrap.style.cssText = "display:none;width:210mm;height:297mm;overflow:hidden;";
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const done = () => {
      wrap.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 50);
  };

  const downloadPng = async () => {
    const clone = makeSheetClone();
    if (!clone) return;
    clone.style.width = `${SHEET_W}px`;
    clone.style.height = `${SHEET_H}px`;
    const host = document.createElement("div");
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${SHEET_W}px;height:${SHEET_H}px;overflow:hidden;background:#fff;`;
    host.appendChild(clone);
    document.body.appendChild(host);
    setDownloadLabel("Preparo…");
    try {
      const { toPng } = await import("html-to-image");
      await new Promise((r) => setTimeout(r, 120));
      const url = await toPng(clone, {
        pixelRatio: 2,
        cacheBust: true,
        width: SHEET_W,
        height: SHEET_H,
        backgroundColor: "#ffffff",
      });
      host.remove();
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reglo - QR ${instructorName}.png`;
      a.click();
      setDownloadLabel("Scaricato ✓");
    } catch {
      host.remove();
      setDownloadLabel("Errore, riprova");
    }
    setTimeout(() => setDownloadLabel("Scarica PNG"), 1800);
  };

  const segClass = (selected: boolean) =>
    cn(
      "flex-1 cursor-pointer select-none rounded-[9px] px-2 py-[9px] text-center text-[13px] leading-[normal] transition-all duration-[120ms]",
      selected
        ? "bg-white font-semibold text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
        : "bg-transparent font-medium text-[#6a6a6a]",
    );

  const cutLabel = "absolute items-center gap-1.5 bg-white px-2.5 text-[12px] font-bold uppercase tracking-[0.4px] text-[#6f6f7c]";

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/[0.32] p-6"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Card QR — ${instructorName}`}
          data-testid="qr-card-dialog"
          className="relative flex max-h-[calc(100vh-48px)] w-[640px] max-w-[90vw] flex-col gap-[18px] overflow-hidden rounded-[20px] bg-white px-9 pb-8 pt-10 shadow-[rgba(0,0,0,0.18)_0_8px_32px_0]"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="absolute right-5 top-5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-[background] duration-150"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="#222" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <div className="text-center text-[22px] font-bold leading-[normal] tracking-[-0.3px] text-[#222222]">
            Card QR — {instructorName}
          </div>

          <div className="flex w-[328px] gap-1 self-center rounded-[12px] bg-[#f0f0f2] p-1">
            <button type="button" onClick={() => setFormat("vert")} className={segClass(format === "vert")}>
              Verticale
            </button>
            <button type="button" onClick={() => setFormat("horiz")} className={segClass(format === "horiz")}>
              Orizzontale
            </button>
          </div>

          <div className="flex justify-center gap-2">
            {QR_CARD_FILMS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-label={`${f.title} · ${f.year}`}
                aria-pressed={f.key === film.key}
                onClick={() => setFilmKey(f.key)}
                className={cn(
                  "flex w-14 cursor-pointer select-none transition-all duration-150",
                  f.key === film.key ? "opacity-100" : "opacity-65",
                )}
              >
                <span
                  className={cn(
                    "block h-[38px] w-14 overflow-hidden rounded-[8px] border-2 bg-cover bg-center",
                    f.key === film.key ? "border-[#1a1a2e]" : "border-transparent",
                  )}
                  style={{ backgroundImage: `url(${f.src})` }}
                />
              </button>
            ))}
          </div>

          <div className="-mt-2.5 text-center text-[12px] font-medium leading-[normal] text-[#929292]">
            {film.title} · {film.year}
          </div>

          <div
            ref={wrapRef}
            className="flex h-[470px] max-h-[470px] min-h-0 flex-[1_1_auto] items-center justify-center overflow-hidden"
          >
            <div
              ref={sheetRef}
              data-testid="qr-card-sheet"
              className="flex items-center justify-center bg-white p-0"
              style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
            >
              <div className="relative p-0">
                <div data-print-only="1" className="absolute inset-0 hidden rounded-[26px] border-2 border-dashed border-[#b9b9c6]" />
                <div data-print-only="1" className={cn(cutLabel, "-top-3 left-10 hidden")}>
                  <span className="inline-block text-[16px] leading-none" style={{ transform: "scaleX(-1)" }}>
                    ✂️
                  </span>
                  taglia qui
                </div>
                <div data-print-only="1" className={cn(cutLabel, "-bottom-3 right-10 hidden")}>
                  <span className="text-[16px] leading-none">✂️</span>
                  taglia qui
                </div>
                <InstructorQrCard
                  format={format}
                  film={film}
                  instructorName={instructorName}
                  companyName={companyName}
                  code={code}
                  qrValue={qrValue}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void downloadPng()}
              className="flex h-[46px] cursor-pointer select-none items-center justify-center gap-2 rounded-[12px] bg-[#1a1a2e] px-[26px] text-[14px] font-semibold leading-[normal] text-white transition-[background] duration-150 hover:bg-[#2b2b45]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M4 21h16" />
              </svg>
              {downloadLabel}
            </button>
            <button
              type="button"
              onClick={printCard}
              className="flex h-12 cursor-pointer select-none items-center justify-center gap-2 rounded-[12px] border border-[#cfcfdc] bg-[#eeeef4] px-[26px] text-[14px] font-semibold leading-[normal] text-[#1a1a2e] transition-[background] duration-150 hover:bg-[#e2e2ea]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 8V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V8" />
                <path d="M7 16H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                <rect x="7" y="13" width="10" height="8" rx="1.5" />
              </svg>
              Stampa
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
