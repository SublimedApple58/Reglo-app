"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, useAnimationFrame, useReducedMotion } from "motion/react";

/**
 * Ciambella morbida, stile cartoon e clay, in SVG puro.
 *
 * - Anello spesso e paffuto, estremità arrotondate (`stroke-linecap: round`),
 *   piccoli spazi tra le fette. La profondità è un'ombra piatta e morbida
 *   sotto, come uno sticker, più un bordo appena più scuro e una luce interna
 *   tenue da plastilina. Niente prospettiva, niente riflessi metallici.
 * - Un solo loop (`useAnimationFrame`) porta ogni valore al bersaglio con un
 *   avvicinamento esponenziale: morbido, mai oltre il valore finale.
 * - All'ingresso le fette si gonfiano una dopo l'altra (scala 0.9 → 1).
 *   Il cambio di vista è un morph: ogni posto rimodella il suo arco e sfuma il
 *   colore. Da ferma respira piano; React ridisegna solo mentre qualcosa si
 *   muove.
 */

export type DonutSlice = { key: string; label: string; count: number; color: string; dark: string };

const SIZE = 320;
const H = 336; // spazio per l'ombra sotto
const C = SIZE / 2;
const R = 116;
const SW = 40; // spessore dell'anello
const GAP = 3.2; // gradi tra le estremità tonde
const CAP = (SW / 2 / R) * (180 / Math.PI); // quanto sporge il tappo tondo, in gradi
const MIN_DEG = 2 * CAP + GAP + 0.6; // una fetta da un contatto resta un bel bollino
const SLOTS = 9;

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (p: number) => 1 - (1 - clamp01(p)) ** 3;
/** Avvicinamento esponenziale: indipendente dal frame rate, mai oltre il bersaglio. */
const approach = (x: number, target: number, dt: number, tau: number) =>
  x + (target - x) * (1 - Math.exp(-dt / tau));

type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (c: number[]) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;

const pt = (r: number, deg: number) =>
  `${(C + r * Math.sin(rad(deg))).toFixed(2)} ${(C - r * Math.cos(rad(deg))).toFixed(2)}`;
/** Arco in senso orario da a0 ad a1 (0 = in alto). Lunghezza minima: un bollino. */
const arcPath = (a0: number, a1: number, r = R) => {
  const end = Math.max(a1, a0 + 0.05);
  return `M ${pt(r, a0)} A ${r} ${r} 0 ${end - a0 > 180 ? 1 : 0} 1 ${pt(r, end)}`;
};

type Slot = { a0: number; a1: number; color: RGB; dark: RGB; pop: number; dim: number };

/** Un numero che conta fino al valore (motion `animate`, ease-out lungo). */
export function CountUp({ value, duration = 1.4, delay = 0 }: { value: number; duration?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (reduce) {
      current.current = value;
      setShown(value);
      return;
    }
    const controls = animate(current.current, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        current.current = v;
        setShown(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, duration, delay, reduce]);
  return <>{shown}</>;
}

export function RoundDonut({
  slices,
  total,
  active,
  selected,
  onActive,
  onOpen,
  center,
}: {
  slices: DonutSlice[];
  total: number;
  active: string | null;
  selected: string | null;
  onActive: (key: string | null) => void;
  onOpen: (key: string) => void;
  center: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;

  // Bersagli per posto. I posti in più si richiudono in fondo al giro.
  const targets = useMemo(() => {
    // Le fette piccole prendono il minimo (un bollino intero, senza sovrapporsi);
    // il resto del giro si divide in proporzione tra le altre.
    const weights = slices.map(() => 0);
    let small = new Set<number>();
    for (let pass = 0; pass < 4; pass++) {
      const bigCount = slices.reduce((acc, s, i) => (small.has(i) ? acc : acc + s.count), 0) || 1;
      const free = 360 - small.size * MIN_DEG;
      const next = new Set(small);
      slices.forEach((s, i) => {
        weights[i] = small.has(i) ? MIN_DEG : (s.count / bigCount) * free;
        if (weights[i] < MIN_DEG) next.add(i);
      });
      if (next.size === small.size) break;
      small = next;
    }
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let a = 0;
    const out: Array<{ a0: number; a1: number; color: RGB; dark: RGB }> = [];
    for (let i = 0; i < SLOTS; i++) {
      if (i < slices.length) {
        const span = (weights[i] / sum) * 360;
        out.push({ a0: a, a1: a + span, color: hexToRgb(slices[i].color), dark: hexToRgb(slices[i].dark) });
        a += span;
      } else {
        const last = out[out.length - 1];
        out.push({ a0: 360, a1: 360, color: last?.color ?? [239, 227, 211], dark: last?.dark ?? [222, 205, 184] });
      }
    }
    return out;
  }, [slices]);

  const focusKey = active ?? selected;
  const focusIdx = slices.findIndex((s) => s.key === focusKey);
  const selectedIdx = slices.findIndex((s) => s.key === selected);

  const slots = useRef<Slot[] | null>(null);
  if (!slots.current) {
    slots.current = targets.map((t) => ({ a0: t.a0, a1: t.a1, color: [...t.color] as RGB, dark: [...t.dark] as RGB, pop: 0, dim: 0 }));
  }
  const intro = useRef(0);
  const spin = useRef(-36);
  const clock = useRef(0);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const pointerType = useRef("mouse");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!reduce) return;
    intro.current = 10;
    spin.current = 0;
    setFrame((n) => n + 1);
  }, [reduce]);

  useAnimationFrame((_, deltaMs) => {
    const dt = Math.min(deltaMs, 64) / 1000;
    clock.current += dt;
    let moving = false;
    const settle = (from: number, to: number, tau: number) => {
      if (reduce) return to;
      const v = approach(from, to, dt, tau);
      if (Math.abs(v - to) > 0.004) moving = true;
      return Math.abs(v - to) > 0.0005 ? v : to;
    };

    if (!reduce && intro.current < 2.8) {
      intro.current += dt;
      moving = true;
    }
    spin.current = settle(spin.current, 0, 0.6);

    slots.current!.forEach((s, i) => {
      const t = targets[i];
      s.a0 = settle(s.a0, t.a0, 0.34);
      s.a1 = settle(s.a1, t.a1, 0.34);
      for (let c = 0; c < 3; c++) {
        s.color[c] = settle(s.color[c], t.color[c], 0.34);
        s.dark[c] = settle(s.dark[c], t.dark[c], 0.34);
      }
      s.pop = settle(s.pop, i === focusIdx ? (i === selectedIdx ? 1.4 : 1) : 0, 0.18);
      s.dim = settle(s.dim, focusIdx >= 0 && i !== focusIdx ? 1 : 0, 0.22);
    });

    // Vita da ferma: un respiro lento e un filo di parallasse, solo transform.
    const p = pointer.current;
    p.x = approach(p.x, reduce ? 0 : p.tx, dt, 0.5);
    p.y = approach(p.y, reduce ? 0 : p.ty, dt, 0.5);
    if (wrapRef.current) {
      const breathe = reduce ? 0 : Math.sin((clock.current / 6) * Math.PI * 2);
      wrapRef.current.style.transform = `translate3d(${(p.x * 5).toFixed(2)}px, ${(p.y * 4 + breathe * 2).toFixed(2)}px, 0) scale(${(1 + breathe * 0.012).toFixed(4)})`;
    }

    if (moving) setFrame((n) => (n + 1) % 1_000_000);
  });

  const t = intro.current;
  const shapes = slots
    .current!.map((s, i) => {
      // le fette si gonfiano una dopo l'altra
      const grow = reduce ? 1 : easeOutCubic((t - 0.15 - i * 0.1) / 0.85);
      if (grow <= 0.001 || s.a1 - s.a0 <= 0.05) return null;
      const span = (s.a1 - s.a0) * (0.35 + 0.65 * grow);
      const a0 = s.a0 + spin.current + CAP + GAP / 2;
      const a1 = s.a0 + spin.current + span - CAP - GAP / 2;
      // un posto che si richiude (cambio vista) si sgonfia e sparisce, invece di restare un bollino
      const presence = clamp01((s.a1 - s.a0) / MIN_DEG);
      if (presence < 0.02) return null;
      const scale = (0.9 + 0.1 * grow) * (1 + 0.045 * s.pop) * (0.6 + 0.4 * presence);
      return {
        i,
        s,
        d: arcPath(a0, a1),
        hl: a1 - a0 > 4 ? arcPath(a0 + 1, a1 - 1, R + SW * 0.16) : null,
        grow: grow * presence,
        scale,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    pointer.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };

  return (
    <div
      className="relative mt-6 w-full max-w-[320px] md:max-w-[440px]"
      onPointerMove={onMove}
      onPointerLeave={(e) => {
        pointer.current.tx = 0;
        pointer.current.ty = 0;
        if (e.pointerType === "mouse") onActive(null);
      }}
    >
      <div ref={wrapRef} className="relative will-change-transform">
        <svg
          viewBox={`0 0 ${SIZE} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={slices.map((s) => `${s.label} ${s.count}`).join(", ")}
        >
          <defs>
            <filter id="rd-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* Ombra da sticker: piatta, morbida, calda. Ferma, quindi la sfocatura costa una volta sola. */}
          <circle
            cx={C}
            cy={C + 12}
            r={R}
            fill="none"
            stroke="#b98b5e"
            strokeOpacity={0.16 * easeOutCubic(t / 1.2)}
            strokeWidth={SW + 4}
            filter="url(#rd-soft)"
          />

          {shapes.map(({ i, s, d, hl, grow, scale }) => (
            <g
              key={i}
              className="pointer-events-none"
              transform={`translate(${C} ${C}) scale(${scale.toFixed(4)}) translate(${-C} ${-C})`}
              opacity={(grow * (1 - s.dim * 0.55)).toFixed(3)}
            >
              {/* bordo appena più scuro, poi la pasta, poi la luce interna */}
              <path d={d} fill="none" stroke={rgb(s.dark)} strokeWidth={SW + 3} strokeLinecap="round" />
              <path d={d} fill="none" stroke={rgb(s.color)} strokeWidth={SW - 1} strokeLinecap="round" />
              {hl ? (
                <path d={hl} fill="none" stroke="#fff" strokeOpacity={0.32} strokeWidth={SW * 0.22} strokeLinecap="round" />
              ) : null}
            </g>
          ))}

          {/* Zone di tocco ferme, larghe quanto l'anello */}
          {shapes.map(({ i, d }) => {
            const key = slices[i]?.key;
            if (!key) return null;
            return (
              <path
                key={`hit-${i}`}
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={SW + 8}
                strokeLinecap="round"
                className="cursor-pointer"
                style={{ pointerEvents: "stroke" }}
                onPointerDown={(e) => (pointerType.current = e.pointerType)}
                onPointerEnter={(e) => e.pointerType === "mouse" && onActive(key)}
                onClick={() => {
                  if (pointerType.current !== "mouse" && active !== key) return onActive(key);
                  onOpen(key);
                }}
              />
            );
          })}
        </svg>

        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: "50%", top: `${(C / H) * 100}%` }}
        >
          {center}
        </div>
      </div>
    </div>
  );
}
