import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import {
  STUDENT_LICENSE_CATEGORIES,
  TRANSMISSIONS,
} from "@/lib/autoscuole/license";
import { formatError } from "@/lib/utils";

/**
 * REG-410 — a student who self-registered (mobile sign-up) sets their OWN
 * license path at first access. Unlike the owner-side `updateStudentLicensePath`
 * (staff picks for a student), this is self-scoped: the caller can only set the
 * license on their own membership, and only while the first-access gate applies
 * (self-registered AND not yet chosen). Categories are the student subset
 * (B / AM / A1 / A2 / A); transmission (manuale/automatico) is chosen for every
 * category — cars and moto alike.
 */
const bodySchema = z.object({
  licenseCategory: z.enum(STUDENT_LICENSE_CATEGORIES),
  transmission: z.enum(TRANSMISSIONS).optional(),
});

export async function PATCH(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    if (membership.autoscuolaRole !== "STUDENT") {
      return NextResponse.json(
        { success: false, message: "Endpoint disponibile solo per gli allievi." },
        { status: 403 },
      );
    }

    // Only self-registered students are ever asked to pick their own path.
    if (!membership.selfRegistered) {
      return NextResponse.json(
        { success: false, message: "Il percorso patente è gestito dalla tua autoscuola." },
        { status: 403 },
      );
    }

    const { licenseCategory, transmission } = bodySchema.parse(await request.json());
    // Transmission is chosen for every category (cars and moto). The mobile gate
    // always sends it; default to manual only as a defensive fallback.
    const finalTransmission = transmission ?? "manual";

    // Idempotent: once the path is set the gate is cleared, so we don't let the
    // student silently overwrite a license the school may have already set. If
    // it's already populated we no-op and just echo the stored value.
    if (membership.licenseCategory) {
      return NextResponse.json({
        success: true,
        data: {
          licenseCategory: membership.licenseCategory,
          transmission: membership.transmission ?? "manual",
          needsLicensePath: false,
        },
      });
    }

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: membership.userId,
        autoscuolaRole: "STUDENT",
      },
      data: {
        licenseCategory,
        transmission: finalTransmission,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        licenseCategory,
        transmission: finalTransmission,
        needsLicensePath: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
