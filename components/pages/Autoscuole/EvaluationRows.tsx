import { cn } from "@/lib/utils";

export type EvaluationRow = {
  itemId: string;
  label: string;
  scaleMax: number;
  score: number | null;
  notApplicable?: boolean;
};

/**
 * Voci del pagellino di una guida, in sola lettura (REG-443): una riga per
 * voce con le stelline. Condiviso fra lo storico in «Note» (`EvaluationRecap`)
 * e la card «Ultimo pagellino» della tab Road.
 */
export function EvaluationRows({ rows, className }: { rows: EvaluationRow[]; className?: string }) {
  return (
    <div className={cn("rounded-[10px] border border-[#ececec] bg-white px-3", className)}>
      {rows.map((row, i) => (
        <div
          key={row.itemId}
          className={cn("flex items-center justify-between gap-3 py-2", i > 0 && "border-t border-[#f4f4f6]")}
        >
          <span className={cn("text-[12.5px] font-medium", row.notApplicable ? "text-[#a3a3ad]" : "text-foreground")}>
            {row.label}
          </span>
          {/* Voce esclusa da questa guida: si mostra lo stesso, così si
              distingue "non si applicava" da "dimenticata". */}
          {row.notApplicable || row.score == null ? (
            <span className="shrink-0 text-[11.5px] font-medium text-[#a3a3ad]">— non valutabile</span>
          ) : (
            <span className="flex shrink-0 items-center gap-0.5 text-[11px]">
              {Array.from({ length: row.scaleMax }, (_, j) => (
                <span key={j} className={j < row.score! ? "text-yellow-400" : "text-gray-200"}>
                  ★
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
