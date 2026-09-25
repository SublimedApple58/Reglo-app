"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Plus, Search } from "lucide-react";

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
} from "@/lib/actions/consorzio.actions";

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

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Attiva", className: "bg-[#e4f4e7] text-[#1f6b2a]" },
  suspended: { label: "Sospesa", className: "bg-amber-50 text-amber-700" },
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
      <div className="grid grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_92px] gap-x-4 border-b border-[#ebebeb] px-4 pb-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16 max-w-full rounded" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_92px] items-center gap-x-4 border-b border-[#f2f2f2] px-4 py-3.5"
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
import { AffiliateBulkInviteDialog } from "@/components/pages/Backoffice/AffiliateBulkInviteDialog";
import { AccessBadge, matchesAccessFilter, type AccessFilter } from "./school-access";

export function ConsorzioSchoolsPage() {
  const router = useRouter();
  const locale = useLocale();
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [schools, setSchools] = React.useState<ConsorzioSchoolListItem[]>([]);
  const [totalStudents, setTotalStudents] = React.useState(0);
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

  const accessCounts = React.useMemo(() => {
    let active = 0;
    let pending = 0;
    for (const school of schools) {
      if (access.get(school.id)?.access === "active") active += 1;
      else pending += 1;
    }
    return { all: schools.length, active, pending };
  }, [schools, access]);


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
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-[300px] items-center gap-2 rounded-[50px] border border-[#e2e2e2] bg-white px-3.5">
            <Search className="h-[15px] w-[15px] shrink-0 text-[#a0a0a0]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca autoscuola, titolare o codice"
              className="w-full border-0 bg-transparent p-0 text-[15px] font-medium text-[#222222] outline-none placeholder:text-[#a0a0a0]"
            />
          </div>
          {accessCounts.pending > 0 && (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-[#dddddd] bg-white px-[16px] py-[10px] text-sm font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7]"
            >
              Invita i titolari non invitati · {accessCounts.pending}
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
        {loading ? (
          <SchoolListSkeleton />
        ) : visible.length === 0 ? (
          <FadeIn>
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
            {schools.length === 0
              ? "Nessuna autoscuola consorziata ancora. Aggiungi la prima."
              : "Nessuna autoscuola corrisponde alla ricerca."}
          </div>
          </FadeIn>
        ) : (
          <FadeIn>
          <div>
            {/* Griglia del prototipo: 1.6fr 1fr 70px 140px 1fr 92px, gap 28 */}
            <div className="grid grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_92px] gap-x-4 border-b border-[#ebebeb] px-4 pb-2.5">
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
              const badge = STATUS_BADGE[school.status] ?? STATUS_BADGE.active;
              return (
                <div
                  key={school.id}
                  onClick={() => router.push(`/${locale}/user/autoscuole/scuole/${school.id}`)}
                  className="grid cursor-pointer grid-cols-[1.6fr_1fr_96px_118px_70px_120px_1fr_92px] items-center gap-x-4 rounded-[10px] border-b border-[#f2f2f2] px-4 py-3.5 transition-colors hover:bg-[#fafafa]"
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
                      className={`inline-flex rounded-[999px] px-2.5 py-1 text-[11.5px] font-bold ${badge.className}`}
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
