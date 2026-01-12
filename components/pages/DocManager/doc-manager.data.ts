import { PenLine, TextCursorInput, Type } from "lucide-react";
import type { DocItem, FillField, ToolItem } from "./doc-manager.types";

export const pdfSource = "/file/pdf_example.pdf";

export const documents: DocItem[] = [
  {
    id: "doc-1",
    title: "Contratto fornitore 2025",
    updatedAt: "Aggiornato 2h fa",
    owner: "Tiziano",
    previewUrl: pdfSource,
  },
  {
    id: "doc-2",
    title: "Linee guida onboarding",
    updatedAt: "Aggiornato ieri",
    owner: "Ops team",
    previewUrl: pdfSource,
  },
  {
    id: "doc-3",
    title: "Report trimestrale",
    updatedAt: "Aggiornato 3gg fa",
    owner: "Finance",
    previewUrl: pdfSource,
  },
  {
    id: "doc-4",
    title: "Checklist ISO",
    updatedAt: "Aggiornato 1 settimana fa",
    owner: "Compliance",
    previewUrl: pdfSource,
  },
];

export const toolItems: ToolItem[] = [
  { id: "input", label: "Add input field", icon: Type, width: 180, height: 18 },
  { id: "sign", label: "Add sign field", icon: PenLine, width: 160, height: 44 },
  {
    id: "textarea",
    label: "Add text area",
    icon: TextCursorInput,
    width: 240,
    height: 110,
    minWidth: 160,
    minHeight: 80,
    resizable: true,
  },
];

export const fillFields: FillField[] = [
  {
    id: "field-1",
    type: "input",
    label: "Ragione sociale",
    page: 1,
    x: 100,
    y: 280,
    width: 220,
    height: 20,
  },
  {
    id: "field-2",
    type: "textarea",
    label: "Note aggiuntive",
    page: 1,
    x: 100,
    y: 630,
    width: 280,
    height: 110,
  },
  {
    id: "field-3",
    type: "sign",
    label: "Firma",
    page: 1,
    x: 650,
    y: 870,
    width: 200,
    height: 44,
  },
];

export const userProfile = {
  firstName: "Tiziano",
  lastName: "Di Felice",
};
