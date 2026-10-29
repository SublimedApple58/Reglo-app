import { RoadExamRouteEditorPage } from "@/components/pages/Autoscuole/road/RoadExamRouteEditorPage";

/** Reglo Road (REG-645): editor di un percorso d'esame (`nuovo` = nuovo; `?session=` = da una guida). */
export default async function AutoscuoleRoadExamRouteRoute(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string; fromMs?: string; toMs?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return <RoadExamRouteEditorPage id={id} session={sp.session ?? null} fromMs={sp.fromMs ?? null} toMs={sp.toMs ?? null} />;
}
