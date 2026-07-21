import Image from 'next/image';
import { Metadata } from 'next';
import { Lock, Smartphone } from 'lucide-react';
import { auth } from '@/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { signOutUser } from '@/lib/actions/user.actions';

export const metadata: Metadata = {
  title: 'Accesso riservato',
};

const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'allievo',
  INSTRUCTOR: 'istruttore',
};

export default async function UnauthorizedPage() {
  // Personalizza (nome + ruolo) quando possibile, senza mai far fallire la pagina.
  let displayName: string | null = null;
  let roleLabel: string | null = null;

  const session = await auth().catch(() => null);
  displayName = session?.user?.name || session?.user?.email || null;

  try {
    const { membership } = await getActiveCompanyContext();
    roleLabel = ROLE_LABEL[membership.autoscuolaRole] ?? null;
  } catch {
    // multi-company / sessione anomala: restiamo sul copy generico
  }

  return (
    <div className="grid min-h-svh w-full bg-white lg:grid-cols-2">
      {/* ── Colonna contenuto ── */}
      <div className="flex min-h-svh flex-col">
        <div className="flex h-[72px] shrink-0 items-center px-6 lg:px-10">
          <Image
            src="/images/nav/logo-reglo-tight.png"
            alt="Reglo"
            width={30}
            height={30}
            className="select-none object-contain"
          />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-20 pt-4">
          <div className="w-full max-w-[400px]">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f4f5] text-[#3f3f46]">
              <Lock size={20} strokeWidth={2.2} aria-hidden />
            </div>

            <h1 className="text-[28px] font-bold tracking-[-0.4px] text-[#222222]">
              Accesso riservato
            </h1>

            <p className="mt-3 text-[15px] font-medium leading-relaxed text-[#6a6a6a]">
              La web app di Reglo è riservata ai{' '}
              <span className="font-semibold text-[#3f3f46]">titolari</span> e agli{' '}
              <span className="font-semibold text-[#3f3f46]">
                istruttori amministratori
              </span>
              .{' '}
              {roleLabel
                ? `Il tuo account (${roleLabel}) non ha i permessi per accedere da qui.`
                : 'Il tuo account non ha i permessi per accedere da qui.'}
            </p>

            {/* Rimando all'app mobile */}
            <div className="mt-6 flex items-start gap-3 rounded-[12px] border border-[#ececec] bg-[#fafafa] px-4 py-3.5">
              <span className="mt-0.5 text-[#3f3f46]">
                <Smartphone size={18} strokeWidth={2.1} aria-hidden />
              </span>
              <p className="text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
                Se sei un allievo o un istruttore, usa l&apos;app{' '}
                <span className="font-semibold text-[#3f3f46]">Reglo</span> per
                smartphone per gestire le tue guide.
              </p>
            </div>

            <form action={signOutUser} className="mt-8">
              <button
                type="submit"
                className="w-full cursor-pointer rounded-[10px] bg-[#222222] py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-black"
              >
                Esci
              </button>
            </form>

            {displayName && (
              <p className="mt-4 text-center text-[13px] font-medium text-[#9a9a9a]">
                Sei connesso come {displayName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Pannello brand ── */}
      <div className="hidden items-center justify-center overflow-hidden bg-[#1a1a2e] p-12 lg:flex">
        <div className="w-full max-w-[440px]">
          <h2 className="text-[26px] font-bold leading-snug tracking-[-0.4px] text-white">
            Gestisci la tua autoscuola
            <br />
            in un unico posto.
          </h2>
          <p className="mt-3 text-[15px] font-medium leading-relaxed text-white/60">
            Agenda guide, allievi, istruttori, rinnovi e segretaria vocale AI —
            tutto sotto controllo.
          </p>
        </div>
      </div>
    </div>
  );
}
