import Image from 'next/image';
import Link from 'next/link';

import ReviewPanel from './review-panel';

/**
 * Guscio delle pagine pubbliche di accesso: colonna sinistra con logo e
 * contenuto, colonna destra con la foto del team e il carosello recensioni.
 *
 * Nato con il login (redesign allineato al sito marketing, 2026-09-17) ed
 * estratto quando il recupero password ha avuto bisogno della stessa pagina:
 * chi arriva dal login non deve accorgersi di aver cambiato schermata.
 *
 * `withPanel={false}` per gli stati di servizio (es. "account senza
 * autoscuola"), dove il pannello recensioni sarebbe fuori luogo.
 */

const SHELL_CLASS = 'flex min-h-svh w-full bg-white';
const LEFT_COLUMN_CLASS =
  'flex min-w-0 flex-1 flex-col bg-white px-6 py-7 sm:px-10 lg:px-10';

const AuthShell = ({
  locale,
  children,
  withPanel = true,
}: {
  locale: string;
  children: React.ReactNode;
  withPanel?: boolean;
}) => (
  <div className={SHELL_CLASS}>
    <div className={LEFT_COLUMN_CLASS}>
      <Link href={`/${locale}`} className="inline-flex self-start">
        <Image
          src="/images/nav/logo-reglo-tight.png"
          alt="Reglo"
          width={28}
          height={28}
          className="h-7 w-auto select-none object-contain"
          priority
        />
      </Link>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-[460px] flex-col items-start text-left">
          {children}
        </div>
      </div>
    </div>

    {withPanel && (
      <div className="hidden min-w-0 flex-[1.05] bg-white p-[14px] pl-0 lg:flex">
        <ReviewPanel />
      </div>
    )}
  </div>
);

export default AuthShell;
