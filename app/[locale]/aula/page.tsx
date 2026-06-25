import { Metadata } from "next";
import { listAulaLessons } from "@/lib/actions/aula.actions";
import { AulaLessonsPage } from "@/components/pages/Aula/AulaLessonsPage";

export const metadata: Metadata = {
  title: "Reglo Aula — Lezioni",
};

export default async function AulaPage() {
  const res = await listAulaLessons();
  return (
    <AulaLessonsPage
      lessons={res.success && res.data ? res.data : []}
      error={!res.success ? res.message : undefined}
    />
  );
}
