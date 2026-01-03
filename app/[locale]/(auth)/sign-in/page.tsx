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

export const metadata: Metadata = {
  title: 'Sign In',
};

const SignInPage = async (props: {
  searchParams: Promise<{
    callbackUrl: string;
  }>;
}) => {
  const { callbackUrl } = await props.searchParams;

  const session = await auth();

  if (session) {
    return redirect(callbackUrl || '/');
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
              className='rounded-2xl border bg-white/80 px-4 py-3 shadow-sm'
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
              className='flex items-center gap-3 rounded-xl border bg-white/70 px-3 py-2 text-sm text-muted-foreground'
            >
              <item.icon className='h-4 w-4 text-[#324e7a]' />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className='border-border/70 bg-white/90 shadow-xl'>
        <CardHeader className='space-y-2'>
          <CardTitle className='text-center text-2xl text-[#324e7a]'>
            {translation('title')}
          </CardTitle>
          <CardDescription className='text-center'>
            Sign in to continue to your workspace
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
