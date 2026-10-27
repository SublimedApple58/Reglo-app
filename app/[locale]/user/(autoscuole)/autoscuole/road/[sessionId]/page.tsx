import { RoadSessionDetailPage } from "@/components/pages/Autoscuole/road/RoadSessionDetailPage";

/** Reglo Road (REG-638): dettaglio di una guida registrata. */
export default async function AutoscuoleRoadSessionRoute(props: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ sessionId }, { from }] = await Promise.all([props.params, props.searchParams]);
  return <RoadSessionDetailPage sessionId={sessionId} from={from ?? null} />;
}
