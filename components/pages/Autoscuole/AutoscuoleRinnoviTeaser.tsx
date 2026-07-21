import Image from "next/image";

/**
 * Teaser "Rinnovi" (feature in arrivo) — replica 1:1 della sezione del
 * prototipo redesign: hero 3D, titolo, paragrafo e CTA verso reglo.it.
 */
export function AutoscuoleRinnoviTeaser() {
  return (
    <div
      data-testid="autoscuole-rinnovi-teaser"
      className="mx-auto max-w-[640px] px-6 pb-18 pt-12 text-center sm:px-12"
    >
      <Image
        src="/images/nav/rinnovi-hero-3d.png"
        alt=""
        width={160}
        height={160}
        className="mx-auto mb-9 block h-40 w-40 object-contain mix-blend-multiply"
      />
      <h2 className="mb-5 text-[26px] font-bold leading-[1.3] tracking-[-0.4px] text-foreground">
        Il rinnovo della patente,
        <br />
        finalmente digitale
      </h2>
      <p className="mx-auto mb-5 max-w-[520px] text-[15px] font-medium leading-[1.8] text-[#6a6a6a] [text-wrap:pretty]">
        Tutto il Team di Reglo sta lavorando per digitalizzare e automatizzare l&apos;intero
        flusso del rinnovo patente — oggi frammentato tra WhatsApp, visite in sede e spedizioni
        postali. Lo studente carica documenti e firma dall&apos;app, risponde a un questionario
        intelligente sulle patologie e viene avvisato in anticipo se rischia di non poter
        rinnovare. Il medico trova le pratiche già pronte e controllate. L&apos;autoscuola
        incassa il servizio senza gestire documenti, appuntamenti o imprevisti.
      </p>
      <a
        href="https://reglo.it"
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-[#222222] px-[26px] py-[13px] text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Scopri di più
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path
            d="M5 3l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </div>
  );
}
