import { Metadata } from "next";
import { listAulaLessons } from "@/lib/actions/aula.actions";
import { requireUserAndCompany } from "@/lib/auth-guard";
import { AulaLessonsPage } from "@/components/pages/Aula/AulaLessonsPage";

export const metadata: Metadata = {
  title: "Reglo Aula — Lezioni",
};

export default async function AulaPage({ params }: { params: Promise<{ locale: string }> }) {
  // REG-773: chi è in manutenzione va alla schermata dedicata, non a un errore.
  await requireUserAndCompany((await params).locale);
  const res = await listAulaLessons();
  return (
    <AulaLessonsPage
      lessons={res.success && res.data ? res.data : []}
      error={!res.success ? res.message : undefined}
    />
  );
}
