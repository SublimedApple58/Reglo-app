import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { getAutoscuolaAgendaBootstrapAction } from "@/lib/actions/autoscuole.actions";
import { withPerfJson } from "@/lib/perf";
import { requireServiceAccess } from "@/lib/service-access";

const AGENDA_BOOTSTRAP_TTL_SECONDS = 20;

export async function GET(request: Request) {
  return withPerfJson("/api/autoscuole/agenda/bootstrap", async ({ measure }) => {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) {
      return {
        status: 400,
        body: { success: false, message: "Parametri from/to obbligatori." },
      };
    }

    const rawLimit = searchParams.get("limit");
    const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
    const limit =
      typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
        ? parsedLimit
        : undefined;

    const { membership } = await measure("context", () => requireServiceAccess("AUTOSCUOLE"));
    const filters = {
      from,
      to,
      instructorId: searchParams.get("instructorId"),
      vehicleId: searchParams.get("vehicleId"),
      status: searchParams.get("status"),
      type: searchParams.get("type"),
      limit,
    };

    const cacheKey = await measure("cache_key", () =>
      buildAutoscuoleCacheKey({
        companyId: membership.companyId,
        segment: AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
        scope: `bootstrap:${hashCacheInput(filters)}`,
      }),
    );

    const cached = await measure("cache_read", () =>
      readAutoscuoleCache<{
        appointments: unknown[];
        students: unknown[];
        instructors: unknown[];
        vehicles: unknown[];
        meta: Record<string, unknown>;
      }>(cacheKey),
    );
    if (cached) {
      return {
        status: 200,
        companyId: membership.companyId,
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

    const bootstrap = await measure("bootstrap", () =>
      getAutoscuolaAgendaBootstrapAction(
        {
          ...filters,
        },
        { companyId: membership.companyId },
      ),
    );

    if (!bootstrap.success || !bootstrap.data) {
      return {
        status: 400,
        companyId: membership.companyId,
        body: bootstrap,
      };
    }

    const payload = {
      ...bootstrap.data,
      meta: {
        ...bootstrap.data.meta,
        cache: false,
      },
    };
    await measure("cache_write", () =>
      writeAutoscuoleCache(cacheKey, payload, AGENDA_BOOTSTRAP_TTL_SECONDS),
    );

    return {
      status: 200,
      companyId: membership.companyId,
      cacheHit: false,
      body: {
        success: true,
        data: payload,
      },
    };
  });
}
