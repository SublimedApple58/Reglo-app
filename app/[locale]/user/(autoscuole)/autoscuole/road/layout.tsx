import { RoadHeadquartersGate } from "@/components/pages/Autoscuole/road/RoadHeadquartersGate";

/** Pagine Road (REG-656): senza l'indirizzo della sede il titolare viene fermato. */
export default function AutoscuoleRoadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RoadHeadquartersGate />
    </>
  );
}
