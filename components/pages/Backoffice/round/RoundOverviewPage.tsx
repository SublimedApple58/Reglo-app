"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { FinCard, FinLabel, euro } from "@/components/pages/Backoffice/finance/finance-ui";
import {
  CATEGORY_LABEL,
  FUNNEL_LABEL,
  FUNNEL_STAGES,
  INTERACTION_LABEL,
  ROUND_CATEGORIES,
  ROUND_STATUSES,
  STATUS_LABEL,
  summarize,
  type FunnelStage,
} from "@/lib/round/round-constants";
import type { RecentInteraction, RoundInfo, RoundInvestorRow } from "@/lib/round/round-data";
import { cn } from "@/lib/utils";

import { NextStep, OwnerAvatar, SectionTitle, StatusDot, StatusStack, shortDate } from "./round-ui";

const FUNNEL_TONE: Record<FunnelStage, string> = {
  contacted: "#111111",
  responded: "#3f3f46",
  call: "#71717a",
  interested: "#15803d",
  committed: "#14532d",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const LIST = "/backoffice/round/investitori";

export function RoundOverviewPage({
  round,
  investors,
  recent,
  today,
}: {
  round: RoundInfo;
  investors: RoundInvestorRow[];
  recent: RecentInteraction[];
  today: string;
}) {
  const s = summarize(investors);
  const progress = Math.min(1, s.committedCents / round.targetCents);
  const upcoming = investors
    .filter((i) => !i.excluded && i.nextStepOn)
    .sort((a, b) => (a.nextStepOn! < b.nextStepOn! ? -1 : 1))
    .slice(0, 7);
  const overdue = investors.filter((i) => !i.excluded && i.nextStepOn && i.nextStepOn < today).length;
  const warm = investors.filter((i) => !i.excluded && (i.status === "interessato" || i.status === "impegno"));

  return (
    <div className="space-y-5">
      {/* Obiettivo + numeri chiave */}
      <FinCard className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr]">
          <div className="border-b border-[#f2f2f3] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <FinLabel>{round.name} · obiettivo</FinLabel>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[44px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-[#111111] sm:text-[56px]">
                {euro(s.committedCents)}
              </span>
              <span className="text-[17px] font-medium tabular-nums text-[#a1a1aa] sm:text-xl">
                di {euro(round.targetCents)}
              </span>
            </div>
            <div className="relative mt-6 h-2.5 rounded-full bg-[#f1f1f2]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#14532d] transition-[width] duration-700"
                style={{ width: `${progress * 100}%`, minWidth: progress > 0 ? 10 : 0 }}
              />
              {[0.25, 0.5, 0.75].map((t) => (
                <span key={t} className="absolute top-full mt-1.5 -translate-x-1/2 text-[10.5px] tabular-nums text-[#a1a1aa]" style={{ left: `${t * 100}%` }}>
                  {Math.round((round.targetCents * t) / 100_000)} k€
                </span>
              ))}
              {[0.25, 0.5, 0.75].map((t) => (
                <span key={`tick-${t}`} className="absolute inset-y-0 w-px bg-white" style={{ left: `${t * 100}%` }} />
              ))}
            </div>
            <p className="mt-9 text-[13.5px] leading-relaxed text-[#52525b]">
              {s.committedCents > 0 ? (
                <>
                  {pct(progress)} impegnato da {s.byStatus.impegno} {s.byStatus.impegno === 1 ? "investitore" : "investitori"}.
                </>
              ) : (
                <>Nessun impegno ancora: conta solo chi è in «Impegno» con un importo.</>
              )}{" "}
              {warm.length ? (
                <>
                  Interessati:{" "}
                  {warm.map((w, i) => (
                    <span key={w.id}>
                      <Link href={`${LIST}?scheda=${w.id}`} className="font-medium text-[#111111] underline decoration-[#d4d4d8] underline-offset-[3px] hover:decoration-[#111111]">
                        {w.name}
                      </Link>
                      {i < warm.length - 1 ? ", " : "."}
                    </span>
                  ))}
                </>
              ) : null}
            </p>
          </div>

          <div className="grid grid-cols-2">
            <KeyNumber label="Nel round" value={String(s.total)} note={`${s.excluded} esclusi`} href={LIST} />
            <KeyNumber label="Contattati" value={String(s.funnel.contacted)} note={`${s.byStatus.da_contattare} da contattare`} href={`${LIST}?stato=contattato`} />
            <KeyNumber
              label="Tasso di risposta"
              value={s.responseRate === null ? "—" : pct(s.responseRate)}
              note={`${s.funnel.responded} risposte`}
            />
            <KeyNumber label="Call fatte" value={String(s.funnel.call)} note={`${s.funnel.interested} con interesse`} href={`${LIST}?stato=call`} />
            <KeyNumber
              label="Bloccati"
              value={String(s.byStatus.bloccato)}
              note="da sbloccare"
              warn={s.byStatus.bloccato > 0}
              href={`${LIST}?stato=bloccato`}
            />
            <KeyNumber
              label="Prossimi passi scaduti"
              value={String(overdue)}
              note={overdue ? "da riprendere" : "tutto in pari"}
              warn={overdue > 0}
            />
          </div>
        </div>
      </FinCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* Imbuto */}
        <FinCard className="p-5 sm:p-6">
          <SectionTitle aside="ogni tappa resta anche se poi arriva un no">Imbuto</SectionTitle>
          <div className="mt-5 space-y-3.5">
            {FUNNEL_STAGES.map((stage, idx) => {
              const n = s.funnel[stage];
              const base = s.funnel.contacted || 1;
              const prev = idx ? s.funnel[FUNNEL_STAGES[idx - 1]] : null;
              return (
                <div key={stage} className="grid grid-cols-[88px_1fr_56px] items-center gap-3 sm:grid-cols-[104px_1fr_72px]">
                  <div className="text-[13px] font-medium text-[#3f3f46]">{FUNNEL_LABEL[stage]}</div>
                  <div className="relative h-9 rounded-lg bg-[#f7f7f8]">
                    <div
                      className="absolute inset-y-0 left-0 flex items-center rounded-lg transition-[width] duration-700"
                      style={{ width: `${(n / base) * 100}%`, minWidth: n ? 34 : 0, backgroundColor: FUNNEL_TONE[stage] }}
                    />
                    <span
                      className={cn(
                        "absolute inset-y-0 flex items-center text-[14px] font-semibold tabular-nums",
                        n / base > 0.12 ? "left-3 text-white" : "text-[#111111]",
                      )}
                      style={n / base > 0.12 ? undefined : { left: n ? `calc(max(${(n / base) * 100}%, 34px) + 10px)` : 12 }}
                    >
                      {n}
                    </span>
                  </div>
                  <div className="text-right text-[12.5px] tabular-nums text-[#71717a]">
                    {prev === null ? "100%" : prev ? pct(n / prev) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[12px] text-[#a1a1aa]">La percentuale è rispetto alla tappa prima.</p>
        </FinCard>

        {/* Prossimi passi */}
        <FinCard className="p-5 sm:p-6">
          <SectionTitle aside={<Link href={`${LIST}?ordine=prossimo`} className="hover:text-[#111111]">tutti →</Link>}>
            Prossimi passi
          </SectionTitle>
          {upcoming.length ? (
            <ul className="mt-3 divide-y divide-[#f2f2f3]">
              {upcoming.map((i) => (
                <li key={i.id}>
                  <Link href={`${LIST}?scheda=${i.id}`} className="-mx-2 flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-[#fafafa]">
                    <div className="w-[92px] shrink-0 text-[13px]">
                      <NextStep ymd={i.nextStepOn} today={today} compact />
                      <div className="text-[11.5px] text-[#a1a1aa]">{i.nextStepOn ? relative(i.nextStepOn, today) : ""}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-[#111111]">{i.name}</div>
                      <div className="truncate text-[12.5px] text-[#71717a]">{i.nextStepNote ?? STATUS_LABEL[i.status]}</div>
                    </div>
                    <OwnerAvatar owner={i.owner} size={24} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-[13.5px] text-[#71717a]">Nessun prossimo passo in calendario.</p>
          )}
        </FinCard>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* Per tipologia */}
        <FinCard className="p-5 sm:p-6">
          <SectionTitle aside={`${s.total} nel round`}>Per tipologia</SectionTitle>
          <div className="mt-4 hidden grid-cols-[1fr_44px_56px_56px_44px] gap-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a1a1aa] md:grid">
            <span>Tipologia</span>
            <span className="text-right">Tot.</span>
            <span className="text-right">Contatt.</span>
            <span className="text-right">Risposte</span>
            <span className="text-right">Call</span>
          </div>
          <ul className="divide-y divide-[#f2f2f3] border-t border-[#f2f2f3] md:border-t-0">
            {ROUND_CATEGORIES.map((c) => {
              const rows = investors.filter((i) => !i.excluded && i.category === c);
              const cat = s.byCategory[c];
              const contacted = rows.filter((r) => r.contactedOn).length;
              const responded = rows.filter((r) => r.respondedOn).length;
              const calls = rows.filter((r) => r.callOn).length;
              return (
                <li key={c}>
                  <Link href={`${LIST}?tipologia=${c}`} className="-mx-2 block rounded-lg px-2 py-3 hover:bg-[#fafafa]">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3 md:grid-cols-[1fr_44px_56px_56px_44px]">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-[#111111]">{CATEGORY_LABEL[c]}</div>
                        <StatusStack byStatus={cat.byStatus} total={cat.total} className="mt-2 h-1.5" />
                      </div>
                      <span className="text-right text-[15px] font-semibold tabular-nums">{cat.total}</span>
                      <span className="hidden text-right text-[13.5px] tabular-nums text-[#3f3f46] md:block">{contacted}</span>
                      <span className="hidden text-right text-[13.5px] tabular-nums text-[#3f3f46] md:block">{responded}</span>
                      <span className="hidden text-right text-[13.5px] tabular-nums text-[#3f3f46] md:block">{calls}</span>
                    </div>
                    <div className="mt-1.5 text-[12px] tabular-nums text-[#71717a] md:hidden">
                      {contacted} contattati · {responded} risposte · {calls} call
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#f2f2f3] pt-4">
            {ROUND_STATUSES.map((st) => (
              <Link
                key={st}
                href={`${LIST}?stato=${st}`}
                className="inline-flex items-center gap-1.5 text-[12.5px] text-[#52525b] hover:text-[#111111]"
              >
                <StatusDot status={st} />
                {STATUS_LABEL[st]}
                <span className="font-semibold tabular-nums text-[#111111]">{s.byStatus[st]}</span>
              </Link>
            ))}
          </div>
        </FinCard>

        {/* Ultime attività */}
        <FinCard className="p-5 sm:p-6">
          <SectionTitle>Ultime attività</SectionTitle>
          {recent.length ? (
            <ol className="relative mt-4 space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-[#ececee]">
              {recent.map((r) => (
                <li key={r.id} className="relative pl-6">
                  <span
                    className={cn(
                      "absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-white",
                      r.kind === "risposta" || r.kind === "call" ? "bg-[#111111]" : "bg-[#c9c9cf]",
                    )}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`${LIST}?scheda=${r.investorId}`} className="truncate text-[13.5px] font-medium text-[#111111] hover:underline">
                      {r.investorName}
                    </Link>
                    <span className="shrink-0 text-[12px] tabular-nums text-[#a1a1aa]">{shortDate(r.occurredOn)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#71717a]">
                    <span className="font-medium text-[#52525b]">{INTERACTION_LABEL[r.kind]}</span> · {r.body}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-[13.5px] text-[#71717a]">Ancora niente nello storico.</p>
          )}
        </FinCard>
      </div>
    </div>
  );
}

const relative = (ymd: string, today: string) => {
  const diff = Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "oggi";
  if (diff < 0) return `scaduto da ${-diff} g`;
  return diff === 1 ? "domani" : diff < 60 ? `tra ${diff} giorni` : `tra ${Math.round(diff / 30)} mesi`;
};

function KeyNumber({
  label,
  value,
  note,
  warn,
  href,
}: {
  label: string;
  value: string;
  note: string;
  warn?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <FinLabel className="flex items-center justify-between gap-2">
        {label}
        {href ? <ArrowUpRight className="h-3.5 w-3.5 text-[#c9c9cf] transition-colors group-hover:text-[#111111]" /> : null}
      </FinLabel>
      <div
        className={cn(
          "mt-2 text-[28px] font-semibold leading-none tracking-[-0.025em] tabular-nums",
          warn ? "text-[#c2410c]" : "text-[#111111]",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px] text-[#71717a]">{note}</div>
    </>
  );
  const cls = "group block border-b border-r border-[#f2f2f3] p-4 sm:p-5 [&:nth-child(2n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-[#fafafa]")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
