import type { Page } from "@playwright/test";

/**
 * Le news "una volta per dispositivo" di AutoscuoleShell (localStorage) aprono
 * un dialog modale che copre la pagina e intercetta i click di ogni spec.
 * Chiavi = AGENDA_PAUSE_NEWS_KEY & co. in `components/Layout/AutoscuoleShell.tsx`:
 * aggiornale quando esce una news nuova.
 */
export const NEWS_SEEN_KEYS = ["reglo-news-seen:agenda-pausa-2026-07"];

/** Marca le news come già viste prima che la pagina carichi. */
export async function markNewsSeen(page: Page) {
  await page.addInitScript((keys) => {
    try {
      keys.forEach((k) => window.localStorage.setItem(k, "1"));
    } catch {
      // storage non disponibile (about:blank): nulla da fare
    }
  }, NEWS_SEEN_KEYS);
}
