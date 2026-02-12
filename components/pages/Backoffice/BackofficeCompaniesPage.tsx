"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateCompanyService } from "@/lib/actions/backoffice.actions";
import {
  DEFAULT_SERVICE_LIMITS,
  SERVICE_KEYS,
  SERVICE_LABELS,
  type CompanyServiceInfo,
  type ServiceKey,
  type ServiceLimits,
} from "@/lib/services";
import { cn } from "@/lib/utils";

export type BackofficeCompanyRow = {
  id: string;
  name: string;
  createdAt: string;
  services: CompanyServiceInfo[];
};

const limitFields: Record<
  ServiceKey,
  Array<{ key: keyof ServiceLimits; label: string }>
> = {
  DOC_MANAGER: [{ key: "documentsPerMonth", label: "Documenti / mese" }],
  WORKFLOWS: [{ key: "workflowRunsPerMonth", label: "Run / mese" }],
  AI_ASSISTANT: [{ key: "aiCreditsPerMonth", label: "Crediti AI / mese" }],
  AUTOSCUOLE: [],
};

function ServiceCard({
  companyId,
  serviceKey,
  service,
}: {
  companyId: string;
  serviceKey: ServiceKey;
  service?: CompanyServiceInfo;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(service?.status ?? "active");
  const [limits, setLimits] = useState<ServiceLimits>({
    ...DEFAULT_SERVICE_LIMITS[serviceKey],
    ...(service?.limits ?? {}),
  });

  const fields = limitFields[serviceKey];

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateCompanyService({
        companyId,
        serviceKey,
        status,
        limits,
      });
      if (!res.success) {
        toast.error({
          description: res.message ?? "Impossibile aggiornare il servizio.",
        });
        return;
      }
      toast.success({ description: "Servizio aggiornato." });
    });
  };

  return (
    <Card className="glass-card glass-strong flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {SERVICE_LABELS[serviceKey]}
          </p>
          <p className="text-sm text-muted-foreground">
            {serviceKey === "AUTOSCUOLE"
              ? "Modulo verticale"
              : "Servizio core"}
          </p>
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="disabled">Disattivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fields.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {field.label}
              </p>
              <Input
                type="number"
                min={0}
                value={limits[field.key] ?? 0}
                onChange={(event) =>
                  setLimits((prev) => ({
                    ...prev,
                    [field.key]: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nessun limite specifico per questo modulo.
        </p>
      )}

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Salvataggio..." : "Salva"}
      </Button>
    </Card>
  );
}

export default function BackofficeCompaniesPage({
  companies,
}: {
  companies: BackofficeCompanyRow[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<BackofficeCompanyRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) =>
      company.name.toLowerCase().includes(term),
    );
  }, [companies, query]);

  return (
    <div className="space-y-6">
      <div className="glass-surface glass-strong p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Backoffice Reglo
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Company & servizi
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestisci i servizi attivi per ogni company e i limiti mensili.
        </p>
      </div>

      <div className="glass-panel glass-strong p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Search className="h-4 w-4" />
            Cerca company
          </div>
          <div className="w-full max-w-sm">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Es. Autoscuola Roma"
            />
          </div>
        </div>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Creata</TableHead>
                <TableHead>Servizi attivi</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length ? (
                filtered.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">
                      {company.name}
                    </TableCell>
                    <TableCell>
                      {new Date(company.createdAt).toLocaleDateString("it-IT")}
                    </TableCell>
                    <TableCell>
                      {company.services.filter((service) => service.status === "active").length} / {SERVICE_KEYS.length}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(company);
                          setDrawerOpen(true);
                        }}
                      >
                        Gestisci
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nessuna company trovata.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
        <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,820px)] data-[vaul-drawer-direction=right]:sm:max-w-3xl h-full">
          <DrawerHeader className="border-b border-white/60 bg-white/80 backdrop-blur">
            <DrawerTitle>Gestisci company</DrawerTitle>
            <DrawerDescription>
              {selected?.name ?? "Company"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {selected
                ? SERVICE_KEYS.map((serviceKey) => {
                    const match = selected.services.find(
                      (service) => service.key === serviceKey,
                    );
                    return (
                      <ServiceCard
                        key={`${selected.id}-${serviceKey}`}
                        companyId={selected.id}
                        serviceKey={serviceKey}
                        service={match}
                      />
                    );
                  })
                : null}
            </div>
          </div>
          <DrawerFooter className="border-t border-white/60 bg-white/90 backdrop-blur">
            <DrawerClose asChild>
              <Button variant="outline">Chiudi</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
