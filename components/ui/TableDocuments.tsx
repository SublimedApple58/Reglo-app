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
    const statusCycle = ["Bozza", "Configurato", "Bindato", "AI"];
    const titles = [
      "Project Alpha Proposal",
      "Website Redesign Contract",
      "Marketing Campaign Report Q1",
      "Software Development Agreement",
      "Consulting Services Invoice #1",
      "Annual Maintenance Plan",
      "Brand Guideline Document",
      "New Product Launch Plan",
      "Server Migration Proposal",
      "Mobile App Development Quote",
      "Social Media Strategy",
      "Content Creation Agreement",
      "E-commerce Platform Upgrade",
      "Financial Audit Report 2024",
      "Cloud Computing Services Contract",
      "IT Support Services Agreement",
      "Digital Marketing Analytics",
      "UX/UI Design Mockups",
      "Network Security Review",
      "Sales Training Program",
      "SEO Optimization Plan",
      "Video Production Contract",
      "Customer Relationship Management Strategy",
      "Market Research Study",
      "Legal Services Retainer",
      "Employee Handbook Update",
      "Server Maintenance Log",
      "Quarterly Business Review",
      "API Integration Documentation",
      "Investment Portfolio Analysis",
      "Hardware Procurement Order",
      "Client Onboarding Checklist",
      "Software License Agreement",
      "Project Management Plan",
      "Disaster Recovery Strategy",
      "Supply Chain Optimization Report",
      "Training Module Development",
      "Cybersecurity Policy",
      "Vendor Agreement Renewal",
      "Product Feature Roadmap",
      "Budget Proposal 2025",
      "HR Policy Document",
      "Quality Assurance Report",
      "Website Analytics Report",
      "Contract Review & Amendment",
      "Meeting Minutes - Board of Directors",
      "Research & Development Brief",
      "New Hire Onboarding Packet",
      "Client Feedback Survey Results",
      "Project Closure Report - Q2",
    ];

    return titles.map((title, index) => ({
      id: `doc-${index + 1}`,
      title,
      status: statusCycle[index % statusCycle.length],
      previewUrl: "/file/pdf_example.pdf",
    }));
  });

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
    setDocuments((prev) => prev.filter((doc) => !selectedIds.includes(doc.id)));
    setSelectedInvoices({});
  }, [deleteRequest, selectedIds, setDocuments, setSelectedInvoices]);

  const handleDelete = (docId: string) => {
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
          {documentsToShow?.map((doc) => (
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
          ))}
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
