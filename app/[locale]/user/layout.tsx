import { requireUserAndCompany } from '@/lib/auth-guard';

export default async function UserLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  await requireUserAndCompany(locale);

  return <>{children}</>;
}
