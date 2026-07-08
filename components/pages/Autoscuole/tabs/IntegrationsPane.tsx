"use client";

import React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";

import {
  integrationConnectionsAtom,
  integrationsRefreshAtom,
} from "@/atoms/integrations.store";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const INTEGRATION_LABELS: Record<string, string> = {
  "fatture-in-cloud": "Fatture in Cloud",
  slack: "Slack",
};

const inputClass =
  "w-full rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-[#222222]";

/**
 * Pane "Integrazioni" dell'overlay Impostazioni (ex tab Integrations della
 * pagina Profilo): Fatture in Cloud — connessione OAuth, selezione azienda,
 * disconnessione. La callback OAuth torna qui (usa il referer) con
 * ?integrationSuccess / ?integrationError.
 */
export function IntegrationsPane() {
  const toast = useFeedbackToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const connections = useAtomValue(integrationConnectionsAtom);
  const setIntegrationsRefresh = useSetAtom(integrationsRefreshAtom);

  const [disconnecting, setDisconnecting] = React.useState(false);
  const [entities, setEntities] = React.useState<Array<{ value: string; label: string }>>([]);
  const [entitiesLoading, setEntitiesLoading] = React.useState(false);
  const [entitiesError, setEntitiesError] = React.useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = React.useState("");
  const [savingEntity, setSavingEntity] = React.useState(false);
  const [manualEntityId, setManualEntityId] = React.useState("");
  const [manualEntityName, setManualEntityName] = React.useState("");

  const fic = connections?.find((c) => c.provider === "fatture-in-cloud") ?? null;
  const isConnected = fic?.status === "connected";

  // Esito della callback OAuth (?integrationSuccess / ?integrationError)
  React.useEffect(() => {
    const success = searchParams.get("integrationSuccess");
    const error = searchParams.get("integrationError");
    if (!success && !error) return;
    if (success) {
      toast.success({
        description: `Connessione completata per ${INTEGRATION_LABELS[success] ?? success}.`,
      });
      setIntegrationsRefresh(true);
    }
    if (error) {
      toast.error({
        description: `Connessione non riuscita per ${INTEGRATION_LABELS[error] ?? error}. Riprova.`,
      });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("integrationSuccess");
    params.delete("integrationError");
    // history.replaceState: pulizia URL senza retrigger del router (Next 15
    // la sincronizza con useSearchParams).
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [searchParams, toast, setIntegrationsRefresh, pathname]);

  // Aziende FIC disponibili (solo quando connessa)
  React.useEffect(() => {
    if (!isConnected) return;
    let active = true;
    setEntitiesLoading(true);
    setEntitiesError(null);
    fetch("/api/integrations/fatture-in-cloud/entities", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        const payload = (await response.json()) as {
          success: boolean;
          data?: Array<{ value: string; label: string }>;
          selectedId?: string | null;
          message?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Impossibile caricare le aziende FIC.");
        }
        setEntities(payload.data ?? []);
        if (payload.selectedId) setSelectedEntityId(payload.selectedId);
      })
      .catch((error) => {
        if (active) {
          setEntities([]);
          setEntitiesError((error as Error).message || "Impossibile caricare le aziende FIC.");
        }
      })
      .finally(() => {
        if (active) setEntitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isConnected]);

  const saveEntity = async (entityId: string, entityName: string | null) => {
    setSavingEntity(true);
    const res = await fetch("/api/integrations/fatture-in-cloud/entity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, entityName }),
    });
    setSavingEntity(false);
    if (!res.ok) {
      toast.error({ description: "Impossibile salvare l'azienda FIC selezionata." });
      return false;
    }
    return true;
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    const res = await fetch("/api/integrations/fatture-in-cloud/disconnect", {
      method: "POST",
    });
    setDisconnecting(false);
    if (!res.ok) {
      toast.error({ description: "Impossibile disconnettere l'integrazione." });
      return;
    }
    toast.success({ description: "Fatture in Cloud disconnessa." });
    setIntegrationsRefresh(true);
  };

  return (
    <div className="max-w-[680px]">
      <p className="mb-6 text-[13px] font-medium leading-relaxed text-[#6a6a6a]">
        Collega i servizi esterni della tua autoscuola. Ogni integrazione è separata per
        autoscuola e richiede autorizzazioni dedicate.
      </p>

      {/* ── Fatture in Cloud ── */}
      <div className="rounded-[14px] border border-[#dddddd] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-base font-bold text-foreground">Fatture in Cloud</div>
            <div className="mt-1 text-[13px] font-medium leading-normal text-[#6a6a6a]">
              Crea fatture, aggiorna stati, genera PDF e sincronizza clienti con l&apos;account
              TeamSystem autorizzato.
            </div>
            {fic?.displayName && (
              <div className="mt-1.5 text-xs font-medium text-[#929292]">
                Workspace: {fic.displayName}
              </div>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[20px] border px-2.5 py-[3px] text-xs font-semibold",
              isConnected
                ? "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]"
                : "border-[#e5e5e5] bg-[#f7f7f7] text-[#6a6a6a]",
            )}
          >
            {isConnected ? "Connessa" : "Non collegata"}
          </span>
        </div>

        {isConnected && (
          <div className="mt-5 border-t border-[#f2f2f2] pt-5">
            <div className="mb-2 text-[13px] font-semibold text-foreground">Azienda FIC</div>
            <p className="mb-3 text-xs font-medium text-[#929292]">
              La selezione viene usata dai workflow per creare le fatture.
            </p>
            {entities.length > 0 || entitiesLoading ? (
              <Select
                value={selectedEntityId}
                onValueChange={async (value) => {
                  if (!value) return;
                  const previous = selectedEntityId;
                  setSelectedEntityId(value);
                  const selected = entities.find((entity) => entity.value === value);
                  const ok = await saveEntity(value, selected?.label ?? null);
                  if (!ok) setSelectedEntityId(previous);
                }}
                disabled={entitiesLoading || savingEntity}
              >
                <SelectTrigger className="h-10 w-full max-w-sm rounded-[10px] border-[1.5px] border-[#dddddd] text-sm font-medium">
                  <SelectValue
                    placeholder={entitiesLoading ? "Caricamento aziende…" : "Seleziona azienda"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {entities.map((entity) => (
                    <SelectItem key={entity.value} value={entity.value}>
                      {entity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="max-w-sm space-y-2.5">
                <input
                  value={manualEntityId}
                  onChange={(event) => setManualEntityId(event.target.value)}
                  placeholder="Incolla l'ID azienda FIC"
                  className={inputClass}
                />
                <input
                  value={manualEntityName}
                  onChange={(event) => setManualEntityName(event.target.value)}
                  placeholder="Nome azienda (opzionale)"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!manualEntityId.trim()) {
                      toast.error({ description: "Inserisci un ID azienda valido." });
                      return;
                    }
                    const ok = await saveEntity(
                      manualEntityId.trim(),
                      manualEntityName.trim() || null,
                    );
                    if (ok) {
                      setSelectedEntityId(manualEntityId.trim());
                      toast.success({ description: "Azienda FIC salvata." });
                    }
                  }}
                  disabled={savingEntity}
                  className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#dddddd] bg-white px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:border-[#222222] disabled:opacity-60"
                >
                  {savingEntity && <Loader2 className="size-3.5 animate-spin" />}
                  Salva ID azienda
                </button>
                <p className="text-xs font-medium text-[#929292]">
                  Puoi recuperare l&apos;ID dalla URL di Fatture in Cloud (es. /c/ID_AZIENDA).
                </p>
              </div>
            )}
            {entitiesError && (
              <p className="mt-2 text-xs font-medium text-[#c13515]">{entitiesError}</p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2.5 border-t border-[#f2f2f2] pt-5">
          {!isConnected ? (
            <button
              type="button"
              onClick={() =>
                window.open(
                  "/api/integrations/fatture-in-cloud/connect",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              className="cursor-pointer rounded-[10px] bg-navy-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
            >
              Connetti
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#dddddd] bg-white px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-[#222222] disabled:opacity-60"
            >
              {disconnecting && <Loader2 className="size-4 animate-spin" />}
              {disconnecting ? "Disconnessione..." : "Disconnetti"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
