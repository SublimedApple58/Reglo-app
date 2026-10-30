"use client";

import * as React from "react";

import { roadCarImages, roadMarkerSymbol } from "@/lib/autoscuole/road/symbols";
import { cn } from "@/lib/utils";

/**
 * Pezzi condivisi delle viste Road (Dal vivo, Guide di oggi, Storico,
 * dettaglio). Misure e colori 1:1 dal prototipo approvato `proto/web.html`.
 */

// ─── formattazione ──────────────────────────────────────────────────────────

const TZ = "Europe/Rome";
const pad = (n: number) => String(n).padStart(2, "0");

export function hhmm(iso: string | Date) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** «lun 27 ott» */
export function shortDay(iso: string | Date) {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value.replace(".", "") ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** «Lunedì 27 ottobre» */
export function longDay(iso: string | Date) {
  const s = new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** YYYY-MM-DD del giorno italiano (per il deep link dell'agenda). */
export function romeYmd(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

/** km con la virgola italiana: 6,3 */
export function km(meters: number) {
  return (meters / 1000).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function minutesBetween(fromIso: string, to: number) {
  return Math.max(0, Math.floor((to - new Date(fromIso).getTime()) / 60000));
}

export function durationMin(sec: number) {
  return Math.max(0, Math.round(sec / 60));
}

/** Targa italiana leggibile: GA123AA → GA 123 AA */
export function formatPlate(plate: string | null | undefined) {
  if (!plate) return "";
  const p = plate.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}` : plate;
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** «Marco · Giulia B.» — etichetta dell'auto sulla mappa. */
export function carLabel(instructor: string | null | undefined, student: string | null | undefined) {
  const s = (student ?? "").trim().split(/\s+/).filter(Boolean);
  const studentShort = s.length > 1 ? `${s[0]} ${s[s.length - 1][0]}.` : (s[0] ?? "");
  return [firstName(instructor), studentShort].filter(Boolean).join(" · ");
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Tinte di riserva per gli istruttori senza colore scelto (stesse dell'agenda).
const FALLBACK_TINTS = ["#F97316", "#8B5CF6", "#10B981", "#0EA5E9", "#EC4899", "#F59E0B", "#14B8A6", "#6366F1"];

export function instructorTint(instructor: { id: string; color: string | null } | null | undefined) {
  if (instructor?.color && /^#[0-9a-f]{6}$/i.test(instructor.color)) return instructor.color;
  const id = instructor?.id ?? "";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_TINTS[h % FALLBACK_TINTS.length];
}

export { pad };

// ─── componenti ─────────────────────────────────────────────────────────────

/** Pallino rosso «dal vivo». */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full bg-[#e5484d] shadow-[0_0_0_3px_rgba(229,72,77,0.16)]",
        className,
      )}
    />
  );
}

/** Auto 3D 3/4 nel colore del veicolo, con il badge iniziali nella tinta dell'istruttore. */
export function Car3D({ color, tint, label }: { color?: string | null; tint?: string; label?: string }) {
  return (
    <div className="relative w-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={roadCarImages(color).threeQuarter} alt="" className="block w-16" draggable={false} />
      {tint && label ? (
        <div
          className="absolute -bottom-0.5 -right-1 grid size-6 place-items-center rounded-full border-2 border-white text-[10.5px] font-semibold text-white"
          style={{ background: tint }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

export function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6a6a6a" strokeWidth="2.2" aria-hidden>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    </svg>
  );
}

export const SENTIMENT_GOOD = "#16a34a";
export const SENTIMENT_BAD = "#dc2626";

/** Pollice bianco nel pallino verde/rosso (segno della segnalazione). */
export function SentimentBadge({ sentiment, className }: { sentiment: "good" | "bad"; className?: string }) {
  return (
    <span
      aria-label={sentiment === "good" ? "Fatto bene" : "Da migliorare"}
      className={cn("grid size-[18px] place-items-center rounded-full border-2 border-white", className)}
      style={{ background: sentiment === "good" ? SENTIMENT_GOOD : SENTIMENT_BAD }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={sentiment === "bad" ? { transform: "rotate(180deg)" } : undefined}
      >
        <path d="M7 11v9M7 11l4-8a2 2 0 0 1 3 2l-1 5h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" />
      </svg>
    </span>
  );
}

/** «1 positiva · 2 da migliorare» (niente se nessuna segnalazione ha il segno). */
export function SentimentCounts({ good, bad, className }: { good: number; bad: number; className?: string }) {
  if (!good && !bad) return null;
  return (
    <div className={cn("flex items-center gap-3.5 text-[13px] text-[#3a3a3c]", className)}>
      {good ? (
        <span className="flex items-center gap-1.5">
          <i className="block size-[7px] rounded-full" style={{ background: SENTIMENT_GOOD }} />
          {good} {good === 1 ? "positiva" : "positive"}
        </span>
      ) : null}
      {bad ? (
        <span className="flex items-center gap-1.5">
          <i className="block size-[7px] rounded-full" style={{ background: SENTIMENT_BAD }} />
          {bad} da migliorare
        </span>
      ) : null}
    </div>
  );
}

/** Pillola segnalazioni: ultimi simboli + conteggio, oppure «Nessuna» verde. */
export function MarkerPill({
  count,
  kinds,
  good = 0,
  bad = 0,
}: {
  count: number;
  kinds: string[];
  good?: number;
  bad?: number;
}) {
  if (!count) {
    return (
      <span className="inline-flex h-[26px] items-center rounded-[13px] bg-[#e6f6ec] px-2.5 text-[12.5px] font-semibold text-[#067647]">
        Nessuna
      </span>
    );
  }
  const shown: string[] = [];
  for (const k of [...kinds].reverse()) {
    const src = roadMarkerSymbol(k);
    if (!shown.includes(src)) shown.unshift(src);
    if (shown.length === 3) break;
  }
  return (
    <span className="inline-flex h-[26px] items-center gap-[3px] rounded-[13px] bg-[#fff0e6] pl-[5px] pr-[9px] text-[12.5px] font-semibold text-[#8a3a0c]">
      {shown.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" className="size-[18px] object-contain" draggable={false} />
      ))}
      {good || bad ? (
        <span className="ml-0.5 flex items-center gap-1.5 tabular-nums">
          {good ? (
            <span className="flex items-center gap-1">
              <i className="block size-[6px] rounded-full" style={{ background: SENTIMENT_GOOD }} />
              {good}
            </span>
          ) : null}
          {bad ? (
            <span className="flex items-center gap-1">
              <i className="block size-[6px] rounded-full" style={{ background: SENTIMENT_BAD }} />
              {bad}
            </span>
          ) : null}
        </span>
      ) : (
        count
      )}
    </span>
  );
}

/** Simbolo 3D su fondo grigio caldo (liste segnalazioni). */
export function SymbolTile({
  kind,
  size = 34,
  sentiment,
}: {
  kind: string;
  size?: 34 | 40;
  sentiment?: "good" | "bad" | null;
}) {
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center bg-[#f4f4f2]",
        size === 40 ? "size-10 rounded-[13px]" : "size-[34px] rounded-[11px]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={roadMarkerSymbol(kind)}
        alt=""
        className={cn("object-contain", size === 40 ? "size-7" : "size-6")}
        draggable={false}
      />
      {sentiment ? <SentimentBadge sentiment={sentiment} className="absolute -bottom-1 -right-1" /> : null}
    </div>
  );
}

export type RoadStatusKind = "todo" | "live" | "done" | "missed" | "auto";

export function RoadStatusChip({ kind }: { kind: RoadStatusKind }) {
  const base = "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[14px] px-3 text-[13px] font-semibold";
  if (kind === "live")
    return (
      <span className={cn(base, "bg-[#f2f2f2] text-[#111111]")}>
        <LiveDot />
        In corso
      </span>
    );
  if (kind === "done")
    return (
      <span className={cn(base, "bg-[#e6f6ec] text-[#067647]")}>
        <span aria-hidden className="size-2 rounded-full bg-[#067647]" />
        Completata
      </span>
    );
  if (kind === "auto") return <span className={cn(base, "bg-[#f2f2f2] text-[#555]")}>Chiusa in automatico</span>;
  if (kind === "missed") return <span className={cn(base, "bg-[#f2f2f2] text-[#6a6a6a]")}>Non registrata</span>;
  return <span className={cn(base, "bg-[#f2f2f2] text-[#555]")}>Da iniziare</span>;
}

/** Zoom +/− in basso a destra, sopra l'attribuzione della mappa. */
export function ZoomControls({ onIn, onOut }: { onIn: () => void; onOut: () => void }) {
  return (
    <div className="absolute bottom-11 right-4 z-[3] grid w-11 overflow-hidden rounded-[14px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)]">
      <button
        type="button"
        aria-label="Avvicina"
        onClick={onIn}
        className="grid h-11 cursor-pointer place-items-center text-xl text-[#333] transition-colors hover:bg-[#f7f7f7]"
      >
        +
      </button>
      <button
        type="button"
        aria-label="Allontana"
        onClick={onOut}
        className="grid h-11 cursor-pointer place-items-center border-t border-[#eee] text-xl text-[#333] transition-colors hover:bg-[#f7f7f7]"
      >
        –
      </button>
    </div>
  );
}

/**
 * Contenitore della mappa: angoli 24px, bordo chiaro, attribuzione
 * OpenFreeMap/OpenStreetMap sempre visibile ma sobria (piccola, fondo bianco
 * semitrasparente), e gli stili dei marker HTML (`.road-*`).
 */
export const ROAD_MAP_BOX_CLASS = cn(
  "relative overflow-hidden rounded-[24px] border border-[#ebebeb] bg-[#F4F1EA]",
  "[&_.maplibregl-ctrl-attrib]:!m-2 [&_.maplibregl-ctrl-attrib]:!rounded-[10px] [&_.maplibregl-ctrl-attrib]:!bg-white/80",
  "[&_.maplibregl-ctrl-attrib]:!text-[10.5px] [&_.maplibregl-ctrl-attrib]:!leading-[16px] [&_.maplibregl-ctrl-attrib]:!text-[#555]",
  "[&_.maplibregl-ctrl-attrib_a]:!text-[#555]",
);

/** CSS dei marker HTML della mappa (come `.wcar/.wlab/.wsg/.sede` del prototipo). */
export function RoadMarkerStyles() {
  return (
    <style>{`
.road-car{width:0;height:0}
.road-car .halo{position:absolute;left:-40px;top:-40px;width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,rgba(17,17,17,.16) 0%,rgba(17,17,17,.06) 45%,rgba(17,17,17,0) 70%);pointer-events:none}
.road-car .body{position:absolute;left:-15px;top:-23px;width:30px;height:46px;cursor:pointer}
.road-car .body img{width:30px;display:block;filter:drop-shadow(0 4px 4px rgba(0,0,0,.28))}
.road-car .lab{position:absolute;left:0;top:-42px;transform:translate(-50%,-50%);white-space:nowrap;height:30px;padding:0 11px 0 4px;border-radius:15px;background:#fff;display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08),0 6px 16px rgba(0,0,0,.14);color:#111;cursor:pointer;font-family:inherit}
.road-car .lab i{width:22px;height:22px;border-radius:50%;color:#fff;font-style:normal;font-size:9.5px;font-weight:600;display:grid;place-items:center}
.road-car.sel .lab{background:#111;color:#fff;z-index:2}
.road-sg{width:34px;height:34px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.16)}
.road-sg img{width:24px;height:24px;object-fit:contain}
.road-sg.good{box-shadow:0 0 0 2.5px #16a34a,0 2px 8px rgba(0,0,0,.16)}
.road-sg.bad{box-shadow:0 0 0 2.5px #dc2626,0 2px 8px rgba(0,0,0,.16)}
.road-num{display:flex;align-items:center;gap:4px;transform:translateY(-22px)}
.road-num b{width:26px;height:26px;border-radius:50%;background:#111;color:#fff;font-size:12.5px;font-weight:600;display:grid;place-items:center;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:inherit}
.road-sede{display:flex;flex-direction:column;align-items:center}
.road-sede img{width:58px;filter:drop-shadow(0 6px 8px rgba(0,0,0,.2))}
.road-sede.small img{width:46px}
.road-sede span{margin-top:-2px;height:26px;padding:0 10px;border-radius:13px;background:#111;color:#fff;font-size:12px;font-weight:600;display:grid;place-items:center;white-space:nowrap;font-family:inherit}
.road-start{width:14px;height:14px;border-radius:50%;background:#fff;border:4px solid #111;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.road-stop{width:12px;height:12px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.road-luogo{display:flex;flex-direction:column;align-items:center;transform:translateY(15px);pointer-events:none}
.road-luogo .pin{width:30px;height:30px;border-radius:50%;background:#fff;color:#3a3a3a;display:grid;place-items:center;box-shadow:0 0 0 1.5px rgba(17,17,17,.1),0 2px 8px rgba(0,0,0,.16)}
.road-luogo .pin svg{width:16px;height:16px}
.road-luogo span{margin-top:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;height:22px;line-height:22px;padding:0 9px;border-radius:11px;background:rgba(255,255,255,.94);color:#3a3a3a;font-size:11.5px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.12);font-family:inherit}
.road-start-lab{transform:translateY(-16px);height:26px;line-height:26px;padding:0 10px;border-radius:13px;background:#fff;color:#111;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.14);font-family:inherit}
`}</style>
  );
}

export function RoadMapFallback({ failed }: { failed: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-[13.5px] text-[#6a6a6a]">
      {failed ? "Mappa non disponibile in questo momento." : null}
    </div>
  );
}
