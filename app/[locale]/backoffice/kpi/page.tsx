import { BackofficeKpiPage } from "@/components/pages/Backoffice/BackofficeKpiPage";
import { getBackofficeKpis } from "@/lib/actions/backoffice-kpi.actions";

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Default: ultimi 30 giorni (oggi incluso). L'intervallo sta nell'URL (?da=&a=). */
const defaultRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: ymd(from), to: ymd(to) };
};

const isYmd = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function BackofficeKpiRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fallback = defaultRange();
  const range = {
    from: isYmd(params.da) ? params.da : fallback.from,
    to: isYmd(params.a) ? params.a : fallback.to,
  };

  // Primo giro calcolato lato server: la pagina entra già piena, senza scheletri.
  const res = await getBackofficeKpis(range);

  return (
    <BackofficeKpiPage
      initialKpis={res.success && res.data ? res.data : null}
      initialRange={range}
    />
  );
}
