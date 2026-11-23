"use client";

import React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getBackofficeCompanyMaintenanceEvents,
  setBackofficeCompanyMaintenance,
} from "@/lib/actions/backoffice.actions";
import type { MaintenanceScope } from "@/lib/maintenance";

type MaintenanceEvent = {
  id: string;
  action: "activate" | "unlock" | "change_scope";
  scope: MaintenanceScope | null;
  actorKind: "owner" | "backoffice";
  actorLabel: string;
  createdAt: string;
};

export type MaintenanceState = { scope: MaintenanceScope | null; since: string | null };

const SCOPE_LABEL: Record<MaintenanceScope, string> = {
  OWNER_ONLY: "Solo titolare",
  EVERYONE: "Tutti",
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const describeEvent = (event: MaintenanceEvent) => {
  const who = event.actorKind === "owner" ? `${event.actorLabel}, titolare` : event.actorLabel;
  const scope = event.scope ? ` · ${SCOPE_LABEL[event.scope].toLowerCase()}` : "";
  if (event.action === "unlock") return `Sbloccata da ${who}`;
  if (event.action === "change_scope") return `Ambito cambiato da ${who}${scope}`;
  return `Attivata da ${who}${scope}`;
};

type PendingAction = { kind: "activate" | "unlock" | "change_scope"; scope: MaintenanceScope | null };

/**
 * REG-773 — Manutenzione nel pannello «Gestisci» del backoffice: stato, chi
 * l'ha attivata, cambio di ambito, SBLOCCO (l'unico posto dove esiste) e
 * storico. Ogni cambio chiede conferma. Vedi docs/features/maintenance-mode.md.
 */
export function BackofficeMaintenanceSection({
  companyId,
  companyName,
  initial,
  onChanged,
}: {
  companyId: string;
  companyName: string;
  initial: MaintenanceState;
  onChanged: (state: MaintenanceState) => void;
}) {
  const toast = useFeedbackToast();
  const [state, setState] = React.useState<MaintenanceState>(initial);
  const [draftScope, setDraftScope] = React.useState<MaintenanceScope>(initial.scope ?? "OWNER_ONLY");
  const [events, setEvents] = React.useState<MaintenanceEvent[] | null>(null);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [saving, setSaving] = React.useState(false);

  const loadEvents = React.useCallback(() => {
    getBackofficeCompanyMaintenanceEvents(companyId).then((res) => {
      setEvents(res.success ? (res.data as MaintenanceEvent[]) : []);
    });
  }, [companyId]);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const active = state.scope !== null;
  const lastActivation = events?.find((event) => event.action !== "unlock");

  const run = async () => {
    if (!pending) return;
    setSaving(true);
    const res = await setBackofficeCompanyMaintenance({ companyId, scope: pending.scope });
    setSaving(false);
    setPending(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Operazione non riuscita." });
      return;
    }
    const next = { scope: res.data.scope, since: res.data.since };
    setState(next);
    if (next.scope) setDraftScope(next.scope);
    onChanged(next);
    loadEvents();
    toast.success({
      description:
        pending.kind === "unlock"
          ? `${companyName} è di nuovo attiva.`
          : pending.kind === "activate"
            ? `${companyName} è in manutenzione.`
            : "Ambito aggiornato.",
    });
  };

  const onScopeTap = (scope: MaintenanceScope) => {
    if (!active) {
      setDraftScope(scope);
      return;
    }
    if (scope !== state.scope) setPending({ kind: "change_scope", scope });
  };

  const shownScope = active ? state.scope : draftScope;

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-[17px] font-semibold text-foreground">Manutenzione</h3>

      <div className="mt-3 flex items-center gap-3">
        {active && (
          <Image
            src="/images/3d/barriera-riga-3d.png"
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 select-none object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">
            {active && state.since ? `In manutenzione dal ${formatWhen(state.since)}` : "Account attivo"}
          </p>
          <p className="mt-0.5 text-[13.5px] font-medium text-[#6a6a6a]">
            {active
              ? lastActivation
                ? describeEvent(lastActivation)
                : "Chi può entrare dipende dall'ambito qui sotto."
              : "Il titolare può metterlo in manutenzione dalle Impostazioni; da qui anche voi."}
          </p>
        </div>
      </div>

      {/* Segmentato: a manutenzione spenta sceglie l'ambito da attivare,
          accesa lo cambia (con conferma). */}
      <div
        role="radiogroup"
        aria-label="Ambito della manutenzione"
        className="mt-4 flex rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),inset_0_2px_5px_rgba(0,0,0,0.08)]"
      >
        {(["OWNER_ONLY", "EVERYONE"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={shownScope === scope}
            onClick={() => onScopeTap(scope)}
            className={cn(
              "h-11 flex-1 cursor-pointer rounded-full text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out",
              shownScope === scope
                ? "bg-[#1e1e1e] text-white shadow-[0_10px_20px_-8px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.25)]"
                : "text-[#6a6a6a]",
            )}
          >
            {SCOPE_LABEL[scope]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setPending(active ? { kind: "unlock", scope: null } : { kind: "activate", scope: draftScope })
        }
        className="mt-3.5 flex h-[50px] w-full cursor-pointer items-center justify-center rounded-full bg-[#1e1e1e] text-[15px] font-semibold text-white shadow-[0_14px_24px_-10px_rgba(0,0,0,0.5),inset_0_3px_4px_rgba(255,255,255,0.34),inset_0_-8px_13px_rgba(0,0,0,0.8)] transition-transform duration-200 ease-out active:scale-[0.98]"
      >
        {active ? "Sblocca account" : "Metti in manutenzione"}
      </button>

      {events && events.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-1 text-[15px] font-semibold text-foreground">Storico</h4>
          {events.map((event) => (
            <div
              key={event.id}
              className="flex justify-between gap-3 border-b border-[#ebebeb] py-2.5 text-[13.5px] font-medium last:border-0"
            >
              <span className="min-w-0 text-foreground">{describeEvent(event)}</span>
              <span className="shrink-0 whitespace-nowrap text-[#6a6a6a]">{formatWhen(event.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !saving && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "unlock"
                ? `Sbloccare ${companyName}?`
                : pending?.kind === "activate"
                  ? `Mettere ${companyName} in manutenzione?`
                  : "Cambiare ambito?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "unlock"
                ? "Titolare, istruttori e allievi tornano a entrare subito; promemoria, messaggi e segreteria ripartono da soli."
                : pending?.scope === "EVERYONE"
                  ? "Bloccati titolare, istruttori e allievi. Si fermano promemoria, WhatsApp e segreteria."
                  : "Bloccato solo il titolare. Istruttori e allievi continuano a usare l'app."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
            <button
              type="button"
              disabled={saving}
              onClick={() => void run()}
              className="flex h-10 min-w-[120px] cursor-pointer items-center justify-center rounded-full bg-[#1e1e1e] px-5 text-sm font-semibold text-white"
            >
              {saving ? <LoadingDots className="text-white" /> : "Conferma"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
