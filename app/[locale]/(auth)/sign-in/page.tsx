import { auth } from '@/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { RegloMark } from '@/components/ui/reglo-mark';
import { redirect } from 'next/navigation';
import CredentialsSignInForm from './credentials-signin-form';
import { CalendarCheck, Car, Users, Phone } from 'lucide-react';
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
              <CardTitle className="text-center text-2xl text-foreground">
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

    if (memberships.length > 1) {
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
          <RegloMark size={44} />
          <div>
            <p className='text-sm font-semibold text-foreground'>Reglo</p>
            <p className='text-xs text-muted-foreground'>Autoscuole</p>
          </div>
        </Link>

        <div className='space-y-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground'>
            Bentornato
          </p>
          <h1 className='text-3xl font-semibold text-foreground'>
            Gestisci la tua autoscuola in un unico posto.
          </h1>
          <p className='text-sm text-muted-foreground'>
            Agenda guide, allievi, istruttori, pagamenti e segretaria vocale AI — tutto sotto controllo.
          </p>
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          {[
            { label: 'Agenda', value: 'Guide e appuntamenti', icon: CalendarCheck },
            { label: 'Allievi', value: 'Anagrafica e crediti', icon: Users },
            { label: 'Veicoli', value: 'Disponibilità e flotta', icon: Car },
            { label: 'Segretaria AI', value: 'Risponde per te', icon: Phone },
          ].map((item) => (
            <div
              key={item.label}
              className='flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3'
            >
              <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-yellow-50'>
                <item.icon className='h-4 w-4 text-yellow-600' />
              </span>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
                  {item.label}
                </p>
                <p className='text-sm font-medium text-foreground'>
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card className='glass-panel glass-strong'>
        <CardHeader className='space-y-2'>
          <CardTitle className='text-center text-2xl text-foreground'>
            {translation('title')}
          </CardTitle>
          <CardDescription className='text-center'>
            Accedi per gestire la tua autoscuola
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
