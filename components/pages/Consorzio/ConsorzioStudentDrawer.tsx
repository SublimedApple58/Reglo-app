"use client";

import React from "react";

import { DetailPanel } from "@/components/ui/detail-panel";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { EditStudentLicenseDialog } from "@/components/pages/Autoscuole/dialogs/EditStudentLicenseDialog";
import {
  Pill,
  StudentAvatar,
  blueLinkClass,
  sectionLabelClass,
  splitFullName,
} from "@/components/pages/Autoscuole/student-detail-ui";
import { updateStudentPhone } from "@/lib/actions/autoscuole.actions";
import { TRANSMISSION_LABELS, type Transmission } from "@/lib/autoscuole/license";
import { cn } from "@/lib/utils";
import {
  getConsorzioStudentDetail,
  setConsorzioMemberAccountingCodes,
  type ConsorzioStudentDetail,
} from "@/lib/actions/consorzio.actions";

/**
 * Drawer laterale dettaglio allievo del consorzio.
 *
 * REG-465: stessa forma del dettaglio allievo delle autoscuole normali —
 * `DetailPanel` con header centrato (avatar 96, nome, recapito, pill) e tab
 * Riepilogo / Guide / Costi — costruito sui primitivi condivisi in
 * `student-detail-ui`. Restano consorzio-only i CODICI CONTABILI (vedi e
 * assegna) e il riepilogo costi verso l'autoscuola (REG-459/462).
 * Vedi docs/features/consorzio.md.
 */

const formatHours = (minutes: number): string => {
  if (minutes === 0) return "0";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace(".", ",")}h`;
};

const formatLessonWhen = (iso: string): string => {
  const date = new Date(iso);
  const day = date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
  const time = date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
  return `${day} · ${time}`;
};

const formatMoney = (value: number): string =>
  `€ ${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

type DrawerTab = "summary" | "lessons" | "costs";

/** Skeleton del contenuto drawer mentre carica il dettaglio allievo. */
function DrawerSkeleton() {
  return (
    <>
      <div className="border-b border-[#dddddd] px-6 pt-6">
        <div className="mb-5 flex flex-col items-center pt-2">
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="mt-4 h-5 w-44 rounded" />
          <Skeleton className="mt-2 h-3 w-36 rounded" />
        </div>
        <div className="flex items-stretch gap-6 pb-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1 rounded" />
          ))}
        </div>
      </div>
      <div className="space-y-3 p-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    </>
  );
}

/** Riga "etichetta + valore" dell'anagrafica (come nel drawer autoscuole). */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[12px] font-medium text-[#929292]">{label}</p>
      {children}
    </div>
  );
}

const emptyRowClass = "pt-8 text-center text-[13px] font-medium text-[#929292]";

export function ConsorzioStudentDrawer({
  userId,
  onClose,
  onChanged,
}: {
  /** Null = chiuso. */
  userId: string | null;
  onClose: () => void;
  /** Dopo add/remove codici o modifiche anagrafiche (per aggiornare la tabella sotto). */
  onChanged?: () => void;
}) {
  const toast = useFeedbackToast();
  const [detail, setDetail] = React.useState<ConsorzioStudentDetail | null>(null);
  const [tab, setTab] = React.useState<DrawerTab>("summary");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [licenseDialogOpen, setLicenseDialogOpen] = React.useState(false);
  const [editingPhone, setEditingPhone] = React.useState(false);
  const [phoneDraft, setPhoneDraft] = React.useState("");
  const [phoneSaving, setPhoneSaving] = React.useState(false);

  React.useEffect(() => {
    if (!userId) {
      setDetail(null);
      setPickerOpen(false);
      return;
    }
    setTab("summary");
    setEditingPhone(false);
    void getConsorzioStudentDetail(userId).then((res) => {
      if (res.success) setDetail(res.data);
      else toast.error({ description: res.message });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refresh = async () => {
    if (!userId) return;
    const res = await getConsorzioStudentDetail(userId);
    if (res.success) setDetail(res.data);
  };

  const saveCodes = async (codeIds: string[]) => {
    if (!userId) return;
    setBusy(true);
    const res = await setConsorzioMemberAccountingCodes({ userId, codeIds });
    setBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    await refresh();
    onChanged?.();
  };

  const savePhone = async () => {
    if (!userId || phoneSaving) return;
    setPhoneSaving(true);
    const res = await updateStudentPhone({ studentId: userId, phone: phoneDraft });
    setPhoneSaving(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile aggiornare il numero." });
      return;
    }
    setDetail((prev) => (prev ? { ...prev, phone: res.data?.phone ?? null } : prev));
    setEditingPhone(false);
    toast.success({ description: res.message ?? "Numero aggiornato." });
    onChanged?.();
  };

  const assignedIds = new Set(detail?.codes.map((code) => code.id) ?? []);
  const nameParts = detail ? splitFullName(detail.name) : { firstName: "", lastName: "" };
  const toCertifyMinutes = detail
    ? detail.lessons.reduce(
        (sum, lesson) => sum + (lesson.certified ? 0 : lesson.durationMinutes),
        0,
      )
    : 0;

  const renderSummary = (data: ConsorzioStudentDetail) => (
    <>
      {/* Anagrafica */}
      <section className="border-b border-[#f2f2f2] pb-7">
        <p className={sectionLabelClass}>Anagrafica</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          <Field label="Nome">
            <p className="text-sm font-medium text-foreground">{data.name}</p>
          </Field>
          <Field label="Email">
            <p className="break-all text-sm font-medium text-foreground">{data.email || "—"}</p>
          </Field>
          <Field label="Telefono">
            {editingPhone ? (
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  autoFocus
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void savePhone();
                    if (e.key === "Escape") setEditingPhone(false);
                  }}
                  placeholder="+39 333 123 4567"
                  disabled={phoneSaving}
                  className="w-full max-w-[170px] rounded-lg border border-[#e2e2e6] bg-white px-2.5 py-1.5 text-sm font-medium text-foreground outline-none focus:border-foreground/40 disabled:opacity-60"
                />
                <button
                  type="button"
                  className={blueLinkClass}
                  disabled={phoneSaving}
                  onClick={() => void savePhone()}
                >
                  {phoneSaving ? "…" : "Salva"}
                </button>
                <button
                  type="button"
                  className="text-[13px] font-medium text-[#929292] hover:text-foreground disabled:opacity-60"
                  disabled={phoneSaving}
                  onClick={() => setEditingPhone(false)}
                >
                  Annulla
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{data.phone || "—"}</p>
                <button
                  type="button"
                  className={blueLinkClass}
                  onClick={() => {
                    setPhoneDraft(data.phone ?? "");
                    setEditingPhone(true);
                  }}
                >
                  {data.phone ? "Modifica" : "Aggiungi"}
                </button>
              </div>
            )}
          </Field>
          <Field label="Autoscuola">
            <p className="text-sm font-medium text-foreground">
              {[data.schoolName, data.schoolCity].filter(Boolean).join(" · ") || "—"}
            </p>
          </Field>
          <Field label="Percorso patente">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {data.licenseCategory
                  ? `${data.licenseCategory} · ${
                      TRANSMISSION_LABELS[data.transmission as Transmission] ??
                      data.transmission ??
                      "—"
                    }`
                  : "—"}
              </p>
              <button
                type="button"
                className={blueLinkClass}
                onClick={() => setLicenseDialogOpen(true)}
              >
                Modifica
              </button>
            </div>
          </Field>
          <Field label="Accesso all'app">
            <Pill tone={data.email ? "green" : "gray"}>
              {data.email ? "Attivo" : "Non attivo"}
            </Pill>
          </Field>
        </div>
      </section>

      {/* Codici contabili — la parte consorzio-only */}
      <section className="border-b border-[#f2f2f2] py-7">
        <div className="mb-4 flex items-center justify-between">
          <p className={cn(sectionLabelClass, "mb-0")}>Codici contabili</p>
          <button
            type="button"
            className={blueLinkClass}
            onClick={() => setPickerOpen((prev) => !prev)}
          >
            {pickerOpen ? "Chiudi" : "Aggiungi codice"}
          </button>
        </div>

        {data.codes.length === 0 ? (
          <p className="text-[13px] font-medium text-[#929292]">
            Nessun codice assegnato a questo allievo.
          </p>
        ) : (
          <div className="space-y-2">
            {data.codes.map((code) => (
              <div
                key={code.id}
                className="flex items-center gap-3 rounded-[10px] bg-[#f8f8f8] px-3.5 py-2.5"
              >
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {code.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#929292]">
                  {code.description ?? ""}
                </span>
                <button
                  type="button"
                  aria-label={`Rimuovi ${code.code}`}
                  disabled={busy}
                  onClick={() =>
                    void saveCodes(data.codes.filter((c) => c.id !== code.id).map((c) => c.id))
                  }
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[#ececec] disabled:opacity-50"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 2l8 8M10 2l-8 8"
                      stroke="#8a8a8a"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {pickerOpen && (
          <div className="mt-4">
            <p className="mb-2 text-[12px] font-medium text-[#929292]">
              Scegli dall&apos;elenco del consorzio
            </p>
            <div className="flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto">
              {data.allCodes.map((code) => {
                const assigned = assignedIds.has(code.id);
                const label = code.description ? `${code.code} · ${code.description}` : code.code;
                return (
                  <button
                    key={code.id}
                    type="button"
                    disabled={assigned || busy}
                    onClick={() => void saveCodes([...assignedIds, code.id])}
                    className={cn(
                      "select-none rounded-full px-[11px] py-1.5 text-[12.5px] font-semibold transition-colors",
                      assigned
                        ? "cursor-default bg-[#111111] text-white opacity-55"
                        : "cursor-pointer bg-[#f2f2f2] text-[#444444] hover:bg-[#e9e9e9] disabled:opacity-50",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Attività col consorzio */}
      <section className="py-7">
        <p className={sectionLabelClass}>Attività col consorzio</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: String(data.lessonsCount), label: "guide superiori" },
            { value: formatHours(data.certifiedMinutes), label: "ore certificate" },
            { value: formatHours(toCertifyMinutes), label: "da certificare" },
          ].map((card) => (
            <div key={card.label} className="rounded-[14px] border border-[#ebebeb] px-4 py-3.5">
              <p className="text-[22px] font-bold tracking-[-0.4px] text-foreground">{card.value}</p>
              <p className="mt-0.5 text-[12px] font-medium text-[#929292]">{card.label}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );

  const renderLessons = (data: ConsorzioStudentDetail) => {
    const rows = [
      ...data.lessons.map((lesson) => ({ kind: "guide" as const, ...lesson })),
      ...data.exams.map((exam) => ({ kind: "exam" as const, ...exam })),
    ].sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));

    if (rows.length === 0) {
      return <p className={emptyRowClass}>Nessuna guida col consorzio finora.</p>;
    }

    return (
      <div>
        {rows.map((row) => (
          <div
            key={row.appointmentId}
            data-testid={`student-lesson-${row.kind}`}
            className="flex items-center justify-between gap-4 border-b border-[#f2f2f2] py-3.5 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {row.kind === "exam" && (
                  <span
                    className="inline-flex rounded-[6px] px-[7px] py-[3px] text-[11px] font-bold"
                    style={{ background: "#F0E9FF", color: "#5B3FB0" }}
                  >
                    Esame
                  </span>
                )}
                <p className="text-sm font-semibold text-foreground">
                  {formatLessonWhen(row.startsAt)}
                </p>
              </div>
              <p className="mt-0.5 truncate text-[12.5px] font-medium text-[#929292]">
                {[row.vehicleName, row.instructorName].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {row.kind === "exam" ? formatMoney(row.price) : formatHours(row.durationMinutes)}
              </span>
              {row.kind === "exam" ? (
                <Pill tone={row.settled ? "green" : "amber"}>
                  {row.settled ? "Saldato" : "Da saldare"}
                </Pill>
              ) : (
                <Pill tone={row.certified ? "green" : "amber"}>
                  {row.certified ? "Certificata" : "Da certificare"}
                </Pill>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCosts = (data: ConsorzioStudentDetail) => (
    <section data-testid="student-costs">
      <p className={sectionLabelClass}>Riepilogo costi</p>
      <div className="rounded-[14px] border border-[#ebebeb] px-4 py-1">
        {[
          {
            key: "guides",
            label: "Guide",
            sub: plural(data.costs.guides.count, "guida", "guide"),
            value: data.costs.guides.includedInCourse
              ? "Incluse nel percorso"
              : formatMoney(data.costs.guides.amount),
            muted: data.costs.guides.includedInCourse,
          },
          ...(data.costs.course
            ? [
                {
                  key: "course",
                  label: "Percorso completo",
                  sub: `Prezzo unico ${data.costs.course.category}${
                    data.costs.course.settled ? " · saldato" : ""
                  }`,
                  value: formatMoney(data.costs.course.amount),
                  muted: false,
                },
              ]
            : []),
          {
            key: "exams",
            label: "Esami",
            sub: plural(data.costs.exams.count, "esame", "esami"),
            value: formatMoney(data.costs.exams.amount),
            muted: false,
          },
        ].map((row) => (
          <div
            key={row.key}
            data-testid={`student-cost-${row.key}`}
            className="flex items-center justify-between gap-4 border-b border-[#f2f2f2] py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{row.label}</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">{row.sub}</p>
            </div>
            <span
              className={
                row.muted
                  ? "shrink-0 text-[13px] font-semibold text-[#a0a0a0]"
                  : "shrink-0 text-sm font-bold tabular-nums text-foreground"
              }
            >
              {row.value}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm font-bold text-foreground">Totale</span>
          <span
            data-testid="student-cost-total"
            className="text-[16px] font-extrabold tabular-nums tracking-[-0.3px] text-foreground"
          >
            {formatMoney(data.costs.total)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-[12px] font-medium leading-[1.5] text-[#a3a3a3]">
        È quanto il consorzio fattura all&apos;autoscuola per questo allievo. Gli importi già
        congelati in Fatturazione non cambiano più.
      </p>
    </section>
  );

  return (
    <>
      <DetailPanel
        open={Boolean(userId)}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        testId="student-drawer"
      >
        {!detail ? (
          <DrawerSkeleton />
        ) : (
          <FadeIn>
            {/* Header — stesso impianto del dettaglio allievo autoscuole */}
            <div className="border-b border-[#dddddd] px-6 pt-6">
              <div className="relative mb-5 flex flex-col items-center pt-2 text-center">
                <button
                  type="button"
                  aria-label="Chiudi dettaglio allievo"
                  onClick={onClose}
                  className="absolute right-0 top-0 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f2f2f2]"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 3l8 8M11 3l-8 8"
                      stroke="#6a6a6a"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <StudentAvatar
                  student={{ id: detail.userId, ...nameParts }}
                  size={96}
                />
                <div className="mt-4">
                  <p className="text-lg font-bold tracking-[-0.2px] text-foreground">
                    {detail.name}
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium text-[#929292]">
                    {detail.email || detail.phone || "Nessun recapito"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    {detail.schoolName && <Pill tone="gray">{detail.schoolName}</Pill>}
                    {detail.licenseCategory && <Pill tone="blue">{detail.licenseCategory}</Pill>}
                  </div>
                </div>
              </div>
              <div className="flex items-stretch">
                {(
                  [
                    { key: "summary" as const, label: "Riepilogo" },
                    { key: "lessons" as const, label: "Guide" },
                    { key: "costs" as const, label: "Costi" },
                  ]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={cn(
                      "flex-1 cursor-pointer select-none border-b-2 px-2 py-3 text-center text-sm transition-colors",
                      tab === item.key
                        ? "border-[#222222] font-semibold text-foreground"
                        : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {tab === "summary" && renderSummary(detail)}
              {tab === "lessons" && renderLessons(detail)}
              {tab === "costs" && renderCosts(detail)}
            </div>
          </FadeIn>
        )}
      </DetailPanel>

      {detail && (
        <EditStudentLicenseDialog
          open={licenseDialogOpen}
          onOpenChange={setLicenseDialogOpen}
          studentId={detail.userId}
          studentName={detail.name}
          currentLicenseCategory={detail.licenseCategory}
          currentTransmission={detail.transmission}
          onSuccess={(next) => {
            setDetail((prev) =>
              prev
                ? {
                    ...prev,
                    licenseCategory: next.licenseCategory,
                    transmission: next.transmission,
                  }
                : prev,
            );
            void refresh();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
