import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { createInstructorBlock } from "@/lib/actions/autoscuole.actions";
import { formatError } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const { searchParams } = new URL(request.url);
    const instructorId = searchParams.get("instructorId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const reason = searchParams.get("reason");

    const blocks = await prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId: membership.companyId,
        ...(instructorId ? { instructorId } : {}),
        ...(reason ? { reason } : {}),
        ...(from || to
          ? {
              startsAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ success: true, data: blocks });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createInstructorBlock(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
