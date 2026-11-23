import Image from 'next/image';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getActiveCompanyContextUnchecked } from '@/lib/company-context';
import { isMemberBlockedByMaintenance } from '@/lib/maintenance';
import { endImpersonation, signOutUser } from '@/lib/actions/user.actions';

export const metadata: Metadata = {
  title: 'In manutenzione',
};

const SUPPORT_EMAIL = 'support@reglo.it';

/**
 * REG-773 — schermata dell'account in manutenzione (web). Il testo è quello di
 * una manutenzione tecnica neutra: non deve MAI far capire che l'ha chiesta il
 * titolare, né l'ambito scelto. Vedi docs/features/maintenance-mode.md.
 *
 * Il backoffice in impersonazione vede la stessa schermata; al posto di «Esci»
 * ha «Termina impersonazione», che lo riporta al backoffice.
 */
export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  let context: Awaited<ReturnType<typeof getActiveCompanyContextUnchecked>>;
  try {
    context = await getActiveCompanyContextUnchecked();
  } catch {
    redirect(`/${locale}/sign-in`);
  }
  const { company, membership, session } = context;
  const blocked = isMemberBlockedByMaintenance(
    company.maintenanceScope,
    membership.autoscuolaRole,
  );
  const impersonating = Boolean(session?.impersonation);
  // Non (più) in manutenzione: niente schermata, si torna all'app.
  if (!blocked) redirect(`/${locale}/user/autoscuole`);
  const companyName = company.name;

  return (
    <div className="flex min-h-svh w-full flex-col bg-white">
      <header className="flex h-[72px] shrink-0 items-center justify-between px-6 lg:px-10">
        <Image
          src="/images/nav/logo-reglo-tight.png"
          alt="Reglo"
          width={30}
          height={30}
          className="select-none object-contain"
        />
        <form action={impersonating ? endImpersonation.bind(null, locale) : signOutUser}>
          <button
            type="submit"
            data-testid={impersonating ? 'maintenance-end-impersonation' : 'maintenance-sign-out'}
            className="reglo-focus-ring h-10 cursor-pointer rounded-full border border-black/[0.08] bg-white px-[18px] text-sm font-semibold text-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.16)] transition-transform duration-200 ease-out active:scale-[0.98]"
          >
            {impersonating ? 'Termina impersonazione' : 'Esci'}
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-[480px] text-center">
          <Image
            src="/images/3d/barriera-3d.png"
            alt=""
            width={200}
            height={200}
            priority
            className="mx-auto mb-5 size-[168px] select-none object-contain duration-300 ease-out animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3 sm:size-[200px]"
          />
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.5px] text-[#222222] duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2 sm:text-[34px]">
            {companyName} è in manutenzione
          </h1>
          <p className="mt-3.5 text-[16px] font-medium leading-relaxed text-[#6a6a6a] duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2 sm:text-[17px]">
            L&apos;account è temporaneamente in manutenzione e tornerà disponibile il prima possibile.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-9 flex h-[54px] w-full items-center justify-center rounded-full bg-[#1e1e1e] text-base font-semibold text-white shadow-[0_14px_24px_-10px_rgba(0,0,0,0.5),inset_0_3px_4px_rgba(255,255,255,0.34),inset_0_-8px_13px_rgba(0,0,0,0.8)] transition-transform duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-2 active:scale-[0.98]"
          >
            Scrivi al supporto
          </a>
          <p className="mt-5 text-[13px] font-medium text-[#8a8a8a]">{SUPPORT_EMAIL}</p>
        </div>
      </main>
    </div>
  );
}
