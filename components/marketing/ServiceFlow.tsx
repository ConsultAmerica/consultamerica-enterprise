/**
 * A small horizontal diagram of the delivery approach, drawn from the step
 * titles so it can never drift out of sync with the list underneath it.
 *
 * It repeats information that is also in the ordered list below, so it is
 * aria-hidden and the list is the accessible version. On narrow screens it is
 * hidden outright rather than squashed.
 */

const ACCENTS = ["#1d6fe0", "#22c7e6", "#2f6fd0", "#1aa8c4", "#3558b8"] as const;

export function ServiceFlow({ steps, cap }: { steps: readonly string[]; cap: number }) {
  if (steps.length < 2) return null;
  const accent = ACCENTS[cap % ACCENTS.length];

  return (
    <div className="svc-flow" aria-hidden>
      {steps.map((s, i) => (
        <div className="svc-flow-node" key={s}>
          <span className="svc-flow-dot" style={{ borderColor: accent }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="svc-flow-label">{s}</span>
          {i < steps.length - 1 ? <span className="svc-flow-line" aria-hidden /> : null}
        </div>
      ))}
    </div>
  );
}
