import Image from "next/image";

/**
 * Funzioni che una **autoscuola consorziata senza Reglo** vede ma non può
 * usare (REG-429, Fase 6).
 *
 * Titoli, descrizioni e anteprime sono presi **1:1 dal prototipo** di Ruzzu:
 * le immagini sono state estratte dal bundle passando il mouse su ogni voce
 * bloccata e salvando ciò che il prototipo disegna davvero (`public/images/
 * locked/`). Non sono ricostruzioni: chi tocca questo file deve prendere i
 * contenuti da lì, non inventarli.
 *
 * Il CTA è nero `#222222` e non il navy del prototipo: quel prototipo è di
 * prima del passaggio della web app a bianco/nero (decisione di Tiziano).
 */

export const ATTIVA_REGLO_URL = "https://cal.com/reglo/attivazione-reglo";

export type LockedFeatureKey =
  | "utenti"
  | "oreGuida"
  | "chiave"
  | "comunicato"
  | "feedback";

export type LockedFeature = {
  title: string;
  description: string;
  /** Anteprima "com'è con Reglo attivo": markup 1:1 dal prototipo. */
  preview: React.ReactNode;
};

const Avatar = ({ src, alt }: { src: string; alt: string }) => (
  <Image
    src={src}
    alt={alt}
    width={34}
    height={34}
    className="h-[34px] w-[34px] shrink-0 rounded-full object-cover"
  />
);

/** Riquadro bordato che nel prototipo contiene le righe finte. */
const MockBox = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-[14px] border border-[#ededed] px-2.5 py-1.5">{children}</div>
);

const MockRow = ({
  src,
  name,
  right,
}: {
  src: string;
  name: string;
  right: React.ReactNode;
}) => (
  <div className="flex items-center gap-2.5 py-2">
    <Avatar src={src} alt="" />
    <span className="flex-1 text-[13.5px] font-bold text-foreground">{name}</span>
    {right}
  </div>
);

const RolePill = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-[#eef0f6] px-2.5 py-1 text-[11.5px] font-semibold text-[#4a4a6a]">
    {children}
  </span>
);

export const LOCKED_FEATURES: Record<LockedFeatureKey, LockedFeature> = {
  utenti: {
    title: "Utenti",
    description:
      "Tutte le persone registrate nella tua autoscuola: allievi, istruttori e segreteria, con ruoli e accessi.",
    preview: (
      <MockBox>
        <MockRow
          src="/images/locked/utenti-0.png"
          name="Marco Bianchi"
          right={<RolePill>Istruttore</RolePill>}
        />
        <MockRow
          src="/images/locked/utenti-1.png"
          name="Laura Conti"
          right={<RolePill>Segreteria</RolePill>}
        />
        <MockRow
          src="/images/locked/utenti-2.png"
          name="Davide Ferri"
          right={<RolePill>Titolare</RolePill>}
        />
      </MockBox>
    ),
  },
  oreGuida: {
    title: "Ore guida",
    description:
      "Report settimanale delle ore svolte da ogni istruttore: guide, esiti e presenze, senza chiedere niente a nessuno.",
    preview: (
      <MockBox>
        {[
          ["/images/locked/ore-guida-0.png", "Istruttore 1", "8h"],
          ["/images/locked/ore-guida-1.png", "Istruttore 2", "7h"],
          ["/images/locked/ore-guida-2.png", "Istruttore 3", "4h"],
        ].map(([src, name, hours]) => (
          <MockRow
            key={name}
            src={src}
            name={name}
            right={<span className="text-[13px] font-semibold text-muted-foreground">{hours}</span>}
          />
        ))}
      </MockBox>
    ),
  },
  chiave: {
    title: "Chiave di accesso",
    description:
      "Un codice da condividere per far registrare allievi e collaboratori da soli, senza inserimenti a mano.",
    preview: (
      <div className="overflow-hidden rounded-[14px] border border-[#ededed]">
        <Image
          src="/images/locked/chiave-di-accesso-0.png"
          alt=""
          width={520}
          height={520}
          className="block h-auto w-full"
        />
      </div>
    ),
  },
  comunicato: {
    title: "Invia comunicato",
    description:
      "Una notifica a tutti i tuoi utenti in un colpo solo: chiusure, avvisi, novità.",
    preview: (
      // Notifica push finta sopra la foto, come nel prototipo.
      <div className="relative h-[146px] overflow-hidden rounded-[14px]">
        <Image
          src="/images/locked/invia-comunicato-0.png"
          alt=""
          width={520}
          height={240}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-3 top-[52px] flex gap-2.5 rounded-[14px] bg-black/70 px-3 py-2.5 text-white backdrop-blur-sm">
          <Image
            src="/images/locked/invia-comunicato-1.png"
            alt=""
            width={30}
            height={30}
            className="h-[30px] w-[30px] shrink-0 rounded-lg bg-white object-contain"
          />
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[12.5px]">
              <b className="truncate">Autoscuola Montreal</b>
              <span className="shrink-0 text-[11.5px] opacity-75">adesso</span>
            </div>
            <div className="text-[12.5px] leading-[1.35]">
              Venerdì la sede resta chiusa: le guide sono state spostate.
            </div>
          </div>
        </div>
      </div>
    ),
  },
  feedback: {
    title: "Lascia un feedback",
    description:
      "Suggerisci miglioramenti direttamente al team Reglo: le funzioni nascono dai feedback delle autoscuole.",
    preview: (
      <div className="overflow-hidden rounded-[14px] border border-[#ededed]">
        <Image
          src="/images/locked/lascia-un-feedback-0.png"
          alt=""
          width={520}
          height={301}
          className="block h-auto w-full"
        />
      </div>
    ),
  },
};
