"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";

import { WhatsAppGlyph } from "@/components/pages/Autoscuole/NeverAccessedNudge";
import { useWhatsAppWelcomeContext } from "@/components/pages/Autoscuole/StudentWhatsAppButton";
import {
  DEFAULT_WELCOME_TEMPLATE,
  WELCOME_PLACEHOLDERS,
  WELCOME_TEMPLATE_MAX_LENGTH,
  licenseCategoryWithArticle,
  renderWelcomeMessage,
} from "@/lib/autoscuole/whatsapp-welcome";
import { cn } from "@/lib/utils";

/**
 * REG-767 — il testo che si apre in WhatsApp col tasto «Scrivi su WhatsApp»
 * della scheda allievo. Un testo per azienda; il pane salva da solo, qui quando
 * il campo perde il fuoco.
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
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const context = useWhatsAppWelcomeContext();

  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

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
    if (draft === value) return;
    void save(draft.trim() ? draft : null);
  };

  const insert = (token: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`;
    if (next.length > WELCOME_TEMPLATE_MAX_LENGTH) return;
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
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
    <div className="border-b border-[#ebebeb] py-[18px]" data-testid="whatsapp-welcome-section">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-[#222222]">
        <WhatsAppGlyph size={17} />
        Messaggio di presa in carico
      </div>
      <div className="mt-0.5 max-w-[560px] text-sm font-medium text-[#929292]">
        Il testo che si apre in WhatsApp quando tocchi «Scrivi su WhatsApp» nella scheda
        dell&apos;allievo. Lo mandi tu, dal telefono o da WhatsApp Web: Reglo non invia niente.
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        maxLength={WELCOME_TEMPLATE_MAX_LENGTH}
        placeholder={DEFAULT_WELCOME_TEMPLATE}
        aria-label="Messaggio di presa in carico"
        className={cn(
          "mt-4 block w-full resize-none rounded-xl border border-[#dddddd] bg-white px-3.5 py-3",
          "text-[14px] font-medium leading-[1.5] text-[#222222] placeholder:text-[#b0b0b0]",
          "outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#222222] focus:shadow-[0_0_0_1px_#222222]",
        )}
      />

      <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {placeholders.map((p) => (
          <button
            key={p.token}
            type="button"
            // mousedown: il clic non deve togliere il fuoco al campo (e salvarlo)
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(p.token)}
            className="group flex min-w-0 cursor-pointer items-baseline gap-2 text-left text-[13px]"
          >
            <span className="shrink-0 font-semibold text-[#222222] group-hover:underline">
              {p.token}
            </span>
            <span className="truncate font-medium text-[#929292]">{p.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 text-xs font-semibold text-[#555555]">Anteprima</div>
      <p
        data-testid="whatsapp-welcome-preview"
        className="mt-2 whitespace-pre-wrap rounded-2xl bg-[#f7f7f7] px-4 py-3 text-[14px] font-medium leading-[1.5] text-[#222222]"
      >
        {preview}
      </p>

      <div className="mt-3 flex min-h-5 items-center justify-between gap-3 text-[13px] font-medium">
        <AnimatePresence initial={false}>
          {saved ? (
            <motion.span
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-[#6a6a6a]"
            >
              Salvato
            </motion.span>
          ) : (
            <span />
          )}
        </AnimatePresence>
        {!isDefault ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDraft(DEFAULT_WELCOME_TEMPLATE);
              void save(null);
            }}
            className="cursor-pointer text-[#6a6a6a] underline-offset-2 hover:text-[#222222] hover:underline"
          >
            Ripristina il testo predefinito
          </button>
        ) : null}
      </div>
    </div>
  );
}
