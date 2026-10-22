import type { Metadata } from "next";
import Link from "next/link";

import { BackofficeAuthShell } from "@/components/pages/Backoffice/BackofficeAuthShell";
import { findBackofficeAccessLink } from "@/lib/backoffice/admin-access";
import { BACKOFFICE_PASSWORD_MIN_LENGTH } from "@/lib/backoffice/admin-credentials";

import { ActivateForm } from "./activate-form";

export const metadata: Metadata = {
  title: "Scegli la password",
  robots: { index: false, follow: false },
};

/**
 * Atterraggio del link ricevuto via email (REG-413): scelta della password
 * personale del backoffice. Il link si verifica qui ma si consuma solo al
 * salvataggio, così ricaricare la pagina non lo brucia.
 */
export default async function BackofficeActivatePage(props: {
  searchParams: Promise<{ t?: string }>;
  params: Promise<{ locale: string }>;
}) {
  const { t } = await props.searchParams;
  const { locale } = await props.params;
  const link = t ? await findBackofficeAccessLink(t) : null;

  if (!link || !t) {
    return (
      <BackofficeAuthShell>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-[#111111]">Link non più valido</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6a6a6a]">
            Il link è scaduto o è già stato usato. Dalla pagina di accesso puoi chiederne uno nuovo.
          </p>
          <Link
            href={`/${locale}/backoffice-sign-in`}
            className="mt-6 inline-block text-sm font-medium text-[#222222] underline decoration-1 underline-offset-4 hover:opacity-70"
          >
            Vai all&apos;accesso
          </Link>
        </div>
      </BackofficeAuthShell>
    );
  }

  const firstName = link.name.split(" ")[0] || link.name;

  return (
    <BackofficeAuthShell>
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold text-[#111111]">
          {link.isFirstAccess ? `Benvenuto, ${firstName}` : "Nuova password"}
        </h1>
        <p className="text-sm text-[#6a6a6a]">
          {link.isFirstAccess
            ? "Scegli la password con cui entrerai nel pannello."
            : "Scegli una password nuova: quella vecchia smette di funzionare."}
        </p>
      </div>
      <ActivateForm token={t} email={link.email} minLength={BACKOFFICE_PASSWORD_MIN_LENGTH} />
    </BackofficeAuthShell>
  );
}
