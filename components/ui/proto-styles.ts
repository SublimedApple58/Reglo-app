/**
 * Classi condivise del design system redesign (skin "proto"):
 * usale per select/input nelle pane Impostazioni e nei dialog.
 */

/** Trigger di Select in stile proto. REG-774: campo «clay» incavato, raggio 14. */
export const PROTO_SELECT_TRIGGER =
  "h-auto w-full rounded-[14px] border-0 bg-white px-3.5 py-[11px] text-sm font-medium text-[#222222] shadow-clay-sink transition-colors focus-visible:shadow-clay-focus data-[state=open]:shadow-clay-focus";

/** Input testuale in stile proto, coerente col trigger sopra. */
export const PROTO_INPUT =
  "w-full rounded-[14px] border-0 bg-white px-3.5 py-[11px] text-sm font-medium text-[#222222] shadow-clay-sink outline-none transition-colors focus:shadow-clay-focus";

/**
 * REG-776 — card selezionabile (scelta fra 2–4 opzioni: Auto/Moto,
 * Birilli/Strada, piani, modalità…): stesso raggio dei campi (14), in rilievo
 * quando spenta, bordo interno nero quando scelta. Si compone con
 * {@link SELECTABLE_CARD_ON} / {@link SELECTABLE_CARD_OFF}.
 */
export const SELECTABLE_CARD =
  "cursor-pointer rounded-[14px] bg-white text-left transition-colors duration-200 ease-out disabled:cursor-default disabled:opacity-50";
export const SELECTABLE_CARD_ON = "bg-[#fafafa] shadow-clay-focus";
export const SELECTABLE_CARD_OFF = "shadow-clay-raise hover:bg-[#fafafa]";
