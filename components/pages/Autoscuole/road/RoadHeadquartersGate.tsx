"use client";

import * as React from "react";
import Image from "next/image";
import { LocateFixed, MapPin, Search } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { updateDefaultAutoscuolaLocation } from "@/lib/actions/autoscuola-locations.actions";
import { roadApi, type RoadHeadquartersStatus } from "@/lib/autoscuole/road/client";
import { cn } from "@/lib/utils";
import { usePlacesAutocomplete, type PlaceSuggestion } from "../locations/use-places-autocomplete";

type Picked = {
  address: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
  source: "places" | "position";
};

const NOTICE_KEY = "reglo:road-hq-notice";
const DEFAULT_NAME = "Sede dell'autoscuola";

/**
 * REG-656 Reglo Road — la sede senza indirizzo non passa più inosservata.
 *
 * Con Road acceso e la sede senza coordinate (`GET /road/headquarters`):
 * - **titolare**: foglio bloccante (niente X, niente Esc, niente clic fuori),
 *   si prosegue solo a sede salvata. Indirizzo con l'autocompletamento Places
 *   oppure «Usa la mia posizione attuale» (posizione del browser + indirizzo
 *   più vicino da `/api/places/nearby`). Salva con l'azione della sede.
 * - **altri** (admin, istruttore): avviso che si chiude, una volta per sessione.
 *
 * Montato nel layout delle pagine Road e in Impostazioni › Reglo Road.
 */
export function RoadHeadquartersGate() {
  const [status, setStatus] = React.useState<RoadHeadquartersStatus | null>(null);
  const [noticeOpen, setNoticeOpen] = React.useState(false);

  React.useEffect(() => {
    const ctrl = new AbortController();
    roadApi
      .headquarters(ctrl.signal)
      .then((s) => {
        setStatus(s);
        if (s.missing && !s.canEdit) {
          let seen = false;
          try {
            seen = sessionStorage.getItem(NOTICE_KEY) === "1";
          } catch {
            // storage non disponibile: l'avviso si mostra
          }
          setNoticeOpen(!seen);
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  if (!status?.roadEnabled || !status.missing) return null;

  if (!status.canEdit) {
    const close = () => {
      setNoticeOpen(false);
      try {
        sessionStorage.setItem(NOTICE_KEY, "1");
      } catch {
        // niente: alla prossima pagina si rivede
      }
    };
    return <HeadquartersNotice open={noticeOpen} onClose={close} />;
  }

  return (
    <HeadquartersRequired
      sedeName={status.sedeName ?? DEFAULT_NAME}
      onSaved={() => setStatus({ ...status, missing: false })}
    />
  );
}

function SheetHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-center px-2 text-center">
      <Image
        src="/images/settings/sede-autoscuola.png"
        alt=""
        width={108}
        height={108}
        priority
        className="mb-1.5 block size-[108px] select-none object-contain"
      />
      <DialogTitle className="text-[20px] font-semibold tracking-[-0.3px] text-foreground">{title}</DialogTitle>
      <DialogDescription className="mt-1.5 max-w-[340px] text-[13.5px] font-medium leading-[1.45] text-[#7a7a7a]">
        {children}
      </DialogDescription>
    </div>
  );
}

function HeadquartersNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="road-hq-notice" className="max-w-[440px] gap-0 rounded-[22px] p-7 pb-6">
        <SheetHeader title="Manca l'indirizzo della sede">
          Il titolare deve ancora inserirlo nella web app, in Impostazioni › Sede e luoghi. Fino ad allora il giro
          della prossima guida si chiude all&apos;ultima tappa.
        </SheetHeader>
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full cursor-pointer select-none rounded-[50px] bg-[#111111] text-[14.5px] font-semibold text-white transition-colors duration-200 hover:bg-[#2b2b2b]"
        >
          Ho capito
        </button>
      </DialogContent>
    </Dialog>
  );
}

function HeadquartersRequired({ sedeName, onSaved }: { sedeName: string; onSaved: () => void }) {
  const toast = useFeedbackToast();
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [locateError, setLocateError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [canLocate, setCanLocate] = React.useState(false);
  const places = usePlacesAutocomplete(query, !picked);

  React.useEffect(() => {
    setCanLocate(typeof navigator !== "undefined" && "geolocation" in navigator);
  }, []);

  const choose = async (s: PlaceSuggestion) => {
    try {
      const d = await places.select(s);
      if (!d || d.latitude == null || d.longitude == null) {
        toast.error({ description: "Impossibile leggere l'indirizzo selezionato." });
        return;
      }
      setLocateError(null);
      setPicked({ address: d.address, latitude: d.latitude, longitude: d.longitude, placeId: d.placeId, source: "places" });
    } catch {
      toast.error({ description: "Errore nella selezione dell'indirizzo." });
    }
  };

  const locate = () => {
    if (!canLocate || locating) return;
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address: string | null = null;
        try {
          const res = await fetch("/api/places/nearby", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: latitude, lng: longitude }),
          });
          if (res.ok) address = ((await res.json()) as { address?: string | null }).address ?? null;
        } catch {
          // senza indirizzo si usano le coordinate
        }
        setPicked({
          address: address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          latitude,
          longitude,
          placeId: null,
          source: "position",
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocateError("Il browser non ha dato la posizione. Cerca l'indirizzo qui sopra.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const change = () => {
    setPicked(null);
    setQuery("");
    places.resetSession();
  };

  const save = async () => {
    if (!picked || saving) return;
    setSaving(true);
    try {
      const res = await updateDefaultAutoscuolaLocation({
        name: sedeName,
        isPrecise: true,
        address: picked.address,
        latitude: picked.latitude,
        longitude: picked.longitude,
        placeId: picked.placeId,
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Non è stato possibile salvare la sede." });
        return;
      }
      toast.success({ description: "Sede salvata." });
      onSaved();
    } catch {
      toast.error({ description: "Non è stato possibile salvare la sede." });
    } finally {
      setSaving(false);
    }
  };

  const block = (e: Event) => e.preventDefault();

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        data-testid="road-hq-gate"
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
        onInteractOutside={block}
        // Bloccante: la X del DialogContent non c'è.
        className="max-w-[460px] gap-0 rounded-[22px] p-7 pb-6 [&>button:last-child]:hidden"
      >
        <SheetHeader title="Dove si trova la sede?">
          Reglo Road chiude il giro di ogni guida in sede. Inserisci l&apos;indirizzo per continuare: lo vedranno
          anche gli allievi nel dettaglio della guida.
        </SheetHeader>

        <div className="mb-2 text-[13px] font-semibold text-foreground">Indirizzo della sede</div>
        {picked ? (
          <div
            data-testid="road-hq-picked"
            className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-[#222222] bg-white px-3.5 py-3 animate-in fade-in-0 duration-200"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f4f4]">
              {picked.source === "position" ? (
                <LocateFixed className="size-4 text-foreground" strokeWidth={1.8} />
              ) : (
                <MapPin className="size-4 text-foreground" strokeWidth={1.8} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-semibold text-foreground">{picked.address}</div>
              <div className="mt-0.5 text-[12px] font-medium text-[#929292]">
                {picked.source === "position" ? "Dalla tua posizione attuale" : "Da Google Maps"}
              </div>
            </div>
            <button
              type="button"
              onClick={change}
              disabled={saving}
              className="shrink-0 cursor-pointer select-none px-1.5 py-1 text-[13px] font-semibold text-foreground underline-offset-2 transition-colors hover:underline"
            >
              Cambia
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] transition-colors duration-200 focus-within:border-[#222222] focus-within:bg-white">
              <Search className="size-4 shrink-0 text-[#a8a8a8]" strokeWidth={1.8} />
              <input
                data-testid="road-hq-address"
                value={query}
                onChange={(e) => {
                  places.typed();
                  setQuery(e.target.value);
                }}
                placeholder="Es. Via Roma 14, Milano"
                autoFocus
                className="min-w-0 flex-1 bg-transparent py-[13px] text-[15px] font-medium text-foreground outline-none placeholder:text-[#c1c1c1]"
              />
              {places.searching && <LoadingDots className="shrink-0 scale-[0.6] text-[#a8a8a8]" />}
            </div>
            {places.suggestions.length > 0 && (
              <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-[12px] border border-[#ededed] bg-white shadow-dropdown animate-in fade-in-0 duration-200">
                {places.suggestions.map((s) => (
                  <button
                    key={s.placeId}
                    type="button"
                    onClick={() => choose(s)}
                    className="flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-[#f7f7f7]"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[#929292]" strokeWidth={1.6} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{s.primaryText}</div>
                      <div className="truncate text-xs font-medium text-[#929292]">{s.secondaryText}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!picked && canLocate && (
          <>
            <div className="my-4 flex items-center gap-3 text-[12px] font-medium text-[#a3a3a3]">
              <div className="h-px flex-1 bg-[#ededed]" />
              oppure
              <div className="h-px flex-1 bg-[#ededed]" />
            </div>
            <button
              type="button"
              data-testid="road-hq-locate"
              onClick={locate}
              disabled={locating}
              className="flex h-12 w-full cursor-pointer select-none items-center justify-center gap-2 rounded-[50px] border-[1.5px] border-[#e4e4e4] bg-white text-[14px] font-semibold text-foreground transition-colors duration-200 hover:border-[#222222]"
            >
              {locating ? (
                <LoadingDots className="text-foreground" />
              ) : (
                <>
                  <LocateFixed className="size-4" strokeWidth={1.8} />
                  Usa la mia posizione attuale
                </>
              )}
            </button>
            {locateError && (
              <div className="mt-2 text-center text-[12px] font-medium text-[#7a7a7a]">{locateError}</div>
            )}
          </>
        )}

        <button
          type="button"
          data-testid="road-hq-save"
          onClick={save}
          disabled={!picked || saving}
          className={cn(
            "mt-6 flex h-12 w-full select-none items-center justify-center rounded-[50px] text-[14.5px] font-semibold text-white transition-colors duration-200",
            picked ? "cursor-pointer bg-[#111111] hover:bg-[#2b2b2b]" : "cursor-not-allowed bg-[#c9c9c9]",
          )}
        >
          {saving ? <LoadingDots /> : "Salva e continua"}
        </button>
        <div className="mt-3 text-center text-[12px] font-medium text-[#a3a3a3]">
          Potrai cambiarla quando vuoi in Impostazioni › Sede e luoghi.
        </div>
      </DialogContent>
    </Dialog>
  );
}
