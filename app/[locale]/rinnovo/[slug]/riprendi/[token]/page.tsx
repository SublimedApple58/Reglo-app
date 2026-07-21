import { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveResumeToken } from "@/lib/renewal/public";
import { RenewalChat } from "@/components/pages/Renewal/RenewalChat";

export const metadata: Metadata = {
  title: "Rinnovo patente — integra i documenti",
};

/**
 * Pagina pubblica di RIPRESA (no auth): il cittadino ci arriva dal link
 * dell'email di "ricontatto automatico" e riapre la SUA richiesta per
 * ricaricare i documenti mancanti.
 */
export default async function RenewalResumePage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const resolved = await resolveResumeToken(slug, token);
  if (!resolved) notFound();

  return (
    <RenewalChat
      slug={slug}
      companyName={resolved.company.name}
      initialRequestId={resolved.requestId}
      resumeMode
    />
  );
}
