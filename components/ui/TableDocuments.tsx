import { useEffect, useState, useRef, useMemo } from "react";
import { Button } from "./button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Checkbox } from "../animate-ui/radix/checkbox";
import { useSetAtom } from "jotai";
import { Documents } from "@/atoms/TabelsStore";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DocumentsDrawer } from "../pages/DocumentsDrawer";

interface SelectedInvoicesState {
  [key: string]: boolean;
}

const PAGE_DIMENSION = 20;

export function TableDocuments({
  selectable = true,
}: {
  selectable?: boolean;
}): React.ReactElement {
  const documents = [
    {
      title: "Project Alpha Proposal",
      status: "Paid",
      client: "Acme Corp",
    },
    {
      title: "Website Redesign Contract",
      status: "Pending",
      client: "Globex Inc.",
    },
    {
      title: "Marketing Campaign Report Q1",
      status: "Unpaid",
      client: "Stark Industries",
    },
    {
      title: "Software Development Agreement",
      status: "Paid",
      client: "Wayne Enterprises",
    },
    {
      title: "Consulting Services Invoice #1",
      status: "Paid",
      client: "Cyberdyne Systems",
    },
    {
      title: "Annual Maintenance Plan",
      status: "Pending",
      client: "Umbrella Corp",
    },
    {
      title: "Brand Guideline Document",
      status: "Unpaid",
      client: "Tyrell Corporation",
    },
    {
      title: "New Product Launch Plan",
      status: "Paid",
      client: "Weyland-Yutani",
    },
    {
      title: "Server Migration Proposal",
      status: "Draft",
      client: "Omni Consumer Products",
    },
    {
      title: "Mobile App Development Quote",
      status: "Pending",
      client: "Roxxon Corporation",
    },
    {
      title: "Social Media Strategy",
      status: "Overdue",
      client: "Massive Dynamic",
    },
    {
      title: "Content Creation Agreement",
      status: "Paid",
      client: "InGen",
    },
    {
      title: "E-commerce Platform Upgrade",
      status: "Paid",
      client: "Soylent Corp",
    },
    {
      title: "Financial Audit Report 2024",
      status: "Pending",
      client: "Gringotts Wizarding Bank",
    },
    {
      title: "Cloud Computing Services Contract",
      status: "Unpaid",
      client: "Oscorp",
    },
    {
      title: "IT Support Services Agreement",
      status: "Paid",
      client: "Veridian Dynamics",
    },
    {
      title: "Digital Marketing Analytics",
      status: "Paid",
      client: "Wonka Industries",
    },
    {
      title: "UX/UI Design Mockups",
      status: "Pending",
      client: "Dunder Mifflin",
    },
    {
      title: "Network Security Review",
      status: "Unpaid",
      client: "Bluth Company",
    },
    {
      title: "Sales Training Program",
      status: "Draft",
      client: "Vandelay Industries",
    },
    {
      title: "SEO Optimization Plan",
      status: "Overdue",
      client: "Pied Piper",
    },
    {
      title: "Video Production Contract",
      status: "Paid",
      client: "Sterling Cooper Draper Price",
    },
    {
      title: "Customer Relationship Management Strategy",
      status: "Paid",
      client: "Sirius Cybernetics Corporation",
    },
    {
      title: "Market Research Study",
      status: "Pending",
      client: "Tyrell Corporation",
    },
    {
      title: "Legal Services Retainer",
      status: "Unpaid",
      client: "Globex Inc.",
    },
    {
      title: "Employee Handbook Update",
      status: "Paid",
      client: "Acme Corp",
    },
    {
      title: "Server Maintenance Log",
      status: "Paid",
      client: "Stark Industries",
    },
    {
      title: "Quarterly Business Review",
      status: "Pending",
      client: "Wayne Enterprises",
    },
    {
      title: "API Integration Documentation",
      status: "Unpaid",
      client: "Cyberdyne Systems",
    },
    {
      title: "Investment Portfolio Analysis",
      status: "Draft",
      client: "Umbrella Corp",
    },
    {
      title: "Hardware Procurement Order",
      status: "Overdue",
      client: "Weyland-Yutani",
    },
    {
      title: "Client Onboarding Checklist",
      status: "Paid",
      client: "Omni Consumer Products",
    },
    {
      title: "Software License Agreement",
      status: "Paid",
      client: "Roxxon Corporation",
    },
    {
      title: "Project Management Plan",
      status: "Pending",
      client: "Massive Dynamic",
    },
    {
      title: "Disaster Recovery Strategy",
      status: "Unpaid",
      client: "InGen",
    },
    {
      title: "Supply Chain Optimization Report",
      status: "Paid",
      client: "Soylent Corp",
    },
    {
      title: "Training Module Development",
      status: "Paid",
      client: "Gringotts Wizarding Bank",
    },
    {
      title: "Cybersecurity Policy",
      status: "Pending",
      client: "Oscorp",
    },
    {
      title: "Vendor Agreement Renewal",
      status: "Unpaid",
      client: "Veridian Dynamics",
    },
    {
      title: "Product Feature Roadmap",
      status: "Draft",
      client: "Wonka Industries",
    },
    {
      title: "Budget Proposal 2025",
      status: "Overdue",
      client: "Dunder Mifflin",
    },
    {
      title: "HR Policy Document",
      status: "Paid",
      client: "Bluth Company",
    },
    {
      title: "Quality Assurance Report",
      status: "Paid",
      client: "Vandelay Industries",
    },
    {
      title: "Website Analytics Report",
      status: "Pending",
      client: "Pied Piper",
    },
    {
      title: "Contract Review & Amendment",
      status: "Unpaid",
      client: "Sterling Cooper Draper Price",
    },
    {
      title: "Meeting Minutes - Board of Directors",
      status: "Paid",
      client: "Sirius Cybernetics Corporation",
    },
    {
      title: "Research & Development Brief",
      status: "Paid",
      client: "Tyrell Corporation",
    },
    {
      title: "New Hire Onboarding Packet",
      status: "Pending",
      client: "Globex Inc.",
    },
    {
      title: "Client Feedback Survey Results",
      status: "Unpaid",
      client: "Acme Corp",
    },
    {
      title: "Project Closure Report - Q2",
      status: "Paid",
      client: "Stark Industries",
    },
  ];

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const setRows = useSetAtom(Documents.rows);
  const setTotalSelected = useSetAtom(Documents.documentsRowsSelected);

  const page = Number(searchParams.get("page")) || 1;
  const searchTerm = searchParams.get("search") || "";

  const isInitialMount = useRef(true);
  const [isFading, setIsFading] = useState<boolean>(false);
  const [selectedInvoices, setSelectedInvoices] = useState<SelectedInvoicesState>({});
  const [documentsToShow, setDocumentsToShow] = useState<typeof documents>([]);
  const [openDrawer, setOpenDrawer] = useState<boolean>(false);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) {
      return documents;
    }
    const lowercasedSearch = searchTerm.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(lowercasedSearch) ||
        doc.status.toLowerCase().includes(lowercasedSearch) ||
        doc.client.toLowerCase().includes(lowercasedSearch)
    );
  }, [searchTerm]);

  useEffect(() => {
    setRows(filteredDocuments.length);
  }, [filteredDocuments, setRows]);
  
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    router.push(`${pathname}?${params}`);
    
  }, [searchTerm]);

  useEffect(() => {
    setIsFading(true);
    const timer = setTimeout(() => {
      const startIndex = (page - 1) * PAGE_DIMENSION;
      const endIndex = startIndex + PAGE_DIMENSION;
      setDocumentsToShow(filteredDocuments.slice(startIndex, endIndex));
      setIsFading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [page, filteredDocuments]);

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices((prevSelected) => ({
      ...prevSelected,
      [invoiceId]: !prevSelected[invoiceId],
    }));
  };

  const handleSelectAll = () => {
    const allSelectedOnPage = documentsToShow.every(
      (doc) => selectedInvoices[doc.title]
    );

    const newSelected = { ...selectedInvoices };

    if (allSelectedOnPage) {
      documentsToShow.forEach((document) => {
        delete newSelected[document.title];
      });
    } else {
      documentsToShow.forEach((document) => {
        newSelected[document.title] = true;
      });
    }
    setSelectedInvoices(newSelected);
  };

  const totalSelected = Object.values(selectedInvoices).filter(Boolean).length;

  useEffect(() => {
    setTotalSelected(totalSelected);
  }, [totalSelected]);

  const areAllOnPageSelected =
    documentsToShow.length > 0 &&
    documentsToShow.every((doc) => selectedInvoices[doc.title]);

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
                  aria-label="Select all invoices on this page"
                />
              </TableHead>
            )}
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentsToShow?.map((doc) => (
            <TableRow key={doc.title}>
              {selectable && (
                <TableCell className="text-center">
                  <Checkbox
                    checked={selectedInvoices[doc.title] || false}
                    onCheckedChange={() => handleSelectInvoice(doc.title)}
                    aria-label={`Select invoice ${doc.title}`}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium">{doc.title}</TableCell>
              <TableCell>{doc.status}</TableCell>
              <TableCell>{doc.client}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="default" onClick={() => setOpenDrawer(true)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DocumentsDrawer open={openDrawer} onOpenChange={(e) => {
        if(!e){
          setOpenDrawer(e)
        }
      }}/>
    </div>
  );
}