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
};

export function ConsorzioSchoolsPage() {
  const router = useRouter();
  const locale = useLocale();
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [schools, setSchools] = React.useState<ConsorzioSchoolListItem[]>([]);
  const [totalStudents, setTotalStudents] = React.useState(0);
  const [search, setSearch] = React.useState("");

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState(emptySchoolForm);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await listConsorzioSchools();
    if (res.success) {
      setSchools(res.data.schools);
      setTotalStudents(res.data.totalStudents);
    } else {
      toast.error({ description: res.message });
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
      [school.name, school.city, school.ownerName]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(query)),
    );
  }, [schools, search]);

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
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.3px] text-foreground">
            Autoscuole
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {totalStudents} allievi in guida superiore nelle autoscuole associate
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca autoscuola, titolare o città"
              className="h-10 w-[300px] rounded-full border-[#e2e2e2] bg-white pl-10 text-[15px] font-medium"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-[#1a1a2e] px-[18px] py-[11px] text-sm font-semibold text-white transition-colors hover:bg-[#12122a]"
          >
            <Plus className="h-4 w-4" />
            Aggiungi autoscuola
          </button>
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-white/40" />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
            {schools.length === 0
              ? "Nessuna autoscuola consorziata ancora. Aggiungi la prima."
              : "Nessuna autoscuola corrisponde alla ricerca."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/70">
                  {["Autoscuola", "Titolare", "Allievi", "Ultima guida", "Mezzo più usato", "Stato"].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:pl-1"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((school) => {
                  const badge = STATUS_BADGE[school.status] ?? STATUS_BADGE.active;
                  return (
                    <tr
                      key={school.id}
                      onClick={() =>
                        router.push(`/${locale}/user/autoscuole/scuole/${school.id}`)
                      }
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3.5 first:pl-1">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4e4e5c] text-[12px] font-bold text-white">
                            {initialsOf(school.name)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {school.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {school.city ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground">
                        {school.ownerName ?? "—"}
                      </td>
                      <td className="px-3 py-3.5 text-sm font-semibold text-foreground">
                        {school.studentsCount}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground">
                        {formatShortDate(school.lastLessonAt)}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground">
                        {school.topVehicleName ?? "—"}
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
            <DialogFooter>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? <LoadingDots /> : "Aggiungi al consorzio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
