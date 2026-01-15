import { useEffect, useState, useRef, useMemo } from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Checkbox } from "../animate-ui/radix/checkbox";
import { useAtomValue, useSetAtom } from "jotai";
import { Documents } from "@/atoms/TabelsStore";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DocumentsDrawer } from "../pages/DocumentsDrawer";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  deleteDocumentTemplate,
  listDocumentTemplates,
} from "@/lib/actions/document.actions";
import { Skeleton } from "@/components/ui/skeleton";

interface SelectedInvoicesState {
  [key: string]: boolean;
}

const PAGE_DIMENSION = 20;
const normalizeValue = (value: string) => value.trim().toLowerCase();

export function TableDocuments({
  selectable = true,
}: {
  selectable?: boolean;
}): React.ReactElement {
  const [documents, setDocuments] = useState(() => {
    return [] as {
      id: string;
      title: string;
      status: string;
      previewUrl?: string;
    }[];
  });
  const [isLoading, setIsLoading] = useState(true);

  const toast = useFeedbackToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const setRows = useSetAtom(Documents.rows);
  const setTotalSelected = useSetAtom(Documents.documentsRowsSelected);
  const setSelectedIds = useSetAtom(Documents.documentsSelectedIds);
  const deleteRequest = useAtomValue(Documents.documentsDeleteRequest);

  const page = Number(searchParams.get("page")) || 1;
  const searchTerm = searchParams.get("search") || "";
  const statusParam = searchParams.get("status") || "";

  const isInitialMount = useRef(true);
  const prevSearchTerm = useRef(searchTerm);
  const prevStatusParam = useRef(statusParam);
  const [isFading, setIsFading] = useState<boolean>(false);
  const [selectedInvoices, setSelectedInvoices] = useState<SelectedInvoicesState>({});
  const [documentsToShow, setDocumentsToShow] = useState<typeof documents>([]);
  const [openDrawer, setOpenDrawer] = useState<boolean>(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const activeDocument = documents.find((doc) => doc.id === activeDocId) ?? null;
  const lastDeleteRequest = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const loadDocuments = async () => {
      if (isMounted) setIsLoading(true);
      const res = await listDocumentTemplates();
      if (!res.success || !res.data) {
        if (isMounted) {
          toast.error({
            description: res.message ?? "Impossibile caricare i documenti.",
          });
          setIsLoading(false);
        }
        return;
      }
      if (!isMounted) return;
      setDocuments(
        res.data.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          status: doc.status ?? "Bozza",
          previewUrl: doc.previewUrl ?? undefined,
        })),
      );
      setIsLoading(false);
    };

    loadDocuments();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  const statusFilters = useMemo(
    () =>
      statusParam
        .split(",")
        .map(normalizeValue)
        .filter(Boolean),
    [statusParam],
  );

  const filteredDocuments = useMemo(() => {
    const lowercasedSearch = normalizeValue(searchTerm);
    return documents.filter((doc) => {
      const matchesSearch =
        !searchTerm ||
        doc.title.toLowerCase().includes(lowercasedSearch) ||
        doc.status.toLowerCase().includes(lowercasedSearch);
      const matchesStatus =
        statusFilters.length === 0 ||
        statusFilters.includes(normalizeValue(doc.status));
      return matchesSearch && matchesStatus;
    });
  }, [documents, searchTerm, statusFilters]);

  useEffect(() => {
    setRows(filteredDocuments.length);
  }, [filteredDocuments, setRows]);
  
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevSearchTerm.current = searchTerm;
      prevStatusParam.current = statusParam;
      return;
    }

    if (prevSearchTerm.current !== searchTerm || prevStatusParam.current !== statusParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "1");
      router.push(`${pathname}?${params}`);
      prevSearchTerm.current = searchTerm;
      prevStatusParam.current = statusParam;
    }
  }, [pathname, router, searchParams, searchTerm, statusParam]);

  useEffect(() => {
    setIsFading(true);
    const timer = setTimeout(() => {
      const startIndex = (page - 1) * PAGE_DIMENSION;
      const endIndex = startIndex + PAGE_DIMENSION;
      setDocumentsToShow(filteredDocuments.slice(startIndex, endIndex));
      setIsFading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [filteredDocuments, page]);

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices((prevSelected) => ({
      ...prevSelected,
      [invoiceId]: !prevSelected[invoiceId],
    }));
  };

  const handleSelectAll = () => {
    const allSelectedOnPage = documentsToShow.every(
      (doc) => selectedInvoices[doc.id],
    );

    const newSelected = { ...selectedInvoices };

    if (allSelectedOnPage) {
      documentsToShow.forEach((document) => {
        delete newSelected[document.id];
      });
    } else {
      documentsToShow.forEach((document) => {
        newSelected[document.id] = true;
      });
    }
    setSelectedInvoices(newSelected);
  };

  const selectedIds = useMemo(
    () => Object.keys(selectedInvoices).filter((id) => selectedInvoices[id]),
    [selectedInvoices],
  );
  const totalSelected = selectedIds.length;

  useEffect(() => {
    setTotalSelected(totalSelected);
  }, [setTotalSelected, totalSelected]);

  useEffect(() => {
    setSelectedIds(selectedIds);
  }, [selectedIds, setSelectedIds]);

  const areAllOnPageSelected =
    documentsToShow.length > 0 &&
    documentsToShow.every((doc) => selectedInvoices[doc.id]);

  useEffect(() => {
    if (deleteRequest === lastDeleteRequest.current) return;
    lastDeleteRequest.current = deleteRequest;
    if (!deleteRequest || selectedIds.length === 0) return;
    const ids = selectedIds.slice();
    setSelectedInvoices({});
    setSelectedIds([]);
    (async () => {
      const results = await Promise.all(
        ids.map(async (id) => ({ id, res: await deleteDocumentTemplate(id) })),
      );
      const failed = results.find((item) => !item.res.success);
      if (failed) {
        toast.error({
          description:
            failed.res.message ?? "Impossibile eliminare alcuni documenti.",
        });
      }
      setDocuments((prev) => prev.filter((doc) => !ids.includes(doc.id)));
    })();
  }, [deleteRequest, selectedIds, setDocuments, setSelectedIds, setSelectedInvoices, toast]);

  const handleDelete = async (docId: string) => {
    const res = await deleteDocumentTemplate(docId);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile eliminare." });
      return;
    }
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    setSelectedInvoices((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    if (activeDocId === docId) {
      setOpenDrawer(false);
      setActiveDocId(null);
    }
  };

  return (
    <div
      style={{
        transition: "opacity .3s ease-out",
        opacity: isFading ? 0.5 : 1,
      }}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-[50px] text-center">
                <Checkbox
                  checked={areAllOnPageSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all documents on this page"
                />
              </TableHead>
            )}
            <TableHead>Title</TableHead>
            <TableHead>Configurazione</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`document-skeleton-${index}`}>
                  {selectable && (
                    <TableCell className="text-center">
                      <Skeleton className="mx-auto h-4 w-4 rounded" />
                    </TableCell>
                  )}
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : documentsToShow?.length
              ? documentsToShow.map((doc) => (
                  <TableRow key={doc.id}>
                    {selectable && (
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedInvoices[doc.id] || false}
                          onCheckedChange={() => handleSelectInvoice(doc.id)}
                          aria-label={`Select document ${doc.title}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                          doc.status === "Bozza" && "bg-slate-100 text-slate-600",
                          doc.status === "Configurato" && "bg-amber-100 text-amber-700",
                          doc.status === "Bindato" && "bg-emerald-100 text-emerald-700",
                          doc.status === "AI" && "bg-cyan-100 text-cyan-700",
                          !["Bozza", "Configurato", "Bindato", "AI"].includes(doc.status) &&
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {doc.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => {
                          setActiveDocId(doc.id);
                          setOpenDrawer(true);
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : (
                  <TableRow>
                    <TableCell
                      colSpan={selectable ? 4 : 3}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nessun documento trovato.
                    </TableCell>
                  </TableRow>
                )}
        </TableBody>
      </Table>
      <DocumentsDrawer
        open={openDrawer}
        onOpenChange={(open) => {
          setOpenDrawer(open);
          if (!open) {
            setActiveDocId(null);
          }
        }}
        document={activeDocument}
        onDelete={handleDelete}
      />
    </div>
  );
}
