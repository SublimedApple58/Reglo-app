import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAulaLesson } from "@/lib/actions/aula.actions";
import { AulaLessonEditor } from "@/components/pages/Aula/AulaLessonEditor";

export const metadata: Metadata = {
  title: "Reglo Aula — Lezione",
};

export default async function AulaLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const res = await getAulaLesson(lessonId);
  if (!res.success || !res.data) notFound();

  return (
    <AulaLessonEditor
      lesson={res.data.lesson}
      initialPackage={res.data.package}
    />
  );
}
