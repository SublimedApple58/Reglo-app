'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { signInWithCredentials } from '@/lib/actions/user.actions';
import { useSearchParams } from 'next/navigation';

import {
  FormError,
  INPUT_CLASS,
  LABEL_CLASS,
  LINK_CLASS,
  PasswordField,
  SubmitButton,
} from '../auth-form-ui';

const CredentialsSignInForm = ({ locale }: { locale: string }) => {
  const [data, action] = useActionState(signInWithCredentials, {
    success: false,
    message: '',
  });

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

      <div className="mb-2.5">
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
      </div>

      <div className="mb-[26px]">
        {/* Il recupero è una pagina vera della web app dal REG-485: prima
            questo link portava all'assistenza del sito marketing. */}
        <Link
          href={`/${locale}/reset-password${
            email ? `?email=${encodeURIComponent(email)}` : ''
          }`}
          className={LINK_CLASS}
        >
          Recupera la password
        </Link>
      </div>

      {data && !data.success && data.message && <FormError>{data.message}</FormError>}

      <SubmitButton>Accedi</SubmitButton>

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
