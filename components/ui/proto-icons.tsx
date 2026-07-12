import * as React from "react";

/**
 * Icone SVG inline copiate 1:1 dal proto (Dashboard.dc.html): lucide ha spesso
 * varianti arrotondate/diverse dagli stessi glifi (es. Map moderna vs mappa
 * squadrata feather, Users vs users Untitled UI) — qui i path sono quelli
 * ESATTI del proto, per menu hamburger e sidebar Impostazioni/Area personale.
 * Stessa firma delle icone lucide nei call site (className + strokeWidth).
 */

type ProtoIconProps = { className?: string; strokeWidth?: number };

export type ProtoIcon = (props: ProtoIconProps) => React.JSX.Element;

function makeIcon(
  paths: React.ReactNode,
  { viewBox = "0 0 24 24", defaultStroke = 1.9 }: { viewBox?: string; defaultStroke?: number } = {},
): ProtoIcon {
  const Icon = ({ className, strokeWidth = defaultStroke }: ProtoIconProps) => (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths}
    </svg>
  );
  return Icon;
}

/** Informazioni aziendali (cfgnav-impostazioni): persona in cerchio. */
export const UserRoundProtoIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="9.2" />
    <circle cx="12" cy="10" r="2.8" />
    <path d="M6.6 18.4a5.8 5.8 0 0 1 10.8 0" />
  </>,
);

/** Sede e luoghi (cfgnav-sede): mappa piegata SQUADRATA (lucide Map è arrotondata). */
export const FoldedMapIcon = makeIcon(
  <>
    <path d="M3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6z" />
    <path d="M9 3v15" />
    <path d="M15 6v15" />
  </>,
);

/** Prenotazioni (cfgnav-prenotazioni): calendario semplice senza giorni. */
export const CalendarProtoIcon = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="17" rx="2.5" />
    <path d="M8 2v4M16 2v4M3 9h18" />
  </>,
);

/** Policy tipi guida / Contratto e fattura (cfgnav-policy, apnav-documenti): blocco note con righe. */
export const NotepadProtoIcon = makeIcon(
  <>
    <rect x="4" y="2" width="16" height="20" rx="3" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </>,
);

/** Promemoria e notifiche / Invia comunicato: campana Untitled UI. */
export const BellProtoIcon = makeIcon(
  <path d="M14.9997 19C14.9997 20.6569 13.6566 22 11.9997 22C10.3429 22 8.99972 20.6569 8.99972 19M13.7962 6.23856C14.2317 5.78864 14.4997 5.17562 14.4997 4.5C14.4997 3.11929 13.3804 2 11.9997 2C10.619 2 9.49972 3.11929 9.49972 4.5C9.49972 5.17562 9.76772 5.78864 10.2032 6.23856M17.9997 11.2C17.9997 9.82087 17.3676 8.49823 16.2424 7.52304C15.1171 6.54786 13.591 6 11.9997 6C10.4084 6 8.8823 6.54786 7.75708 7.52304C6.63186 8.49823 5.99972 9.82087 5.99972 11.2C5.99972 13.4818 5.43385 15.1506 4.72778 16.3447C3.92306 17.7056 3.5207 18.3861 3.53659 18.5486C3.55476 18.7346 3.58824 18.7933 3.73906 18.9036C3.87089 19 4.53323 19 5.85791 19H18.1415C19.4662 19 20.1286 19 20.2604 18.9036C20.4112 18.7933 20.4447 18.7346 20.4629 18.5486C20.4787 18.3861 20.0764 17.7056 19.2717 16.3447C18.5656 15.1506 17.9997 13.4818 17.9997 11.2Z" />,
);

/** Istruttori / Utenti: coppia di utenti Untitled UI. */
export const UsersProtoIcon = makeIcon(
  <path d="M22 21V19C22 17.1362 20.7252 15.5701 19 15.126M15.5 3.29076C16.9659 3.88415 18 5.32131 18 7C18 8.67869 16.9659 10.1159 15.5 10.7092M17 21C17 19.1362 17 18.2044 16.6955 17.4693C16.2895 16.4892 15.5108 15.7105 14.5307 15.3045C13.7956 15 12.8638 15 11 15H8C6.13623 15 5.20435 15 4.46927 15.3045C3.48915 15.7105 2.71046 16.4892 2.30448 17.4693C2 18.2044 2 19.1362 2 21M13.5 7C13.5 9.20914 11.7091 11 9.5 11C7.29086 11 5.5 9.20914 5.5 7C5.5 4.79086 7.29086 3 9.5 3C11.7091 3 13.5 4.79086 13.5 7Z" />,
);

/** Veicoli (cfgnav-veicoli): automobile Untitled UI. */
export const CarProtoIcon = makeIcon(
  <path d="M5 13H8M2 9L4 10L5.27064 6.18807C5.53292 5.40125 5.66405 5.00784 5.90729 4.71698C6.12208 4.46013 6.39792 4.26132 6.70951 4.13878C7.06236 4 7.47705 4 8.30643 4H15.6936C16.523 4 16.9376 4 17.2905 4.13878C17.6021 4.26132 17.8779 4.46013 18.0927 4.71698C18.3359 5.00784 18.4671 5.40125 18.7294 6.18807L20 10L22 9M16 13H19M6.8 10H17.2C18.8802 10 19.7202 10 20.362 10.327C20.9265 10.6146 21.3854 11.0735 21.673 11.638C22 12.2798 22 13.1198 22 14.8V17.5C22 17.9647 22 18.197 21.9616 18.3902C21.8038 19.1836 21.1836 19.8038 20.3902 19.9616C20.197 20 19.9647 20 19.5 20H19C17.8954 20 17 19.1046 17 18C17 17.7239 16.7761 17.5 16.5 17.5H7.5C7.22386 17.5 7 17.7239 7 18C7 19.1046 6.10457 20 5 20H4.5C4.03534 20 3.80302 20 3.60982 19.9616C2.81644 19.8038 2.19624 19.1836 2.03843 18.3902C2 18.197 2 17.9647 2 17.5V14.8C2 13.1198 2 12.2798 2.32698 11.638C2.6146 11.0735 3.07354 10.6146 3.63803 10.327C4.27976 10 5.11984 10 6.8 10Z" />,
);

/** Segretaria (cfgnav-segretaria): cornetta semplice senza onde. */
export const PhoneProtoIcon = makeIcon(
  <path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h1.6a1 1 0 0 1 .96.72l.9 3a1 1 0 0 1-.27 1l-1.2 1.1a12 12 0 0 0 5 5l1.1-1.2a1 1 0 0 1 1-.27l3 .9a1 1 0 0 1 .72.96v1.6a2 2 0 0 1-2 2A15 15 0 0 1 3.5 5.5z" />,
);

/** Area personale / Il tuo profilo: persona Untitled UI (senza cerchio). */
export const UserProtoIcon = makeIcon(
  <path d="M20 21C20 19.6044 20 18.9067 19.8278 18.3389C19.44 17.0605 18.4395 16.06 17.1611 15.6722C16.5933 15.5 15.8956 15.5 14.5 15.5H9.5C8.10444 15.5 7.40665 15.5 6.83886 15.6722C5.56045 16.06 4.56004 17.0605 4.17224 18.3389C4 18.9067 4 19.6044 4 21M16.5 7.5C16.5 9.98528 14.4853 12 12 12C9.51472 12 7.5 9.98528 7.5 7.5C7.5 5.01472 9.51472 3 12 3C14.4853 3 16.5 5.01472 16.5 7.5Z" />,
);

/** Impostazioni dell'account (menu): ingranaggio del proto. */
export const GearProtoIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2C10.9 2 10 2.9 10 4c0 .55-.3 1.05-.76 1.3a1 1 0 0 1-1.14-.12L7.76 4.84A2 2 0 0 0 4.84 7.76l.34.34a1 1 0 0 1 .12 1.14C5.05 9.7 4.55 10 4 10a2 2 0 0 0 0 4c.55 0 1.05.3 1.3.76a1 1 0 0 1-.12 1.14l-.34.34a2 2 0 0 0 2.92 2.92l.34-.34a1 1 0 0 1 1.14-.12c.46.25.76.75.76 1.3a2 2 0 0 0 4 0c0-.55.3-1.05.76-1.3a1 1 0 0 1 1.14.12l.34.34a2 2 0 0 0 2.92-2.92l-.34-.34a1 1 0 0 1-.12-1.14c.25-.46.75-.76 1.3-.76a2 2 0 0 0 0-4c-.55 0-1.05-.3-1.3-.76a1 1 0 0 1 .12-1.14l.34-.34a2 2 0 0 0-2.92-2.92l-.34.34a1 1 0 0 1-1.14.12C13.05 4.3 13 3.8 13 3.25" />
  </>,
  { defaultStroke: 1.8 },
);

/** Ore guida (menu): orologio del proto (r 9.5, lancette 6.5→12→15,15). */
export const ClockProtoIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 6.5v6l4 3" />
  </>,
);

/** Centro assistenza (menu): cerchio con punto interrogativo. */
export const HelpCircleProtoIcon = ({ className, strokeWidth = 1.4 }: ProtoIconProps) => (
  <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
    <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth={strokeWidth} />
    <path
      d="M9 10.5v-.75c1.24 0 2.25-1.01 2.25-2.25S10.24 5.25 9 5.25 6.75 6.26 6.75 7.5"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
    <circle cx="9" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

/** Lascia un feedback (menu): stella del proto. */
export const StarProtoIcon = makeIcon(
  <path d="M12 2l2.35 6.76 7.16.15-5.71 4.33 2.08 6.85L12 16l-5.88 4.09 2.08-6.85L2.49 8.91l7.16-.15L12 2Z" />,
);

/** Esci (menu): porta con freccia verso destra del proto. */
export const LogoutProtoIcon = makeIcon(
  <>
    <path d="M14 9V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-2" />
    <path d="M10 12h11" />
    <path d="M18 9l3 3-3 3" />
  </>,
  { defaultStroke: 1.7 },
);

/** Abbonamento (apnav-abbonamento): carta di credito del proto. */
export const CardProtoIcon = makeIcon(
  <>
    <path d="M8 7h8a4 4 0 0 1 4 4v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h9" />
    <path d="M16 13h.5" />
  </>,
);
