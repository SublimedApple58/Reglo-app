"use client";

import React from "react";
import Link from "next/link";
import { Document, Page, pdfjs } from "react-pdf";
import useMeasure from "react-use-measure";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "../ui/button";
import { FilePenLine, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pdfSource } from "@/components/pages/DocManager/doc-manager.data";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type DocumentItem = {
  id: string;
  title: string;
  status: string;
  previewUrl?: string;
};

export function DocumentsDrawer({
  open,
  onOpenChange,
  document,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  document?: DocumentItem | null;
  onDelete: (docId: string) => void;
}): React.ReactElement {
  const isMobile = useIsMobile();
  const [containerRef, bounds] = useMeasure();
  const pageWidth = Math.max(1, Math.floor(bounds.width || 0));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent className="lg:w-[420px]">
        {document ? (
          <>
            <DrawerHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DrawerTitle>{document.title}</DrawerTitle>
                  <DrawerDescription>ID documento · {document.id}</DrawerDescription>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-semibold",
                    document.status === "Bozza" &&
                      "bg-slate-100 text-slate-600",
                    document.status === "Configurato" &&
                      "bg-amber-100 text-amber-700",
                    document.status === "Bindato" &&
                      "bg-emerald-100 text-emerald-700",
                    document.status === "AI" && "bg-cyan-100 text-cyan-700",
                    !["Bozza", "Configurato", "Bindato", "AI"].includes(
                      document.status,
                    ) && "bg-muted text-muted-foreground",
                  )}
                >
                  {document.status}
                </span>
              </div>
            </DrawerHeader>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="mt-2 rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Dettagli documento
                </p>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Stato</span>
                    <span className="font-medium text-foreground">
                      {document.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Configurazione</span>
                    <span className="font-medium text-foreground">
                      {document.status === "Bozza" ? "No" : "Si"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Binding</span>
                    <span className="font-medium text-foreground">
                      {document.status === "Bindato" ||
                      document.status === "AI"
                        ? "Si"
                        : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Origine</span>
                    <span className="font-medium text-foreground">
                      {document.status === "AI" ? "AI" : "Manuale"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Anteprima
                </p>
                <div
                  ref={containerRef}
                  className="mt-3 w-full overflow-hidden rounded-lg bg-white"
                >
                  <Document file={document.previewUrl ?? pdfSource} loading={null}>
                    <Page
                      pageNumber={1}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                </div>
              </div>
            </div>
            <DrawerFooter className="border-t">
              <Button asChild>
                <Link href={`/user/doc_manager/${document.id}`}>
                  <Pencil className="h-4 w-4" />
                  Modifica nel Doc Manager
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/user/doc_manager/${document.id}/fill`}>
                  <FilePenLine className="h-4 w-4" />
                  Compila documento
                </Link>
              </Button>
              <Button variant="destructive" onClick={() => onDelete(document.id)}>
                <Trash2 className="h-4 w-4" />
                Elimina documento
              </Button>
              <DrawerClose asChild>
                <Button variant="outline">Chiudi</Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
