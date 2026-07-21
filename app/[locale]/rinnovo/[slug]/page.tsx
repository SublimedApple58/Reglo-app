import { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveRenewalCompany } from "@/lib/renewal/public";
import { RenewalChat } from "@/components/pages/Renewal/RenewalChat";

export const metadata: Metadata = {
  title: "Rinnovo patente",
};

// Pagina pubblica (no auth): il cittadino ci arriva dal link dell'autoscuola.
export default async function RenewalPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await resolveRenewalCompany(slug);
  if (!company) notFound();

  return <RenewalChat slug={slug} companyName={company.name} />;
}
