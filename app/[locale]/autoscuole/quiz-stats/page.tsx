import { Metadata } from "next";
import { getQuizStudentsOverview } from "@/lib/actions/autoscuole-quiz.actions";
import { QuizStudentStatsPage } from "@/components/pages/QuizStats/QuizStudentStatsPage";

export const metadata: Metadata = {
  title: "Quiz Patente - Statistiche",
};

export default async function QuizStatsPage() {
  const res = await getQuizStudentsOverview();

  return (
    <QuizStudentStatsPage
      students={res.success && res.data ? (res.data as any[]) : []}
      error={!res.success ? res.message : undefined}
    />
  );
}
