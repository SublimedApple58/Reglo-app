"use client";

import { Provider, createStore } from "jotai";
import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Store jotai dedicato a questo albero React.
 *
 * Senza un Provider, jotai usa lo store di modulo (default store), con due
 * conseguenze (REG-466):
 *
 * - SUL SERVER è uno solo per processo, condiviso da tutte le richieste.
 *   `useHydrateAtoms` idrata un atom una volta sola per store, quindi la prima
 *   richiesta ci scriveva la propria azienda e ogni richiesta successiva
 *   renderizzava l'HTML con l'azienda di qualcun altro: un account consorzio si
 *   vedeva servita la nav delle autoscuole (e l'errore di idratazione).
 * - SUL CLIENT sopravvive al logout, perché vive finché vive la scheda: dopo
 *   un nuovo login gli atom restavano quelli dell'account precedente.
 *
 * Creando lo store qui dentro ne nasce uno per ogni richiesta server e uno per
 * ogni montaggio dell'area autenticata (entrare nell'app dopo il login la
 * rimonta), quindi gli atom partono sempre dai dati dell'account corrente.
 */
export function JotaiStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createStore());
  return <Provider store={store}>{children}</Provider>;
}
