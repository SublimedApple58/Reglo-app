import type { VariableOption } from "@/components/pages/Workflows/Editor/types";

export const autoscuolaTemplateVariables: VariableOption[] = [
  { label: "Nome allievo", token: "student.firstName" },
  { label: "Cognome allievo", token: "student.lastName" },
  { label: "Email allievo", token: "student.email" },
  { label: "Telefono allievo", token: "student.phone" },
  { label: "Data appuntamento", token: "appointment.date" },
  { label: "Tipo appuntamento", token: "appointment.type" },
  { label: "Stato pratica", token: "case.status" },
  { label: "Scadenza (tipo)", token: "case.deadlineLabel" },
  { label: "Scadenza (data)", token: "case.deadlineDate" },
  { label: "Scadenza foglio rosa", token: "case.pinkSheetExpiresAt" },
  { label: "Scadenza visita medica", token: "case.medicalExpiresAt" },
];
