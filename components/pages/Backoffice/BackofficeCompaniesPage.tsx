"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Car,
  Loader2,
  Phone,
  Search,
  Smartphone,
  Trash2,
  GraduationCap,
  PhoneOff,
  CircleCheck,
  CircleX,
} from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
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
  deleteCompany,
  getCompanyStudentPlatforms,
  getVoiceLineDisplayNumber,
  provisionAutoscuolaVoiceLine,
  unassignAutoscuolaVoiceLine,
  updateCompanyService,
} from "@/lib/actions/backoffice.actions";
import {
  DEFAULT_SERVICE_LIMITS,
  type CompanyServiceInfo,
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

/* ─────────────────────────────────────────────────────────────
   Drawer content: manages the single AUTOSCUOLE service
   ───────────────────────────────────────────────────────────── */

function AutoscuolaDrawerContent({
  companyId,
  service,
}: {
  companyId: string;
  service?: CompanyServiceInfo;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [isAssigning, startAssigning] = useTransition();
  const [isProvisioning, startProvisioning] = useTransition();
  const [isUnassigning, startUnassigning] = useTransition();
  const [status, setStatus] = useState(service?.status ?? "active");
  const [limits, setLimits] = useState<ServiceLimits>({
    ...DEFAULT_SERVICE_LIMITS.AUTOSCUOLE,
    ...(service?.limits ?? {}),
  });
  const [provisionedNumber, setProvisionedNumber] = useState<string | null>(null);

  // Voice line form (manual fallback)
  const [showManualForm, setShowManualForm] = useState(false);
  const [assignRoutingMode, setAssignRoutingMode] = useState<"sip" | "twilio">("sip");
  const [assignDisplayNumber, setAssignDisplayNumber] = useState("");
  const [assignTwilioNumber, setAssignTwilioNumber] = useState("");
  const [assignTwilioSid, setAssignTwilioSid] = useState("");

  // Students
  type StudentRow = { id: string; email: string; platform: string | null; status: string; createdAt: string };
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<"all" | "android" | "ios">("all");

  useEffect(() => {
    setStudentsLoading(true);
    getCompanyStudentPlatforms(companyId)
      .then((res) => {
        if (res.success) {
          setStudents(res.data.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
        }
      })
      .finally(() => setStudentsLoading(false));
  }, [companyId]);

  const filteredStudents = students?.filter((s) =>
    platformFilter === "all" ? true : s.platform === platformFilter
  ) ?? [];

  const voiceFeatureEnabled = Boolean(limits.voiceFeatureEnabled);
  const voiceProvisioningStatus =
    typeof limits.voiceProvisioningStatus === "string"
      ? limits.voiceProvisioningStatus
      : "not_started";
  const voiceLineRef =
    typeof limits.voiceLineRef === "string" ? limits.voiceLineRef : "";
  const [voiceDisplayNumber, setVoiceDisplayNumber] = useState(
    typeof limits.voiceDisplayNumber === "string" ? limits.voiceDisplayNumber : "",
  );

  useEffect(() => {
    if (!voiceDisplayNumber && voiceLineRef) {
      getVoiceLineDisplayNumber(voiceLineRef).then((res) => {
        if (res.success && res.displayNumber) setVoiceDisplayNumber(res.displayNumber);
      });
    }
  }, [voiceDisplayNumber, voiceLineRef]);

  const handleProvision = () => {
    startProvisioning(async () => {
      const res = await provisionAutoscuolaVoiceLine({ companyId });
      if (!res.success) {
        toast.error({ description: ("message" in res ? res.message : null) ?? "Provisioning fallito." });
        return;
      }
      const data = res.data as { lineId: string; phoneNumber: string; displayNumber: string; phoneSid: string };
      toast.success({ description: `Segretaria attivata! Numero: ${data.displayNumber}` });
      setProvisionedNumber(data.displayNumber);
      setLimits((prev) => ({
        ...prev,
        voiceFeatureEnabled: true,
        voiceProvisioningStatus: "ready" as ServiceLimits["voiceProvisioningStatus"],
        voiceLineRef: data.lineId,
      }));
    });
  };

  const handleAssign = () => {
    startAssigning(async () => {
      const res = await assignAutoscuolaVoiceLine({
        companyId,
        displayNumber: assignDisplayNumber.trim(),
        twilioNumber: assignTwilioNumber.trim(),
        twilioPhoneSid: assignRoutingMode === "twilio" ? assignTwilioSid.trim() : undefined,
        routingMode: assignRoutingMode,
      });
      if (!res.success || !res.data) {
        toast.error({ description: (!res.success && res.message) ? res.message : "Assegnazione fallita." });
        return;
      }
      toast.success({ description: "Linea assegnata correttamente." });
      setLimits((prev) => ({
        ...prev,
        voiceFeatureEnabled: true,
        voiceProvisioningStatus: "ready" as ServiceLimits["voiceProvisioningStatus"],
        voiceLineRef: res.data!.lineId,
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
        serviceKey: "AUTOSCUOLE",
        status,
        limits,
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile aggiornare." });
        return;
      }
      toast.success({ description: "Autoscuola aggiornata." });
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Stato servizio ── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50">
              <Car className="h-4 w-4 text-pink-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Servizio Autoscuole</p>
              <p className="text-xs text-muted-foreground">Stato del modulo per questa sede</p>
            </div>
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                <span className="flex items-center gap-1.5">
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Attivo
                </span>
              </SelectItem>
              <SelectItem value="disabled">
                <span className="flex items-center gap-1.5">
                  <CircleX className="h-3.5 w-3.5 text-red-500" />
                  Disattivo
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ── Segretaria vocale AI ── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-50">
            <Phone className="h-4 w-4 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Segretaria Vocale AI</p>
            <p className="text-xs text-muted-foreground">Gestione linea telefonica e voice AI</p>
          </div>
        </div>

        <div className="space-y-4">
          {voiceProvisioningStatus === "ready" ? (
            /* ── Active line ── */
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                  <Phone className="h-3.5 w-3.5 text-emerald-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-700">Linea attiva</p>
                  {voiceDisplayNumber && (
                    <p className="font-mono text-xs text-emerald-700">{voiceDisplayNumber}</p>
                  )}
                  <p className="font-mono text-[10px] text-muted-foreground break-all">{voiceLineRef}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 text-xs"
                onClick={handleUnassign}
                disabled={isUnassigning}
              >
                {isUnassigning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PhoneOff className="h-3 w-3" />
                )}
                {isUnassigning ? "..." : "Scollega"}
              </Button>
            </div>
          ) : (
            /* ── No line: auto-provision + manual fallback ── */
            <div className="space-y-3">
              {/* Auto-provision button */}
              <Button
                className="w-full gap-2"
                onClick={handleProvision}
                disabled={isProvisioning}
              >
                {isProvisioning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                {isProvisioning ? "Acquisto numero in corso..." : "Attiva segretaria"}
              </Button>
              {isProvisioning && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Acquisto numero italiano, configurazione webhook e attivazione...
                </p>
              )}
              {provisionedNumber && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-center">
                  <p className="text-xs text-emerald-700">
                    Numero assegnato: <span className="font-semibold">{provisionedNumber}</span>
                  </p>
                </div>
              )}

              {/* Manual fallback */}
              <button
                type="button"
                onClick={() => setShowManualForm((v) => !v)}
                className="w-full cursor-pointer text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showManualForm ? "Nascondi form manuale" : "Oppure assegna manualmente..."}
              </button>
              {showManualForm && (
                <div className="space-y-3 rounded-xl border border-border bg-gray-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Assegna linea manualmente
                  </p>
                  <div className="flex rounded-lg border border-border bg-white p-0.5 text-xs">
                    {(["sip", "twilio"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAssignRoutingMode(mode)}
                        className={cn(
                          "flex-1 cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors",
                          assignRoutingMode === mode
                            ? "bg-pink-500 text-white shadow-sm"
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
                      placeholder="Twilio Phone SID (PNxxx...)"
                      onChange={(e) => setAssignTwilioSid(e.target.value)}
                    />
                  )}
                  <Button
                    size="sm"
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
                    {isAssigning ? "Assegnazione..." : "Assegna linea"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Allievi invitati ── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <Smartphone className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Allievi invitati</p>
              {students && students.length > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {students.length}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {(["all", "android", "ios"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setPlatformFilter(f)}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  platformFilter === f
                    ? f === "android"
                      ? "bg-green-600 text-white"
                      : f === "ios"
                      ? "bg-blue-600 text-white"
                      : "bg-foreground text-background"
                    : "bg-gray-100 text-muted-foreground hover:bg-gray-200"
                )}
              >
                {f === "all" ? "Tutti" : f === "android" ? "Android" : "iOS"}
              </button>
            ))}
          </div>
        </div>

        {studentsLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Caricamento...
          </div>
        ) : !students || students.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Nessun allievo invitato.</p>
        ) : filteredStudents.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Nessun allievo con questa piattaforma.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-gray-50/80 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Piattaforma</th>
                  <th className="px-3 py-2 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-foreground">{student.email}</td>
                    <td className="px-3 py-2">
                      {student.platform === "ios" ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">iOS</span>
                      ) : student.platform === "android" ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Android</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "text-xs font-medium",
                        student.status === "accepted"
                          ? "text-emerald-600"
                          : student.status === "pending"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      )}>
                        {student.status === "accepted" ? "Attivo" : student.status === "pending" ? "In attesa" : student.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Save ── */}
      <Button onClick={handleSave} disabled={isPending} className="w-full">
        {isPending ? "Salvataggio..." : "Salva modifiche"}
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main page: autoscuole list
   ───────────────────────────────────────────────────────────── */

export default function BackofficeCompaniesPage({
  companies,
}: {
  companies: BackofficeCompanyRow[];
}) {
  const toast = useFeedbackToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<BackofficeCompanyRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localCompanies, setLocalCompanies] = useState(companies);

  const handleDelete = async (company: BackofficeCompanyRow) => {
    if (!window.confirm(`Eliminare definitivamente "${company.name}"?\n\nTutti i dati associati (allievi, istruttori, appuntamenti, pagamenti) verranno cancellati irreversibilmente.`)) return;
    setDeletingId(company.id);
    const res = await deleteCompany(company.id);
    setDeletingId(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Errore durante l'eliminazione." });
      return;
    }
    toast.success({ description: `"${company.name}" eliminata.` });
    setLocalCompanies((prev) => prev.filter((c) => c.id !== company.id));
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return localCompanies;
    return localCompanies.filter((company) =>
      company.name.toLowerCase().includes(term),
    );
  }, [localCompanies, query]);

  const totalStudents = localCompanies.reduce((sum, c) => sum + c.androidStudents + c.iosStudents, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-8 lg:px-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground">Autoscuole</h1>
            <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-semibold text-pink-700">
              {localCompanies.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Gestisci le autoscuole registrate su Reglo, i servizi attivi e le linee vocali.
          </p>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50">
              <GraduationCap className="h-5 w-5 text-pink-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{localCompanies.length}</p>
              <p className="text-xs text-muted-foreground">Autoscuole</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-50">
              <Smartphone className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{totalStudents}</p>
              <p className="text-xs text-muted-foreground">Allievi su app</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <Phone className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {localCompanies.filter((c) =>
                  c.services.some((s) => s.limits?.voiceProvisioningStatus === "ready")
                ).length}
              </p>
              <p className="text-xs text-muted-foreground">Linee vocali attive</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca autoscuola..."
            className="pl-9"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-border bg-white shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Autoscuola</TableHead>
              <TableHead>Registrata il</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Allievi</TableHead>
              <TableHead>Voce AI</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((company) => {
                const autoscuoleService = company.services.find((s) => s.key === "AUTOSCUOLE");
                const isActive = autoscuoleService?.status === "active";
                const hasVoice = autoscuoleService?.limits?.voiceProvisioningStatus === "ready";
                const studentCount = company.androidStudents + company.iosStudents;

                return (
                  <TableRow key={company.id} className="cursor-pointer hover:bg-gray-50/50" onClick={() => { setSelected(company); setDrawerOpen(true); }}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-xs font-bold text-pink-600">
                          {company.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{company.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(company.createdAt).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Attivo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Disattivo
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {studentCount > 0 ? (
                        <div className="flex items-center gap-1.5">
                          {company.androidStudents > 0 && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                              {company.androidStudents} And
                            </span>
                          )}
                          {company.iosStudents > 0 && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              {company.iosStudents} iOS
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasVoice ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
                          <Phone className="h-3 w-3" />
                          Attiva
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleDelete(company)}
                          disabled={deletingId === company.id}
                        >
                          {deletingId === company.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  Nessuna autoscuola trovata.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Drawer ── */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
        <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,600px)] data-[vaul-drawer-direction=right]:sm:max-w-xl h-full">
          <DrawerHeader className="border-b border-border bg-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-sm font-bold text-pink-600">
                {(selected?.name ?? "A").charAt(0).toUpperCase()}
              </div>
              <div>
                <DrawerTitle>{selected?.name ?? "Autoscuola"}</DrawerTitle>
                <DrawerDescription>Gestisci servizi e configurazione</DrawerDescription>
              </div>
            </div>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
            {selected && (
              <AutoscuolaDrawerContent
                key={selected.id}
                companyId={selected.id}
                service={selected.services.find((s) => s.key === "AUTOSCUOLE")}
              />
            )}
          </div>
          <DrawerFooter className="border-t border-border bg-white">
            <DrawerClose asChild>
              <Button variant="outline">Chiudi</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
