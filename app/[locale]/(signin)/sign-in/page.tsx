import { auth } from '@/auth';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import CredentialsSignInForm from './credentials-signin-form';
import Shell from '../auth-shell';
import { MARKETING_HOME_URL } from '../marketing-links';
import { prisma } from '@/db/prisma';
import { signOutUser } from '@/lib/actions/user.actions';

export const metadata: Metadata = {
  title: 'Accedi',
};

/**
 * Login (redesign allineato al sito marketing): colonna sinistra con logo e
 * form, colonna destra con la foto del team e il carosello recensioni.
 *
 * Il guscio a due colonne sta in `../auth-shell`, condiviso con il recupero
 * password e con la registrazione: le tre pagine pubbliche di accesso sono
 * una pagina sola con dentro form diversi.
 */

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
        <Shell locale={locale} withPanel={false}>
          <h1 className="text-[34px] font-bold leading-tight tracking-[-0.6px] text-[#1c1c1c]">
            Accesso non disponibile
          </h1>
          <p className="mt-3 text-[15px] font-medium leading-relaxed text-[#6a6a6a]">
            Il tuo account non è collegato ad alcuna autoscuola. Contatta il
            supporto oppure esci e accedi con un account diverso.
          </p>
          <form action={signOutUser} className="mt-9 w-full">
            <button
              type="submit"
              className="w-full cursor-pointer rounded-[12px] bg-black py-[15px] text-[15.5px] font-semibold text-white transition-colors hover:bg-[#1a1a1a]"
            >
              Esci
            </button>
          </form>
          <p className="mt-[22px] w-full text-center text-[14px] font-medium text-[#555555]">
            <Link
              href={`/${locale}/sign-up`}
              className="font-semibold text-[#222222] underline decoration-1 underline-offset-2"
            >
              Crea un nuovo account
            </Link>
          </p>
        </Shell>
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
    <Shell locale={locale}>
      <h1 className="mb-3 text-[34px] font-bold leading-tight tracking-[-0.6px] text-[#1c1c1c]">
        Bentornato su Reglo
      </h1>
      <p className="mb-9 text-[15px] font-medium text-[#6a6a6a]">
        Accedi per gestire la tua autoscuola.
      </p>

      <CredentialsSignInForm locale={locale} />

      <div className="mt-11 w-full text-center text-[13px] font-medium text-[#9a9a9a]">
        Non sei ancora cliente?{' '}
        <a
          href={MARKETING_HOME_URL}
          className="text-[14px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70"
        >
          Scopri Reglo
        </a>
      </div>
    </Shell>
  );
};

export default SignInPage;
