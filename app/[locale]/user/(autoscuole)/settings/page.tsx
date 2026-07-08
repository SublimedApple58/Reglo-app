import { redirect } from "next/navigation";

type SettingsSearchParams = {
  integrationSuccess?: string | string[];
  integrationError?: string | string[];
};

/**
 * La vecchia pagina Profilo è stata migrata nell'overlay Impostazioni
 * (Informazioni aziendali + Integrazioni). Questa route resta come redirect:
 * è anche il fallback della callback OAuth delle integrazioni, quindi
 * preserva i parametri di esito e atterra sulla pane giusta.
 */
export default async function Settings({
  searchParams,
}: {
  searchParams?: Promise<SettingsSearchParams>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const single = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  const success = single(resolved.integrationSuccess);
  const error = single(resolved.integrationError);

  const params = new URLSearchParams({ tab: "settings" });
  if (success || error) {
    params.set("pane", "integrations");
    if (success) params.set("integrationSuccess", success);
    if (error) params.set("integrationError", error);
  } else {
    params.set("pane", "business");
  }

  redirect(`/user/autoscuole?${params.toString()}`);
}
