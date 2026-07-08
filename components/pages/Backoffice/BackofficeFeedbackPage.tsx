"use client";

import React from "react";
import { MessageSquareHeart } from "lucide-react";

import type { BackofficeFeedbackDto } from "@/lib/actions/support.actions";
import { cn } from "@/lib/utils";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="whitespace-nowrap text-sm tracking-[1px]">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? "text-[#ffb400]" : "text-gray-200"}>
          ★
        </span>
      ))}
    </span>
  );
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Elenco dei feedback prodotto (dialog "Lascia un feedback" della web app). */
export function BackofficeFeedbackPage({ items }: { items: BackofficeFeedbackDto[] }) {
  const average =
    items.length > 0
      ? Math.round((items.reduce((sum, f) => sum + f.rating, 0) / items.length) * 10) / 10
      : null;

  const ratingCounts = [5, 4, 3, 2, 1].map(
    (rating) => [rating, items.filter((f) => f.rating === rating).length] as const,
  );
  const maxCount = Math.max(1, ...ratingCounts.map(([, count]) => count));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le valutazioni lasciate dalle autoscuole dalla dialog &quot;Lascia un feedback&quot;.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-border/60 bg-white px-6 py-16 text-center">
          <MessageSquareHeart className="mb-3 h-7 w-7 text-gray-300" strokeWidth={1.5} />
          <div className="text-sm font-semibold text-foreground">Ancora nessun feedback</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Le valutazioni delle autoscuole compariranno qui.
          </div>
        </div>
      ) : (
        <>
          {/* Riepilogo */}
          <div className="mb-4 flex flex-col gap-5 rounded-xl border border-border/60 bg-white p-5 sm:flex-row sm:items-center">
            <div className="shrink-0 sm:pr-6">
              <div className="text-3xl font-bold tabular-nums text-foreground">{average}</div>
              <Stars rating={Math.round(average ?? 0)} />
              <div className="mt-0.5 text-xs text-muted-foreground">
                {items.length} feedback
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {ratingCounts.map(([rating, count]) => (
                <div key={rating} className="flex items-center gap-2">
                  <span className="w-3 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                    {rating}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[#ffb400]"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-xs tabular-nums text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Elenco */}
          <div className="space-y-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border/60 bg-white px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-sm font-semibold text-foreground">
                      {item.companyName ?? "Autoscuola eliminata"}
                    </span>
                    {item.userName && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {item.userName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3">
                    <Stars rating={item.rating} />
                    <span className="text-xs text-muted-foreground">
                      {dateLabel(item.createdAt)}
                    </span>
                  </div>
                </div>
                {item.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {item.message && (
                  <p
                    className={cn(
                      "text-sm font-medium leading-relaxed text-foreground/80",
                      item.tags.length > 0 ? "mt-2" : "mt-2",
                    )}
                  >
                    {item.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
