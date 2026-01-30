import type { ReactNode } from "react";
import { requireGlobalAdmin } from "@/lib/auth-guard";

export default async function BackofficeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireGlobalAdmin(locale);

  return <div className="min-h-svh bg-background">{children}</div>;
}
