"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";

import { roadApi, type RoadExamRoute } from "@/lib/autoscuole/road/client";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { km } from "./road-ui";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Impostazioni › Reglo Road › «I tuoi percorsi d'esame» (REG-645): lista dei
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

  const active = routes?.filter((r) => !r.archivedAt) ?? [];
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
    <section className="mt-[42px]" data-testid="road-exam-routes">
      <style>{`.er-list-row{animation:er-list-in 220ms ${EASE} backwards}@keyframes er-list-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <div className="flex items-baseline justify-between text-base font-semibold text-[#222222]">
        I tuoi percorsi d&apos;esame
        <span className="text-[13px] font-medium text-[#6a6a6a]">
          {routes ? (active.length === 1 ? "1 percorso" : `${active.length} percorsi`) : ""}
        </span>
      </div>
      <p className="mt-1.5 max-w-[680px] text-[13.5px] leading-[1.5] text-[#6a6a6a]">
        I giri che la Motorizzazione fa fare all&apos;esame. Sulla mappa dei punti critici vedi quali errori cadono
        proprio lì.
      </p>

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
              Disegnalo sulla mappa, oppure ricavalo da una guida: Road › Storico › apri la guida › «Usa come
              percorso d&apos;esame».
            </div>
          </div>
        ) : null}
        {active.map((r, i) => (
          <Row key={r.id} route={r} first={i === 0}>
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

/** Miniatura della forma del percorso (proiezione locale, senza mappa). */
function RouteThumb({ path, muted }: { path: Array<[number, number]>; muted?: boolean }) {
  const W = 56;
  const H = 42;
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
