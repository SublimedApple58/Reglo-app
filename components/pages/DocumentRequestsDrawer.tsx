"use client";

import React from "react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Document, Page, pdfjs } from "react-pdf";
import useMeasure from "react-use-measure";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type RequestItem = {
  id: string;
  name: string;
  templateName: string;
  status: string;
  completedByName: string | null;
  completedAt: string | null;
  resultUrl: string | null;
};

type DocumentRequestsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestItem | null;
  publicUrl: string | null;
  onCopyLink: (url: string) => void;
};

export function DocumentRequestsDrawer({
  open,
  onOpenChange,
  request,
  publicUrl,
  onCopyLink,
}: DocumentRequestsDrawerProps): React.ReactElement {
  const isMobile = useIsMobile();
  const statusLabel = request?.status === "completed" ? "Completato" : "In corso";
  const [previewRef, bounds] = useMeasure();
  const pageWidth = Math.max(1, Math.floor(bounds.width || 0));
  const pdfOptions = React.useMemo(
    () => ({ disableRange: true, disableStream: true }),
    [],
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent className="lg:w-[460px]">
        {request ? (
          <>
            <DrawerHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DrawerTitle>{request.name}</DrawerTitle>
                  <DrawerDescription>
                    Template · {request.templateName}
                  </DrawerDescription>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-semibold",
                    request.status === "completed" &&
                      "bg-emerald-100 text-emerald-700",
                    request.status !== "completed" && "bg-sky-100 text-sky-700",
                  )}
                >
                  {statusLabel}
                </span>
              </div>
            </DrawerHeader>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="mt-3 rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Dettagli
                </p>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Stato</span>
                    <span className="font-medium text-foreground">
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Compilato da</span>
                    <span className="font-medium text-foreground">
                      {request.completedByName ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Completato</span>
                    <span className="font-medium text-foreground">
                      {request.completedAt
                        ? new Date(request.completedAt).toLocaleString("it-IT")
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Anteprima compilata
                </p>
                {request.resultUrl ? (
                  <div
                    ref={previewRef}
                    className="mt-3 overflow-hidden rounded-lg bg-white"
                  >
                    <Document
                      file={request.resultUrl}
                      loading={null}
                      options={pdfOptions}
                    >
                      <Page
                        pageNumber={1}
                        width={pageWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Documento in compilazione. Il PDF apparirà qui una volta completato.
                  </p>
                )}
              </div>
            </div>
            <DrawerFooter className="border-t">
              {publicUrl && request.status !== "completed" ? (
                <Button onClick={() => onCopyLink(publicUrl)}>Copia link</Button>
              ) : null}
              {request.resultUrl ? (
                <Button asChild variant="outline">
                  <a href={request.resultUrl} target="_blank" rel="noreferrer">
                    Apri PDF
                  </a>
                </Button>
              ) : null}
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
