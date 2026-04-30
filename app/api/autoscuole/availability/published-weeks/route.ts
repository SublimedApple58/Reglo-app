import { NextResponse } from "next/server";
import { formatError } from "@/lib/utils";
import {
  getInstructorPublishedWeeks,
  publishInstructorWeek,
  unpublishInstructorWeek,
} from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getInstructorPublishedWeeks({
      instructorId: searchParams.get("instructorId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await publishInstructorWeek(body);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const result = await unpublishInstructorWeek(body);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
