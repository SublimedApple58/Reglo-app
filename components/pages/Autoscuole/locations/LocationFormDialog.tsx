"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { MapPin, Search, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

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

const PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

type Suggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

/** Input della modale dal proto: bg #f7f8fa, bordo 1.5 #ededed, radius 12,
 *  al focus bordo near-black e fondo bianco. */
const FIELD_CLASS =
  "w-full rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] py-[13px] text-[15px] font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222] focus:bg-white";

/**
 * Modale sede/luogo guida dal proto (sedeModalOpen): card 480px radius 20,
 * header centrato con illustrazione (sede-autoscuola / luogo-guida), campi
 * su fondo #f7f8fa, toggle "Posizione precisa", footer Annulla + CTA pill
 * navy "Salva luogo" (grigia finché il nome è vuoto, LoadingDots in salvataggio).
 * La logica (autocomplete Google Places con session token, coordinate,
 * validazione) è invariata rispetto alla versione precedente.
 */
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
      setIsPrecise(initialValue?.isPrecise ?? false);
      setAddress(initialValue?.address ?? "");
      setLatitude(initialValue?.latitude ?? null);
      setLongitude(initialValue?.longitude ?? null);
      setPlaceId(initialValue?.placeId ?? null);
      setSuggestions([]);
    }
  }, [open, mode, initialValue]);

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
    if (!canSubmit || saving) return;
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

  const isEditSede = mode === "default";
  const title = isEditSede
    ? "Sede dell'autoscuola"
    : initialValue?.id
      ? "Modifica luogo guida"
      : "Nuovo luogo guida";
  const subtitle = isEditSede
    ? "Modificabile solo dal titolare. Usata come luogo di default."
    : "Un luogo extra da cui le guide possono partire.";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* X di default del DialogContent nascosta: il proto usa la sua tonda #f7f7f7 */}
      <DialogContent className="max-w-[480px] gap-0 rounded-[20px] p-7 pb-6 [&>button:last-child]:hidden">
        {/* ── Header centrato con illustrazione dal proto ── */}
        <div className="mb-[22px] flex flex-col items-center px-2 text-center">
          <Image
            src={isEditSede ? "/images/settings/sede-autoscuola.png" : "/images/settings/luogo-guida.png"}
            alt=""
            width={118}
            height={118}
            className="mb-1.5 block size-[118px] select-none object-contain"
          />
          <DialogTitle className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
            {title}
          </DialogTitle>
          <div className="mt-[3px] text-[12.5px] font-medium leading-[1.4] text-[#929292]">
            {subtitle}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute right-5 top-5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
        >
          <X className="size-3 text-foreground" strokeWidth={2} />
        </button>

        {/* ── Nome ── */}
        <div className="mb-2 text-[13px] font-semibold text-foreground">Nome del luogo</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Sede principale, Parcheggio stazione…"
          maxLength={80}
          autoFocus
          className={FIELD_CLASS}
        />

        {/* ── Posizione precisa ── */}
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
          className="mt-4 flex w-full cursor-pointer select-none items-center justify-between gap-4 rounded-[12px] border-[1.5px] border-[#ededed] px-4 py-[15px]"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Posizione precisa</div>
            <div className="mt-0.5 text-[12.5px] font-medium leading-[1.4] text-[#929292]">
              Gli allievi potranno aprire il luogo in Google Maps.
            </div>
          </div>
          <InlineToggle checked={isPrecise} size="lg" />
        </div>

        {/* ── Indirizzo (solo posizione precisa) ── */}
        {isPrecise && (
          <>
            <div className="mb-2 mt-5 text-[13px] font-semibold text-foreground">Indirizzo</div>
            <div className="relative">
              <div className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] transition-colors focus-within:border-[#222222] focus-within:bg-white">
                <Search className="size-4 shrink-0 text-[#a8a8a8]" strokeWidth={1.8} />
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setPlaceId(null);
                    setLatitude(null);
                    setLongitude(null);
                  }}
                  placeholder="Es. Via Roma 14, Milano"
                  disabled={!PLACES_API_KEY}
                  className="min-w-0 flex-1 bg-transparent py-[13px] text-[15px] font-medium text-foreground outline-none placeholder:text-[#c1c1c1]"
                />
                {searching && <LoadingDots className="shrink-0 scale-[0.6] text-[#a8a8a8]" />}
              </div>
              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-[12px] border border-[#ededed] bg-white shadow-dropdown">
                  {suggestions.map((s) => (
                    <button
                      key={s.placeId}
                      type="button"
                      onClick={() => selectSuggestion(s)}
                      className="flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-[#f7f7f7]"
                    >
                      <MapPin className="mt-0.5 size-4 shrink-0 text-[#929292]" strokeWidth={1.6} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{s.primaryText}</div>
                        <div className="truncate text-xs font-medium text-[#929292]">
                          {s.secondaryText}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-[9px] text-xs font-medium leading-[1.45] text-[#a3a3a3]">
              {PLACES_API_KEY
                ? "Inizia a digitare per cercare l'indirizzo. Verrà mostrato agli allievi nel dettaglio della guida."
                : "Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY per abilitare la ricerca dell'indirizzo."}
            </div>
          </>
        )}

        {/* ── Footer dal proto: Annulla testo + CTA pill navy ── */}
        <div className="mt-[26px] flex items-center justify-end gap-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer select-none px-2 py-[11px] text-sm font-semibold text-foreground transition-colors hover:text-[#555555]"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className={cn(
              "flex min-w-[128px] select-none items-center justify-center gap-[7px] rounded-[50px] px-[26px] py-3 text-sm font-semibold text-white transition-colors",
              canSubmit
                ? "cursor-pointer bg-[#1a1a2e] hover:bg-[#2d2d4a]"
                : "cursor-not-allowed bg-[#c4c4d4]",
            )}
          >
            {saving ? <LoadingDots /> : "Salva luogo"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
