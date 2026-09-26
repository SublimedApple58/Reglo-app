"use client";

/**
 * Card delle sezioni non comprate, per una consorziata senza Reglo (REG-429).
 *
 * Non sono una card sola riusata tre volte: il prototipo ne ha una **su
 * misura per funzione**, e gli SVG qui dentro sono copiati **carattere per
 * carattere** dal prototipo (`viewBox`, coordinate, colori, puntini grigi
 * lungo l'arco, posizione del sole). Se vanno ritoccati, si ritoccano lì e si
 * riestraggono: non si ridisegnano a occhio.
 *
 * Rinnovi non è qui: il teaser che l'app ha già è identico a quello del
 * prototipo, quindi resta com'è.
 */

import Link from "next/link";
import { useLocale } from "next-intl";

import { ATTIVA_REGLO_URL } from "./locked-features";

function Shell({
  background,
  children,
}: {
  background: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto my-7 w-full max-w-[640px] overflow-hidden rounded-[28px] shadow-[0_18px_50px_rgba(10,20,30,0.10)]" style={{ background }}>
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="m-[22px] rounded-[24px] bg-white px-7 pb-[22px] pt-[26px]">{children}</div>;
}

function Columns({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mt-2 grid grid-cols-3">
      {items.map(([title, body], index) => (
        <div
          key={title}
          className={index === 0 ? "pr-[18px]" : "border-l border-[#ededed] px-[18px]"}
        >
          <b className="mb-1 block text-[15px] font-bold text-foreground">{title}</b>
          <p className="m-0 text-[14.5px] leading-[1.5] text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}

function Foot({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-11 pb-[34px] pt-1.5 text-center">
      <h2 className="mb-3.5 text-[27px] font-bold leading-[1.22] tracking-[-0.5px] text-foreground">
        {title}
      </h2>
      <p className="mb-[22px] text-[16px] leading-[1.5] text-muted-foreground">{description}</p>
      <div className="flex items-center justify-center gap-3">{children}</div>
    </div>
  );
}

const ghostClass =
  "rounded-[32px] border-[1.5px] border-[#e2e2e2] bg-white px-[26px] py-[13px] text-[15px] font-semibold text-foreground transition-colors hover:border-[#b5b5b5]";
const ctaClass =
  "rounded-[32px] bg-[#222222] px-[34px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90";

/**
 * Allievi — l'unica card con un CTA che **non** porta al calendario: "Prova"
 * apre la sezione Allievi, che nella vista ridotta funziona davvero, limitata
 * alle anagrafiche (decisione di Tiziano, 26/09).
 */
export function AllieviLockedCard({ onProva }: { onProva: () => void }) {
  return (
    <Shell background="linear-gradient(180deg,#FBEFC8 0%,#FDF7E6 42%,#ffffff 100%)">
      <Panel>
        <div className="mb-1.5 text-[14px] text-[#929292]">marzo 2026 → luglio 2026</div>
        <h3 className="m-0 mb-1.5 text-[24px] font-bold tracking-[-0.4px] text-foreground">
          Dal primo accesso alla patente.
        </h3>
        <svg viewBox="0 -12 460 78" style={{ width: "100%", height: 150, display: "block", marginBottom: 14 }} fill="none"> <path d="M8 54 C 70 54, 96 46, 130 44 C 176 41, 196 40, 238 32 C 292 22, 330 14, 452 10" stroke="#1c1c1c" strokeWidth="1.6" strokeLinecap="round" /> <circle cx="60" cy="51" r="4" fill="#c9c9d4" /> <circle cx="130" cy="44" r="4.5" fill="#1c1c1c" /> <circle cx="238" cy="32" r="4.5" fill="#e8709f" /> <circle cx="330" cy="19" r="4" fill="#c9c9d4" /> <text x="316" y="42" fontSize="13" fontWeight="600" fill="#5a6a7d" fontFamily="Figtree, sans-serif">guide</text> <circle cx="440" cy="10.6" r="5" fill="#1c1c1c" /> <text x="118" y="62" fontSize="13" fontWeight="600" fill="#5a6a7d" fontFamily="Figtree, sans-serif">quiz</text> <text x="222" y="19" fontSize="13" fontWeight="600" fill="#c2427a" fontFamily="Figtree, sans-serif">foglio rosa</text> <text x="404" y="-2" fontSize="13" fontWeight="600" fill="#5a6a7d" fontFamily="Figtree, sans-serif">patente</text> </svg>
        <Columns
          items={[
            ["12 marzo", "Primo accesso in app, i primi quiz svolti."],
            ["28 aprile", "Teorico superato, foglio rosa e prime guide."],
            ["9 luglio", "Esame pratico superato: percorso chiuso."],
          ]}
        />
      </Panel>
      <Foot
        title="Segui l'allievo da quando entra in app a quando prende la patente"
        description="Quiz, argomenti, guide, note ed esami: ogni passaggio resta registrato, senza rincorrere nessuno."
      >
        <button type="button" onClick={onProva} className={ctaClass}>
          Prova
        </button>
      </Foot>
    </Shell>
  );
}

export function SegretariaLockedCard() {
  const locale = useLocale();
  return (
    <Shell background="linear-gradient(180deg,#DCE9F7 0%,#EDF4FB 45%,#ffffff 100%)">
      <Panel>
        <div className="mb-1.5 text-[14px] text-[#929292]">una giornata in autoscuola</div>
        <h3 className="m-0 mb-1.5 text-[24px] font-bold tracking-[-0.4px] text-foreground">
          Le chiamate non seguono i tuoi orari.
        </h3>
        <svg viewBox="150 40 700 320" style={{ width: "100%", height: 150, display: "block", marginBottom: 14 }} fill="none"> <path d="M250 340 A 250 250 0 0 1 279.4 222.4" fill="none" stroke="#111111" strokeWidth="1.5" strokeDasharray="4 5" /> <path d="M279.4 222.4 A 250 250 0 0 1 427.4 100.8" fill="none" stroke="#111111" strokeWidth="1.5" /> <path d="M427.4 100.8 A 250 250 0 0 1 548.7 94.8" fill="none" stroke="#111111" strokeWidth="1.5" strokeDasharray="4 5" /> <path d="M548.7 94.8 A 250 250 0 0 1 707.8 201.1" fill="none" stroke="#111111" strokeWidth="1.5" /> <path d="M707.8 201.1 A 250 250 0 0 1 750 340" fill="none" stroke="#111111" strokeWidth="1.5" strokeDasharray="4 5" /> <line x1="150" y1="340" x2="850" y2="340" stroke="#B0B0B0" strokeWidth="1" strokeDasharray="4 6" /> <g fill="#111111"> <path d="M214.5 331 A 7.5 7.5 0 0 1 229.5 331 Z" /> <rect x="211" y="333.2" width="22" height="1.6" rx="0.8" /> <rect x="214.5" y="336.4" width="15" height="1.6" rx="0.8" /> <rect x="217.5" y="339.6" width="9" height="1.6" rx="0.8" /> <g stroke="#111111" strokeWidth="1.6" strokeLinecap="round"> <line x1="222" y1="323" x2="222" y2="320.4" /> <line x1="215.4" y1="325" x2="213.7" y2="323.3" /> <line x1="228.6" y1="325" x2="230.3" y2="323.3" /> </g> </g> <g fill="#111111"> <circle cx="500" cy="66" r="5" /> <g stroke="#111111" strokeWidth="1.6" strokeLinecap="round"> <line x1="500" y1="58.4" x2="500" y2="56.2" /> <line x1="500" y1="73.6" x2="500" y2="75.8" /> <line x1="492.4" y1="66" x2="490.2" y2="66" /> <line x1="507.6" y1="66" x2="509.8" y2="66" /> <line x1="494.6" y1="60.6" x2="493.1" y2="59.1" /> <line x1="505.4" y1="71.4" x2="506.9" y2="72.9" /> <line x1="505.4" y1="60.6" x2="506.9" y2="59.1" /> <line x1="494.6" y1="71.4" x2="493.1" y2="72.9" /> </g> </g> <g fill="#111111"> <mask id="seg-moon-cut" maskUnits="userSpaceOnUse" x="792" y="313" width="22" height="22"> <circle cx="803" cy="324" r="9.6" fill="#ffffff" /> <circle cx="797.4" cy="318.4" r="8.6" fill="#000000" /> </mask> <circle cx="803" cy="324" r="9.6" mask="url(#seg-moon-cut)" /> <path d="M797.2 314.4 l0.8 1.9 1.9 0.8 -1.9 0.8 -0.8 1.9 -0.8 -1.9 -1.9 -0.8 1.9 -0.8 Z" /> <path d="M793.4 320.2 l0.55 1.3 1.3 0.55 -1.3 0.55 -0.55 1.3 -0.55 -1.3 -1.3 -0.55 1.3 -0.55 Z" /> </g> <g fill="#B0B0B0"> <circle cx="307" cy="181" r="5" /> <circle cx="341" cy="147" r="5" /> <circle cx="382" cy="120" r="5" /> <circle cx="573" cy="101" r="5" /> <circle cx="618" cy="120" r="5" /> <circle cx="659" cy="147" r="5" /> <circle cx="678" cy="163" r="5" /> </g> <circle cx="279" cy="222" r="8" fill="#E4572E" /> <circle cx="708" cy="201" r="8" fill="#E4572E" /> <g fill="#111111" fontSize="19" fontWeight="600" fontFamily="Figtree, sans-serif"> <text x="260" y="228" textAnchor="end">08:30</text> <text x="500" y="126" textAnchor="middle">12:30 – 15:00</text> <text x="726" y="208" textAnchor="start">19:00</text> </g> </svg>
        <Columns
          items={[
            ["Prima delle 08:30", "Le chiamate iniziano prima che tu apra la segreteria."],
            ["Pausa pranzo", "Tra 12:30 e 15:00 nessuno risponde al telefono."],
            ["Dopo le 19:00", "Chi chiama a sera resta senza risposta."],
          ]}
        />
      </Panel>
      <Foot
        title="La segretaria che risponde anche quando tu non puoi"
        description="Risponde 24/7 su orari, prezzi e documenti, raccoglie i numeri di chi vuole essere ricontattato e ti lascia qui le chiamate in sospeso."
      >
        <Link href={`/${locale}`} className={ghostClass}>
          Scopri di più
        </Link>
        <a href={ATTIVA_REGLO_URL} target="_blank" rel="noreferrer" className={ctaClass}>
          Attiva Reglo
        </a>
      </Foot>
    </Shell>
  );
}
