/**
 * A candidate's initials, in a colour derived from their identity.
 *
 * WHY A MARK NEXT TO EVERY NAME. A name in a table is a string. A name with a
 * mark beside it is a person, and the eye finds a repeat applicant in a list
 * far faster by colour than by reading. In a queue where the same candidate
 * appears against three different roles, that is the difference between
 * noticing and not.
 *
 * WHY THE COLOUR IS DERIVED, NOT RANDOM. A sum of code points over the seed,
 * so the same person is the same colour on the dashboard, in the applications
 * queue and in the candidate directory. A colour that changes between screens
 * is worse than no colour: it actively misleads. Deterministic also means it
 * is safe to compute on the server, so there is nothing for hydration to
 * disagree about.
 *
 * WHY THESE SIX. Soft backgrounds with dark text, all legible at 13px, and
 * none of them red, amber or green. The avatar identifies a person; it must
 * never be mistaken for a status.
 *
 * Seeded on email rather than name: names are not unique and change with a
 * correction, email is the candidate table's natural key.
 */

type Props = {
  /** The displayed name. Used for the initials only. */
  name: string;
  /** Stable identity, used to pick the colour. The candidate's email. */
  seed: string;
  /** px. 36 in tables, larger on a profile header. */
  size?: number;
};

const TONES = 6;

function tone(seed: string): number {
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i);
  return total % TONES;
}

/** Up to two initials, falling back to the first character of the seed. */
function initials(name: string, seed: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (seed.trim()[0] ?? "?").toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, seed, size = 36 }: Props) {
  return (
    <span
      className={`av c${tone(seed)}`}
      /* Size is the only thing that varies per use, so it is the only thing
         set inline; the six colours stay in the stylesheet where they can be
         changed once. */
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      aria-hidden
    >
      {initials(name, seed)}
    </span>
  );
}
