"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Ciambella tridimensionale in SVG puro: anello proiettato in prospettiva
 * (ellisse), con il lato visibile davanti e la parete interna dietro, luce
 * dall'alto a sinistra e ombra di contatto. Niente librerie 3D: la geometria
 * si calcola qui, le animazioni sono transform CSS e un tween in
 * requestAnimationFrame. Curve ease-out, mai rimbalzi.
 */

export type DonutSlice = { key: string; label: string; count: number; color: string };

const W = 360;
const H = 272;
const CX = W / 2;
const CY = 116;
const RO = 150;
const RI = 104;
const TILT = 0.6; // schiacciamento verticale: la vista dall'alto inclinata
const DEPTH = 24; // spessore dell'anello
const GAP = 1.3; // gradi tra una fetta e l'altra
const MIN_DEG = 5; // anche una fetta da un contatto resta toccabile
const LIFT = 12;
const OUT = 7;

const rad = (deg: number) => (deg * Math.PI) / 180;
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeOutQuart = (p: number) => 1 - (1 - p) ** 4;

/** Punto sull'ellisse di raggio r, angolo in gradi (0 = in alto, senso orario). */
const pt = (r: number, deg: number, dz = 0) =>
  `${(CX + r * Math.sin(rad(deg))).toFixed(2)} ${(CY - r * Math.cos(rad(deg)) * TILT + dz).toFixed(2)}`;

const arc = (r: number, from: number, to: number, sweep: 0 | 1, dz = 0) =>
  `A ${r} ${(r * TILT).toFixed(2)} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${sweep} ${pt(r, to, dz)}`;

function topFace(a0: number, a1: number) {
  return `M ${pt(RO, a0)} ${arc(RO, a0, a1, 1)} L ${pt(RI, a1)} ${arc(RI, a1, a0, 0)} Z`;
}

function wall(r: number, b0: number, b1: number, depth: number) {
  return `M ${pt(r, b0)} ${arc(r, b0, b1, 1)} L ${pt(r, b1, depth)} ${arc(r, b1, b0, 0, depth)} Z`;
}

const clip = (a0: number, a1: number, lo: number, hi: number): [number, number] | null => {
  const s = Math.max(a0, lo);
  const e = Math.min(a1, hi);
  return e - s > 0.05 ? [s, e] : null;
};

/** Scurisce un colore esadecimale verso il nero. */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - amount));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r} ${g} ${b})`;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const sync = () => setReduce(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

/** Un numero che conta fino al valore, con ease-out. */
export function CountUp({ value, duration = 1400, delay = 0 }: { value: number; duration?: number; delay?: number }) {
  const [shown, setShown] = useState(0);
  const reduce = usePrefersReducedMotion();
  const from = useRef(0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now() + delay;
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      const v = Math.round(origin + (value - origin) * easeOutQuart(p));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
  const reduce = usePrefersReducedMotion();
  const [t, setT] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const pointer = useRef<string>("mouse");
  const box = useRef<HTMLDivElement>(null);

  // Ingresso: l'anello sale e le fette si disegnano in senso orario, una dopo l'altra.
  useEffect(() => {
    if (reduce) {
      setT(1);
      return;
    }
    const start = performance.now() + 120;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1500));
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const angles = useMemo(() => {
    const weights = slices.map((s) => Math.max((s.count / (total || 1)) * 360, MIN_DEG));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let a = 0;
    return slices.map((s, i) => {
      const span = Math.min((weights[i] / sum) * 360, 359.5);
      const g = { ...s, a0: a, a1: a + span };
      a += span;
      return g;
    });
  }, [slices, total]);

  const sweep = 360 * easeOutQuart(t);
  const depth = DEPTH * easeOutCubic(Math.min(1, t * 1.7));
  const focus = active ?? selected;

  const shapes = angles
    .map((s) => {
      const a0 = s.a0 + GAP / 2;
      const a1 = Math.min(s.a1 - GAP / 2, sweep);
      if (a1 - a0 <= 0.05) return null;
      const mid = (a0 + a1) / 2;
      const outerWall = clip(a0, a1, 90, 270);
      const innerWalls = [clip(a0, a1, 0, 90), clip(a0, a1, 270, 360)].filter(Boolean) as [number, number][];
      return {
        ...s,
        a0,
        a1,
        mid,
        top: topFace(a0, a1),
        outer: outerWall ? wall(RO, outerWall[0], outerWall[1], depth) : null,
        inner: innerWalls.map(([b0, b1]) => wall(RI, b0, b1, depth)),
        // dietro prima, davanti dopo: il pittore disegna nell'ordine giusto
        z: -Math.cos(rad(mid)),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const painted = [...shapes].sort((a, b) => a.z - b.z);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || reduce || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  };

  return (
    <div
      ref={box}
      className="relative mt-4 w-full max-w-[360px] [perspective:1100px] md:max-w-[520px]"
      onPointerMove={onMove}
      onPointerLeave={(e) => {
        setTilt({ x: 0, y: 0 });
        if (e.pointerType === "mouse") onActive(null);
      }}
    >
      <div
        className="relative transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        style={{ transform: `rotateX(${(-tilt.y * 4).toFixed(2)}deg) rotateY(${(tilt.x * 6).toFixed(2)}deg)` }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={slices.map((s) => `${s.label} ${s.count}`).join(", ")}>
          <defs>
            <radialGradient id="rd-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000" stopOpacity="0.16" />
              <stop offset="60%" stopColor="#000" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="rd-light" gradientUnits="userSpaceOnUse" x1={CX - RO} y1={CY - RO * TILT} x2={CX + RO} y2={CY + RO * TILT}>
              <stop offset="0%" stopColor="#fff" stopOpacity="0.34" />
              <stop offset="50%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.07" />
            </linearGradient>
            <linearGradient id="rd-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="rd-wall-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* Ombra di contatto: si allarga mentre l'anello prende spessore */}
          <ellipse
            cx={CX}
            cy={CY + DEPTH + 10}
            rx={RO * 1.08}
            ry={RO * TILT * 1.02}
            fill="url(#rd-shadow)"
            style={{ opacity: depth / DEPTH }}
          />

          {painted.map((s) => {
            const lifted = focus === s.key;
            const dim = focus !== null && !lifted;
            const dx = Math.sin(rad(s.mid)) * OUT;
            const dy = -Math.cos(rad(s.mid)) * OUT * TILT - LIFT;
            return (
              <g
                key={s.key}
                className="pointer-events-none transition-[transform,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{
                  transform: lifted ? `translate(${dx}px, ${dy}px)` : "translate(0px, 0px)",
                  // attenuate senza trasparenza: niente pareti che si vedono attraverso
                  filter: dim ? "contrast(0.42) brightness(1.32)" : "contrast(1) brightness(1)",
                }}
              >
                {s.inner.map((d, i) => (
                  <g key={i}>
                    <path d={d} fill={shade(s.color, 0.2)} />
                    <path d={d} fill="url(#rd-wall-in)" />
                  </g>
                ))}
                {s.outer ? (
                  <>
                    <path d={s.outer} fill={shade(s.color, 0.14)} />
                    <path d={s.outer} fill="url(#rd-wall)" />
                  </>
                ) : null}
                <path d={s.top} fill={s.color} />
                <path d={s.top} fill="url(#rd-light)" stroke="rgba(255,255,255,0.55)" strokeWidth={0.6} />
              </g>
            );
          })}

          {/* Zone di tocco ferme: la fetta sollevata non scappa sotto il cursore */}
          {shapes.map((s) => (
            <g
              key={`hit-${s.key}`}
              className="cursor-pointer"
              onPointerDown={(e) => (pointer.current = e.pointerType)}
              onPointerEnter={(e) => e.pointerType === "mouse" && onActive(s.key)}
              onClick={() => {
                if (pointer.current !== "mouse" && active !== s.key) return onActive(s.key);
                onOpen(s.key);
              }}
            >
              <path d={s.top} fill="transparent" />
              {s.outer ? <path d={s.outer} fill="transparent" /> : null}
            </g>
          ))}
        </svg>

        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: "50%", top: `${((CY + DEPTH / 2 + 4) / H) * 100}%` }}
        >
          {center}
        </div>
      </div>
    </div>
  );
}
