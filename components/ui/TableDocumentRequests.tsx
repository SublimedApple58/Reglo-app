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

export function TableDocumentRequests(): React.ReactElement {
  const toast = useFeedbackToast();
  const locale = useLocale();
  const [requests, setRequests] = React.useState<RequestItem[]>([]);
  const [openDrawer, setOpenDrawer] = React.useState(false);
  const [activeRequestId, setActiveRequestId] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      const res = await listDocumentRequests();
      if (!res.success || !res.data) {
        if (isMounted) {
          toast.error({
            description: res.message ?? "Impossibile caricare le compilazioni.",
          });
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
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [toast]);

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
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{request.name}</TableCell>
              <TableCell>{request.templateName}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    request.status === "completed" &&
                      "bg-emerald-100 text-emerald-700",
                    request.status !== "completed" &&
                      "bg-sky-100 text-sky-700",
                  )}
                >
                  {statusLabel(request.status)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => {
                    setActiveRequestId(request.id);
                    setOpenDrawer(true);
                  }}
                >
                  Apri
                </Button>
              </TableCell>
            </TableRow>
          ))}
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
