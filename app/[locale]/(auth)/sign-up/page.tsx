import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Metadata } from 'next';
import Link from 'next/link';
import { RegloMark } from '@/components/ui/reglo-mark';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SignUpForm from './sign-up-form';
import { CalendarCheck, Car, Users } from 'lucide-react';

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
          <RegloMark size={44} />
          <div>
            <p className='text-sm font-semibold text-foreground'>Reglo</p>
            <p className='text-xs text-muted-foreground'>Autoscuole</p>
          </div>
        </Link>

        <div className='space-y-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground'>
            Inizia ora
          </p>
          <h1 className='text-3xl font-semibold text-foreground'>
            Digitalizza la tua autoscuola con Reglo.
          </h1>
          <p className='text-sm text-muted-foreground'>
            Agenda guide, gestione allievi, pagamenti automatici e segretaria vocale AI — tutto in un&apos;unica piattaforma.
          </p>
        </div>

        <div className='grid gap-3 sm:grid-cols-3'>
          {[
            { icon: Users, label: 'Allievi e istruttori' },
            { icon: CalendarCheck, label: 'Agenda smart' },
            { icon: Car, label: 'Flotta veicoli' },
          ].map((item) => (
            <div
              key={item.label}
              className='flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-muted-foreground'
            >
              <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-50'>
                <item.icon className='h-3.5 w-3.5 text-yellow-600' />
              </span>
              <span className='font-medium text-foreground'>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className='glass-panel glass-strong'>
        <CardHeader className='space-y-2'>
          <CardTitle className='text-center text-2xl text-foreground'>
            Crea account
          </CardTitle>
          <CardDescription className='text-center'>
            Crea il tuo account per gestire la tua autoscuola
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
