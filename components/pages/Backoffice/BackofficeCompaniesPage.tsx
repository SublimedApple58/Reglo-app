"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Search, Smartphone } from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
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
import {
  assignAutoscuolaVoiceLine,
  getCompanyStudentPlatforms,
  unassignAutoscuolaVoiceLine,
  updateCompanyService,
} from "@/lib/actions/backoffice.actions";
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
  androidStudents: number;
  iosStudents: number;
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
  const [isAssigning, startAssigning] = useTransition();
  const [isUnassigning, startUnassigning] = useTransition();
  const [status, setStatus] = useState(service?.status ?? "active");
  const [limits, setLimits] = useState<ServiceLimits>({
    ...DEFAULT_SERVICE_LIMITS[serviceKey],
    ...(service?.limits ?? {}),
  });

  // Manual voice line assignment form
  const [assignRoutingMode, setAssignRoutingMode] = useState<"sip" | "twilio">("sip");
  const [assignDisplayNumber, setAssignDisplayNumber] = useState("");
  const [assignTwilioNumber, setAssignTwilioNumber] = useState("");
  const [assignTwilioSid, setAssignTwilioSid] = useState("");

  type StudentRow = { id: string; email: string; platform: string | null; status: string; createdAt: string };
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<"all" | "android" | "ios">("all");

  useEffect(() => {
    if (serviceKey !== "AUTOSCUOLE") return;
    setStudentsLoading(true);
    getCompanyStudentPlatforms(companyId).then((res) => {
      if (res.success) {
        setStudents(res.data.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
      }
    }).finally(() => setStudentsLoading(false));
  }, [companyId, serviceKey]);

  const filteredStudents = students?.filter((s) =>
    platformFilter === "all" ? true : s.platform === platformFilter
  ) ?? [];

  const fields = limitFields[serviceKey];
  const voiceFeatureEnabled = Boolean(limits.voiceFeatureEnabled);
  const voiceProvisioningStatus =
    typeof limits.voiceProvisioningStatus === "string"
      ? limits.voiceProvisioningStatus
      : "not_started";
  const voiceLineRef =
    typeof limits.voiceLineRef === "string" ? limits.voiceLineRef : "";

  const handleAssign = () => {
    startAssigning(async () => {
      const res = await assignAutoscuolaVoiceLine({
        companyId,
        displayNumber: assignDisplayNumber.trim(),
        twilioNumber: assignTwilioNumber.trim(),
        // SIP mode (Messagenet): no Twilio SID — action auto-generates "sip:{number}"
        twilioPhoneSid: assignRoutingMode === "twilio" ? assignTwilioSid.trim() : undefined,
        routingMode: assignRoutingMode,
      });
      if (!res.success || !res.data) {
        toast.error({ description: (!res.success && res.message) ? res.message : "Assegnazione fallita." });
        return;
      }
      toast.success({ description: "Linea assegnata correttamente." });
      const lineId = res.data.lineId;
      setLimits((prev) => ({
        ...prev,
        voiceFeatureEnabled: true,
        voiceProvisioningStatus: "ready" as ServiceLimits["voiceProvisioningStatus"],
        voiceLineRef: lineId,
      }));
      setAssignDisplayNumber("");
      setAssignTwilioNumber("");
      setAssignTwilioSid("");
    });
  };

  const handleUnassign = () => {
    startUnassigning(async () => {
      const res = await unassignAutoscuolaVoiceLine({ companyId });
      if (!res.success) {
        toast.error({ description: res.message ?? "Scollegamento fallito." });
        return;
      }
      toast.success({ description: "Linea scollegata." });
      setLimits((prev) => ({
        ...prev,
        voiceFeatureEnabled: false,
        voiceProvisioningStatus: "not_started" as ServiceLimits["voiceProvisioningStatus"],
        voiceLineRef: null,
        voiceAssistantEnabled: false,
        voiceBookingEnabled: false,
      }));
    });
  };

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
            (() => {
              const rawValue = limits[field.key];
              const numericValue =
                typeof rawValue === "number" && Number.isFinite(rawValue)
                  ? rawValue
                  : 0;
              return (
                <div key={field.key} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {field.label}
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={numericValue}
                    onChange={(event) =>
                      setLimits((prev) => ({
                        ...prev,
                        [field.key]: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>
              );
            })()
          ))}
        </div>
      ) : serviceKey === "AUTOSCUOLE" ? (
        <>
        <div className="space-y-3 rounded-2xl border border-pink-200 bg-pink-50/30 p-3">
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">Voice AI disponibile</span>
            <Checkbox
              checked={voiceFeatureEnabled}
              onCheckedChange={(checked) =>
                setLimits((prev) => ({
                  ...prev,
                  voiceFeatureEnabled: Boolean(checked),
                  voiceProvisioningStatus: Boolean(checked)
                    ? (typeof prev.voiceProvisioningStatus === "string"
                        ? prev.voiceProvisioningStatus
                        : "not_started")
                    : "not_started",
                  voiceLineRef: Boolean(checked) ? (prev.voiceLineRef ?? null) : null,
                }))
              }
            />
          </label>

          {voiceFeatureEnabled && (
            voiceProvisioningStatus === "ready" ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Linea attiva</p>
                  <p className="font-mono text-[10px] text-muted-foreground break-all">{voiceLineRef}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={handleUnassign}
                  disabled={isUnassigning}
                >
                  {isUnassigning && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  {isUnassigning ? "…" : "Scollega"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Assegna linea manualmente
                </p>
                {/* Routing mode toggle */}
                <div className="flex rounded-lg border border-pink-200 bg-white p-0.5 text-xs">
                  {(["sip", "twilio"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAssignRoutingMode(mode)}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1 font-medium transition-colors",
                        assignRoutingMode === mode
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {mode === "sip" ? "SIP / Messagenet" : "Twilio diretto"}
                    </button>
                  ))}
                </div>
                <Input
                  value={assignDisplayNumber}
                  placeholder="Numero display (es. +39 02 1234567)"
                  onChange={(e) => setAssignDisplayNumber(e.target.value)}
                />
                <Input
                  value={assignTwilioNumber}
                  placeholder="Numero E.164 (es. +390212345678)"
                  onChange={(e) => setAssignTwilioNumber(e.target.value)}
                />
                {assignRoutingMode === "twilio" && (
                  <Input
                    value={assignTwilioSid}
                    placeholder="Twilio Phone SID (es. PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)"
                    onChange={(e) => setAssignTwilioSid(e.target.value)}
                  />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleAssign}
                  disabled={
                    isAssigning ||
                    !assignDisplayNumber.trim() ||
                    !assignTwilioNumber.trim() ||
                    (assignRoutingMode === "twilio" && !assignTwilioSid.trim())
                  }
                >
                  {isAssigning && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {isAssigning ? "Assegnazione in corso…" : "Assegna linea"}
                </Button>
              </div>
            )
          )}
        </div>

        {/* Student platforms section */}
        <div className="space-y-2 rounded-2xl border border-yellow-200 bg-yellow-50/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" />
              Allievi invitati
              {students && students.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {students.length}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {(["all", "android", "ios"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPlatformFilter(f)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    platformFilter === f
                      ? f === "android"
                        ? "bg-green-600 text-white"
                        : f === "ios"
                        ? "bg-blue-600 text-white"
                        : "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {f === "all" ? "Tutti" : f === "android" ? "Android" : "iOS"}
                </button>
              ))}
            </div>
          </div>
          {studentsLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Caricamento…
            </div>
          ) : !students || students.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">Nessun allievo invitato.</p>
          ) : filteredStudents.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">Nessun allievo con questa piattaforma.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-pink-200 text-left text-muted-foreground">
                    <th className="pb-1 pr-3 font-medium">Email</th>
                    <th className="pb-1 pr-3 font-medium">Piattaforma</th>
                    <th className="pb-1 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="border-b border-white/30 last:border-0">
                      <td className="py-1 pr-3 text-foreground">{student.email}</td>
                      <td className="py-1 pr-3">
                        {student.platform === "ios" ? (
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">iOS</span>
                        ) : student.platform === "android" ? (
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Android</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1">
                        <span className={
                          student.status === "accepted"
                            ? "text-emerald-600"
                            : student.status === "pending"
                            ? "text-amber-600"
                            : "text-muted-foreground"
                        }>
                          {student.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
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
      <div className="glass-surface glass-strong p-6 bg-gradient-to-br from-pink-50 via-white to-yellow-50 border border-pink-200">
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

      <div className="glass-panel glass-strong p-4 border border-pink-200 shadow-[0_4px_20px_rgba(236,72,153,0.08)]">
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
                <TableHead>Allievi</TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {company.androidStudents > 0 && (
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            Android {company.androidStudents}
                          </span>
                        )}
                        {company.iosStudents > 0 && (
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            iOS {company.iosStudents}
                          </span>
                        )}
                        {company.androidStudents === 0 && company.iosStudents === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
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
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
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
          <DrawerHeader className="border-b border-pink-200 bg-gradient-to-br from-pink-50 via-white to-yellow-50">
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
          <DrawerFooter className="border-t border-pink-200 bg-white">
            <DrawerClose asChild>
              <Button variant="outline">Chiudi</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
