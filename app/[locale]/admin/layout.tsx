import { requireCompanyAdmin } from '@/lib/auth-guard';
import { AuthDataProvider } from '@/components/providers/auth-data.provider';
import { AutoscuoleShell } from '@/components/Layout/AutoscuoleShell';

export default async function AdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  await requireCompanyAdmin(locale);

  return (
    <AuthDataProvider>
      <AutoscuoleShell>{children}</AutoscuoleShell>
    </AuthDataProvider>
  );
}
