import { NextResponse } from "next/server";

// Always fresh — a toggle must take effect on the next app launch, not after a
// CDN cache expires.
export const dynamic = "force-dynamic";

/**
 * Minimum supported mobile app version, per platform.
 *
 * THE FORCE-UPDATE SWITCH. The mobile app fetches this on launch (pre-login) and
 * shows a blocking "update required" screen if its own version is lower. To force
 * everyone below a version to update, bump the value here and deploy (push to
 * main → Vercel). Works for BOTH iOS and Android.
 *
 * Versions are the marketing/app version (runtimeVersion policy is "appVersion",
 * so app version == runtimeVersion). Current floor: 2.4.2 on both platforms
 * (raised from 2.3.0 on 2026-11-07, once 2.4.2 was live on App Store and Play →
 * force every older user to update; before that: 2.2.0 → 2.3.0 on 2026-09-16).
 */
const MIN_SUPPORTED_VERSION = {
  ios: "2.4.2",
  android: "2.4.2",
} as const;

export async function GET() {
  return NextResponse.json(
    { success: true, data: { minSupportedVersion: MIN_SUPPORTED_VERSION } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
