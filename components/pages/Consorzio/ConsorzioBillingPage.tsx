"use client";

import React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";

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
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";
import {
  archiveConsorzioAccountingCode,
  createConsorzioAccountingCode,
  getConsorzioBilling,
  setConsorzioAppointmentAccountingCodes,
  setConsorzioLessonBillingFlags,
  type ConsorzioBillingLesson,
  type ConsorzioBillingSchoolGroup,
} from "@/lib/actions/consorzio.actions";

/**
 * Sezione "Fatturazione" del consorzio (?tab=fatturazione, dal prototipo):
 * contabilizzazione mensile delle guide verso le autoscuole consorziate.
 * Navigatore mese · totali · ricerca · filtro per codice contabile · gruppi
 * per autoscuola espandibili · toggle Saldata / Fattura inviata per guida.
 * Vedi docs/features/consorzio.md.
 */

const monthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const shiftMonth = (key: string, delta: number): string => {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return monthKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const formatMoney = (value: number): string =>
  `€ ${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatLessonDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Rome",
  });

const initialsOf = (name: string): string =>
  name
    .replace(/^Autoscuola\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

export function ConsorzioBillingPage() {
  const toast = useFeedbackToast();

  const [month, setMonth] = React.useState(() => monthKey(new Date()));
  const [loading, setLoading] = React.useState(true);
  const [groups, setGroups] = React.useState<ConsorzioBillingSchoolGroup[]>([]);
  const [codes, setCodes] = React.useState<Array<{ id: string; code: string }>>([]);
  const [search, setSearch] = React.useState("");
  const [codeFilter, setCodeFilter] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [codesManagerOpen, setCodesManagerOpen] = React.useState(false);
  const [newCode, setNewCode] = React.useState("");
  const [codesBusy, setCodesBusy] = React.useState(false);

  const [lessonCodesFor, setLessonCodesFor] = React.useState<ConsorzioBillingLesson | null>(null);
  const [lessonCodesDraft, setLessonCodesDraft] = React.useState<string[]>([]);
  const [lessonCodesSaving, setLessonCodesSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await getConsorzioBilling({ month });
    if (res.success) {
      setGroups(res.data.groups);
      setCodes(res.data.codes);
    } else {
      toast.error({ description: res.message });
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Filtro ricerca + codice, con totali ricalcolati sul filtrato.
  const filteredGroups = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups
      .filter((group) => !query || group.schoolName.toLowerCase().includes(query))
      .map((group) => {
        const lessons = codeFilter
          ? group.lessons.filter((lesson) => lesson.codes.some((c) => c.id === codeFilter))
          : group.lessons;
        return {
          ...group,
          lessons,
          total: Math.round(lessons.reduce((sum, l) => sum + l.price, 0) * 100) / 100,
        };
      })
      .filter((group) => group.lessons.length > 0);
  }, [groups, search, codeFilter]);

  const totals = React.useMemo(() => {
    const lessons = filteredGroups.flatMap((group) => group.lessons);
    const total = Math.round(lessons.reduce((sum, l) => sum + l.price, 0) * 100) / 100;
    const settled =
      Math.round(lessons.filter((l) => l.settled).reduce((sum, l) => sum + l.price, 0) * 100) /
      100;
    return { total, settled, outstanding: Math.round((total - settled) * 100) / 100 };
  }, [filteredGroups]);

  const toggleExpanded = (schoolId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(schoolId)) next.delete(schoolId);
      else next.add(schoolId);
      return next;
    });
  };

  const toggleFlag = async (
    lesson: ConsorzioBillingLesson,
    flag: "settled" | "invoiceSent",
  ) => {
    const res = await setConsorzioLessonBillingFlags({
      appointmentId: lesson.appointmentId,
      ...(flag === "settled" ? { settled: !lesson.settled } : { invoiceSent: !lesson.invoiceSent }),
    });
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    void load();
  };

  const handleCreateCode = async () => {
    if (!newCode.trim()) return;
    setCodesBusy(true);
    const res = await createConsorzioAccountingCode(newCode);
    setCodesBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    setNewCode("");
    void load();
  };

  const handleArchiveCode = async (codeId: string) => {
    setCodesBusy(true);
    const res = await archiveConsorzioAccountingCode(codeId);
    setCodesBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    if (codeFilter === codeId) setCodeFilter(null);
    void load();
  };

  const openLessonCodes = (lesson: ConsorzioBillingLesson) => {
    setLessonCodesFor(lesson);
    setLessonCodesDraft(lesson.codes.map((code) => code.id));
  };

  const handleSaveLessonCodes = async () => {
    if (!lessonCodesFor) return;
    setLessonCodesSaving(true);
    const res = await setConsorzioAppointmentAccountingCodes({
      appointmentId: lessonCodesFor.appointmentId,
      codeIds: lessonCodesDraft,
    });
    setLessonCodesSaving(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    setLessonCodesFor(null);
    void load();
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            Fatturazione
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm font-medium text-muted-foreground">
            <span>
              Totale <span className="font-semibold text-foreground">{formatMoney(totals.total)}</span>
            </span>
            <span>·</span>
            <span>
              Saldato{" "}
              <span className="font-semibold text-emerald-600">{formatMoney(totals.settled)}</span>
            </span>
            <span>·</span>
            <span>
              Da incassare{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(totals.outstanding)}
              </span>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted"
            aria-label="Mese precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[150px] text-center text-[15px] font-semibold text-foreground">
            {monthLabel(month)}
          </div>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted"
            aria-label="Mese successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca autoscuola..."
            className="h-11 w-[260px] rounded-full border-border bg-white pl-10"
          />
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[4px] bg-emerald-600" /> Saldata
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[4px] bg-foreground" /> Fattura inviata
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] font-medium text-muted-foreground">
          Codice contabile
        </span>
        <button
          type="button"
          onClick={() => setCodeFilter(null)}
          className={cn(
            "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
            codeFilter === null
              ? "bg-foreground text-white"
              : "border border-border bg-white text-muted-foreground hover:text-foreground",
          )}
        >
          Tutti
        </button>
        {codes.map((code) => (
          <button
            key={code.id}
            type="button"
            onClick={() => setCodeFilter((prev) => (prev === code.id ? null : code.id))}
            className={cn(
              "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              codeFilter === code.id
                ? "bg-foreground text-white"
                : "border border-border bg-white text-muted-foreground hover:text-foreground",
            )}
          >
            {code.code}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCodesManagerOpen(true)}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          aria-label="Gestisci codici contabili"
          title="Gestisci codici contabili"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-white/40" />
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
            Nessuna guida da contabilizzare in {monthLabel(month).toLowerCase()}.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredGroups.map((group) => {
              const isOpen = expanded.has(group.schoolId);
              return (
                <div key={group.schoolId}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.schoolId)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-white">
                        {initialsOf(group.schoolName)}
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-foreground">
                          {group.schoolName}
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {[group.schoolCity, `${group.lessons.length} guide`, `${formatMoney(group.total)} totale`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[15px] font-semibold text-foreground">
                        {formatMoney(group.total)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="pb-4 pl-[52px]">
                      {group.lessons.map((lesson) => (
                        <div
                          key={lesson.appointmentId}
                          className="flex items-center gap-3 border-t border-border/40 py-3 first:border-t-0"
                        >
                          <span className="w-12 shrink-0 text-[13px] font-medium text-muted-foreground">
                            {formatLessonDate(lesson.startsAt)}
                          </span>
                          <span className="w-40 shrink-0 truncate text-sm font-semibold text-foreground">
                            {lesson.studentName}
                          </span>
                          {lesson.licenseCategory ? (
                            <span className="inline-flex shrink-0 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                              {lesson.licenseCategory}
                            </span>
                          ) : (
                            <span className="w-8 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                            {[
                              `${lesson.durationMinutes} min`,
                              lesson.instructorName,
                              lesson.vehicleName,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <button
                            type="button"
                            onClick={() => openLessonCodes(lesson)}
                            className="flex shrink-0 cursor-pointer flex-wrap items-center gap-1.5"
                            title="Modifica codici della guida"
                          >
                            {lesson.codes.length === 0 ? (
                              <span className="text-xs font-medium text-muted-foreground underline underline-offset-4">
                                Codici
                              </span>
                            ) : (
                              lesson.codes.map((code) => (
                                <span
                                  key={code.id}
                                  className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
                                >
                                  {code.code}
                                </span>
                              ))
                            )}
                          </button>
                          <span className="w-20 shrink-0 text-right text-sm font-semibold text-foreground">
                            {formatMoney(lesson.price)}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void toggleFlag(lesson, "settled")}
                              title={lesson.settled ? "Saldata — clic per togliere" : "Segna saldata"}
                              className={cn(
                                "h-5 w-5 cursor-pointer rounded-md border transition-colors",
                                lesson.settled
                                  ? "border-emerald-600 bg-emerald-600"
                                  : "border-border bg-white hover:border-emerald-600",
                              )}
                            />
                            <button
                              type="button"
                              onClick={() => void toggleFlag(lesson, "invoiceSent")}
                              title={
                                lesson.invoiceSent
                                  ? "Fattura inviata — clic per togliere"
                                  : "Segna fattura inviata"
                              }
                              className={cn(
                                "h-5 w-5 cursor-pointer rounded-md border transition-colors",
                                lesson.invoiceSent
                                  ? "border-foreground bg-foreground"
                                  : "border-border bg-white hover:border-foreground",
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gestione codici contabili */}
      <Dialog open={codesManagerOpen} onOpenChange={setCodesManagerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Codici contabili</DialogTitle>
            <DialogDescription>
              Etichette libere del consorzio, assegnabili ad allievi e guide.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {codes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun codice ancora.</p>
            )}
            {codes.map((code) => (
              <div
                key={code.id}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
              >
                <span className="text-sm font-semibold text-foreground">{code.code}</span>
                <button
                  type="button"
                  onClick={() => void handleArchiveCode(code.id)}
                  disabled={codesBusy}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-[#c13515]"
                  aria-label={`Archivia ${code.code}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="NUOVO-CODICE"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateCode();
                }
              }}
            />
            <Button onClick={() => void handleCreateCode()} disabled={codesBusy || !newCode.trim()}>
              {codesBusy ? <LoadingDots /> : "Aggiungi"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Codici della singola guida */}
      <Dialog
        open={lessonCodesFor !== null}
        onOpenChange={(open) => !open && setLessonCodesFor(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Codici della guida</DialogTitle>
            <DialogDescription>
              {lessonCodesFor
                ? `${lessonCodesFor.studentName} · ${formatLessonDate(lessonCodesFor.startsAt)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {codes.map((code) => {
              const active = lessonCodesDraft.includes(code.id);
              return (
                <button
                  key={code.id}
                  type="button"
                  onClick={() =>
                    setLessonCodesDraft((prev) =>
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
          <DialogFooter>
            <Button
              onClick={() => void handleSaveLessonCodes()}
              disabled={lessonCodesSaving}
              className="w-full sm:w-auto"
            >
              {lessonCodesSaving ? <LoadingDots /> : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
