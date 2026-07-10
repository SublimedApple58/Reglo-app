'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { signUpUser } from '@/lib/actions/user.actions';
import { useSearchParams } from 'next/navigation';
import { PROTO_INPUT } from '@/components/ui/proto-styles';

const FIELD_LABEL = 'mb-2 block text-xs font-semibold text-[#555555]';

const SignUpForm = () => {
  const [data, action] = useActionState(signUpUser, {
    success: false,
    message: '',
  });
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const SignUpButton = () => {
    const { pending } = useFormStatus();
    return (
      <button
        type="submit"
        disabled={pending}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-black py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#1a1a1a] disabled:opacity-70"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Registrati
      </button>
    );
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label htmlFor="companyName" className={FIELD_LABEL}>
          Nome autoscuola
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          autoComplete="organization"
          placeholder="Autoscuola Centrale"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          className={PROTO_INPUT}
        />
      </div>
      <div>
        <label htmlFor="name" className={FIELD_LABEL}>
          Nome e cognome
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Mario Rossi"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={PROTO_INPUT}
        />
      </div>
      <div>
        <label htmlFor="email" className={FIELD_LABEL}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nome@autoscuola.it"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={PROTO_INPUT}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className={FIELD_LABEL}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={PROTO_INPUT}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={FIELD_LABEL}>
            Conferma password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={PROTO_INPUT}
          />
        </div>
      </div>

      {data && !data.success && data.message && (
        <div className="rounded-[10px] border border-[#f0c9c0] bg-[#fdf3f1] px-3.5 py-2.5 text-sm font-medium text-[#c13515]">
          {data.message}
        </div>
      )}

      <div className="pt-1">
        <SignUpButton />
      </div>

      <p className="pt-1 text-center text-sm font-medium text-[#6a6a6a]">
        Hai già un account?{' '}
        <Link
          href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          target="_self"
          className="font-semibold text-[#222222] underline underline-offset-2"
        >
          Accedi
        </Link>
      </p>
    </form>
  );
};

export default SignUpForm;
