"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, MapPin, Pencil, Trash2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LocationFormDialog, type LocationFormValues } from "./LocationFormDialog";

type Location = {
  id: string;
  companyId: string;
  createdByUserId: string | null;
  name: string;
  address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  placeId: string | null;
  isDefault: boolean;
  isPrecise: boolean;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function LocationsSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    mode: "default" | "custom";
    initial?: Partial<LocationFormValues> & { id?: string };
  } | null>(null);
  const toast = useFeedbackToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/autoscuole/locations", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        toast.error({ description: json.message ?? "Errore nel caricamento." });
        return;
      }
      setLocations(json.data ?? []);
    } catch {
      toast.error({ description: "Errore di rete." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const sede = locations.find((l) => l.isDefault) ?? null;
  const customs = locations.filter((l) => !l.isDefault);

  const handleCreate = async (values: LocationFormValues) => {
    const res = await fetch("/api/autoscuole/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Errore di salvataggio.");
    toast.success({ description: "Luogo creato." });
    await load();
  };

  const handleUpdate = async (id: string, values: LocationFormValues) => {
    const res = await fetch(`/api/autoscuole/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Errore di salvataggio.");
    toast.success({ description: "Luogo aggiornato." });
    await load();
  };

  const handleUpdateDefault = async (values: LocationFormValues) => {
    const res = await fetch("/api/autoscuole/locations/default", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        isPrecise: values.isPrecise,
        address: values.address,
        latitude: values.latitude,
        longitude: values.longitude,
        placeId: values.placeId,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Errore di salvataggio.");
    toast.success({ description: "Sede aggiornata." });
    await load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Eliminare "${name}"? L'azione non è reversibile.`)) return;
    const res = await fetch(`/api/autoscuole/locations/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      toast.error({ description: json.message ?? "Errore di eliminazione." });
      return;
    }
    toast.success({ description: "Luogo eliminato." });
    await load();
  };

  const startEditSede = () =>
    setEditing({
      mode: "default",
      initial: sede
        ? {
            id: sede.id,
            name: sede.name,
            isPrecise: sede.isPrecise,
            address: sede.address,
            latitude: toNumber(sede.latitude),
            longitude: toNumber(sede.longitude),
            placeId: sede.placeId,
          }
        : undefined,
    });

  /** Etichetta secondaria come nel proto: indirizzo se preciso, altrimenti "Posizione generica". */
  const addressLabel = (loc: Location) =>
    loc.isPrecise && loc.address ? loc.address : "Posizione generica";

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="rounded-[12px] border border-[#e8e8e8] p-5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-2 h-3 w-72" />
          <Skeleton className="mt-3.5 h-3.5 w-56" />
        </div>
        <div className="rounded-[12px] border border-[#e8e8e8] p-5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-64" />
          <Skeleton className="mt-4 h-[62px] w-full rounded-[10px]" />
        </div>
      </div>
    );
  }

  // ── Onboarding: sede non ancora impostata (dal proto #config-tab-sede) ──
  if (!sede) {
    return (
      <>
        <FadeIn className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-10 text-center">
          <Image
            src="/images/settings/sede-autoscuola.png"
            alt=""
            width={172}
            height={172}
            className="mb-[22px] size-[172px] select-none object-contain"
          />
          <div className="mb-2 text-xl font-bold tracking-[-0.2px] text-foreground">
            Imposta la sede della tua autoscuola
          </div>
          <div className="mb-[26px] max-w-[430px] text-[15px] font-medium leading-[1.55] text-[#6a6a6a] [text-wrap:pretty]">
            La sede è il luogo di partenza predefinito di ogni guida. Aggiungila ora per
            iniziare a creare le prenotazioni, poi potrai gestire eventuali luoghi extra.
          </div>
          <button
            type="button"
            onClick={startEditSede}
            className="inline-flex cursor-pointer items-center justify-center rounded-[10px] bg-[#1a1a2e] px-[26px] py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#2d2d4a]"
          >
            Imposta la sede
          </button>
        </FadeIn>
        {editing ? (
          <LocationFormDialog
            open
            mode={editing.mode}
            initialValue={editing.initial}
            onClose={() => setEditing(null)}
            onSubmit={async (values) => {
              await handleUpdateDefault(values);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <FadeIn className="space-y-3">
      {/* ── Sede dell'autoscuola ── */}
      <div className="flex items-start justify-between gap-4 rounded-[12px] border border-[#e8e8e8] p-5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Sede dell&apos;autoscuola</div>
          <div className="mt-0.5 text-xs font-medium text-[#929292]">
            Modificabile solo dal titolare. Usata come luogo di default.
          </div>
          <div className="mt-2.5 text-[13px] font-medium text-foreground">{sede.name}</div>
          <div className="mt-0.5 text-xs font-medium text-[#929292]">{addressLabel(sede)}</div>
        </div>
        <button
          type="button"
          onClick={startEditSede}
          className="shrink-0 cursor-pointer text-sm font-semibold text-foreground underline decoration-1 underline-offset-2 transition-colors hover:text-black hover:decoration-2"
        >
          Modifica
        </button>
      </div>

      {/* ── Altri luoghi guida ── */}
      <div className="rounded-[12px] border border-[#e8e8e8] p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Altri luoghi guida</div>
            <div className="mt-0.5 text-xs font-medium text-[#929292]">
              Luoghi extra dove le guide possono partire.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing({ mode: "custom" })}
            className="shrink-0 cursor-pointer text-sm font-semibold text-foreground underline decoration-1 underline-offset-2 transition-colors hover:text-black hover:decoration-2"
          >
            Aggiungi
          </button>
        </div>

        {customs.length === 0 ? (
          <div className="rounded-[8px] bg-[#fafafa] px-4 py-6 text-center text-[13px] font-medium text-[#c1c1c1]">
            Nessun luogo custom. Aggiungi un parcheggio, un punto di ritrovo o un&apos;area di esercitazione.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {customs.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-[#eeeeee] bg-[#fafafa] px-4 py-3.5"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-navy-900" strokeWidth={1.6} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{loc.name}</div>
                    <div className="mt-0.5 truncate text-xs font-medium text-[#929292]">
                      {addressLabel(loc)}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {loc.isPrecise && loc.latitude != null && loc.longitude != null ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}${loc.placeId ? `&query_place_id=${loc.placeId}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-8 items-center justify-center rounded-[8px] border border-[#dddddd] text-[#444444] transition-colors hover:border-[#222222]"
                      aria-label="Apri in Google Maps"
                    >
                      <ExternalLink className="size-[13px]" strokeWidth={1.6} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        mode: "custom",
                        initial: {
                          id: loc.id,
                          name: loc.name,
                          isPrecise: loc.isPrecise,
                          address: loc.address,
                          latitude: toNumber(loc.latitude),
                          longitude: toNumber(loc.longitude),
                          placeId: loc.placeId,
                        },
                      })
                    }
                    className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[#dddddd] text-[#444444] transition-colors hover:border-[#222222]"
                    aria-label="Modifica"
                  >
                    <Pencil className="size-[13px]" strokeWidth={1.6} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(loc.id, loc.name)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[#dddddd] text-[#c13515] transition-colors hover:border-navy-900"
                    aria-label="Elimina"
                  >
                    <Trash2 className="size-[13px]" strokeWidth={1.6} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <LocationFormDialog
          open
          mode={editing.mode}
          initialValue={editing.initial}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            if (editing.mode === "default") {
              await handleUpdateDefault(values);
            } else if (editing.initial?.id) {
              await handleUpdate(editing.initial.id, values);
            } else {
              await handleCreate(values);
            }
          }}
        />
      ) : null}
    </FadeIn>
  );
}
