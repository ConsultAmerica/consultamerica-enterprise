export const CAPS = [
  ["Engineering", "Senior engineers who ship production systems, cloud-native builds, integrations, and the platforms your business runs on.", "/img/dev.jpg"],
  ["AI & Data", "Forecasting, assistants, and automation, operationalized with the data foundations and guardrails to run in production.", "/img/ai.jpg"],
  ["Oracle Cloud", "Migrate and modernize ERP, HCM, and SCM on Oracle Cloud, with a right-sized roadmap and a low-drama cutover.", "/img/data.jpg"],
  ["Enterprise Transformation", "Reshape finance, procurement, and supply-chain operations around a connected, modern digital core.", "/img/meeting.jpg"],
  ["Managed Services", "We run and evolve what we build, SLAs, monitoring, and continuous improvement after go-live.", "/img/cloud.jpg"],
] as const;

export const INDUSTRIES = [
  ["Financial Services", "Modern core + AI risk and close", "Faster financial close and real-time risk on a modern Oracle core.", "/img/finance.jpg"],
  ["Supply Chain", "Forecasting that holds up", "AI forecasting and connected logistics that cut stockouts and cost.", "/img/logistics.jpg"],
  ["Manufacturing", "Connected operations", "Shop-floor-to-ERP visibility and predictive maintenance in production.", "/img/factory.jpg"],
  ["Public Sector", "Secure modernization", "Legacy modernization with the security and auditability the sector demands.", "/img/city.jpg"],
  ["Retail", "Unified commerce + data", "A single data core powering merchandising, demand, and customer AI.", "/img/team.jpg"],
] as const;

export const PROD = [
  ["ConsultAmerica", "Enterprise platform", "https://consultamerica-nu.vercel.app/", "/img/products/consultamerica.png"],
  ["Data Agent", "Contract intelligence", "https://data-agent-ca.vercel.app/", "/img/products/data-agent.png"],
  ["MediGuide AI", "Healthcare AI", "https://mediguide-ai-woad.vercel.app/", "/img/products/mediguide.png"],
  ["ImportNest", "AI shopping", "https://importnest.vercel.app/", "/img/products/importnest.png"],
  ["SmartWrite AI", "Writing assistant", "https://grammarly-app-seven.vercel.app/", "/img/products/smartwrite.png"],
  ["JobLens", "Resume & jobs", "https://joblens-seven.vercel.app/", "/img/products/joblens.png"],
  ["Bosiano", "Fashion e-commerce", "https://bosiano.vercel.app/", "/img/products/bosiano.png"],
  ["Sarco Appliances", "Sales & service", "https://sarco-appliances.vercel.app/", "/img/products/sarco.png"],
  ["AppointEase", "Booking platform", "https://appointease-psi.vercel.app/", "/img/products/appointease.png"],
  ["Smart Appliances", "Home-service booking", "https://project-i8icw-ebon.vercel.app/", "/img/products/smart-appliances.png"],
  ["Romeah", "Quiet-luxury fashion", "https://romeah.vercel.app/", "/img/products/romeah.png"],
] as const;

export const COUNTERS = [
  ["6", "–10 wks", "to first production workload"],
  ["40", "%", "faster financial close, representative"],
  ["99.9", "%", "platform uptime target, managed"],
  ["100", "%", "built and run in-house, end-to-end"],
] as const;

export const ECO = [
  ["Oracle digital core", "ERP · HCM · SCM · OCI"],
  ["Cloud & infrastructure", "IaC · CI/CD · observability"],
  ["Data platforms", "Pipelines · warehouses · lakes"],
  ["AI / ML", "RAG · agents · forecasting"],
  ["DevOps & SRE", "Reliability · automation"],
  ["Security & governance", "Controls · auditability"],
] as const;

export const CLIENTS = [
  ["gdit", "General Dynamics IT"],
  ["gtn", "Global Tax Network"],
  ["photon", "Photon"],
  ["carlyle", "The Carlyle Group"],
  ["xfinity", "Xfinity"],
  ["kforce", "Kforce"],
  ["expedia", "Expedia Group"],
] as const;

export const ANSWERS: Record<string, string> = {
  "How do we modernize our Oracle ERP?":
    "We'd start with a 2-week estate assessment, map customizations and data quality, then stage a right-sized Oracle Cloud roadmap with phased cutovers, no big-bang risk. A specialist can walk you through it.",
  "Where can AI cut cost in our operations?":
    "Usually the financial close, procurement triage, and supply-chain forecasting. We find the highest-ROI workflow, prove it in weeks, then scale what works into production.",
  "Can you provide specialized engineering talent?":
    "Yes, that's a core part of what we do. We place vetted engineers, data scientists, and Oracle specialists, embedded in your teams or as direct hires. Tell us the roles and a specialist will follow up.",
};

export const SUGGEST = [
  ["How do we modernize our Oracle ERP?", "Modernize our Oracle ERP"],
  ["Where can AI cut cost in our operations?", "Where can AI cut cost?"],
  ["Can you provide specialized engineering talent?", "Hire specialized tech talent"],
] as const;

export const CAP_ICONS = [
  "M16 18l6-6-6-6M8 6l-6 6 6 6M14 4l-4 16",
  "M12 3l1.8 5.2 5.2 1.8-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  "M21 2v6h-6M3 22v-6h6M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16",
  "M22 12h-4l-3 9L9 3l-3 9H2",
];

export const IND_ICONS = [
  "M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6",
  "M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  "M2 20h20M4 20V8l5 3V8l5 3V8l6 3v9",
  "M3 21h18M4 21V10l8-6 8 6v11M9 21v-6h6v6",
  "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4M3 6h18M16 10a4 4 0 0 1-8 0",
];
