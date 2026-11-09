import { NextResponse } from "next/server";
import { listExamExaminerSuggestions } from "@/lib/actions/autoscuole.actions";

/** REG-640: nomi di esaminatori già usati dall'autoscuola, il più recente prima. */
export async function GET() {
  const result = await listExamExaminerSuggestions();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
