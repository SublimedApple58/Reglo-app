import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  InstructorLinkInvalid,
  InstructorLinkLanding,
} from "@/components/pages/InstructorLink/InstructorLinkLanding";
import { instructorInitials, normalizeInstructorCode } from "@/lib/autoscuole/instructor-initials";
import { resolveInstructorCode } from "@/lib/autoscuole/instructor-link";
import { appOpenUrl, detectMobilePlatform } from "@/lib/autoscuole/instructor-link-deeplink";

// REG-451 — destinazione del QR della card istruttore. Pubblica (middleware):
// la apre la fotocamera del telefono, anche senza app o sessione web.
export const metadata: Metadata = {
  title: "Associati al tuo istruttore · Reglo",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function InstructorLinkRoute({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { code: rawCode } = await params;
  const resolved = await resolveInstructorCode(rawCode);
  if (!resolved) {
    const shown = normalizeInstructorCode(rawCode) ?? decodeURIComponent(rawCode).toUpperCase().slice(0, 12);
    return <InstructorLinkInvalid code={shown} />;
  }

  const platform = detectMobilePlatform((await headers()).get("user-agent"));
  return (
    <InstructorLinkLanding
      code={resolved.code}
      instructorName={resolved.instructorName}
      initials={instructorInitials(resolved.instructorName)}
      companyName={resolved.companyName}
      openUrl={appOpenUrl(resolved.code, platform)}
      platform={platform}
    />
  );
}
