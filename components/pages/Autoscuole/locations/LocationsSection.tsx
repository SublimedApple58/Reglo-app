"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    if (!values.address || values.latitude == null || values.longitude == null) {
      throw new Error("Per la sede serve un indirizzo preciso.");
    }
    const res = await fetch("/api/autoscuole/locations/default", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
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

  return (
    <div className="space-y-4">
      {/* Sede card */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50">
              <MapPin className="h-4 w-4 text-pink-600" />
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">
                Sede dell&apos;autoscuola
              </div>
              <div className="text-xs text-muted-foreground">
                Modificabile solo dal titolare. Usata come luogo di default per ogni guida.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
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
              })
            }
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Modifica
          </Button>
        </div>
        {loading ? (
          <div className="text-xs text-muted-foreground">Caricamento…</div>
        ) : sede?.address ? (
          <div className="text-sm text-foreground">{sede.address}</div>
        ) : (
          <div className="text-sm italic text-muted-foreground">
            Sede non ancora configurata. Premi &ldquo;Modifica&rdquo; per aggiungere l&apos;indirizzo.
          </div>
        )}
      </div>

      {/* Custom locations */}
      <div className="rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <div className="text-sm font-semibold text-foreground">Altri luoghi guida</div>
            <div className="text-xs text-muted-foreground">
              Luoghi extra dove le guide possono partire. Anche gli istruttori possono aggiungere i propri.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setEditing({ mode: "custom" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Aggiungi luogo
          </Button>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Caricamento…
          </div>
        ) : customs.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Nessun luogo custom. Aggiungi un parcheggio, un punto di ritrovo o un&apos;area di esercitazione.
          </div>
        ) : (
          <ul>
            {customs.map((loc) => (
              <li
                key={loc.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {loc.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        loc.isPrecise
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {loc.isPrecise ? "Precisa" : "Generica"}
                    </span>
                  </div>
                  {loc.isPrecise && loc.address ? (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {loc.address}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {loc.isPrecise && loc.latitude != null && loc.longitude != null ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}${loc.placeId ? `&query_place_id=${loc.placeId}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-gray-50 hover:text-foreground"
                      aria-label="Apri in Google Maps"
                    >
                      <ExternalLink className="h-4 w-4" />
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
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-gray-50 hover:text-foreground"
                    aria-label="Modifica"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(loc.id, loc.name)}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
    </div>
  );
}
