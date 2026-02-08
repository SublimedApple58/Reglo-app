import { NextResponse } from "next/server";
import { getWaitlistOffers } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const res = await getWaitlistOffers({
    studentId: studentId ?? "",
    limit,
  });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
