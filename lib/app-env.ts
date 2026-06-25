/**
 * Application environment + external-send kill switch.
 *
 * `APP_ENV` is the explicit deploy target: "dev" | "staging" | "prod", set per
 * environment (`.env.staging` sets `APP_ENV=staging`). When unset we do NOT
 * assume staging — external sends stay ON — so existing dev/prod behaviour is
 * unchanged and there is no risk of silently muting production.
 *
 * On STAGING the app must never send real push / email / WhatsApp / etc. to real
 * users (the staging DB is a copy with real contacts), so `externalSendsDisabled()`
 * is true there. It can also be forced anywhere via `DISABLE_EXTERNAL_SENDS=1`.
 *
 * Zero imports on purpose — safe to import from anywhere without cycles.
 */
export type AppEnv = "dev" | "staging" | "prod";

export const APP_ENV: AppEnv = ((): AppEnv => {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "staging" || raw === "dev" || raw === "prod") return raw;
  // Unset → treat as production runtime: external sends remain enabled.
  return "prod";
})();

export const isStaging = (): boolean => APP_ENV === "staging";

/**
 * True when real outbound integrations (push, email, WhatsApp/SMS, voice, FIC
 * invoices, Slack) must be skipped. Guard every real-send entrypoint with this.
 */
export const externalSendsDisabled = (): boolean =>
  isStaging() || process.env.DISABLE_EXTERNAL_SENDS === "1";
