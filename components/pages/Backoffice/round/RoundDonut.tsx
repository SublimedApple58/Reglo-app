"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, useAnimationFrame, useReducedMotion } from "motion/react";

/**
 * Ciambella tridimensionale e viva, in SVG puro (niente librerie 3D).
 *
 * - Geometria proiettata a mano: anello in prospettiva con il lato davanti e la
 *   parete interna dietro, disegnati dal fondo verso chi guarda.
 * - Un solo loop (`useAnimationFrame`) porta ogni valore verso il suo
 *   bersaglio con un avvicinamento esponenziale smorzato: morbido, senza
 *   rimbalzi e senza superare mai il valore finale.
 * - Il cambio di vista è un morph: ogni posto (slot) rimodella il suo arco e
 *   sfuma il colore, invece di ridisegnarsi.
 * - Da ferma resta viva (respiro, riflesso che scorre, parallasse
 *   interpolata) con transform e attributi aggiornati via ref, senza far
 *   ridisegnare React a ogni frame.
 */

export type DonutSlice = { key: string; label: string; count: number; color: string; dark: string };

const W = 360;
const H = 272;
const CX = W / 2;
const CY = 116;
const RO = 150;
const RI = 104;
const TILT = 0.6;
const DEPTH = 24;
const GAP = 1.4;
const MIN_DEG = 5;
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
const rgb = (c: number[], k = 1) => `rgb(${Math.round(c[0] * k)} ${Math.round(c[1] * k)} ${Math.round(c[2] * k)})`;

const pt = (r: number, deg: number, tilt: number, dz = 0) =>
  `${(CX + r * Math.sin(rad(deg))).toFixed(2)} ${(CY - r * Math.cos(rad(deg)) * tilt + dz).toFixed(2)}`;
const arc = (r: number, from: number, to: number, sweep: 0 | 1, tilt: number, dz = 0) =>
  `A ${r} ${(r * tilt).toFixed(2)} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${sweep} ${pt(r, to, tilt, dz)}`;
const topFace = (a0: number, a1: number, t: number) =>
  `M ${pt(RO, a0, t)} ${arc(RO, a0, a1, 1, t)} L ${pt(RI, a1, t)} ${arc(RI, a1, a0, 0, t)} Z`;
const wall = (r: number, b0: number, b1: number, d: number, t: number) =>
  `M ${pt(r, b0, t)} ${arc(r, b0, b1, 1, t)} L ${pt(r, b1, t, d)} ${arc(r, b1, b0, 0, t, d)} Z`;
const clip = (a0: number, a1: number, lo: number, hi: number): [number, number] | null => {
  const s = Math.max(a0, lo);
  const e = Math.min(a1, hi);
  return e - s > 0.05 ? [s, e] : null;
};
/** Angoli riportati in [0, 360) per capire cosa sta davanti e cosa dietro. */
const wrapSegments = (a0: number, a1: number): [number, number][] => {
  const s = ((a0 % 360) + 360) % 360;
  const e = s + (a1 - a0);
  return e <= 360 ? [[s, e]] : [[s, 360], [0, e - 360]];
};

type Slot = { a0: number; a1: number; light: RGB; dark: RGB; lift: number; dim: number };

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
  halo,
}: {
  slices: DonutSlice[];
  total: number;
  active: string | null;
  selected: string | null;
  onActive: (key: string | null) => void;
  onOpen: (key: string) => void;
  center: ReactNode;
  /** Sfondo CSS dell'alone sotto l'anello (conic-gradient dei colori). */
  halo: string;
}) {
  const reduce = useReducedMotion() ?? false;

  // Bersagli per posto: angoli e colori. I posti in più si richiudono in fondo al giro.
  const targets = useMemo(() => {
    const weights = slices.map((s) => Math.max((s.count / (total || 1)) * 360, MIN_DEG));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let a = 0;
    const out: Array<{ a0: number; a1: number; light: RGB; dark: RGB }> = [];
    for (let i = 0; i < SLOTS; i++) {
      if (i < slices.length) {
        const span = (weights[i] / sum) * 360;
        out.push({ a0: a, a1: a + span, light: hexToRgb(slices[i].color), dark: hexToRgb(slices[i].dark) });
        a += span;
      } else {
        const last = out[out.length - 1];
        out.push({ a0: 360, a1: 360, light: last?.light ?? [240, 240, 242], dark: last?.dark ?? [212, 212, 216] });
      }
    }
    return out;
  }, [slices, total]);

  const focusKey = active ?? selected;
  const focusIdx = slices.findIndex((s) => s.key === focusKey);
  const selectedIdx = slices.findIndex((s) => s.key === selected);

  // Stato animato in ref: React ridisegna solo mentre qualcosa si muove davvero.
  const slots = useRef<Slot[] | null>(null);
  if (!slots.current) {
    slots.current = targets.map((t) => ({ a0: t.a0, a1: t.a1, light: [...t.light] as RGB, dark: [...t.dark] as RGB, lift: 0, dim: 0 }));
  }
  const intro = useRef(0);
  const spin = useRef(-70);
  const tiltRef = useRef(0.92);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const clock = useRef(0);
  const pointerType = useRef("mouse");
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<SVGLinearGradientElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!reduce) return;
    intro.current = 10;
    spin.current = 0;
    tiltRef.current = TILT;
    setFrame((n) => n + 1);
  }, [reduce]);

  useAnimationFrame((_, deltaMs) => {
    const dt = Math.min(deltaMs, 64) / 1000;
    clock.current += dt;
    const time = clock.current;
    let moving = false;
    const settle = (from: number, to: number, tau: number) => {
      if (reduce) return to;
      const v = approach(from, to, dt, tau);
      if (Math.abs(v - to) > 0.01) moving = true;
      return Math.abs(v - to) > 0.001 ? v : to;
    };

    if (!reduce && intro.current < 3) {
      intro.current += dt;
      moving = true;
    }
    spin.current = settle(spin.current, 0, 0.6);
    tiltRef.current = settle(tiltRef.current, TILT, 0.55);

    slots.current!.forEach((s, i) => {
      const t = targets[i];
      s.a0 = settle(s.a0, t.a0, 0.34);
      s.a1 = settle(s.a1, t.a1, 0.34);
      for (let c = 0; c < 3; c++) {
        s.light[c] = settle(s.light[c], t.light[c], 0.34);
        s.dark[c] = settle(s.dark[c], t.dark[c], 0.34);
      }
      s.lift = settle(s.lift, i === focusIdx ? (i === selectedIdx ? 1.4 : 1) : 0, 0.2);
      s.dim = settle(s.dim, focusIdx >= 0 && i !== focusIdx ? 1 : 0, 0.24);
    });

    // Vita da ferma: transform e gradienti via ref, senza render di React.
    const p = pointer.current;
    p.x = approach(p.x, reduce ? 0 : p.tx, dt, 0.45);
    p.y = approach(p.y, reduce ? 0 : p.ty, dt, 0.45);
    const breathe = reduce ? 0 : Math.sin((time / 7) * Math.PI * 2);
    if (wrapRef.current) {
      wrapRef.current.style.transform = `translate3d(0, ${(breathe * 3).toFixed(2)}px, 0) rotateX(${(breathe * 1.8 - p.y * 5).toFixed(2)}deg) rotateY(${(p.x * 7).toFixed(2)}deg)`;
    }
    if (haloRef.current) {
      // l'alone entra insieme alle fette, non prima
      haloRef.current.style.opacity = (0.22 * easeOutCubic(reduce ? 1 : (intro.current - 0.5) / 1.4)).toFixed(3);
      haloRef.current.style.transform = `translate3d(${(p.x * -12).toFixed(1)}px, ${(10 - breathe * 3).toFixed(1)}px, 0) scaleY(0.5) rotate(${(spin.current + (reduce ? 0 : time * 5)).toFixed(1)}deg)`;
    }
    if (sheenRef.current) {
      // un riflesso che scorre lento lungo l'anello, spostato dal cursore
      const ang = rad((reduce ? 220 : time * 24) + p.x * 45);
      const dx = Math.cos(ang) * RO;
      const dy = Math.sin(ang) * RO * TILT;
      sheenRef.current.setAttribute("x1", (CX - dx).toFixed(1));
      sheenRef.current.setAttribute("y1", (CY - dy).toFixed(1));
      sheenRef.current.setAttribute("x2", (CX + dx).toFixed(1));
      sheenRef.current.setAttribute("y2", (CY + dy).toFixed(1));
    }

    if (moving) setFrame((n) => (n + 1) % 1_000_000);
  });

  // ── Geometria del frame corrente ──
  const tilt = tiltRef.current;
  const t = intro.current;
  const depth = DEPTH * easeOutCubic((t - 0.1) / 0.9);
  const shapes = slots
    .current!.map((s, i) => {
      // ingresso: le fette crescono una dopo l'altra mentre l'anello ruota in posizione
      const grow = easeOutCubic((t - 0.2 - i * 0.11) / 0.9);
      const span = (s.a1 - s.a0) * grow;
      const a0 = s.a0 + spin.current + GAP / 2;
      const a1 = s.a0 + spin.current + span - GAP / 2;
      if (a1 - a0 <= 0.05) return null;
      const mid = (a0 + a1) / 2;
      const outer: string[] = [];
      const inner: string[] = [];
      for (const [s0, s1] of wrapSegments(a0, a1)) {
        const o = clip(s0, s1, 90, 270);
        if (o) outer.push(wall(RO, o[0], o[1], depth, tilt));
        for (const c of [clip(s0, s1, 0, 90), clip(s0, s1, 270, 360)]) if (c) inner.push(wall(RI, c[0], c[1], depth, tilt));
      }
      const dx = Math.sin(rad(mid)) * 10 * s.lift;
      const dy = (-Math.cos(rad(mid)) * 10 * tilt - 13) * s.lift;
      return { i, s, top: topFace(a0, a1, tilt), outer, inner, dx, dy, z: -Math.cos(rad(mid)) + s.lift * 3 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const painted = [...shapes].sort((a, b) => a.z - b.z);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    pointer.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };

  return (
    <div
      className="relative mt-4 w-full max-w-[360px] [perspective:1100px] md:max-w-[520px]"
      onPointerMove={onMove}
      onPointerLeave={(e) => {
        pointer.current.tx = 0;
        pointer.current.ty = 0;
        if (e.pointerType === "mouse") onActive(null);
      }}
    >
      {/* Alone colorato sotto l'anello: sfocato una volta, poi solo transform */}
      <div
        ref={haloRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-[10%] top-[16%] aspect-square rounded-full opacity-0 blur-[48px] will-change-transform"
        style={{ background: halo }}
      />
      <div ref={wrapRef} className="relative will-change-transform">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={slices.map((s) => `${s.label} ${s.count}`).join(", ")}
        >
          <defs>
            <radialGradient id="rd-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e1b2e" stopOpacity="0.2" />
              <stop offset="60%" stopColor="#1e1b2e" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#1e1b2e" stopOpacity="0" />
            </radialGradient>
            <linearGradient ref={sheenRef} id="rd-sheen" gradientUnits="userSpaceOnUse" x1={CX - RO} y1={CY} x2={CX + RO} y2={CY}>
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="40%" stopColor="#fff" stopOpacity="0" />
              <stop offset="50%" stopColor="#fff" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="rd-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
            </linearGradient>
            <linearGradient id="rd-wall-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.03" />
            </linearGradient>
            {slots.current!.map((s, i) => (
              <linearGradient
                key={i}
                id={`rd-top-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={CX - RO}
                y1={CY - RO * tilt}
                x2={CX + RO * 0.7}
                y2={CY + RO * tilt}
              >
                <stop offset="0%" stopColor={rgb(s.light)} />
                <stop offset="100%" stopColor={rgb(s.dark)} />
              </linearGradient>
            ))}
          </defs>

          <ellipse cx={CX} cy={CY + DEPTH + 12} rx={RO * 1.06} ry={RO * TILT * 1.04} fill="url(#rd-shadow)" style={{ opacity: depth / DEPTH }} />

          {painted.map(({ i, s, top, outer, inner, dx, dy }) => (
            <g
              key={i}
              className="pointer-events-none"
              transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}
              // le altre fette si spengono senza diventare trasparenti
              style={s.dim > 0.01 ? { filter: `saturate(${(1 - s.dim * 0.75).toFixed(3)}) brightness(${(1 + s.dim * 0.16).toFixed(3)})` } : undefined}
            >
              {inner.map((d, k) => (
                <g key={`i${k}`}>
                  <path d={d} fill={rgb(s.dark, 0.8)} />
                  <path d={d} fill="url(#rd-wall-in)" />
                </g>
              ))}
              {outer.map((d, k) => (
                <g key={`o${k}`}>
                  <path d={d} fill={rgb(s.dark, 0.86)} />
                  <path d={d} fill="url(#rd-wall)" />
                </g>
              ))}
              <path d={top} fill={`url(#rd-top-${i})`} />
              <path d={top} fill="url(#rd-sheen)" />
              <path d={top} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.7} />
            </g>
          ))}

          {/* Zone di tocco ferme: la fetta che si solleva non scappa sotto il cursore */}
          {shapes.map(({ i, top, outer }) => {
            const key = slices[i]?.key;
            if (!key) return null;
            return (
              <g
                key={`hit-${i}`}
                className="cursor-pointer"
                onPointerDown={(e) => (pointerType.current = e.pointerType)}
                onPointerEnter={(e) => e.pointerType === "mouse" && onActive(key)}
                onClick={() => {
                  if (pointerType.current !== "mouse" && active !== key) return onActive(key);
                  onOpen(key);
                }}
              >
                <path d={top} fill="transparent" />
                {outer.map((d, k) => (
                  <path key={k} d={d} fill="transparent" />
                ))}
              </g>
            );
          })}
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
