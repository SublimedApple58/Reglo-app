/**
 * Link verso il sito marketing (reglo-landing) usati dalle pagine di accesso.
 *
 * Il bottone "Accedi" del sito marketing punta qui; questi sono i link di
 * ritorno. Override con NEXT_PUBLIC_MARKETING_URL per puntare a staging.
 *
 * Nota storica: "Recupera la password" puntava a `/assistenza` del sito
 * perché la web app non aveva un flusso di recupero. Dal REG-485 ce l'ha
 * (`/[locale]/reset-password`), quindi quel link non serve più.
 */
const MARKETING_URL = (
  process.env.NEXT_PUBLIC_MARKETING_URL || 'https://reglo.it'
).replace(/\/+$/, '');

/** Home del sito marketing — link "Scopri Reglo". */
export const MARKETING_HOME_URL = MARKETING_URL;
