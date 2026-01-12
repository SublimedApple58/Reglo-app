"use client";

import React from "react";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpFromLine,
  FilePenLine,
  FilePlus2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { pdfSource } from "@/components/pages/DocManager/doc-manager.data";
import type { DocItem } from "@/components/pages/DocManager/doc-manager.types";
import {
  deleteDocumentTemplate,
  listDocumentTemplates,
} from "@/lib/actions/document.actions";

export function DocManagerWrapper(): React.ReactElement {
  const toast = useFeedbackToast();
  const [items, setItems] = React.useState<DocItem[]>([]);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [ownerName, setOwnerName] = React.useState("Reglo");
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const formatUpdatedAt = React.useCallback((iso: string) => {
    const updated = new Date(iso);
    const diffMs = Date.now() - updated.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (Number.isNaN(diffMinutes)) return "Aggiornato ora";
    if (diffMinutes < 1) return "Aggiornato ora";
    if (diffMinutes < 60) return `Aggiornato ${diffMinutes}m fa`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Aggiornato ${diffHours}h fa`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Aggiornato ${diffDays}gg fa`;
    return `Aggiornato il ${updated.toLocaleDateString("it-IT")}`;
  }, []);

  const mapDocItem = React.useCallback(
    (
      doc: {
        id: string;
        title: string;
        updatedAt: string;
        owner?: string;
        previewUrl?: string | null;
      },
      ownerFallback: string,
    ): DocItem => ({
      id: doc.id,
      title: doc.title,
      updatedAt: formatUpdatedAt(doc.updatedAt),
      owner: doc.owner ?? ownerFallback,
      previewUrl: doc.previewUrl ?? undefined,
    }),
    [formatUpdatedAt],
  );

  const loadDocuments = React.useCallback(async () => {
    const res = await listDocumentTemplates();
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile caricare i documenti." });
      return;
    }
    setCompanyId(res.data.companyId);
    const inferredOwner =
      res.data.documents[0]?.owner ?? res.data.companyName;
    setOwnerName(inferredOwner);
    setItems(res.data.documents.map((doc) => mapDocItem(doc, inferredOwner)));
  }, [mapDocItem, toast]);

  React.useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (file: File) => {
    if (!companyId) {
      toast.error({ description: "Company non trovata." });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);

      const res = await fetch("/api/uploads/document", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json();
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? "Upload fallito.");
      }

      setItems((prev) => [
        mapDocItem({ ...payload.data, owner: ownerName }, ownerName),
        ...prev,
      ]);
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : "Upload fallito.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    const res = await deleteDocumentTemplate(docId);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile eliminare." });
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== docId));
  };

  return (
    <ClientPageWrapper
      title="Doc Manager"
      subTitle="Gestisci e rivedi i documenti caricati. Anteprime rapide, pronto per l'editing."
    >
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="gap-2"
            size="lg"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <FilePlus2 className="h-4 w-4" />
            Create new document
          </Button>
          <Button
            className="gap-2"
            variant="outline"
            size="lg"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Upload existing file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              handleUpload(file);
            }}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onDelete={() => handleDelete(doc.id)}
            />
          ))}
        </div>
      </div>
    </ClientPageWrapper>
  );
}

function DocCard({ doc, onDelete }: { doc: DocItem; onDelete: () => void }) {
  return (
    <div className="group flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-sm transition hover:-translate-y-[1px] hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{doc.title}</p>
          <p className="text-xs text-muted-foreground">{doc.updatedAt} · {doc.owner}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/70"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuItem asChild>
              <Link
                href={`/user/doc_manager/${doc.id}/fill`}
                className="flex items-center gap-2"
              >
                <FilePenLine className="h-4 w-4" />
                Compila documento
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              Elimina documento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="relative overflow-hidden rounded-xl bg-muted/50 shadow-inner"
        style={{ aspectRatio: "4 / 3" }}
      >
        <PdfPreview src={doc.previewUrl ?? pdfSource} title={doc.title} />
      </div>
      <Link
        href={`/user/doc_manager/${doc.id}`}
        className="inline-flex items-center justify-center rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
      >
        Modifica documento
      </Link>
    </div>
  );
}

function PdfPreview({ src, title }: { src: string; title: string }) {
  return (
    <div className="relative h-full w-full">
      <iframe
        title={`Anteprima ${title}`}
        src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
        className="pointer-events-none absolute inset-0 h-full w-full border-0 origin-center scale-[1.06]"
        tabIndex={-1}
        loading="lazy"
      />
    </div>
  );
}
