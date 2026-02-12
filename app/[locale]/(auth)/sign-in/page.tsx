import { auth } from '@/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { APP_NAME } from '@/lib/constants';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import CredentialsSignInForm from './credentials-signin-form';
import { Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { prisma } from '@/db/prisma';
import { signOutUser } from '@/lib/actions/user.actions';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Sign In',
};

const SignInPage = async (props: {
  searchParams: Promise<{
    callbackUrl: string;
  }>;
  params: Promise<{ locale: string }>;
}) => {
  const { callbackUrl } = await props.searchParams;
  const { locale } = await props.params;

  const session = await auth();

  if (session?.user?.id) {
    const [user, memberships] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { activeCompanyId: true },
      }),
      prisma.companyMember.findMany({
        where: { userId: session.user.id },
        select: { companyId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!memberships.length) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="glass-panel glass-strong max-w-lg">
            <CardHeader className="space-y-2">
              <CardTitle className="text-center text-2xl text-[#324e7a]">
                Accesso non disponibile
              </CardTitle>
              <CardDescription className="text-center">
                Il tuo account non è collegato ad alcuna company. Contatta il
                supporto oppure esci e accedi con un account diverso.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <form action={signOutUser} className="w-full">
                <Button type="submit" className="w-full">
                  Esci
                </Button>
              </form>
              <Link
                href={`/${locale}/sign-up`}
                className="text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Crea un nuovo account
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (!user?.activeCompanyId && memberships.length > 1) {
      const selectPath = locale ? `/${locale}/select-company` : '/select-company';
      return redirect(selectPath);
    }

    if (!user?.activeCompanyId && memberships.length === 1) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeCompanyId: memberships[0].companyId },
      });
    }

    const fallbackPath = locale ? `/${locale}` : '/';
    const safeCallback =
      callbackUrl &&
      !callbackUrl.includes('/sign-in') &&
      !callbackUrl.includes('/sign-up')
        ? callbackUrl
        : fallbackPath;

    return redirect(safeCallback);
  }
  const translation = await getTranslations('SignInPage'); // or useTranslations for client components

  return (
    <div className='grid w-full items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]'>
      <div className='space-y-6'>
        <Link href='/' className='inline-flex items-center gap-3'>
          <span className='flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f2f2] shadow-md overflow-hidden'>
            <Image
              src='/images/R_logo.png'
              width={60}
              height={60}
              alt={`${APP_NAME} logo`}
              priority
              className='h-full w-full object-cover'
            />
          </span>
          <div>
            <p className='text-sm font-semibold text-[#324e7a]'>Reglo</p>
            <p className='text-xs text-muted-foreground'>Workspace Suite</p>
          </div>
        </Link>

        <div className='space-y-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground'>
            Welcome back
          </p>
          <h1 className='text-3xl font-semibold text-[#324e7a]'>
            Entra in Reglo e riprendi il flusso.
          </h1>
          <p className='text-sm text-muted-foreground'>
            Tutti i workflow, i documenti e i costi in un&apos;unica dashboard
            pronta a ripartire con te.
          </p>
        </div>

        <div className='grid gap-3 sm:grid-cols-3'>
          {[
            { label: 'Automazioni', value: 'Workflow pronti' },
            { label: 'Doc Manager', value: 'Firma + invio rapidi' },
            { label: 'Billing', value: 'Consumi sotto controllo' },
          ].map((item) => (
            <div
              key={item.label}
              className='glass-card px-4 py-3'
            >
              <p className='text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
                {item.label}
              </p>
              <p className='text-sm font-semibold text-[#324e7a]'>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className='grid gap-3 sm:grid-cols-3'>
          {[
            { icon: Zap, label: 'Setup veloce' },
            { icon: ShieldCheck, label: 'Sicurezza by design' },
            { icon: Sparkles, label: 'Esperienza su misura' },
          ].map((item) => (
            <div
              key={item.label}
              className='glass-card flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground'
            >
              <item.icon className='h-4 w-4 text-[#324e7a]' />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className='glass-panel glass-strong'>
        <CardHeader className='space-y-2'>
          <CardTitle className='text-center text-2xl text-[#324e7a]'>
            {translation('title')}
          </CardTitle>
          <CardDescription className='text-center'>
            Accedi per entrare nel tuo workspace
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <CredentialsSignInForm />
        </CardContent>
      </Card>
    </div>
  );
};

export default SignInPage;
