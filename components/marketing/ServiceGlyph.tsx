/**
 * The hero visual on a service page.
 *
 * There is no stock photograph of "Oracle HCM" or "data governance", and
 * reusing the homepage photos would repeat the same five images across 25
 * pages. So each page gets a schematic drawn deterministically from its slug:
 * same slug always produces the same figure, and no two services produce the
 * same one. The accent shifts along the brand's blue-to-cyan ramp by
 * capability, so the five groups read as families.
 *
 * Purely decorative — aria-hidden, no text, nothing a screen reader needs.
 */

/** FNV-1a. Small, stable, and good enough to spread 25 slugs apart. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 0..1 generator seeded from the hash (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Accent per capability, walking the brand blue -> cyan ramp. */
const ACCENTS = [
  ["#1d6fe0", "#3b8ef0"], // Engineering
  ["#22c7e6", "#5bd9f2"], // AI & Data
  ["#2f6fd0", "#49b6e8"], // Oracle Cloud
  ["#1aa8c4", "#49d2e0"], // Enterprise Transformation
  ["#3558b8", "#2f9ad6"], // Managed Services
] as const;

const W = 1200;
const H = 514; // ~21:9

export function ServiceGlyph({ slug, cap }: { slug: string; cap: number }) {
  const seed = hash(slug);
  const rand = rng(seed);
  const [a1, a2] = ACCENTS[cap % ACCENTS.length];
  const id = `g-${seed.toString(36)}`;

  // A column of nodes per band, joined left to right. The band count and the
  // vertical placement are what make each service look different.
  const bands = 4 + (seed % 3); // 4..6
  const cols: { x: number; ys: number[] }[] = [];
  for (let b = 0; b < bands; b++) {
    const x = ((b + 1) / (bands + 1)) * W;
    const n = 2 + Math.floor(rand() * 3); // 2..4 nodes
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      ys.push(H * (0.2 + (0.6 * (i + 0.5)) / n) + (rand() - 0.5) * 54);
    }
    cols.push({ x, ys });
  }

  const links: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
  for (let b = 0; b < cols.length - 1; b++) {
    for (const y1 of cols[b].ys) {
      for (const y2 of cols[b + 1].ys) {
        // thin out the graph so it reads as structure, not a mesh
        if (rand() > 0.52) continue;
        links.push({ x1: cols[b].x, y1, x2: cols[b + 1].x, y2, o: 0.16 + rand() * 0.34 });
      }
    }
  }

  return (
    <svg className="svc-glyph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden role="presentation">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b1220" />
          <stop offset="55%" stopColor="#111c31" />
          <stop offset="100%" stopColor="#0d1526" />
        </linearGradient>
        <linearGradient id={`${id}-ln`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={a1} />
          <stop offset="100%" stopColor={a2} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.72" cy="0.3" r="0.75">
          <stop offset="0%" stopColor={a2} stopOpacity="0.3" />
          <stop offset="100%" stopColor={a2} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-grid`} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#ffffff" strokeOpacity="0.045" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width={W} height={H} fill={`url(#${id}-bg)`} />
      <rect width={W} height={H} fill={`url(#${id}-grid)`} />
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />

      <g stroke={`url(#${id}-ln)`} fill="none" strokeWidth="1.25">
        {links.map((l, i) => (
          <path
            key={i}
            // gentle S-curve between columns rather than a straight chord
            d={`M${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`}
            strokeOpacity={l.o}
          />
        ))}
      </g>

      {cols.map((c, bi) =>
        c.ys.map((y, i) => {
          const r = bi === cols.length - 1 ? 7 : 5;
          return (
            <g key={`${bi}-${i}`}>
              <circle cx={c.x} cy={y} r={r + 7} fill={a2} fillOpacity="0.1" />
              <circle cx={c.x} cy={y} r={r} fill="#0b1220" stroke={`url(#${id}-ln)`} strokeWidth="1.6" />
            </g>
          );
        }),
      )}
    </svg>
  );
}
