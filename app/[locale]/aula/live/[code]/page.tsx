import { Metadata } from "next";
import { requireUserAndCompany } from "@/lib/auth-guard";
import { AulaLiveConsole } from "@/components/pages/Aula/AulaLiveConsole";

export const metadata: Metadata = {
  title: "Reglo Aula — Quiz live",
};

export default async function AulaLivePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  // REG-773: chi è in manutenzione va alla schermata dedicata.
  await requireUserAndCompany(locale);
  return <AulaLiveConsole code={code} />;
}
