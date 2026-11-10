"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Archive, Pencil, Plus, RotateCcw, UserRound } from "lucide-react";

import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { roadApi, type RoadExamRoute } from "@/lib/autoscuole/road/client";
import { groupExamRoutesByExaminer, NO_EXAMINER_KEY } from "@/lib/autoscuole/road/road-exam";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { km } from "./road-ui";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Road › «Percorsi d'esame» (REG-645; dal REG-716 è una tab di Road, prima
 * stava in Impostazioni › Reglo Road): lista dei
 * percorsi dell'autoscuola (nome, sede, patenti, km), apertura dell'editor a
 * pagina intera, archivio e ripristino. Archiviare non cancella: il percorso
 * esce dalla mappa dei punti critici e dal giro.
 */
export function RoadExamRoutesSection() {
  const locale = useLocale();
  const toast = useFeedbackToast();
  const editorBase = `/${locale}/user/autoscuole/road/percorsi`;
  const [routes, setRoutes] = React.useState<RoadExamRoute[] | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(
    (signal?: AbortSignal) =>
      roadApi
        .examRoutes(signal, { archived: true })
        .then(setRoutes)
        .catch((e: unknown) => {
          if (signal?.aborted) return;
          setRoutes([]);
          toast.error({ description: e instanceof Error ? e.message : "Impossibile caricare i percorsi d'esame." });
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const active = React.useMemo(() => routes?.filter((r) => !r.archivedAt) ?? [], [routes]);
  // R4 (anteprima approvata il 10/11/2026): raggruppati per esaminatore; un
  // percorso con due esaminatori sta sotto entrambi, «Senza esaminatore» in fondo.
  const groups = React.useMemo(
    () =>
      groupExamRoutesByExaminer(
        active.map((r) => ({ ...r, examiners: r.examiners ?? [], examAt: r.examAt ?? null, createdAt: r.createdAt ?? "" })),
      ),
    [active],
  );
  const knownExaminers = React.useMemo(() => groups.filter((g) => g.name).map((g) => g.name!), [groups]);
  const company = useAtomValue(companyAtom);
  const isOwner = company?.role === "admin";
  const [assigning, setAssigning] = React.useState<string | null>(null);
  const archived = routes?.filter((r) => r.archivedAt) ?? [];

  const act = async (r: RoadExamRoute, kind: "archive" | "restore") => {
    if (busy) return;
    setBusy(r.id);
    try {
      if (kind === "archive") await roadApi.archiveExamRoute(r.id);
      else await roadApi.updateExamRoute(r.id, { restore: true });
      await load();
      toast.success({ description: kind === "archive" ? "Percorso archiviato." : "Percorso ripristinato." });
    } catch (e) {
      toast.error({ description: e instanceof Error ? e.message : "Operazione non riuscita." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="max-w-[880px]" data-testid="road-exam-routes">
      <style>{`.er-list-row{animation:er-list-in 220ms ${EASE} backwards}@keyframes er-list-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <div className="flex items-baseline justify-between gap-3 text-base font-semibold text-[#222222]">
        <span className="text-[13.5px] font-normal leading-[1.5] text-[#6a6a6a]">
          Sulla mappa dei punti critici vedi quali errori cadono proprio lì; il giro li propone agli allievi.
        </span>
        <span className="shrink-0 text-[13px] font-medium text-[#6a6a6a]">
          {routes ? (active.length === 1 ? "1 percorso" : `${active.length} percorsi`) : ""}
        </span>
      </div>

      <div className="mt-3.5 rounded-[18px] border border-[#ebebeb]">
        {!routes ? (
          <div className="space-y-3 p-[18px]">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        ) : null}
        {routes && active.length === 0 ? (
          <div className="flex items-center gap-4 px-[18px] py-5" data-testid="road-exam-routes-empty">
            <RouteThumb path={[]} />
            <div className="min-w-0 text-[14px] leading-[1.45] text-[#6a6a6a]">
              <b className="block font-medium text-[#222222]">Ancora nessun percorso d&apos;esame</b>
              Disegnalo sulla mappa, oppure ricavalo da una guida: apri una guida dello Storico e scegli «Usa come
              percorso d&apos;esame» dal menu.
            </div>
          </div>
        ) : null}
        {groups.map((g, gi) => (
          <div key={g.key || "none"} className={cn(gi > 0 && "border-t border-[#ebebeb]")} data-testid="road-exam-group">
            <div className="flex items-center justify-between gap-3 px-[18px] pb-1.5 pt-4">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#f1f1f1] text-[12px] font-semibold text-[#111111] shadow-[0_0_0_1px_rgba(17,17,17,0.05)]">
                  {g.name ? initials(g.name) : <UserRound className="size-4 text-[#8e8e8e]" strokeWidth={1.8} />}
                </span>
                <b className="truncate text-[15.5px] font-semibold tracking-[-0.2px] text-[#111111]">
                  {g.name ?? "Senza esaminatore"}
                </b>
              </span>
              <span className="shrink-0 text-[13px] text-[#6a6a6a]">
                {[
                  g.routes.length === 1 ? "1 percorso" : `${g.routes.length} percorsi`,
                  g.name && g.lastExamAt ? `ultimo esame ${dayLabel(g.lastExamAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {g.routes.map((r, i) => (
              <Row key={`${g.key}:${r.id}`} route={r} first={i === 0}>
                {isOwner && g.key === NO_EXAMINER_KEY ? (
                  <span className="relative">
                    <button
                      type="button"
                      onClick={() => setAssigning((cur) => (cur === r.id ? null : r.id))}
                      aria-expanded={assigning === r.id}
                      className={cn(
                        "h-[34px] cursor-pointer rounded-[10px] px-2.5 text-[13.5px] font-semibold text-[#111111] transition-colors duration-200 hover:bg-[#f2f2f2]",
                        assigning === r.id && "bg-[#f2f2f2]",
                      )}
                      data-testid="road-exam-assign"
                    >
                      Assegna
                    </button>
                    {assigning === r.id ? (
                      <AssignExaminers
                        route={r}
                        known={knownExaminers}
                        onClose={() => setAssigning(null)}
                        onSaved={async () => {
                          setAssigning(null);
                          await load();
                        }}
                      />
                    ) : null}
                  </span>
                ) : null}
            <Link
              href={`${editorBase}/${r.id}`}
              aria-label={`Modifica ${r.name}`}
              className="grid size-[34px] place-items-center rounded-[10px] text-[#6a6a6a] transition-colors duration-200 hover:bg-[#f2f2f2] hover:text-[#111111]"
            >
              <Pencil className="size-4" strokeWidth={1.8} />
            </Link>
            <button
              type="button"
              aria-label={`Archivia ${r.name}`}
              disabled={Boolean(busy)}
              onClick={() => void act(r, "archive")}
              className="grid size-[34px] cursor-pointer place-items-center rounded-[10px] text-[#6a6a6a] transition-colors duration-200 hover:bg-[#f2f2f2] hover:text-[#111111] disabled:cursor-default"
            >
              {busy === r.id ? <LoadingDots /> : <Archive className="size-4" strokeWidth={1.8} />}
            </button>
          </Row>
            ))}
          </div>
        ))}
        {routes ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-b-[18px] border-t border-[#f0f0f0] bg-[#fcfcfc] px-[18px] py-3.5"
          >
            {archived.length ? (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="cursor-pointer text-[13.5px] font-medium text-[#6a6a6a] transition-colors duration-200 hover:text-[#111111]"
              >
                {showArchived ? "Nascondi archiviati" : `Archiviati (${archived.length})`}
              </button>
            ) : (
              <span />
            )}
            <Link
              href={`${editorBase}/nuovo`}
              data-testid="road-exam-new"
              className="flex h-11 items-center gap-2 rounded-[22px] bg-[#111111] px-[18px] text-[14.5px] font-semibold text-white transition-colors duration-200 hover:bg-[#2a2a2a]"
            >
              <Plus className="size-4" strokeWidth={2.2} />
              Nuovo percorso
            </Link>
          </div>
        ) : null}
      </div>

      {showArchived && archived.length ? (
        <div className="mt-3 rounded-[18px] border border-[#ebebeb]" data-testid="road-exam-archived">
          {archived.map((r, i) => (
            <Row key={r.id} route={r} first={i === 0} muted>
              <button
                type="button"
                aria-label={`Ripristina ${r.name}`}
                disabled={Boolean(busy)}
                onClick={() => void act(r, "restore")}
                className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[10px] px-2.5 text-[13.5px] font-medium text-[#6a6a6a] transition-colors duration-200 hover:bg-[#f2f2f2] hover:text-[#111111] disabled:cursor-default"
              >
                {busy === r.id ? <LoadingDots /> : <RotateCcw className="size-4" strokeWidth={1.8} />}
                <span className="hidden sm:inline">Ripristina</span>
              </button>
            </Row>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Row({
  route,
  first,
  muted,
  children,
}: {
  route: RoadExamRoute;
  first: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  const meta = [
    route.origin === "exam" ? "Registrato con Road Exam" : null,
    route.examSite,
    route.licenseCategories.length ? `Patente\u00a0${route.licenseCategories.join(", ")}` : "Tutte le patenti",
    `${km(route.lengthMeters)}\u00a0km`,
  ]
    .filter(Boolean)
    .join("\u00a0· ");
  return (
    <div
      data-testid="road-exam-route-row"
      className={cn("er-list-row flex min-h-[72px] items-center gap-3.5 px-[18px] py-3", !first && "border-t border-[#f0f0f0]")}
    >
      <RouteThumb path={route.path} muted={muted} />
      <div className="min-w-0 flex-1">
        <b className={cn("block truncate text-[15px] font-medium", muted ? "text-[#6a6a6a]" : "text-[#222222]")}>
          {route.name}
        </b>
        <span className="line-clamp-2 block text-[13px] leading-[1.4] text-[#6a6a6a]">{meta}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </div>
  );
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function dayLabel(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return "oggi";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function initials(name: string) {
  const words = name.replace(/^(ing|dott|dr|sig|arch|geom)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || name.slice(0, 2)).toUpperCase();
}

/**
 * R4: il titolare assegna gli esaminatori a un percorso che non li ha (i
 * percorsi disegnati, o registrati con un esame senza esaminatori scritti).
 * Nomi liberi come sull'esame (REG-640) più quelli già usati.
 */
function AssignExaminers({
  route,
  known,
  onClose,
  onSaved,
}: {
  route: RoadExamRoute;
  known: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useFeedbackToast();
  const ref = React.useRef<HTMLDivElement>(null);
  const [picked, setPicked] = React.useState<string[]>(route.examiners ?? []);
  const [typed, setTyped] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const toggle = (n: string) => setPicked((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  const save = async () => {
    const names = [...picked, ...(typed.trim() ? [typed.trim()] : [])];
    if (!names.length || saving) return;
    setSaving(true);
    try {
      await roadApi.updateExamRoute(route.id, { examiners: names });
      await onSaved();
    } catch (e) {
      toast.error({ description: e instanceof Error ? e.message : "Esaminatori non salvati." });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Esaminatori del percorso"
      className="er-pop absolute right-0 top-[40px] z-20 w-[320px] rounded-[18px] bg-white p-4 text-left shadow-[0_0_0_1px_rgba(17,17,17,0.06),0_24px_48px_-12px_rgba(17,17,17,0.28)]"
      data-testid="road-exam-assign-panel"
    >
      <style>{`.er-pop{animation:er-pop-in 200ms ${EASE} backwards}@keyframes er-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <b className="block text-[15.5px] font-semibold text-[#111111]">Esaminatori del percorso</b>
      <span className="block truncate text-[13px] text-[#6a6a6a]">{route.name}</span>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        maxLength={80}
        placeholder="Scrivi un nome…"
        className="mt-3 h-[42px] w-full rounded-xl border border-[#dcdcdc] px-3 text-[14px] text-[#111111] outline-none transition-colors duration-200 placeholder:text-[#9a9a9a] focus:border-[#111111]"
      />
      {known.length ? (
        <>
          <span className="mt-3 block text-[12.5px] font-semibold text-[#6a6a6a]">Già usati</span>
          <div className="mt-1">
            {known.map((n, i) => {
              const on = picked.includes(n);
              return (
                <label
                  key={n}
                  className={cn("flex cursor-pointer items-center gap-2.5 py-2.5 text-[14.5px] text-[#222222]", i > 0 && "border-t border-[#f0f0f0]")}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(n)} className="size-[18px] cursor-pointer accent-[#111111]" />
                  {n}
                </label>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-[34px] cursor-pointer rounded-[17px] px-3.5 text-[13.5px] font-semibold text-[#111111] shadow-[0_0_0_1px_#e3e3e3] transition-colors duration-200 hover:bg-[#f6f6f6]"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || (!picked.length && !typed.trim())}
          className="flex h-[34px] min-w-[64px] cursor-pointer items-center justify-center rounded-[17px] bg-[#111111] px-3.5 text-[13.5px] font-semibold text-white transition-colors duration-200 hover:bg-[#2a2a2a] disabled:cursor-default disabled:opacity-50"
        >
          {saving ? <LoadingDots /> : "Salva"}
        </button>
      </div>
    </div>
  );
}

/** Miniatura della forma del percorso (proiezione locale, senza mappa). Usata anche dalla tab Road dell'allievo. */
export function RouteThumb({
  path,
  muted,
  width: W = 56,
  height: H = 42,
}: {
  path: Array<[number, number]>;
  muted?: boolean;
  width?: number;
  height?: number;
}) {
  const pad = 6;
  let d = "";
  if (path.length >= 2) {
    const lat0 = (path[0][0] * Math.PI) / 180;
    const xs = path.map((p) => p[1] * Math.cos(lat0));
    const ys = path.map((p) => -p[0]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * s) / 2;
    const oy = (H - (maxY - minY) * s) / 2;
    d = xs
      .map((x, i) => `${i ? "L" : "M"}${(ox + (x - minX) * s).toFixed(1)},${(oy + (ys[i] - minY) * s).toFixed(1)}`)
      .join("");
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 rounded-xl bg-[#F4F1EA]" aria-hidden>
      {d ? (
        <path d={d} fill="none" stroke={muted ? "#9a9a9a" : "#111111"} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M14 30c6-12 14 2 20-8s8-6 8-6" fill="none" stroke="#c9c2b3" strokeWidth={2.2} strokeDasharray="3 4" strokeLinecap="round" />
      )}
    </svg>
  );
}
