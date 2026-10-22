"use client";

import { CATEGORY_GROUP_LABEL, GREY_RAMP, euroSmart } from "./finance-ui";

type RecurringLite = { name: string; categoryGroup: string | null; monthlyCents: number };

export type RecurringGroup = { key: string; cents: number; names: string[] };

/** Spese fisse attive raggruppate per gruppo di categoria, dalla più pesante. */
export function recurringGroups(active: RecurringLite[]): RecurringGroup[] {
  const map = new Map<string, RecurringGroup>();
  for (const e of active) {
    const key = e.categoryGroup ?? "altro";
    const g = map.get(key) ?? { key, cents: 0, names: [] };
    g.cents += e.monthlyCents;
    g.names.push(e.name);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

const rampAt = (i: number) => GREY_RAMP[Math.min(i, GREY_RAMP.length - 1)];

/** Barra impilata + righe per gruppo, dal mockup «Spese fisse». */
export function RecurringGroupBreakdown({ groups }: { groups: RecurringGroup[] }) {
  return (
    <>
      <div className="mb-[18px] mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {groups.map((g, i) => (
          <i key={g.key} style={{ flex: g.cents, background: rampAt(i) }} />
        ))}
      </div>
      {groups.map((g, i) => (
        <div
          key={g.key}
          className="flex items-center justify-between border-t border-[#f2f2f3] py-2.5 text-sm first:border-t-0"
        >
          <div className="flex min-w-0 items-center">
            <span className="mr-2 inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: rampAt(i) }} />
            {CATEGORY_GROUP_LABEL[g.key] ?? g.key}
            <span className="ml-2 truncate text-[13px] text-[#71717a]">
              {g.names.length === 1 ? g.names[0] : `${g.names.length} voci`}
            </span>
          </div>
          <b className="font-semibold tabular-nums">{euroSmart(g.cents)}</b>
        </div>
      ))}
    </>
  );
}
