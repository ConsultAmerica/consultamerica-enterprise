/**
 * One landing page per industry, at /industries/[slug].
 *
 * `name` must equal the INDUSTRIES entry in data/marketing.ts verbatim, so the
 * homepage, the mega-menu, the footer and the mobile menu can resolve a name
 * to its page through industryHref(). The order here is the order the cards
 * appear on the homepage.
 *
 * Copy describes what Consult America does and how the work is run, drawn from
 * the scope of the published service pages (data/services.ts). Like those
 * pages, it deliberately names no clients and states no outcome percentages,
 * contract values or certifications. Anything of that kind has to come from
 * the company, verified, before it goes on the site.
 *
 * Photography: finance.jpg was already in the site's library, and
 * industries/supply-chain.jpg is a landscape crop of the library's
 * logistics.jpg (the original is portrait, so a full-width hero downloaded
 * twice the pixels it showed). The other photos in public/img/industries/
 * were added for these pages, under the Unsplash License (free for commercial
 * use, no attribution required), and cropped to the same 16:10:
 *   retail.jpg                  https://unsplash.com/photos/photo-of-store-GMGdhtYeROY
 *   public-sector-city-hall.jpg https://unsplash.com/photos/brown-wooden-door-near-white-concrete-building-during-daytime-jyIgc5wGnGE
 *   manufacturing-line.jpg      https://unsplash.com/photos/blue-industrial-robot-arm-in-factory-sz1CHL7Pky0
 * A replacement photo gets a new filename rather than overwriting the old
 * one, so browser, CDN and image-optimizer caches cannot serve the old image.
 * Licensed or commissioned photography can replace any of them: change the
 * `image` path here and nothing else.
 */

export type IndustryGroup = "Regulated" | "Operations" | "Commerce";

/** The five capability families every page covers, always in this order. */
export const CAPABILITY_FAMILIES = ["Oracle Cloud", "AI", "Data", "Integration", "Cloud"] as const;
export type CapabilityFamily = (typeof CAPABILITY_FAMILIES)[number];

export type Industry = {
  slug: string;
  /** Must equal the INDUSTRIES entry in data/marketing.ts verbatim. */
  name: string;
  group: IndustryGroup;
  image: string;
  imageAlt: string;
  /** CSS object-position for the photo, where the subject is off-centre. */
  imagePosition?: string;
  /** Homepage card and related-industry card summary. One sentence. */
  summary: string;
  /** Meta description. */
  description: string;
  headline: string;
  dek: string;
  /** The five service themes, shown as the hero's focus strip. */
  themes: readonly string[];
  challenge: {
    lead: string;
    items: readonly (readonly [title: string, body: string])[];
  };
  help: {
    lead: string;
    points: readonly (readonly [title: string, body: string])[];
  };
  solutions: readonly {
    title: string;
    /** Slug from data/services.ts: the card's "next step" link. */
    service?: string;
    body: string;
    includes: readonly string[];
  }[];
  capabilities: readonly { family: CapabilityFamily; purpose: string; items: readonly string[] }[];
  useCases: readonly (readonly [title: string, body: string])[];
  approach: readonly (readonly [title: string, body: string])[];
  /** Slugs from data/services.ts. Unknown slugs are dropped at render. */
  services: readonly string[];
  /** Slugs from data/insights.ts: published perspective pieces, not proof. */
  insights: readonly string[];
  /**
   * Client proof. Empty until the business supplies a case study it has
   * permission to publish; the section does not render while this is empty,
   * so nothing placeholder-shaped ever reaches the site.
   */
  caseStudies: readonly CaseStudy[];
  faqs: readonly (readonly [question: string, answer: string])[];
};

export type CaseStudy = {
  title: string;
  /** Client name, only with written permission. Otherwise describe the client. */
  client: string;
  summary: string;
  /** Outcomes as the client has agreed them, word for word. */
  outcomes: readonly string[];
  href?: string;
  /** Who at Consult America approved publication, and when. Not rendered. */
  approvedBy: string;
};

export const INDUSTRY_PAGES: readonly Industry[] = [
  // --------------------------------------------------------- Financial Services
  {
    slug: "financial-services",
    name: "Financial Services",
    group: "Regulated",
    image: "/img/finance.jpg",
    imageAlt: "Financial market chart on a dark trading screen",
    summary: "Oracle Financials, a faster close, and reconciliations and controls that stand up to audit.",
    description:
      "Oracle Cloud ERP and EPM, financial reporting and analytics, workflow automation, risk and reconciliation, and data and integration modernization for financial-services organizations.",
    headline: "A finance core that closes faster and answers to auditors.",
    dek: "Oracle Financials, reconciliation, controls and reporting, connected to the data and automation that take the manual effort out of every period end.",
    themes: [
      "Oracle Financials and ERP",
      "Financial reporting and analytics",
      "Workflow automation",
      "Risk, controls and reconciliation",
      "Data and integration modernization",
    ],
    challenge: {
      lead: "Financial-services firms carry more reconciliation, more reporting and more scrutiny than most sectors, often on finance systems assembled over years of acquisitions and product launches. The result is a close that depends on spreadsheets and on the few people who know where each number really comes from.",
      items: [
        [
          "A close held together by spreadsheets",
          "Journals, accruals and allocations prepared offline and keyed back in. Every period repeats the same manual work, and every manual step is a place an error can enter unseen.",
        ],
        [
          "Reconciliations that outlast the close",
          "High-volume bank, clearing, suspense and intercompany accounts reconciled by hand, with breaks investigated late and the evidence scattered across inboxes.",
        ],
        [
          "Controls that live outside the system",
          "Segregation of duties, approval limits and access reviews tracked in documents rather than enforced in the platform, which turns every audit into a reconstruction exercise.",
        ],
        [
          "Several versions of the same number",
          "Product, ledger and risk systems each report their own figures. Reconciling management, regulatory and statutory views takes analyst time that should go to analysis.",
        ],
      ],
    },
    help: {
      lead: "We work on the finance core and the systems around it: implementing or improving Oracle Cloud ERP and EPM, automating the work that moves between them, and building a data foundation so reporting comes from one governed source. We deliver the working system, not only the recommendation.",
      points: [
        [
          "Modernize the finance core",
          "Oracle Fusion Financials and EPM configured close to standard, with customization limited to what the business genuinely needs.",
        ],
        [
          "Automate the period end",
          "Data loads, matching, journal workflow and approvals moved out of spreadsheets into monitored, auditable processes.",
        ],
        [
          "One governed view of the numbers",
          "A reporting layer fed from the ledger and subledgers, with definitions agreed once and access controlled in the data platform.",
        ],
      ],
    },
    solutions: [
      {
        title: "Oracle Financials and ERP",
        service: "oracle-erp",
        body: "Implementation, migration and optimization of Oracle Fusion Cloud Financials, including moves from E-Business Suite, PeopleSoft or a non-Oracle ledger.",
        includes: [
          "General Ledger, Payables, Receivables, Fixed Assets and Cash Management",
          "Chart of accounts redesign for statutory and management reporting",
          "Readiness and regression testing for Oracle's quarterly updates",
        ],
      },
      {
        title: "Financial reporting and analytics",
        service: "data-platform-warehousing",
        body: "Reporting that starts from the ledger rather than from extracts, so management and board packs reconcile by design.",
        includes: [
          "Oracle EPM Financial Consolidation and Close, and Narrative Reporting",
          "Governed finance data marts and a shared semantic layer",
          "Variance and trend analysis on agreed definitions",
        ],
      },
      {
        title: "Workflow automation",
        service: "process-automation",
        body: "Repetitive finance work such as invoice capture, journal preparation and approvals, taken out of inboxes and into orchestrated workflow.",
        includes: [
          "Invoice and document extraction with confidence-based review",
          "Approval routing that matches the real authority matrix",
          "Exception queues with a named owner for each",
        ],
      },
      {
        title: "Risk, controls and reconciliation",
        service: "oracle-epm",
        body: "Controls enforced in the system, and reconciliations that run continuously instead of piling up at month end.",
        includes: [
          "Oracle Account Reconciliation with automated transaction matching",
          "Segregation-of-duties analysis with Oracle Advanced Access Controls",
          "Control evidence captured as part of the process itself",
        ],
      },
      {
        title: "Data and integration modernization",
        service: "api-systems-integration",
        body: "Brittle point-to-point feeds between product systems, the ledger and reporting replaced with documented, monitored interfaces.",
        includes: [
          "Integration between core systems, subledgers and Oracle Cloud",
          "Ingestion into a cloud data warehouse with tested, versioned models",
          "Data classification, masking and access audit",
        ],
      },
    ],
    capabilities: [
      {
        family: "Oracle Cloud",
        purpose: "The financial system of record.",
        items: [
          "Oracle Fusion Cloud Financials",
          "Oracle EPM Planning",
          "Financial Consolidation and Close",
          "Account Reconciliation",
          "Narrative Reporting",
          "Advanced Access Controls",
        ],
      },
      {
        family: "AI",
        purpose: "Applied where accuracy can be measured.",
        items: [
          "Invoice and document extraction",
          "Anomaly detection on journals and transactions",
          "Confidence-scored review queues",
          "Policy assistants that cite their sources",
        ],
      },
      {
        family: "Data",
        purpose: "One governed source for reporting.",
        items: [
          "Oracle Autonomous Data Warehouse or Snowflake",
          "Dimensional finance data marts",
          "Semantic layer for Oracle Analytics, Power BI or Tableau",
          "Freshness and reconciliation tests",
        ],
      },
      {
        family: "Integration",
        purpose: "Feeds that fail loudly, not quietly.",
        items: [
          "Versioned REST APIs",
          "Event streaming between systems",
          "Bank and payment file interfaces",
          "Subledger and product-system connectors",
        ],
      },
      {
        family: "Cloud",
        purpose: "Infrastructure with the controls built in.",
        items: [
          "Oracle Cloud Infrastructure landing zones",
          "Identity federation and least-privilege access",
          "Tested backup and disaster recovery",
          "Cost governance and showback",
        ],
      },
    ],
    useCases: [
      [
        "Shortening the month-end close",
        "Mapping every step of the current close, automating data loads from ERP to EPM, and moving reconciliations to continuous matching so period end starts with fewer open items.",
      ],
      [
        "Retiring an ageing on-premises ledger",
        "Migrating from E-Business Suite or a legacy general ledger to Oracle Fusion Financials, with trial data loads from the first phase and a rehearsed cutover.",
      ],
      [
        "Automating high-volume reconciliations",
        "Configuring match rules for bank, intercompany and clearing accounts, and routing only genuine breaks to reviewers, with the evidence attached.",
      ],
      [
        "Building the reporting pack from one source",
        "A governed finance data layer, so management and regulatory reporting draw on the same reconciled figures instead of separate extracts.",
      ],
    ],
    approach: [
      [
        "Baseline the close and the controls",
        "We measure where effort and risk actually sit today: cycle times, manual touchpoints, control gaps and the spreadsheets the process quietly depends on.",
      ],
      [
        "Design to standard, then extend",
        "Oracle's standard financial processes are the starting point. Each proposed customization has to justify the upgrade cost it will carry.",
      ],
      [
        "Prove it with your own data",
        "Trial migrations and conference-room pilots use your real transactions, so finance signs off on what it has actually worked through.",
      ],
      [
        "Cut over with a rehearsal and a rollback point",
        "The switchover is practised end to end before it happens for real, then supported through the first closes on the new platform.",
      ],
    ],
    services: [
      "oracle-erp",
      "oracle-epm",
      "finance-transformation",
      "process-automation",
      "document-contract-intelligence",
      "data-governance-guardrails",
    ],
    insights: ["modernizing-oracle-erp-without-the-big-bang-risk", "agentic-ai-in-the-enterprise-pilots-to-production"],
    caseStudies: [],
    faqs: [
      [
        "Do you work with firms already running Oracle Cloud ERP?",
        "Yes. Much of the work in this area is improving an existing Oracle Fusion deployment: reducing customizations, adding EPM or Account Reconciliation, automating integrations, or putting a regression process in place for Oracle's quarterly updates.",
      ],
      [
        "Can you migrate us from E-Business Suite or another ledger?",
        "Yes. Migration from E-Business Suite, PeopleSoft, JD Edwards or a non-Oracle ledger is part of our Oracle ERP service. Data migration starts in the first phase, with repeated trial loads well before cutover.",
      ],
      [
        "How do you approach regulatory and audit requirements?",
        "We design controls into the system, including segregation of duties, approval limits, reconciliation certification and access audit, so evidence is produced by the process itself. Your compliance and audit teams set the requirements; we implement them and document how each one is met.",
      ],
      [
        "Where does AI fit in a finance function?",
        "Where accuracy can be measured and a person stays accountable: extracting data from invoices and documents with confidence scores, and flagging unusual journals or transactions for review. We agree how success will be measured before anything is built.",
      ],
      [
        "Can you support the platform after go-live?",
        "Yes. Our managed services cover application support, release management for Oracle's quarterly updates, and continuous improvement, under service levels tiered by business impact.",
      ],
    ],
  },

  // ------------------------------------------------------------- Public Sector
  {
    slug: "public-sector",
    name: "Public Sector",
    group: "Regulated",
    image: "/img/industries/public-sector-city-hall.jpg",
    imageAlt: "Entrance of a historic city hall with an American flag above the doors",
    imagePosition: "55% 45%",
    summary: "ERP modernization, budgeting, procurement and grants, and digital services residents can rely on.",
    description:
      "Government ERP modernization, budgeting, procurement and grants, financial transparency and reporting, citizen-facing digital services and legacy system modernization for public-sector organizations.",
    headline: "Modern public systems, accountable at every step.",
    dek: "Government ERP, budgeting, procurement and grants, and the digital services residents use, modernized in phases and built for the scrutiny public money requires.",
    themes: [
      "Government ERP modernization",
      "Budgeting, procurement and grants",
      "Financial transparency and reporting",
      "Citizen-facing digital services",
      "Legacy system modernization",
    ],
    challenge: {
      lead: "Public organizations are asked to deliver more online, report more openly and account for every dollar, often on financial and case systems that predate the web. Modernization has to happen without interrupting services residents rely on, and within budget and oversight cycles that leave little room for a failed project.",
      items: [
        [
          "Core systems past their supportable life",
          "Mainframe, midrange and heavily customized on-premises ERP that few people can still change safely, and that every new requirement makes harder to replace.",
        ],
        [
          "Budgets built outside the financial system",
          "Budget development in spreadsheets, with appropriations, encumbrances and actuals reconciled by hand before anyone can say what is left to spend.",
        ],
        [
          "Grants and procurement tracked in parallel",
          "Award terms, allowable costs and vendor obligations managed across separate tools, which makes compliance reporting slow and error-prone.",
        ],
        [
          "Services shaped by the system, not the resident",
          "Paper forms, office-hours processes and no way to check status online, because the back-office system was never built to expose it.",
        ],
      ],
    },
    help: {
      lead: "We help public organizations modernize the financial core and the services built on it, in phases that keep current operations running. That means Oracle Cloud ERP and EPM where they fit, modern interfaces in front of legacy systems where replacement is not yet justified, and reporting that makes spending visible.",
      points: [
        [
          "Modernize in phases",
          "Legacy capability moves slice by slice behind a stable interface, so services continue while the old system shrinks.",
        ],
        [
          "Connect budget to actuals",
          "Budget, commitment and spending data in one model, so what is left to spend is a query rather than a reconciliation.",
        ],
        [
          "Build for scrutiny",
          "Access controls, audit trails and data classification designed in, to the security requirements your organization sets.",
        ],
      ],
    },
    solutions: [
      {
        title: "Government ERP modernization",
        service: "oracle-erp",
        body: "Financials, procurement and project accounting moved onto Oracle Fusion Cloud ERP, or an existing deployment improved, with configuration kept close to standard.",
        includes: [
          "Fit-gap against standard Oracle functionality",
          "Data migration with repeated trial loads",
          "Cutover planned around fiscal-year boundaries",
        ],
      },
      {
        title: "Budgeting, procurement and grants",
        service: "oracle-epm",
        body: "Budget development and purchasing connected, so commitments and spending are tracked against the budgets that authorize them.",
        includes: [
          "Oracle EPM Planning for budget development and forecasting",
          "Oracle Procurement, Sourcing and Supplier Portal",
          "Project costing and billing in Oracle Project Portfolio Management",
        ],
      },
      {
        title: "Financial transparency and reporting",
        service: "data-platform-warehousing",
        body: "Reporting drawn from the system of record, so internal reports, oversight requests and public dashboards show the same figures.",
        includes: [
          "Governed data warehouse and reporting models",
          "Spending and budget-versus-actual dashboards",
          "Documented data definitions and lineage",
        ],
      },
      {
        title: "Citizen-facing digital services",
        service: "cloud-native-development",
        body: "Online services built as modern, accessible web applications and connected to the systems that process each request.",
        includes: [
          "Online applications that replace paper forms",
          "Request status connected to back-office systems",
          "Assistants over published guidance, with a route to a person",
        ],
      },
      {
        title: "Legacy system modernization",
        service: "application-modernization",
        body: "Incremental modernization of mainframe and older applications: replacing what should be replaced, and wrapping what should not.",
        includes: [
          "An honest assessment of each system: modernize, replace or retain",
          "Modern APIs in front of legacy interfaces",
          "Phased migration with deliberate decommissioning",
        ],
      },
    ],
    capabilities: [
      {
        family: "Oracle Cloud",
        purpose: "The financial and procurement core.",
        items: [
          "Oracle Fusion Cloud Financials",
          "Procurement and Sourcing",
          "Project Portfolio Management",
          "Oracle EPM Planning",
          "Oracle Fusion Cloud HCM",
        ],
      },
      {
        family: "AI",
        purpose: "Assistive, auditable and supervised.",
        items: [
          "Form and document intake extraction",
          "Assistants over policy and published guidance",
          "Anomaly detection on payments",
          "Human review for low-confidence results",
        ],
      },
      {
        family: "Data",
        purpose: "Spending visible from one source.",
        items: [
          "Cloud data warehouse",
          "Budget, commitment and actuals models",
          "Dashboards in Oracle Analytics, Power BI or Tableau",
          "Cataloguing, classification and retention",
        ],
      },
      {
        family: "Integration",
        purpose: "Old and new systems, safely connected.",
        items: [
          "API gateway with authentication and rate limits",
          "Wrappers for mainframe and legacy interfaces",
          "File and batch exchange with partner agencies",
          "Event-driven status updates",
        ],
      },
      {
        family: "Cloud",
        purpose: "Built to your security requirements.",
        items: [
          "Oracle Cloud Infrastructure landing zones",
          "Identity federation and least-privilege access",
          "Tested backup and disaster recovery",
          "Patch currency and security baselines",
        ],
      },
    ],
    useCases: [
      [
        "Replacing a legacy financial system",
        "Phasing the general ledger, payables and purchasing onto Oracle Fusion Cloud ERP, timed around fiscal year-end so reporting continuity is preserved.",
      ],
      [
        "Taking budget development out of spreadsheets",
        "A driver-based budget model in Oracle EPM Planning that loads actuals from the ledger automatically and tracks spending against budget.",
      ],
      [
        "Putting a paper process online",
        "An accessible online application with status tracking, connected through APIs to the existing case or permitting system rather than replacing it all at once.",
      ],
      [
        "Publishing spending data people can trust",
        "A governed reporting layer built from the financial system, so internal reports and public transparency data reconcile by design.",
      ],
    ],
    approach: [
      [
        "Assess every system honestly",
        "Some systems should be replaced, some modernized and some left alone. We say which before budget is committed, with the reasoning documented for oversight.",
      ],
      [
        "Phase around the fiscal calendar",
        "Cutovers are planned around year-end, budget cycles and reporting deadlines, so no period is split across systems without need.",
      ],
      [
        "Keep services running throughout",
        "New capability is introduced behind stable interfaces, so residents and staff never have to absorb one big-bang change.",
      ],
      [
        "Hand over knowledge, not just systems",
        "Your staff receive the runbooks, architecture decisions and training to own what was built, with managed support available if needed.",
      ],
    ],
    services: [
      "oracle-erp",
      "oracle-epm",
      "procurement-sourcing",
      "application-modernization",
      "api-systems-integration",
      "data-governance-guardrails",
    ],
    insights: ["modernizing-oracle-erp-without-the-big-bang-risk", "agentic-ai-in-the-enterprise-pilots-to-production"],
    caseStudies: [],
    faqs: [
      [
        "What kinds of public-sector organizations do you work with?",
        "Our services apply to agencies and public bodies modernizing financial, procurement and service-delivery systems. Talk to us about your organization, your requirements and how you procure, and we will tell you plainly where we can help.",
      ],
      [
        "Can you modernize without replacing everything at once?",
        "Yes, and we usually recommend it. A routing layer in front of the legacy system lets functionality move to new code one capability at a time while services continue, and old paths are retired once traffic has demonstrably moved.",
      ],
      [
        "How do you handle security and compliance requirements?",
        "Your organization and its frameworks define the requirements. We design to them, covering landing zones, identity, least-privilege access, encryption, audit logging and data classification, and document how each requirement is met for your assessors.",
      ],
      [
        "Do you only work with Oracle systems?",
        "No. Oracle Cloud ERP and EPM are where we go deepest, but our integration, data and modernization work applies equally to the non-Oracle and legacy systems that public organizations run alongside them.",
      ],
      [
        "Who runs the systems once they are live?",
        "Your own staff can, with the runbooks, architecture decisions and training we hand over. Or we can, through our managed services: application support, monitoring and continuous improvement under agreed service levels.",
      ],
    ],
  },

  // -------------------------------------------------------------- Supply Chain
  {
    slug: "supply-chain",
    name: "Supply Chain",
    group: "Operations",
    image: "/img/industries/supply-chain.jpg",
    imageAlt: "Long warehouse aisle lined with stocked pallet racking",
    summary: "Supplier, inventory and order data connected end to end, with analytics that drive the next decision.",
    description:
      "Procurement and supplier management, inventory visibility, order management, logistics and fulfillment integrations, and supply chain analytics on Oracle Cloud SCM, data and AI.",
    headline: "See the whole chain, and act on it sooner.",
    dek: "Procurement, inventory, orders and logistics connected on one system of record, with the planning and analytics to respond before a shortage becomes a missed delivery.",
    themes: [
      "Procurement and supplier management",
      "Inventory visibility",
      "Order management",
      "Logistics and fulfillment integrations",
      "Supply chain analytics",
    ],
    challenge: {
      lead: "Supply chains now change faster than the systems that plan them. Supplier lead times move, demand shifts between channels, and every logistics partner sends data in its own format. When inventory, orders and shipments live in separate systems, each exception is found late and resolved by phone and spreadsheet.",
      items: [
        [
          "Inventory nobody fully trusts",
          "System balances that differ from the shelf, so planners hold extra safety stock and still cannot promise dates with confidence.",
        ],
        [
          "Suppliers managed by email",
          "Purchase orders, confirmations and changes exchanged outside the system, leaving buyers without a reliable view of what is actually inbound.",
        ],
        [
          "Orders that need a person to move them",
          "Allocation, backorders and split shipments handled case by case, because the order system cannot see availability across locations.",
        ],
        [
          "Partner data that arrives late or malformed",
          "Carriers, 3PLs and trading partners sending EDI, files and portal updates on different schedules, with errors found after the shipment has already moved.",
        ],
      ],
    },
    help: {
      lead: "We connect planning, procurement, inventory and order systems so the system of record reflects what physically happened, then build analytics and forecasting on that foundation. The work is grounded in Oracle Fusion Cloud SCM and Procurement where they fit, and in integration and data engineering wherever other platforms are involved.",
      points: [
        [
          "Fix the foundation first",
          "Item, supplier, location and unit-of-measure data cleaned and owned, because planning output is only as good as the master data beneath it.",
        ],
        [
          "Connect execution to the record",
          "Warehouse, carrier and supplier interfaces that update inventory and orders as events happen, not overnight.",
        ],
        [
          "Plan with real signal",
          "Forecasts and inventory policy derived from demand variability and service targets, then wired into purchasing.",
        ],
      ],
    },
    solutions: [
      {
        title: "Procurement and supplier management",
        service: "procurement-sourcing",
        body: "Requisition to payment, with suppliers onboarded, qualified and collaborating through the system rather than around it.",
        includes: [
          "Oracle Procurement, Sourcing and Supplier Portal",
          "Supplier qualification, risk screening and performance review",
          "Spend analysis that includes invoices with no purchase order",
        ],
      },
      {
        title: "Inventory visibility",
        service: "oracle-scm",
        body: "An accurate, location-level view of stock on hand, in transit and committed, that planners and sales can both rely on.",
        includes: [
          "Oracle Inventory Management and Cost Management",
          "Cycle counting and stock-accuracy processes",
          "Warehouse management system integration",
        ],
      },
      {
        title: "Order management",
        service: "supply-chain-operations",
        body: "Order capture, promising and fulfillment orchestration that can see availability across the whole network.",
        includes: [
          "Oracle Order Management and Global Order Promising",
          "Allocation rules and backorder handling",
          "Exception queues for orders that need a decision",
        ],
      },
      {
        title: "Logistics and fulfillment integrations",
        service: "api-systems-integration",
        body: "Reliable, monitored interfaces to carriers, 3PLs and trading partners, in the formats they actually send.",
        includes: [
          "EDI, SFTP and API integrations with retry and replay",
          "Shipment and delivery status as events",
          "Monitoring and alerting for each partner interface",
        ],
      },
      {
        title: "Supply chain analytics",
        service: "forecasting-machine-learning",
        body: "Analytics and forecasting that end in a purchasing, production or allocation decision, not just a report.",
        includes: [
          "Demand forecasting at item and location level",
          "Inventory policy and safety-stock modelling",
          "Supplier and fulfillment performance dashboards",
        ],
      },
    ],
    capabilities: [
      {
        family: "Oracle Cloud",
        purpose: "The supply chain system of record.",
        items: [
          "Oracle Fusion Cloud SCM",
          "Inventory and Cost Management",
          "Order Management",
          "Supply and Demand Planning",
          "Procurement and Supplier Portal",
        ],
      },
      {
        family: "AI",
        purpose: "Prediction wired into decisions.",
        items: [
          "Demand forecasting with seasonality and promotions separated",
          "Anomaly detection on orders and shipments",
          "Purchase order and invoice extraction",
          "Assistants over supplier and product data",
        ],
      },
      {
        family: "Data",
        purpose: "One version of stock and service.",
        items: [
          "Cloud data warehouse",
          "Inventory, order and supplier data models",
          "Automated tests on master data",
          "Dashboards in Oracle Analytics, Power BI or Tableau",
        ],
      },
      {
        family: "Integration",
        purpose: "Every partner, monitored.",
        items: [
          "EDI and managed file transfer",
          "Carrier and 3PL APIs",
          "Event streaming for status updates",
          "Oracle and non-Oracle ERP connectors",
        ],
      },
      {
        family: "Cloud",
        purpose: "Scales with peak volume.",
        items: [
          "Oracle Cloud Infrastructure",
          "Autoscaling integration services",
          "Tested backup and disaster recovery",
          "Monitoring with on-call runbooks",
        ],
      },
    ],
    useCases: [
      [
        "Reconciling system stock with the shelf",
        "Cleaning item and location master data, introducing cycle counting, and integrating the warehouse system so balances update as transactions occur.",
      ],
      [
        "Moving supplier collaboration into the system",
        "Onboarding suppliers to a portal for order acknowledgements, change requests and advance shipment notices, so inbound supply is visible to buyers and planners.",
      ],
      [
        "Promising orders from network-wide availability",
        "Configuring order promising across warehouses and in-transit stock, so customer service can commit a date without checking each location by hand.",
      ],
      [
        "Replacing fragile partner feeds",
        "Rebuilding carrier and 3PL interfaces with validation, retry and alerting, so a failed message is caught and replayed rather than discovered by a customer.",
      ],
    ],
    approach: [
      [
        "Map the real flow, exceptions included",
        "Drop-ship, returns, partial receipts and the supplier who still sends paper are documented up front. Edge cases are most of the work.",
      ],
      [
        "Fix master data before planning",
        "Items, suppliers, locations and units of measure are cleansed and given owners before forecasting or planning is configured.",
      ],
      [
        "Pilot one flow end to end",
        "A single product line or region is proven from purchase order to delivery before the rollout widens.",
      ],
      [
        "Monitor every interface",
        "Each partner interface has alerting and a runbook, so problems are found by the support team rather than by customers.",
      ],
    ],
    services: [
      "oracle-scm",
      "supply-chain-operations",
      "procurement-sourcing",
      "api-systems-integration",
      "forecasting-machine-learning",
      "data-platform-warehousing",
    ],
    insights: ["modernizing-oracle-erp-without-the-big-bang-risk"],
    caseStudies: [],
    faqs: [
      [
        "Do we need to replace our ERP to improve supply chain visibility?",
        "Not necessarily. Visibility often improves first through cleaner master data, better integrations and a shared data layer. Where the ERP itself is the constraint, we assess Oracle Fusion Cloud SCM against your requirements and say plainly whether replacement is justified.",
      ],
      [
        "Can you integrate with our carriers, 3PLs and EDI partners?",
        "Yes. EDI documents, SFTP batches, partner APIs and portal feeds are part of our integration service, built with validation, retries, replay and monitoring on every interface.",
      ],
      [
        "How accurate will demand forecasting be?",
        "That depends on your data, so we measure it rather than promise it. We start with a simple baseline, test whether a model beats it on your own history, and deploy only a forecast that improves the decision it feeds.",
      ],
      [
        "Do you work with warehouse systems other than Oracle?",
        "Yes. Our integration work connects Oracle and non-Oracle systems. The goal is that the system of record reflects what physically happened, whichever warehouse system recorded it.",
      ],
      [
        "Can you support supply chain systems after go-live?",
        "Yes. Managed services include application support, interface monitoring, release management and continuous improvement, with service levels set by business impact.",
      ],
    ],
  },

  // ------------------------------------------------------------- Manufacturing
  {
    slug: "manufacturing",
    name: "Manufacturing",
    group: "Operations",
    image: "/img/industries/manufacturing-line.jpg",
    imageAlt: "Robotic arm working on an automated production line",
    summary: "The shop floor connected to ERP, with materials, planning, quality and analytics on one record.",
    description:
      "ERP and production integration, inventory and materials management, planning and operational analytics, quality and process automation, and cloud and data modernization for manufacturers.",
    headline: "Connect the shop floor to the business that runs it.",
    dek: "ERP integrated with production, materials and quality data, so plans reflect what the plant can really build and analytics show where time and material are lost.",
    themes: [
      "ERP and production integration",
      "Inventory and materials management",
      "Planning and operational analytics",
      "Quality and process automation",
      "Cloud and data modernization",
    ],
    challenge: {
      lead: "Manufacturers run on two clocks: the business systems that plan and cost production, and the plant-floor systems that record what actually happened. When the two are loosely connected, schedules are built on stale information, shortages appear mid-run, and costs are reconciled after the fact.",
      items: [
        [
          "An ERP that lags the floor",
          "Completions, scrap and material consumption entered late or in end-of-shift batches, so inventory and cost figures trail reality.",
        ],
        [
          "Shortages found at the line",
          "Bills of material, lead times and on-hand balances out of step, causing expediting and stoppages alongside excess stock of the wrong items.",
        ],
        [
          "Plans built beside the system",
          "Production schedules prepared in spreadsheets because the system does not reflect true capacity, so the official plan and the real plan drift apart.",
        ],
        [
          "Quality recorded on paper",
          "Inspections, nonconformances and corrective actions captured on forms or in standalone tools, which makes root-cause analysis slow.",
        ],
      ],
    },
    help: {
      lead: "We integrate business systems with production systems so the ERP becomes a dependable record of what the plant built, consumed and shipped, then use that data for planning, quality and operational analytics. We work in Oracle Fusion Cloud SCM and Manufacturing where they fit, and integrate with the execution, equipment and quality systems you already run.",
      points: [
        [
          "Integrate to the floor",
          "Production, consumption and quality events reach the system of record as they occur.",
        ],
        [
          "Plan to real capacity",
          "Planning built on accurate bills of material, routings and lead times, with shortages surfaced before the run starts.",
        ],
        [
          "Turn operational data into decisions",
          "Analytics and predictive models that show where throughput, yield and material are being lost.",
        ],
      ],
    },
    solutions: [
      {
        title: "ERP and production integration",
        service: "api-systems-integration",
        body: "ERP connected with shop-floor, equipment and warehouse systems, so work orders, completions and consumption are recorded once and accurately.",
        includes: [
          "Oracle Manufacturing work definitions and work orders",
          "Interfaces to shop-floor and equipment systems",
          "Event-driven updates for completions and scrap",
        ],
      },
      {
        title: "Inventory and materials management",
        service: "oracle-scm",
        body: "Accurate materials data and deliberate inventory policy, so the right components are on hand without excess stock.",
        includes: [
          "Governance for item, bill-of-material and unit-of-measure data",
          "Oracle Inventory Management and Cost Management",
          "Supplier collaboration for inbound materials",
        ],
      },
      {
        title: "Planning and operational analytics",
        service: "supply-chain-operations",
        body: "Supply and production planning on reliable data, with visibility into throughput, downtime and yield.",
        includes: [
          "Oracle Supply Planning and Replenishment Planning",
          "Production and inventory performance dashboards",
          "Demand forecasting at item and plant level",
        ],
      },
      {
        title: "Quality and process automation",
        service: "process-automation",
        body: "Quality data captured in the flow of work, routine processes automated, and exceptions routed to an owner.",
        includes: [
          "Inspection and nonconformance records captured in the workflow",
          "Workflow for corrective and preventive actions",
          "Automation of repetitive data entry and approvals",
        ],
      },
      {
        title: "Cloud and data modernization",
        service: "oracle-cloud-infrastructure",
        body: "Ageing plant and business applications moved to supported platforms, and operational data consolidated for analysis.",
        includes: [
          "Oracle Cloud Infrastructure migration in planned waves",
          "An operational data platform for production and quality data",
          "Predictive maintenance on sensor and telemetry data",
        ],
      },
    ],
    capabilities: [
      {
        family: "Oracle Cloud",
        purpose: "Planning, production and cost.",
        items: [
          "Oracle Fusion Cloud SCM",
          "Oracle Manufacturing",
          "Inventory and Cost Management",
          "Supply Planning",
        ],
      },
      {
        family: "AI",
        purpose: "Models that act on plant data.",
        items: [
          "Predictive maintenance from sensor data",
          "Demand and material forecasting",
          "Anomaly detection on quality and process data",
          "Assistants over work instructions and procedures",
        ],
      },
      {
        family: "Data",
        purpose: "Plant and business data together.",
        items: [
          "Operational data platform",
          "Production, yield and downtime models",
          "Automated checks on bills of material and routings",
          "Dashboards in Oracle Analytics, Power BI or Tableau",
        ],
      },
      {
        family: "Integration",
        purpose: "ERP and floor, in step.",
        items: [
          "Shop-floor and equipment interfaces",
          "Event streaming for production events",
          "Supplier EDI and portal integration",
          "Oracle and non-Oracle ERP connectors",
        ],
      },
      {
        family: "Cloud",
        purpose: "Supported, resilient platforms.",
        items: [
          "Oracle Cloud Infrastructure",
          "Re-platforming of ageing applications",
          "Tested backup and disaster recovery",
          "Monitoring and patch currency",
        ],
      },
    ],
    useCases: [
      [
        "Recording production as it happens",
        "Integrating shop-floor systems with Oracle work orders so completions, scrap and material consumption post as they happen instead of in end-of-shift batches.",
      ],
      [
        "Cleaning up bills of material before planning",
        "Auditing bills of material, routings and units of measure, assigning data owners and fixing discrepancies so supply planning produces output people can use.",
      ],
      [
        "Moving quality records off paper",
        "Replacing paper quality forms with a workflow that captures inspections and nonconformances at the point of work, linked to the lot and the work order.",
      ],
      [
        "Flagging equipment issues before failure",
        "A predictive maintenance model built on existing sensor data and validated against maintenance history, with alerts routed into the maintenance workflow.",
      ],
    ],
    approach: [
      [
        "Walk the floor first",
        "We observe how work orders, materials and quality data move today, including the paper and spreadsheets, before designing anything.",
      ],
      [
        "Fix master data before planning",
        "Bills of material, routings, items and lead times are cleansed and owned, because planning cannot be better than the data beneath it.",
      ],
      [
        "Pilot one line or product family",
        "Integration and planning are proven end to end on one line before rolling out across the plant or to other sites.",
      ],
      [
        "Measure, then improve",
        "Throughput, yield and inventory accuracy are tracked after go-live, and the next improvement is chosen from the data.",
      ],
    ],
    services: [
      "oracle-scm",
      "api-systems-integration",
      "forecasting-machine-learning",
      "process-automation",
      "data-platform-warehousing",
      "oracle-cloud-infrastructure",
    ],
    insights: ["modernizing-oracle-erp-without-the-big-bang-risk"],
    caseStudies: [],
    faqs: [
      [
        "Can you integrate with our existing shop-floor systems and equipment?",
        "Yes. We build interfaces between ERP and shop-floor, equipment and quality systems, using APIs, events or files depending on what each system supports, with monitoring on every interface.",
      ],
      [
        "Do we have to move to Oracle Cloud to work with you?",
        "No. Our integration, data and automation work applies to Oracle and non-Oracle environments. Where an Oracle Cloud migration is being considered, we assess it against your requirements first.",
      ],
      [
        "How do you approach predictive maintenance?",
        "We start with the sensor and maintenance history you already have, set a baseline, and deploy a model only if it clearly improves on it. Alerts are wired into the maintenance workflow so a prediction leads to an action.",
      ],
      [
        "Can the work extend across several plants?",
        "Yes. We prove a design on one line or plant first, then roll it out using the same templates, data standards and integrations, adjusted for each site's local requirements.",
      ],
      [
        "What happens after go-live?",
        "Managed services cover application support, interface monitoring, release management and continuous improvement, so the link between plant and ERP stays healthy as both change.",
      ],
    ],
  },

  // -------------------------------------------------------------------- Retail
  {
    slug: "retail",
    name: "Retail",
    group: "Commerce",
    image: "/img/industries/retail.jpg",
    imageAlt: "Bright department store floor with clothing displays and tables",
    summary: "Stores, ecommerce and marketplaces connected, with inventory, customer data and forecasting on one core.",
    description:
      "Omnichannel integration, inventory and order visibility, customer and commerce data, demand forecasting, and financial and supply chain integration for retailers.",
    headline: "One view of stock, orders and customers, in every channel.",
    dek: "Store, ecommerce and marketplace systems connected to inventory, finance and supply chain, with the data and forecasting to put the right product in the right place.",
    themes: [
      "Omnichannel integration",
      "Inventory and order visibility",
      "Customer and commerce data",
      "Demand forecasting",
      "Financial and supply chain integration",
    ],
    challenge: {
      lead: "Customers expect to buy, collect and return wherever is convenient. Behind that promise sit store systems, an ecommerce platform, marketplaces, warehouses and finance, each built at a different time. When they disagree about stock or orders, the cost shows up as cancelled orders, markdowns and manual reconciliation.",
      items: [
        [
          "Channels that disagree about stock",
          "Store, warehouse and online inventory updated on different schedules, which leads to overselling online and missed sales in store.",
        ],
        [
          "Orders that cross systems by hand",
          "Pickup in store, ship-from-store and returns handled through workarounds, because order data does not flow cleanly between channels.",
        ],
        [
          "Customer data in silos",
          "Purchase history split across point of sale, ecommerce and loyalty systems, so personalization and service work from a partial picture.",
        ],
        [
          "Forecasts that miss local demand",
          "Replenishment based on aggregate history that does not separate seasonality, promotions and location, so stockouts and excess inventory happen at once.",
        ],
      ],
    },
    help: {
      lead: "We connect commerce channels to the systems that hold inventory, orders, customers and money, then build the data and forecasting on top. We integrate the commerce and store platforms you already run with ERP, supply chain and finance, including Oracle Fusion Cloud ERP and SCM where they are the system of record.",
      points: [
        [
          "Connect every channel",
          "Commerce, store, marketplace and fulfillment systems exchanging orders and inventory through monitored integrations.",
        ],
        [
          "Unify the data",
          "Customer, product and transaction data modelled once, with agreed definitions and controlled access to personal data.",
        ],
        [
          "Forecast where it matters",
          "Demand forecasts by item and location, with promotion and seasonal effects separated, feeding replenishment.",
        ],
      ],
    },
    solutions: [
      {
        title: "Omnichannel integration",
        service: "api-systems-integration",
        body: "Ecommerce, point of sale, marketplaces and fulfillment connected, so orders and inventory move reliably between channels.",
        includes: [
          "Commerce platform and point-of-sale integration with ERP",
          "Marketplace order and inventory feeds",
          "Event-driven updates with retry and replay",
        ],
      },
      {
        title: "Inventory and order visibility",
        service: "oracle-scm",
        body: "A shared view of available stock and order status across stores, warehouses and online.",
        includes: [
          "Available-to-promise across locations",
          "Order orchestration for ship-from-store, pickup and returns",
          "Exception queues for orders that cannot be fulfilled",
        ],
      },
      {
        title: "Customer and commerce data",
        service: "data-platform-warehousing",
        body: "A governed data foundation bringing together customer, product and transaction data from every channel.",
        includes: [
          "Cloud data warehouse with customer and sales models",
          "Classification and masking of personal data",
          "Shared definitions for sales, margin and returns",
        ],
      },
      {
        title: "Demand forecasting",
        service: "forecasting-machine-learning",
        body: "Forecasts at item and location level that separate seasonality and promotions, connected to replenishment.",
        includes: [
          "A measured baseline before any model is deployed",
          "Promotion and seasonal effects modelled separately",
          "Accuracy monitoring with agreed retraining triggers",
        ],
      },
      {
        title: "Financial and supply chain integration",
        service: "oracle-erp",
        body: "Sales, returns, inventory and supplier transactions reconciled automatically with the ledger and supply chain systems.",
        includes: [
          "Sales and tender reconciliation into Oracle Financials",
          "Supplier and purchase order integration",
          "Inventory valuation aligned between operations and finance",
        ],
      },
    ],
    capabilities: [
      {
        family: "Oracle Cloud",
        purpose: "The finance and supply chain core.",
        items: [
          "Oracle Fusion Cloud Financials",
          "Oracle Fusion Cloud SCM",
          "Order Management",
          "Inventory Management",
          "Procurement",
        ],
      },
      {
        family: "AI",
        purpose: "Grounded in your own data.",
        items: [
          "Demand forecasting by item and location",
          "Churn and propensity scoring",
          "Product and policy assistants that cite sources",
          "Anomaly detection on returns and transactions",
        ],
      },
      {
        family: "Data",
        purpose: "Customer and commerce data, governed.",
        items: [
          "Cloud data warehouse",
          "Customer, product and sales models",
          "Personal-data classification and masking",
          "Dashboards in Oracle Analytics, Power BI or Tableau",
        ],
      },
      {
        family: "Integration",
        purpose: "Channels that stay in step.",
        items: [
          "Commerce platform and point-of-sale APIs",
          "Marketplace and partner feeds",
          "Event streaming for orders and inventory",
          "Oracle and non-Oracle ERP connectors",
        ],
      },
      {
        family: "Cloud",
        purpose: "Ready for peak trading.",
        items: [
          "Cloud-native services with autoscaling",
          "Progressive delivery with automated rollback",
          "Performance and load testing",
          "Monitoring with on-call runbooks",
        ],
      },
    ],
    useCases: [
      [
        "Stopping online overselling",
        "Publishing stock movements from stores and warehouses as events, so online availability updates as stock moves rather than after an overnight batch.",
      ],
      [
        "Launching pickup in store",
        "Orchestrating orders between the commerce platform, store systems and ERP, with an exception path when an item cannot be picked.",
      ],
      [
        "Building a single customer view",
        "Consolidating point-of-sale, ecommerce and loyalty data in a governed warehouse with access controls on personal data, so marketing and service work from the same record.",
      ],
      [
        "Reconciling channel sales to the ledger",
        "Automating the flow of sales, tenders, refunds and fees from each channel into Oracle Financials, with exceptions routed for review.",
      ],
    ],
    approach: [
      [
        "Trace orders and stock across channels",
        "We follow how an order and a unit of stock move through every system today, including the manual steps, before changing any of them.",
      ],
      [
        "Agree the definitions",
        "Available stock, a completed order, net sales and a return are defined once, so every channel and every report uses the same meaning.",
      ],
      [
        "Release around the trading calendar",
        "Changes are scheduled outside peak, tested under load, and released with automated rollback.",
      ],
      [
        "Measure the outcome",
        "Overselling, cancellations, forecast accuracy and reconciliation exceptions are tracked, so the next priority is chosen from evidence.",
      ],
    ],
    services: [
      "api-systems-integration",
      "data-platform-warehousing",
      "forecasting-machine-learning",
      "oracle-scm",
      "oracle-erp",
      "cloud-native-development",
    ],
    insights: ["modernizing-oracle-erp-without-the-big-bang-risk"],
    caseStudies: [],
    faqs: [
      [
        "Which commerce and point-of-sale platforms do you integrate with?",
        "We integrate through the APIs, events and files each platform provides, and connect them to Oracle and non-Oracle ERP and supply chain systems. Tell us which platforms you run and we will confirm the approach for each one.",
      ],
      [
        "Do we need a new ERP to go omnichannel?",
        "Usually not. Most omnichannel problems are integration and data problems. We start by connecting the systems you have; if a core system turns out to be the constraint, we set out the options and trade-offs before recommending a replacement.",
      ],
      [
        "How do you protect customer data?",
        "Personal data is classified, masked where it is not needed, and access-controlled in the data platform itself, with every access auditable. Your privacy and legal teams set the policy; we implement and document it.",
      ],
      [
        "Can you help us prepare for peak trading?",
        "Yes. We review capacity and autoscaling, run load tests against expected peak volumes, and schedule changes around your trading calendar, with monitoring and on-call runbooks in place.",
      ],
      [
        "How do you know whether demand forecasting is working?",
        "By comparing it with a simple baseline on your own history. A model is deployed only if it beats that baseline, and its accuracy is tracked afterwards with retraining triggers agreed in advance.",
      ],
    ],
  },
];

export function getIndustry(slug: string): Industry | undefined {
  return INDUSTRY_PAGES.find((i) => i.slug === slug);
}

/** The page for an INDUSTRIES name, or the Industries hub if it has none. */
export function industryHref(name: string): string {
  const match = INDUSTRY_PAGES.find((i) => i.name === name);
  return match ? `/industries/${match.slug}` : "/industries";
}

/**
 * What the enquiry email should say the lead came from, given the page path
 * the form was opened on. Only known industry pages resolve; anything else
 * (including a path a client made up) falls back to the default label, so the
 * value that reaches the inbox is always one we wrote.
 */
export function enquirySource(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  if (path === "/industries") return "Industries overview page";
  const m = /^\/industries\/([a-z-]+)$/.exec(path);
  const industry = m ? getIndustry(m[1]) : undefined;
  return industry ? `${industry.name} industry page` : undefined;
}
