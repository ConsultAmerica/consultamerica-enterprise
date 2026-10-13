/**
 * FAQ accordion on native <details>, so it opens with the keyboard and works
 * without JavaScript. Styled by the service pages' .svc-faq rules. Also emits
 * FAQPage structured data built from the same list, so the two cannot differ.
 */
export function IndustryFaq({ faqs }: { faqs: readonly (readonly [string, string])[] }) {
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <>
      <div className="svc-faq">
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        // Escape "<" so no answer text can close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
