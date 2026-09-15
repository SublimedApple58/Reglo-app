/**
 * REG-451 — link dalla pagina pubblica /i/<codice> all'app Reglo.
 * Lo scheme custom è già registrato nei binari iOS e Android (app.json
 * `expo.scheme`), quindi funziona senza build native; expo-router apre la
 * route `associa-istruttore` con `?code=`.
 */
export const MOBILE_APP_SCHEME = "com.tiziano.developer.reglo-mobile";
export const ANDROID_PACKAGE = "com.tiziano.developer.reglomobile";
export const APP_STORE_URL = "https://apps.apple.com/app/id6759302065";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export type MobilePlatform = "ios" | "android" | "other";

export function detectMobilePlatform(userAgent: string | null | undefined): MobilePlatform {
  const ua = userAgent ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

/** Link "Apri nell'app": su Android un intent che, se l'app manca, apre Play Store. */
export function appOpenUrl(code: string, platform: MobilePlatform): string {
  const path = `associa-istruttore?code=${encodeURIComponent(code)}`;
  if (platform === "android") {
    return `intent://${path}#Intent;scheme=${MOBILE_APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
  }
  return `${MOBILE_APP_SCHEME}://${path}`;
}
