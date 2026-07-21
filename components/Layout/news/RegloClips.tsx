"use client";

/**
 * RegloClips — animazioni vettoriali (SVG + DIV) per il dialog "Novità".
 *
 * Port 1:1 delle scene del prototipo `reglo-video.jsx`: sono componenti React
 * puri guidati da una prop `progress` (0→1) e `localTime`. Nessun canvas,
 * nessuna dipendenza dall'editor del prototipo (SceneStage/tweaks): le clip e
 * l'embed girano con un semplice loop requestAnimationFrame.
 *
 * Esporta:
 *  - RegloEmbed        → schermo interno pieno per lo splash News (pannello verticale)
 *  - RegloClipRoad     → "Reglo Road" (16:9, loop)
 *  - RegloClipRinnovi  → "Reglo Rinnovi" (16:9, loop)
 *  - RegloClipGuide    → "Guide certificate" (16:9, loop)
 */

import React from "react";

const FONT = "var(--font-geist-sans), Figtree, -apple-system, sans-serif";
const NAVY = "#1a1a2e";
const PINK = "#be1250";

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const EIO = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const EO = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const OB = (t: number) => {
  t = clamp01(t);
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

type Pt = [number, number];
type SceneProps = { progress: number; localTime: number };

/* ───────────── SCENA 1 — Reglo Road (mappa organica) ───────────── */
function bez(s: Pt[], t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
    u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1],
  ];
}
function sampleSegs(segs: Pt[][], res: number): Pt[] {
  const out: Pt[] = [];
  segs.forEach((s, k) => {
    for (let j = k === 0 ? 0 : 1; j <= res; j++) out.push(bez(s, j / res));
  });
  return out;
}
const RD_V1 = sampleSegs(
  [
    [[60, -30], [90, 150], [40, 340], [90, 500]],
    [[90, 500], [130, 620], [80, 700], [100, 760]],
  ],
  60,
);
const RD_H1 = sampleSegs(
  [
    [[-30, 240], [150, 280], [330, 180], [520, 215]],
    [[520, 215], [700, 248], [820, 150], [1010, 185]],
    [[1010, 185], [1150, 210], [1240, 160], [1320, 180]],
  ],
  60,
);
const RD_V2 = sampleSegs(
  [
    [[760, -30], [790, 120], [700, 260], [745, 420]],
    [[745, 420], [785, 560], [700, 660], [730, 760]],
  ],
  60,
);
const RD_H2 = sampleSegs(
  [
    [[-30, 540], [180, 500], [260, 610], [470, 580]],
    [[470, 580], [680, 550], [760, 660], [1000, 620]],
    [[1000, 620], [1120, 600], [1220, 640], [1320, 610]],
  ],
  60,
);
const nearestIdx = (pts: Pt[], p: Pt) => {
  let bi = 0,
    bd = Infinity;
  pts.forEach((q, i) => {
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
};
function nearestPair(A: Pt[], B: Pt[]): [number, number] {
  let ba = 0,
    bb = 0,
    bd = Infinity;
  for (let i = 0; i < A.length; i += 2)
    for (let j = 0; j < B.length; j += 2) {
      const d = (A[i][0] - B[j][0]) ** 2 + (A[i][1] - B[j][1]) ** 2;
      if (d < bd) {
        bd = d;
        ba = i;
        bb = j;
      }
    }
  return [ba, bb];
}
const slicePath = (pts: Pt[], i: number, j: number) =>
  i <= j ? pts.slice(i, j + 1) : pts.slice(j, i + 1).reverse();
const [j1a, j1b] = nearestPair(RD_V1, RD_H1);
const [j2a, j2b] = nearestPair(RD_H1, RD_V2);
const [j3a, j3b] = nearestPair(RD_V2, RD_H2);
const startI = nearestIdx(RD_V1, [100, 640]);
const endI = nearestIdx(RD_H2, [1180, 615]);
function trimEnd(pts: Pt[], dist: number): Pt[] {
  const out = pts.slice();
  let acc = 0;
  while (out.length > 2) {
    const a = out[out.length - 1],
      b = out[out.length - 2];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (acc + d > dist) break;
    acc += d;
    out.pop();
  }
  return out;
}
function trimStart(pts: Pt[], dist: number): Pt[] {
  return trimEnd(pts.slice().reverse(), dist).reverse();
}
function fillet(A: Pt[], B: Pt[], corner: Pt, trim: number): Pt[] {
  const a = trimEnd(A, trim),
    b = trimStart(B, trim);
  const p0 = a[a.length - 1],
    p2 = b[0],
    q: Pt[] = [];
  for (let j = 1; j <= 18; j++) {
    const t = j / 18,
      u = 1 - t;
    q.push([
      u * u * p0[0] + 2 * u * t * corner[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * corner[1] + t * t * p2[1],
    ]);
  }
  return a.concat(q, b.slice(1));
}
const S1 = slicePath(RD_V1, startI, j1a),
  S2 = slicePath(RD_H1, j1b, j2a),
  S3 = slicePath(RD_V2, j2b, j3a),
  S4 = slicePath(RD_H2, j3b, endI);
const RPTS = fillet(fillet(fillet(S1, S2, RD_H1[j1b], 42), S3, RD_V2[j2b], 42), S4, RD_H2[j3b], 42);
const LENS = [0];
for (let i = 1; i < RPTS.length; i++)
  LENS.push(LENS[i - 1] + Math.hypot(RPTS[i][0] - RPTS[i - 1][0], RPTS[i][1] - RPTS[i - 1][1]));
const TOTAL = LENS[LENS.length - 1];
function idxAt(d: number) {
  d = Math.max(0, Math.min(TOTAL, d));
  let lo = 0,
    hi = LENS.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (LENS[m] < d) lo = m + 1;
    else hi = m;
  }
  return lo;
}
function pointAt(d: number): Pt {
  const i = idxAt(d);
  if (i === 0) return RPTS[0];
  const u = (d - LENS[i - 1]) / (LENS[i] - LENS[i - 1] || 1);
  return [lerp(RPTS[i - 1][0], RPTS[i][0], u), lerp(RPTS[i - 1][1], RPTS[i][1], u)];
}
function partialStr(d: number) {
  const i = idxAt(d);
  const arr = RPTS.slice(0, i);
  arr.push(pointAt(d));
  return arr.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ");
}
const ALL_STR = RPTS.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ");
const OTHER_ROADS = [
  "M-30,540 C180,500 260,610 470,580 C680,550 760,660 1000,620 C1120,600 1220,640 1320,610",
  "M-30,240 C150,280 330,180 520,215 C700,248 820,150 1010,185 C1150,210 1240,160 1320,180",
  "M320,-30 C300,140 390,300 355,470 C330,590 400,680 420,760",
  "M760,-30 C790,120 700,260 745,420 C785,560 700,660 730,760",
  "M1040,-30 C1010,140 1090,320 1050,480 C1020,600 1080,700 1060,760",
  "M60,-30 C90,150 40,340 90,500 C130,620 80,700 100,760",
  "M-30,420 C140,400 240,340 430,360 C600,378 700,320 880,345 C1060,368 1180,330 1320,355",
];
const SMALL_ROADS = [
  "M180,80 C280,120 360,90 470,130",
  "M560,60 C620,120 700,100 780,140",
  "M900,90 C960,140 1050,110 1130,150",
  "M150,700 C260,660 330,700 430,670",
  "M540,700 C640,660 740,690 840,660",
  "M950,700 C1030,650 1120,680 1200,650",
  "M220,300 C260,340 240,400 280,440",
  "M620,420 C660,470 640,530 680,570",
  "M880,470 C920,520 900,580 940,620",
];

function RoadScene({ progress: p, localTime }: SceneProps) {
  const routeProg = EIO(seg(p, 0.08, 0.88));
  const dist = routeProg * TOTAL;
  const dot = pointAt(dist);
  const zin = EIO(seg(p, 0, 0.14)),
    zout = EIO(seg(p, 0.84, 0.96));
  const follow = zin * (1 - zout);
  const s = 1 + 0.65 * follow;
  let fx = lerp(640, dot[0], follow),
    fy = lerp(360, dot[1], follow);
  fx = Math.max(640 / s, Math.min(1280 - 640 / s, fx));
  fy = Math.max(360 / s, Math.min(720 - 360 / s, fy));
  const pulse = (localTime % 1.4) / 1.4;
  const cardIn = seg(p, 0.9, 0.97);
  const done = routeProg > 0.995;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#f0ede5", fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1280,
          height: 720,
          transform: `translate(${640 - fx * s}px, ${360 - fy * s}px) scale(${s})`,
          transformOrigin: "0 0",
        }}
      >
        <svg width="1280" height="720" viewBox="0 0 1280 720">
          <rect width="1280" height="720" fill="#f0ede5" />
          <path
            d="M-30,120 C200,170 340,60 560,105 C780,150 920,40 1150,90 C1240,110 1290,90 1320,100 L1320,-30 L-30,-30 Z"
            fill="#bcdcec"
          />
          <path d="M420,180 C500,150 590,175 610,240 C630,305 560,350 480,340 C400,330 360,260 420,180 Z" fill="#cde6c5" />
          <path d="M880,480 C980,450 1090,490 1100,560 C1110,630 1000,670 910,650 C820,630 810,520 880,480 Z" fill="#cde6c5" />
          <path d="M90,320 C160,300 220,330 225,390 C230,450 160,480 100,465 C40,450 30,350 90,320 Z" fill="#cde6c5" />
          <ellipse cx="640" cy="560" rx="90" ry="55" fill="#cde6c5" />
          {SMALL_ROADS.map((d, i) => (
            <path key={"s" + i} d={d} fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
          ))}
          {OTHER_ROADS.map((d, i) => (
            <path key={"c" + i} d={d} fill="none" stroke="#ddd8ca" strokeWidth="19" strokeLinecap="round" />
          ))}
          {OTHER_ROADS.map((d, i) => (
            <path key={"r" + i} d={d} fill="none" stroke="#ffffff" strokeWidth="13" strokeLinecap="round" />
          ))}
          <polyline points={ALL_STR} fill="none" stroke="#ddd8ca" strokeWidth="21" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={ALL_STR} fill="none" stroke="#ffffff" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={ALL_STR} fill="none" stroke="#c6c0b0" strokeWidth="4" strokeDasharray="1 15" strokeLinecap="round" />
          {routeProg > 0.001 && (
            <polyline points={partialStr(dist)} fill="none" stroke="#9fc3f0" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          )}
          <circle cx={RPTS[0][0]} cy={RPTS[0][1]} r="12" fill="#2a6fdb" stroke="#ffffff" strokeWidth="4" />
          {done && (
            <g transform={`translate(${RPTS[RPTS.length - 1][0]}, ${RPTS[RPTS.length - 1][1]})`}>
              <circle r="13" fill={NAVY} stroke="#ffffff" strokeWidth="4" />
              <path d="M-4.5 0.5l3 3 6-6" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
          {!done && routeProg > 0.001 && (
            <g>
              <circle cx={dot[0]} cy={dot[1]} r={10 + 13 * pulse} fill="none" stroke="#2a6fdb" strokeWidth="3" opacity={0.5 * (1 - pulse)} />
              <circle cx={dot[0]} cy={dot[1]} r="10.5" fill="#ffffff" />
              <circle cx={dot[0]} cy={dot[1]} r="6.5" fill="#2a6fdb" />
            </g>
          )}
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 32,
          transform: `translateX(-50%) translateY(${(1 - EO(cardIn)) * 30}px)`,
          opacity: cardIn,
          background: "#ffffff",
          borderRadius: 18,
          padding: "18px 28px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#929292", textTransform: "uppercase", letterSpacing: "0.6px" }}>Distanza</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#222222", letterSpacing: "-0.5px" }}>12,4 km</span>
        </div>
        <div style={{ width: 1, height: 36, background: "#ececec" }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#929292", textTransform: "uppercase", letterSpacing: "0.6px" }}>Durata</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#222222", letterSpacing: "-0.5px" }}>42 min</span>
        </div>
        <div style={{ width: 1, height: 36, background: "#ececec" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#f0faf4", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6.5l2.6 2.6L10 3.5" stroke="#1a7f50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1a7f50" }}>Guida completata</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────── SCENA 2 — Visita medica di rinnovo ───────────── */
type FlowNode = { id: string; x: number; y: number; label: string; dot: string; t: number; ok: boolean | null };
const NODES: FlowNode[] = [
  { id: "A", x: 70, y: 318, label: "Visita medica rinnovo", dot: PINK, t: 0.04, ok: null },
  { id: "B", x: 440, y: 128, label: "Capacità sensoriali", dot: "#2a6fdb", t: 0.24, ok: null },
  { id: "C", x: 440, y: 508, label: "Patologie", dot: "#2a6fdb", t: 0.28, ok: null },
  { id: "D", x: 820, y: 30, label: "Vista", dot: "#7c4dff", t: 0.48, ok: true },
  { id: "E", x: 820, y: 226, label: "Udito", dot: "#7c4dff", t: 0.52, ok: true },
  { id: "F", x: 820, y: 412, label: "Diabete compensato", dot: "#b5860a", t: 0.6, ok: true },
  { id: "G", x: 820, y: 606, label: "Epilessia attiva", dot: "#b5860a", t: 0.64, ok: false },
];
const EDGES = [
  { from: "A", to: "B", s: 0.1, e: 0.24 },
  { from: "A", to: "C", s: 0.14, e: 0.28 },
  { from: "B", to: "D", s: 0.36, e: 0.48 },
  { from: "B", to: "E", s: 0.4, e: 0.52 },
  { from: "C", to: "F", s: 0.48, e: 0.6 },
  { from: "C", to: "G", s: 0.52, e: 0.64 },
];
const NW = 250,
  NH = 64;
const nodeById = (id: string) => NODES.find((n) => n.id === id)!;
function edgePath(a: FlowNode, b: FlowNode) {
  const x1 = a.x + NW,
    y1 = a.y + NH / 2,
    x2 = b.x,
    y2 = b.y + NH / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
function FlowScene({ progress: p }: SceneProps) {
  const drift = Math.sin(Math.PI * p);
  const s = 1 + 0.06 * drift;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#fafafa",
        fontFamily: FONT,
        backgroundImage: "radial-gradient(#e4e4ea 1.5px, transparent 1.5px)",
        backgroundSize: "26px 26px",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 720, transform: `scale(${s})`, transformOrigin: "640px 360px" }}>
        <svg width="1280" height="720" viewBox="0 0 1280 720" style={{ position: "absolute", left: 0, top: 0 }}>
          {EDGES.map((ed, i) => {
            const a = nodeById(ed.from),
              b = nodeById(ed.to);
            const dp = EIO(seg(p, ed.s, ed.e));
            if (dp <= 0.001) return null;
            return (
              <path
                key={i}
                d={edgePath(a, b)}
                fill="none"
                stroke="#c3c3d0"
                strokeWidth="3"
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - dp}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {NODES.map((n) => {
          const ap = seg(p, n.t, n.t + 0.08);
          if (ap <= 0) return null;
          const sc = OB(ap);
          const badge = n.ok === null ? 0 : OB(seg(p, 0.78 + (n.y / 720) * 0.06, 0.86 + (n.y / 720) * 0.06));
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.x,
                top: n.y,
                width: NW,
                height: NH,
                background: "#ffffff",
                border: n.ok === false && badge > 0.3 ? "1.5px solid #f3c0c8" : "1.5px solid #e2e2ea",
                borderRadius: 16,
                boxShadow: "0 10px 26px rgba(26,26,46,0.08)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 18px",
                boxSizing: "border-box",
                opacity: Math.min(1, ap * 2),
                transform: `scale(${sc})`,
              }}
            >
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: n.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 17.5, fontWeight: 700, color: "#222222", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>{n.label}</span>
              {badge > 0.01 && n.ok === true && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "#1a7f50",
                    border: "3px solid #fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${badge})`,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5l2.6 2.6L10 3.5" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {badge > 0.01 && n.ok === false && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "#c13515",
                    border: "3px solid #fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${badge})`,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── SCENA 3 — Da Reglo alla Motorizzazione ───────────── */
const WL = { x: 55, y: 90, w: 540, h: 560 };
const WR = { x: 685, y: 90, w: 540, h: 560 };
const CW = 440,
  CH = 84;
const SLOT_L = [
  { x: WL.x + 50, y: 260 },
  { x: WL.x + 50, y: 364 },
  { x: WL.x + 50, y: 468 },
];
const TARGET = { x: WR.x + 50, y: 364 };
const GRAB = { x: SLOT_L[1].x + 230, y: SLOT_L[1].y + 40 };
const DROPCUR = { x: TARGET.x + 230, y: TARGET.y + 40 };
const CTRL = { x: 640, y: 190 };
const quad = (a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, u: number): Pt => [
  (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
];
function RCard({
  x,
  y,
  name,
  sub,
  color,
  extra,
  children,
}: {
  x: number;
  y: number;
  name: string;
  sub: string;
  color: [string, string];
  extra?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={Object.assign(
        {
          position: "absolute",
          left: x,
          top: y,
          width: CW,
          height: CH,
          background: "#ffffff",
          border: "1.5px solid #e6e6e6",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 18px",
          boxSizing: "border-box",
          boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
        } as React.CSSProperties,
        extra,
      )}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: color[0],
          color: color[1],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {name
          .split(" ")
          .map((w) => w[0])
          .join("")}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#222222", letterSpacing: "-0.2px" }}>{name}</span>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: "#8a8a8a" }}>{sub}</span>
      </span>
      {children}
    </div>
  );
}
function DragScene({ progress: p, localTime }: SceneProps) {
  const moveIn = EIO(seg(p, 0.02, 0.14));
  const dragU = EIO(seg(p, 0.18, 0.58));
  const dragging = p >= 0.16 && p < 0.58;
  const dropped = p >= 0.58;
  let cur: Pt;
  if (p < 0.18) cur = [lerp(1000, GRAB.x, moveIn), lerp(670, GRAB.y, moveIn)];
  else if (p < 0.58) cur = quad(GRAB, CTRL, DROPCUR, dragU);
  else {
    const away = EIO(seg(p, 0.66, 0.82));
    cur = [lerp(DROPCUR.x, 1060, away), lerp(DROPCUR.y, 640, away)];
  }
  const cardPos = dragging ? [cur[0] - 230, cur[1] - 40] : dropped ? [TARGET.x, TARGET.y] : [SLOT_L[1].x, SLOT_L[1].y];
  const settle = OB(seg(p, 0.58, 0.7));
  const liftT = seg(p, 0.14, 0.18);
  const lift = dragging ? EO(liftT) : dropped ? 1 - settle : 0;
  const rot = -3.5 * lift,
    sc = 1 + 0.06 * lift;
  const reflow = EIO(seg(p, 0.72, 0.84));
  const card3y = lerp(SLOT_L[2].y, SLOT_L[1].y, reflow);
  const check = OB(seg(p, 0.74, 0.84));
  const targetPulse = p > 0.22 && p < 0.58 ? 0.45 + 0.3 * Math.sin(localTime * 5) : 0;
  const zi = EIO(seg(p, 0.08, 0.2)),
    zo = EIO(seg(p, 0.8, 0.94));
  const follow = zi * (1 - zo);
  const s = 1 + 0.14 * follow;
  let fx = lerp(640, cur[0], follow * 0.7),
    fy = lerp(360, cur[1], follow * 0.7);
  fx = Math.max(640 / s, Math.min(1280 - 640 / s, fx));
  fy = Math.max(360 / s, Math.min(720 - 360 / s, fy));
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(150deg, #e8eaf0 0%, #dfe2ea 100%)", fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1280,
          height: 720,
          transform: `translate(${640 - fx * s}px, ${360 - fy * s}px) scale(${s})`,
          transformOrigin: "0 0",
        }}
      >
        <div style={{ position: "absolute", left: WL.x, top: WL.y, width: WL.w, height: WL.h, background: "#ffffff", borderRadius: 20, boxShadow: "0 30px 80px rgba(26,26,46,0.18)", overflow: "hidden" }}>
          <div style={{ height: 46, background: "#f7f7f7", borderBottom: "1px solid #ececec", display: "flex", alignItems: "center", padding: "0 16px", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            <span style={{ marginLeft: 12, background: "#ffffff", border: "1px solid #e6e6e6", borderRadius: 8, padding: "5px 14px", fontSize: 13, fontWeight: 600, color: "#555555" }}>Reglo — Guide</span>
          </div>
          <div style={{ padding: "24px 50px 0" }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: "#222222", letterSpacing: "-0.4px" }}>Guide</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: WR.x, top: WR.y, width: WR.w, height: WR.h, background: "#f4f6fa", borderRadius: 20, boxShadow: "0 30px 80px rgba(26,26,46,0.18)", overflow: "hidden" }}>
          <div style={{ height: 46, background: "#f7f7f7", borderBottom: "1px solid #ececec", display: "flex", alignItems: "center", padding: "0 16px", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            <span style={{ marginLeft: 12, background: "#ffffff", border: "1px solid #e6e6e6", borderRadius: 8, padding: "5px 14px", fontSize: 13, fontWeight: 600, color: "#555555" }}>Portale Motorizzazione</span>
          </div>
          <div style={{ height: 54, background: "#1f3d7a", display: "flex", alignItems: "center", padding: "0 26px", gap: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#1f3d7a" }}>A</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.2px" }}>Portale Motorizzazione</span>
            <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Area autoscuole</span>
          </div>
          <div style={{ padding: "20px 50px 0" }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#26334d", letterSpacing: "-0.3px" }}>Guide certificate</span>
          </div>
        </div>
        <RCard x={SLOT_L[0].x} y={SLOT_L[0].y} name="Marco Rossi" sub="Guida · Ven 09:00" color={["#dbeafe", "#1e3a5f"]} />
        {(dragging || dropped) && (
          <div style={{ position: "absolute", left: SLOT_L[1].x, top: SLOT_L[1].y, width: CW, height: CH, border: "2px dashed #d5d5d5", borderRadius: 16, boxSizing: "border-box", opacity: 1 - reflow }} />
        )}
        <RCard x={SLOT_L[2].x} y={card3y} name="Sara Neri" sub="Guida · Sab 11:30" color={["#dcfce7", "#15803d"]} />
        <RCard x={TARGET.x} y={260} name="Luca Marino" sub="Guida certificata" color={["#ede9fe", "#5b21b6"]} />
        {targetPulse > 0 && (
          <div style={{ position: "absolute", left: TARGET.x, top: TARGET.y, width: CW, height: CH, border: "2px dashed #9fc3f0", background: "rgba(207,224,251,0.3)", borderRadius: 16, boxSizing: "border-box", opacity: targetPulse }} />
        )}
        <RCard
          x={cardPos[0]}
          y={cardPos[1]}
          name="Giulia Bianchi"
          sub={dropped && check > 0.5 ? "Guida certificata" : "Guida · Gio 17:00"}
          color={["#fce7f0", PINK]}
          extra={{
            transform: `rotate(${rot}deg) scale(${sc})`,
            boxShadow: lift > 0.05 ? `0 ${10 + 22 * lift}px ${20 + 30 * lift}px rgba(26,26,46,${0.1 + 0.16 * lift})` : "0 4px 14px rgba(0,0,0,0.05)",
            zIndex: 5,
          }}
        >
          {check > 0.01 && (
            <span
              style={{
                position: "absolute",
                top: -11,
                right: -11,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#1a7f50",
                border: "3px solid #ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${check})`,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                <path d="M2 6.5l2.6 2.6L10 3.5" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </RCard>
        <svg width="26" height="30" viewBox="0 0 14 20" style={{ position: "absolute", left: cur[0], top: cur[1], zIndex: 10, transform: dragging ? "scale(0.92)" : "scale(1)" }}>
          <path d="M0.5 0.5L0.5 16.5L4.6 12.7L7.3 19L10.2 17.8L7.5 11.6L13 11.6Z" fill="#111111" stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/* ───────────── Wrappers (loop rAF) ───────────── */

/** Embed verticale per lo splash News (schermo interno pieno, camera panoramica). */
export function RegloEmbed() {
  const PW = 451,
    PH = 788,
    K = PH / 720,
    CWv = 1280 * K;
  const clampPan = (x: number) => Math.max(PW - CWv, Math.min(0, x));
  const [clock, setClock] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      setClock((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const D = [4.5, 6, 6],
    TOT = D[0] + D[1] + D[2];
  const t = clock % TOT;
  let idx = 0,
    lt = t;
  for (let i = 0; i < D.length; i++) {
    if (lt < D[i]) {
      idx = i;
      break;
    }
    lt -= D[i];
    idx = i;
  }
  const prog = Math.min(0.999, lt / D[idx]);
  let Comp: (props: SceneProps) => React.ReactElement,
    sprog: number,
    panX: number;
  if (idx === 0) {
    Comp = RoadScene;
    sprog = 0.42 + 0.3 * prog;
    panX = (PW - CWv) / 2;
  } else if (idx === 1) {
    Comp = FlowScene;
    sprog = prog;
    panX = clampPan(PW / 2 - lerp(220, 950, EIO(prog)) * K);
  } else {
    Comp = DragScene;
    sprog = prog;
    panX = clampPan(PW / 2 - lerp(340, 950, EIO(prog)) * K);
  }
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 1280, height: 720, transform: `translate(${panX}px, 0px) scale(${K})`, transformOrigin: "top left" }}>
        <Comp progress={sprog} localTime={sprog * (idx === 0 ? 11 : 6)} />
      </div>
    </div>
  );
}

/** Clip 16:9 in loop per il modale News. */
function makeClip(Comp: (props: SceneProps) => React.ReactElement, dur: number) {
  return function Clip() {
    const [p, setP] = React.useState(0);
    React.useEffect(() => {
      let raf = 0;
      const t0 = performance.now();
      const loop = (n: number) => {
        setP((((n - t0) / 1000 / dur) % 1));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, []);
    return (
      <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", overflow: "hidden", borderRadius: 16 }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 1280, height: 720, transform: "scale(0.45)", transformOrigin: "top left" }}>
          <Comp progress={p} localTime={p * dur} />
        </div>
      </div>
    );
  };
}
export const RegloClipRoad = makeClip(RoadScene, 11);
export const RegloClipRinnovi = makeClip(FlowScene, 6);
export const RegloClipGuide = makeClip(DragScene, 6);
