/**
 * Insights articles. Content is written for this showcase and deliberately
 * contains no client names, engagement figures or outcome claims — the site
 * marks illustrative numbers with a DEMO tag elsewhere, and an article is the
 * easiest place to accidentally imply a verified result.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[] }
  | { type: "pull"; text: string };

export type Insight = {
  slug: string;
  kind: string;
  date: string;
  dateISO: string;
  readTime: string;
  title: string;
  dek: string;
  image: string;
  body: Block[];
};

export const INSIGHTS: Insight[] = [
  {
    slug: "modernizing-oracle-erp-without-the-big-bang-risk",
    kind: "Point of view",
    date: "Oct 2026",
    dateISO: "2026-10-01",
    readTime: "9 min read",
    title: "Modernizing Oracle ERP without the big-bang risk",
    dek: "Why the cutover everyone fears is usually a sequencing problem, not a technology problem.",
    image: "/img/data.jpg",
    body: [
      { type: "p", text: "Most ERP programmes do not fail at go-live. They fail months earlier, at the moment someone decides the whole estate has to move at once because splitting it looked too complicated. The big-bang cutover is rarely chosen on its merits. It is what remains after sequencing was treated as an afterthought." },
      { type: "p", text: "A modernization that survives contact with a real business tends to look unglamorous: a long series of small, reversible moves, each of which leaves the organization able to invoice, pay people and close the books on Monday morning." },
      { type: "h", text: "Start with an estate assessment, not a roadmap" },
      { type: "p", text: "Roadmaps built before anyone has read the customizations are fiction. The first weeks should be spent establishing what actually exists, which is almost never what the documentation claims." },
      { type: "list", items: [
        "Every customization, with the business reason it was written and whether that reason still holds.",
        "Integration surface: what calls the ERP, what the ERP calls, and which of those paths are undocumented.",
        "Data quality in the objects that block a cutover, chiefly chart of accounts, vendor and customer masters, and open transactions.",
        "The reporting that finance will not close the month without.",
      ]},
      { type: "p", text: "A surprising share of customizations turn out to encode a process that was abandoned years ago. Retiring those is the cheapest scope reduction available, and it only becomes visible when someone goes looking." },
      { type: "pull", text: "The question is never whether to modernize. It is which part can move first without taking the close with it." },
      { type: "h", text: "Sequence by blast radius, not by module" },
      { type: "p", text: "Programmes are often sequenced by module because that is how the software is licensed. A better axis is blast radius: how much of the business stops if this piece is wrong on day one." },
      { type: "p", text: "Reporting and analytics usually move first. They are read-only, they prove the data pipeline end to end, and a bad week costs dashboards rather than payroll. Procurement and expense tend to follow. Core financials and anything touching payroll go last, with the longest parallel run, because those are the systems where being wrong is not recoverable by apologising." },
      { type: "h", text: "Parallel running is the price of reversibility" },
      { type: "p", text: "Teams resist parallel running because it means doing the work twice for a period. That is precisely what buys the ability to stop. A cutover you cannot reverse is not a cutover, it is a bet." },
      { type: "p", text: "The discipline worth keeping is to define, in writing and before the window opens, what would make you roll back. Thresholds decided in advance get honoured. Thresholds decided at 3am during a go-live never do." },
      { type: "h", text: "Treat the integrations as the real project" },
      { type: "p", text: "The ERP migration is usually the smaller half. The larger half is every system that assumed the old behaviour: the warehouse tool that parsed a specific file layout, the bank integration keyed to a particular reference format, the spreadsheet a controller has run every quarter for a decade." },
      { type: "p", text: "Those break quietly. They do not throw errors; they produce slightly wrong numbers that no one notices until a reconciliation fails. Finding them requires tracing the data, not reading the architecture diagram." },
      { type: "h", text: "What good looks like" },
      { type: "list", items: [
        "A first production workload live early enough that the organization believes the programme is real.",
        "Every phase independently reversible, with the rollback trigger written down beforehand.",
        "Finance closing the books on the new stack at least once before the old one is switched off.",
        "No phase whose failure stops the business from operating.",
      ]},
      { type: "p", text: "None of this is novel. It is simply harder to sell than a single decisive migration, and it is the approach that tends to still be standing a year later." },
    ],
  },
  {
    slug: "agentic-ai-in-the-enterprise-pilots-to-production",
    kind: "Research",
    date: "Oct 2026",
    dateISO: "2026-10-01",
    readTime: "6 min read",
    title: "Agentic AI in the enterprise: pilots to production",
    dek: "The gap between a convincing demo and a system you can put in front of a regulator.",
    image: "/img/ai.jpg",
    body: [
      { type: "p", text: "Agent demos are easy to build and hard to trust. A pilot shows that a model can complete a task. Production asks a harder question: can it complete the task reliably, explain what it did, and fail in a way the business can absorb." },
      { type: "h", text: "The pilot-to-production gap is mostly not about the model" },
      { type: "p", text: "Teams that stall rarely stall on model quality. They stall on the surrounding machinery: no evaluation set, no way to reproduce a bad run, no boundary on what the agent is permitted to touch, and no answer when someone asks why it did what it did last Tuesday." },
      { type: "list", items: [
        "Evaluation: a fixed set of real cases with known-good outcomes, run on every change.",
        "Observability: every tool call, input and output retained long enough to reconstruct a decision.",
        "Permissions: the agent holds its own narrow credentials, never a human's.",
        "Escalation: an explicit, tested path to a person, used by default when confidence is low.",
      ]},
      { type: "pull", text: "An agent that cannot explain a decision has not automated the work. It has moved the work to whoever has to audit it." },
      { type: "h", text: "Choose workflows where being wrong is cheap and visible" },
      { type: "p", text: "The best first candidates share a shape: high volume, structured inputs, a human already reviewing the output, and an error that surfaces quickly. Triage and classification fit. Drafting fits, because a person edits before anything leaves the building." },
      { type: "p", text: "Workflows where errors are silent and compound are the worst possible starting point, however appealing the time savings look on a slide." },
      { type: "h", text: "Write down what the agent may not do" },
      { type: "p", text: "Capability lists grow on their own. Constraint lists have to be written deliberately. Useful ones are specific: no irreversible action without confirmation, no spend above a stated threshold, no access to systems outside the named set, no outbound message to a customer without review." },
      { type: "p", text: "Encoding those as enforced permissions rather than prompt instructions is the difference between a policy and a wish." },
      { type: "h", text: "Keep a human in the loop on purpose, not as a fallback" },
      { type: "p", text: "Review that exists only because the team does not yet trust the system quietly decays. People approve by reflex once the output has looked fine for a few weeks. Review that samples deliberately, including cases the agent was confident about, keeps working." },
      { type: "h", text: "What to measure" },
      { type: "list", items: [
        "Rate of escalation to a person, and whether it is falling for good reasons.",
        "Time from a reported bad output to a reproduced bad output.",
        "Share of actions a reviewer would have taken differently, sampled rather than self-reported.",
        "Cost per completed task, including the review time the business still pays for.",
      ]},
      { type: "p", text: "A system that scores well on these is boring to operate, which is the goal." },
    ],
  },
  {
    slug: "building-engineering-teams-that-outlast-the-project",
    kind: "Field note",
    date: "Sep 2026",
    dateISO: "2026-09-01",
    readTime: "4 min read",
    title: "Building engineering teams that outlast the project",
    dek: "Delivery ends. The system does not. What separates the two is almost entirely how the team was built.",
    image: "/img/team2.jpg",
    body: [
      { type: "p", text: "Plenty of programmes deliver on time and leave behind something nobody can safely change. The code shipped, the consultants left, and the knowledge went with them. The failure is not technical, and it is visible long before handover if you know where to look." },
      { type: "h", text: "Staff for the second year" },
      { type: "p", text: "Teams assembled purely for delivery speed optimise for the wrong horizon. The people who will operate the system should be writing it, reviewing it and being paged by it from early on, not briefed on it at the end." },
      { type: "p", text: "Knowledge transfer sessions in the final sprint are a symptom. If a walkthrough is the mechanism, the transfer has already failed." },
      { type: "pull", text: "If the handover meeting is where your client first sees the code, the project is already a liability for them." },
      { type: "h", text: "Write things down where the work happens" },
      { type: "p", text: "Documentation nobody reads is usually documentation stored away from the code. Decisions recorded next to what they affect, in the repository, survive. Wikis drift within a quarter." },
      { type: "p", text: "The entry worth writing is not what the code does, which can be read, but why it does it that way and what was rejected. That is the part nobody can reconstruct later." },
      { type: "h", text: "Make the system legible under pressure" },
      { type: "list", items: [
        "A new engineer can run the whole thing locally on their first day.",
        "The deploy path is one documented command, not institutional memory.",
        "Alerts name the user-visible symptom, not the metric that crossed a line.",
        "Every scheduled job has an owner who would notice if it stopped.",
      ]},
      { type: "p", text: "These sound like hygiene. In practice they decide whether the first incident after handover is resolved in an hour or becomes the reason the system gets replaced in two years." },
      { type: "h", text: "The test" },
      { type: "p", text: "A simple one: could the client's own team ship a meaningful change next week without calling anyone who is leaving? If the honest answer is no, the project is not finished, regardless of what the plan says." },
    ],
  },
];

export const getInsight = (slug: string) => INSIGHTS.find((i) => i.slug === slug);
