"use client";

import React from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { sendSupportMessage } from "@/lib/actions/support.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

/**
 * Stato "Segretaria AI non ancora attivata sull'autoscuola" (feature flag off),
 * condiviso tra la pagina Segretaria e il pane Impostazioni. Stesso linguaggio
 * dell'onboarding linea del proto: icona 3D, pitch, CTA. La CTA invia una
 * richiesta reale al team Reglo tramite la chat del centro assistenza.
 */
export function VoiceInactiveState() {
  const toast = useFeedbackToast();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  // Funziona sia da /user/autoscuole (overlay impostazioni) sia da /user/autoscuole/voice.
  const assistenzaUrl = `${pathname.replace(/\/voice\/?$/, "")}/assistenza`;

  const requestActivation = async () => {
    if (sending) return;
    setSending(true);
    const res = await sendSupportMessage({
      body: "Vorrei attivare la Segretaria AI sulla mia autoscuola. Potete ricontattarmi per l'attivazione?",
    });
    setSending(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile inviare la richiesta." });
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center px-6 py-10 text-center">
      <Image
        src="/images/nav/segretaria-3d.png"
        alt=""
        width={128}
        height={128}
        className="mb-5 select-none object-contain"
      />
      <div className="text-xl font-bold tracking-[-0.2px] text-foreground">Segretaria AI</div>
      <div className="mt-3 max-w-[460px] text-[15px] font-medium leading-[1.55] text-[#6a6a6a] [text-wrap:pretty]">
        Il tuo assistente vocale che risponde alle chiamate al posto tuo, 24/7: dà risposte
        immediate agli allievi, prende le richieste e alleggerisce la segreteria. L&apos;attivazione
        avviene insieme al team Reglo.
      </div>
      {sent ? (
        <div className="mt-6 flex flex-col items-center">
          <div className="flex items-center gap-2.5 rounded-full bg-[#e7f6ec] px-5 py-2.5">
            <Check className="size-4 text-[#1a7f50]" strokeWidth={2.4} />
            <span className="text-sm font-semibold text-[#1a7f50]">
              Richiesta inviata! Il team Reglo ti ricontatterà a breve.
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push(assistenzaUrl)}
            className="mt-4 cursor-pointer text-sm font-semibold text-foreground underline decoration-1 underline-offset-2 hover:text-navy-900"
          >
            Apri il centro assistenza
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={requestActivation}
          disabled={sending}
          className="mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-[26px] py-3 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
        >
          {sending && <Loader2 className="size-4 animate-spin" />}
          Richiedi attivazione
        </button>
      )}
    </div>
  );
}
