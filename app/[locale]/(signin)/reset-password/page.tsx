import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import Shell from '../auth-shell';
import ResetPasswordForm from './reset-password-form';

export const metadata: Metadata = {
  title: 'Recupera la password',
};

/**
 * Recupero password della web app (REG-485).
 *
 * Prima esisteva solo su mobile e il link nel login rimandava all'assistenza
 * del sito: chi entrava dal browser non aveva modo di rientrare. Il flusso è
 * lo stesso del mobile — codice via email, poi nuova password — perché la
 * logica è condivisa in `lib/auth/password-reset.ts`.
 */

const ResetPasswordPage = async (props: {
  searchParams: Promise<{ callbackUrl?: string; email?: string }>;
  params: Promise<{ locale: string }>;
}) => {
  const { callbackUrl, email } = await props.searchParams;
  const { locale } = await props.params;

  // Chi è già dentro non ha niente da recuperare: cambia password dal profilo.
  const session = await auth();
  if (session?.user?.id) {
    return redirect(locale ? `/${locale}` : '/');
  }

  return (
    <Shell locale={locale}>
      <h1 className="mb-3 text-[34px] font-bold leading-tight tracking-[-0.6px] text-[#1c1c1c]">
        Recupera la password
      </h1>
      <p className="mb-9 text-[15px] font-medium leading-relaxed text-[#6a6a6a]">
        Ti mandiamo un codice via email, poi scegli una password nuova.
      </p>

      <ResetPasswordForm
        locale={locale}
        callbackUrl={callbackUrl}
        initialEmail={email ?? ''}
      />

      <div className="mt-11 w-full text-center text-[13px] font-medium text-[#9a9a9a]">
        Ti sei ricordato la password?{' '}
        <Link
          href={`/${locale}/sign-in`}
          className="text-[14px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70"
        >
          Torna all&apos;accesso
        </Link>
      </div>
    </Shell>
  );
};

export default ResetPasswordPage;
