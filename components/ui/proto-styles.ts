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
