"use client";

import React from "react";

import { DetailPanel } from "@/components/ui/detail-panel";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  getConsorzioStudentDetail,
  setConsorzioMemberAccountingCodes,
  type ConsorzioStudentDetail,
} from "@/lib/actions/consorzio.actions";

/**
 * Drawer laterale dettaglio allievo (dal dettaglio autoscuola consorziata):
 * usa il componente CONDIVISO DetailPanel (stesso drawer della sezione Allievi
 * — 600px, backdrop, slide 220ms, Escape) col contenuto 1:1 dal prototipo
 * Consorzi.html: header avatar 50 navy + nome 21/700; stat 3× (border 1.5
 * #EBEBEB r14); CODICI CONTABILI con righe code/descrizione e picker chip
 * "CODICE · Desc" (assegnati navy op.55, disponibili #F2F2F2); GUIDE
 * CERTIFICATE con badge Certificata/Da certificare.
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
    timeZone: "Europe/Rome",
  });
  const time = date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
  return `${day} · ${time}`;
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/** X di chiusura/rimozione come nel proto (svg 1.5, colore parametrico). */
function XIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ConsorzioStudentDrawer({
  userId,
  onClose,
  onChanged,
}: {
  /** Null = chiuso. */
  userId: string | null;
  onClose: () => void;
  /** Dopo add/remove codici (per aggiornare la tabella sotto). */
  onChanged?: () => void;
}) {
  const toast = useFeedbackToast();
  const [detail, setDetail] = React.useState<ConsorzioStudentDetail | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!userId) {
      setDetail(null);
      setPickerOpen(false);
      return;
    }
    void getConsorzioStudentDetail(userId).then((res) => {
      if (res.success) setDetail(res.data);
      else toast.error({ description: res.message });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const saveCodes = async (codeIds: string[]) => {
    if (!userId) return;
    setBusy(true);
    const res = await setConsorzioMemberAccountingCodes({ userId, codeIds });
    setBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    const refreshed = await getConsorzioStudentDetail(userId);
    if (refreshed.success) setDetail(refreshed.data);
    onChanged?.();
  };

  const assignedIds = new Set(detail?.codes.map((code) => code.id) ?? []);

  return (
    <DetailPanel
      open={Boolean(userId && detail)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      testId="student-drawer"
      className="[line-height:normal]"
    >
      {detail && (
          <div className="px-[34px] pb-10 pt-[30px]">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-[16px] font-bold text-white">
                  {initialsOf(detail.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-[21px] font-bold tracking-[-0.3px] text-[#222222]">
                    {detail.name}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-[#929292]">
                    {[detail.schoolName, detail.schoolCity].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Chiudi dettaglio allievo"
                onClick={onClose}
                className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f5f5f5] transition-colors hover:bg-[#ececec]"
              >
                <XIcon size={11} color="#555555" />
              </button>
            </div>

            {/* Stat */}
            <div className="mb-[30px] grid grid-cols-3 gap-3">
              {[
                { value: String(detail.lessonsCount), label: "guide superiori" },
                { value: formatHours(detail.certifiedMinutes), label: "ore certificate" },
                { value: detail.licenseCategory ?? "—", label: "categoria" },
              ].map((card) => (
                <div key={card.label} className="rounded-[14px] border-[1.5px] border-[#ebebeb] p-4">
                  <div className="text-[24px] font-bold tracking-[-0.5px] text-[#222222]">
                    {card.value}
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium text-[#929292]">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Codici contabili */}
            <div className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#929292]">
                  Codici contabili
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen((prev) => !prev)}
                  className="cursor-pointer select-none text-[13px] font-semibold text-[#1a1a2e]"
                >
                  Aggiungi codice
                </button>
              </div>

              {detail.codes.length === 0 ? (
                <div className="rounded-[12px] border-[1.5px] border-dashed border-[#e2e2e2] p-4 text-center">
                  <div className="text-[13px] font-medium text-[#b0b0b0]">
                    Nessun codice assegnato a questo allievo
                  </div>
                </div>
              ) : (
                detail.codes.map((code) => (
                  <div
                    key={code.id}
                    className="mb-2 flex items-center gap-3 rounded-[12px] border-[1.5px] border-[#ebebeb] px-4 py-[13px]"
                  >
                    <div className="min-w-[130px] text-[14px] font-bold tabular-nums text-[#1a1a2e]">
                      {code.code}
                    </div>
                    <div className="flex-1 text-[13px] font-medium text-[#6a6a6a]">
                      {code.description ?? ""}
                    </div>
                    <button
                      type="button"
                      aria-label={`Rimuovi ${code.code}`}
                      disabled={busy}
                      onClick={() =>
                        void saveCodes(detail.codes.filter((c) => c.id !== code.id).map((c) => c.id))
                      }
                      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[#f5f5f5]"
                    >
                      <XIcon size={10} color="#a0a0a0" />
                    </button>
                  </div>
                ))
              )}

              {pickerOpen && (
                <div className="mt-2.5">
                  <div className="mb-2 text-[12.5px] font-medium text-[#929292]">
                    Scegli dall&apos;elenco del consorzio
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {detail.allCodes.map((code) => {
                      const assigned = assignedIds.has(code.id);
                      const label = code.description
                        ? `${code.code} · ${code.description}`
                        : code.code;
                      return (
                        <span
                          key={code.id}
                          onClick={() => {
                            if (assigned || busy) return;
                            void saveCodes([...assignedIds, code.id] as string[]);
                          }}
                          className={
                            assigned
                              ? "select-none rounded-[999px] bg-[#1a1a2e] px-[11px] py-1.5 text-[12.5px] font-semibold text-white opacity-55"
                              : "cursor-pointer select-none rounded-[999px] bg-[#f2f2f2] px-[11px] py-1.5 text-[12.5px] font-semibold text-[#444444] hover:bg-[#e9e9e9]"
                          }
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Guide certificate */}
            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.8px] text-[#929292]">
                Guide certificate
              </div>
              {detail.lessons.length === 0 ? (
                <div className="rounded-[12px] border-[1.5px] border-dashed border-[#e2e2e2] p-4 text-center">
                  <div className="text-[13px] font-medium text-[#b0b0b0]">
                    Nessuna guida col consorzio finora
                  </div>
                </div>
              ) : (
                detail.lessons.map((lesson) => (
                  <div
                    key={lesson.appointmentId}
                    className="flex items-center justify-between gap-4 border-b border-[#f0f0f0] py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#222222]">
                        {formatLessonWhen(lesson.startsAt)}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] font-medium text-[#929292]">
                        {[lesson.vehicleName, lesson.instructorName].filter(Boolean).join(" · ") ||
                          "—"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[14px] font-semibold text-[#222222]">
                        {formatHours(lesson.durationMinutes)}
                      </span>
                      <span
                        className="inline-flex rounded-[999px] px-2.5 py-1 text-[11.5px] font-bold"
                        style={
                          lesson.certified
                            ? { background: "#E4F4E7", color: "#1F6B2A" }
                            : { background: "#FCEFC7", color: "#8A6D1A" }
                        }
                      >
                        {lesson.certified ? "Certificata" : "Da certificare"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
      )}
    </DetailPanel>
  );
}
