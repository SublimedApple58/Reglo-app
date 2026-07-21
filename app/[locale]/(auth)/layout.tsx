import Image from "next/image";
import Link from "next/link";

import { BrandCarousel } from "@/components/pages/Auth/BrandCarousel";

/**
 * Layout auth (redesign): colonna form a sinistra (logo in alto, contenuto
 * centrato max 400px) + pannello brand navy a destra con il carosello 3D
 * delle icone della top bar. Niente più blob/glassmorphism.
 */

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid min-h-svh w-full bg-white lg:grid-cols-2">
      {/* ── Colonna form ── */}
      <div className="flex min-h-svh flex-col">
        <div className="flex h-[72px] shrink-0 items-center px-6 lg:px-10">
          <Link href="/" className="inline-flex">
            <Image
              src="/images/nav/logo-reglo-tight.png"
              alt="Reglo"
              width={30}
              height={30}
              className="select-none object-contain"
            />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-20 pt-4">
          <div className="w-full max-w-[400px]">{children}</div>
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
          <BrandCarousel />
        </div>
      </div>
    </div>
  );
}
