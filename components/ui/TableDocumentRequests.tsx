"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { listDocumentRequests } from "@/lib/actions/document-requests.actions";
import { DocumentRequestsDrawer } from "@/components/pages/DocumentRequestsDrawer";
import { useLocale } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type RequestItem = {
  id: string;
  name: string;
  templateName: string;
  status: string;
  publicToken: string;
  completedByName: string | null;
  completedAt: string | null;
  updatedAt: string;
  resultUrl: string | null;
};

const statusLabel = (status: string) =>
  status === "completed" ? "Completato" : "In corso";
const PAGE_DIMENSION = 20;
const normalizeValue = (value: string) => value.trim().toLowerCase();

export function TableDocumentRequests({
  onRowsChange,
}: {
  onRowsChange?: (rows: number) => void;
}): React.ReactElement {
  const toast = useFeedbackToast();
  const locale = useLocale();
  const [requests, setRequests] = React.useState<RequestItem[]>([]);
  const [requestsToShow, setRequestsToShow] = React.useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [openDrawer, setOpenDrawer] = React.useState(false);
  const [activeRequestId, setActiveRequestId] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const page = Number(searchParams.get("page")) || 1;
  const searchTerm = searchParams.get("search") || "";
  const prevSearchTerm = React.useRef(searchTerm);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (isMounted) setIsLoading(true);
      const res = await listDocumentRequests();
      if (!res.success || !res.data) {
        if (isMounted) {
          toast.error({
            description: res.message ?? "Impossibile caricare le compilazioni.",
          });
          setIsLoading(false);
        }
        return;
      }
      if (!isMounted) return;
      setRequests(
        res.data.requests.map((request) => ({
          id: request.id,
          name: request.name,
          templateName: request.templateName,
          status: request.status,
          publicToken: request.publicToken,
          completedByName: request.completedByName ?? null,
          completedAt: request.completedAt ?? null,
          updatedAt: request.updatedAt,
          resultUrl: request.resultUrl ?? null,
        })),
      );
      setIsLoading(false);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  const filteredRequests = React.useMemo(() => {
    const lowercasedSearch = normalizeValue(searchTerm);
    return requests.filter((request) => {
      if (!searchTerm) return true;
      const statusText = statusLabel(request.status);
      return [
        request.name,
        request.templateName,
        request.status,
        statusText,
      ]
        .filter(Boolean)
        .some((value) => normalizeValue(value).includes(lowercasedSearch));
    });
  }, [requests, searchTerm]);

  React.useEffect(() => {
    onRowsChange?.(filteredRequests.length);
  }, [filteredRequests.length, onRowsChange]);

  React.useEffect(() => {
    if (prevSearchTerm.current === searchTerm) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    router.push(`${pathname}?${params}`);
    prevSearchTerm.current = searchTerm;
  }, [pathname, router, searchParams, searchTerm]);

  const totalPages = React.useMemo(
    () => Math.max(1, Math.ceil(filteredRequests.length / PAGE_DIMENSION)),
    [filteredRequests.length],
  );
  const currentPage = Math.min(page, totalPages);

  React.useEffect(() => {
    const startIndex = (currentPage - 1) * PAGE_DIMENSION;
    const endIndex = startIndex + PAGE_DIMENSION;
    setRequestsToShow(filteredRequests.slice(startIndex, endIndex));
  }, [currentPage, filteredRequests]);

  const activeRequest =
    requests.find((request) => request.id === activeRequestId) ?? null;
  const publicUrl = activeRequest?.publicToken
    ? `${origin}/${locale}/public/documents/${activeRequest.publicToken}`
    : null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`request-skeleton-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : requestsToShow.length
              ? requestsToShow.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.name}</TableCell>
                    <TableCell>{request.templateName}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm",
                          request.status === "completed" && "text-emerald-700",
                          request.status !== "completed" && "text-sky-700",
                        )}
                      >
                        {statusLabel(request.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="default"
                        className="rounded-full px-4 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        onClick={() => {
                          setActiveRequestId(request.id);
                          setOpenDrawer(true);
                        }}
                      >
                        Apri
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nessuna compilazione trovata.
                    </TableCell>
                  </TableRow>
                )}
        </TableBody>
      </Table>

      <DocumentRequestsDrawer
        open={openDrawer}
        onOpenChange={(open) => {
          setOpenDrawer(open);
          if (!open) {
            setActiveRequestId(null);
          }
        }}
        request={activeRequest}
        publicUrl={publicUrl}
        onCopyLink={async (url) => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success({ description: "Link copiato negli appunti." });
          } catch (error) {
            toast.error({ description: "Impossibile copiare il link." });
          }
        }}
      />
    </>
  );
}
