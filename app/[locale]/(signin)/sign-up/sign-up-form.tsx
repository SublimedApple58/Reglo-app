'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { signUpUser } from '@/lib/actions/user.actions';

import {
  FormError,
  INPUT_CLASS,
  LABEL_CLASS,
  LINK_CLASS,
  PasswordField,
  SubmitButton,
} from '../auth-form-ui';

/**
 * Form di registrazione, stessi mattoni del login (REG-487): input alti con
 * radius 12, bottone nero, occhio mostra/nascondi sulle password.
 *
 * Le etichette delle due password sono "Password" e **"Ripeti la password"**:
 * non una sottostringa dell'altra, altrimenti `getByLabel("Password")` dei
 * test risolverebbe due elementi.
 */

const SignUpForm = ({ locale }: { locale: string }) => {
  const [data, action] = useActionState(signUpUser, {
    success: false,
    message: '',
  });

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label htmlFor="companyName" className={LABEL_CLASS}>
        Nome autoscuola
      </label>
      <div className="mb-[18px]">
        <input
          id="companyName"
          name="companyName"
          type="text"
          autoComplete="organization"
          placeholder="Autoscuola Centrale"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <label htmlFor="name" className={LABEL_CLASS}>
        Nome e cognome
      </label>
      <div className="mb-[18px]">
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Mario Rossi"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <label htmlFor="email" className={LABEL_CLASS}>
        Email
      </label>
      <div className="mb-[18px]">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nome@autoscuola.it"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="mb-[18px] grid w-full gap-4 sm:grid-cols-2">
        <div>
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
        </div>
        <div>
          <PasswordField
            id="confirmPassword"
            label="Ripeti la password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
        </div>
      </div>

      {data && !data.success && data.message && <FormError>{data.message}</FormError>}

      <SubmitButton>Registrati</SubmitButton>

      <p className="mt-[22px] text-center text-[14px] font-medium text-[#555555]">
        Hai già un account?{' '}
        <Link
          href={`/${locale}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className={LINK_CLASS}
        >
          Accedi
        </Link>
      </p>
    </form>
  );
};

export default SignUpForm;
