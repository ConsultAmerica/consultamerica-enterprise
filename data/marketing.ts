export const CAPS = [
  ["Engineering", "Senior engineers who ship production systems, cloud-native builds, integrations, and the platforms your business runs on.", "/img/dev.jpg"],
  ["AI & Data", "Forecasting, assistants, and automation, operationalized with the data foundations and guardrails to run in production.", "/img/ai.jpg"],
  ["Oracle Cloud", "Migrate and modernize ERP, HCM, and SCM on Oracle Cloud, with a right-sized roadmap and a low-drama cutover.", "/img/data.jpg"],
  ["Enterprise Transformation", "Reshape finance, procurement, and supply-chain operations around a connected, modern digital core.", "/img/meeting.jpg"],
  ["Managed Services", "We run and evolve what we build, SLAs, monitoring, and continuous improvement after go-live.", "/img/cloud.jpg"],
] as const;

/**
 * Service lines under each capability, in the same order as CAPS, so
 * CAP_SERVICES[i] belongs to CAPS[i][0]. These populate the Capabilities
 * mega-menu.
 *
 * None of these have pages of their own yet, so every entry links to
 * #capabilities. Give one a real page and only its href needs to change.
 */
export const CAP_SERVICES = [
  // Engineering
  [
    "Cloud-native development",
    "Platform engineering",
    "API & systems integration",
    "Application modernization",
    "Quality & test automation",
  ],
  // AI & Data
  [
    "GenAI assistants & copilots",
    "Forecasting & machine learning",
    "Data platform & warehousing",
    "Document & contract intelligence",
    "Data governance & guardrails",
  ],
  // Oracle Cloud
  ["Oracle ERP", "Oracle SCM", "Oracle HCM", "Oracle EPM", "Oracle Cloud Infrastructure"],
  // Enterprise Transformation
  [
    "Finance transformation",
    "Procurement & sourcing",
    "Supply-chain operations",
    "Process automation",
    "Operating-model design",
  ],
  // Managed Services
  [
    "Application support",
    "Cloud & infrastructure operations",
    "Monitoring & SRE",
    "Continuous improvement",
    "Specialized talent",
  ],
] as const;

export const INDUSTRIES = [
  ["Financial Services", "Modern core + AI risk and close", "Faster financial close and real-time risk on a modern Oracle core.", "/img/finance.jpg"],
  ["Supply Chain", "Forecasting that holds up", "AI forecasting and connected logistics that cut stockouts and cost.", "/img/logistics.jpg"],
  ["Manufacturing", "Connected operations", "Shop-floor-to-ERP visibility and predictive maintenance in production.", "/img/factory.jpg"],
  ["Public Sector", "Secure modernization", "Legacy modernization with the security and auditability the sector demands.", "/img/city.jpg"],
  ["Retail", "Unified commerce + data", "A single data core powering merchandising, demand, and customer AI.", "/img/team.jpg"],
] as const;

export const PROD = [
  ["ConsultHire", "AI interview hiring", "https://consulthire.vercel.app/", "/img/products/consulthire.svg"],
  ["Data Agent", "Contract intelligence", "https://data-agent-ca.vercel.app/", "/img/products/data-agent.png"],
  ["MediGuide AI", "Healthcare AI", "https://mediguide-ai-woad.vercel.app/", "/img/products/mediguide.png"],
  ["ImportNest", "AI shopping", "https://importnest.com/", "/img/products/importnest.png"],
  ["SmartWrite AI", "Writing assistant", "https://smartwrite-tau.vercel.app/", "/img/products/smartwrite.png"],
  ["JobLens", "Resume & jobs", "https://agentomatic-portfolio.vercel.app/portfolio/joblens/", "/img/products/joblens.png"],
  ["Bosiano", "Fashion e-commerce", "https://bosiano.com/", "/img/products/bosiano.png"],
  ["Sarco Appliances", "Sales & service", "https://sarco.global/", "/img/products/sarco.png"],
  ["AppointEase", "Booking platform", "https://appointease-hlohx8tz2-n-sfds-projects.vercel.app/", "/img/products/appointease.png"],
  ["Smart Appliances", "Home-service booking", "https://smartappliances.co/", "/img/products/smart-appliances.png"],
  ["Romeah", "Quiet-luxury fashion", "https://romeah.com/", "/img/products/romeah.png"],
  // Append only. The Products mega-menu picks entries by index (pi(n) in
  // EnterpriseHome), so inserting mid-array silently repoints every column.
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

// Real, published contact details, taken from consultamerica.net. hr@ is the
// address the company publishes itself — do not swap in a guessed inbox.
export const CONTACT = {
  country: "United States",
  email: "hr@consultamerica.net",
  // Ashburn is the headquarters, Hagerstown the second office. Both the footer
  // and the Life page render from here so the addresses can't drift. Order
  // matters: the first entry is the HQ.
  // Plain Maps search URLs: they open in whichever maps app the visitor has and
  // need no API key, unlike an embedded Maps widget.
  offices: [
    {
      label: "Headquarters",
      street: "20130 Lakeview Center Plaza, Suite 400",
      city: "Ashburn, VA 20147",
      mapUrl:
        "https://www.google.com/maps/search/?api=1&query=20130+Lakeview+Center+Plaza+Suite+400+Ashburn+VA+20147",
    },
    {
      label: "Maryland office",
      street: "1101 Opal Court, Suite 211",
      city: "Hagerstown, MD 21740",
      mapUrl: "https://www.google.com/maps/search/?api=1&query=1101+Opal+Court+Suite+211+Hagerstown+MD+21740",
    },
  ],
} as const;

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
