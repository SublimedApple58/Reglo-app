import { Badge } from "@/components/ui/badge";

export default function Filters({
  filtersParams,
}: {
  filtersParams: {
    title: string;
    options: string[];
    param: string;
  }[];
}): React.ReactElement {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "start", gap: 8 }}>
        {filtersParams.map((f) => {
          return (
            <div style={{ marginBlock: "0" }} key={f.title}>
              <Badge
                variant="outline"
                style={{
                  cursor: "pointer",
                }}
              >
                {f.title}
              </Badge>
            </div>
          );
        })}
      </div>
    </>
  );
}
