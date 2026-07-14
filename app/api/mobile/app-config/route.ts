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
 * so app version == runtimeVersion). Current floor: 2.0.0 on both platforms.
 */
const MIN_SUPPORTED_VERSION = {
  ios: "2.1.0",
  android: "2.1.0",
} as const;

export async function GET() {
  return NextResponse.json(
    { success: true, data: { minSupportedVersion: MIN_SUPPORTED_VERSION } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
