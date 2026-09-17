import React from "react";
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  type MobilePlatform,
} from "@/lib/autoscuole/instructor-link-deeplink";

// REG-451 — pagina aperta dalla fotocamera del telefono sul QR della card
// istruttore (/i/<codice>). Stesso linguaggio delle schermate app del prototipo
// (conferma / errore): chi ha Reglo apre l'app e conferma lì, chi non ce l'ha
// trova i link agli store e le istruzioni per tornare sul QR.

const QR_BADGE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v3M14 21h3M21 21h-1" />
  </svg>
);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh justify-center bg-white text-[#222222]">
      <div className="flex min-h-svh w-full max-w-[440px] flex-col px-[22px] pb-7 pt-6">
        <div className="flex h-11 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/qr-card/reglo-mark.png" alt="Reglo" className="size-[26px] object-contain" />
        </div>
        {children}
      </div>
    </main>
  );
}

function StoreButton({ href, label, sub, icon }: { href: string; label: string; sub: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-[16px] border-[1.5px] border-[#dddddd] bg-white text-[#222222] transition-colors hover:bg-[#f7f7f7]"
    >
      {icon}
      <span className="flex flex-col text-left leading-[1.1]">
        <span className="text-[10px] font-semibold text-[#929292]">{sub}</span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
    </a>
  );
}

const APPLE = (
  <svg width="18" height="20" viewBox="0 0 384 512" fill="#222222" aria-hidden>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

const PLAY = (
  <svg width="18" height="20" viewBox="0 0 512 512" aria-hidden>
    <path fill="#222222" d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
  </svg>
);

export function InstructorLinkLanding({
  code,
  instructorName,
  initials,
  companyName,
  openUrl,
  platform,
}: {
  code: string;
  instructorName: string;
  initials: string;
  companyName: string;
  openUrl: string;
  platform: MobilePlatform;
}) {
  const onPhone = platform !== "other";
  return (
    <Shell>
      <div data-testid="instructor-link-landing" className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <div className="relative mb-[22px] size-[104px]">
          <div className="flex size-[104px] animate-[pop_0.5s_ease-out_both] items-center justify-center rounded-full bg-[#d9f2f4] text-[38px] font-extrabold tracking-[-0.5px] text-[#0e7490]">
            {initials}
          </div>
          <div className="absolute -bottom-1 -right-1 flex size-[34px] items-center justify-center rounded-full border-[3px] border-white bg-[#111111]">
            {QR_BADGE}
          </div>
        </div>
        <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">{companyName}</div>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px] text-[#222222]">{instructorName}</h1>
        <p className="mt-3.5 max-w-[300px] text-[15px] font-medium leading-[1.5] text-[#6a6a6a]">
          {onPhone
            ? "Apri Reglo per associarti a questo istruttore: vedrà le tue guide e potrà prenotarle per te."
            : "Inquadra il QR con il telefono su cui usi Reglo per associarti a questo istruttore."}
        </p>
        <div className="mt-[22px] rounded-full border border-[#dddddd] bg-[#f7f7f7] px-3.5 py-2 text-[12px] font-bold tracking-[2px] text-[#222222]">
          {code}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {onPhone && (
          <a
            href={openUrl}
            data-testid="instructor-link-open-app"
            className="flex h-[52px] items-center justify-center rounded-[16px] bg-[#111111] text-[16px] font-bold text-white transition-colors hover:bg-[#2b2b2b]"
          >
            Apri nell&apos;app Reglo
          </a>
        )}
        <div className="mt-3 text-center text-[13px] font-semibold text-[#929292]">Non hai ancora Reglo?</div>
        <div className="flex gap-2.5">
          {platform !== "android" && <StoreButton href={APP_STORE_URL} sub="Scarica su" label="App Store" icon={APPLE} />}
          {platform !== "ios" && <StoreButton href={PLAY_STORE_URL} sub="Disponibile su" label="Google Play" icon={PLAY} />}
        </div>
        <p className="mt-2 text-center text-[12.5px] font-medium leading-[1.5] text-[#929292]">
          Dopo l&apos;accesso vai su Profilo{" "}
          <span style={{ fontFamily: "-apple-system, system-ui, sans-serif" }}>→</span> “Scansiona QR”, oppure inserisci a
          mano il codice{" "}
          <span className="font-bold tracking-[1.5px] text-[#6a6a6a]">{code}</span>.
        </p>
      </div>
    </Shell>
  );
}

export function InstructorLinkInvalid({ code }: { code: string }) {
  return (
    <Shell>
      <div data-testid="instructor-link-invalid" className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <div className="mb-[26px] flex size-24 animate-[pop_0.5s_ease-out_both] items-center justify-center rounded-full bg-[#fde8ec]">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#c8354f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="m15 15 6 6M21 15l-6 6" />
          </svg>
        </div>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px] text-[#222222]">Codice non valido</h1>
        <p className="mt-3.5 max-w-[280px] text-[15px] font-medium leading-[1.5] text-[#6a6a6a]">
          Questo QR non è più attivo. Chiedi in segreteria una card aggiornata.
        </p>
        {code ? (
          <div className="mt-[22px] rounded-full bg-[#f7f7f7] px-3.5 py-2 text-[12px] font-semibold text-[#929292]">
            Codice letto: <span className="tracking-[1.5px] text-[#6a6a6a]">{code}</span>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
