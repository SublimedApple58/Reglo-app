import { requireCompanyAdmin } from '@/lib/auth-guard';

export default async function UserLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // La web app è riservata a titolari e istruttori amministratori
  // (OWNER / INSTRUCTOR_OWNER). Allievi e istruttori "semplici" vengono
  // mandati alla schermata /unauthorized (usano l'app mobile).
  await requireCompanyAdmin(locale);

  return <>{children}</>;
}
