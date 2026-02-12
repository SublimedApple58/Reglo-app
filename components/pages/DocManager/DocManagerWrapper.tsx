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
  createBlankDocumentTemplate,
  listDocumentTemplates,
} from "@/lib/actions/document.actions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputButton,
  InputButtonAction,
  InputButtonInput,
  InputButtonProvider,
  InputButtonSubmit,
} from "@/components/animate-ui/buttons/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PdfViewer } from "@/components/pages/DocManager/PdfViewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageEmptyState } from "@/components/ui/page-states";

export function DocManagerWrapper(): React.ReactElement {
  const toast = useFeedbackToast();
  const [items, setItems] = React.useState<DocItem[]>([]);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [ownerName, setOwnerName] = React.useState("Reglo");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [showInput, setShowInput] = React.useState(true);
  const [value, setValue] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [documentName, setDocumentName] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchTerm = searchParams.get("search") || "";

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
    setIsLoading(true);
    const res = await listDocumentTemplates();
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile caricare i documenti." });
      setIsLoading(false);
      return;
    }
    setCompanyId(res.data.companyId);
    const inferredOwner =
      res.data.documents[0]?.owner ?? res.data.companyName;
    setOwnerName(inferredOwner);
    setItems(res.data.documents.map((doc) => mapDocItem(doc, inferredOwner)));
    setIsLoading(false);
  }, [mapDocItem, toast]);

  React.useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  React.useEffect(() => {
    setValue(searchTerm);
  }, [searchTerm]);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!showInput) {
        setShowInput(true);
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      router.push(`${pathname}?${params}`);
    },
    [showInput, value, pathname, router, searchParams],
  );

  const filteredItems = React.useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((doc) =>
      [doc.title, doc.owner].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [items, searchTerm]);

  const handleCreateDocument = async () => {
    if (!companyId) {
      toast.error({ description: "Company non trovata." });
      return;
    }
    const trimmed = documentName.trim();
    if (!trimmed) {
      toast.error({ description: "Inserisci un nome documento." });
      return;
    }
    setIsCreating(true);
    const res = await createBlankDocumentTemplate({
      companyId,
      name: trimmed,
    });
    if (!res.success || !res.templateId) {
      toast.error({ description: res.message ?? "Creazione fallita." });
      setIsCreating(false);
      return;
    }
    setCreateOpen(false);
    setDocumentName("");
    setIsCreating(false);
    router.push(`/user/doc_manager/${res.templateId}`);
  };

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
    if (res.message && res.message !== "Document deleted") {
      toast.info({ description: res.message });
    }
    setItems((prev) => prev.filter((item) => item.id !== docId));
  };

  return (
    <ClientPageWrapper
      title="Doc Manager"
      subTitle="Gestisci e rivedi i documenti caricati. Anteprime rapide, pronto per l'editing."
    >
      <div className="flex flex-1 flex-col gap-5">
        <div className="glass-panel glass-strong flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <form onSubmit={handleSubmit} className="w-full md:max-w-sm">
            <InputButtonProvider
              showInput={showInput}
              setShowInput={setShowInput}
              className="w-full"
            >
              <InputButton className="w-full">
                <InputButtonAction className="hidden" />
                <InputButtonSubmit
                  onClick={() => {}}
                  type="submit"
                  className="bg-foreground text-background hover:bg-foreground/90"
                />
              </InputButton>
              <InputButtonInput
                type="text"
                placeholder="Cerca documenti"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="border-white/60 bg-white/80 pr-14 text-sm shadow-sm"
                autoFocus
              />
            </InputButtonProvider>
          </form>
          <div className="flex flex-wrap items-center gap-3">
          <Button
            className="gap-2 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            size="lg"
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={isCreating || !companyId}
          >
            <FilePlus2 className="h-4 w-4" />
            Create new document
          </Button>
          <Button
            className="gap-2 rounded-full border-white/60 bg-white/80 text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
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
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`doc-skeleton-${index}`}
                  className="flex flex-col gap-3 rounded-2xl border border-white/40 bg-white/60 p-3 shadow-[0_18px_50px_-40px_rgba(50,78,122,0.35)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <div
                    className="relative overflow-hidden rounded-xl border border-white/50 bg-white/70 shadow-inner"
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    <Skeleton className="h-full w-full rounded-none" />
                  </div>
                  <Skeleton className="h-9 w-full rounded-xl" />
                </div>
              ))
            : filteredItems.length
              ? filteredItems.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))
              : (
                  <div className="md:col-span-2 xl:col-span-3">
                    <PageEmptyState
                      title="Nessun documento trovato"
                      description="Carica un file PDF o crea un documento vuoto per iniziare."
                    />
                  </div>
                )}
        </div>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo documento</DialogTitle>
            <DialogDescription>
              Dai un nome al documento da creare.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="document-name">Nome documento</Label>
            <Input
              id="document-name"
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              placeholder="Es. Accordo di servizio"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={isCreating}
            >
              Annulla
            </Button>
            <Button type="button" onClick={handleCreateDocument} disabled={isCreating}>
              {isCreating ? "Creo..." : "Crea documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}

function DocCard({ doc, onDelete }: { doc: DocItem; onDelete: () => void }) {
  return (
    <div className="glass-card group flex flex-col gap-3 p-3 transition hover:-translate-y-[1px] hover:shadow-[0_26px_60px_-50px_rgba(50,78,122,0.55)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            {doc.updatedAt} · {doc.owner}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full border border-white/60 bg-white/70 p-2 text-muted-foreground shadow-sm transition hover:bg-white"
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
        className="relative overflow-hidden rounded-xl border border-white/60 bg-white/80 shadow-inner"
        style={{ aspectRatio: "4 / 3" }}
      >
        <PdfPreview src={doc.previewUrl ?? pdfSource} title={doc.title} />
      </div>
      <Link
        href={`/user/doc_manager/${doc.id}`}
        className="inline-flex items-center justify-center rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
      >
        Modifica documento
      </Link>
    </div>
  );
}

function PdfPreview({ src, title }: { src: string; title: string }) {
  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0 h-full w-full"
        aria-label={`Anteprima ${title}`}
      >
        <PdfViewer file={src} maxPages={1} />
      </div>
    </div>
  );
}
