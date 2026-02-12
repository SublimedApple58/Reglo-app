import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PageLoadingState({
  label = "Caricamento in corso...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-panel flex min-h-[220px] w-full items-center justify-center p-6",
        className,
      )}
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function PageEmptyState({
  title = "Nessun risultato",
  description = "Non ci sono elementi da mostrare.",
  className,
  action,
}: {
  title?: string;
  description?: string;
  className?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className={cn(
        "glass-panel flex min-h-[240px] w-full items-center justify-center p-6",
        className,
      )}
    >
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/75 bg-white/85 shadow-sm">
          <Inbox className="h-5 w-5 text-primary" />
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action ? (
          <div className="pt-1">
            <Button type="button" variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PageErrorState({
  title = "Errore nel caricamento",
  description = "Si è verificato un problema durante il caricamento dei dati.",
  className,
  action,
}: {
  title?: string;
  description?: string;
  className?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className={cn(
        "glass-panel flex min-h-[240px] w-full items-center justify-center p-6",
        className,
      )}
    >
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50/80 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-700" />
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action ? (
          <div className="pt-1">
            <Button type="button" variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

