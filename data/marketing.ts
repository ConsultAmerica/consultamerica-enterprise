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

// Real clients only. CSRA is deliberately excluded (the artwork exists at
// public/img/clients/csra.png but must not be shown) — do not re-add it.
export const CLIENTS = [
  ["gdit", "General Dynamics IT"],
  ["gtn", "Global Tax Network"],
  ["photon", "Photon"],
  ["carlyle", "The Carlyle Group"],
  ["xfinity", "Xfinity"],
  ["kforce", "Kforce"],
  ["expedia", "Expedia Group"],
  ["navitas", "Navitas"],
  ["ampcus", "Ampcus"],
  ["pnkconnections", "PNK Connections"],
  ["caci", "CACI"],
  ["cgi", "CGI Federal"],
  ["trinamix", "Trinamix"],
  ["kyndryl", "Kyndryl"],
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

// Semi-realistic sector pictograms (public/img/sectors). Order must track
// CAPS and INDUSTRIES above. These replaced generic line icons: the old flat
// glyphs gave Financial Services and Public Sector the same building shape.
export const CAP_ICONS = [
  "/img/sectors/engineering.png",
  "/img/sectors/aidata.png",
  "/img/sectors/oraclecloud.png",
  "/img/sectors/transformation.png",
  "/img/sectors/managed.png",
];

export const IND_ICONS = [
  "/img/sectors/financial.png",
  "/img/sectors/supplychain.png",
  "/img/sectors/manufacturing.png",
  "/img/sectors/publicsector.png",
  "/img/sectors/retail.png",
];
