import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard skeleton — 4 metric cards + 2 column layout */
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

/** Table skeleton — toolbar + header + rows */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-10 w-72" />
      </div>
      <div className="rounded-lg border border-border bg-white">
        <div className="flex gap-4 border-b border-border px-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-24" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-border px-4 py-4 last:border-0">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Agenda skeleton — filters + calendar grid */
export function AgendaSkeleton() {
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="grid grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
        {Array.from({ length: 21 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Settings skeleton — sections with form fields */
export function SettingsSkeleton() {
  return (
    <div className="w-full space-y-6">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-4 rounded-lg border border-border bg-white p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-80" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Payments skeleton — summary cards + table */
export function PaymentsSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-white p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={4} cols={5} />
    </div>
  );
}

/** Voice/Segretaria skeleton — status card + config + tasks */
export function VoiceSkeleton() {
  return (
    <div className="w-full space-y-5">
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-border bg-white p-6">
          <Skeleton className="h-5 w-36" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-white p-6">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
