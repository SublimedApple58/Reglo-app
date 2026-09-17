"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { instructorInitials } from "@/lib/autoscuole/instructor-initials";

// REG-451 — card QR dell'istruttore, replica del prototipo `QR Istruttore.html`.
// Nel prototipo non c'è box-sizing: border-box, quindi le larghezze qui sono
// quelle RENDERIZZATE (es. verticale 340 di contenuto + 26×2 di padding = 392).

export type QrCardFormat = "vert" | "horiz";

export type QrCardFilm = {
  key: string;
  src: string;
  title: string;
  year: string;
  /** background-position nella card verticale e in quella orizzontale. */
  posV: string;
  posH: string;
};

export const QR_CARD_FILMS: QrCardFilm[] = [
  { key: "goldfinger", src: "/images/qr-card/film-goldfinger.jpg", title: "Goldfinger", year: "1964", posV: "50% 62%", posH: "42% 60%" },
  { key: "fast", src: "/images/qr-card/film-fast.jpg", title: "Fast & Furious", year: "2001", posV: "50% 58%", posH: "68% 58%" },
  { key: "bttf", src: "/images/qr-card/film-bttf.jpg", title: "Ritorno al futuro", year: "1985", posV: "45% 62%", posH: "38% 58%" },
  { key: "wolf", src: "/images/qr-card/film-wolf.jpg", title: "The Wolf of Wall Street", year: "2013", posV: "50% 62%", posH: "58% 62%" },
  { key: "scarface", src: "/images/qr-card/film-scarface.jpg", title: "Scarface", year: "1983", posV: "50% 68%", posH: "42% 62%" },
  { key: "batman", src: "/images/qr-card/film-batman.jpg", title: "Batman Begins", year: "2005", posV: "58% 58%", posH: "62% 55%" },
];

const NAVY = "#111111";
const FADE_V =
  "linear-gradient(180deg, rgba(17, 17, 17,0.55) 0%, rgba(17, 17, 17,0) 30%, rgba(17, 17, 17,0) 62%, #111111 100%)";
const FADE_H = `linear-gradient(90deg, rgba(17, 17, 17,0) 30%, rgba(17, 17, 17,0.18) 48%, rgba(17, 17, 17,0.45) 64%, rgba(17, 17, 17,0.75) 80%, rgba(17, 17, 17,0.94) 92%, #111111 100%), ${FADE_V}`;

function Mark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/qr-card/reglo-mark.png"
      alt=""
      className="block size-[22px] object-contain"
      style={{ filter: "brightness(0) invert(1)" }}
    />
  );
}

/** Figtree non ha "→": il prototipo lo prende da -apple-system, next/font da
 *  "Figtree Fallback" (Arial, freccia lunga) — forziamo il fallback di sistema. */
function Arrow() {
  return <span style={{ fontFamily: "-apple-system, system-ui, sans-serif" }}>→</span>;
}

function RolePill() {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-white/45 bg-[rgba(17, 17, 17,0.35)] px-2.5 text-[10px] font-bold uppercase leading-none tracking-[1.2px] text-white">
      Istruttore
    </span>
  );
}

function Qr({ value, size }: { value: string; size: number }) {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} bgColor="#ffffff" fgColor="#000000" shapeRendering="crispEdges" />
    </div>
  );
}

export function InstructorQrCard({
  format,
  film,
  instructorName,
  companyName,
  code,
  qrValue,
}: {
  format: QrCardFormat;
  film: QrCardFilm;
  instructorName: string;
  companyName: string;
  code: string;
  qrValue: string;
}) {
  const initials = instructorInitials(instructorName);

  if (format === "horiz") {
    return (
      <div
        data-testid="qr-card-horiz"
        className="relative grid h-[380px] w-[600px] grid-cols-[300px_1fr] overflow-hidden rounded-[22px] text-white"
        style={{ background: NAVY }}
      >
        <div className="relative z-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-no-repeat"
            style={{ backgroundImage: `url(${film.src})`, backgroundPosition: film.posH }}
          />
          <div className="absolute inset-0" style={{ background: FADE_H }} />
          <div className="absolute left-5 right-5 top-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mark />
            </div>
            <RolePill />
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#d9f2f4] text-[17px] font-extrabold leading-[normal] tracking-[-0.5px] text-[#0e7490] shadow-[0_0_0_3px_rgba(255,255,255,0.18)]">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-extrabold leading-[1.1] tracking-[-0.3px] [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
                {instructorName}
              </div>
              <div className="mt-[3px] text-[12px] font-medium leading-[normal] text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
                {companyName}
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-[1] flex flex-col">
          <div className="relative mx-4 mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-[16px] bg-white p-4">
            <Qr value={qrValue} size={176} />
            <div className="text-[12px] font-bold leading-[normal] tracking-[2.6px] text-[#222222]">{code}</div>
          </div>
          <div className="relative pb-5 pl-5 pr-[22px] pt-[18px]">
            <div className="text-[15px] font-bold leading-[1.2] tracking-[-0.1px]">Inquadra per associarti</div>
            <div className="mt-[5px] text-[11.5px] font-medium leading-[1.5] text-white/[0.72]">
              Apri l’app Reglo <Arrow /> Profilo <Arrow /> “Scansiona QR”. Sarò io a seguire le tue guide.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="qr-card-vert"
      className="relative flex w-[392px] flex-col gap-[22px] overflow-hidden rounded-[22px] px-[26px] pb-6 pt-7 text-white"
      style={{ background: NAVY }}
    >
      <div className="pointer-events-none absolute left-0 top-0 h-[250px] w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{ backgroundImage: `url(${film.src})`, backgroundPosition: film.posV }}
        />
        <div className="absolute inset-0" style={{ background: FADE_V }} />
      </div>

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mark />
        </div>
        <RolePill />
      </div>

      <div className="relative mt-[150px] flex items-center gap-3.5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#d9f2f4] text-[20px] font-extrabold leading-[normal] tracking-[-0.5px] text-[#0e7490] shadow-[0_0_0_3px_rgba(255,255,255,0.18)]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[20px] font-extrabold leading-[1.1] tracking-[-0.4px]">{instructorName}</div>
          <div className="mt-[3px] text-[13px] font-medium leading-[normal] text-white/[0.72]">{companyName}</div>
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-2.5 rounded-[16px] bg-white p-3.5">
        <Qr value={qrValue} size={196} />
        <div className="text-[12px] font-bold leading-[normal] tracking-[2.6px] text-[#222222] [font-variant-numeric:tabular-nums]">
          {code}
        </div>
      </div>

      <div className="relative text-center">
        <div className="text-[14px] font-bold leading-[normal] tracking-[-0.1px]">Inquadra per associarti</div>
        <div className="mt-1 text-[12px] font-medium leading-[1.5] text-white/[0.72]">
          Apri l’app Reglo <Arrow /> tab Profilo <Arrow /> “Scansiona QR”. Sarò io a seguire le tue guide.
        </div>
      </div>
    </div>
  );
}
