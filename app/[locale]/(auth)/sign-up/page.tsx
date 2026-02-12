import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { APP_NAME } from '@/lib/constants';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SignUpForm from './sign-up-form';
import { FileText, Sparkles, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sign Up',
};

const SignUpPage = async (props: {
  searchParams: Promise<{
    callbackUrl: string;
  }>;
}) => {
  const { callbackUrl } = await props.searchParams;

  const session = await auth();

  if (session) {
    return redirect(callbackUrl || '/');
  }

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
            Welcome to Reglo
          </p>
          <h1 className='text-3xl font-semibold text-[#324e7a]'>
            Crea il tuo workspace e porta l&apos;automazione al livello successivo.
          </h1>
          <p className='text-sm text-muted-foreground'>
            Workflow modulari, documenti sempre allineati e insight sui costi in
            tempo reale.
          </p>
        </div>

        <div className='grid gap-3 sm:grid-cols-3'>
          {[
            { icon: Users, label: 'Team pronti' },
            { icon: FileText, label: 'Doc smart' },
            { icon: Sparkles, label: 'AI assistita' },
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
            Crea account
          </CardTitle>
          <CardDescription className='text-center'>
            Inserisci i tuoi dati per iniziare a usare Reglo
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <SignUpForm />
        </CardContent>
      </Card>
    </div>
  );
};

export default SignUpPage;
