import { Metadata } from "next";
import { AulaStudentPlayer } from "@/components/pages/Aula/AulaStudentPlayer";

export const metadata: Metadata = {
  title: "Reglo Aula — Quiz",
};

// Pagina pubblica (no auth, fuori da [locale]): lo studente ci arriva dal QR.
export default async function AulaStudentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <AulaStudentPlayer code={code} />;
}
