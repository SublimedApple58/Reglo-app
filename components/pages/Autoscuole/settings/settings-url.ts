"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

/**
 * REG-778 — la posizione dentro Impostazioni vive nell'URL:
 * `?tab=settings&pane=bookings&sub=limiti`.
 *
 * - Cambiare sezione (`pane`) aggiunge una voce alla cronologia (push): il
 *   tasto indietro torna alla sezione di prima.
 * - Cambiare sotto-scheda (`sub`) sostituisce la voce (replace): l'indietro
 *   non ripercorre ogni scheda guardata, ma al refresh si resta lì.
 *
 * Si usa `window.history` e non il router: Next sincronizza `useSearchParams`
 * con pushState/replaceState senza rifare il giro sul server.
 */

/**
 * Vero se la sezione che contiene il componente è quella a schermo. Le sezioni
 * restano montate anche quando sono nascoste (keep-alive), e solo quella
 * visibile può leggere e scrivere `sub`. Fuori da Impostazioni vale sempre.
 */
export const SettingsPaneActiveContext = React.createContext(true);

export function writeSettingsUrl(
  params: Record<string, string | null>,
  mode: "push" | "replace",
) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href === window.location.href) return;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** Sotto-scheda di una sezione, letta da e scritta in `?sub=`. */
export function useSettingsSubTab<T extends string>(
  keys: ReadonlyArray<T>,
  fallback: T,
): [T, (next: T) => void] {
  const active = React.useContext(SettingsPaneActiveContext);
  const searchParams = useSearchParams();
  const isKey = (v: string | null | undefined): v is T => !!v && keys.includes(v as T);
  const fromUrl = active ? searchParams?.get("sub") : null;
  const [value, setValue] = React.useState<T>(() => (isKey(fromUrl) ? fromUrl : fallback));

  // URL → scheda: refresh, indietro/avanti, link con `sub`.
  React.useEffect(() => {
    if (isKey(fromUrl)) setValue(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  // Scheda → URL, solo per la sezione a schermo. Tornando su una sezione
  // l'URL riprende la scheda che ci si era lasciata.
  React.useEffect(() => {
    if (!active) return;
    writeSettingsUrl({ sub: value === fallback ? null : value }, "replace");
  }, [active, value, fallback]);

  return [value, setValue];
}
