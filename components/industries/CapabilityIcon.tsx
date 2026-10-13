import type { CapabilityFamily } from "@/data/industries";

/** Line icons for the five capability families, in the site's 24px stroke style. */
const PATHS: Record<CapabilityFamily, string> = {
  // a cloud with a database cylinder: the Oracle Cloud applications
  "Oracle Cloud": "M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7zM9.5 13h5M9.5 15.5h5",
  // spark
  AI: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  // stacked database
  Data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  // two nodes joined through a hub
  Integration: "M5 7a2 2 0 1 0 0-.01M19 7a2 2 0 1 0 0-.01M12 19a2 2 0 1 0 0-.01M6.6 8.2 10.6 17M17.4 8.2 13.4 17M7 7h10",
  // server rack
  Cloud: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
};

export function CapabilityIcon({ family }: { family: CapabilityFamily }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[family]} />
    </svg>
  );
}
