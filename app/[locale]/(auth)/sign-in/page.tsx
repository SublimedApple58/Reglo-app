import { auth } from '@/auth';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import CredentialsSignInForm from './credentials-signin-form';
import { prisma } from '@/db/prisma';
import { signOutUser } from '@/lib/actions/user.actions';

export const metadata: Metadata = {
  title: 'Sign In',
};

const SignInPage = async (props: {
  searchParams: Promise<{
    callbackUrl: string;
  }>;
  params: Promise<{ locale: string }>;
}) => {
  const { callbackUrl } = await props.searchParams;
  const { locale } = await props.params;

  const session = await auth();

  if (session?.user?.id) {
    const [user, memberships] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { activeCompanyId: true },
      }),
      prisma.companyMember.findMany({
        where: { userId: session.user.id },
        select: { companyId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!memberships.length) {
      return (
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.4px] text-[#222222]">
            Accesso non disponibile
          </h1>
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-[#6a6a6a]">
            Il tuo account non è collegato ad alcuna autoscuola. Contatta il
            supporto oppure esci e accedi con un account diverso.
          </p>
          <form action={signOutUser} className="mt-8">
            <button
              type="submit"
              className="w-full cursor-pointer rounded-[10px] bg-black py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#1a1a1a]"
            >
              Esci
            </button>
          </form>
          <p className="mt-6 text-center text-sm font-medium text-[#6a6a6a]">
            <Link
              href={`/${locale}/sign-up`}
              className="font-semibold text-[#222222] underline underline-offset-2"
            >
              Crea un nuovo account
            </Link>
          </p>
        </div>
      );
    }

    if (memberships.length > 1) {
      const selectPath = locale ? `/${locale}/select-company` : '/select-company';
      return redirect(selectPath);
    }

    if (!user?.activeCompanyId && memberships.length === 1) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeCompanyId: memberships[0].companyId },
      });
    }

    const fallbackPath = locale ? `/${locale}` : '/';
    const safeCallback =
      callbackUrl &&
      !callbackUrl.includes('/sign-in') &&
      !callbackUrl.includes('/sign-up')
        ? callbackUrl
        : fallbackPath;

    return redirect(safeCallback);
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-[-0.4px] text-[#222222]">Bentornato</h1>
      <p className="mt-2 text-[15px] font-medium text-[#6a6a6a]">
        Accedi per gestire la tua autoscuola.
      </p>
      <div className="mt-8">
        <CredentialsSignInForm />
      </div>
    </div>
  );
};

export default SignInPage;
