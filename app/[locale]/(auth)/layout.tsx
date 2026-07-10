import Image from "next/image";
import Link from "next/link";

/**
 * Layout auth (redesign): colonna form a sinistra (logo in alto, contenuto
 * centrato max 400px) + pannello brand navy a destra con le icone 3D della
 * top bar. Niente più blob/glassmorphism.
 */

const BRAND_TILES = [
  { src: "/images/nav/agenda-3d.png", label: "Agenda" },
  { src: "/images/nav/allievi-3d.png", label: "Allievi" },
  { src: "/images/nav/segretaria-3d.png", label: "Segretaria AI" },
  { src: "/images/nav/rinnovi-3d.png", label: "Rinnovi" },
] as const;

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
      <div className="hidden items-center justify-center bg-[#1a1a2e] p-12 lg:flex">
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
          <div className="mt-10 grid grid-cols-2 gap-3.5">
            {BRAND_TILES.map((tile) => (
              <div
                key={tile.label}
                className="flex flex-col items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.06] px-6 py-7"
              >
                <Image
                  src={tile.src}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 select-none object-contain"
                />
                <span className="text-[13px] font-semibold text-white/85">{tile.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
