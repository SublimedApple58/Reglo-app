"use client";

import React from "react";
import Image from "next/image";

/**
 * Carosello 3D del pannello brand auth: card centrale frontale spinta in
 * avanti (translateZ positivo), laterali angolate stile coverflow che
 * recedono dietro, avanzamento automatico continuo (niente stop con
 * prefers-reduced-motion: pannello decorativo, il movimento è il punto).
 */

const TILES = [
  { src: "/images/nav/agenda-3d.png", label: "Agenda" },
  { src: "/images/nav/allievi-3d.png", label: "Allievi" },
  { src: "/images/nav/segretaria-3d.png", label: "Segretaria AI" },
  { src: "/images/nav/rinnovi-3d.png", label: "Rinnovi" },
] as const;

const STEP_MS = 2800;

/** Trasformazione per posizione relativa alla card attiva: 0 centro, ±1 lati, 2 retro. */
function slotStyle(offset: number): React.CSSProperties {
  if (offset === 0) {
    return {
      transform: "translateX(0) translateZ(90px) rotateY(0deg)",
      opacity: 1,
      zIndex: 30,
    };
  }
  if (offset === 1 || offset === -1) {
    return {
      transform: `translateX(${offset * 148}px) translateZ(-50px) rotateY(${offset * -38}deg)`,
      opacity: 0.45,
      zIndex: 20,
    };
  }
  // Card opposta: nascosta dietro il centro mentre "gira".
  return {
    transform: "translateX(0) translateZ(-170px) rotateY(0deg)",
    opacity: 0,
    zIndex: 10,
  };
}

export function BrandCarousel() {
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => setActive((a) => (a + 1) % TILES.length), STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="relative mt-10 flex h-[250px] items-center justify-center"
      style={{ perspective: "1100px" }}
    >
      <div className="relative h-[218px] w-[190px]" style={{ transformStyle: "preserve-3d" }}>
        {TILES.map((tile, i) => {
          const raw = (((i - active) % TILES.length) + TILES.length) % TILES.length;
          const offset = raw === 3 ? -1 : raw; // 0 centro, 1 destra, -1 sinistra, 2 retro
          return (
            <div
              key={tile.label}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[22px] border border-white/10 bg-[#23233b] px-6 py-7 transition-[transform,opacity] duration-[850ms] ease-[cubic-bezier(0.33,1,0.36,1)]"
              style={slotStyle(offset)}
            >
              <Image
                src={tile.src}
                alt=""
                width={64}
                height={64}
                className="size-16 select-none object-contain"
              />
              <span className="text-sm font-semibold text-white/90">{tile.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
