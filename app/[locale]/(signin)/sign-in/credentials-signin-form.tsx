'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInWithCredentials } from '@/lib/actions/user.actions';
import { useSearchParams } from 'next/navigation';
import { LoadingDots } from '@/components/ui/loading-dots';
import { MARKETING_SUPPORT_URL } from './marketing-links';

/** Link testuale sottolineato, stile del design marketing. */
const LINK_CLASS =
  'text-[14px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70';

const INPUT_CLASS =
  'w-full rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-4 py-[14px] text-[15px] font-medium text-[#222222] outline-none transition-colors placeholder:font-medium placeholder:text-[#b0b0b0] hover:border-[#bbbbbb] focus:border-[#222222]';

const LABEL_CLASS = 'mb-[7px] block text-[13.5px] font-semibold text-[#444444]';

const EyeIcon = ({ crossed }: { crossed: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    {crossed && (
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    )}
  </svg>
);

const CredentialsSignInForm = ({ locale }: { locale: string }) => {
  const [data, action] = useActionState(signInWithCredentials, {
    success: false,
    message: '',
  });

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const SignInButton = () => {
    const { pending } = useFormStatus();
    return (
      <button
        type="submit"
        disabled={pending}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-black py-[15px] text-[15.5px] font-semibold text-white transition-colors hover:bg-[#1a1a1a] disabled:opacity-70"
      >
        {pending ? <LoadingDots /> : 'Accedi'}
      </button>
    );
  };

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label htmlFor="email" className={LABEL_CLASS}>
        Email
      </label>
      <div className="mb-[18px]">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="info@scuolaguidamontreal.it"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <label htmlFor="password" className={LABEL_CLASS}>
        Password
      </label>
      <div className="relative mb-2.5">
        <input
          id="password"
          name="password"
          type={passwordVisible ? 'text' : 'password'}
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${INPUT_CLASS} pr-[46px] tracking-[2px]`}
        />
        <button
          type="button"
          onClick={() => setPasswordVisible((visible) => !visible)}
          // Niente "password" nell'aria-label: getByLabel("Password") deve
          // continuare a risolvere solo l'input (vedi tests/e2e/login-stato-client).
          aria-label={passwordVisible ? 'Nascondi i caratteri' : 'Mostra i caratteri'}
          className="absolute right-[14px] top-1/2 flex -translate-y-1/2 cursor-pointer items-center text-[#b0b0b0] transition-colors hover:text-[#777777]"
        >
          <EyeIcon crossed={passwordVisible} />
        </button>
      </div>

      <div className="mb-[26px]">
        <a href={MARKETING_SUPPORT_URL} className={LINK_CLASS}>
          Recupera la password
        </a>
      </div>

      {data && !data.success && data.message && (
        <div className="mb-4 rounded-[12px] border border-[#f0c9c0] bg-[#fdf3f1] px-4 py-3 text-sm font-medium text-[#c13515]">
          {data.message}
        </div>
      )}

      <SignInButton />

      <p className="mt-[22px] text-center text-[14px] font-medium text-[#555555]">
        Non hai ancora un account?{' '}
        <Link
          href={`/${locale}/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className={LINK_CLASS}
        >
          Registrati
        </Link>
      </p>
    </form>
  );
};

export default CredentialsSignInForm;
