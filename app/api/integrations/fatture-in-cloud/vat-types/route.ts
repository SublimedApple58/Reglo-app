import { prisma } from "@/db/prisma";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { getFicConnection } from "@/lib/integrations/fatture-in-cloud";
import { withPerfJson } from "@/lib/perf";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

type FicVatType = {
  id?: string;
  description?: string;
  value?: number;
};

type FicVatTypesResponse = {
  data?: FicVatType[];
};

const FIC_VAT_CACHE_TTL_SECONDS = 6 * 60 * 60;

export async function GET() {
  return withPerfJson("/api/integrations/fatture-in-cloud/vat-types", async ({ measure }) => {
    try {
      const { membership } = await measure("context", () =>
        requireServiceAccess("AUTOSCUOLE"),
      );

      if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
        return {
          status: 403,
          companyId: membership.companyId,
          body: {
            success: false,
            message: "Solo admin o titolare autoscuola possono vedere le aliquote FIC",
          },
        };
      }

      const connection = await measure("fic_connection", () =>
        getFicConnection({
          prisma,
          companyId: membership.companyId,
        }),
      );

      const cacheKey = await measure("cache_key", () =>
        buildAutoscuoleCacheKey({
          companyId: membership.companyId,
          segment: AUTOSCUOLE_CACHE_SEGMENTS.FIC,
          scope: `vat:${hashCacheInput({ entityId: connection.entityId })}`,
        }),
      );
      const cached = await measure("cache_read", () =>
        readAutoscuoleCache<Array<{ value: string; label: string; rate?: number }>>(cacheKey),
      );
      if (cached) {
        return {
          status: 200,
          companyId: membership.companyId,
          cacheHit: true,
          body: { success: true, data: cached },
        };
      }

      const response = await measure("fic_api", () =>
        fetch(`https://api-v2.fattureincloud.it/c/${connection.entityId}/info/vat_types`, {
          headers: {
            Authorization: `Bearer ${connection.token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }),
      );

      if (!response.ok) {
        throw new Error("Impossibile ottenere le aliquote FIC");
      }

      const payload = (await response.json()) as FicVatTypesResponse | FicVatType[];
      const list = Array.isArray(payload) ? payload : payload.data ?? [];
      const options = list
        .map((vat) => {
          if (vat.id == null) return null;
          const label = vat.description
            ? vat.value != null
              ? `${vat.description} (${vat.value}%)`
              : vat.description
            : vat.value != null
              ? `IVA ${vat.value}%`
              : "Aliquota IVA";
          return { value: String(vat.id), label, rate: vat.value };
        })
        .filter(Boolean) as Array<{ value: string; label: string; rate?: number }>;

      await measure("cache_write", () =>
        writeAutoscuoleCache(cacheKey, options, FIC_VAT_CACHE_TTL_SECONDS),
      );

      return {
        status: 200,
        companyId: membership.companyId,
        cacheHit: false,
        body: { success: true, data: options },
      };
    } catch (error) {
      const message = formatError(error);
      const normalized = message.toLowerCase();
      return {
        status:
          normalized.includes("fatture in cloud non connesso") ||
          normalized.includes("seleziona l'azienda fic")
            ? 400
            : 500,
        body: { success: false, message },
      };
    }
  });
}
