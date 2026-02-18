import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  canManageAutoscuolaStripeConnect,
  getAutoscuolaStripeConnectStatus,
} from "@/lib/autoscuole/stripe-connect";
import { withPerfJson } from "@/lib/perf";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

const STRIPE_STATUS_TTL_SECONDS = 60;

export async function GET(request: Request) {
  return withPerfJson("/api/autoscuole/payments/stripe-connect/status", async ({ measure }) => {
    try {
      const { membership } = await measure("context", () => requireServiceAccess("AUTOSCUOLE"));
      if (!canManageAutoscuolaStripeConnect(membership.role, membership.autoscuolaRole)) {
        return {
          status: 403,
          companyId: membership.companyId,
          body: {
            success: false,
            message: "Operazione non consentita.",
          },
        };
      }

      const { searchParams } = new URL(request.url);
      const sync =
        searchParams.get("sync") === "1" || searchParams.get("sync") === "true";

      if (!sync) {
        const cacheKey = await measure("cache_key", () =>
          buildAutoscuoleCacheKey({
            companyId: membership.companyId,
            segment: AUTOSCUOLE_CACHE_SEGMENTS.STRIPE,
            scope: "status",
          }),
        );
        const cached = await measure("cache_read", () =>
          readAutoscuoleCache<Awaited<ReturnType<typeof getAutoscuolaStripeConnectStatus>>>(
            cacheKey,
          ),
        );
        if (cached) {
          return {
            status: 200,
            companyId: membership.companyId,
            cacheHit: true,
            body: { success: true, data: cached },
          };
        }

        const data = await measure("stripe", () =>
          getAutoscuolaStripeConnectStatus({
            companyId: membership.companyId,
            sync: false,
          }),
        );
        await measure("cache_write", () =>
          writeAutoscuoleCache(cacheKey, data, STRIPE_STATUS_TTL_SECONDS),
        );
        return {
          status: 200,
          companyId: membership.companyId,
          cacheHit: false,
          body: { success: true, data },
        };
      }

      const data = await measure("stripe", () =>
        getAutoscuolaStripeConnectStatus({
          companyId: membership.companyId,
          sync: true,
        }),
      );
      return {
        status: 200,
        companyId: membership.companyId,
        cacheHit: false,
        body: { success: true, data },
      };
    } catch (error) {
      return {
        status: 400,
        body: {
          success: false,
          message: formatError(error),
        },
      };
    }
  });
}
