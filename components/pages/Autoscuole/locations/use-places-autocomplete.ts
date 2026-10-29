"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

export type PlaceDetails = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
};

/**
 * Autocompletamento indirizzi con Google Places (New) via i proxy server-side
 * `/api/places/autocomplete` e `/api/places/details` (REG-396): la chiave e la
 * chiamata a Google vivono nel backend, così si evita il blocco CORS.
 *
 * Estratto da `LocationFormDialog` (REG-656) per riusarlo nel foglio della sede
 * di Road. `query` è il testo del campo; `select` legge indirizzo e coordinate
 * del suggerimento e blocca la ricerca successiva (altrimenti l'indirizzo
 * completo rifarebbe la query e riaprirebbe la tendina sopra il tasto Salva).
 */
export function usePlacesAutocomplete(query: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionTokenRef = useRef<string>("");
  const skipNextSearchRef = useRef(false);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = crypto.randomUUID();
    setSuggestions([]);
  }, []);

  useEffect(() => {
    if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      setSuggestions([]);
      return;
    }
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query, sessionToken: sessionTokenRef.current }),
        });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const items: PlaceSuggestion[] = (data.suggestions ?? [])
          .map((s: unknown) => {
            const obj = s as {
              placePrediction?: {
                placeId?: string;
                structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
              };
            };
            const pp = obj.placePrediction;
            if (!pp?.placeId) return null;
            return {
              placeId: pp.placeId,
              primaryText: pp.structuredFormat?.mainText?.text ?? "",
              secondaryText: pp.structuredFormat?.secondaryText?.text ?? "",
            } satisfies PlaceSuggestion;
          })
          .filter(Boolean) as PlaceSuggestion[];
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
  }, [query, enabled]);

  /** Indirizzo e coordinate del suggerimento; null se Google non risponde. */
  const select = useCallback(async (suggestion: PlaceSuggestion): Promise<PlaceDetails | null> => {
    const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    skipNextSearchRef.current = true;
    setSuggestions([]);
    return {
      address: data.formattedAddress ?? `${suggestion.primaryText}, ${suggestion.secondaryText}`,
      latitude: data.location?.latitude ?? null,
      longitude: data.location?.longitude ?? null,
      placeId: suggestion.placeId,
    };
  }, []);

  /** Il testo cambia per mano dell'utente: la ricerca riparte. */
  const typed = useCallback(() => {
    skipNextSearchRef.current = false;
  }, []);

  return { suggestions, searching, select, typed, resetSession };
}
