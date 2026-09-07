"use client";

import React from "react";
import Image from "next/image";

/**
 * Pane Impostazioni → "Fatturazione e pagamenti" (SOLO account consorzio).
 * Placeholder 1:1 dal prototipo Consorzi.html (misure via computed styles:
 * logo card 78px radius 20 ombra 0 6px 18px, titolo 21/700 -0.3px, paragrafo
 * 14.5/500 lh 1.65 max 450px, box grigio #f7f7f9 radius 14) — con il partner
 * aggiornato da TeamSystem a FATTURE IN CLOUD su richiesta di Tiziano
 * (logo ufficiale in public/images/brand/fatture-in-cloud.png).
 * L'integrazione vera (guide certificate → fatture automatiche) è la fase
 * successiva del piano consorzio. Vedi docs/features/consorzio.md.
 */
export function ConsorzioFatturazionePane() {
  return (
    <div className="flex flex-col items-center pt-[96px] text-center [line-height:normal]">
      <div className="flex items-center gap-[26px]">
        <div className="flex h-[78px] w-[78px] items-center justify-center rounded-[20px] border border-[#e6e6e6] bg-white shadow-[0_6px_18px_rgba(20,20,30,0.07)]">
          <Image
            src="/images/nav/logo-reglo-tight.png"
            alt="Reglo"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
        </div>
        <span className="text-[20px] font-medium text-[#c0c0c0]">×</span>
        <div className="flex h-[78px] w-[78px] items-center justify-center rounded-[20px] border border-[#e6e6e6] bg-white shadow-[0_6px_18px_rgba(20,20,30,0.07)]">
          <Image
            src="/images/brand/fatture-in-cloud.png"
            alt="Fatture in Cloud"
            width={44}
            height={44}
            className="h-11 w-11 rounded-[10px] object-contain"
          />
        </div>
      </div>

      <h3 className="mt-7 text-[21px] font-bold tracking-[-0.3px] text-[#222222]">
        Reglo × Fatture in Cloud
      </h3>
      <p className="mt-[10px] max-w-[450px] text-[14.5px] font-medium leading-[1.65] text-[#6a6a6a]">
        Presto arriverà l&apos;integrazione tra Reglo e Fatture in Cloud: le guide
        certificate diventeranno fatture alle autoscuole consorziate senza
        reinserire niente a mano, con numerazione e scadenze sincronizzate.
      </p>

      <div className="mt-[26px] w-full max-w-[450px] rounded-[14px] bg-[#f7f7f9] px-[18px] py-[14px]">
        <p className="text-[13px] font-medium leading-[1.55] text-[#6a6a6a]">
          Nel frattempo continua a fatturare come fai oggi: quando
          l&apos;integrazione sarà pronta ti avvisiamo noi.
        </p>
      </div>
    </div>
  );
}
