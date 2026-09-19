import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import Shell from '../auth-shell';
import { MARKETING_HOME_URL } from '../marketing-links';
import SignUpForm from './sign-up-form';

export const metadata: Metadata = {
  title: 'Crea il tuo account',
};

/**
 * Registrazione (REG-487): stessa pagina del login, cambiato il form.
 *
 * Prima viveva nel route group `(auth)` con un pannello nero e il carosello
 * 3D: due pagine di accesso che sembravano due prodotti diversi. Ora usa il
 * guscio condiviso `auth-shell` — foto del team e recensioni, come nel login e
 * come sul sito marketing, da cui arriva chi si registra.
 */

const SignUpPage = async (props: {
  searchParams: Promise<{ callbackUrl?: string }>;
  params: Promise<{ locale: string }>;
}) => {
  const { callbackUrl } = await props.searchParams;
  const { locale } = await props.params;

  const session = await auth();
  if (session) {
    return redirect(callbackUrl || (locale ? `/${locale}` : '/'));
  }

  return (
    <Shell locale={locale}>
      <h1 className="mb-3 text-[34px] font-bold leading-tight tracking-[-0.6px] text-[#1c1c1c]">
        Crea il tuo account
      </h1>
      <p className="mb-9 text-[15px] font-medium text-[#6a6a6a]">
        Digitalizza la tua autoscuola con Reglo.
      </p>

      <SignUpForm locale={locale} />

      <div className="mt-11 w-full text-center text-[13px] font-medium text-[#9a9a9a]">
        Vuoi prima dare un&apos;occhiata?{' '}
        <a
          href={MARKETING_HOME_URL}
          className="text-[14px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70"
        >
          Scopri Reglo
        </a>
      </div>
    </Shell>
  );
};

export default SignUpPage;
