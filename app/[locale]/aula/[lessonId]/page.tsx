import { Metadata } from "next";
import { requireUserAndCompany } from "@/lib/auth-guard";
import { notFound } from "next/navigation";
import { getAulaLesson } from "@/lib/actions/aula.actions";
import { AulaLessonEditor } from "@/components/pages/Aula/AulaLessonEditor";

export const metadata: Metadata = {
  title: "Reglo Aula — Lezione",
};

export default async function AulaLessonPage({
  params,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
}) {
  const { locale, lessonId } = await params;
  // REG-773: chi è in manutenzione va alla schermata dedicata.
  await requireUserAndCompany(locale);
  const res = await getAulaLesson(lessonId);
  if (!res.success || !res.data) notFound();

  return (
    <AulaLessonEditor
      lesson={res.data.lesson}
      initialPackage={res.data.package}
    />
  );
}
