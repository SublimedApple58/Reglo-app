import { Metadata } from "next";
import { AulaLiveConsole } from "@/components/pages/Aula/AulaLiveConsole";

export const metadata: Metadata = {
  title: "Reglo Aula — Quiz live",
};

export default async function AulaLivePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <AulaLiveConsole code={code} />;
}
