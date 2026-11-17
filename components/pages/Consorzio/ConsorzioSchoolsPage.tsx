"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronRight, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingDots } from "@/components/ui/loading-dots";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createConsorzioSchool,
  listConsorzioSchools,
  type ConsorzioSchoolListItem,
  type ConsorzioSchoolStudentRef,
} from "@/lib/actions/consorzio.actions";
import { useStudentNameOrder } from "@/components/pages/Autoscuole/student-name-order-context";
import { formatStoredName, storedNameInitials } from "@/lib/autoscuole/student-name-order";
import { searchStudents } from "@/lib/consorzio/student-search";

/**
 * Sezione "Autoscuole" del consorzio (?tab=scuole): tabella delle autoscuole
 * consorziate (dal prototipo di Gabriele: nome+città, titolare, allievi,
 * ultima guida, mezzo più usato, stato) + ricerca + "Aggiungi autoscuola".
 * Vedi docs/features/consorzio.md.
 */

const formatShortDate = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Rome",
  });
};

const initialsOf = (name: string): string =>
  name
    .replace(/^Autoscuola\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Cosa dice la colonna "Stato" di un'autoscuola consorziata.
 *
 * Prima mostrava `ConsorzioSchool.status`, che è `active` per tutte: segnava
 * "Attiva" anche a chi Reglo non ce l'ha, quindi non diceva niente. Ora dice
 * la cosa che al consorzio interessa davvero — **se quella scuola ha Reglo
 * acceso** — e tiene la sospensione, che è l'unico stato dell'anagrafica che
 * qualcuno imposta sul serio (dal dettaglio scuola) e che altrimenti
 * sparirebbe dalla lista.
 *
 * "Reglo attivo" ≠ "Accede" della colonna accanto: quella dice se il titolare
 * riesce a entrare, questa se il servizio è comprato. Si può essere l'uno
 * senza l'altro, ed è il motivo per cui restano due colonne.
 */
const schoolStateBadge = (
  status: string,
  regloActive: boolean | undefined,
): { label: string; className: string } => {
  if (status === "suspended") {
    return { label: "Sospesa", className: "bg-amber-50 text-amber-700" };
  }
  if (regloActive === undefined) {
    // Lo stato di accesso non è ancora arrivato: meglio niente che una bugia.
    return { label: "—", className: "bg-transparent text-[#b0b0b0]" };
  }
  return regloActive
    ? { label: "Reglo attivo", className: "bg-[#e4f4e7] text-[#1f6b2a]" }
    : { label: "Reglo non attivo", className: "bg-[#f2f2f2] text-[#6a6a6a]" };
};

const emptySchoolForm = {
  name: "",
  city: "",
  ownerName: "",
  address: "",
  vatNumber: "",
  phone: "",
  email: "",
  accountingCode: "",
};


/** Skeleton della griglia autoscuole (stesso pattern di StudentListSkeleton). */
function SchoolListSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_128px] gap-x-4 border-b border-[#ebebeb] px-4 pb-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16 max-w-full rounded" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_128px] items-center gap-x-4 border-b border-[#f2f2f2] px-4 py-3.5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36 max-w-full rounded" />
              <Skeleton className="h-3 w-24 max-w-full rounded" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-28 max-w-full rounded" />
          <div className="flex justify-end">
            <Skeleton className="h-3.5 w-5 rounded" />
          </div>
          <Skeleton className="h-3.5 w-14 rounded" />
          <Skeleton className="h-3.5 w-28 max-w-full rounded" />
          <Skeleton className="h-[22px] w-[53px] rounded-full" />
        </div>
      ))}
    </div>
  );
}

import { SegmentedPill } from "@/components/ui/segmented-pill";
import {
  listConsorzioSchoolsAccess,
  type AffiliateSchoolRow,
} from "@/lib/actions/consorzio-affiliate.actions";
import { affiliateInviteTargets } from "@/lib/consorzio/affiliate-invite-targets";
import { AffiliateBulkInviteDialog } from "@/components/pages/Backoffice/AffiliateBulkInviteDialog";
import { AccessBadge, matchesAccessFilter, type AccessFilter } from "./school-access";

/** Quanti allievi mostra la ricerca prima di "Mostra tutti". */
const STUDENT_RESULTS_CAP = 6;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * REG-756 — ricerca inversa: dal nome dell'allievo alla sua autoscuola.
 * Compare sopra la tabella solo quando la ricerca trova allievi; il clic apre
 * la scheda dell'autoscuola con il dettaglio dell'allievo già aperto.
 */
function StudentSearchResults({
  results,
  schoolsById,
  onOpen,
}: {
  results: ConsorzioSchoolStudentRef[];
  schoolsById: Map<string, ConsorzioSchoolListItem>;
  onOpen: (student: ConsorzioSchoolStudentRef) => void;
}) {
  const nameOrder = useStudentNameOrder();
  const [expanded, setExpanded] = React.useState(false);
  // Una ricerca nuova riparte compatta.
  React.useEffect(() => setExpanded(false), [results]);
  const shown = expanded ? results : results.slice(0, STUDENT_RESULTS_CAP);
  const hidden = results.length - shown.length;

  return (
    <motion.section
      key="student-results"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT }}
      className="overflow-hidden"
      aria-label="Allievi trovati"
    >
      <div className="pb-6">
        <div className="flex items-baseline justify-between border-b border-[#ebebeb] px-4 pb-2.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292]">
            Allievi
          </div>
          <div className="text-[12px] font-medium text-[#929292]">
            {results.length === 1 ? "1 trovato" : `${results.length} trovati`}
          </div>
        </div>
        <ul>
          <AnimatePresence initial={false}>
            {shown.map((student, index) => {
              const school = schoolsById.get(student.schoolId);
              return (
                <motion.li
                  key={student.userId}
                  layout="position"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT, delay: Math.min(index, 6) * 0.025 }}
                  className="border-b border-[#f2f2f2] py-1"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(student)}
                    data-testid="consorzio-student-result"
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#111111] text-[11.5px] font-bold text-white">
                      {storedNameInitials(student.name, nameOrder)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
                      <span className="truncate text-[14px] font-semibold text-[#222222]">
                        {formatStoredName(student.name, nameOrder)}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <ArrowRight
                          aria-hidden
                          className="h-3.5 w-3.5 shrink-0 text-[#b0b0b0] transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                        />
                        <span className="truncate text-[13.5px] font-medium text-[#444444]">
                          {school?.name ?? "Autoscuola"}
                        </span>
                        {school?.city ? (
                          <span className="hidden truncate text-[12.5px] font-medium text-[#a0a0a0] sm:inline">
                            {school.city}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <ChevronRight
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-[#c4c4c4] transition-all duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-[#222222]"
                    />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 cursor-pointer px-4 py-1.5 text-[13px] font-semibold text-[#222222] underline decoration-[#d0d0d0] underline-offset-4 transition-colors duration-200 hover:decoration-[#222222]"
          >
            Mostra tutti ({results.length})
          </button>
        )}
      </div>
    </motion.section>
  );
}

export function ConsorzioSchoolsPage() {
  const router = useRouter();
  const locale = useLocale();
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [schools, setSchools] = React.useState<ConsorzioSchoolListItem[]>([]);
  const [totalStudents, setTotalStudents] = React.useState(0);
  const [students, setStudents] = React.useState<ConsorzioSchoolStudentRef[]>([]);
  const [search, setSearch] = React.useState("");

  const [access, setAccess] = React.useState<Map<string, AffiliateSchoolRow>>(new Map());
  const [accessFilter, setAccessFilter] = React.useState<AccessFilter>("all");
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState(emptySchoolForm);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    // Le due letture viaggiano insieme: la seconda porta lo stato di accesso
    // del titolare (REG-454), che vive sul collegamento e non sull'anagrafica.
    const [res, accessRes] = await Promise.all([
      listConsorzioSchools(),
      listConsorzioSchoolsAccess(),
    ]);
    if (res.success) {
      setSchools(res.data.schools);
      setTotalStudents(res.data.totalStudents);
      setStudents(res.data.students);
    } else {
      toast.error({ description: res.message });
    }
    if (accessRes.success) {
      setAccess(new Map(accessRes.data.map((row) => [row.schoolId, row])));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return schools;
    return schools.filter((school) =>
      [school.name, school.city, school.ownerName, school.accountingCode]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(query)),
    );
  }, [schools, search]);

  const visible = React.useMemo(
    () =>
      filtered.filter((school) =>
        matchesAccessFilter(accessFilter, access.get(school.id)?.access),
      ),
    [filtered, accessFilter, access],
  );

  const schoolsById = React.useMemo(
    () => new Map(schools.map((school) => [school.id, school])),
    [schools],
  );

  // REG-756: gli allievi che la ricerca trova, rispettando il filtro di
  // accesso (se guardo solo "Accedono", non mi propone allievi delle altre).
  const studentResults = React.useMemo(
    () =>
      searchStudents(students, search).filter((student) =>
        matchesAccessFilter(accessFilter, access.get(student.schoolId)?.access),
      ),
    [students, search, accessFilter, access],
  );

  const openStudent = (student: ConsorzioSchoolStudentRef) =>
    router.push(
      `/${locale}/user/autoscuole/scuole/${student.schoolId}?allievo=${encodeURIComponent(student.userId)}`,
    );

  const accessCounts = React.useMemo(() => {
    let active = 0;
    let pending = 0;
    for (const school of schools) {
      if (access.get(school.id)?.access === "active") active += 1;
      else pending += 1;
    }
    return { all: schools.length, active, pending };
  }, [schools, access]);

  /**
   * Quanti titolari il pulsante riesce davvero a invitare — che NON è
   * `accessCounts.pending`: quello conta le *sedi* che non accedono (comprese
   * le già invitate), e il pulsante agisce sui *titolari* da invitare, uno per
   * email. Contandoli a modo suo diceva "37" e apriva un modale da "0".
   * La regola sta dove la legge anche il server: non possono più divergere.
   */
  const invitableOwners = React.useMemo(
    () => affiliateInviteTargets(Array.from(access.values())).groups.length,
    [access],
  );


  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const res = await createConsorzioSchool(addForm);
    setSaving(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Autoscuola aggiunta al consorzio." });
    setAddOpen(false);
    setAddForm(emptySchoolForm);
    void load();
    router.push(`/${locale}/user/autoscuole/scuole/${res.data.schoolId}`);
  };

  return (
    <div className="mx-auto w-full max-w-[1184px] pt-3 [line-height:normal]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-10 tracking-[-0.3px] text-[#222222]">
            Autoscuole
          </h1>
          <p className="mt-[6px] text-[14px] font-medium text-[#6a6a6a]">
            {totalStudents} allievi in guida superiore nelle autoscuole associate
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <div className="flex h-10 w-full items-center sm:w-[320px] gap-2 rounded-[50px] border border-[#e2e2e2] bg-white px-3.5">
            <Search className="h-[15px] w-[15px] shrink-0 text-[#a0a0a0]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca autoscuola, titolare, codice o allievo"
              aria-label="Cerca autoscuola, titolare, codice o allievo"
              className="w-full border-0 bg-transparent p-0 text-[15px] font-medium text-[#222222] outline-none placeholder:text-[#a0a0a0]"
            />
          </div>
          {invitableOwners > 0 && (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-[#dddddd] bg-white px-[16px] py-[10px] text-sm font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7]"
            >
              Invita i titolari non invitati · {invitableOwners}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-[#111111] px-[18px] py-[11px] text-sm font-semibold text-white transition-colors hover:bg-[#000000]"
          >
            <Plus className="h-4 w-4" />
            Aggiungi autoscuola
          </button>
        </div>
      </div>

      {!loading && schools.length > 0 && (
        <div className="mt-5">
          <SegmentedPill
            value={accessFilter}
            onChange={setAccessFilter}
            options={[
              { value: "all", label: "Tutte", count: accessCounts.all },
              { value: "active", label: "Accedono", count: accessCounts.active },
              { value: "pending", label: "Da invitare", count: accessCounts.pending },
            ]}
          />
        </div>
      )}

      <div className="mt-[22px]">
        <AnimatePresence initial={false}>
          {!loading && studentResults.length > 0 && (
            <StudentSearchResults
              key="student-results"
              results={studentResults}
              schoolsById={schoolsById}
              onOpen={openStudent}
            />
          )}
        </AnimatePresence>
        {loading ? (
          <SchoolListSkeleton />
        ) : visible.length === 0 && studentResults.length > 0 ? null : visible.length === 0 ? (
          <FadeIn>
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
            {schools.length === 0
              ? "Nessuna autoscuola consorziata ancora. Aggiungi la prima."
              : "Nessuna autoscuola o allievo corrisponde alla ricerca."}
          </div>
          </FadeIn>
        ) : (
          <FadeIn>
          <div>
            {/* Griglia del prototipo: 1.6fr 1fr 70px 140px 1fr 92px, gap 28 */}
            <div className="grid grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_128px] gap-x-4 border-b border-[#ebebeb] px-4 pb-2.5">
              {["Autoscuola", "Titolare", "Codice", "Accesso", "Allievi", "Ultima guida", "Mezzo più usato", "Stato"].map(
                (header, index) => (
                  <div
                    key={header}
                    className={`text-[11px] font-bold uppercase tracking-[0.7px] text-[#929292] ${index === 4 ? "text-right" : ""}`}
                  >
                    {header}
                  </div>
                ),
              )}
            </div>
            {visible.map((school) => {
              const badge = schoolStateBadge(school.status, access.get(school.id)?.regloActive);
              return (
                <div
                  key={school.id}
                  onClick={() => router.push(`/${locale}/user/autoscuole/scuole/${school.id}`)}
                  className="grid cursor-pointer grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_128px] items-center gap-x-4 rounded-[10px] border-b border-[#f2f2f2] px-4 py-3.5 transition-colors hover:bg-[#fafafa]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6e6e6] bg-white text-[12px] font-bold text-[#444444]">
                      {initialsOf(school.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-[#222222]">
                        {school.name}
                      </div>
                      <div className="mt-px truncate text-[12px] font-medium text-[#929292]">
                        {school.city ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="truncate text-[13.5px] font-medium text-[#444444]">
                    {school.ownerName ?? "—"}
                  </div>
                  <div className="min-w-0">
                    {school.accountingCode ? (
                      <span
                        className="inline-flex max-w-full truncate px-2 py-[3px] text-[11.5px] font-bold"
                        style={{ background: "#F0F0F0", color: "#111111", borderRadius: 6 }}
                      >
                        {school.accountingCode}
                      </span>
                    ) : (
                      <span className="text-[13px] font-medium text-[#b0b0b0]">—</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <AccessBadge status={access.get(school.id)?.access ?? "not_linked"} />
                  </div>
                  <div className="text-right text-[14px] font-semibold text-[#222222]">
                    {school.studentsCount}
                  </div>
                  <div className="whitespace-nowrap text-[13px] font-medium text-[#6a6a6a]">
                    {formatShortDate(school.lastLessonAt)}
                  </div>
                  <div className="truncate text-[13px] font-medium text-[#6a6a6a]">
                    {school.topVehicleName ?? "—"}
                  </div>
                  <div>
                    <span
                      className={`inline-flex whitespace-nowrap rounded-[999px] px-2.5 py-1 text-[11.5px] font-bold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          </FadeIn>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi autoscuola</DialogTitle>
            <DialogDescription>
              Registra un&apos;autoscuola consorziata (anagrafica gestita dal consorzio).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="school-name">Nome</Label>
              <Input
                id="school-name"
                placeholder="Autoscuola Rossi"
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="school-city">Città</Label>
                <Input
                  id="school-city"
                  placeholder="Genova"
                  value={addForm.city}
                  onChange={(e) => setAddForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school-owner">Titolare</Label>
                <Input
                  id="school-owner"
                  placeholder="Mario Rossi"
                  value={addForm.ownerName}
                  onChange={(e) => setAddForm((p) => ({ ...p, ownerName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-address">Sede</Label>
              <Input
                id="school-address"
                placeholder="Via Roma 1, Genova"
                value={addForm.address}
                onChange={(e) => setAddForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="school-vat">Partita IVA</Label>
                <Input
                  id="school-vat"
                  placeholder="01234567890"
                  value={addForm.vatNumber}
                  onChange={(e) => setAddForm((p) => ({ ...p, vatNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school-phone">Telefono</Label>
                <Input
                  id="school-phone"
                  placeholder="010 000 0000"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="school-email">Email</Label>
                <Input
                  id="school-email"
                  type="email"
                  placeholder="info@autoscuola.it"
                  value={addForm.email}
                  onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school-code">Codice contabile</Label>
                <Input
                  id="school-code"
                  placeholder="AS-ROSSI"
                  value={addForm.accountingCode}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, accountingCode: e.target.value.toUpperCase() }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? <LoadingDots /> : "Aggiungi al consorzio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {bulkOpen && (
        <AffiliateBulkInviteDialog
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
