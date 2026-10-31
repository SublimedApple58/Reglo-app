import { cn } from "@/lib/utils";
import type { RoadLiveSession } from "@/lib/autoscuole/road/client";
import { hhmm } from "./road-ui";

/**
 * REG-699: «rientra in tempo?» per la vista «Dal vivo».
 * - Con il giro il telefono manda il rientro stimato: «Rientro 10:52 · 3 min oltre».
 * - Senza: quanto manca alla fine, «Mancano 12 min» / «3 min oltre la fine».
 * Oltre la fine il testo passa al nero (niente colori: è un'informazione, non un allarme).
 */
export function returnInfo(s: RoadLiveSession, now: number): { text: string; late: boolean } | null {
  const end = s.lesson.endsAt ? new Date(s.lesson.endsAt).getTime() : null;
  if (!end) return null;
  if (s.etaAt) {
    const eta = new Date(s.etaAt).getTime();
    const delta = Math.round((eta - end) / 60_000);
    const tail = Math.abs(delta) <= 1 ? "in orario" : delta > 0 ? `${delta} min oltre` : `${-delta} min prima`;
    return { text: `Rientro ${hhmm(new Date(eta))} · ${tail}`, late: delta > 1 };
  }
  const left = end - now;
  if (left >= 0) return { text: `Mancano ${Math.ceil(left / 60_000)} min`, late: false };
  return { text: `${Math.ceil(-left / 60_000)} min oltre la fine`, late: true };
}

export function RoadLiveReturn({ s, now, className }: { s: RoadLiveSession; now: number; className?: string }) {
  const info = returnInfo(s, now);
  if (!info) return null;
  return (
    <div
      className={cn("truncate text-[12.5px] tabular-nums", info.late ? "font-medium text-[#111111]" : "text-[#6a6a6a]", className)}
      data-testid="road-live-return"
    >
      {info.text}
    </div>
  );
}
