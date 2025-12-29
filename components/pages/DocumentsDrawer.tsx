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
import { FilePenLine, Trash2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type DocumentItem = {
  id: string;
  title: string;
  status: string;
  client: string;
  previewUrl: string;
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
            <DrawerHeader>
              <DrawerTitle>{document.title}</DrawerTitle>
              <DrawerDescription>
                {document.status} · {document.client}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div
                  ref={containerRef}
                  className="w-full overflow-hidden rounded-lg bg-white"
                >
                  <Document file={document.previewUrl} loading={null}>
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
            <DrawerFooter>
              <Button asChild>
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
