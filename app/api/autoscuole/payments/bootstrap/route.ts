import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { getAutoscuolaSettingsForCompany } from "@/lib/actions/autoscuole-settings.actions";
import {
  getAutoscuolaPaymentsAppointments,
  getAutoscuolaPaymentsOverview,
} from "@/lib/autoscuole/payments";
import { getAutoscuolaStripeConnectStatus } from "@/lib/autoscuole/stripe-connect";
import { prisma } from "@/db/prisma";
import { withPerfJson } from "@/lib/perf";
import { requireServiceAccess } from "@/lib/service-access";

const PAYMENTS_BOOTSTRAP_TTL_SECONDS = 20;

export async function GET(request: Request) {
  return withPerfJson("/api/autoscuole/payments/bootstrap", async ({ measure }) => {
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const parsedLimit = rawLimit ? Number(rawLimit) : 20;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(200, Math.trunc(parsedLimit))
        : 20;
    const cursor = searchParams.get("cursor");

    const { membership } = await measure("context", () => requireServiceAccess("AUTOSCUOLE"));
    const companyId = membership.companyId;
    const cacheKey = await measure("cache_key", () =>
      buildAutoscuoleCacheKey({
        companyId,
        segment: AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
        scope: `bootstrap:${hashCacheInput({ limit, cursor })}`,
      }),
    );

    const cached = await measure("cache_read", () =>
      readAutoscuoleCache<{
        settings: unknown;
        overview: unknown;
        appointmentsPage: unknown;
        stripeStatus: unknown;
        ficStatus: unknown;
        meta: Record<string, unknown>;
      }>(cacheKey),
    );
    if (cached) {
      return {
        status: 200,
        companyId,
        cacheHit: true,
        body: {
          success: true,
          data: {
            ...cached,
            meta: {
              ...cached.meta,
              cache: true,
            },
          },
        },
      };
    }

    const [settings, overview, appointments, stripeStatus, ficConnection] =
      await measure("bootstrap", () =>
        Promise.all([
          getAutoscuolaSettingsForCompany(companyId),
          getAutoscuolaPaymentsOverview({
            companyId,
          }),
          getAutoscuolaPaymentsAppointments({
            companyId,
            limit,
            cursor,
            paymentAttemptsLimit: 1,
          }),
          getAutoscuolaStripeConnectStatus({
            companyId,
            sync: false,
          }),
          prisma.integrationConnection.findUnique({
            where: {
              companyId_provider: {
                companyId,
                provider: "FATTURE_IN_CLOUD",
              },
            },
            select: {
              status: true,
              metadata: true,
            },
          }),
        ]),
      );

    const ficMetadata =
      ficConnection?.metadata && typeof ficConnection.metadata === "object"
        ? (ficConnection.metadata as Record<string, unknown>)
        : {};
    const ficEntityId =
      typeof ficMetadata.entityId === "string" && ficMetadata.entityId.trim().length
        ? ficMetadata.entityId.trim()
        : null;

    const payload = {
      settings,
      overview,
      appointmentsPage: {
        items: appointments,
        nextCursor:
          appointments.length >= limit ? appointments[appointments.length - 1]?.id ?? null : null,
        limit,
      },
      stripeStatus,
      ficStatus: {
        connected: Boolean(ficConnection),
        status: ficConnection?.status ?? null,
        entityId: ficEntityId,
      },
      meta: {
        generatedAt: new Date(),
        cache: false,
      },
    };

    await measure("cache_write", () =>
      writeAutoscuoleCache(cacheKey, payload, PAYMENTS_BOOTSTRAP_TTL_SECONDS),
    );

    return {
      status: 200,
      companyId,
      cacheHit: false,
      body: {
        success: true,
        data: payload,
      },
    };
  });
}
