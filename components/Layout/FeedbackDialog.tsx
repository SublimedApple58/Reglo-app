"use client";

import React from "react";
import Image from "next/image";
import { Play, Upload } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { submitProductFeedback } from "@/lib/actions/support.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

const RATING_LABELS: Record<number, string> = {
  0: "Tocca le stelle per valutare",
  1: "Non funziona",
  2: "Difficile da usare",
  3: "Diversi problemi",
  4: "Ho riscontrato qualche problema",
  5: "Funziona perfettamente",
};

const RATING_PLACEHOLDERS: Record<number, string> = {
  0: "",
  1: "Aiutaci a capire il problema",
  2: "Aiutaci a capire il problema",
  3: "Raccontaci cosa non ha funzionato",
  4: "Cosa possiamo fare per arrivare a 5?",
  5: "Cosa ti è piaciuto di più?",
};

const FEEDBACK_TAGS = ["Lentezza", "Bug", "Funzionalità mancante", "Altro"];

const WHATSAPP_URL = "https://wa.me/393477756855";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a10 10 0 0 0-8.5 15.27L2 22l4.86-1.46A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-2.88.86.86-2.8-.2-.31A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.48c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

/**
 * "Lascia un feedback" dal menu hamburger (stile proto). Il feedback viene
 * salvato (ProductFeedback) e notificato al team Reglo: si consulta dal
 * backoffice in /backoffice/feedback. Gli esiti post-invio indirizzano anche
 * al supporto WhatsApp.
 */
export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useFeedbackToast();
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [tags, setTags] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await submitProductFeedback({
        rating,
        tags,
        message: message.trim() || undefined,
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Invio del feedback non riuscito." });
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hover || rating;

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setSent(false);
        setRating(0);
        setHover(0);
        setTags([]);
        setMessage("");
      }, 250);
    }
  };

  const close = () => handleOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[20px] px-8 pb-7 pt-8">
        {!sent ? (
          <>
            <div className="mb-1 text-center">
              <DialogTitle className="mb-1.5 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Lascia un feedback
              </DialogTitle>
              <p className="text-sm font-medium leading-normal text-[#6a6a6a]">
                Aiutaci a migliorare Reglo. Bastano pochi secondi.
              </p>
            </div>
            <div className="mb-2 flex flex-col items-center gap-2">
              <div className="flex gap-2.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${star} stelle`}
                    className={cn(
                      "cursor-pointer text-[34px] leading-none transition-transform hover:scale-110",
                      star <= shown ? "text-[#ffb400]" : "text-[#e0e0e0]",
                    )}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="h-[18px] text-[13px] font-semibold text-[#929292]">
                {RATING_LABELS[shown]}
              </div>
            </div>
            {rating >= 1 && rating <= 4 && (
              <div className="mb-1">
                <div className="mb-2.5 text-[13px] font-semibold text-[#444444]">
                  Cosa possiamo migliorare?
                </div>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_TAGS.map((tag) => {
                    const selected = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setTags((cur) =>
                            cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
                          )
                        }
                        className={cn(
                          "cursor-pointer rounded-[20px] border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-all",
                          selected
                            ? "border-navy-900 bg-[#eeeef4] text-navy-900"
                            : "border-[#dddddd] bg-white text-[#444444] hover:border-[#c1c1c1]",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-1">
              <div className="mb-2 text-[13px] font-semibold text-[#444444]">
                Il tuo messaggio <span className="font-medium text-[#bbbbbb]">(facoltativo)</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={RATING_PLACEHOLDERS[rating]}
                className="min-h-[100px] w-full resize-none rounded-[12px] border border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-[15px] font-medium leading-normal text-foreground outline-none transition focus:border-navy-900 focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={rating === 0 || submitting}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-gradient-to-br from-[#2d2d4a] to-[#1a1a2e] py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(26,26,46,0.35)] transition-opacity hover:opacity-95 disabled:cursor-default disabled:opacity-50"
            >
              {submitting ? <LoadingDots className="min-h-[1.5em]" /> : "Invia feedback"}
            </button>
          </>
        ) : rating === 5 ? (
          /* ── Esito 5 stelle: richiesta video testimonial ── */
          <div className="pb-0.5">
            <DialogTitle className="mb-5 text-lg font-bold leading-tight text-foreground">
              Grazie del feedback!
            </DialogTitle>
            <div className="mb-[18px] flex items-center gap-[18px]">
              <div className="relative flex h-[172px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#222222]">
                <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white/90">
                  <Play className="ml-0.5 size-[18px] fill-[#222222] text-[#222222]" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 text-base font-bold leading-snug text-foreground [text-wrap:pretty]">
                  Apprezziamo molto il tuo parere
                </div>
                <div className="text-[13px] font-medium leading-normal text-[#6a6a6a] [text-wrap:pretty]">
                  Raccontaci in un breve video verticale cosa ti piace di Reglo. Il video verrà
                  pubblicato sul nostro sito con il nome della tua autoscuola in evidenza, ottima
                  visibilità anche per voi.
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                onClick={close}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-[#25d366] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(37,211,102,0.30)] transition-colors hover:bg-[#1fb455]"
              >
                <WhatsAppIcon />
                Invia su WhatsApp
              </a>
              <button
                type="button"
                onClick={close}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-[#e0e0e0] bg-white py-3 text-sm font-semibold text-[#333333] transition-colors hover:border-[#bdbdbd] hover:bg-[#fafafa]"
              >
                <Upload className="size-4" strokeWidth={1.8} />
                Carica video
              </button>
            </div>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={close}
                className="cursor-pointer text-[13.5px] font-semibold text-[#929292] transition-colors hover:text-[#555555]"
              >
                No, mi state antipatici!
              </button>
            </div>
          </div>
        ) : rating === 4 ? (
          /* ── Esito 4 stelle ── */
          <div className="py-1.5 text-center">
            <Image
              src="/images/menu/feedback-mid.png"
              alt=""
              width={124}
              height={124}
              className="mx-auto mb-4 block h-[124px] w-[124px] select-none object-contain"
            />
            <DialogTitle className="mb-1.5 text-xl font-bold text-foreground">
              Ci manca poco al massimo
            </DialogTitle>
            <p className="mx-auto mb-6 max-w-[340px] text-sm font-medium leading-normal text-[#6a6a6a] [text-wrap:pretty]">
              Abbiamo registrato cosa possiamo fare per arrivare a 5. La tua segnalazione va dritta
              al team di sviluppo: ci lavoriamo e ti aggiorniamo appena risolto.
            </p>
            <button
              type="button"
              onClick={close}
              className="inline-block cursor-pointer rounded-[10px] bg-[#222222] px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Chiudi
            </button>
          </div>
        ) : (
          /* ── Esito 1-3 stelle ── */
          <div className="py-1.5 text-center">
            <Image
              src="/images/menu/feedback-low.png"
              alt=""
              width={124}
              height={124}
              className="mx-auto mb-4 block h-[124px] w-[124px] select-none object-contain"
            />
            <DialogTitle className="mb-1.5 text-xl font-bold text-foreground">
              Raccontaci cosa non ha funzionato
            </DialogTitle>
            <p className="mx-auto mb-[22px] max-w-[330px] text-sm font-medium leading-normal text-[#6a6a6a] [text-wrap:pretty]">
              Il tuo riscontro va dritto al team. Se preferisci parlarne direttamente, scrivici: ti
              rispondiamo in giornata.
            </p>
            <div className="flex justify-center gap-2.5">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                onClick={close}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#25d366] px-[22px] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(37,211,102,0.30)] transition-colors hover:bg-[#1fb455]"
              >
                <WhatsAppIcon />
                Contattaci
              </a>
              <button
                type="button"
                onClick={close}
                className="inline-flex cursor-pointer items-center rounded-[10px] border-[1.5px] border-[#e0e0e0] bg-white px-[22px] py-3 text-sm font-semibold text-[#333333] transition-colors hover:border-[#bdbdbd] hover:bg-[#fafafa]"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
