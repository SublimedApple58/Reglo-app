import type { ReactNode } from "react";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { BackofficeHeader } from "@/components/pages/Backoffice/BackofficeHeader";

export default async function BackofficeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireGlobalAdmin(locale);

  return (
    <div className="min-h-svh bg-gray-50/50">
      <BackofficeHeader />
      {children}
    </div>
  );
}
