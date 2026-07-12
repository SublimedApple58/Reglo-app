import Image from "next/image";

/**
 * Carosello 3D del pannello brand auth, stile hero Bending Spoons: le card
 * sono disposte su un cilindro (visto da fuori: la centrale è frontale e
 * più vicina, le laterali curvano via) che ruota in continuo, senza scatti.
 * Pura CSS (keyframes brand-ring-spin in globals.css), zero JS.
 */

const TILES = [
  { src: "/images/nav/agenda-3d.png", label: "Agenda" },
  { src: "/images/nav/allievi-3d.png", label: "Allievi" },
  { src: "/images/nav/segretaria-3d.png", label: "Segretaria AI" },
  { src: "/images/nav/rinnovi-3d.png", label: "Rinnovi" },
] as const;

// 8 posizioni (le 4 card ripetute due volte) per un anello denso: mentre la
// centrale è frontale, ai lati se ne vedono già altre due per parte.
const RING = [...TILES, ...TILES];
const STEP_DEG = 360 / RING.length;
// Raggio del cilindro: card da 190px con un piccolo respiro tra l'una e l'altra.
const RADIUS_PX = 270;

export function BrandCarousel() {
  return (
    <div
      className="relative mt-12 flex h-[250px] items-center justify-center"
      style={{ perspective: "1200px" }}
    >
      <div
        className="relative h-[218px] w-[190px] [animation:brand-ring-spin_26s_linear_infinite]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {RING.map((tile, i) => (
          <div
            key={i}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[22px] border border-white/10 bg-[#23233b]"
            style={{
              transform: `rotateY(${i * STEP_DEG}deg) translateZ(${RADIUS_PX}px)`,
              backfaceVisibility: "hidden",
            }}
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
        ))}
      </div>
    </div>
  );
}
