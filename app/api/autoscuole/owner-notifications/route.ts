import { NextResponse } from "next/server";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";
import { formatError } from "@/lib/utils";
import {
  listAutoscuolaNotifications,
  markAutoscuolaNotificationsRead,
  deleteAutoscuolaNotifications,
} from "@/lib/autoscuole/notifications";

/**
 * Owner web bell/inbox — backed by the `AutoscuolaNotification` table (v1:
 * student lesson cancellations). Distinct from `/api/autoscuole/notifications`,
 * which is the mobile recovery feed derived from other tables.
 */

// Recent notifications + unread count (polled by the bell every ~25s).
export async function GET() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }
    const data = await listAutoscuolaNotifications(membership.companyId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}

// Mark all unread as read ("Segna tutte lette").
export async function POST() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }
    await markAutoscuolaNotificationsRead(membership.companyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}

// Delete all notifications ("cestino").
export async function DELETE() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }
    await deleteAutoscuolaNotifications(membership.companyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
