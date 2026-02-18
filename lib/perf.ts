import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

type PerfSpan = {
  name: string;
  durationMs: number;
};

type PerfContext = {
  requestId: string;
  addSpan: (name: string, durationMs: number) => void;
  measure: <T>(name: string, callback: () => Promise<T> | T) => Promise<T>;
};

type PerfEnvelope = {
  status: number;
  body: unknown;
  companyId?: string | null;
  cacheHit?: boolean;
};

const round = (value: number) => Math.round(value * 100) / 100;

export const withPerfJson = async (
  route: string,
  handler: (ctx: PerfContext) => Promise<PerfEnvelope>,
) => {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const spans: PerfSpan[] = [];

  const addSpan = (name: string, durationMs: number) => {
    spans.push({ name, durationMs: round(durationMs) });
  };

  const measure = async <T>(name: string, callback: () => Promise<T> | T) => {
    const spanStart = performance.now();
    try {
      return await callback();
    } finally {
      addSpan(name, performance.now() - spanStart);
    }
  };

  try {
    const envelope = await handler({
      requestId,
      addSpan,
      measure,
    });
    const totalMs = round(performance.now() - startedAt);
    const serverTiming = [`total;dur=${totalMs}`]
      .concat(spans.map((span) => `${span.name};dur=${span.durationMs}`))
      .join(", ");

    const response = NextResponse.json(envelope.body, {
      status: envelope.status,
    });
    response.headers.set("x-request-id", requestId);
    response.headers.set("server-timing", serverTiming);

    console.info(
      JSON.stringify({
        level: "info",
        kind: "autoscuole_perf",
        route,
        requestId,
        companyId: envelope.companyId ?? null,
        status: envelope.status,
        cacheHit: envelope.cacheHit ?? false,
        durationMs: totalMs,
        spans,
      }),
    );

    return response;
  } catch (error) {
    const totalMs = round(performance.now() - startedAt);
    console.error(
      JSON.stringify({
        level: "error",
        kind: "autoscuole_perf",
        route,
        requestId,
        durationMs: totalMs,
        spans,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
    );
    throw error;
  }
};

