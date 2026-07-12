'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInWithCredentials } from '@/lib/actions/user.actions';
import { useSearchParams } from 'next/navigation';
import { PROTO_INPUT } from '@/components/ui/proto-styles';
import { LoadingDots } from '@/components/ui/loading-dots';

const CredentialsSignInForm = () => {
  const [data, action] = useActionState(signInWithCredentials, {
    success: false,
    message: '',
  });

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const SignInButton = () => {
    const { pending } = useFormStatus();
    return (
      <button
        type="submit"
        disabled={pending}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#222222] py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-70"
      >
        {pending ? <LoadingDots /> : "Accedi"}
      </button>
    );
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label htmlFor="email" className="mb-2 block text-xs font-semibold text-[#555555]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="nome@autoscuola.it"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={PROTO_INPUT}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-xs font-semibold text-[#555555]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={PROTO_INPUT}
        />
      </div>

      {data && !data.success && data.message && (
        <div className="rounded-[10px] border border-[#f0c9c0] bg-[#fdf3f1] px-3.5 py-2.5 text-sm font-medium text-[#c13515]">
          {data.message}
        </div>
      )}

      <div className="pt-1">
        <SignInButton />
      </div>

      <p className="pt-1 text-center text-sm font-medium text-[#6a6a6a]">
        Non hai ancora un account?{' '}
        <Link
          href={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          target="_self"
          className="font-semibold text-[#222222] underline underline-offset-2"
        >
          Registrati
        </Link>
      </p>
    </form>
  );
};

export default CredentialsSignInForm;
