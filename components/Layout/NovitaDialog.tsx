"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { createPortal } from "react-dom";

export type NovitaEntryKey = "qr-istruttore" | "pagellino" | "foto-firma" | "agenda-pausa" | "veicoli" | "istruttori";

// "agenda-pausa" non è gestita da NovitaDialog: la voce apre il dialog dedicato
// AgendaPauseNewsDialog (splash + video). Lo shell la intercetta prima.
export const NOVITA_ENTRIES: Array<{ key: NovitaEntryKey; title: string; latest?: boolean }> = [
  { key: "qr-istruttore", title: "Card QR dell'istruttore", latest: true },
  { key: "pagellino", title: "Pagellino personalizzabile" },
  { key: "foto-firma", title: "Foto e firme digitali" },
  { key: "agenda-pausa", title: "Richieste agenda in pausa" },
  { key: "veicoli", title: "Modulo veicoli (moto)" },
  { key: "istruttori", title: "Gestione autonoma degli istruttori" },
];

function StepRow({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-[13px]">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eeeef4] text-[13px] font-bold text-navy-900">
        {num}
      </div>
      <div className="pt-0.5 text-[14.5px] font-medium leading-[1.5] text-[#444444]">{children}</div>
    </div>
  );
}

/** Cornice video del proto: ratio naturale su sfondo #eceef2, angoli 16px. */
function NovitaVideo({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-[#eceef2] ${className ?? ""}`}>
      <video src={src} autoPlay muted playsInline loop className="block w-full" style={style} />
    </div>
  );
}

function GoButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-[14px] bg-[#1a1a2e] px-6 py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#2d2d4a] ${className ?? ""}`}
    >
      {label}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h9M8.5 4l4 4-4 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * Modal changelog "Novità" (dal menu hamburger). Contenuto statico allineato al
 * prototipo Dashboard.dc.html: una scheda per feature rilasciata.
 */
export function NovitaDialog({
  entry,
  onClose,
}: {
  entry: NovitaEntryKey | null;
  onClose: () => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    if (!entry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, onClose]);

  if (!entry || typeof document === "undefined") return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/[0.42] px-6 py-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[calc(100vh-64px)] w-[640px] max-w-full flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        role="dialog"
        aria-modal="true"
        data-testid="novita-dialog"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#f0f0f0] bg-white px-6 py-[17px]">
          <span className="text-[13px] font-semibold leading-[normal] tracking-[0.2px] text-[#929292]">Novità</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-[#f5f5f5] transition-colors duration-150 hover:bg-[#e7e7e7]"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M3 3l8 8M11 3l-8 8" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={`overflow-y-auto px-8 pt-7 ${entry === "pagellino" || entry === "qr-istruttore" ? "pb-[34px]" : "pb-9"}`}>
          {entry === "qr-istruttore" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold leading-[normal] text-[#929292]">13 settembre 2026</div>
              <div className="mb-[22px] text-[26px] font-bold leading-[normal] tracking-[-0.4px] text-[#222222]">
                Card QR dell&apos;istruttore
              </div>
              <div className="mb-[26px] overflow-hidden rounded-2xl bg-[#eceef2]">
                <img src="/images/novita/card-qr-istruttore.jpg" alt="" className="block w-full" />
              </div>
              <p className="mb-[26px] text-[15px] font-medium leading-[1.6] text-[#444444]">
                Ogni istruttore ha ora una <b className="font-bold text-[#222222]">card con il proprio QR</b>, da
                stampare e lasciare in macchina. L&apos;allievo la inquadra dall&apos;app e viene{" "}
                <b className="font-bold text-[#222222]">associato a quell&apos;istruttore</b> in un tocco — niente
                codici da dettare, niente passaggi in segreteria.
              </p>
              <div className="mb-4 text-[16px] font-bold leading-[normal] text-[#222222]">Come funziona</div>
              <div className="mb-[26px] flex flex-col gap-[14px]">
                <StepRow num={1}>
                  Apri il profilo dell&apos;istruttore, scheda <b className="font-bold text-[#222222]">Codice</b>, e
                  premi <b className="font-bold text-[#222222]">Utilizza</b>.
                </StepRow>
                <StepRow num={2}>
                  Scegli <b className="font-bold text-[#222222]">verticale o orizzontale</b> e lo sfondo che
                  preferisci, poi scarica il PNG o stampa: esce già su A4 con le linee di taglio.
                </StepRow>
                <StepRow num={3}>
                  L&apos;allievo, con Reglo già installato, inquadra il QR:{" "}
                  <b className="font-bold text-[#222222]">
                    conferma e da quel momento le sue guide sono seguite da quell&apos;istruttore
                  </b>
                  . Se ne aveva già uno, può scegliere se cambiare.
                </StepRow>
              </div>
              <div className="mb-[26px] border-t border-[#f0f0f0]" />
              <div className="mb-1.5 text-[13px] font-semibold leading-[normal] text-[#929292]">Dietro le quinte</div>
              <div className="mb-4 text-[20px] font-bold leading-[normal] tracking-[-0.3px] text-[#222222]">
                Ispirazioni da grande schermo 🍿
              </div>
              <p className="mb-[18px] text-[15px] font-medium leading-[1.6] text-[#444444]">
                Per lo sfondo della card abbiamo scelto{" "}
                <b className="font-bold text-[#222222]">sei scene di cinema con un&apos;auto protagonista</b>. Ogni
                istruttore sceglie la sua.
              </p>
              <div className="mb-[26px] grid grid-cols-3 gap-2.5">
                {[
                  ["/images/qr-card/film-goldfinger.jpg", "Goldfinger", "1964"],
                  ["/images/qr-card/film-bttf.jpg", "Ritorno al futuro", "1985"],
                  ["/images/qr-card/film-scarface.jpg", "Scarface", "1983"],
                  ["/images/qr-card/film-fast.jpg", "Fast & Furious", "2001"],
                  ["/images/qr-card/film-batman.jpg", "Batman Begins", "2005"],
                  ["/images/qr-card/film-wolf.jpg", "The Wolf of Wall Street", "2013"],
                ].map(([src, title, year]) => (
                  <div key={title} className="flex flex-col gap-1.5">
                    <div className="aspect-[3/2] overflow-hidden rounded-[12px] bg-[#eceef2]">
                      <img src={src} alt="" className="block size-full object-cover" />
                    </div>
                    <div className="text-[12px] font-semibold leading-[normal] text-[#222222]">
                      {title} <span className="font-medium text-[#929292]">· {year}</span>
                    </div>
                  </div>
                ))}
              </div>
              <GoButton
                label="Vai agli istruttori"
                onClick={() => go("/user/autoscuole?tab=settings&pane=instructors")}
                className="leading-[normal]"
              />
            </>
          )}

          {entry === "pagellino" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold leading-[normal] text-[#929292]">13 settembre 2026</div>
              <div className="mb-[22px] text-[26px] font-bold leading-[normal] tracking-[-0.4px] text-[#222222]">
                Il pagellino è tuo
              </div>
              <div className="mb-[26px] overflow-hidden rounded-2xl bg-[#eceef2]">
                <img src="/images/novita/pagellino.jpg" alt="" className="block w-full" />
              </div>
              <p className="mb-[26px] text-[15px] font-medium leading-[1.6] text-[#444444]">
                Ogni autoscuola insegna a modo suo: adesso anche il pagellino. Scegli tu{" "}
                <b className="font-bold text-[#222222]">quali voci valutare</b> e con quale scala, e
                l&apos;istruttore assegna un <b className="font-bold text-[#222222]">punteggio a ogni guida</b>,
                voce per voce — in pochi secondi, appena scende dall&apos;auto.
              </p>
              <div className="mb-4 text-[16px] font-bold leading-[normal] text-[#222222]">Come si configura</div>
              <div className="mb-[26px] flex flex-col gap-[14px]">
                <StepRow num={1}>
                  Vai in <b className="font-bold text-[#222222]">Configurazione → Pagellino</b> e crei le voci
                  di valutazione: partenze, parcheggio, rotonde, sicurezza — quelle che contano per te.
                </StepRow>
                <StepRow num={2}>
                  Le <b className="font-bold text-[#222222]">riordini col trascinamento</b> e scegli la scala
                  per ciascuna (es. da 1 a 5).
                </StepRow>
                <StepRow num={3}>
                  Dal momento in cui salvi, <b className="font-bold text-[#222222]">tutti i tuoi istruttori</b>{" "}
                  vedono il pagellino aggiornato.
                </StepRow>
              </div>
              <GoButton
                label="Vai al pagellino"
                onClick={() => go("/user/autoscuole?tab=settings&pane=evaluation")}
                className="leading-[normal]"
              />
            </>
          )}

          {entry === "veicoli" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">12 luglio 2026</div>
              <div className="mb-[22px] text-[26px] font-bold tracking-[-0.4px] text-foreground">
                Modulo veicoli per le moto
              </div>
              <NovitaVideo src="/videos/novita/veicoli.mp4" className="mb-[26px]" />
              <p className="mb-6 text-[15px] font-medium leading-[1.6] text-[#444444]">
                Il modulo veicoli è ora disponibile anche per le{" "}
                <b className="font-bold text-foreground">moto</b>: aggiungile al parco veicoli e
                assegnale alle guide, come già fai con le auto.
              </p>
              <div className="mb-2 flex flex-col gap-[14px]">
                <StepRow num={1}>
                  Aggiungi una moto con <b className="font-bold text-foreground">nome e targa</b>,
                  accanto alle auto che hai già.
                </StepRow>
                <StepRow num={2}>
                  Nelle guide in moto puoi indicare l&apos;
                  <b className="font-bold text-foreground">auto al seguito</b>: risulterà impegnata in
                  agenda insieme alla moto.
                </StepRow>
                <StepRow num={3}>
                  Attivi o disattivi il modulo quando vuoi, dalla configurazione.
                </StepRow>
              </div>
              <GoButton
                label="Vai ai veicoli"
                onClick={() => go("/user/autoscuole?tab=settings&pane=vehicles")}
                className="mt-[18px]"
              />
            </>
          )}

          {entry === "istruttori" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">10 luglio 2026</div>
              <div className="mb-[22px] text-[26px] font-bold tracking-[-0.4px] text-foreground">
                Gestione autonoma degli istruttori
              </div>
              <NovitaVideo src="/videos/novita/istruttori.mp4" className="mb-[26px]" />
              <p className="mb-[26px] text-[15px] font-medium leading-[1.6] text-[#444444]">
                Ora puoi rendere un istruttore autonomo —{" "}
                <b className="font-bold text-foreground">
                  gestendo da solo i propri allievi e le proprie impostazioni
                </b>
                , dentro i confini che decidi tu. Tu attivi la modalità autonoma dal suo profilo, lui
                lavora senza fare doppi passaggi.
              </p>
              <div className="mb-4 text-base font-bold text-foreground">Cosa puoi impostare</div>
              <div className="mb-[26px] flex flex-col gap-[14px]">
                <StepRow num={1}>
                  <b className="font-bold text-foreground">Orario di lavoro</b> per distinguere le ore
                  ordinarie dalle ore extra.
                </StepRow>
                <StepRow num={2}>
                  <b className="font-bold text-foreground">Durate delle guide</b> proponibili e slot
                  solo a orari tondi, se vuoi.
                </StepRow>
                <StepRow num={3}>
                  <b className="font-bold text-foreground">Governance delle prenotazioni</b>: chi
                  prenota, scambi, annullamenti, cutoff, limiti settimanali, fasce orarie e assenze —
                  ogni regola può seguire il default dell&apos;autoscuola oppure un&apos;impostazione
                  propria dell&apos;istruttore.
                </StepRow>
                <StepRow num={4}>
                  <b className="font-bold text-foreground">Allievi assegnati</b>: decidi chi segue, con
                  ricerca rapida e conteggio sempre aggiornato.
                </StepRow>
              </div>

              <div className="mb-[26px] border-t border-[#f0f0f0]" />
              <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">In evidenza</div>
              <div className="mb-4 text-[20px] font-bold tracking-[-0.3px] text-foreground">
                Parco Allievi
              </div>
              <NovitaVideo
                src="/videos/novita/parco-allievi.mp4"
                className="mb-5"
                style={{ transform: "scale(1.12, 1.03)", transformOrigin: "left top" }}
              />
              <p className="mb-4 text-[15px] font-medium leading-[1.6] text-[#444444]">
                Il parco allievi permette agli istruttori di creare un{" "}
                <b className="font-bold text-foreground">proprio bacino utenti</b>, per gestire con le
                proprie regole i loro allievi. Scopri anche la versione{" "}
                <b className="font-bold text-foreground">mappa visiva</b>: ogni allievo è una bolla
                colorata, e ti muovi tra le bolle semplicemente spostando il mouse.
              </p>
              <div className="mb-[26px] flex flex-col gap-[14px]">
                <StepRow num={1}>
                  Apri il Parco Allievi dal profilo dell&apos;istruttore: vedi{" "}
                  <b className="font-bold text-foreground">a colpo d&apos;occhio tutti i suoi allievi</b>.
                </StepRow>
                <StepRow num={2}>
                  Clicchi una bolla per i <b className="font-bold text-foreground">dettagli</b> —
                  patente, stato — e per rimuovere l&apos;allievo dall&apos;istruttore.
                </StepRow>
                <StepRow num={3}>
                  Con la bolla <b className="font-bold text-foreground">+</b> cerchi gli altri allievi
                  dell&apos;autoscuola e li aggiungi al parco in un tocco.
                </StepRow>
              </div>
              <GoButton
                label="Vai agli istruttori"
                onClick={() => go("/user/autoscuole?tab=settings&pane=instructors")}
              />
            </>
          )}

          {entry === "foto-firma" && (
            <>
              <div className="mb-1.5 text-[13px] font-semibold text-[#929292]">4 agosto 2026</div>
              <div className="mb-[22px] flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[26px] font-bold tracking-[-0.4px] text-foreground">
                  Foto e firme digitali
                </span>
                <span className="rounded-full border border-[#d8ecd8] bg-[#f2f9f1] px-3 py-1 text-[12px] font-semibold text-[#33593c]">
                  Disponibile da lunedì
                </span>
              </div>
              <div className="mb-4 overflow-hidden rounded-2xl bg-[#eceef2]">
                <img src="/images/novita/firma-allievo.jpg" alt="" className="block w-full" />
              </div>
              <div className="mb-3 text-[20px] font-bold tracking-[-0.3px] text-foreground">
                Firma digitale allievo
              </div>
              <p className="mb-[26px] text-[15px] font-medium leading-[1.6] text-[#444444]">
                Ora raccogli la firma dell&apos;allievo direttamente in app, con un pad touch a
                schermo intero, semplice e veloce. La trovi nella scheda allievo pronta
                all&apos;uso, sia in originale che nel formato adatto al portale
                dell&apos;automobilista.
              </p>
              <div className="mb-4 overflow-hidden rounded-2xl bg-[#eceef2]">
                <img src="/images/novita/foto-profilo-allievo.jpg" alt="" className="block w-full" />
              </div>
              <div className="mb-3 text-[20px] font-bold tracking-[-0.3px] text-foreground">
                Foto profilo allievo
              </div>
              <p className="text-[15px] font-medium leading-[1.6] text-[#444444]">
                Ora puoi far caricare all&apos;allievo la propria foto profilo direttamente
                dall&apos;app Reglo, in pochi secondi dal telefono. La ritrovi subito nella scheda
                allievo, già pronta anche nel formato richiesto dalla Motorizzazione per le
                pratiche — niente più scanner o email da gestire.
              </p>
              <div className="mt-[26px] flex items-start gap-3 rounded-[14px] border border-[#d8ecd8] bg-[#f2f9f1] px-[18px] py-4">
                <Lightbulb className="mt-0.5 size-5 shrink-0 text-navy-900" strokeWidth={1.5} />
                <div className="text-[13.5px] font-medium leading-normal text-[#4e7a52]">
                  L&apos;idea arriva dall&apos;<b className="font-bold text-[#33593c]">Autoscuola Octuma</b>:
                  raccoglievano foto e firme degli allievi a mano, con passaggi manuali e
                  ripetitivi per ogni pratica. Dalla loro richiesta è nata questa funzione.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
