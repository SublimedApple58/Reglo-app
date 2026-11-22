"use client";

import React from "react";
import { Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { WhatsAppGlyph } from "@/components/pages/Autoscuole/NeverAccessedNudge";
import { blueLinkClass } from "@/components/pages/Autoscuole/student-detail-ui";
import { getWhatsAppWelcomeContext } from "@/lib/actions/autoscuole-settings.actions";
import {
  buildWhatsAppLink,
  licenseCategoryWithArticle,
  renderWelcomeMessage,
} from "@/lib/autoscuole/whatsapp-welcome";
import { cn } from "@/lib/utils";

type WelcomeContext =
  | { allowed: false }
  | { allowed: true; template: string; staffName: string; companyName: string };

// Un giro solo per pagina: il testo cambia di rado e la scheda allievo si apre
// e si chiude di continuo. Il pane delle impostazioni lo svuota quando salva.
let contextPromise: Promise<WelcomeContext | null> | null = null;

export function invalidateWhatsAppWelcomeContext() {
  contextPromise = null;
}

function loadContext(): Promise<WelcomeContext | null> {
  if (!contextPromise) {
    contextPromise = getWhatsAppWelcomeContext()
      .then((res) => (res.success ? res.data : null))
      .catch(() => null);
    // Un errore non resta in cache: alla prossima scheda si riprova.
    void contextPromise.then((value) => {
      if (value === null) contextPromise = null;
    });
  }
  return contextPromise;
}

/** Il contesto del messaggio: `undefined` mentre carica. */
export function useWhatsAppWelcomeContext(enabled = true) {
  const [context, setContext] = React.useState<WelcomeContext | null | undefined>(undefined);
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadContext().then((value) => {
      if (alive) setContext(value);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return context;
}

const buttonClass = cn(
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[#dddddd] bg-white px-4",
  "text-[13.5px] font-semibold text-[#222222]",
  "transition-[background-color,border-color] duration-200 ease-out",
  "hover:border-[#b0b0b0] hover:bg-[#f7f7f7] active:bg-[#f0f0f0]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#222222]/20",
);

/**
 * REG-767 — «Scrivi su WhatsApp» nell'intestazione della scheda allievo.
 *
 * Apre WhatsApp col testo di presa in carico già scritto (link `wa.me`): lo
 * manda chi lo apre, dal suo telefono o da WhatsApp Web. Solo titolare e
 * segreteria: il server lo dice in `allowed`, `canWrite` evita lo skeleton a
 * chi tanto non lo vedrebbe.
 */
export function StudentWhatsAppButton({
  canWrite,
  phone,
  firstName,
  lastName,
  licenseCategory,
  schoolName,
  onAddPhone,
  className,
}: {
  canWrite: boolean;
  phone: string | null | undefined;
  firstName: string;
  lastName: string;
  licenseCategory: string | null | undefined;
  /** Solo nel consorzio: l'autoscuola consorziata, per `{scuola}`. */
  schoolName?: string | null;
  /** Porta al campo Telefono della scheda, già in modifica. */
  onAddPhone: () => void;
  className?: string;
}) {
  const context = useWhatsAppWelcomeContext(canWrite);
  if (!canWrite || context === null || (context && !context.allowed)) return null;

  if (context === undefined) {
    return (
      <div className={cn("flex justify-center", className)}>
        <Skeleton className="h-9 w-[178px] rounded-full" />
      </div>
    );
  }

  const text = renderWelcomeMessage(context.template, {
    nome: firstName,
    cognome: lastName,
    staff: context.staffName,
    autoscuola: context.companyName,
    categoria: licenseCategoryWithArticle(licenseCategory),
    scuola: schoolName,
  });
  const link = buildWhatsAppLink(phone, text);

  return (
    <FadeIn className={cn("flex justify-center", className)}>
      {link.state === "ready" ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="student-whatsapp"
          className={buttonClass}
        >
          <WhatsAppGlyph size={16} />
          Scrivi su WhatsApp
        </a>
      ) : link.state === "missing" ? (
        <button
          type="button"
          data-testid="student-whatsapp-add-phone"
          onClick={onAddPhone}
          className={buttonClass}
        >
          <Plus className="size-4" strokeWidth={2} />
          Aggiungi il numero
        </button>
      ) : (
        <p
          data-testid="student-whatsapp-invalid"
          className="flex h-9 items-center gap-2 text-[13px] font-medium text-[#6a6a6a]"
        >
          <span className="text-[#b0b0b0]">
            <WhatsAppGlyph size={15} />
          </span>
          Numero non valido per WhatsApp
          <span aria-hidden className="text-[#dddddd]">·</span>
          <button type="button" className={cn(blueLinkClass, "text-[13px]")} onClick={onAddPhone}>
            Correggi
          </button>
        </p>
      )}
    </FadeIn>
  );
}
