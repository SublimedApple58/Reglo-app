import { Metadata } from 'next';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SignUpForm from './sign-up-form';

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
    <div>
      <h1 className="text-[28px] font-bold tracking-[-0.4px] text-[#222222]">Crea il tuo account</h1>
      <p className="mt-2 text-[15px] font-medium text-[#6a6a6a]">
        Digitalizza la tua autoscuola con Reglo.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
    </div>
  );
};

export default SignUpPage;
