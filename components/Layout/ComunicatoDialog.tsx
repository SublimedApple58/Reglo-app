"use client";

import React from "react";
import Image from "next/image";

import { sendBroadcastPush } from "@/lib/actions/autoscuole.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DEST_OPTIONS = [
  { value: "all", label: "Tutti gli utenti" },
  { value: "STUDENT", label: "Solo Allievi" },
  { value: "INSTRUCTOR", label: "Solo Istruttori" },
  { value: "OWNER", label: "Solo Titolari" },
] as const;

const fieldClass =
  "w-full rounded-[12px] border border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-navy-900 focus:bg-white";

/**
 * "Invia comunicato" dal menu hamburger (stile proto): notifica push broadcast
 * agli utenti dell'autoscuola — usa la sendBroadcastPush esistente.
 */
export function ComunicatoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useFeedbackToast();
  const [dest, setDest] = React.useState<string>("all");
  const [titolo, setTitolo] = React.useState("");
  const [messaggio, setMessaggio] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const destLabel = DEST_OPTIONS.find((o) => o.value === dest)?.label ?? "Tutti gli utenti";
  const canSend = Boolean(titolo.trim() && messaggio.trim()) && !sending;

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // reset alla chiusura
      setTimeout(() => {
        setSent(false);
        setTitolo("");
        setMessaggio("");
        setDest("all");
      }, 250);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const res = await sendBroadcastPush({
      title: titolo.trim(),
      body: messaggio.trim(),
      role: dest === "all" ? null : (dest as "OWNER" | "INSTRUCTOR" | "STUDENT"),
    });
    setSending(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Errore invio comunicato." });
      return;
    }
    const d = res.data!;
    if (d.failed) {
      toast.error({
        description: `${d.targeted} destinatari, ${d.sent} ricevute, ${d.failed} fallite.`,
      });
    }
    setSent(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[20px] px-8 pb-7 pt-8">
        {!sent ? (
          <>
            <div className="mb-2 text-center">
              <Image
                src="/images/menu/bell-gold.png"
                alt=""
                width={88}
                height={88}
                className="mx-auto mb-3.5 block h-[88px] w-[88px] object-contain"
              />
              <DialogTitle className="mb-1.5 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Invia comunicato
              </DialogTitle>
              <p className="text-sm font-medium leading-normal text-[#6a6a6a]">
                Invia una notifica agli utenti della tua autoscuola.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[#444444]">Destinatari</div>
                <Select value={dest} onValueChange={setDest}>
                  <SelectTrigger className="h-auto w-full rounded-[12px] border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-[15px] font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEST_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[#444444]">Titolo</div>
                <input
                  value={titolo}
                  onChange={(e) => setTitolo(e.target.value)}
                  placeholder="Titolo notifica"
                  maxLength={80}
                  className={cn(fieldClass, "font-bold")}
                />
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[#444444]">Messaggio</div>
                <textarea
                  value={messaggio}
                  onChange={(e) => setMessaggio(e.target.value)}
                  placeholder="Corpo del messaggio"
                  maxLength={300}
                  className={cn(fieldClass, "min-h-[92px] resize-none font-medium leading-normal")}
                />
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[12px] bg-gradient-to-br from-[#2d2d4a] to-[#1a1a2e] py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(26,26,46,0.35)] transition-opacity hover:opacity-95 disabled:cursor-default disabled:opacity-50"
              >
                {sending ? <LoadingDots className="min-h-[1.5em]" /> : "Invia notifica"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-2 pb-4 pt-6 text-center">
            <Image
              src="/images/menu/bell-gold.png"
              alt=""
              width={96}
              height={96}
              className="mx-auto mb-5 block h-24 w-24 object-contain"
            />
            <DialogTitle className="mb-2 text-[19px] font-bold tracking-[-0.2px] text-foreground">
              Comunicato inviato
            </DialogTitle>
            <p className="text-sm font-medium leading-normal text-[#6a6a6a]">
              Inviato correttamente a <b className="font-semibold text-foreground">{destLabel}</b>.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
