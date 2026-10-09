/**
 * One page per service line. `cap` indexes into CAPS / CAP_SERVICES in
 * data/marketing.ts, and `title` must match the CAP_SERVICES string exactly so
 * the mega-menu can resolve a service name to its page.
 *
 * Copy describes how the work is run, which is verifiable. It deliberately
 * invents no client names, contract values, headcount or outcome percentages.
 * Anything specific has to come from the company before it goes on the site.
 *
 * `video` is optional and unset everywhere today: there is no per-service
 * footage yet. Drop an MP4 in public/video and set the field and the page
 * renders a player in place of the still.
 */

export type Service = {
  slug: string;
  /** Index into CAPS — which capability this belongs to. */
  cap: number;
  /** Must equal the CAP_SERVICES entry verbatim. */
  title: string;
  dek: string;
  image: string;
  video?: string;
  /** Concrete scope: the modules, technologies or components this covers. */
  covers: readonly (readonly [string, string])[];
  /** What the service actually is, in plain terms. */
  what: string;
  /** How an engagement runs, in order. */
  approach: readonly (readonly [string, string])[];
  /** What the client ends up holding. */
  deliverables: readonly string[];
};

export const SERVICES: readonly Service[] = [
  // ---------------------------------------------------------------- Engineering
  {
    slug: "cloud-native-development",
    cap: 0,
    title: "Cloud-native development",
    dek: "Services built to run on cloud infrastructure from the first commit, not lifted onto it later.",
    image: "/img/dev.jpg",
    covers: [
      ["Containers and orchestration", "Kubernetes, ECS or Cloud Run, with the deployment manifests under version control"],
      ["Managed data services", "Postgres, Redis, object storage and queues, run by the provider rather than by you"],
      ["Event-driven patterns", "Pub/sub and message queues where synchronous calls would couple services together"],
      ["Infrastructure as code", "Terraform or CloudFormation, so environments are reproducible rather than hand-built"],
      ["Progressive delivery", "Blue/green and canary releases with automated rollback on error-rate thresholds"],
    ],
    what: "We design and build applications around the things cloud platforms are actually good at: horizontal scale, managed data services, and deployment that happens many times a day without a maintenance window. The work covers the application itself, the pipeline that ships it, and the infrastructure definition that stands it up.",
    approach: [
      ["Shape the service boundaries", "We map the domain before writing code, so the split between services follows how the business actually works rather than how the current database happens to be organised."],
      ["Build the pipeline first", "The deployment path exists before the first feature does. If you cannot ship a trivial change safely on day one, you will not be able to ship a hard one in month six."],
      ["Build in vertical slices", "Each increment goes all the way through: interface, logic, storage, tests, deployed. You see working software early and can change direction while it is still cheap."],
      ["Hand over with the runbook", "Your team gets the architecture decisions, the operational runbook, and the on-call knowledge, not just repository access."],
    ],
    deliverables: [
      "Running services in your cloud account, under your IAM",
      "Infrastructure as code for every environment",
      "CI/CD pipeline with automated tests and rollback",
      "Architecture decision records explaining why, not just what",
      "Operational runbook and handover sessions",
    ],
  },
  {
    slug: "platform-engineering",
    cap: 0,
    title: "Platform engineering",
    dek: "The internal foundations that let your product teams ship without re-solving infrastructure each time.",
    image: "/img/datacenter.jpg",
    covers: [
      ["Golden-path templates", "Pre-wired service scaffolds so a new service starts with logging, auth and CI already correct"],
      ["Environment provisioning", "Self-service ephemeral environments per branch, torn down automatically"],
      ["Observability stack", "Metrics, structured logs and distributed traces, consistent across every service"],
      ["Secrets and policy", "Central secret management and policy-as-code enforced in the pipeline, not by review"],
      ["Service catalogue", "A register of what exists, who owns it and what it depends on"],
    ],
    what: "A platform is the paved road: the deployment pipeline, environment provisioning, observability, and security defaults that every team shares. Done well it removes the per-team infrastructure tax. Done badly it becomes a gate nobody can get through. We build the first kind.",
    approach: [
      ["Find the real friction", "We interview the teams who will use it and watch how they ship today. The platform is scoped around the steps that actually cost them time."],
      ["Make the paved road optional", "Teams adopt it because it is faster than the alternative, not because it is mandated. That constraint keeps the platform honest."],
      ["Ship it as a product", "Versioned, documented, with a support channel and a changelog. Internal users are still users."],
      ["Measure adoption, not output", "Success is teams choosing it and lead time dropping, not the number of components delivered."],
    ],
    deliverables: [
      "Self-service environment provisioning",
      "Shared CI/CD templates and golden paths",
      "Centralised observability with sane defaults",
      "Security and policy baked into the pipeline",
      "Platform documentation and onboarding guide",
    ],
  },
  {
    slug: "api-systems-integration",
    cap: 0,
    title: "API & systems integration",
    dek: "Making systems that were never designed to talk to each other exchange data reliably.",
    image: "/img/hero_network.jpg",
    covers: [
      ["REST and GraphQL design", "Versioned, documented contracts with backwards-compatibility rules agreed up front"],
      ["Event streaming", "Kafka, SNS/SQS or equivalent where systems need to react rather than poll"],
      ["ERP and CRM connectors", "Oracle, SAP, Salesforce, Dynamics and the long tail of line-of-business systems"],
      ["File and EDI transfer", "SFTP batches, EDI documents and the fixed-width formats trading partners still send"],
      ["Gateway, auth and limits", "API gateway with authentication, rate limiting and per-consumer quotas"],
    ],
    what: "Most enterprise problems are integration problems wearing a costume. We connect ERP, CRM, warehouse, finance and third-party systems with interfaces that handle the unglamorous realities: partial failure, retries, schema drift, and the batch job that occasionally sends the same record twice.",
    approach: [
      ["Map the real data flows", "Including the spreadsheet someone emails on Fridays. Undocumented paths are usually load-bearing."],
      ["Design contracts first", "Interfaces are agreed and versioned before implementation, so neither side is guessing about the other's behaviour."],
      ["Assume failure", "Idempotency, retries with backoff, dead-letter handling and replay are designed in. Integrations fail; the question is whether they fail quietly."],
      ["Instrument every hop", "You can see what moved, when, and what did not. Debugging an integration without that is guesswork."],
    ],
    deliverables: [
      "Documented, versioned API contracts",
      "Integration services with retry and replay",
      "Monitoring and alerting per interface",
      "Data mapping and transformation documentation",
      "Runbook for the common failure modes",
    ],
  },
  {
    slug: "application-modernization",
    cap: 0,
    title: "Application modernization",
    dek: "Moving legacy applications forward without a rewrite that never lands.",
    image: "/img/engineer.jpg",
    covers: [
      ["Strangler-fig routing", "A facade in front of the legacy app so traffic moves to new code path by path"],
      ["Monolith decomposition", "Carving out bounded contexts that can be deployed and scaled independently"],
      ["Database decoupling", "Breaking the shared database that usually blocks any real separation of services"],
      ["Legacy interfaces", "Mainframe, AS/400 and older middleware wrapped behind modern APIs"],
      ["Re-platforming", "Moving workloads to containers or managed services where a rewrite is not justified"],
    ],
    what: "Full rewrites have a poor track record: they take longer than promised and the old system keeps changing underneath. We prefer incremental modernization, carving functionality out of the legacy application piece by piece while it stays in production and keeps earning.",
    approach: [
      ["Assess honestly", "Some systems should be modernized, some replaced, and some left alone. We say which is which before anyone commits budget."],
      ["Put a seam in", "A routing layer in front of the legacy system lets new functionality be served from new code without the caller knowing or caring."],
      ["Migrate by slice", "One capability at a time, each released and verified. The legacy system shrinks rather than being switched off in one event."],
      ["Decommission deliberately", "Old paths come out once traffic is proven to have moved, with the evidence to show it."],
    ],
    deliverables: [
      "Modernization assessment with a recommended path",
      "Incremental migration plan with sequencing",
      "New services running alongside the legacy system",
      "Cutover and rollback procedures per slice",
      "Decommissioning checklist for retired components",
    ],
  },
  {
    slug: "quality-test-automation",
    cap: 0,
    title: "Quality & test automation",
    dek: "A test suite teams trust enough to deploy on, rather than one they routinely skip.",
    image: "/img/hero_server.jpg",
    covers: [
      ["Unit and contract tests", "Fast tests at the boundary, plus consumer-driven contracts between services"],
      ["Integration and API tests", "Real database and real HTTP, against ephemeral environments"],
      ["End-to-end journeys", "A small set of critical user paths in Playwright or Cypress, kept deliberately small"],
      ["Performance and load", "Baseline throughput and latency, with regression thresholds in the pipeline"],
      ["Test data management", "Seeded, anonymised datasets so tests are repeatable and safe to run"],
    ],
    what: "A slow or flaky suite is worse than none, because it trains people to ignore red. We build layered automated testing that runs fast, fails for real reasons, and gives a clear enough signal that releasing on a green build is a reasonable decision.",
    approach: [
      ["Fix flakiness first", "An unreliable suite cannot be built on. Existing flaky tests get repaired or removed before anything is added."],
      ["Weight the pyramid properly", "Many fast unit tests, fewer integration tests, a small set of end-to-end journeys. Inverting that is why suites take an hour."],
      ["Test behaviour, not implementation", "Tests coupled to internals break on every refactor and get deleted. Tests on behaviour survive."],
      ["Put it in the pipeline", "Automated on every change, with results visible to everyone and a clear owner when it breaks."],
    ],
    deliverables: [
      "Layered automated test suite in your pipeline",
      "Flaky test remediation and a stability baseline",
      "Coverage reporting on the paths that matter",
      "Test data management approach",
      "Team enablement so the suite keeps being maintained",
    ],
  },

  // ----------------------------------------------------------------- AI & Data
  {
    slug: "genai-assistants-copilots",
    cap: 1,
    title: "GenAI assistants & copilots",
    dek: "Assistants grounded in your own content, with the evaluation to show whether they are actually right.",
    image: "/img/ai.jpg",
    covers: [
      ["Retrieval over your content", "Chunking, embedding and vector search across your documents, wikis and systems"],
      ["Tool and function calling", "The assistant reads from and acts on your real systems, under explicit permissions"],
      ["Evaluation harness", "A scored question set run on every change, so accuracy is measured rather than assumed"],
      ["Guardrails and refusal", "Topic boundaries, confidence thresholds and routing to a human when it does not know"],
      ["PII handling and audit", "Redaction before anything leaves your boundary, and a log of every prompt and response"],
    ],
    what: "A demo assistant takes an afternoon. A production one needs grounding in your real documents, handling for the questions it cannot answer, an audit trail, and a way to measure accuracy that is not somebody's impression. We build the second kind.",
    approach: [
      ["Pick a question set first", "We agree the questions it must answer correctly before building. That set becomes the evaluation harness and the definition of done."],
      ["Ground it in your content", "Retrieval over your documents and systems, with citations, so answers can be checked rather than trusted."],
      ["Design the refusal path", "Knowing when to say \"I don't know\" and route to a human matters more than breadth. A confident wrong answer is the expensive failure."],
      ["Evaluate continuously", "Accuracy is tracked against the question set on every change, so regressions surface before users find them."],
    ],
    deliverables: [
      "Assistant deployed in your environment",
      "Retrieval pipeline over your own content",
      "Evaluation harness with a scored question set",
      "Guardrails, refusal handling and escalation routing",
      "Usage and accuracy monitoring",
    ],
  },
  {
    slug: "forecasting-machine-learning",
    cap: 1,
    title: "Forecasting & machine learning",
    dek: "Models that stay in production and keep being retrained, not a notebook that was accurate once.",
    image: "/img/hero_bluedata.jpg",
    covers: [
      ["Demand forecasting", "SKU and location level forecasts, with seasonality and promotion effects separated out"],
      ["Churn and propensity", "Scoring that feeds a retention or sales workflow rather than sitting in a report"],
      ["Predictive maintenance", "Sensor and telemetry models that flag equipment before it fails"],
      ["Anomaly detection", "Fraud, error and outlier detection on transaction and operational streams"],
      ["Feature pipelines and MLOps", "Versioned features, reproducible training and automated retraining triggers"],
    ],
    what: "Demand forecasting, churn and risk scoring, predictive maintenance. The modelling is usually the short part; the work is the data pipeline feeding it, the deployment path, and the monitoring that catches drift before the business notices the numbers have stopped making sense.",
    approach: [
      ["Set the baseline", "We start with the simplest reasonable approach and measure it. A model that cannot beat last-week's-number is not worth deploying."],
      ["Build the feature pipeline", "Reproducible, versioned, and identical between training and serving. Training-serving skew is the most common silent failure."],
      ["Deploy behind a decision", "A prediction nobody acts on has no value. We wire the output into the actual workflow."],
      ["Monitor for drift", "Input distributions and accuracy are tracked, with retraining triggers defined up front."],
    ],
    deliverables: [
      "Model serving in production with versioning",
      "Reproducible feature and training pipeline",
      "Baseline comparison and accuracy reporting",
      "Drift monitoring and retraining triggers",
      "Documentation of assumptions and known limits",
    ],
  },
  {
    slug: "data-platform-warehousing",
    cap: 1,
    title: "Data platform & warehousing",
    dek: "One place where the numbers agree, with lineage back to the source.",
    image: "/img/data.jpg",
    covers: [
      ["Cloud warehouse", "Snowflake, BigQuery, Redshift or Oracle Autonomous Data Warehouse"],
      ["Ingestion and ELT", "Scheduled and streaming loads from ERP, CRM, operational databases and third parties"],
      ["Dimensional modelling", "Facts, dimensions and slowly-changing history, so time comparisons actually work"],
      ["Transformation layer", "dbt-style versioned SQL models with tests and documentation attached"],
      ["BI connectivity", "A governed semantic layer so Power BI, Tableau or OAC all read the same definitions"],
    ],
    what: "When finance, operations and the board each have a different figure for the same measure, the problem is structural. We build the warehouse, the ingestion from source systems, and the modelling layer that makes a single definition of a metric possible and traceable.",
    approach: [
      ["Agree the definitions", "What counts as an active customer, a closed order, revenue. Mostly a business conversation, and the part that is skipped most often."],
      ["Ingest reliably", "Scheduled, monitored, idempotent loads with clear handling for late and corrected data."],
      ["Model in layers", "Raw, cleaned, and business-facing marts kept separate, so a definition can change without re-ingesting history."],
      ["Test the data", "Automated checks on freshness, volume and referential integrity, so a broken upstream feed is caught before it reaches a dashboard."],
    ],
    deliverables: [
      "Cloud data warehouse with layered models",
      "Monitored ingestion from source systems",
      "Documented metric definitions",
      "Automated data quality tests",
      "Lineage from report back to source",
    ],
  },
  {
    slug: "document-contract-intelligence",
    cap: 1,
    title: "Document & contract intelligence",
    dek: "Extracting structured, checkable data from contracts, invoices and forms at volume.",
    image: "/img/boardroom.jpg",
    covers: [
      ["OCR and layout parsing", "Scanned documents, tables and multi-column layouts, not just clean digital PDFs"],
      ["Clause and obligation extraction", "Renewal dates, notice periods, liability caps and payment terms pulled out as fields"],
      ["Invoice and PO matching", "Three-way matching against purchase orders and goods receipts"],
      ["Confidence and review queues", "Per-field scoring, with low-confidence extractions routed to a reviewer"],
      ["Provenance", "Every value links to its page and position in the source document"],
    ],
    what: "Obligations, dates, amounts and clauses locked inside PDFs. We build extraction that turns them into structured records, with a confidence score on every field and a review queue for the ones that need a person, so accuracy does not depend on hoping the model was right.",
    approach: [
      ["Start from a labelled sample", "A representative set of real documents, labelled, gives a measurable accuracy baseline instead of an impression."],
      ["Extract with confidence scores", "Every field carries a score. High-confidence fields flow through; the rest are queued."],
      ["Keep a human in the loop", "Review corrections feed back as training signal, so accuracy improves with use rather than degrading."],
      ["Preserve provenance", "Every extracted value links back to its location in the source document, so any figure can be verified."],
    ],
    deliverables: [
      "Extraction pipeline for your document types",
      "Confidence scoring and exception queue",
      "Reviewer interface with correction capture",
      "Accuracy reporting against a labelled set",
      "Source-linked provenance for every field",
    ],
  },
  {
    slug: "data-governance-guardrails",
    cap: 1,
    title: "Data governance & guardrails",
    dek: "Knowing what data you hold, who can reach it, and what the AI systems are allowed to do with it.",
    image: "/img/hero_ai.jpg",
    covers: [
      ["Catalogue and classification", "Discovery of what data exists and tagging of what is sensitive"],
      ["Row and column security", "Masking and filtering enforced in the data layer, applying to every tool that queries it"],
      ["Retention and deletion", "Implemented schedules, including the deletion requests you are obliged to honour"],
      ["AI data boundaries", "Explicit rules on what may be sent to a model, what is redacted and what is logged"],
      ["Access audit", "Who read what and when, answerable as a query"],
    ],
    what: "Governance earns its keep when it is enforced by the platform rather than written in a policy nobody reads. We implement classification, access control, retention and audit as working controls, including the specific questions AI raises about what may be sent to a model and what must be logged.",
    approach: [
      ["Inventory and classify", "You cannot protect what you have not found. Discovery comes before policy."],
      ["Enforce in the platform", "Access and masking rules live in the data layer, so they apply regardless of which tool is querying."],
      ["Set AI boundaries explicitly", "Which data may reach a model, which must be redacted, what gets logged. Written down and enforced, not assumed."],
      ["Make audit a query", "Who accessed what, when, answerable on demand rather than reconstructed under pressure."],
    ],
    deliverables: [
      "Data inventory with classification",
      "Role-based access and masking in the platform",
      "Retention and deletion policy, implemented",
      "AI data-handling boundaries and logging",
      "Audit reporting",
    ],
  },

  // -------------------------------------------------------------- Oracle Cloud
  {
    slug: "oracle-erp",
    cap: 2,
    title: "Oracle ERP",
    dek: "Oracle Cloud ERP implementation and migration, sequenced so the business keeps running.",
    image: "/img/office.jpg",
    covers: [
      ["Financials", "General Ledger, Payables, Receivables, Fixed Assets, Cash Management and Expenses"],
      ["Procurement", "Purchasing, Self-Service Procurement, Supplier Portal and Sourcing"],
      ["Project Portfolio Management", "Project costing, billing and contracts for project-driven organisations"],
      ["Risk and compliance", "Advanced Access Controls and segregation-of-duties monitoring"],
      ["Migration paths", "From E-Business Suite, PeopleSoft, JD Edwards or a non-Oracle ERP"],
      ["Quarterly update readiness", "Regression packs and a process for Oracle's quarterly release cadence"],
    ],
    what: "Financials, procurement and project management on Oracle Cloud ERP. Whether moving from E-Business Suite, another ERP, or a set of systems that grew organically, the hard parts are the same: data migration, the reporting nobody documented, and a cutover that does not land on month-end.",
    approach: [
      ["Fit-gap against standard", "Every customisation is a future upgrade cost. We establish what standard functionality covers before designing anything bespoke."],
      ["Migrate data early and often", "Trial loads start in the first phase, not the last. Data quality is always worse than expected and the discovery needs time."],
      ["Run conference room pilots", "Your finance team works real scenarios in a configured system and signs off on what they have actually used."],
      ["Rehearse the cutover", "The switchover is practised end to end with timings and a rollback point before it happens for real."],
    ],
    deliverables: [
      "Configured Oracle Cloud ERP environment",
      "Migrated and reconciled master and transactional data",
      "Integrations to surrounding systems",
      "Reporting rebuilt and validated against current numbers",
      "Cutover plan, rehearsal results and hypercare support",
    ],
  },
  {
    slug: "oracle-scm",
    cap: 2,
    title: "Oracle SCM",
    dek: "Supply chain on Oracle Cloud: planning, inventory, procurement and order management.",
    image: "/img/logistics.jpg",
    covers: [
      ["Inventory and cost management", "Stock accuracy, valuation methods and cost accounting"],
      ["Order management", "Order capture, Global Order Promising and fulfilment orchestration"],
      ["Supply and demand planning", "Demand Management, Supply Planning and Replenishment Planning"],
      ["Manufacturing", "Work definitions, work orders and shop-floor execution"],
      ["Procurement and suppliers", "Supplier qualification, collaboration and purchase order flows"],
      ["Warehouse integration", "WMS and third-party logistics interfaces back to the system of record"],
    ],
    what: "Oracle Cloud SCM across planning, inventory, manufacturing and order management. Supply chain implementations live or die on master data and on integration with the physical operation, so that is where we concentrate the effort.",
    approach: [
      ["Fix master data first", "Items, suppliers, locations, units of measure. Planning output is only as good as this, and it is usually the weakest part."],
      ["Model the real flow", "Including the exceptions: drop-ship, returns, partial receipts, the supplier who sends paper. Edge cases are most of the work."],
      ["Integrate to the floor", "Warehouse and shop-floor systems connected so the system of record reflects what physically happened."],
      ["Pilot one flow end to end", "A single product line proven all the way through before the rollout widens."],
    ],
    deliverables: [
      "Configured Oracle Cloud SCM modules",
      "Cleansed and governed master data",
      "Warehouse and manufacturing integrations",
      "Planning parameters tuned against real demand",
      "Pilot results and phased rollout plan",
    ],
  },
  {
    slug: "oracle-hcm",
    cap: 2,
    title: "Oracle HCM",
    dek: "Core HR, payroll and talent on Oracle Cloud, with the parallel runs to prove payroll is right.",
    image: "/img/team.jpg",
    covers: [
      ["Core HR", "Workforce structures, positions, assignments and the approval hierarchies behind them"],
      ["Absence management", "Accrual plans, entitlements and local leave rules"],
      ["Payroll", "Elements, balances, costing and parallel runs until results reconcile"],
      ["Talent", "Recruiting, Onboarding, Performance, Goals and Succession"],
      ["Compensation", "Salary structures, cycles and workforce compensation plans"],
      ["Benefits and integrations", "Benefit plans plus feeds to providers, time systems and finance"],
    ],
    what: "Oracle Cloud HCM covering core HR, absence, payroll and talent. Payroll is unforgiving: it has to be exactly right on a fixed date, for everyone. The method reflects that, with parallel running until results reconcile.",
    approach: [
      ["Map the real policies", "Including the local variations and historical agreements that live in people's heads rather than the handbook."],
      ["Build payroll against live data", "Configured and tested with real employee records under appropriate controls, not synthetic samples."],
      ["Parallel run until clean", "New and old payroll run side by side for multiple cycles. Every variance is explained before cutover is even discussed."],
      ["Prepare managers and employees", "Self-service only reduces HR load if people can actually use it. Enablement is planned, not assumed."],
    ],
    deliverables: [
      "Configured Oracle Cloud HCM",
      "Payroll configured, tested and parallel-run to reconciliation",
      "Migrated employee and historical data",
      "Integrations to finance, time and benefits providers",
      "Manager and employee enablement materials",
    ],
  },
  {
    slug: "oracle-epm",
    cap: 2,
    title: "Oracle EPM",
    dek: "Planning, budgeting and close on Oracle EPM, so the cycle stops living in spreadsheets.",
    image: "/img/hero_city.jpg",
    covers: [
      ["Planning and budgeting", "EPBCS with driver-based models for workforce, capital and projects"],
      ["Consolidation and close", "FCCS for intercompany elimination, currency translation and group reporting"],
      ["Account reconciliation", "ARCS with automated matching and reconciliation certification"],
      ["Narrative reporting", "Management and statutory reporting packs tied to the same data"],
      ["Profitability and cost", "PCMCS allocation models for product, customer or channel profitability"],
      ["Data integration", "Data Management pulling actuals from ERP on a schedule rather than by hand"],
    ],
    what: "Oracle EPM for planning, budgeting, forecasting and financial close. The goal is a shorter cycle with a clear audit trail, replacing the spreadsheet network that currently carries the process and depends on a handful of people.",
    approach: [
      ["Document the current cycle", "Every spreadsheet, handoff and manual adjustment. The informal process is the real process and has to be understood before it is replaced."],
      ["Model the driver logic", "Planning models built on business drivers rather than last year plus a percentage."],
      ["Automate the data in", "Actuals flow from the ERP automatically. Manual loading is where both delay and error enter."],
      ["Shorten the close iteratively", "Each cycle, the slowest step is identified and addressed. Measurable improvement rather than one redesign."],
    ],
    deliverables: [
      "Configured EPM planning and close applications",
      "Automated actuals integration from ERP",
      "Driver-based planning models",
      "Close task management with ownership and status",
      "Documented cycle timings and improvement backlog",
    ],
  },
  {
    slug: "oracle-cloud-infrastructure",
    cap: 2,
    title: "Oracle Cloud Infrastructure",
    dek: "OCI landing zones, migration and operations, built to your security and compliance requirements.",
    image: "/img/cloud.jpg",
    covers: [
      ["Landing zone", "Compartment hierarchy, tagging strategy and guardrails defined before workloads arrive"],
      ["Identity", "Identity domains, federation to your IdP, and least-privilege policy design"],
      ["Network", "VCN topology, gateways, load balancing and FastConnect to on-premises"],
      ["Database", "Autonomous Database, Base Database and Exadata Cloud Service"],
      ["Resilience", "Cross-availability-domain and cross-region backup and disaster recovery, tested"],
      ["Cost governance", "Budgets, quotas and tag-based showback by team or application"],
    ],
    what: "Designing and running workloads on OCI: the landing zone, network and identity design, migration of existing workloads, and the operational practice afterwards. Particularly where Oracle workloads need to sit close to the rest of the estate.",
    approach: [
      ["Design the landing zone", "Compartments, identity, network segmentation and guardrails defined before the first workload arrives. Retrofitting this is expensive."],
      ["Classify before migrating", "Each workload assessed for rehost, re-platform or rebuild. Not everything deserves the same treatment."],
      ["Migrate in waves", "Lowest-risk workloads first, so the process is proven before anything critical moves."],
      ["Operate with cost visibility", "Tagging and budget alerts from the start. Cloud cost discipline is much harder to add later."],
    ],
    deliverables: [
      "OCI landing zone as code",
      "Identity, network and security baseline",
      "Workload assessment and migration waves",
      "Backup, DR and resilience configuration",
      "Cost tagging, budgets and reporting",
    ],
  },

  // ------------------------------------------------- Enterprise Transformation
  {
    slug: "finance-transformation",
    cap: 3,
    title: "Finance transformation",
    dek: "Reshaping how finance operates, not just which system it operates in.",
    image: "/img/finance.jpg",
    covers: [
      ["Record to report", "Close calendar, journal workflow, reconciliations and the controls around them"],
      ["Order to cash", "Billing, collections, credit management and cash application"],
      ["Procure to pay", "Requisition through to payment, including invoice exception handling"],
      ["Chart of accounts", "Redesign to support both statutory and management reporting without manual mapping"],
      ["Shared services", "Which activities centralise, which stay local, and the service levels between them"],
      ["Control framework", "Controls mapped to the redesigned process rather than inherited from the old one"],
    ],
    what: "New software on an unchanged process produces the same results more expensively. We work on the process, the controls and the operating model alongside the technology, so the close is shorter and the team spends more time on analysis than on collection.",
    approach: [
      ["Baseline the current state", "Cycle times, manual touchpoints, where the effort actually goes. Measured, not estimated."],
      ["Redesign around the target", "Process designed for where you want to be, then the system configured to support it, in that order."],
      ["Standardise before automating", "Automating an inconsistent process encodes the inconsistency. Standardisation comes first."],
      ["Shift the team's work", "Roles and skills change when the manual work goes. Planning for that is part of the engagement."],
    ],
    deliverables: [
      "Current-state baseline with cycle time measurement",
      "Target operating model for finance",
      "Redesigned and documented core processes",
      "Control framework mapped to the new process",
      "Role and capability transition plan",
    ],
  },
  {
    slug: "procurement-sourcing",
    cap: 3,
    title: "Procurement & sourcing",
    dek: "Bringing spend under management with a process people will actually follow.",
    image: "/img/meeting.jpg",
    covers: [
      ["Spend analysis", "Classified spend across the estate, including off-contract and non-PO invoices"],
      ["Category strategy", "Per-category approach, sequenced by addressable value rather than ease"],
      ["Sourcing events", "RFI, RFP and reverse auction process with structured evaluation"],
      ["Contract lifecycle", "Authoring, approval, repository and renewal alerting"],
      ["Supplier management", "Onboarding, qualification, risk screening and performance review"],
      ["P2P compliance", "Making the compliant buying route faster than the workaround"],
    ],
    what: "Source-to-pay covering supplier management, sourcing events, contracts and purchase-to-pay. Most procurement problems are compliance problems: the policy exists but buying around it is easier. We design for the path of least resistance to be the compliant one.",
    approach: [
      ["See the actual spend", "Classified spend analysis across the estate, including the invoices that never touched a purchase order."],
      ["Prioritise by opportunity", "Categories sequenced by addressable value rather than by which is easiest."],
      ["Make compliance the easy path", "If raising a compliant request is slower than a corporate card, people will use the card. The process has to win on convenience."],
      ["Track realisation", "Negotiated savings tracked through to the general ledger, not declared at signature."],
    ],
    deliverables: [
      "Spend analysis with category breakdown",
      "Sourcing pipeline prioritised by value",
      "Source-to-pay process design and configuration",
      "Supplier onboarding and management workflow",
      "Savings tracking through to the ledger",
    ],
  },
  {
    slug: "supply-chain-operations",
    cap: 3,
    title: "Supply-chain operations",
    dek: "Planning, inventory and fulfilment that hold up when demand does not behave.",
    image: "/img/factory.jpg",
    covers: [
      ["Demand planning and S&OP", "Statistical baseline plus a consensus process with named decision owners"],
      ["Inventory policy", "Segmentation by volume and variability, with safety stock derived from service targets"],
      ["Network design", "Where stock is held and how distribution is structured"],
      ["Fulfilment and promising", "Allocation rules, order promising and exception handling"],
      ["Supplier collaboration", "Shared forecasts and confirmations so suppliers are not guessing"],
    ],
    what: "Working on how supply chain is planned and run: demand and supply planning, inventory policy, and the fulfilment process. Usually alongside a forecasting model, because a better forecast only helps if the planning process can act on it.",
    approach: [
      ["Segment the portfolio", "Different products need different policies. A single service level across everything over-stocks the slow lines and under-stocks the fast ones."],
      ["Set inventory policy deliberately", "Safety stock derived from service targets and demand variability rather than inherited from a previous system."],
      ["Connect planning to execution", "A plan nobody can execute against is a forecast. Planning output is wired into purchasing and production."],
      ["Review on a cadence", "A regular planning cycle with named owners and decisions recorded, so the process survives staff changes."],
    ],
    deliverables: [
      "Portfolio segmentation and service level policy",
      "Inventory policy with calculated safety stock",
      "Demand and supply planning process design",
      "Planning-to-execution integration",
      "Planning cadence with defined roles",
    ],
  },
  {
    slug: "process-automation",
    cap: 3,
    title: "Process automation",
    dek: "Removing manual steps where it pays, and saying so where it does not.",
    image: "/img/consultant.jpg",
    covers: [
      ["Workflow orchestration", "Multi-step processes with state, approvals and audit across several systems"],
      ["Legacy UI automation", "RPA where a system has no API and is not going to get one"],
      ["Document-triggered flows", "Processes that start from an inbound invoice, form or contract"],
      ["Approval routing", "Delegation, thresholds and escalation that match the real authority matrix"],
      ["Exception handling", "A queue and an owner for everything the automation cannot complete"],
    ],
    what: "Workflow automation across finance, HR and operations. Automation has a maintenance cost, so the honest answer is sometimes to fix or remove the process instead. We quantify before building and will tell you when a candidate is not worth automating.",
    approach: [
      ["Build the candidate list", "Processes with volume, rules that can be written down, and stable inputs. Judgement-heavy work is a poor fit."],
      ["Simplify before automating", "Often several steps can simply be deleted. Automating them would have preserved work that did not need doing."],
      ["Quantify each candidate", "Time saved against build and maintenance cost. Some do not clear the bar, and we say which."],
      ["Build for change", "Automations break when the underlying process or system changes. Monitoring and ownership are defined at build time."],
    ],
    deliverables: [
      "Process inventory with automation assessment",
      "Business case per candidate, including the rejections",
      "Automated workflows in production",
      "Exception handling and escalation paths",
      "Monitoring, ownership and maintenance plan",
    ],
  },
  {
    slug: "operating-model-design",
    cap: 3,
    title: "Operating-model design",
    dek: "How work, decisions and accountability are arranged once the technology changes.",
    image: "/img/boardroom.jpg",
    covers: [
      ["Capability mapping", "What the organisation must be able to do, independent of current structure"],
      ["Team topology", "How teams are grouped, and the interfaces between them"],
      ["Decision rights", "Who decides, who is consulted, who is informed, written down"],
      ["Build, buy or partner", "Which capabilities are core enough to own and which are better sourced"],
      ["Governance cadence", "The meetings, inputs and decisions that keep the model running"],
    ],
    what: "When systems and processes change, the structure around them usually needs to change too. This covers how teams are organised, who decides what, which capabilities are kept in-house, and how the parts coordinate. Often the difference between a programme that sticks and one that quietly reverts.",
    approach: [
      ["Start from the work", "What has to get done, at what volume and speed. Structure follows from that rather than from an org chart preference."],
      ["Make decision rights explicit", "Who decides, who is consulted, who is informed. Ambiguity here is where delivery slows down."],
      ["Decide what stays in-house", "Capabilities core to your advantage are built internally. The rest can be partnered. That line is a deliberate choice."],
      ["Plan the transition", "Moving to a new model is a change programme in itself, with sequencing and communication, not a reorganisation announcement."],
    ],
    deliverables: [
      "Target operating model with capability map",
      "Decision rights and governance framework",
      "In-house versus partnered capability split",
      "Role definitions and accountability map",
      "Transition plan with sequencing",
    ],
  },

  // ----------------------------------------------------------- Managed Services
  {
    slug: "application-support",
    cap: 4,
    title: "Application support",
    dek: "Ongoing support for the applications we build and the ones you already run.",
    image: "/img/office.jpg",
    covers: [
      ["Incident handling", "First through third line, with defined escalation into engineering"],
      ["Service levels", "Response and resolution targets tiered by business impact"],
      ["Minor enhancements", "Small changes delivered within the support agreement rather than as projects"],
      ["Release management", "Scheduled releases with regression testing and a rollback path"],
      ["Knowledge base", "Runbooks and known-error records kept current as the system changes"],
    ],
    what: "Day-to-day support against agreed service levels: incident handling, fixes, small enhancements and the release cadence. The team doing it has access to the people who built the system, so escalation does not mean starting from scratch.",
    approach: [
      ["Take on knowledge properly", "A structured transition with shadowing and documented runbooks before we take responsibility. Support without context is ticket-shuffling."],
      ["Agree levels that match impact", "Response and resolution targets set by business impact rather than a single blanket SLA."],
      ["Fix causes, not just tickets", "Recurring incidents get root-cause analysis and a permanent fix, so volume trends down."],
      ["Report honestly", "Volumes, response times, what broke and what we did about it, including the misses."],
    ],
    deliverables: [
      "Agreed service levels by impact tier",
      "Incident management with defined escalation",
      "Maintained runbooks and knowledge base",
      "Root-cause analysis on recurring issues",
      "Regular service reporting",
    ],
  },
  {
    slug: "cloud-infrastructure-operations",
    cap: 4,
    title: "Cloud & infrastructure operations",
    dek: "Running the platform day to day: patching, capacity, resilience and cost.",
    image: "/img/datacenter.jpg",
    covers: [
      ["Patch and currency", "OS, runtime and managed-service version currency tracked against a baseline"],
      ["Capacity and scaling", "Autoscaling policies and headroom review against real usage"],
      ["Backup and DR", "Coverage verified and recovery rehearsed on a schedule, with results recorded"],
      ["Security baseline", "CIS-style benchmarks, drift detection and remediation"],
      ["FinOps", "Rightsizing, commitment planning and monthly spend review with named actions"],
    ],
    what: "Operating cloud infrastructure after go-live. Patching and currency, capacity management, backup and disaster recovery that has actually been tested, and the cost discipline that keeps a cloud bill from drifting upward unexamined.",
    approach: [
      ["Define the baseline", "What good looks like for patch currency, backup coverage and resilience, agreed and measured against."],
      ["Automate routine work", "Patching, scaling and routine remediation automated so attention goes to the exceptions."],
      ["Test recovery for real", "A DR plan that has never been executed is a document. Recovery is rehearsed on a schedule with results recorded."],
      ["Review cost monthly", "Spend reviewed against usage with specific recommendations, not a dashboard nobody opens."],
    ],
    deliverables: [
      "Operational baseline and compliance reporting",
      "Automated patching and remediation",
      "Tested backup and DR with documented results",
      "Capacity monitoring and scaling policy",
      "Monthly cost review with recommendations",
    ],
  },
  {
    slug: "monitoring-sre",
    cap: 4,
    title: "Monitoring & SRE",
    dek: "Knowing a service is degraded before your users tell you, and having a path to fix it.",
    image: "/img/hero_server.jpg",
    covers: [
      ["SLIs and SLOs", "Objectives expressed as what users experience, with error budgets"],
      ["Alerting", "Alerts that require action, each mapped to a runbook"],
      ["Distributed tracing", "Request paths across services, so latency can be attributed rather than guessed"],
      ["On-call", "Rota, escalation policy and handover practice"],
      ["Incident command", "Defined roles during an incident, and blameless postmortems with tracked actions"],
    ],
    what: "Service level objectives, alerting that correlates with real user impact, and the incident practice around them. The aim is fewer, better alerts: a page should mean something is actually wrong and there should be a runbook for it.",
    approach: [
      ["Define SLOs from the user's view", "Objectives based on what users experience, not component uptime. A server can be up while the service is unusable."],
      ["Cut the alert noise", "Alerts that do not require action are removed. Alert fatigue is why real incidents get missed."],
      ["Write the runbook with the alert", "No alert ships without a documented response. Working it out at 3am is not a strategy."],
      ["Review incidents blamelessly", "Post-incident reviews focused on systemic causes, with actions tracked to completion."],
    ],
    deliverables: [
      "Service level objectives with error budgets",
      "Actionable alerting mapped to runbooks",
      "Dashboards covering user-facing health",
      "Incident response process and on-call rota",
      "Post-incident reviews with tracked actions",
    ],
  },
  {
    slug: "continuous-improvement",
    cap: 4,
    title: "Continuous improvement",
    dek: "A funded, prioritised backlog after go-live, so the system keeps getting better.",
    image: "/img/team2.jpg",
    covers: [
      ["Usage analytics", "Where people actually spend time in the system, and where they abandon"],
      ["Support-ticket mining", "Recurring themes turned into backlog items rather than repeated fixes"],
      ["Backlog grooming", "Regular prioritisation with your owners and transparent trade-offs"],
      ["Release cadence", "A predictable rhythm so improvements are expected, not negotiated each time"],
      ["Benefit measurement", "Before-and-after on the metric each change was meant to move"],
    ],
    what: "Most systems are at their least useful on day one and then stop changing. This is the standing capacity to keep improving: a backlog informed by real usage and support data, prioritised with you, and delivered on a predictable cadence.",
    approach: [
      ["Mine the real signals", "Support tickets, usage analytics and user feedback show where the system is costing people time."],
      ["Prioritise together", "A regular session with your owners to rank the backlog. Transparent trade-offs rather than a black box."],
      ["Ship on a cadence", "A predictable release rhythm, so improvements are expected rather than negotiated case by case."],
      ["Measure the change", "Did the cycle time drop, did the tickets stop. Improvements are verified, not assumed."],
    ],
    deliverables: [
      "Improvement backlog sourced from usage and support data",
      "Regular prioritisation with your owners",
      "Predictable release cadence",
      "Before-and-after measurement on changes",
      "Roadmap visibility",
    ],
  },
  {
    slug: "specialized-talent",
    cap: 4,
    title: "Specialized talent",
    dek: "Senior engineers, Oracle specialists and data people embedded in your team.",
    image: "/img/careers.jpg",
    covers: [
      ["Senior engineers", "Backend, frontend and full-stack engineers who have run systems in production"],
      ["Oracle consultants", "Functional and technical specialists across ERP, SCM, HCM and EPM"],
      ["Data engineers and scientists", "Pipeline, warehouse and modelling capability"],
      ["Cloud and DevOps", "Platform, SRE and infrastructure engineers"],
      ["Solution architects", "People who can hold the whole design and make the trade-offs explicit"],
    ],
    what: "Where you need specific expertise inside your own team rather than a delivered project. People work to your process and in your tooling, and the engagement is designed so capability stays behind when it ends.",
    approach: [
      ["Scope the gap precisely", "The specific capability and how long it is needed for. Vague requirements produce poor matches."],
      ["Match on evidence", "Candidates assessed against the actual work, with technical discussion rather than keyword matching on a CV."],
      ["Integrate into your team", "Your standards, your tooling, your ceremonies. Parallel teams create integration problems later."],
      ["Transfer knowledge deliberately", "Pairing and documentation planned from the start so capability remains when the engagement ends."],
    ],
    deliverables: [
      "Scoped role definitions with required capability",
      "Assessed candidates matched to the work",
      "Engineers working inside your process",
      "Knowledge transfer and documentation",
      "Defined exit and handover plan",
    ],
  },
] as const;

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

/** Resolve a CAP_SERVICES title to its page path, for the mega-menu. */
export function serviceHref(title: string): string | undefined {
  const match = SERVICES.find((s) => s.title === title);
  return match ? `/services/${match.slug}` : undefined;
}
