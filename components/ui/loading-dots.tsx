import { cn } from "@/lib/utils";

/**
 * LoadingDots — lo stato di loading unico di TUTTI i bottoni (proto .ab-dots):
 * 3 puntini 7px che pulsano a cascata (scale 0.4/opacity 0.35 → 1), 1s loop.
 * I puntini ereditano il colore del testo (bg-current): bianchi sui bottoni
 * near-black/navy, scuri su quelli chiari. Usare al posto di Loader2/spinner.
 * min-h-[1lh]: occupa l'altezza di una riga di testo, così il bottone che
 * sostituisce la label coi dots non si restringe.
 */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex min-h-[1lh] items-center gap-1.5", className)}
      aria-label="Caricamento"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[7px] rounded-full bg-current [animation:loading-dots-pulse_1s_infinite_ease-in-out_both]"
          style={{ animationDelay: `${(i - 2) * 0.16}s` }}
        />
      ))}
    </span>
  );
}
