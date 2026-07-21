import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard skeleton — usato solo dalla legacy AutoscuoleDashboardPage
 * (pagina dismessa, route notFound). Le pagine vive hanno skeleton locali
 * fedeli al proprio layout.
 */
export function DashboardSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-white p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
