'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInWithCredentials } from '@/lib/actions/user.actions';
import { useSearchParams } from 'next/navigation';

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
      <Button disabled={pending} className='w-full' variant='default'>
        {pending ? 'Accesso...' : 'Accedi'}
      </Button>
    );
  };

  return (
    <form action={action} className='space-y-6'>
      <input type='hidden' name='callbackUrl' value={callbackUrl} />
      <div>
        <Label htmlFor='email' style={{marginBottom: 8}}>Email</Label>
        <Input
          id='email'
          name='email'
          type='email'
          required
          autoComplete='email'
          placeholder='you@company.com'
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor='password' style={{marginBottom: 8}}>Password</Label>
        <Input
          id='password'
          name='password'
          type='password'
          required
          autoComplete='current-password'
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div>
        <SignInButton />
      </div>

      {data && !data.success && data.message && (
        <div className='rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive'>
          {data.message}
        </div>
      )}

      <div className='text-sm text-center text-muted-foreground'>
        Non hai ancora un account?{' '}
        <Link
          href={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          target='_self'
          className='link'
        >
          Registrati
        </Link>
      </div>
    </form>
  );
};

export default CredentialsSignInForm;
