"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendSecondRoundAction } from "@/app/admin/applications/actions";

/**
 * The AI interview result, as a recruiter reads it.
 *
 * A client component for one reason only: the second-round button needs to
 * report what happened inline. Everything above it is static, and every value
 * is formatted on the server before it crosses the boundary, so this component
 * does no date, number or locale work and cannot produce a hydration mismatch.
 *
 * READING ORDER IS THE DECISION THIS PANEL MAKES. Score first, because "is this
 * person worth my next hour" is the question the panel exists to answer. The
 * incomplete warning sits above the score rather than below it, since it
 * changes what the number means. Then the headline signal, then the per
 * competency breakdown, then strengths and concerns, then the evidence quotes
 * that back them up. The action is last, after the case for it has been made:
 * a button to invite somebody placed above the reasons to invite them invites
 * clicking without reading.
 */

export type AiInterviewPanelProps = {
  applicationId: string;
  /** "8.5", straight from NUMERIC. Null when there is no usable score. */
  score: string | null;
  verdict: string | null;
  /** INVITED, COMPLETED, ... humanised by the server. */
  statusLabel: string;
  /** Formatted on the server, in the dashboard's one fixed locale. */
  launchedLabel: string | null;
  completedLabel: string | null;
  secondRoundSentLabel: string | null;
  report: {
    recommendation: string | null;
    keySignal: string | null;
    confidence: string | null;
    incomplete: boolean;
    competencies: { label: string; score: number | null }[];
    strengths: string[];
    concerns: string[];
    evidence: { point: string; quote: string | null }[];
  } | null;
  /** Decided by secondRoundEligibility on the server. The action re-checks it. */
  canSendSecondRound: boolean;
  /** Why the button is absent, when it is. Null when it is shown. */
  blockedReason: string | null;
};

/**
 * The competency bar.
 *
 * A width, not a chart library. Five rows of "how did they do on this" is the
 * one shape that reads faster as a bar than as a number, and a bar is a div
 * with a percentage: pulling in a charting dependency for it would ship
 * kilobytes to render something CSS already does.
 */
function CompetencyRow({ label, score }: { label: string; score: number | null }) {
  return (
    <li className="ai-comp">
      <span className="ai-comp-label">{label}</span>
      <span className="ai-comp-bar" aria-hidden>
        {/* Null is rendered as an empty track rather than a zero-width bar, so
            "not assessed" does not look like "scored nothing". */}
        {score !== null ? (
          <span className="ai-comp-fill" style={{ width: `${Math.round(score * 10)}%` }} />
        ) : null}
      </span>
      <span className={`ai-comp-score${score === null ? " is-none" : ""}`}>
        {score === null ? "Not assessed" : score.toFixed(1)}
      </span>
    </li>
  );
}

export function AiInterviewPanel(props: AiInterviewPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const send = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await sendSecondRoundAction(props.applicationId);
      if (!result.ok) {
        setMessage({ tone: "err", text: result.error });
        // Refreshed even on failure: the commonest refusal is "already sent",
        // which means the page is out of date and the panel should now be
        // showing the sent stamp instead of the button.
        router.refresh();
        return;
      }
      setMessage({ tone: "ok", text: result.message ?? "Invitation sent." });
      router.refresh();
    });
  };

  const report = props.report;

  return (
    <>
      {props.report?.incomplete ? (
        <p className="ai-warn" role="note">
          ConsultHire marked this interview incomplete, so the score is not a judgement on the
          candidate. Read it as partial evidence.
        </p>
      ) : null}

      <div className="ai-score-row">
        {props.score !== null ? (
          <p className="ws-score">
            <strong>{props.score}</strong>
            <span className="ws-muted">out of 10</span>
          </p>
        ) : (
          <p className="ws-score">
            <strong className="is-none">—</strong>
            <span className="ws-muted">
              {props.statusLabel === "Completed"
                ? "completed without a score"
                : "no score yet"}
            </span>
          </p>
        )}
        <span className="ws-pill">{props.statusLabel}</span>
      </div>

      <dl className="ws-dl">
        {props.verdict ? (
          <>
            <dt>Verdict</dt>
            <dd>{props.verdict}</dd>
          </>
        ) : null}
        {report?.recommendation ? (
          <>
            <dt>Recommendation</dt>
            <dd>{report.recommendation}</dd>
          </>
        ) : null}
        {report?.confidence ? (
          <>
            <dt>Confidence</dt>
            <dd>{report.confidence}</dd>
          </>
        ) : null}
        <dt>Invited</dt>
        <dd>{props.launchedLabel ?? <span className="ws-muted">Not recorded</span>}</dd>
        <dt>Completed</dt>
        <dd>{props.completedLabel ?? <span className="ws-muted">Not yet</span>}</dd>
      </dl>

      {report?.keySignal ? (
        <>
          <h3>Key signal</h3>
          <p className="ca-crm-prose">{report.keySignal}</p>
        </>
      ) : null}

      {report && report.competencies.length > 0 ? (
        <>
          <h3>Score breakdown</h3>
          <ul className="ai-comps">
            {report.competencies.map((competency) => (
              <CompetencyRow
                key={competency.label}
                label={competency.label}
                score={competency.score}
              />
            ))}
          </ul>
        </>
      ) : null}

      {report && report.strengths.length > 0 ? (
        <>
          <h3>Strengths</h3>
          <ul className="ai-points">
            {report.strengths.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}

      {report && report.concerns.length > 0 ? (
        <>
          <h3>Concerns</h3>
          <ul className="ai-points is-concern">
            {report.concerns.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}

      {report && report.evidence.length > 0 ? (
        <>
          <h3>Evidence</h3>
          <ul className="ai-evidence">
            {report.evidence.map((item) => (
              <li key={item.point}>
                <p>{item.point}</p>
                {/* The candidate's own words, marked as a quotation rather than
                    run together with our summary of them: the distinction
                    between what somebody said and what a model concluded from
                    it is the whole value of this section. */}
                {item.quote ? <blockquote className="ai-quote">{item.quote}</blockquote> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {props.score !== null && !report ? (
        <p className="ws-note">
          A score arrived without a detailed report. The number is the whole result for this
          interview.
        </p>
      ) : null}

      <div className="ai-action">
        {props.secondRoundSentLabel ? (
          <p className="ws-note ai-sent">
            Second-round invitation sent {props.secondRoundSentLabel}. It can only be sent once, so
            this cannot be repeated from here. Email the candidate directly to follow up.
          </p>
        ) : props.canSendSecondRound ? (
          <>
            <button type="button" className="ws-btn primary" disabled={pending} onClick={send}>
              {pending ? "Sending…" : "Send second-round invitation"}
            </button>
            <p className="ws-note">
              Emails the candidate to invite them to a second conversation with a person. It does
              not promise a date or an outcome, and it can only be sent once.
            </p>
          </>
        ) : props.blockedReason ? (
          <p className="ws-note">{props.blockedReason}</p>
        ) : null}

        {message ? (
          <p
            className={`apb-msg ${message.tone}`}
            role={message.tone === "err" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </>
  );
}
