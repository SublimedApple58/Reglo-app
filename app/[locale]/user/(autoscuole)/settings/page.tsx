import { redirect } from "next/navigation";

/**
 * La vecchia pagina Profilo è stata ritirata: i dati anagrafici vivono in
 * Impostazioni → Informazioni aziendali, la foto personale in Area personale.
 */
export default function Settings() {
  redirect("/user/autoscuole?tab=settings&pane=business");
}
