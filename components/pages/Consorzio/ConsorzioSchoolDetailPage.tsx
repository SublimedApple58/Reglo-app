"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ChevronLeft, Plus } from "lucide-react";

import { AdminUsersCreateDialog } from "@/components/pages/AdminUsers/AdminUsersCreateDialog";
import { ConsorzioStudentDrawer } from "@/components/pages/Consorzio/ConsorzioStudentDrawer";
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
  setConsorzioSchoolStatus,
  updateConsorzioSchool,
  type ConsorzioSchoolStudent,
} from "@/lib/actions/consorzio.actions";

/**
 * Dettaglio autoscuola consorziata — riproduzione 1:1 del prototipo
 * Consorzi.html (computed styles estratti): header con avatar 56, nome 28/700
 * −0.4 + badge pill, azioni Sospendi/Rimuovi sottolineate; card DATI ANAGRAFICI
 * 16px radius bordo #EBEBEB con righe label 13/valore 14; stat card 14px radius
 * con numeri 26/700 −0.6 (verde #1F6B2A, ambra); tabella Allievi con righe h61,
 * avatar 32 navy, badge patente pill azzurra #EEF4FF/#2A6FDB, chip codici
 * #EEF0F6/#1A1A2E. Vedi docs/features/consorzio.md.
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

  // Drawer laterale dettaglio allievo (click sulla riga, come nel prototipo).
  const [drawerUserId, setDrawerUserId] = React.useState<string | null>(null);

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
    { value: String(stats?.activeStudents ?? 0), label: "allievi attivi", color: "#222222" },
    { value: String(stats?.lessonsCount ?? 0), label: "guide col consorzio", color: "#222222" },
    { value: formatHours(stats?.certifiedMinutes ?? 0), label: "ore certificate", color: "#1F6B2A" },
    { value: formatHours(stats?.toCertifyMinutes ?? 0), label: "da certificare", color: "#D97706" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1184px] pt-3 [line-height:normal]">
      <Link
        href={`/${locale}/user/autoscuole?tab=scuole`}
        className="inline-flex items-center gap-1 text-[13.5px] font-medium text-[#929292] transition-colors hover:text-[#222222]"
      >
        <ChevronLeft className="h-4 w-4" />
        Tutte le autoscuole
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#e6e6e6] bg-white text-[15px] font-bold text-[#444444]">
            {initialsOf(school.name.replace(/^Autoscuola\s+/i, ""))}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-[-0.4px] text-[#222222]">
                {school.name}
              </h1>
              <span
                className="inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                style={
                  suspended
                    ? { background: "#FCEFC7", color: "#8A6D1A" }
                    : { background: "#E4F4E7", color: "#1F6B2A" }
                }
              >
                {suspended ? "Sospesa" : "Attiva"}
              </span>
            </div>
            <p className="mt-[6px] text-[14px] font-medium text-[#6a6a6a]">
              {[school.city, joined ? `nel consorzio da ${joined}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 pt-3">
          <button
            type="button"
            onClick={() => void handleStatus(suspended ? "active" : "suspended")}
            className="cursor-pointer text-[14px] font-semibold text-[#222222] hover:opacity-70"
          >
            {suspended ? "Riattiva" : "Sospendi"}
          </button>
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            className="cursor-pointer text-[14px] font-semibold underline underline-offset-[3px] hover:opacity-70"
            style={{ color: "#B3494F" }}
          >
            Rimuovi dal consorzio
          </button>
        </div>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[625px_minmax(0,1fr)]">
        {/* Dati anagrafici */}
        <div className="rounded-[16px] border border-[#ebebeb] bg-white px-6 py-[22px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#929292]">
              Dati anagrafici
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="cursor-pointer text-[13px] font-semibold text-[#222222] hover:opacity-70"
            >
              Modifica
            </button>
          </div>
          <dl className="mt-4">
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
                className="flex items-center justify-between gap-4 border-b border-[#f0f0f0] py-[10px] last:border-b-0 last:pb-0"
              >
                <dt className="text-[13px] font-medium text-[#929292]">{label}</dt>
                <dd className="text-[14px] font-semibold text-[#222222]">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 content-start gap-3">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[14px] border border-[#ebebeb] bg-white px-[18px] pb-4 pt-[18px]"
            >
              <div
                className="text-[26px] font-bold leading-8 tracking-[-0.6px]"
                style={{ color: card.color }}
              >
                {card.value}
              </div>
              <div className="mt-[3px] text-[12px] font-medium text-[#929292]">{card.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Allievi */}
      <div className="mt-9">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold tracking-[-0.3px] text-[#222222]">
            Allievi{" "}
            <span className="text-[15px] font-medium tracking-normal text-[#929292]">
              · {students.length}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => setAddStudentOpen(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#dddddd] bg-white px-4 py-[9px] text-[14px] font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7]"
          >
            <Plus className="h-4 w-4" />
            Aggiungi allievo
          </button>
        </div>

        {students.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-10 text-center text-sm font-medium text-neutral-500">
            Nessun allievo per questa autoscuola.
          </div>
        ) : (
          <div className="mt-3">
            {/* Griglia del prototipo: 1.6fr 90px 1fr 110px 70px 1.2fr, gap 14 */}
            <div className="grid grid-cols-[1.6fr_90px_1fr_110px_70px_1.2fr] gap-x-3.5 border-b border-[#ebebeb] px-4 pb-2.5">
              {["Allievo", "Patente", "Istruttore", "Ultima guida", "Guide", "Codici contabili"].map(
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
            {students.map((student) => (
              <div
                key={student.userId}
                onClick={() => setDrawerUserId(student.userId)}
                className="grid cursor-pointer grid-cols-[1.6fr_90px_1fr_110px_70px_1.2fr] items-center gap-x-3.5 rounded-[10px] border-b border-[#f2f2f2] px-4 py-3.5 transition-colors hover:bg-[#fafafa]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-[11px] font-bold text-white">
                    {initialsOf(student.name)}
                  </div>
                  <span className="truncate text-[14px] font-semibold text-[#222222]">
                    {student.name}
                  </span>
                </div>
                <div>
                  {student.licenseCategory ? (
                    <span
                      className="inline-flex items-center whitespace-nowrap px-2.5 py-1 text-[12px] font-bold leading-[1.4]"
                      style={{ background: "#EEF4FF", color: "#2A6FDB", borderRadius: 20 }}
                    >
                      {student.licenseCategory}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="truncate text-[13.5px] font-medium text-[#444444]">
                  {student.instructorName ?? "—"}
                </div>
                <div className="whitespace-nowrap text-[13px] font-medium text-[#6a6a6a]">
                  {formatShortDate(student.lastLessonAt)}
                </div>
                <div className="text-right text-[14px] font-semibold text-[#222222]">
                  {student.lessonsCount}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {student.codes.length === 0 ? (
                    <span className="text-[11.5px] font-medium text-[#b0b0b0]">—</span>
                  ) : (
                    student.codes.map((code) => (
                      <span
                        key={code.id}
                        className="inline-flex px-2 py-[3px] text-[11.5px] font-bold"
                        style={{ background: "#EEF0F6", color: "#1A1A2E", borderRadius: 6 }}
                      >
                        {code.code}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
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

      {/* Drawer dettaglio allievo (1:1 dal prototipo) */}
      <ConsorzioStudentDrawer
        userId={drawerUserId}
        onClose={() => setDrawerUserId(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}
