import SideBarWrapper from '@/components/Layout/SideBarWrapper';
import { requireCompanyAdmin } from '@/lib/auth-guard';

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
    <>
      <SideBarWrapper>{children}</SideBarWrapper>
    </>
  );
}
