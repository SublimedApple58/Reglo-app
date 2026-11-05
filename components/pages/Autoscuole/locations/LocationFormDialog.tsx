"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { licenseCategoryGroupsForMode } from "@/lib/autoscuole/license";
import { type LessonTransmission } from "@/lib/autoscuole/location-for-license";
import { LicenseTransmissionPicker } from "./LicenseTransmissionPicker";
import { cn } from "@/lib/utils";
import { usePlacesAutocomplete, type PlaceSuggestion } from "./use-places-autocomplete";

export type LocationFormValues = {
  name: string;
  isPrecise: boolean;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  /** Tipi di patente serviti dal luogo (REG-409). `undefined` quando
   *  l'interruttore è spento: il backend lascia invariato ciò che è salvato,
   *  invece di azzerarlo con una lista vuota che l'utente non ha mai visto. */
  licenseCategories?: string[];
  /** REG-725: cambio per patente (assente = entrambi). Segue `licenseCategories`. */
  licenseTransmissions?: Record<string, LessonTransmission>;
};

export type LocationFormDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: "default" | "custom";
  initialValue?: Partial<LocationFormValues> & { id?: string };
  onSubmit: (values: LocationFormValues) => Promise<void>;
  /** Picker patenti: lista consorzio (C1/D1/CQC/ADR) invece di quella storica. */
  consortium?: boolean;
  /**
   * Patente → nomi degli ALTRI luoghi che la fanno (REG-725: la stessa patente
   * può stare in più luoghi). Solo informativo: «Anche su …» nella riga del cambio.
   */
  otherPlaces?: Record<string, string[]>;
  /** Interruttore «Luoghi diversi per tipo di patente» (pane Sede e luoghi).
   *  Spento, la sezione in fondo non si mostra: ogni luogo fa tutte le patenti.
   *  Le categorie già salvate restano in database e non vengono toccate. */
  showLicenseCategories?: boolean;
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
  consortium = false,
  otherPlaces = {},
  showLicenseCategories = true,
}: LocationFormDialogProps) {
  const [name, setName] = useState("");
  const [isPrecise, setIsPrecise] = useState(true);
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [licenseCategories, setLicenseCategories] = useState<string[]>([]);
  const [licenseTransmissions, setLicenseTransmissions] = useState<
    Record<string, LessonTransmission>
  >({});
  const [saving, setSaving] = useState(false);
  const toast = useFeedbackToast();
  // Autocompletamento Places (REG-396), estratto in un hook in REG-656.
  const places = usePlacesAutocomplete(address, isPrecise);
  const { suggestions, searching, resetSession } = places;

  useEffect(() => {
    if (open) {
      resetSession();
      setName(initialValue?.name ?? (mode === "default" ? "Sede dell'autoscuola" : ""));
      setIsPrecise(initialValue?.isPrecise ?? false);
      setAddress(initialValue?.address ?? "");
      setLatitude(initialValue?.latitude ?? null);
      setLongitude(initialValue?.longitude ?? null);
      setPlaceId(initialValue?.placeId ?? null);
      setLicenseCategories(initialValue?.licenseCategories ?? []);
      setLicenseTransmissions(initialValue?.licenseTransmissions ?? {});
    }
  }, [open, mode, initialValue, resetSession]);

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    try {
      const picked = await places.select(suggestion);
      if (!picked) {
        toast.error({ description: "Impossibile leggere il luogo selezionato." });
        return;
      }
      setAddress(picked.address);
      setLatitude(picked.latitude);
      setLongitude(picked.longitude);
      setPlaceId(picked.placeId);
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
        // Interruttore spento = la sezione non si vede: non si manda niente,
        // altrimenti si cancellerebbero le patenti salvate senza che nessuno
        // abbia chiesto di cancellarle.
        licenseCategories: showLicenseCategories ? licenseCategories : undefined,
        licenseTransmissions: showLicenseCategories ? licenseTransmissions : undefined,
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

  const licenseGroups = useMemo(
    () => licenseCategoryGroupsForMode(consortium),
    [consortium],
  );
  // Bordi di intestazione e piede: compaiono solo quando c'è contenuto
  // nascosto sopra o sotto, così da fermi la modale resta pulita.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measureEdges = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    measureEdges();
    // Il contenuto cambia altezza (righe del cambio, indirizzo, suggerimenti):
    // si rimisura sia sul contenitore sia sul suo contenuto.
    const ro = new ResizeObserver(measureEdges);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [open, measureEdges]);

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
      <DialogContent className="flex max-h-[calc(100dvh-32px)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-[20px] p-0 [&>button:last-child]:hidden">
        {/* ── Intestazione: resta in alto, il contenuto scorre sotto (REG-725) ── */}
        <div
          className={cn(
            "shrink-0 border-b px-7 pb-[18px] pt-7 transition-colors duration-200 max-sm:px-5",
            edges.top ? "border-[#ededed]" : "border-transparent",
          )}
        >
        <div className="flex flex-col items-center px-2 text-center">
          <Image
            src={isEditSede ? "/images/settings/sede-autoscuola.png" : "/images/settings/luogo-guida.png"}
            alt=""
            width={118}
            height={118}
            className="mb-1.5 block size-[118px] select-none object-contain [@media(max-height:760px)]:size-[76px] [@media(max-height:600px)]:hidden"
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

        </div>

        {/* ── Corpo scorrevole ── */}
        <div
          ref={bodyRef}
          onScroll={measureEdges}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-7 pb-2 pt-1 max-sm:px-5"
          data-testid="location-dialog-body"
        >
          <div>
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
                    places.typed();
                    setAddress(e.target.value);
                    setPlaceId(null);
                    setLatitude(null);
                    setLongitude(null);
                  }}
                  placeholder="Es. Via Roma 14, Milano"
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
              Inizia a digitare per cercare l&apos;indirizzo. Verrà mostrato agli allievi nel
              dettaglio della guida.
            </div>
          </>
        )}

        {showLicenseCategories && (
          <LicenseTransmissionPicker
            groups={licenseGroups}
            categories={licenseCategories}
            transmissions={licenseTransmissions}
            onCategoriesChange={setLicenseCategories}
            onTransmissionsChange={setLicenseTransmissions}
            otherPlaces={otherPlaces}
          />
        )}
          </div>
        </div>

        {/* ── Piede: Annulla + Salva, sempre raggiungibili ── */}
        <div
          className={cn(
            "flex shrink-0 items-center justify-end gap-3.5 border-t px-7 pb-6 pt-4 transition-colors duration-200 max-sm:px-5",
            edges.bottom ? "border-[#ededed]" : "border-transparent",
          )}
        >
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
                ? "cursor-pointer bg-[#111111] hover:bg-[#2b2b2b]"
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
