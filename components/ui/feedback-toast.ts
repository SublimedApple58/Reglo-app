"use client";

import React from "react";
import { useToast } from "@/hooks/use-toast";

type ToastPayload = {
  title?: string;
  description?: string;
};

/**
 * Errori "di guardia" che l'utente non deve mai vedere come toast.
 *
 * `SERVICE_NOT_ACTIVE` è il rifiuto di `requireServiceAccess`: non è un guasto,
 * è il server che dice "questa funzione non è compresa nel tuo piano". Per una
 * consorziata senza Reglo (REG-429) la vista ridotta ne può generare uno per
 * ogni componente che si monta, e il titolare si ritroverebbe una raffica di
 * toast rossi all'apertura di ogni pagina. Le chiamate vanno comunque evitate
 * a monte (è il motivo dei flag `affiliate`/`affiliateReduced`): questa è la
 * rete di sicurezza per i punti che ci sfuggono.
 */
const SILENT_ERRORS = [
  "SERVICE_NOT_ACTIVE",
  "NOT_A_CONSORZIO_AFFILIATE",
  "NOT_A_CONSORTIUM",
];

const isSilent = (payload: ToastPayload) => {
  const text = `${payload.title ?? ""} ${payload.description ?? ""}`;
  return SILENT_ERRORS.some((code) => text.includes(code));
};

export function useFeedbackToast() {
  const { toast } = useToast();

  return React.useMemo(
    () => ({
      success: (payload: ToastPayload) =>
        toast({
          title: payload.title ?? "Operazione completata",
          description: payload.description,
        }),
      info: (payload: ToastPayload) =>
        toast({
          title: payload.title ?? "Informazione",
          description: payload.description,
        }),
      error: (payload: ToastPayload) => {
        if (isSilent(payload)) {
          // Resta nei log del browser: se compare dove non deve, si vede.
          console.debug("[feedback-toast] errore silenziato:", payload.description);
          return;
        }
        return toast({
          variant: "destructive",
          title: payload.title ?? "Errore",
          description: payload.description,
        });
      },
    }),
    [toast],
  );
}
