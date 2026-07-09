"use client";

import React from "react";
import { Download, FileText, Loader2, Receipt, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  deleteBackofficeCompanyDocument,
  getBackofficeCompanyDocuments,
  getBackofficeDocumentDownloadUrl,
} from "@/lib/actions/company-documents.actions";
import {
  formatDocumentSize,
  type CompanyDocumentDto,
  type CompanyDocumentKind,
} from "@/lib/company-documents";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/png,image/jpeg,image/webp";

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DocumentRow({
  doc,
  onDownload,
  onDelete,
  deleting,
}: {
  doc: CompanyDocumentDto;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-white px-3.5 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
        {doc.kind === "invoice" ? (
          <Receipt className="h-4 w-4 text-gray-500" strokeWidth={1.8} />
        ) : (
          <FileText className="h-4 w-4 text-gray-500" strokeWidth={1.8} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{doc.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {doc.fileName} · {formatDocumentSize(doc.sizeBytes)} · {dateLabel(doc.createdAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={onDownload}
        title="Scarica"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
      >
        <Download className="h-4 w-4" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        title="Elimina"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
}

/**
 * Gestione documenti di una autoscuola dal backoffice: contratto (unico, il
 * nuovo upload sostituisce), fatture e altri documenti (N). Quello che viene
 * caricato qui è ciò che il titolare vede in Area personale → Contratto e
 * fattura.
 */
export function BackofficeCompanyDocumentsDialog({
  company,
  onOpenChange,
}: {
  company: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useFeedbackToast();
  const [docs, setDocs] = React.useState<CompanyDocumentDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploadingKind, setUploadingKind] = React.useState<CompanyDocumentKind | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const inputRefs = {
    contract: React.useRef<HTMLInputElement>(null),
    invoice: React.useRef<HTMLInputElement>(null),
    other: React.useRef<HTMLInputElement>(null),
  };

  const companyId = company?.id ?? null;

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    setLoading(true);
    getBackofficeCompanyDocuments(companyId).then((res) => {
      if (!active) return;
      if (res.success && res.data) setDocs(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  const upload = async (kind: CompanyDocumentKind, file: File) => {
    if (!companyId) return;
    setUploadingKind(kind);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);
      formData.append("kind", kind);
      const res = await fetch("/api/backoffice/company-documents", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: CompanyDocumentDto;
      };
      if (!res.ok || !json.success || !json.data) {
        toast.error({ description: json.message ?? "Upload non riuscito." });
        return;
      }
      setDocs((prev) => [
        json.data as CompanyDocumentDto,
        // il contratto è unico: rimpiazza il precedente anche in lista
        ...prev.filter((d) => (kind === "contract" ? d.kind !== "contract" : true)),
      ]);
      toast.success({ description: "Documento caricato." });
    } catch {
      toast.error({ description: "Upload non riuscito." });
    } finally {
      setUploadingKind(null);
    }
  };

  const download = async (doc: CompanyDocumentDto) => {
    const res = await getBackofficeDocumentDownloadUrl(doc.id);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Download non riuscito." });
      return;
    }
    window.open(res.data.url, "_blank", "noopener");
  };

  const remove = async (doc: CompanyDocumentDto) => {
    setDeletingId(doc.id);
    try {
      const res = await deleteBackofficeCompanyDocument(doc.id);
      if (!res.success) {
        toast.error({ description: res.message ?? "Eliminazione non riuscita." });
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } finally {
      setDeletingId(null);
    }
  };

  const sections: Array<{
    kind: CompanyDocumentKind;
    title: string;
    hint: string;
    uploadLabel: string;
  }> = [
    {
      kind: "contract",
      title: "Contratto",
      hint: "Unico: un nuovo caricamento sostituisce il precedente.",
      uploadLabel: docs.some((d) => d.kind === "contract")
        ? "Sostituisci contratto"
        : "Carica contratto",
    },
    { kind: "invoice", title: "Fatture", hint: "", uploadLabel: "Carica fattura" },
    { kind: "other", title: "Altri documenti", hint: "", uploadLabel: "Carica documento" },
  ];

  return (
    <Dialog open={Boolean(company)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Documenti — {company?.name}</DialogTitle>
          <DialogDescription>
            Contratto, fatture e altri documenti: il titolare li vede in Area personale →
            &quot;Contratto e fattura&quot;.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => {
              const sectionDocs = docs.filter((d) => d.kind === section.kind);
              return (
                <div key={section.kind}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{section.title}</div>
                      {section.hint && (
                        <div className="text-xs text-muted-foreground">{section.hint}</div>
                      )}
                    </div>
                    <input
                      ref={inputRefs[section.kind]}
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void upload(section.kind, file);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadingKind !== null}
                      onClick={() => inputRefs[section.kind].current?.click()}
                    >
                      {uploadingKind === section.kind ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {section.uploadLabel}
                    </Button>
                  </div>
                  {sectionDocs.length > 0 ? (
                    <div className="space-y-2">
                      {sectionDocs.map((doc) => (
                        <DocumentRow
                          key={doc.id}
                          doc={doc}
                          onDownload={() => void download(doc)}
                          onDelete={() => void remove(doc)}
                          deleting={deletingId === doc.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/80 px-3.5 py-3 text-center text-xs text-muted-foreground">
                      Nessun documento caricato.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
