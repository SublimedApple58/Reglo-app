'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { signUpUser } from '@/lib/actions/user.actions';
import { useSearchParams } from 'next/navigation';

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
      <Button disabled={pending} className='w-full' variant='default'>
        {pending ? 'Submitting...' : 'Sign Up'}
      </Button>
    );
  };

  return (
    <form action={action}>
      <input type='hidden' name='callbackUrl' value={callbackUrl} />
      <div className='space-y-6'>
        <div>
          <Label htmlFor='companyName' style={{marginBottom: 8}}>Company name</Label>
          <Input
            id='companyName'
            name='companyName'
            type='text'
            autoComplete='organization'
            placeholder='Acme Srl'
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor='name' style={{marginBottom: 8}}>Name</Label>
          <Input
            id='name'
            name='name'
            type='text'
            autoComplete='name'
            placeholder='Mario Rossi'
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor='email' style={{marginBottom: 8}}>Email</Label>
          <Input
            id='email'
            name='email'
            type='email'
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
          autoComplete='new-password'
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        </div>
        <div>
          <Label htmlFor='confirmPassword' style={{marginBottom: 8}}>Confirm Password</Label>
        <Input
          id='confirmPassword'
          name='confirmPassword'
          type='password'
          required
          autoComplete='new-password'
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        </div>
        <div>
          <SignUpButton />
        </div>

        {data && !data.success && data.message && (
          <div className='rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive'>
            {data.message}
          </div>
        )}

        <div className='text-sm text-center text-muted-foreground'>
          Already have an account?{' '}
          <Link
            href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            target='_self'
            className='link'
          >
            Sign In
          </Link>
        </div>
      </div>
    </form>
  );
};

export default SignUpForm;
