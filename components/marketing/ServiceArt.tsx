/**
 * The hero diagram on a service page.
 *
 * Replaces an earlier generic node-graph that rendered as a dark slab and
 * looked identical on all 25 pages. Each service now maps to a motif that
 * actually depicts its field — a ledger grid for Oracle ERP, a retrieval
 * pipeline for GenAI, a test pyramid for quality — and carries its own labels,
 * so services sharing a motif still render different content.
 *
 * Light background on purpose: the page body is light, and a near-black panel
 * directly under the dark hero read as one heavy block.
 *
 * Decorative. The labels are drawn text, and every section of the page states
 * the same information in prose, so the figure is aria-hidden.
 */

type Motif =
  | "pipeline"
  | "cluster"
  | "hub"
  | "strangler"
  | "pyramid"
  | "retrieval"
  | "forecast"
  | "layers"
  | "extract"
  | "shield"
  | "grid"
  | "chain"
  | "people"
  | "bars"
  | "zones"
  | "funnel"
  | "topology"
  | "queue"
  | "slo"
  | "loop";

type Art = { motif: Motif; labels: readonly string[] };

/** Every slug gets a motif that depicts its field, plus its own labels. */
const ART: Record<string, Art> = {
  // Engineering
  "cloud-native-development": { motif: "pipeline", labels: ["Commit", "Build", "Test", "Deploy", "Observe"] },
  "platform-engineering": { motif: "cluster", labels: ["Golden path", "Environments", "Observability", "Policy"] },
  "api-systems-integration": { motif: "hub", labels: ["ERP", "CRM", "Warehouse", "Partner EDI", "Storefront"] },
  "application-modernization": { motif: "strangler", labels: ["Legacy", "Facade", "Extracted services"] },
  "quality-test-automation": { motif: "pyramid", labels: ["End-to-end", "Integration", "Unit"] },

  // AI & Data
  "genai-assistants-copilots": { motif: "retrieval", labels: ["Documents", "Chunk + embed", "Retrieve", "Answer + cite"] },
  "forecasting-machine-learning": { motif: "forecast", labels: ["History", "Forecast", "Confidence band"] },
  "data-platform-warehousing": { motif: "layers", labels: ["Raw", "Cleaned", "Marts", "BI"] },
  "document-contract-intelligence": { motif: "extract", labels: ["Party", "Term", "Renewal", "Value"] },
  "data-governance-guardrails": { motif: "shield", labels: ["Classify", "Mask", "Audit"] },

  // Oracle Cloud
  "oracle-erp": { motif: "grid", labels: ["General Ledger", "Payables", "Receivables", "Fixed Assets", "Cash", "Procurement"] },
  "oracle-scm": { motif: "chain", labels: ["Supplier", "Inventory", "Manufacturing", "Order", "Customer"] },
  "oracle-hcm": { motif: "people", labels: ["Core HR", "Absence", "Payroll", "Talent"] },
  "oracle-epm": { motif: "bars", labels: ["Actual", "Budget", "Forecast", "Variance"] },
  "oracle-cloud-infrastructure": { motif: "zones", labels: ["Tenancy", "Network", "Database", "Identity"] },

  // Enterprise Transformation
  "finance-transformation": { motif: "bars", labels: ["Day 1", "Day 3", "Day 5", "Day 7"] },
  "procurement-sourcing": { motif: "funnel", labels: ["Total spend", "Addressable", "Sourced", "Realised"] },
  "supply-chain-operations": { motif: "chain", labels: ["Demand", "Plan", "Supply", "Fulfil", "Deliver"] },
  "process-automation": { motif: "pipeline", labels: ["Trigger", "Validate", "Route", "Approve", "Post"] },
  "operating-model-design": { motif: "topology", labels: ["Stream-aligned", "Platform", "Enabling"] },

  // Managed Services
  "application-support": { motif: "queue", labels: ["Raised", "Triaged", "Resolved", "Root cause"] },
  "cloud-infrastructure-operations": { motif: "zones", labels: ["Patching", "Backup", "Capacity", "Cost"] },
  "monitoring-sre": { motif: "slo", labels: ["Latency", "SLO", "Error budget"] },
  "continuous-improvement": { motif: "loop", labels: ["Measure", "Prioritise", "Ship", "Verify"] },
  "specialized-talent": { motif: "people", labels: ["Engineering", "Oracle", "Data", "Architecture"] },
};

const W = 1200;

/**
 * Canvas height per motif. A five-stage pipeline needs far less vertical room
 * than a six-cell module grid, and forcing them all into one box left large
 * dead margins on the sparse ones.
 */
const HEIGHTS: Record<Motif, number> = {
  pipeline: 250,
  cluster: 400,
  hub: 400,
  strangler: 400,
  pyramid: 400,
  retrieval: 300,
  forecast: 380,
  layers: 400,
  extract: 400,
  shield: 400,
  grid: 400,
  chain: 290,
  people: 350,
  bars: 380,
  zones: 400,
  funnel: 400,
  topology: 320,
  queue: 340,
  slo: 380,
  loop: 400,
};

const INK = "#5a6B82";
const LINE = "#d9e1ec";

/** Accent per capability, along the brand blue-to-cyan ramp. */
const ACCENTS = ["#1d6fe0", "#22a8d6", "#2f6fd0", "#1aa8c4", "#3558b8"] as const;

function Label({ x, y, children, anchor = "middle" }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="13" fontWeight="600" fill={INK} fontFamily="inherit">
      {children}
    </text>
  );
}

function Mono({ x, y, children, anchor = "middle", fill = INK }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end"; fill?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="10.5" fontWeight="600" letterSpacing="1.4" fill={fill} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
      {children.toUpperCase()}
    </text>
  );
}

function Scene({ motif, labels, a, H }: { motif: Motif; labels: readonly string[]; a: string; H: number }) {
  const cy = H / 2;

  switch (motif) {
    // ---------------------------------------------------------- linear stages
    case "pipeline": {
      const n = labels.length;
      const gap = (W - 200) / (n - 1);
      return (
        <>
          <line x1={100} y1={cy} x2={W - 100} y2={cy} stroke={LINE} strokeWidth="2" />
          {labels.map((l, i) => {
            const x = 100 + i * gap;
            return (
              <g key={l}>
                <circle cx={x} cy={cy} r="26" fill="#fff" stroke={a} strokeWidth="2" />
                <circle cx={x} cy={cy} r="7" fill={a} opacity={0.22} />
                <Mono x={x} y={cy + 4} fill={a}>{String(i + 1).padStart(2, "0")}</Mono>
                <Label x={x} y={cy + 58}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ------------------------------------------------- platform / paved road
    case "cluster": {
      return (
        <>
          <rect x={120} y={96} width={W - 240} height={208} rx="16" fill="#fff" stroke={LINE} strokeWidth="2" />
          <Mono x={148} y={128} anchor="start" fill={a}>Internal platform</Mono>
          {labels.map((l, i) => {
            const x = 156 + i * ((W - 312) / labels.length);
            const w = (W - 312) / labels.length - 18;
            return (
              <g key={l}>
                <rect x={x} y={152} width={w} height={116} rx="11" fill={a} opacity={0.07} />
                <rect x={x} y={152} width={w} height={116} rx="11" fill="none" stroke={a} strokeOpacity={0.35} />
                <Label x={x + w / 2} y={216}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ---------------------------------------------------- integration hub
    case "hub": {
      const r = 128;
      return (
        <>
          <circle cx={W / 2} cy={cy} r="54" fill={a} opacity={0.1} />
          <circle cx={W / 2} cy={cy} r="54" fill="#fff" fillOpacity={0.9} stroke={a} strokeWidth="2" />
          <Mono x={W / 2} y={cy + 4} fill={a}>API</Mono>
          {labels.map((l, i) => {
            const ang = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
            const x = W / 2 + Math.cos(ang) * (r + 150);
            const y = cy + Math.sin(ang) * r;
            return (
              <g key={l}>
                <line x1={W / 2 + Math.cos(ang) * 56} y1={cy + Math.sin(ang) * 56} x2={x} y2={y} stroke={a} strokeOpacity={0.3} strokeWidth="1.5" />
                <rect x={x - 62} y={y - 17} width="124" height="34" rx="9" fill="#fff" stroke={LINE} strokeWidth="1.5" />
                <Label x={x} y={y + 5}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ------------------------------------------------------ strangler fig
    case "strangler": {
      return (
        <>
          <rect x={110} y={120} width={200} height={160} rx="12" fill="#fff" stroke={LINE} strokeWidth="2" strokeDasharray="6 5" />
          <Label x={210} y={206}>{labels[0]}</Label>
          <rect x={470} y={120} width={120} height={160} rx="12" fill={a} opacity={0.1} />
          <rect x={470} y={120} width={120} height={160} rx="12" fill="none" stroke={a} strokeWidth="2" />
          <Label x={530} y={206}>{labels[1]}</Label>
          <line x1={310} y1={200} x2={470} y2={200} stroke={LINE} strokeWidth="2" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <line x1={590} y1={200} x2={760} y2={130 + i * 70} stroke={a} strokeOpacity={0.32} strokeWidth="1.5" />
              <rect x={760} y={108 + i * 70} width="150" height="44" rx="10" fill="#fff" stroke={a} strokeOpacity={0.45} strokeWidth="1.5" />
              <circle cx={786} cy={130 + i * 70} r="5" fill={a} opacity={0.6} />
            </g>
          ))}
          <Mono x={985} y={204} anchor="start" fill={a}>{labels[2]}</Mono>
        </>
      );
    }

    // -------------------------------------------------------- test pyramid
    case "pyramid": {
      const rows = labels.length;
      return (
        <>
          {labels.map((l, i) => {
            const idx = rows - 1 - i;
            const w = 180 + idx * 190;
            const y = 108 + i * 68;
            return (
              <g key={l}>
                <rect x={W / 2 - w / 2} y={y} width={w} height="56" rx="8" fill={a} opacity={0.07 + idx * 0.06} />
                <rect x={W / 2 - w / 2} y={y} width={w} height="56" rx="8" fill="none" stroke={a} strokeOpacity={0.4} />
                <Label x={W / 2} y={y + 34}>{l}</Label>
              </g>
            );
          })}
          <Mono x={W / 2} y={H - 38} fill={a}>Fast and many at the base</Mono>
        </>
      );
    }

    // ----------------------------------------------------- RAG / retrieval
    case "retrieval": {
      const n = labels.length;
      const gap = (W - 260) / (n - 1);
      return (
        <>
          {labels.map((l, i) => {
            const x = 130 + i * gap;
            return (
              <g key={l}>
                {i < n - 1 ? <line x1={x + 58} y1={cy} x2={x + gap - 58} y2={cy} stroke={a} strokeOpacity={0.35} strokeWidth="1.8" markerEnd="" /> : null}
                <rect x={x - 58} y={cy - 40} width="116" height="80" rx="12" fill="#fff" stroke={i === n - 1 ? a : LINE} strokeWidth="2" />
                {i === 0
                  ? [0, 1, 2].map((k) => <rect key={k} x={x - 30} y={cy - 22 + k * 14} width="60" height="6" rx="3" fill={a} opacity={0.3} />)
                  : null}
                {i === 1
                  ? [0, 1, 2, 3].map((k) => <rect key={k} x={x - 32 + (k % 2) * 34} y={cy - 18 + Math.floor(k / 2) * 22} width="30" height="14" rx="4" fill={a} opacity={0.25} />)
                  : null}
                {i === 2 ? <circle cx={x} cy={cy} r="17" fill="none" stroke={a} strokeOpacity={0.55} strokeWidth="2" /> : null}
                {i === n - 1 ? <path d={`M${x - 18} ${cy} l12 12 l24 -24`} fill="none" stroke={a} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : null}
                <Label x={x} y={cy + 66}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // --------------------------------------------------------- forecasting
    case "forecast": {
      const base = 300;
      const hist = Array.from({ length: 8 }, (_, i) => [130 + i * 52, base - 40 - Math.sin(i * 0.9) * 46 - i * 6] as const);
      const fut = Array.from({ length: 6 }, (_, i) => [494 + i * 52, base - 88 - Math.sin((i + 8) * 0.9) * 30 - i * 5] as const);
      const band = fut.map(([x, y], i) => [x, y - 14 - i * 7] as const);
      const bandLo = [...fut].reverse().map(([x, y], i) => [x, y + 14 + (fut.length - 1 - i) * 7] as const);
      return (
        <>
          <line x1={110} y1={base} x2={W - 110} y2={base} stroke={LINE} strokeWidth="2" />
          <path d={`M${band.map((p) => p.join(" ")).join(" L")} L${bandLo.map((p) => p.join(" ")).join(" L")} Z`} fill={a} opacity={0.12} />
          <polyline points={hist.map((p) => p.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <polyline points={[hist[hist.length - 1], ...fut].map((p) => p.join(",")).join(" ")} fill="none" stroke={a} strokeWidth="2.4" strokeDasharray="7 5" strokeLinecap="round" />
          {hist.map(([x, y], i) => (<circle key={i} cx={x} cy={y} r="3.4" fill={INK} />))}
          <line x1={480} y1={110} x2={480} y2={base} stroke={LINE} strokeWidth="1.5" strokeDasharray="4 4" />
          <Label x={300} y={base + 30}>{labels[0]}</Label>
          <Label x={660} y={base + 30}>{labels[1]}</Label>
          <Mono x={W - 120} y={132} anchor="end" fill={a}>{labels[2]}</Mono>
        </>
      );
    }

    // ------------------------------------------------------ warehouse layers
    case "layers": {
      return (
        <>
          {labels.map((l, i) => {
            const y = 96 + i * 62;
            const inset = i * 34;
            return (
              <g key={l}>
                <rect x={180 + inset} y={y} width={W - 360 - inset * 2} height="50" rx="9" fill={a} opacity={0.06 + i * 0.05} />
                <rect x={180 + inset} y={y} width={W - 360 - inset * 2} height="50" rx="9" fill="none" stroke={a} strokeOpacity={0.4} />
                <Label x={W / 2} y={y + 31}>{l}</Label>
                {i < labels.length - 1 ? (
                  <path d={`M${W / 2} ${y + 50} l0 8 m-5 -4 l5 4 l5 -4`} stroke={a} strokeOpacity={0.5} strokeWidth="1.8" fill="none" />
                ) : null}
              </g>
            );
          })}
        </>
      );
    }

    // --------------------------------------------- document field extraction
    case "extract": {
      return (
        <>
          <rect x={150} y={88} width={260} height={224} rx="12" fill="#fff" stroke={LINE} strokeWidth="2" />
          {Array.from({ length: 9 }, (_, k) => (
            <rect key={k} x={178} y={118 + k * 22} width={k % 3 === 2 ? 120 : 204} height="7" rx="3.5" fill={INK} opacity={0.16} />
          ))}
          {labels.map((l, i) => {
            const y = 112 + i * 52;
            return (
              <g key={l}>
                <rect x={196} y={124 + i * 44} width="150" height="20" rx="5" fill={a} opacity={0.18} />
                <path d={`M${410} ${134 + i * 44} C 500 ${134 + i * 44}, 520 ${y + 26}, 600 ${y + 26}`} fill="none" stroke={a} strokeOpacity={0.35} strokeWidth="1.5" />
                <rect x={600} y={y + 6} width="300" height="40" rx="9" fill="#fff" stroke={a} strokeOpacity={0.4} strokeWidth="1.5" />
                <Label x={622} y={y + 31} anchor="start">{l}</Label>
                <Mono x={878} y={y + 31} anchor="end" fill={a}>{`0.9${8 - i}`}</Mono>
              </g>
            );
          })}
          <Mono x={940} y={H - 44} anchor="end" fill={INK}>Confidence per field</Mono>
        </>
      );
    }

    // ------------------------------------------------------------- governance
    case "shield": {
      return (
        <>
          <path d={`M${W / 2} 86 L${W / 2 + 92} 126 L${W / 2 + 92} 214 C ${W / 2 + 92} 268, ${W / 2 + 48} 300, ${W / 2} 316 C ${W / 2 - 48} 300, ${W / 2 - 92} 268, ${W / 2 - 92} 214 L${W / 2 - 92} 126 Z`} fill={a} opacity={0.09} stroke={a} strokeWidth="2" />
          <rect x={W / 2 - 26} y={182} width="52" height="42" rx="7" fill="none" stroke={a} strokeWidth="2.2" />
          <path d={`M${W / 2 - 14} 182 v-13 a14 14 0 0 1 28 0 v13`} fill="none" stroke={a} strokeWidth="2.2" />
          {labels.map((l, i) => {
            const side = i === 0 ? -1 : i === 2 ? 1 : 0;
            const x = W / 2 + side * 300;
            const y = side === 0 ? 346 : 200;
            return (
              <g key={l}>
                <rect x={x - 82} y={y - 20} width="164" height="40" rx="10" fill="#fff" stroke={LINE} strokeWidth="1.5" />
                <Label x={x} y={y + 5}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // --------------------------------------------------------- ERP module grid
    case "grid": {
      const cols = 3;
      const bw = 290;
      const bh = 92;
      return (
        <>
          {labels.map((l, i) => {
            const x = W / 2 - (cols * (bw + 18)) / 2 + (i % cols) * (bw + 18) + 9;
            const y = 108 + Math.floor(i / cols) * (bh + 18);
            return (
              <g key={l}>
                <rect x={x} y={y} width={bw} height={bh} rx="12" fill="#fff" stroke={LINE} strokeWidth="2" />
                <rect x={x} y={y} width="4" height={bh} rx="2" fill={a} opacity={0.75} />
                <Label x={x + 24} y={y + bh / 2 + 5} anchor="start">{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ------------------------------------------------------------ supply chain
    case "chain": {
      const n = labels.length;
      const gap = (W - 220) / (n - 1);
      return (
        <>
          {labels.map((l, i) => {
            const x = 110 + i * gap;
            return (
              <g key={l}>
                {i < n - 1 ? (
                  <path d={`M${x + 44} ${cy} L${x + gap - 50} ${cy} m-9 -6 l9 6 l-9 6`} fill="none" stroke={a} strokeOpacity={0.4} strokeWidth="1.8" strokeLinecap="round" />
                ) : null}
                <rect x={x - 42} y={cy - 42} width="84" height="84" rx="14" fill={a} opacity={0.08} />
                <rect x={x - 42} y={cy - 42} width="84" height="84" rx="14" fill="none" stroke={a} strokeOpacity={0.45} strokeWidth="2" />
                <rect x={x - 19} y={cy - 16} width="38" height="32" rx="5" fill="none" stroke={a} strokeWidth="2" />
                <Label x={x} y={cy + 72}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ------------------------------------------------------------- people / org
    case "people": {
      const n = labels.length;
      const gap = (W - 280) / n;
      return (
        <>
          <circle cx={W / 2} cy={116} r="26" fill={a} opacity={0.14} />
          <circle cx={W / 2} cy={110} r="9" fill="none" stroke={a} strokeWidth="2" />
          <path d={`M${W / 2 - 14} 132 a14 12 0 0 1 28 0`} fill="none" stroke={a} strokeWidth="2" />
          {labels.map((l, i) => {
            const x = 140 + gap / 2 + i * gap;
            return (
              <g key={l}>
                <path d={`M${W / 2} 148 C ${W / 2} 196, ${x} 180, ${x} 224`} fill="none" stroke={a} strokeOpacity={0.3} strokeWidth="1.5" />
                <rect x={x - gap / 2 + 14} y={224} width={gap - 28} height="76" rx="12" fill="#fff" stroke={LINE} strokeWidth="2" />
                <circle cx={x} cy={252} r="7.5" fill="none" stroke={a} strokeWidth="1.8" />
                <path d={`M${x - 11} 272 a11 9 0 0 1 22 0`} fill="none" stroke={a} strokeWidth="1.8" />
                <Label x={x} y={294}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ------------------------------------------------------------ planning bars
    case "bars": {
      const n = labels.length;
      const gap = (W - 300) / n;
      const base = 310;
      const hs = [168, 132, 96, 58];
      return (
        <>
          <line x1={140} y1={base} x2={W - 140} y2={base} stroke={LINE} strokeWidth="2" />
          {labels.map((l, i) => {
            const x = 150 + gap / 2 + i * gap;
            const h = hs[i % hs.length];
            return (
              <g key={l}>
                <rect x={x - 46} y={base - h} width="92" height={h} rx="8" fill={a} opacity={0.14 + i * 0.1} />
                <rect x={x - 46} y={base - h} width="92" height={h} rx="8" fill="none" stroke={a} strokeOpacity={0.4} />
                <Label x={x} y={base + 30}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ------------------------------------------------------- OCI landing zone
    case "zones": {
      return (
        <>
          <rect x={150} y={88} width={W - 300} height={226} rx="16" fill="none" stroke={a} strokeOpacity={0.4} strokeWidth="2" strokeDasharray="8 6" />
          <Mono x={176} y={116} anchor="start" fill={a}>{labels[0]}</Mono>
          {labels.slice(1).map((l, i) => {
            const w = (W - 360) / (labels.length - 1);
            const x = 180 + i * (w + 14);
            return (
              <g key={l}>
                <rect x={x} y={140} width={w - 14} height={146} rx="12" fill="#fff" stroke={LINE} strokeWidth="2" />
                <rect x={x + 18} y={166} width={w - 50} height="8" rx="4" fill={a} opacity={0.3} />
                <rect x={x + 18} y={184} width={(w - 50) * 0.6} height="8" rx="4" fill={a} opacity={0.18} />
                <Label x={x + (w - 14) / 2} y={248}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    // ----------------------------------------------------------- spend funnel
    case "funnel": {
      return (
        <>
          {labels.map((l, i) => {
            const w = 760 - i * 150;
            const y = 102 + i * 58;
            return (
              <g key={l}>
                <rect x={W / 2 - w / 2} y={y} width={w} height="46" rx="8" fill={a} opacity={0.08 + i * 0.07} />
                <rect x={W / 2 - w / 2} y={y} width={w} height="46" rx="8" fill="none" stroke={a} strokeOpacity={0.38} />
                <Label x={W / 2} y={y + 29}>{l}</Label>
              </g>
            );
          })}
          <Mono x={W / 2} y={H - 36} fill={a}>Tracked through to the ledger</Mono>
        </>
      );
    }

    // ------------------------------------------------------- team topology
    case "topology": {
      return (
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={168} y={110 + i * 42} width="330" height="32" rx="7" fill={a} opacity={0.14} />
              <rect x={168} y={110 + i * 42} width="330" height="32" rx="7" fill="none" stroke={a} strokeOpacity={0.35} />
            </g>
          ))}
          <Label x={333} y={268}>{labels[0]}</Label>
          <rect x={560} y={110} width="220" height="116" rx="12" fill="#fff" stroke={LINE} strokeWidth="2" />
          <Label x={670} y={268}>{labels[1]}</Label>
          <rect x={842} y={110} width="190" height="116" rx="12" fill="#fff" stroke={LINE} strokeWidth="2" strokeDasharray="6 5" />
          <Label x={937} y={268}>{labels[2]}</Label>
          {[0, 1, 2].map((i) => (
            <line key={i} x1={498} y1={126 + i * 42} x2={560} y2={168} stroke={a} strokeOpacity={0.28} strokeWidth="1.5" />
          ))}
          <line x1={780} y1={168} x2={842} y2={168} stroke={a} strokeOpacity={0.28} strokeWidth="1.5" />
        </>
      );
    }

    // ------------------------------------------------------------ ticket queue
    case "queue": {
      const n = labels.length;
      const gap = (W - 240) / n;
      return (
        <>
          {labels.map((l, i) => {
            const x = 120 + i * gap;
            const count = 5 - i;
            return (
              <g key={l}>
                <rect x={x} y={104} width={gap - 26} height={190} rx="12" fill="#fff" stroke={LINE} strokeWidth="2" />
                <Mono x={x + 20} y={132} anchor="start" fill={a}>{l}</Mono>
                {Array.from({ length: count }, (_, k) => (
                  <rect key={k} x={x + 20} y={148 + k * 26} width={gap - 66} height="18" rx="5" fill={a} opacity={0.3 - k * 0.04} />
                ))}
                {i < n - 1 ? (
                  <path d={`M${x + gap - 22} 200 l10 0 m-5 -5 l5 5 l-5 5`} fill="none" stroke={a} strokeOpacity={0.5} strokeWidth="1.8" strokeLinecap="round" />
                ) : null}
              </g>
            );
          })}
        </>
      );
    }

    // -------------------------------------------------------------- SLO chart
    case "slo": {
      const base = 300;
      const slo = 192;
      const pts = Array.from({ length: 22 }, (_, i) => [130 + i * 44, base - 30 - Math.abs(Math.sin(i * 0.7)) * 86 - (i > 16 ? (i - 16) * 11 : 0)] as const);
      return (
        <>
          <line x1={110} y1={base} x2={W - 110} y2={base} stroke={LINE} strokeWidth="2" />
          <rect x={110} y={110} width={W - 220} height={slo - 110} fill={a} opacity={0.05} />
          <line x1={110} y1={slo} x2={W - 110} y2={slo} stroke={a} strokeWidth="2" strokeDasharray="7 5" />
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          {pts.filter((p) => p[1] < slo).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.6" fill="#fff" stroke={a} strokeWidth="2.2" />
          ))}
          <Label x={132} y={base + 30} anchor="start">{labels[0]}</Label>
          <Mono x={W - 120} y={slo - 12} anchor="end" fill={a}>{labels[1]}</Mono>
          <Mono x={W - 120} y={136} anchor="end" fill={a}>{labels[2]}</Mono>
        </>
      );
    }

    // ------------------------------------------------------- improvement loop
    case "loop": {
      const r = 104;
      return (
        <>
          <circle cx={W / 2} cy={cy} r={r} fill="none" stroke={a} strokeOpacity={0.3} strokeWidth="2" strokeDasharray="6 7" />
          {labels.map((l, i) => {
            const ang = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
            const x = W / 2 + Math.cos(ang) * r;
            const y = cy + Math.sin(ang) * r;
            const lx = W / 2 + Math.cos(ang) * (r + 92);
            const ly = cy + Math.sin(ang) * (r + 52);
            return (
              <g key={l}>
                <circle cx={x} cy={y} r="15" fill="#fff" stroke={a} strokeWidth="2.4" />
                <circle cx={x} cy={y} r="5" fill={a} opacity={0.5} />
                <Label x={lx} y={ly + 5}>{l}</Label>
              </g>
            );
          })}
        </>
      );
    }

    default:
      return null;
  }
}

export function ServiceArt({ slug, cap }: { slug: string; cap: number }) {
  const art = ART[slug];
  if (!art) return null;
  const a = ACCENTS[cap % ACCENTS.length];
  const gid = `sa-${slug}`;
  const H = HEIGHTS[art.motif];

  return (
    <svg className="svc-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden role="presentation">
      <defs>
        <pattern id={`${gid}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke={a} strokeOpacity="0.055" strokeWidth="1" />
        </pattern>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f3f7fc" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${gid}-bg)`} />
      <rect width={W} height={H} fill={`url(#${gid}-grid)`} />
      <Scene motif={art.motif} labels={art.labels} a={a} H={H} />
    </svg>
  );
}
