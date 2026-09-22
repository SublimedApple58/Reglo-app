import { Metadata } from "next";
import { getQuizStudentsOverview } from "@/lib/actions/autoscuole-quiz.actions";
import { QuizStudentStatsPage } from "@/components/pages/QuizStats/QuizStudentStatsPage";
// Questa pagina vive FUORI da AutoscuoleShell, quindi non eredita il provider
// dell'ordine nome allievo: se lo si toglie, torna a scrivere "Nome Cognome".
import { StudentNameOrderProvider } from "@/components/pages/Autoscuole/student-name-order-context";

export const metadata: Metadata = {
  title: "Quiz Patente - Statistiche",
};

export default async function QuizStatsPage() {
  const res = await getQuizStudentsOverview();

  return (
    <StudentNameOrderProvider>
      <QuizStudentStatsPage
        students={res.success && res.data ? (res.data as React.ComponentProps<typeof QuizStudentStatsPage>["students"]) : []}
        error={!res.success ? res.message : undefined}
      />
    </StudentNameOrderProvider>
  );
}
