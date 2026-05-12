"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field-group";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

export type LocationFormValues = {
  name: string;
  isPrecise: boolean;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

export type LocationFormDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: "default" | "custom";
  initialValue?: Partial<LocationFormValues> & { id?: string };
  onSubmit: (values: LocationFormValues) => Promise<void>;
};

const PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

type Suggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

export function LocationFormDialog({
  open,
  onClose,
  mode,
  initialValue,
  onSubmit,
}: LocationFormDialogProps) {
  const [name, setName] = useState("");
  const [isPrecise, setIsPrecise] = useState(true);
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useFeedbackToast();
  const sessionTokenRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      sessionTokenRef.current = crypto.randomUUID();
      setName(initialValue?.name ?? (mode === "default" ? "Sede dell'autoscuola" : ""));
      // Sede must always be precise; custom inherits from initial or defaults to false
      setIsPrecise(mode === "default" ? true : (initialValue?.isPrecise ?? false));
      setAddress(initialValue?.address ?? "");
      setLatitude(initialValue?.latitude ?? null);
      setLongitude(initialValue?.longitude ?? null);
      setPlaceId(initialValue?.placeId ?? null);
      setSuggestions([]);
    }
  }, [open, mode, initialValue]);

  const lockPreciseToggle = mode === "default";

  useEffect(() => {
    if (!PLACES_API_KEY) return;
    if (!isPrecise) return;
    if (!address || address.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          "https://places.googleapis.com/v1/places:autocomplete",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": PLACES_API_KEY,
            },
            body: JSON.stringify({
              input: address,
              includedRegionCodes: ["IT"],
              languageCode: "it",
              sessionToken: sessionTokenRef.current,
            }),
          },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const items: Suggestion[] =
          (data.suggestions ?? [])
            .map((s: unknown) => {
              const obj = s as {
                placePrediction?: {
                  placeId?: string;
                  structuredFormat?: {
                    mainText?: { text?: string };
                    secondaryText?: { text?: string };
                  };
                };
              };
              const pp = obj.placePrediction;
              if (!pp?.placeId) return null;
              return {
                placeId: pp.placeId,
                primaryText: pp.structuredFormat?.mainText?.text ?? "",
                secondaryText: pp.structuredFormat?.secondaryText?.text ?? "",
              } satisfies Suggestion;
            })
            .filter(Boolean) as Suggestion[];
        setSuggestions(items.slice(0, 5));
      } catch {
        setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, isPrecise]);

  const selectSuggestion = async (suggestion: Suggestion) => {
    if (!PLACES_API_KEY) return;
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${suggestion.placeId}?languageCode=it`,
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": PLACES_API_KEY,
            "X-Goog-FieldMask": "formattedAddress,location,displayName",
          },
        },
      );
      if (!res.ok) {
        toast.error({ description: "Impossibile leggere il luogo selezionato." });
        return;
      }
      const data = (await res.json()) as {
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      };
      setAddress(data.formattedAddress ?? `${suggestion.primaryText}, ${suggestion.secondaryText}`);
      setLatitude(data.location?.latitude ?? null);
      setLongitude(data.location?.longitude ?? null);
      setPlaceId(suggestion.placeId);
      setSuggestions([]);
    } catch {
      toast.error({ description: "Errore nella selezione del luogo." });
    }
  };

  const canSubmit = useMemo(() => {
    if (!name.trim() || name.trim().length < 2) return false;
    if (isPrecise) {
      return Boolean(address && latitude != null && longitude != null);
    }
    return true;
  }, [name, isPrecise, address, latitude, longitude]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        isPrecise,
        address: isPrecise ? address.trim() : null,
        latitude: isPrecise ? latitude : null,
        longitude: isPrecise ? longitude : null,
        placeId: isPrecise ? placeId : null,
      });
      onClose();
    } catch (error) {
      toast.error({
        description:
          error instanceof Error ? error.message : "Errore di salvataggio.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-yellow-600" />
            {mode === "default"
              ? "Sede dell'autoscuola"
              : initialValue?.id
                ? "Modifica luogo"
                : "Aggiungi luogo"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FieldGroup label="Nome del luogo">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Piazzale del Comune"
              maxLength={80}
            />
          </FieldGroup>

          {!lockPreciseToggle && (
            <div
              role="switch"
              tabIndex={0}
              aria-checked={isPrecise}
              onClick={() => setIsPrecise((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsPrecise((v) => !v);
                }
              }}
              className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div>
                <div className="text-sm font-medium text-foreground">
                  Posizione precisa
                </div>
                <div className="text-xs text-muted-foreground">
                  Gli allievi potranno aprire il luogo in Google Maps.
                </div>
              </div>
              <InlineToggle checked={isPrecise} />
            </div>
          )}

          {isPrecise && (
            <FieldGroup
              label="Indirizzo"
              description={
                PLACES_API_KEY
                  ? "Cerca via, città o luogo. Selezionalo per agganciare le coordinate."
                  : "Configura NEXT_PUBLIC_GOOGLE_PLACES_API_KEY per abilitare l'autocomplete."
              }
            >
              <div className="relative">
                <Input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setPlaceId(null);
                    setLatitude(null);
                    setLongitude(null);
                  }}
                  placeholder="Es. Via Roma 14, Milano"
                  disabled={!PLACES_API_KEY}
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-white shadow-lg">
                    {suggestions.map((s) => (
                      <button
                        key={s.placeId}
                        type="button"
                        onClick={() => selectSuggestion(s)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">
                            {s.primaryText}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.secondaryText}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {latitude != null && longitude != null && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Coordinate: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </div>
              )}
            </FieldGroup>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving ? "Salvataggio…" : "Salva luogo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
