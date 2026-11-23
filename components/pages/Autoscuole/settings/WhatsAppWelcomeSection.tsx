"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";

import { WhatsAppGlyph } from "@/components/pages/Autoscuole/NeverAccessedNudge";
import { SettingsSection } from "@/components/pages/Autoscuole/settings/settings-rows";
import { useWhatsAppWelcomeContext } from "@/components/pages/Autoscuole/StudentWhatsAppButton";
import {
  DEFAULT_WELCOME_TEMPLATE,
  WELCOME_PLACEHOLDERS,
  WELCOME_SECTION_ANCHOR,
  WELCOME_TEMPLATE_MAX_LENGTH,
  insertToken,
  licenseCategoryWithArticle,
  renderWelcomeMessage,
} from "@/lib/autoscuole/whatsapp-welcome";
import { cn } from "@/lib/utils";

/**
 * REG-767 — «Messaggio di benvenuto»: il testo che il tasto omonimo apre in
 * WhatsApp. Un testo per azienda; salva quando il campo perde il fuoco. I
 * segnaposto si inseriscono da «Inserisci», l'anteprima sta sotto.
 * «Modifica messaggio» (scheda allievo) arriva qui con l'ancora.
 *
 * REG-771 bis: «Inserisci» non è più un menu. Il menu toglieva il fuoco al
 * campo, quindi partiva un salvataggio a ogni apertura, il cursore si perdeva,
 * e se il salvataggio finiva dopo l'inserimento il testo vecchio tornava nel
 * campo cancellando il segnaposto. Ora sono parole sempre in vista che non
 * prendono il fuoco (`onMouseDown` → `preventDefault`): il segnaposto entra
 * dove sta il cursore, con gli spazi giusti, e si salva una volta all'uscita.
 */

/** Il logo WhatsApp a un colore, con la stessa firma delle icone lucide. */
function WhatsAppSectionIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <WhatsAppGlyph size={19} />
    </span>
  );
}

export function WhatsAppWelcomeSection({
  value,
  consortium,
  onSave,
}: {
  value: string;
  consortium: boolean;
  /** `null` = torna al testo predefinito. Vero se il salvataggio è andato. */
  onSave: (next: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = React.useState(value);
  const [saved, setSaved] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const selection = React.useRef<{ start: number; end: number } | null>(null);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const context = useWhatsAppWelcomeContext();

  // Il valore salvato rientra nel campo solo se non ci si sta scrivendo: un
  // salvataggio che torna mentre il campo è attivo non deve riscrivere il testo.
  React.useEffect(() => {
    if (document.activeElement === textareaRef.current) return;
    setDraft(value);
  }, [value]);

  // Il campo cresce col testo (niente barra di scorrimento interna).
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 3}px`;
  }, [draft]);
  React.useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // Arrivati da «Modifica messaggio»: il blocco va in vista.
  React.useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== `#${WELCOME_SECTION_ANCHOR}`) return;
    const t = setTimeout(
      () => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      250,
    );
    return () => clearTimeout(t);
  }, []);

  const save = async (next: string | null) => {
    const ok = await onSave(next);
    if (!ok) {
      setDraft(value);
      return;
    }
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  };

  const rememberSelection = () => {
    const el = textareaRef.current;
    if (el) selection.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  const commit = () => {
    rememberSelection();
    if (draft === value) return;
    void save(draft.trim() ? draft : null);
  };

  const insert = (token: string) => {
    const el = textareaRef.current;
    // Campo attivo: il cursore di adesso. Altrimenti dove lo si era lasciato,
    // o in fondo se non lo si è mai toccato.
    const focused = el != null && document.activeElement === el;
    const start = focused ? el.selectionStart : (selection.current?.start ?? draft.length);
    const end = focused ? el.selectionEnd : (selection.current?.end ?? draft.length);
    const { text: next, caret } = insertToken(draft, start, end, token);
    if (next.length > WELCOME_TEMPLATE_MAX_LENGTH) return;
    setDraft(next);
    selection.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      // `preventScroll`: a 390px il focus non deve far saltare la pagina.
      if (document.activeElement !== field) field.focus({ preventScroll: true });
      field.setSelectionRange(caret, caret);
    });
  };

  const placeholders = WELCOME_PLACEHOLDERS.filter((p) => consortium || !p.consortiumOnly);
  const companyName = context && context.allowed ? context.companyName : "";
  const preview = renderWelcomeMessage(draft.trim() ? draft : DEFAULT_WELCOME_TEMPLATE, {
    nome: "Giulia",
    cognome: "Rossi",
    staff: (context && context.allowed && context.staffName) || "Marco",
    autoscuola: companyName || "la tua autoscuola",
    categoria: licenseCategoryWithArticle(consortium ? "CQC" : "B"),
    scuola: consortium ? "Autoscuola Centrale" : null,
  });
  const isDefault = (draft.trim() ? draft : DEFAULT_WELCOME_TEMPLATE) === DEFAULT_WELCOME_TEMPLATE;

  return (
    <div ref={rootRef}>
      <SettingsSection
        id={WELCOME_SECTION_ANCHOR}
        testId="whatsapp-welcome-section"
        title="Messaggio di benvenuto"
        icon={WhatsAppSectionIcon}
        description="Si apre in WhatsApp dal tasto nella scheda dell'allievo."
      >
        <div className="py-4">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onSelect={rememberSelection}
            rows={3}
            maxLength={WELCOME_TEMPLATE_MAX_LENGTH}
            placeholder={DEFAULT_WELCOME_TEMPLATE}
            aria-label="Messaggio di benvenuto"
            className={cn(
              "block min-h-[84px] w-full resize-none overflow-hidden rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-3",
              "text-[14px] font-medium leading-[1.5] text-[#222222] placeholder:text-[#b0b0b0]",
              "outline-none transition-[border-color] duration-200 hover:border-[#929292] focus:border-[#222222]",
            )}
          />

          <div className="mt-2 flex items-start justify-between gap-3 text-[13px] font-medium">
            <div
              data-testid="whatsapp-welcome-insert"
              className="flex flex-wrap items-center gap-x-[18px] gap-y-0.5 text-[13.5px]"
            >
              <span className="font-medium text-[#929292]">Inserisci</span>
              {placeholders.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  data-token={p.token}
                  title={p.token === "{autoscuola}" && consortium ? "Nome del consorzio" : p.label}
                  // Il campo non perde il fuoco: niente salvataggio a metà, cursore intatto.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(p.token)}
                  className="min-h-8 cursor-pointer font-semibold text-[#222222] outline-none transition-[color,transform] duration-200 ease-out hover:text-[#555555] focus-visible:underline active:scale-[0.97]"
                >
                  {p.token === "{autoscuola}" && consortium ? "Consorzio" : p.short}
                </button>
              ))}
            </div>

            <div className="flex min-h-8 shrink-0 items-center gap-3">
              <AnimatePresence initial={false}>
                {saved ? (
                  <motion.span
                    key="saved"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="text-[#929292]"
                  >
                    Salvato
                  </motion.span>
                ) : null}
              </AnimatePresence>
              {!isDefault ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setDraft(DEFAULT_WELCOME_TEMPLATE);
                    void save(null);
                  }}
                  className="cursor-pointer text-[#929292] underline-offset-2 transition-colors duration-200 hover:text-[#222222] hover:underline"
                >
                  Ripristina
                </button>
              ) : null}
            </div>
          </div>

          <p
            data-testid="whatsapp-welcome-preview"
            className="mt-3 whitespace-pre-wrap rounded-xl bg-[#f7f7f7] px-3.5 py-2.5 text-[13px] font-medium leading-[1.5] text-[#6a6a6a]"
          >
            {preview}
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
