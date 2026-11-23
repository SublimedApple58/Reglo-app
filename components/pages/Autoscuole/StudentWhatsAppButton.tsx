"use client";

import React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { WhatsAppGlyph } from "@/components/pages/Autoscuole/NeverAccessedNudge";
import { inlineLinkClass } from "@/components/pages/Autoscuole/student-detail-ui";
import { getWhatsAppWelcomeContext } from "@/lib/actions/autoscuole-settings.actions";
import {
  WELCOME_SECTION_ANCHOR,
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

/** Il pane Promemoria e notifiche, già scrollato sul blocco del messaggio. */
export function useWelcomeSettingsHref() {
  const locale = useLocale();
  return `/${locale}/user/autoscuole?tab=settings&pane=reminders#${WELCOME_SECTION_ANCHOR}`;
}

// REG-775: capsula bianca in rilievo, come i `Button` outline del design system.
const headerButtonClass = cn(
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 shadow-clay-raise",
  "text-[13.5px] font-semibold text-[#222222]",
  "transition-[transform,background-color] duration-200 ease-out",
  "hover:bg-[#fafafa] active:scale-[0.98] active:shadow-clay-raise-pressed",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#222222]/20",
);

const primaryButtonClass = cn(
  "inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#111111] px-6",
  "text-[15px] font-semibold text-white transition-colors duration-200 ease-out hover:bg-[#2b2b2b]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/30 focus-visible:ring-offset-2",
);

type WelcomeStudent = {
  phone: string | null | undefined;
  firstName: string;
  lastName: string;
  licenseCategory: string | null | undefined;
  /** Solo nel consorzio: l'autoscuola consorziata, per `{scuola}`. */
  schoolName?: string | null;
};

/**
 * REG-767 — «Messaggio di benvenuto»: apre WhatsApp col testo già scritto
 * (link `wa.me`), lo manda chi lo apre dal suo telefono o da WhatsApp Web.
 * Solo titolare e segreteria: il server lo dice in `allowed`, `canWrite` evita
 * lo skeleton a chi tanto non lo vedrebbe.
 *
 * - `header`: intestazione della scheda allievo, discreto.
 * - `primary`: la conferma dopo «Crea allievo» / «Aggiungi allievo».
 */
export function StudentWhatsAppButton({
  canWrite,
  student,
  onAddPhone,
  variant = "header",
  align = "center",
  className,
}: {
  canWrite: boolean;
  student: WelcomeStudent;
  /** Porta al campo Telefono della scheda, già in modifica. Senza, niente «Aggiungi il numero». */
  onAddPhone?: () => void;
  variant?: "header" | "primary";
  /** «start» nella testata compatta del drawer (REG-775), allineato al nome. */
  align?: "center" | "start";
  className?: string;
}) {
  const context = useWhatsAppWelcomeContext(canWrite);
  const settingsHref = useWelcomeSettingsHref();
  if (!canWrite || context === null || (context && !context.allowed)) return null;

  const primary = variant === "primary";
  if (context === undefined) {
    return (
      <div className={cn("flex flex-col", align === "start" ? "items-start" : "items-center", className)}>
        <Skeleton className={primary ? "h-12 w-full rounded-full" : "h-9 w-[196px] rounded-full"} />
      </div>
    );
  }

  const text = renderWelcomeMessage(context.template, {
    nome: student.firstName,
    cognome: student.lastName,
    staff: context.staffName,
    autoscuola: context.companyName,
    categoria: licenseCategoryWithArticle(student.licenseCategory),
    scuola: student.schoolName,
  });
  const link = buildWhatsAppLink(student.phone, text);

  if (link.state === "missing" && !onAddPhone) return null;

  return (
    <FadeIn className={cn("flex flex-col", align === "start" ? "items-start" : "items-center", className)}>
      {link.state === "ready" ? (
        <>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="student-whatsapp"
            className={primary ? primaryButtonClass : headerButtonClass}
          >
            <WhatsAppGlyph size={primary ? 18 : 15} />
            Messaggio di benvenuto
          </a>
          <Link
            href={settingsHref}
            data-testid="student-whatsapp-edit"
            className={cn(
              "text-[12px] font-medium text-[#929292] underline-offset-2 transition-colors duration-200 hover:text-[#222222] hover:underline",
              primary ? "mt-3" : "mt-1.5",
            )}
          >
            Modifica messaggio
          </Link>
        </>
      ) : link.state === "missing" ? (
        <button
          type="button"
          data-testid="student-whatsapp-add-phone"
          onClick={onAddPhone}
          className={headerButtonClass}
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Aggiungi il numero
        </button>
      ) : (
        <p
          data-testid="student-whatsapp-invalid"
          className="flex min-h-8 items-center gap-2 text-[13px] font-medium text-[#6a6a6a]"
        >
          <span className="text-[#b0b0b0]">
            <WhatsAppGlyph size={15} />
          </span>
          Numero non valido per WhatsApp
          {onAddPhone ? (
            <>
              <span aria-hidden className="text-[#dddddd]">·</span>
              <button type="button" className={cn(inlineLinkClass, "text-[13px]")} onClick={onAddPhone}>
                Correggi
              </button>
            </>
          ) : null}
        </p>
      )}
    </FadeIn>
  );
}

/**
 * La conferma che prende il posto del form dopo la creazione: chi è stato
 * aggiunto, il messaggio di benvenuto come azione principale, «Fatto».
 */
export function StudentAddedWelcomeStep({
  canWrite,
  student,
  onDone,
  className = "px-7 pb-6 pt-8",
}: {
  canWrite: boolean;
  student: WelcomeStudent;
  onDone: () => void;
  /** Il padding: la modale del consorzio non ne ha, quella shadcn sì. */
  className?: string;
}) {
  return (
    <FadeIn className={cn("text-center", className)}>
      <div data-testid="student-added-step">
        <p className="text-[19px] font-semibold tracking-[-0.2px] text-[#222222]">Allievo aggiunto</p>
        <p className="mx-auto mt-1 max-w-[320px] text-[13.5px] font-medium text-[#929292]">
          Manda a {student.firstName} il messaggio di benvenuto su WhatsApp.
        </p>
        <StudentWhatsAppButton
          className="mt-6"
          variant="primary"
          canWrite={canWrite}
          student={student}
        />
        <button
          type="button"
          onClick={onDone}
          className="mt-5 cursor-pointer select-none px-2 py-2 text-sm font-semibold text-[#222222] transition-colors duration-200 hover:text-[#555555]"
        >
          Fatto
        </button>
      </div>
    </FadeIn>
  );
}
