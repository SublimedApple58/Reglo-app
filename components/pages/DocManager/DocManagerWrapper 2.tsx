"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Button } from "@/components/ui/button";
import { ArrowUpFromLine, FilePlus2, MoreHorizontal } from "lucide-react";

const Document = dynamic(() => import("react-pdf").then((mod) => mod.Document), { ssr: false });
const Page = dynamic(() => import("react-pdf").then((mod) => mod.Page), { ssr: false });

const PDF_WORKER_SRC = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

type DocItem = {
  id: string;
  title: string;
  updatedAt: string;
  owner: string;
  previewUrl: string;
};

const documents: DocItem[] = [
  {
    id: "doc-1",
    title: "Contratto fornitore 2025",
    updatedAt: "Aggiornato 2h fa",
    owner: "Tiziano",
    previewUrl: "/file/pdf_example.pdf",
  },
  {
    id: "doc-2",
    title: "Linee guida onboarding",
    updatedAt: "Aggiornato ieri",
    owner: "Ops team",
    previewUrl: "/file/pdf_example.pdf",
  },
  {
    id: "doc-3",
    title: "Report trimestrale",
    updatedAt: "Aggiornato 3gg fa",
    owner: "Finance",
    previewUrl: "/file/pdf_example.pdf",
  },
  {
    id: "doc-4",
    title: "Checklist ISO",
    updatedAt: "Aggiornato 1 settimana fa",
    owner: "Compliance",
    previewUrl: "/file/pdf_example.pdf",
  },
];

export function DocManagerWrapper(): React.ReactElement {
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    // Configure pdf.js worker only when browser context is available
    import("react-pdf").then(({ pdfjs }) => {
      if (!isMounted) return;
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      setPdfReady(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ClientPageWrapper
      title="Doc Manager"
      subTitle="Gestisci e rivedi i documenti caricati. Anteprime rapide, pronto per l'editing."
    >
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button className="gap-2" size="lg">
            <FilePlus2 className="h-4 w-4" />
            Create new document
          </Button>
          <Button className="gap-2" variant="outline" size="lg">
            <ArrowUpFromLine className="h-4 w-4" />
            Upload existing file
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      </div>
    </ClientPageWrapper>
  );
}

function DocCard({ doc }: { doc: DocItem }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setWidth(entry.contentRect.width);
        }
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
      setWidth(containerRef.current.getBoundingClientRect().width);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="group flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-sm transition hover:-translate-y-[1px] hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{doc.title}</p>
          <p className="text-xs text-muted-foreground">{doc.updatedAt} · {doc.owner}</p>
        </div>
        <button
          type="button"
          className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/70"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl bg-muted/50 shadow-inner"
        style={{ aspectRatio: "4 / 3" }}
      >
        {pdfReady && width > 0 && (
          <Document file={doc.previewUrl} loading={<Skeleton />} error={<Skeleton />}>
            <Page pageNumber={1} width={width} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>
        )}
      </div>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
      >
        Apri documento
      </button>
    </div>
  );
}

function Skeleton(): React.ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
      Loading preview...
    </div>
  );
}
