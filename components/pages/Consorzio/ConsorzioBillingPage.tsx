"use client";

import React from "react";
import Image from "next/image";
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
import { Skeleton } from "@/components/ui/skeleton";
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
 * Sezione "Fatturazione" del consorzio (?tab=fatturazione) — riproduzione 1:1
 * del prototipo Consorzi.html (computed styles estratti): titolo 28/700 −0.4,
 * totali 14.5, navigatore mese con frecce circolari 30px, search pill 320×39,
 * chip codici 12.5/600 (attivo navy, inattivo #F2F2F2), gruppi scuola h68 con
 * avatar 40, righe guida h44 (badge patente e chip codici #EEF0F6/#1A1A2E,
 * quadratini saldata/fattura 16px), placeholder mese futuro con sfera di
 * cristallo. Vedi docs/features/consorzio.md.
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

const isFutureMonth = (key: string): boolean => key > monthKey(new Date());

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

/** Chip codice contabile (navy su #EEF0F6, radius 6 — dal prototipo). */
function CodeChip({ code, small }: { code: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex font-bold",
        small ? "px-[7px] py-[3px] text-[11px]" : "px-2 py-[3px] text-[11.5px]",
      )}
      style={{ background: "#EEF0F6", color: "#1A1A2E", borderRadius: 6 }}
    >
      {code}
    </span>
  );
}


/** Skeleton dei gruppi-autoscuola della Fatturazione. */
function BillingListSkeleton() {
  return (
    <div className="divide-y divide-[#ececec] border-t border-[#ececec]">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex h-[68px] items-center gap-3.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-48 max-w-full rounded" />
            <Skeleton className="h-3 w-64 max-w-full rounded" />
          </div>
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="size-4 rounded" />
        </div>
      ))}
    </div>
  );
}

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
    <div className="mx-auto w-full max-w-[1184px] pt-3 [line-height:normal]">
      {/* Header: titolo + totali a sinistra, navigatore mese a destra */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-[28px] font-bold tracking-[-0.4px] text-[#222222]">
            Fatturazione
          </h1>
          <p className="flex flex-wrap items-center gap-x-2.5 text-[14.5px] font-medium text-[#6a6a6a]">
            <span>
              Totale <span className="font-bold text-[#222222]">{formatMoney(totals.total)}</span>
            </span>
            <span className="text-[#d8d8d8]">·</span>
            <span>
              Saldato{" "}
              <span className="font-bold text-[#1f6b2a]">{formatMoney(totals.settled)}</span>
            </span>
            <span className="text-[#d8d8d8]">·</span>
            <span>
              Da incassare{" "}
              <span className="font-bold text-[#222222]">{formatMoney(totals.outstanding)}</span>
            </span>
          </p>
        </div>
        <div className="-mb-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full text-[#555555] transition-colors hover:bg-[#f2f2f2]"
            aria-label="Mese precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="px-[6px] text-center text-[15px] font-semibold text-[#222222]">
            {monthLabel(month)}
          </div>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full text-[#555555] transition-colors hover:bg-[#f2f2f2]"
            aria-label="Mese successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search a sinistra, legenda a destra */}
      <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
        <div className="flex h-[39px] w-[320px] items-center gap-2 rounded-[50px] border border-[#e2e2e2] bg-white px-3.5">
          <Search className="h-[15px] w-[15px] shrink-0 text-[#a0a0a0]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca autoscuola..."
            className="w-full border-0 bg-transparent p-0 text-[14px] font-medium text-[#222222] outline-none placeholder:text-[#a0a0a0]"
          />
        </div>
        <div className="flex items-center gap-4 text-[12.5px] font-medium text-[#6a6a6a]">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: "#1F6B2A" }} /> Saldata
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: "#1A1A2E" }} /> Fattura
            inviata
          </span>
        </div>
      </div>

      {/* Filtro per codice contabile */}
      <div className="mb-6 mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[12.5px] font-semibold text-[#929292]">
          Codice contabile
        </span>
        <button
          type="button"
          onClick={() => setCodeFilter(null)}
          className={cn(
            "cursor-pointer rounded-[999px] px-[11px] py-1.5 text-[12.5px] font-semibold transition-colors",
            codeFilter === null
              ? "bg-[#1a1a2e] text-white"
              : "bg-[#f2f2f2] text-[#444444] hover:bg-[#e9e9e9]",
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
              "cursor-pointer rounded-[999px] px-[11px] py-1.5 text-[12.5px] font-semibold transition-colors",
              codeFilter === code.id
                ? "bg-[#1a1a2e] text-white"
                : "bg-[#f2f2f2] text-[#444444] hover:bg-[#e9e9e9]",
            )}
          >
            {code.code}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCodesManagerOpen(true)}
          className="flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-full border border-dashed border-[#c8c8c8] text-[#929292] transition-colors hover:border-[#222222] hover:text-[#222222]"
          aria-label="Gestisci codici contabili"
          title="Gestisci codici contabili"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <BillingListSkeleton />
      ) : filteredGroups.length === 0 ? (
        /* Placeholder mese vuoto — 1:1 dal prototipo (sfera di cristallo). */
        <div className="flex flex-col items-center px-6 pb-16 pt-14 text-center">
          <Image
            src="/images/3d/sfera-cristallo-3d.png"
            alt=""
            width={200}
            height={200}
            className="mb-[26px] block h-[200px] w-[200px] object-contain"
          />
          <div className="mb-2 text-[22px] font-bold tracking-[-0.4px] text-[#222222]">
            {isFutureMonth(month)
              ? "Non riusciamo ANCORA a vedere nel futuro"
              : `Nessuna guida a ${monthLabel(month).toLowerCase()}`}
          </div>
          <p className="max-w-[380px] text-[14.5px] font-medium leading-[1.55] text-[#6a6a6a]">
            Le guide di {monthLabel(month)} compariranno qui man mano che vengono fatte.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#ececec] border-t border-[#ececec]">
          {filteredGroups.map((group) => {
            const isOpen = expanded.has(group.schoolId);
            return (
              <div key={group.schoolId}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.schoolId)}
                  className="flex h-[68px] w-full cursor-pointer items-center gap-3.5 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e6e6e6] bg-white text-[12px] font-bold text-[#444444]">
                    {initialsOf(group.schoolName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15.5px] font-semibold text-[#222222]">
                      {group.schoolName}
                    </div>
                    <div className="truncate text-[13px] font-medium text-[#929292]">
                      {[group.schoolCity, `${group.lessons.length} ${group.lessons.length === 1 ? 'guida' : 'guide'}`, `${formatMoney(group.total)} totale`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span className="shrink-0 text-[16px] font-extrabold tracking-[-0.3px] text-[#222222]">
                    {formatMoney(group.total)}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#a0a0a0]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#a0a0a0]" />
                  )}
                </button>

                {isOpen && (
                  <div className="pb-3 pl-[54px]">
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.appointmentId}
                        className="flex h-11 items-center gap-3.5"
                      >
                        <span className="w-14 shrink-0 text-[13px] font-medium text-[#929292]">
                          {formatLessonDate(lesson.startsAt)}
                        </span>
                        <span className="w-[170px] shrink-0 truncate text-[14px] font-semibold text-[#222222]">
                          {lesson.studentName}
                        </span>
                        {lesson.licenseCategory ? (
                          <span
                            className="inline-flex shrink-0 px-2 py-[3px] text-[11.5px] font-bold"
                            style={{ background: "#EEF0F6", color: "#1A1A2E", borderRadius: 6 }}
                          >
                            {lesson.licenseCategory}
                          </span>
                        ) : (
                          <span className="w-8 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#929292]">
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
                            <span className="text-[11.5px] font-semibold text-[#b0b0b0] underline underline-offset-2">
                              Codici
                            </span>
                          ) : (
                            lesson.codes.map((code) => (
                              <CodeChip key={code.id} code={code.code} small />
                            ))
                          )}
                        </button>
                        <span className="w-[60px] shrink-0 text-right text-[14px] font-bold text-[#222222]">
                          {formatMoney(lesson.price)}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleFlag(lesson, "settled")}
                            title={lesson.settled ? "Saldata — clic per togliere" : "Segna saldata"}
                            className="h-[15px] w-[15px] cursor-pointer rounded-[4px] transition-colors"
                            style={
                              lesson.settled
                                ? { background: "#1F6B2A" }
                                : { border: "1.5px solid #D9D9D9", background: "#fff" }
                            }
                          />
                          <button
                            type="button"
                            onClick={() => void toggleFlag(lesson, "invoiceSent")}
                            title={
                              lesson.invoiceSent
                                ? "Fattura inviata — clic per togliere"
                                : "Segna fattura inviata"
                            }
                            className="h-[15px] w-[15px] cursor-pointer rounded-[4px] transition-colors"
                            style={
                              lesson.invoiceSent
                                ? { background: "#1A1A2E" }
                                : { border: "1.5px solid #D9D9D9", background: "#fff" }
                            }
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
                  className={cn(
                    "cursor-pointer rounded-[999px] px-[11px] py-1.5 text-[12.5px] font-semibold transition-colors",
                    active ? "bg-[#1a1a2e] text-white" : "bg-[#f2f2f2] text-[#444444] hover:bg-[#e9e9e9]",
                  )}
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
