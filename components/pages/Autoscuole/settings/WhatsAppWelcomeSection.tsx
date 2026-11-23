"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WhatsAppGlyph } from "@/components/pages/Autoscuole/NeverAccessedNudge";
import { useWhatsAppWelcomeContext } from "@/components/pages/Autoscuole/StudentWhatsAppButton";
import {
  DEFAULT_WELCOME_TEMPLATE,
  WELCOME_PLACEHOLDERS,
  WELCOME_SECTION_ANCHOR,
  WELCOME_TEMPLATE_MAX_LENGTH,
  licenseCategoryWithArticle,
  renderWelcomeMessage,
} from "@/lib/autoscuole/whatsapp-welcome";
import { cn } from "@/lib/utils";

/**
 * REG-767 — «Messaggio di benvenuto»: il testo che il tasto omonimo apre in
 * WhatsApp. Un testo per azienda; salva quando il campo perde il fuoco. I
 * segnaposto si inseriscono dal menu «Inserisci», l'anteprima sta sotto.
 * «Modifica messaggio» (scheda allievo) arriva qui con l'ancora.
 */
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

  React.useEffect(() => setDraft(value), [value]);
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

  const commit = () => {
    const el = textareaRef.current;
    if (el) selection.current = { start: el.selectionStart, end: el.selectionEnd };
    if (draft === value) return;
    void save(draft.trim() ? draft : null);
  };

  const insert = (token: string) => {
    const start = selection.current?.start ?? draft.length;
    const end = selection.current?.end ?? draft.length;
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`;
    if (next.length > WELCOME_TEMPLATE_MAX_LENGTH) return;
    setDraft(next);
    const caret = start + token.length;
    selection.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(caret, caret);
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
    <div
      ref={rootRef}
      id={WELCOME_SECTION_ANCHOR}
      className="scroll-mt-6 border-b border-[#ebebeb] py-[18px]"
      data-testid="whatsapp-welcome-section"
    >
      <div className="flex items-center gap-2 text-[15px] font-semibold text-[#222222]">
        <WhatsAppGlyph size={17} />
        Messaggio di benvenuto
      </div>
      <div className="mt-0.5 text-sm font-medium text-[#929292]">
        Si apre in WhatsApp dalla scheda dell&apos;allievo.
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        maxLength={WELCOME_TEMPLATE_MAX_LENGTH}
        placeholder={DEFAULT_WELCOME_TEMPLATE}
        aria-label="Messaggio di benvenuto"
        className={cn(
          "mt-3.5 block w-full resize-none rounded-xl border border-[#dddddd] bg-white px-3.5 py-3",
          "text-[14px] font-medium leading-[1.5] text-[#222222] placeholder:text-[#b0b0b0]",
          "outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#222222] focus:shadow-[0_0_0_1px_#222222]",
        )}
      />

      <div className="mt-2 flex min-h-7 items-center justify-between gap-3 text-[13px] font-medium">
        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid="whatsapp-welcome-insert"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md py-1 font-semibold text-[#222222] outline-none transition-colors duration-200 hover:text-[#555555]"
          >
            Inserisci
            <ChevronDown className="size-3.5" strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="z-[300] min-w-[220px]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {placeholders.map((p) => (
              <DropdownMenuItem key={p.token} onSelect={() => insert(p.token)}>
                {p.token === "{autoscuola}" && consortium ? "Nome del consorzio" : p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-3">
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
  );
}
