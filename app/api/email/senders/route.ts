import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { VERIFIED_EMAIL_SENDERS } from "@/lib/constants";

type SenderOption = {
  value: string;
  label: string;
};

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Utente non autenticato" },
        { status: 401 },
      );
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "Company non trovata" },
        { status: 404 },
      );
    }

    if (membership.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Solo gli admin possono visualizzare i mittenti" },
        { status: 403 },
      );
    }

    const senders = VERIFIED_EMAIL_SENDERS.map((sender) => ({
      value: sender,
      label: sender,
    }));

    return NextResponse.json({ success: true, data: senders });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 500 },
    );
  }
}
