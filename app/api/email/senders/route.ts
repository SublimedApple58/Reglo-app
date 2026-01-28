import { NextResponse } from "next/server";
import { formatError } from "@/lib/utils";
import { VERIFIED_EMAIL_SENDERS } from "@/lib/constants";
import { getActiveCompanyContext } from "@/lib/company-context";

type SenderOption = {
  value: string;
  label: string;
};

export async function GET() {
  try {
    const { membership } = await getActiveCompanyContext();

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
