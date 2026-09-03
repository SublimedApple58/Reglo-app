"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ChevronLeft, Plus } from "lucide-react";

import { AdminUsersCreateDialog } from "@/components/pages/AdminUsers/AdminUsersCreateDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  getConsorzioSchool,
  listConsorzioAccountingCodes,
  setConsorzioMemberAccountingCodes,
  setConsorzioSchoolStatus,
  updateConsorzioSchool,
  type ConsorzioSchoolStudent,
} from "@/lib/actions/consorzio.actions";

/**
 * Dettaglio autoscuola consorziata (dal prototipo): anagrafica con Modifica,
 * stat card (allievi attivi / guide col consorzio / ore certificate / da
 * certificare), azioni Sospendi · Rimuovi dal consorzio, tabella Allievi con
 * codici contabili + "Aggiungi allievo". Vedi docs/features/consorzio.md.
 */

type SchoolData = {
  id: string;
  name: string;
  city: string | null;
  ownerName: string | null;
  address: string | null;
  vatNumber: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  joinedAt: string | null;
};

type Stats = {
  activeStudents: number;
  lessonsCount: number;
  certifiedMinutes: number;
  toCertifyMinutes: number;
};

const formatJoinedAt = (iso: string | null): string | null => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("it-IT", {
    month: "short",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
};

const formatShortDate = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Rome",
  });
};

const formatHours = (minutes: number): string => {
  if (minutes === 0) return "0";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace(".", ",")}h`;
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

export function ConsorzioSchoolDetailPage({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [school, setSchool] = React.useState<SchoolData | null>(null);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [students, setStudents] = React.useState<ConsorzioSchoolStudent[]>([]);
  const [codes, setCodes] = React.useState<Array<{ id: string; code: string }>>([]);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    name: "",
    city: "",
    ownerName: "",
    address: "",
    vatNumber: "",
    phone: "",
    email: "",
  });
  const [saving, setSaving] = React.useState(false);

  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [addStudentOpen, setAddStudentOpen] = React.useState(false);

  // Editing codici contabili di un allievo esistente.
  const [codesFor, setCodesFor] = React.useState<ConsorzioSchoolStudent | null>(null);
  const [codesDraft, setCodesDraft] = React.useState<string[]>([]);
  const [codesSaving, setCodesSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const [schoolRes, codesRes] = await Promise.all([
      getConsorzioSchool(schoolId),
      listConsorzioAccountingCodes(),
    ]);
    if (schoolRes.success) {
      setSchool(schoolRes.data.school);
      setStats(schoolRes.data.stats);
      setStudents(schoolRes.data.students);
    } else {
      toast.error({ description: schoolRes.message });
    }
    if (codesRes.success) setCodes(codesRes.data.codes);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!school) return;
    setEditForm({
      name: school.name,
      city: school.city ?? "",
      ownerName: school.ownerName ?? "",
      address: school.address ?? "",
      vatNumber: school.vatNumber ?? "",
      phone: school.phone ?? "",
      email: school.email ?? "",
    });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const res = await updateConsorzioSchool({ schoolId, ...editForm });
    setSaving(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Anagrafica aggiornata." });
    setEditOpen(false);
    void load();
  };

  const handleStatus = async (status: "active" | "suspended" | "removed") => {
    const res = await setConsorzioSchoolStatus({ schoolId, status });
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    if (status === "removed") {
      toast.success({ description: "Autoscuola rimossa dal consorzio." });
      router.push(`/${locale}/user/autoscuole?tab=scuole`);
      return;
    }
    toast.success({
      description: status === "suspended" ? "Autoscuola sospesa." : "Autoscuola riattivata.",
    });
    void load();
  };

  const openCodesFor = (student: ConsorzioSchoolStudent) => {
    setCodesFor(student);
    setCodesDraft(student.codes.map((code) => code.id));
  };

  const handleSaveCodes = async () => {
    if (!codesFor) return;
    setCodesSaving(true);
    const res = await setConsorzioMemberAccountingCodes({
      userId: codesFor.userId,
      codeIds: codesDraft,
    });
    setCodesSaving(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Codici aggiornati." });
    setCodesFor(null);
    void load();
  };

  if (loading) {
    return <div className="h-64 w-full animate-pulse rounded-3xl bg-white/40" />;
  }
  if (!school) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
        Autoscuola non trovata.
      </div>
    );
  }

  const joined = formatJoinedAt(school.joinedAt);
  const suspended = school.status === "suspended";

  const statCards = [
    { value: String(stats?.activeStudents ?? 0), label: "allievi attivi", className: "text-foreground" },
    { value: String(stats?.lessonsCount ?? 0), label: "guide col consorzio", className: "text-foreground" },
    { value: formatHours(stats?.certifiedMinutes ?? 0), label: "ore certificate", className: "text-emerald-600" },
    { value: formatHours(stats?.toCertifyMinutes ?? 0), label: "da certificare", className: "text-amber-500" },
  ];

  return (
    <div className="w-full">
      <Link
        href={`/${locale}/user/autoscuole?tab=scuole`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Tutte le autoscuole
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-sm font-bold text-white">
            {initialsOf(school.name.replace(/^Autoscuola\s+/i, ""))}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
                {school.name}
              </h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  suspended ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {suspended ? "Sospesa" : "Attiva"}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">
              {[school.city, joined ? `nel consorzio da ${joined}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 pt-2">
          <button
            type="button"
            onClick={() => void handleStatus(suspended ? "active" : "suspended")}
            className="cursor-pointer text-sm font-semibold text-foreground underline underline-offset-4 hover:opacity-70"
          >
            {suspended ? "Riattiva" : "Sospendi"}
          </button>
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            className="cursor-pointer text-sm font-semibold text-[#c13515] underline underline-offset-4 hover:opacity-70"
          >
            Rimuovi dal consorzio
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Dati anagrafici */}
        <div className="rounded-3xl border border-border/70 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Dati anagrafici
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="cursor-pointer text-sm font-semibold text-foreground underline underline-offset-4 hover:opacity-70"
            >
              Modifica
            </button>
          </div>
          <dl className="mt-3">
            {[
              ["Titolare", school.ownerName],
              ["Sede", school.address],
              ["Partita IVA", school.vatNumber],
              ["Telefono", school.phone],
              ["Email", school.email],
              ["Nel consorzio da", joined],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="flex items-center justify-between gap-4 border-b border-border/50 py-3 last:border-b-0"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold text-foreground">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 content-start gap-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-border/70 bg-white p-5"
            >
              <div className={`text-[28px] font-semibold tracking-tight ${card.className}`}>
                {card.value}
              </div>
              <div className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                {card.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allievi */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Allievi <span className="text-muted-foreground">· {students.length}</span>
          </h2>
          <Button
            variant="outline"
            onClick={() => setAddStudentOpen(true)}
            className="rounded-full"
          >
            <Plus className="h-4 w-4" />
            Aggiungi allievo
          </Button>
        </div>

        {students.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-10 text-center text-sm font-medium text-neutral-500">
            Nessun allievo per questa autoscuola.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/70">
                  {["Allievo", "Patente", "Istruttore", "Ultima guida", "Guide", "Codici contabili"].map(
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
                {students.map((student) => (
                  <tr key={student.userId} className="border-b border-border/50">
                    <td className="px-3 py-4 first:pl-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                          {initialsOf(student.name)}
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {student.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      {student.licenseCategory ? (
                        <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                          {student.licenseCategory}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-4 text-sm text-foreground">
                      {student.instructorName ?? "—"}
                    </td>
                    <td className="px-3 py-4 text-sm text-foreground">
                      {formatShortDate(student.lastLessonAt)}
                    </td>
                    <td className="px-3 py-4 text-sm font-semibold text-foreground">
                      {student.lessonsCount}
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => openCodesFor(student)}
                        className="flex cursor-pointer flex-wrap items-center gap-1.5"
                        title="Modifica codici contabili"
                      >
                        {student.codes.length === 0 ? (
                          <span className="text-xs font-medium text-muted-foreground underline underline-offset-4">
                            Aggiungi
                          </span>
                        ) : (
                          student.codes.map((code) => (
                            <span
                              key={code.id}
                              className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
                            >
                              {code.code}
                            </span>
                          ))
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog modifica anagrafica */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica anagrafica</DialogTitle>
            <DialogDescription>{school.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-city">Città</Label>
                <Input
                  id="edit-city"
                  value={editForm.city}
                  onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-owner">Titolare</Label>
                <Input
                  id="edit-owner"
                  value={editForm.ownerName}
                  onChange={(e) => setEditForm((p) => ({ ...p, ownerName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Sede</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-vat">Partita IVA</Label>
                <Input
                  id="edit-vat"
                  value={editForm.vatNumber}
                  onChange={(e) => setEditForm((p) => ({ ...p, vatNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefono</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? <LoadingDots /> : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conferma rimozione */}
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere {school.name} dal consorzio?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;autoscuola sparisce dalla lista ma le guide già fatte restano in
              Fatturazione. Gli allievi non vengono eliminati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleStatus("removed")}
              className="bg-[#c13515] hover:bg-[#a12a10]"
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aggiungi allievo (dialog condiviso Directory, in modalità consorzio) */}
      <AdminUsersCreateDialog
        open={addStudentOpen}
        onOpenChange={setAddStudentOpen}
        fixedAutoscuolaRole="STUDENT"
        title="Aggiungi allievo"
        description={`Nuovo allievo di ${school.name}.`}
        consorzioSchoolId={schoolId}
        accountingCodes={codes}
        defaultLicenseCategory="C"
        onCreated={() => void load()}
      />

      {/* Dialog codici contabili allievo */}
      <Dialog open={codesFor !== null} onOpenChange={(open) => !open && setCodesFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Codici contabili</DialogTitle>
            <DialogDescription>{codesFor?.name}</DialogDescription>
          </DialogHeader>
          {codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun codice definito. I codici si creano dalla sezione Fatturazione.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {codes.map((code) => {
                const active = codesDraft.includes(code.id);
                return (
                  <button
                    key={code.id}
                    type="button"
                    onClick={() =>
                      setCodesDraft((prev) =>
                        active ? prev.filter((id) => id !== code.id) : [...prev, code.id],
                      )
                    }
                    className={
                      active
                        ? "cursor-pointer rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-white"
                        : "cursor-pointer rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                    }
                  >
                    {code.code}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => void handleSaveCodes()}
              disabled={codesSaving || codes.length === 0}
              className="w-full sm:w-auto"
            >
              {codesSaving ? <LoadingDots /> : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
