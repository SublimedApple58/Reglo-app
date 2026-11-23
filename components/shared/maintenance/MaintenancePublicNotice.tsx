import Image from "next/image";

/**
 * REG-773 — avviso per le pagine pubbliche (QR istruttore) di un'autoscuola in
 * manutenzione per tutti. Testo neutro, come la schermata dell'account.
 */
export function MaintenancePublicNotice({ companyName }: { companyName: string }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-6 pb-16">
      <div className="w-full max-w-[420px] text-center">
        <Image
          src="/images/3d/barriera-3d.png"
          alt=""
          width={160}
          height={160}
          priority
          className="mx-auto mb-4 size-[150px] select-none object-contain duration-300 ease-out animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3"
        />
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.4px] text-[#222222]">
          {companyName} è in manutenzione
        </h1>
        <p className="mt-3 text-base font-medium leading-relaxed text-[#6a6a6a]">
          L&apos;app tornerà disponibile il prima possibile.
        </p>
      </div>
    </div>
  );
}
