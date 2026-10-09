/**
 * Long-form content for the individual service pages, keyed by the slug in
 * data/services.ts. Kept separate so services.ts stays a readable index and
 * this file can grow per capability.
 *
 * Rules this file follows, deliberately:
 *  - No client names, contract values, logos or outcome percentages. Use cases
 *    describe project *types* we can take on, never work we claim to have done.
 *  - External links point at official documentation and official vendor
 *    channels only. No guessed video IDs: a dead link is worse than no link.
 *  - Certifications are named exactly as the vendor names them.
 *
 * A service with no entry here still renders; the extra sections are skipped.
 */

export type ServiceDetail = {
  /** The same thing as `what`, but for a technical reader. */
  technical: string;
  /** What Consult America actually sells in this area. */
  offer: readonly (readonly [string, string])[];
  /** [the problem as a client would state it, how the work addresses it] */
  problems: readonly (readonly [string, string])[];
  /** Example project shapes. Not claims of delivered work. */
  useCases: readonly (readonly [string, string])[];
  /** [group, tools] */
  stack: readonly (readonly [string, readonly string[]])[];
  learn: {
    roadmap: readonly (readonly [string, readonly string[]])[];
    docs: readonly (readonly [string, string])[];
    channels: readonly (readonly [string, string])[];
    certs: readonly string[];
    projects: readonly string[];
  };
  faqs: readonly (readonly [string, string])[];
};

export const SERVICE_DETAIL: Record<string, ServiceDetail> = {
  // ================================================================ Engineering
  "cloud-native-development": {
    technical:
      "Concretely: stateless services behind a load balancer, state pushed into managed backing services, configuration injected at runtime rather than baked into images, and horizontal scale as the default answer to load. Deployments are immutable and rolled forward. The twelve-factor principles still describe most of this well, and the parts they predate — container scheduling, service meshes, managed event buses — follow the same logic of keeping the application free of machine-specific assumptions.",
    offer: [
      ["Greenfield service build", "We design and build new services end to end: domain model, API, storage, deployment pipeline and the infrastructure definition that stands it all up."],
      ["Cloud-readiness assessment", "An honest review of an existing application against what cloud platforms reward, with a costed list of what would have to change."],
      ["Reference architecture", "A documented, working pattern your teams copy for the next service, rather than each team inventing its own."],
      ["Team enablement", "Pairing and review alongside your engineers, so the patterns stay after we leave."],
    ],
    problems: [
      ["Releases are an event, not a routine", "If shipping requires a change window and a rollback plan written by hand, the deployment path is the bottleneck. We build the pipeline first and make rollback automatic."],
      ["Scaling means buying a bigger machine", "Vertical scale runs out and costs disproportionately. Stateless services with managed backing stores scale horizontally and can scale back down."],
      ["Environments drift apart", "\"Works in staging\" is a symptom of hand-built infrastructure. Everything defined as code means environments are reproducible."],
      ["Nobody can explain the architecture", "Decisions live in people's heads and leave when they do. We write architecture decision records next to the code."],
    ],
    useCases: [
      ["Customer-facing portal", "A self-service portal with authentication, document upload and a case workflow, backed by managed Postgres and object storage."],
      ["Internal operations service", "Replacing a spreadsheet-and-email process with a service that holds state, enforces approvals and exposes an API to the rest of the estate."],
      ["Event-driven processing", "Ingesting a high-volume feed and processing it asynchronously, with retries and a dead-letter queue, so a spike does not take the system down."],
      ["Multi-tenant platform", "A shared service with per-tenant isolation at the data layer and usage metering."],
    ],
    stack: [
      ["Runtime", ["Kubernetes", "AWS ECS", "Google Cloud Run", "Azure Container Apps", "Docker"]],
      ["Languages", ["TypeScript / Node.js", "Python", "Java", "Go"]],
      ["Data", ["PostgreSQL", "Redis", "S3 / Object Storage", "DynamoDB", "Oracle Autonomous DB"]],
      ["Messaging", ["Kafka", "SNS / SQS", "RabbitMQ", "Google Pub/Sub"]],
      ["Infrastructure", ["Terraform", "AWS CDK", "Pulumi", "Helm"]],
      ["Delivery", ["GitHub Actions", "GitLab CI", "Argo CD", "Datadog", "OpenTelemetry"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Learn one language well before learning three", "Containers: build an image, run it, understand layers", "HTTP, REST and what a status code actually means", "Git branching and pull-request workflow", "Deploy one small app to a managed platform end to end"]],
        ["Intermediate", ["Kubernetes objects: pod, deployment, service, ingress", "Infrastructure as code with Terraform", "CI/CD pipelines including automated tests", "Relational modelling, indexing and query plans", "Structured logging, metrics and tracing"]],
        ["Advanced", ["Distributed systems failure modes and idempotency", "Event-driven architecture and exactly-once myths", "Multi-region resilience and data residency", "Cost modelling and capacity planning", "Progressive delivery and automated rollback"]],
      ],
      docs: [
        ["The Twelve-Factor App", "https://12factor.net/"],
        ["Kubernetes documentation", "https://kubernetes.io/docs/home/"],
        ["Terraform documentation", "https://developer.hashicorp.com/terraform/docs"],
        ["AWS Well-Architected Framework", "https://aws.amazon.com/architecture/well-architected/"],
        ["Google Cloud Architecture Centre", "https://cloud.google.com/architecture"],
        ["OpenTelemetry documentation", "https://opentelemetry.io/docs/"],
      ],
      channels: [
        ["CNCF (Cloud Native Computing Foundation)", "https://www.youtube.com/@cncf"],
        ["Google Cloud Tech", "https://www.youtube.com/@googlecloudtech"],
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
        ["HashiCorp", "https://www.youtube.com/@HashiCorp"],
      ],
      certs: [
        "Certified Kubernetes Application Developer (CKAD)",
        "Certified Kubernetes Administrator (CKA)",
        "HashiCorp Certified: Terraform Associate",
        "AWS Certified Solutions Architect – Associate",
        "Google Associate Cloud Engineer",
      ],
      projects: [
        "Containerise an existing app and deploy it with a one-command pipeline",
        "Add health checks, structured logs and a metrics endpoint, then alert on them",
        "Define the whole environment in Terraform and rebuild it from scratch",
        "Introduce a queue between two services and handle retries and poison messages",
        "Implement blue/green deployment with automatic rollback on error rate",
      ],
    },
    faqs: [
      ["Is cloud-native the same as being on the cloud?", "No. Running a virtual machine in AWS is being on the cloud. Cloud-native means the application is designed so the platform's scaling, resilience and managed services actually apply to it. A lifted-and-shifted monolith gets the hosting bill without most of the benefit."],
      ["Do we have to use Kubernetes?", "Often not. Kubernetes is a reasonable answer at a certain scale and team size, and an expensive one below it. Managed container runtimes like Cloud Run or ECS Fargate carry far less operational weight. We recommend based on your team, not on fashion."],
      ["How long before we see something working?", "We aim for a deployable vertical slice in the first few weeks, including the pipeline. Seeing real software early is what lets you change direction while it is still cheap."],
      ["What happens to our existing applications?", "They are assessed separately. Some are worth modernising, some are worth leaving alone. See application modernization for how we handle incremental migration."],
      ["Can your engineers work inside our team?", "Yes. That is a separate engagement shape, covered under specialized talent, and it uses your process and tooling rather than running in parallel."],
    ],
  },

  "platform-engineering": {
    technical:
      "An internal developer platform is an abstraction over your cloud accounts, CI system and observability stack, exposed through templates, a CLI or a portal. The hard part is choosing the right level of abstraction: too thin and it adds a layer without removing work, too thick and teams hit a wall the moment they need something the platform did not anticipate. We prefer a paved road with visible exits, so a team can drop to the underlying primitives without abandoning the platform entirely.",
    offer: [
      ["Platform assessment", "Where your teams actually lose time between committing code and serving traffic, measured rather than assumed."],
      ["Golden path implementation", "Service templates, pipelines and environment provisioning your teams can adopt on day one."],
      ["Observability baseline", "A consistent metrics, logging and tracing setup so every service is debuggable the same way."],
      ["Platform-as-a-product setup", "Ownership, versioning, support channel and roadmap, so the platform keeps being maintained."],
    ],
    problems: [
      ["Every team solves infrastructure again", "Five teams, five pipelines, five logging conventions. Shared golden paths remove the duplicated effort and the inconsistency."],
      ["Onboarding takes weeks", "A new engineer should ship something small in days. If they cannot, the setup path is the problem."],
      ["Security review is a bottleneck", "Reviewing every change by hand does not scale. Policy as code enforces the baseline automatically and reserves review for genuinely novel cases."],
      ["The platform team is a ticket queue", "If teams must raise a ticket to get an environment, the platform is a gate. Self-service is the difference."],
    ],
    useCases: [
      ["Internal developer portal", "A catalogue of services with ownership, dependencies, documentation and one-click scaffolding for a new service."],
      ["Ephemeral preview environments", "A full environment per pull request, created automatically and destroyed on merge."],
      ["Standardised CI/CD templates", "Shared pipeline definitions with testing, scanning and deployment already wired in."],
      ["Centralised observability rollout", "One tracing and metrics standard applied across existing services incrementally."],
    ],
    stack: [
      ["Orchestration", ["Kubernetes", "Helm", "Kustomize", "Crossplane"]],
      ["Delivery", ["Argo CD", "Flux", "GitHub Actions", "GitLab CI", "Jenkins"]],
      ["Portal & catalogue", ["Backstage", "Port", "Service catalogues"]],
      ["Policy & secrets", ["Open Policy Agent", "HashiCorp Vault", "AWS Secrets Manager", "Kyverno"]],
      ["Observability", ["Prometheus", "Grafana", "OpenTelemetry", "Datadog", "Loki"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Understand what a CI pipeline does, step by step", "Containers and image layering", "Basic Kubernetes objects", "YAML and templating without fear", "Read a Terraform plan and predict what it will do"]],
        ["Intermediate", ["GitOps: declarative state and reconciliation", "Helm charts and environment overlays", "Secret management patterns", "Prometheus metric types and useful alerts", "Designing a service template others will adopt"]],
        ["Advanced", ["Platform API design and the right abstraction level", "Multi-tenancy and isolation in shared clusters", "Policy as code and admission control", "Measuring developer experience and lead time", "Running an internal product: versioning, deprecation, support"]],
      ],
      docs: [
        ["Backstage documentation", "https://backstage.io/docs/overview/what-is-backstage"],
        ["Argo CD documentation", "https://argo-cd.readthedocs.io/en/stable/"],
        ["Open Policy Agent documentation", "https://www.openpolicyagent.org/docs/latest/"],
        ["Prometheus documentation", "https://prometheus.io/docs/introduction/overview/"],
        ["CNCF Cloud Native Glossary", "https://glossary.cncf.io/"],
      ],
      channels: [
        ["CNCF (Cloud Native Computing Foundation)", "https://www.youtube.com/@cncf"],
        ["HashiCorp", "https://www.youtube.com/@HashiCorp"],
        ["Grafana", "https://www.youtube.com/@Grafana"],
      ],
      certs: [
        "Certified Kubernetes Administrator (CKA)",
        "Certified Argo Project Associate (CAPA)",
        "HashiCorp Certified: Terraform Associate",
        "Prometheus Certified Associate (PCA)",
      ],
      projects: [
        "Build a service template that scaffolds logging, health checks and CI",
        "Set up GitOps so a merge reconciles the cluster without a deploy script",
        "Create an ephemeral environment per pull request",
        "Write an admission policy that rejects containers running as root",
        "Instrument three services with the same tracing standard and compare traces",
      ],
    },
    faqs: [
      ["How many teams justify a platform?", "Below roughly three or four delivery teams the overhead usually outweighs the saving, and shared conventions plus a good template are enough. The case strengthens as duplication grows."],
      ["Should the platform be mandatory?", "We advise against it. If teams only use it because they must, nobody is measuring whether it is actually good. Make it the fastest route and adoption tells you the truth."],
      ["Do we need Backstage?", "Not necessarily. A portal helps once there are enough services that nobody can hold the map in their head. Before that, a well-maintained README and good templates do more."],
      ["Who owns the platform afterwards?", "That is decided during the engagement, not after. A platform without a named owner degrades quickly, so ownership and a support model are part of the delivery."],
    ],
  },

  "api-systems-integration": {
    technical:
      "Integration work is mostly about failure semantics. Any interface between two systems will at some point deliver twice, deliver late, or deliver something that does not match the schema. The design questions are therefore: is the operation idempotent, what is the retry policy, where do poison messages go, and how is a replay performed without double-posting. Synchronous REST is right for request/response with a user waiting; events are right when several consumers care and the producer should not need to know about them.",
    offer: [
      ["Integration architecture", "A target design covering which systems are the source of truth, what moves synchronously, what moves as events, and where the boundaries sit."],
      ["API design and build", "Versioned REST or GraphQL interfaces with documented contracts, authentication and rate limiting."],
      ["ERP and SaaS connectors", "Connecting Oracle, SAP, Salesforce, Dynamics and line-of-business systems, including the ones with awkward or legacy interfaces."],
      ["Integration remediation", "Taking over a brittle set of existing interfaces and making them observable, retryable and documented."],
    ],
    problems: [
      ["Data disagrees between systems", "Usually no agreed source of truth and silent sync failures. We establish ownership per entity and make every transfer observable."],
      ["Integrations fail quietly", "A nightly job stops and nobody notices for a week. Per-interface monitoring and alerting makes failure loud."],
      ["Point-to-point sprawl", "Every new system means several new bespoke connections. A clear integration pattern stops the connection count growing quadratically."],
      ["Nobody knows what talks to what", "Undocumented interfaces make every change risky. We produce a current-state map including the informal paths."],
    ],
    useCases: [
      ["ERP to e-commerce", "Orders, inventory and pricing flowing between a storefront and the ERP, with reconciliation and replay."],
      ["CRM and finance alignment", "Customer, contract and invoice data kept consistent between CRM and the finance system."],
      ["Partner and EDI onboarding", "Standardised onboarding for trading partners sending EDI or flat files on their own schedules."],
      ["Legacy system facade", "A modern API in front of an older system so new applications need not learn its interface."],
    ],
    stack: [
      ["API", ["OpenAPI / REST", "GraphQL", "gRPC", "Webhooks"]],
      ["Gateways", ["Kong", "AWS API Gateway", "Apigee", "Azure API Management", "Oracle API Gateway"]],
      ["Eventing", ["Apache Kafka", "AWS SNS / SQS", "Azure Service Bus", "RabbitMQ"]],
      ["Integration platforms", ["MuleSoft", "Oracle Integration Cloud", "Boomi", "Workato"]],
      ["Formats & transport", ["JSON", "XML", "EDI X12 / EDIFACT", "SFTP", "CSV / fixed width"]],
      ["Security", ["OAuth 2.0", "OIDC", "mTLS", "JSON Web Tokens"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["HTTP verbs, status codes and headers", "JSON and schema validation", "Write and consume a simple REST API", "Authentication basics: API keys versus tokens", "Read an OpenAPI specification"]],
        ["Intermediate", ["OpenAPI-first design and contract testing", "OAuth 2.0 flows and when each applies", "Idempotency keys and safe retries", "Message queues and consumer groups", "Pagination, filtering and versioning strategies"]],
        ["Advanced", ["Event-driven architecture and schema evolution", "Exactly-once semantics and why it is usually at-least-once plus idempotency", "Saga patterns for distributed transactions", "Backpressure and rate limiting under load", "Observability across service boundaries"]],
      ],
      docs: [
        ["OpenAPI Specification", "https://spec.openapis.org/oas/latest.html"],
        ["Apache Kafka documentation", "https://kafka.apache.org/documentation/"],
        ["OAuth 2.0", "https://oauth.net/2/"],
        ["GraphQL documentation", "https://graphql.org/learn/"],
        ["Oracle Integration Cloud documentation", "https://docs.oracle.com/en/cloud/paas/application-integration/index.html"],
      ],
      channels: [
        ["Confluent (Apache Kafka)", "https://www.youtube.com/@Confluent"],
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
      ],
      certs: [
        "Confluent Certified Developer for Apache Kafka",
        "MuleSoft Certified Developer – Level 1",
        "Oracle Cloud Infrastructure Developer Professional",
        "AWS Certified Developer – Associate",
      ],
      projects: [
        "Design an API contract in OpenAPI before writing any implementation",
        "Add idempotency keys so a duplicate request cannot double-post",
        "Put a queue between two services and handle poison messages",
        "Build a replay tool that reprocesses a date range safely",
        "Add per-interface dashboards showing volume, latency and failures",
      ],
    },
    faqs: [
      ["Do we need an integration platform?", "Not always. A handful of interfaces are often better as plain services you own. Platforms earn their licence cost at higher interface counts or where business users need to build flows themselves."],
      ["REST or events?", "Both, for different jobs. Request/response with a user waiting is REST. One thing happening that several systems care about is an event. Forcing everything into one style is where integration designs go wrong."],
      ["Can you work with our existing middleware?", "Yes. Replacing working middleware is rarely the first recommendation. More often the gap is monitoring, error handling and documentation around what already exists."],
      ["How do you handle a system with no API?", "Options in order of preference: a supported export, a database view, file transfer, then UI automation as a last resort. We will say when the honest answer is that the integration will be fragile."],
    ],
  },

  "application-modernization": {
    technical:
      "The default pattern is the strangler fig: place a facade in front of the legacy application, route one capability at a time to new implementations, and shrink the old system until retiring it is uneventful. The constraint is usually data, not code. Two systems writing the same tables cannot be separated until ownership is split, so the sequencing question is which data each extracted capability owns and how consistency is maintained during the overlap.",
    offer: [
      ["Modernization assessment", "Each application scored on business value, change frequency and technical risk, with a recommendation to modernise, replace, re-platform or leave alone."],
      ["Incremental migration delivery", "Capability-by-capability extraction with the legacy system live throughout."],
      ["Data decoupling", "Splitting shared database ownership, usually the hardest and most-skipped part."],
      ["Decommissioning", "Retiring legacy components with evidence that traffic and data have genuinely moved."],
    ],
    problems: [
      ["Changes take months", "Tight coupling means every change risks something unrelated. Extracting bounded capabilities shrinks the blast radius."],
      ["The platform is out of support", "Unsupported runtimes and databases are a security and audit problem. Re-platforming can address that without a full rewrite."],
      ["Only two people understand it", "Key-person risk. Extraction plus documentation spreads that knowledge as a side effect."],
      ["A rewrite was attempted and stalled", "Big-bang rewrites fail because the old system keeps moving. Incremental extraction delivers value from the first slice."],
    ],
    useCases: [
      ["Monolith to services", "Extracting high-change capabilities from a large application so they can be deployed independently."],
      ["Mainframe facade", "Exposing mainframe functions through APIs so new channels can be built without touching COBOL."],
      ["On-premises to cloud re-platform", "Moving a workload to managed infrastructure with minimal code change where a rewrite is not justified."],
      ["Database migration", "Moving off an end-of-life or expensively-licensed database with a tested cutover."],
    ],
    stack: [
      ["Patterns", ["Strangler fig", "Anti-corruption layer", "Branch by abstraction", "Change data capture"]],
      ["Runtime targets", ["Kubernetes", "AWS ECS", "Azure App Service", "Oracle Cloud Infrastructure"]],
      ["Data", ["PostgreSQL", "Oracle Database", "SQL Server", "Debezium", "AWS DMS"]],
      ["Legacy interfaces", ["SOAP / WSDL", "IBM MQ", "CICS", "AS/400", "Flat file batch"]],
      ["Verification", ["Contract tests", "Traffic shadowing", "Reconciliation jobs"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Read and safely change unfamiliar code", "Characterisation tests around untested behaviour", "Basic refactoring moves and when they are safe", "Version control discipline on long-lived work"]],
        ["Intermediate", ["Strangler fig and anti-corruption layer patterns", "Domain-driven design and bounded contexts", "Change data capture and dual-write pitfalls", "Feature flags and branch by abstraction", "Traffic shadowing to compare old and new"]],
        ["Advanced", ["Splitting a shared database without downtime", "Distributed consistency during a migration window", "Data reconciliation and provable cutover", "Sequencing a multi-year programme so value lands early"]],
      ],
      docs: [
        ["Strangler Fig Application — Martin Fowler", "https://martinfowler.com/bliki/StranglerFigApplication.html"],
        ["Branch by Abstraction — Martin Fowler", "https://martinfowler.com/bliki/BranchByAbstraction.html"],
        ["AWS Prescriptive Guidance", "https://aws.amazon.com/prescriptive-guidance/"],
        ["Azure Cloud Adoption Framework", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/"],
        ["Debezium documentation", "https://debezium.io/documentation/"],
      ],
      channels: [
        ["Thoughtworks", "https://www.youtube.com/@Thoughtworks"],
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
        ["Microsoft Azure", "https://www.youtube.com/@MicrosoftAzure"],
      ],
      certs: [
        "AWS Certified Solutions Architect – Professional",
        "Microsoft Certified: Azure Solutions Architect Expert",
        "Oracle Cloud Infrastructure Architect Professional",
      ],
      projects: [
        "Put characterisation tests around a module before changing it",
        "Route one endpoint through a facade to a new implementation",
        "Use change data capture to keep two stores in step during a migration",
        "Shadow production traffic to a new service and diff the responses",
        "Write a reconciliation job proving both systems agree before cutover",
      ],
    },
    faqs: [
      ["Is a rewrite ever the right answer?", "Occasionally — small systems, or where the domain has changed so much the existing model is wrong. For anything large and actively used, incremental extraction has a far better record."],
      ["How long does this take?", "It depends on coupling and how much the legacy system still changes. The point of the incremental approach is that you get working slices throughout rather than waiting for one date."],
      ["Can we modernise and add features at the same time?", "Yes, and usually you must, because the business will not pause. The sequencing just has to account for it rather than pretending there is a freeze."],
      ["What if the legacy system has no tests?", "That is the normal starting position. We add characterisation tests around current behaviour first, so there is something to verify against before anything moves."],
    ],
  },

  "quality-test-automation": {
    technical:
      "The economics are simple: a test's value is its probability of catching a real defect, divided by its runtime and maintenance cost. That is why the pyramid is shaped the way it is — unit tests are cheap and fast, end-to-end tests are expensive and slow, so you want many of the first and few of the second. Inverted pyramids produce suites that take an hour and fail for environmental reasons, which trains teams to re-run rather than investigate, which is the point at which the suite stops providing any signal at all.",
    offer: [
      ["Test strategy", "An agreed approach for what is tested at which level, so coverage is deliberate rather than accidental."],
      ["Suite remediation", "Taking an existing slow or flaky suite and making it trustworthy."],
      ["Automation build", "Implementing unit, integration, contract and end-to-end layers in your pipeline."],
      ["Performance testing", "Baseline load and latency measurement with regression gates."],
    ],
    problems: [
      ["The suite is red and nobody looks", "Once red is normal, the suite has no value. Fixing or deleting flaky tests comes before adding anything."],
      ["Testing is a phase at the end", "Defects found late cost more. Automated tests in the pipeline move discovery to the point of change."],
      ["Releases need manual regression", "A multi-day manual pass caps how often you can release. Automating the regression path is what unlocks cadence."],
      ["Coverage is high but bugs still ship", "Coverage measures lines executed, not behaviour verified. We test behaviour and the paths that actually matter."],
    ],
    useCases: [
      ["Regression suite for a release gate", "Automating the manual regression pack so releases do not depend on a multi-day test window."],
      ["Contract tests between services", "Consumer-driven contracts so a provider change cannot silently break a consumer."],
      ["End-to-end journeys for a portal", "A small set of critical user paths run on every deployment."],
      ["Performance baseline", "Establishing throughput and latency baselines and failing the build on regression."],
    ],
    stack: [
      ["Unit & integration", ["Jest", "Vitest", "pytest", "JUnit", "Testcontainers"]],
      ["End-to-end", ["Playwright", "Cypress", "Selenium"]],
      ["Contract", ["Pact", "Spring Cloud Contract"]],
      ["Performance", ["k6", "JMeter", "Gatling", "Locust"]],
      ["Pipeline", ["GitHub Actions", "GitLab CI", "Jenkins", "Azure DevOps"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Write a unit test and understand arrange-act-assert", "Test doubles: stub, mock, fake, and when each fits", "Run tests automatically on every commit", "Read a coverage report without treating it as a target"]],
        ["Intermediate", ["Integration tests against real dependencies with Testcontainers", "Page object patterns and resilient selectors", "Consumer-driven contract testing", "Deterministic test data and isolation", "Diagnosing and eliminating flakiness"]],
        ["Advanced", ["Performance testing and realistic load modelling", "Testing in production: canaries, synthetics, feature flags", "Mutation testing to assess suite quality", "Risk-based test strategy at portfolio level"]],
      ],
      docs: [
        ["Playwright documentation", "https://playwright.dev/docs/intro"],
        ["Testcontainers documentation", "https://testcontainers.com/getting-started/"],
        ["Pact documentation", "https://docs.pact.io/"],
        ["k6 documentation", "https://grafana.com/docs/k6/latest/"],
        ["Test Pyramid — Martin Fowler", "https://martinfowler.com/articles/practical-test-pyramid.html"],
      ],
      channels: [
        ["Playwright", "https://www.youtube.com/@Playwrightdev"],
        ["Grafana", "https://www.youtube.com/@Grafana"],
        ["Thoughtworks", "https://www.youtube.com/@Thoughtworks"],
      ],
      certs: [
        "ISTQB Certified Tester Foundation Level",
        "ISTQB Advanced Level Test Automation Engineer",
        "Certified Kubernetes Application Developer (CKAD) for pipeline work",
      ],
      projects: [
        "Take a flaky test and make it deterministic, then write up why it flaked",
        "Add contract tests between two services and break one deliberately",
        "Automate the top five manual regression cases in Playwright",
        "Add a k6 load test to the pipeline with a latency threshold",
        "Run mutation testing and see how many mutants the suite actually catches",
      ],
    },
    faqs: [
      ["What coverage percentage should we target?", "None in particular. A number as a target gets gamed with tests that execute code without asserting anything useful. Cover the paths where a defect would actually hurt, and track escaped defects instead."],
      ["Should we automate everything?", "No. Exploratory testing finds things automation cannot, and some tests cost more to maintain than the bugs they catch. Automate the repetitive regression path and keep human attention for the rest."],
      ["How long to fix a flaky suite?", "It depends on how much of the flakiness is shared root causes — usually test data, timing assumptions and shared state. Often a handful of fixes resolves most of it."],
      ["Can you work with our existing framework?", "Usually yes. Rewriting a working suite in a new framework is rarely worth it. We would only recommend it if the existing one is the actual cause of the flakiness."],
    ],
  },

  // ================================================================= AI & Data
  "genai-assistants-copilots": {
    technical:
      "The usual architecture is retrieval-augmented generation: documents are chunked, embedded and stored in a vector index; a query is embedded, nearest neighbours are retrieved, and the model answers over that context with citations. Most quality problems are retrieval problems rather than model problems — chunk boundaries that split a table, embeddings that do not capture domain vocabulary, or no reranking step. Tool calling extends this from answering to acting, at which point authorisation stops being advisory and has to be enforced server-side on every call.",
    offer: [
      ["Assistant design and build", "An assistant grounded in your documents and systems, deployed inside your environment with your authentication."],
      ["Evaluation harness", "A scored question set and automated scoring, so accuracy is a number that moves rather than an opinion."],
      ["Retrieval engineering", "Chunking, embedding, hybrid search and reranking tuned against your actual corpus."],
      ["Governance and guardrails", "Topic boundaries, PII redaction, refusal behaviour and full prompt/response audit logging."],
    ],
    problems: [
      ["The pilot demoed well and never shipped", "Demos skip evaluation, authorisation and audit. We build those first, so there is a defensible path to production."],
      ["It answers confidently and wrongly", "Without grounding and a refusal path, a model will fill gaps. Citations and confidence thresholds make answers checkable."],
      ["Staff cannot find what they need", "Policy and procedure spread across wikis, PDFs and shared drives. Retrieval over all of it beats reorganising the intranet again."],
      ["Legal will not approve it", "Usually because nobody can say what data leaves the boundary or what is logged. Those controls are part of the build, not an afterthought."],
    ],
    useCases: [
      ["Internal policy assistant", "Answering HR, finance and compliance questions from your own policy documents, with citations."],
      ["Customer support copilot", "Drafting agent responses from product documentation and past resolved tickets, with the agent sending."],
      ["Bid and proposal support", "Retrieving reusable content and prior approved answers when responding to tenders."],
      ["Engineering knowledge assistant", "Answering questions over runbooks, architecture decisions and incident history."],
    ],
    stack: [
      ["Models", ["Anthropic Claude", "OpenAI GPT", "Azure OpenAI Service", "Oracle Generative AI", "AWS Bedrock"]],
      ["Retrieval", ["pgvector", "Pinecone", "Elasticsearch", "OpenSearch", "Azure AI Search"]],
      ["Orchestration", ["LangChain", "LlamaIndex", "Semantic Kernel", "Direct SDK"]],
      ["Evaluation", ["Ragas", "promptfoo", "Custom scored question sets"]],
      ["Operations", ["LangSmith", "OpenTelemetry", "Prompt and response audit logging"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["How a language model generates text, token by token", "Prompting: instructions, examples, output format", "Embeddings and what vector similarity means", "Build a small retrieval question-answer app", "Understand context windows and their limits"]],
        ["Intermediate", ["Chunking strategies and why boundaries matter", "Hybrid search: keyword plus vector, and reranking", "Tool and function calling with real side effects", "Building an evaluation set and scoring runs", "Cost and latency: caching, batching, model routing"]],
        ["Advanced", ["Retrieval quality diagnosis: is it retrieval or generation", "Agentic loops and bounding what they may do", "Fine-tuning versus retrieval, and when each is justified", "Red-teaming, prompt injection and data exfiltration", "Production monitoring and regression on model updates"]],
      ],
      docs: [
        ["Anthropic documentation", "https://docs.anthropic.com/"],
        ["OpenAI platform documentation", "https://platform.openai.com/docs/overview"],
        ["Azure OpenAI Service documentation", "https://learn.microsoft.com/en-us/azure/ai-services/openai/"],
        ["Amazon Bedrock documentation", "https://docs.aws.amazon.com/bedrock/"],
        ["LangChain documentation", "https://python.langchain.com/docs/introduction/"],
        ["OWASP Top 10 for LLM Applications", "https://owasp.org/www-project-top-10-for-large-language-model-applications/"],
      ],
      channels: [
        ["Anthropic", "https://www.youtube.com/@anthropic-ai"],
        ["OpenAI", "https://www.youtube.com/@OpenAI"],
        ["Microsoft Developer", "https://www.youtube.com/@MicrosoftDeveloper"],
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
      ],
      certs: [
        "Microsoft Certified: Azure AI Engineer Associate",
        "AWS Certified Machine Learning Engineer – Associate",
        "Google Cloud Professional Machine Learning Engineer",
        "Oracle Cloud Infrastructure Generative AI Professional",
      ],
      projects: [
        "Build retrieval question-answering over a folder of your own PDFs",
        "Write 50 question-and-answer pairs and score your assistant against them",
        "Add citations so every answer links to its source passage",
        "Add a refusal path when retrieval confidence is below a threshold",
        "Try to prompt-inject your own assistant, then close the hole",
      ],
    },
    faqs: [
      ["Will our data be used to train a model?", "Not under the enterprise terms we deploy on. Which provider, which region and what is retained are decided explicitly during the build and written down."],
      ["Can it run entirely inside our environment?", "Retrieval and orchestration, yes. The model itself can be a hosted endpoint in your cloud tenancy or, with open-weight models, self-hosted. There is a real cost and quality trade-off and we will set it out."],
      ["How accurate will it be?", "Nobody can answer that before seeing your corpus. That is why the first deliverable is an evaluation set: it turns the question into a measurement you can track."],
      ["Do we need to reorganise our documents first?", "Usually not. Retrieval works over messy corpora. Genuinely contradictory documents are a real problem, but that is a content issue the assistant will surface rather than cause."],
      ["Is this a chatbot?", "A chat interface is one option. Often the better placement is inside an existing workflow — drafting a response, pre-filling a form, summarising a case — where it saves time without anyone having to visit a separate tool."],
    ],
  },

  "forecasting-machine-learning": {
    technical:
      "For most enterprise forecasting, gradient-boosted trees over well-constructed features beat deep learning, and classical methods such as ETS or ARIMA remain a serious baseline worth measuring against. The engineering around the model matters more than the algorithm: a feature pipeline that computes the same transformations at training and serving time, versioned datasets so a result can be reproduced, and monitoring on input distributions as well as output accuracy.",
    offer: [
      ["Feasibility assessment", "Whether the data you hold can support the prediction you want, answered before a project is committed."],
      ["Model development", "Baseline, candidate models, and honest evaluation on held-out data with the business metric, not just RMSE."],
      ["Production deployment", "Serving infrastructure, feature pipelines and the integration into the workflow that acts on the prediction."],
      ["MLOps foundation", "Versioning, reproducible training, drift monitoring and retraining automation."],
    ],
    problems: [
      ["Forecasts are a spreadsheet and a gut feel", "Reproducible, measurable models replace that, with the current approach kept as the baseline to beat."],
      ["A model was built but never deployed", "Usually missing the serving path and the workflow integration. We treat deployment as part of the work, not a handover."],
      ["Accuracy decayed and nobody noticed", "Drift monitoring and retraining triggers are set up at build time."],
      ["We cannot explain a prediction", "For regulated decisions, feature attribution and documented limits are part of the deliverable."],
    ],
    useCases: [
      ["SKU-level demand forecast", "Forecasts by product and location feeding replenishment, with promotion and seasonality separated."],
      ["Churn scoring", "Scoring that triggers a retention workflow rather than producing a monthly report."],
      ["Predictive maintenance", "Equipment telemetry models flagging likely failure ahead of a maintenance window."],
      ["Transaction anomaly detection", "Flagging outliers for review in finance or operations streams."],
    ],
    stack: [
      ["Modelling", ["scikit-learn", "XGBoost", "LightGBM", "Prophet", "statsmodels", "PyTorch"]],
      ["Pipelines", ["Airflow", "Dagster", "dbt", "Spark"]],
      ["Serving & tracking", ["MLflow", "SageMaker", "Vertex AI", "Azure ML", "Oracle Data Science"]],
      ["Data", ["Snowflake", "BigQuery", "Databricks", "PostgreSQL"]],
      ["Monitoring", ["Evidently", "Prometheus", "Grafana"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Python with pandas and numpy", "Descriptive statistics and distributions", "Train/validation/test splits and why leakage ruins results", "Fit a regression and a tree model, compare them", "Plot your data before modelling it"]],
        ["Intermediate", ["Feature engineering and encoding categorical data", "Cross-validation, including time-series splits", "Class imbalance and the right metric for the problem", "Hyperparameter search", "Packaging a model behind an API"]],
        ["Advanced", ["Forecasting hierarchies and reconciliation", "Causal inference versus correlation in business decisions", "Feature stores and training-serving consistency", "Drift detection and automated retraining", "Explainability with SHAP and its limits"]],
      ],
      docs: [
        ["scikit-learn user guide", "https://scikit-learn.org/stable/user_guide.html"],
        ["XGBoost documentation", "https://xgboost.readthedocs.io/en/stable/"],
        ["MLflow documentation", "https://mlflow.org/docs/latest/index.html"],
        ["Forecasting: Principles and Practice (free textbook)", "https://otexts.com/fpp3/"],
        ["Google Cloud Vertex AI documentation", "https://cloud.google.com/vertex-ai/docs"],
      ],
      channels: [
        ["Google Cloud Tech", "https://www.youtube.com/@googlecloudtech"],
        ["Databricks", "https://www.youtube.com/@Databricks"],
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
      ],
      certs: [
        "Google Cloud Professional Machine Learning Engineer",
        "AWS Certified Machine Learning Engineer – Associate",
        "Microsoft Certified: Azure Data Scientist Associate",
        "Databricks Certified Machine Learning Associate",
      ],
      projects: [
        "Forecast a public time series and beat a naive last-value baseline",
        "Build a feature pipeline that runs identically in training and serving",
        "Deploy a model behind an API and log every prediction",
        "Simulate drift by shifting the input distribution and see if monitoring catches it",
        "Explain five individual predictions with SHAP and sanity-check them",
      ],
    },
    faqs: [
      ["How much data do we need?", "It depends on the signal strength and how many categories you are predicting across. For demand forecasting, two to three years of history is a reasonable starting point. The feasibility assessment exists to answer this for your case specifically."],
      ["Do we need a data scientist on staff?", "To build, not necessarily. To keep it working, someone has to own it. We can run it as a managed service or train an owner, but an unowned model degrades."],
      ["Will it be better than our planners?", "Sometimes, often not on its own. The realistic gain is removing routine forecasting work so planners spend their judgement on exceptions. We measure against the current process rather than against zero."],
      ["What about generative AI for this?", "Different tool. Language models are weak at numeric forecasting and expensive for it. They are useful for explaining a forecast or querying it in words, which is a separate piece of work."],
    ],
  },

  "data-platform-warehousing": {
    technical:
      "Layered modelling is what makes a warehouse maintainable: a raw landing layer kept immutable and append-only, a cleaned and conformed layer, and business-facing marts. Keeping raw immutable means a definition change is a rebuild rather than a re-ingest. Dimensional modelling with surrogate keys and slowly-changing dimensions is still the right default for analytics, because it answers 'what did this look like in March' without heroics.",
    offer: [
      ["Warehouse implementation", "Platform selection, landing zone, modelling layers and the first production-grade subject area."],
      ["Ingestion engineering", "Monitored, idempotent loads from ERP, CRM, operational databases and third-party feeds."],
      ["Metric definition", "Facilitated agreement on what each measure actually means, then implemented once in the semantic layer."],
      ["Data quality framework", "Automated freshness, volume and integrity tests with alerting and ownership."],
    ],
    problems: [
      ["Three systems, three different revenue figures", "No agreed definition and no single implementation. We fix the definition first, then implement it once."],
      ["Reports take days to produce", "Manual extraction and spreadsheet assembly. Automated pipelines move that to a refresh schedule."],
      ["Nobody trusts the dashboard", "Trust comes from lineage and tests. If you can trace a number to source and see that tests pass, confidence follows."],
      ["A source change silently broke a report", "Automated tests on schema, volume and freshness catch it before it reaches a consumer."],
    ],
    useCases: [
      ["Finance reporting mart", "Actuals, budget and forecast in one model, reconciled to the general ledger."],
      ["Operations dashboard foundation", "Near-real-time operational metrics from transactional systems."],
      ["Customer 360", "Unifying customer records across CRM, billing and support with resolved identity."],
      ["Regulatory reporting dataset", "A dataset built for auditability, with lineage and point-in-time reconstruction."],
    ],
    stack: [
      ["Warehouse", ["Snowflake", "Google BigQuery", "Amazon Redshift", "Databricks", "Oracle Autonomous Data Warehouse"]],
      ["Ingestion", ["Fivetran", "Airbyte", "AWS DMS", "Debezium", "Custom extractors"]],
      ["Transformation", ["dbt", "SQL", "Spark", "Dataform"]],
      ["Orchestration", ["Airflow", "Dagster", "Prefect"]],
      ["BI", ["Power BI", "Tableau", "Looker", "Oracle Analytics Cloud"]],
      ["Quality", ["dbt tests", "Great Expectations", "Monte Carlo"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["SQL properly: joins, aggregation, window functions", "Relational modelling and normal forms", "What a warehouse is for, versus an operational database", "Load a CSV, model it, chart it", "Source control for SQL"]],
        ["Intermediate", ["Dimensional modelling: facts, dimensions, grain", "Slowly changing dimensions and why type 2 matters", "ELT with dbt: models, tests, documentation", "Incremental loads and late-arriving data", "Query performance: partitioning, clustering, cost"]],
        ["Advanced", ["Semantic layers and governed metric definitions", "Data contracts between producers and consumers", "Lakehouse table formats: Iceberg, Delta", "Point-in-time correctness and bitemporal modelling", "Cost governance on consumption pricing"]],
      ],
      docs: [
        ["dbt documentation", "https://docs.getdbt.com/"],
        ["Snowflake documentation", "https://docs.snowflake.com/"],
        ["Google BigQuery documentation", "https://cloud.google.com/bigquery/docs"],
        ["Apache Airflow documentation", "https://airflow.apache.org/docs/"],
        ["Oracle Autonomous Database documentation", "https://docs.oracle.com/en/cloud/paas/autonomous-database/index.html"],
      ],
      channels: [
        ["dbt Labs", "https://www.youtube.com/@dbt-labs"],
        ["Snowflake", "https://www.youtube.com/@snowflakeinc"],
        ["Google Cloud Tech", "https://www.youtube.com/@googlecloudtech"],
      ],
      certs: [
        "dbt Analytics Engineering Certification",
        "SnowPro Core Certification",
        "Google Cloud Professional Data Engineer",
        "Microsoft Certified: Fabric Analytics Engineer Associate",
      ],
      projects: [
        "Model a public dataset into staging and mart layers with dbt",
        "Add tests for uniqueness, nulls and referential integrity, then break one",
        "Implement a type 2 slowly changing dimension and query history",
        "Build an incremental model and handle a late-arriving record",
        "Trace one dashboard number all the way back to source",
      ],
    },
    faqs: [
      ["Warehouse, lake or lakehouse?", "For structured business reporting, a warehouse is usually the straightforward answer. A lakehouse earns its complexity with large semi-structured volumes or heavy machine-learning workloads. We would rather start simple and add."],
      ["How long before the first useful output?", "One well-chosen subject area, end to end, is typically achievable early. Doing that before widening proves the pipeline and the definitions."],
      ["Can we keep our existing BI tool?", "Yes, and usually you should. The warehouse and semantic layer are the part that matters; the visualisation tool sits on top and can be changed later."],
      ["Who owns metric definitions?", "The business, not engineering. Our role is to facilitate agreement and implement it once so it stops being re-litigated per report."],
    ],
  },

  "document-contract-intelligence": {
    technical:
      "The pipeline is layout analysis, then extraction, then validation. Layout matters more than people expect: a table split across a page boundary or a two-column contract will defeat naive text extraction before any model is involved. Extraction combines positional rules where documents are consistent with model-based extraction where they are not, and every field carries a confidence score so a threshold can route low-confidence output to a human rather than letting it through silently.",
    offer: [
      ["Extraction pipeline build", "Ingestion, OCR, layout parsing and field extraction tuned to your specific document types."],
      ["Accuracy baseline", "A labelled sample set and measured per-field accuracy, so performance is a number rather than an impression."],
      ["Review workflow", "A reviewer interface for exceptions, with corrections captured as training signal."],
      ["Downstream integration", "Extracted records pushed into the ERP, contract repository or workflow that uses them."],
    ],
    problems: [
      ["Obligations are missed because nobody reads every contract", "Extracting renewal dates, notice periods and caps into a queryable register makes them visible."],
      ["Invoice processing is manual and slow", "Automated extraction with three-way matching handles the straightforward majority and queues the rest."],
      ["Due diligence takes weeks", "Bulk extraction across a contract set turns a reading exercise into a review exercise."],
      ["We cannot answer what our exposure is", "Structured, queryable contract data answers portfolio-level questions that PDFs cannot."],
    ],
    useCases: [
      ["Contract obligation register", "Extracting key terms across a contract portfolio into a searchable register with renewal alerting."],
      ["Accounts payable automation", "Invoice extraction with purchase order and goods receipt matching, exceptions queued."],
      ["Onboarding document processing", "Extracting and validating fields from identity, compliance and supplier documents."],
      ["Claims or case intake", "Turning inbound forms and correspondence into structured case records."],
    ],
    stack: [
      ["OCR & layout", ["AWS Textract", "Azure Document Intelligence", "Google Document AI", "Tesseract"]],
      ["Extraction", ["Anthropic Claude", "Azure OpenAI", "Layout-aware transformers", "Rule-based positional extraction"]],
      ["Storage & search", ["PostgreSQL", "pgvector", "Elasticsearch", "Object storage"]],
      ["Workflow", ["Custom review queues", "Camunda", "Temporal"]],
      ["Integration", ["Oracle ERP", "SAP", "Contract lifecycle platforms"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["How PDFs store text, and why extraction sometimes returns nothing", "Run OCR on a scanned page and inspect the output", "Regular expressions for structured fields", "Why confidence scores matter more than raw output"]],
        ["Intermediate", ["Layout analysis: tables, columns, headers and footers", "Prompt-based extraction with a defined output schema", "Building a labelled evaluation set and scoring per field", "Designing a human review queue that captures corrections"]],
        ["Advanced", ["Active learning from reviewer corrections", "Handling multi-page tables and cross-reference clauses", "Provenance and audit for regulated extraction", "Cost and throughput at high document volume"]],
      ],
      docs: [
        ["Amazon Textract documentation", "https://docs.aws.amazon.com/textract/"],
        ["Azure AI Document Intelligence documentation", "https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/"],
        ["Google Document AI documentation", "https://cloud.google.com/document-ai/docs"],
        ["Anthropic documentation", "https://docs.anthropic.com/"],
        ["Tesseract OCR documentation", "https://tesseract-ocr.github.io/"],
      ],
      channels: [
        ["Microsoft Developer", "https://www.youtube.com/@MicrosoftDeveloper"],
        ["Google Cloud Tech", "https://www.youtube.com/@googlecloudtech"],
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
      ],
      certs: [
        "Microsoft Certified: Azure AI Engineer Associate",
        "Google Cloud Professional Machine Learning Engineer",
        "AWS Certified Machine Learning Engineer – Associate",
      ],
      projects: [
        "Extract five fields from 20 real invoices and measure per-field accuracy",
        "Add confidence scoring and route anything below threshold to review",
        "Handle a table that splits across two pages",
        "Link every extracted value back to its page coordinates",
        "Feed reviewer corrections back and measure whether accuracy improves",
      ],
    },
    faqs: [
      ["How accurate is it?", "Per field, and dependent on document consistency. Clean structured invoices behave very differently from scanned handwritten forms. The labelled baseline exists so you get a real number for your documents rather than a vendor average."],
      ["Do we still need people?", "Yes, for exceptions. The aim is to shift effort from reading everything to reviewing what the system is unsure about. Full automation with no review is not something we would recommend for contracts."],
      ["Can it handle scanned and handwritten documents?", "Scanned, routinely. Handwriting, with materially lower accuracy and a correspondingly larger review queue. We measure both before committing to a design."],
      ["Where do the documents go?", "Into your own storage, under your retention policy. Which processing happens inside your boundary and what, if anything, is sent to an external model is decided explicitly and documented."],
    ],
  },

  "data-governance-guardrails": {
    technical:
      "Governance that lives in a policy document does not survive contact with a query engine. Enforcement belongs in the data layer: row-level security predicates, column masking policies and tag-based access rules applied at the warehouse, so any tool connecting through it inherits the controls. For AI specifically, the new questions are which classifications may be included in a prompt, what is redacted before egress, and whether prompts and responses are retained — all of which need to be answerable as configuration, not convention.",
    offer: [
      ["Data discovery and classification", "Finding what personal, financial and confidential data exists across the estate, and tagging it."],
      ["Access control implementation", "Role-based access, row-level security and column masking enforced in the platform."],
      ["Retention and deletion", "Implemented schedules, including the deletion requests you are legally obliged to honour."],
      ["AI data boundary design", "Explicit, enforced rules on what may reach a model, what is redacted, and what is logged."],
    ],
    problems: [
      ["We do not know where personal data is", "Discovery and classification before policy. You cannot govern an unknown estate."],
      ["Everyone has access to everything", "Broad access is usually historic convenience. Role-based access with masking narrows it without blocking legitimate work."],
      ["We cannot answer an audit question quickly", "Access logging that can be queried turns a reconstruction exercise into a report."],
      ["Nobody will sign off the AI project", "Because the data boundary is undefined. Making it explicit and enforced is what unblocks approval."],
    ],
    useCases: [
      ["Data catalogue rollout", "A searchable inventory with ownership, classification and lineage."],
      ["Access remediation", "Reducing over-broad warehouse access to role-appropriate views with masking."],
      ["Subject access and deletion", "Automating the lookup and deletion workflow across systems."],
      ["AI usage policy enforcement", "Technical controls backing the written policy on what may be sent to a model."],
    ],
    stack: [
      ["Catalogue", ["Collibra", "Alation", "DataHub", "OpenMetadata", "Microsoft Purview"]],
      ["Enforcement", ["Snowflake masking policies", "BigQuery column-level security", "Immuta", "Apache Ranger"]],
      ["Discovery", ["Automated PII scanning", "Classification tagging", "Lineage capture"]],
      ["AI controls", ["Prompt and response logging", "PII redaction pipelines", "Model allow-lists"]],
      ["Frameworks", ["GDPR", "CCPA", "SOC 2", "NIST AI Risk Management Framework"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["What counts as personal data under GDPR and CCPA", "Classification levels and why they exist", "Role-based access control basics", "Reading a data flow diagram"]],
        ["Intermediate", ["Row-level security and dynamic masking in a warehouse", "Data lineage capture and why it matters for audit", "Retention schedules and lawful deletion", "Building a catalogue people actually use"]],
        ["Advanced", ["Policy as code and automated enforcement", "Privacy-enhancing techniques: pseudonymisation, differential privacy", "AI governance: model inventory, evaluation records, incident process", "Cross-border transfer and data residency design"]],
      ],
      docs: [
        ["NIST AI Risk Management Framework", "https://www.nist.gov/itl/ai-risk-management-framework"],
        ["GDPR full text (EUR-Lex)", "https://eur-lex.europa.eu/eli/reg/2016/679/oj"],
        ["Snowflake data governance documentation", "https://docs.snowflake.com/en/guides-overview-govern"],
        ["Microsoft Purview documentation", "https://learn.microsoft.com/en-us/purview/"],
        ["OpenMetadata documentation", "https://docs.open-metadata.org/"],
      ],
      channels: [
        ["Snowflake", "https://www.youtube.com/@snowflakeinc"],
        ["Microsoft Developer", "https://www.youtube.com/@MicrosoftDeveloper"],
        ["NIST", "https://www.youtube.com/@nist"],
      ],
      certs: [
        "IAPP Certified Information Privacy Professional (CIPP)",
        "IAPP Certified Information Privacy Technologist (CIPT)",
        "Microsoft Certified: Information Protection and Compliance Administrator Associate",
        "SnowPro Advanced: Administrator",
      ],
      projects: [
        "Scan a sample database and classify every column",
        "Implement column masking so analysts see tokenised values",
        "Add row-level security by region and test it from two accounts",
        "Write a deletion job that proves the record is gone everywhere",
        "Build a redaction step before any text is sent to a model",
      ],
    },
    faqs: [
      ["Will governance slow our analysts down?", "Badly implemented, yes. Done in the data layer with sensible default roles, most analysts see no change — they keep querying, and the controls apply underneath."],
      ["Do we need a catalogue tool?", "Not immediately. Below a certain estate size a maintained inventory is enough. Tools help when nobody can hold the map in their head, and they still need an owner."],
      ["How does this apply to AI?", "Directly. The questions AI raises — what data may be in a prompt, what leaves the boundary, what is retained — are governance questions. We implement them as enforced controls rather than guidance."],
      ["Is this a compliance project?", "Compliance is an outcome, not the purpose. The practical benefit is that people can find data they are allowed to use, and cannot reach data they are not."],
    ],
  },

  // ============================================================== Oracle Cloud
  "oracle-erp": {
    technical:
      "Oracle Cloud ERP is a quarterly-release SaaS application, which changes the implementation calculus: customisation is constrained to supported extension points, and every quarter brings an update you cannot decline indefinitely. That makes fit-gap against standard functionality the single highest-leverage activity, and it makes an automated regression pack a permanent operational need rather than a project artefact. Data migration runs through File-Based Data Import or the REST APIs, and reconciliation at trial-balance level is the gate nobody should skip.",
    offer: [
      ["Full implementation", "Fit-gap, configuration, data migration, integration, testing and cutover across Financials and Procurement."],
      ["Upgrade and migration", "Moving from E-Business Suite, PeopleSoft, JD Edwards or a non-Oracle ERP onto Oracle Cloud."],
      ["Rescue and remediation", "Taking over a stalled implementation, establishing what is actually configured, and getting to a deliverable state."],
      ["Quarterly update support", "Regression packs and an assessment process for each Oracle release so updates stop being disruptive."],
    ],
    problems: [
      ["The close takes too long", "Usually manual reconciliations and intercompany. Standard functionality plus a disciplined close calendar addresses most of it."],
      ["Reporting was never rebuilt properly", "Reports are rebuilt against the new data model and validated to agree with current numbers before cutover."],
      ["Customisations block every upgrade", "Each one is assessed against standard functionality. Many exist because of a historic gap Oracle has since closed."],
      ["Data quality will not survive migration", "Trial loads start early precisely because the discovery takes longer than anyone budgets for."],
    ],
    useCases: [
      ["E-Business Suite to Cloud ERP", "A phased move with parallel reporting until the new ledger is trusted."],
      ["Multi-entity consolidation", "Standing up a chart of accounts and ledger structure that supports statutory and management reporting."],
      ["Procurement rollout", "Self-Service Procurement and Supplier Portal to bring spend under management."],
      ["Project-driven organisation", "Project Portfolio Management for costing, billing and revenue recognition on client work."],
    ],
    stack: [
      ["Financials", ["General Ledger", "Payables", "Receivables", "Fixed Assets", "Cash Management", "Expenses"]],
      ["Procurement", ["Purchasing", "Self-Service Procurement", "Sourcing", "Supplier Portal"]],
      ["Projects", ["Project Costing", "Project Billing", "Project Contracts"]],
      ["Reporting", ["OTBI", "BI Publisher", "Financial Reporting Studio", "Oracle Analytics Cloud"]],
      ["Integration & data", ["Oracle Integration Cloud", "FBDI", "REST APIs", "ADFdi"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Double-entry accounting and what a trial balance is", "Oracle Cloud ERP navigation and the role of roles", "Enterprise structures: ledgers, legal entities, business units", "The chart of accounts and segment design", "Run a standard report in OTBI"]],
        ["Intermediate", ["Procure-to-pay and order-to-cash flows end to end", "Approval workflows and BPM rules", "FBDI templates and data loading", "Subledger accounting and accounting rules", "Period close activities and reconciliation"]],
        ["Advanced", ["Multi-entity and multi-currency ledger design", "Quarterly update impact assessment and regression", "Extension strategy within supported boundaries", "Integration architecture to surrounding systems", "Segregation of duties and Advanced Access Controls"]],
      ],
      docs: [
        ["Oracle Fusion Cloud Applications documentation", "https://docs.oracle.com/en/cloud/saas/index.html"],
        ["Oracle Cloud Financials documentation", "https://docs.oracle.com/en/cloud/saas/financials/index.html"],
        ["Oracle Cloud Procurement documentation", "https://docs.oracle.com/en/cloud/saas/procurement/index.html"],
        ["Oracle University learning paths", "https://education.oracle.com/"],
        ["Oracle Cloud Readiness (release notes)", "https://www.oracle.com/webfolder/technetwork/tutorials/tutorial/readiness/offering.html"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Oracle", "https://www.youtube.com/@Oracle"],
      ],
      certs: [
        "Oracle Financials Cloud: General Ledger Implementation Professional",
        "Oracle Financials Cloud: Payables Implementation Professional",
        "Oracle Procurement Cloud: Implementation Professional",
        "Oracle Project Management Cloud: Implementation Professional",
      ],
      projects: [
        "Design a chart of accounts for a two-entity, two-currency organisation",
        "Load suppliers and invoices with FBDI and reconcile the result",
        "Build an approval rule with a threshold and a delegation path",
        "Create an OTBI analysis and compare it to the seeded report",
        "Write a regression checklist for a quarterly update",
      ],
    },
    faqs: [
      ["How long does an Oracle Cloud ERP implementation take?", "It depends on entity count, module scope and data condition more than on company size. The honest answer comes out of fit-gap, which is why we scope that before quoting a timeline."],
      ["Can we customise it?", "Within supported extension points, yes. Beyond them, you are building something that each quarterly update may break. We push hard on standard functionality first for that reason."],
      ["What happens with the quarterly updates?", "They apply whether or not you are ready, so readiness is the deliverable: an automated regression pack and an assessment of each release's impact on your configuration."],
      ["Do we migrate historical transactions?", "Usually balances plus a defined period of detail, with the legacy system retained read-only for older history. Migrating everything is expensive and rarely justified."],
      ["Can you take over a struggling implementation?", "Yes. The first step is an assessment of what is actually configured versus what is documented, because those two usually differ."],
    ],
  },

  "oracle-scm": {
    technical:
      "Supply chain configuration is unusually sensitive to master data quality, because planning engines amplify bad inputs rather than tolerating them. Item attributes, sourcing rules, lead times and units of measure determine planning output more than any parameter in the planning module itself. Global Order Promising depends on accurate supply and availability data, so promising dates are only as credible as inventory accuracy, which in turn depends on the warehouse integration actually reflecting physical movements.",
    offer: [
      ["SCM implementation", "Inventory, Order Management, Procurement, Planning and Manufacturing configured and integrated."],
      ["Master data remediation", "Cleansing and governing item, supplier and location data before it undermines everything downstream."],
      ["Planning configuration", "Demand and supply planning set up and tuned against your real demand history."],
      ["Warehouse and shop-floor integration", "Connecting WMS, MES and third-party logistics to the system of record."],
    ],
    problems: [
      ["Stock figures do not match reality", "Inventory accuracy problems are usually process and integration problems. We trace where physical and system movements diverge."],
      ["Promise dates are not believed", "Order promising depends on supply visibility. Fixing the underlying data is what makes the dates credible."],
      ["Planning output is ignored", "Planners override the system because it has been wrong before. Correcting master data and parameters is what rebuilds trust."],
      ["Too much stock and still stockouts", "A single blanket service level across a varied portfolio causes exactly this. Segmentation addresses it."],
    ],
    useCases: [
      ["Order-to-cash on Oracle Cloud", "Order capture through promising, fulfilment and invoicing, integrated with the warehouse."],
      ["Planning implementation", "Demand Management and Supply Planning with parameters derived from actual history."],
      ["Manufacturing rollout", "Work definitions and shop-floor execution connected to inventory and costing."],
      ["Supplier collaboration", "Supplier Portal for purchase order acknowledgement, shipping notices and forecast sharing."],
    ],
    stack: [
      ["Inventory & costing", ["Inventory Management", "Cost Management", "Receipt Accounting"]],
      ["Order management", ["Order Management", "Global Order Promising", "Pricing"]],
      ["Planning", ["Demand Management", "Supply Planning", "Replenishment Planning", "Backlog Management"]],
      ["Manufacturing", ["Work Definition", "Work Execution", "Quality Management", "Maintenance"]],
      ["Procurement", ["Purchasing", "Supplier Qualification", "Supplier Portal"]],
      ["Integration", ["Oracle Integration Cloud", "FBDI", "REST APIs", "WMS / 3PL interfaces"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Core supply chain vocabulary: lead time, safety stock, MOQ", "Item master attributes and why each one matters", "Inventory transactions and their accounting effect", "The purchase order lifecycle", "Navigate Oracle Cloud SCM and run a standard inquiry"]],
        ["Intermediate", ["Sourcing rules and assignment sets", "Order orchestration and fulfilment lines", "Global Order Promising and availability", "Cost methods: standard, average, FIFO", "Planning parameters and how they change output"]],
        ["Advanced", ["Multi-echelon planning and network design", "Constrained planning and capacity modelling", "Drop-ship, back-to-back and consignment flows", "Integration patterns to WMS and MES", "Planning performance at high SKU counts"]],
      ],
      docs: [
        ["Oracle Cloud SCM documentation", "https://docs.oracle.com/en/cloud/saas/supply-chain-management/index.html"],
        ["Oracle Fusion Cloud Applications documentation", "https://docs.oracle.com/en/cloud/saas/index.html"],
        ["Oracle University learning paths", "https://education.oracle.com/"],
        ["Oracle Cloud Readiness (release notes)", "https://www.oracle.com/webfolder/technetwork/tutorials/tutorial/readiness/offering.html"],
        ["APICS / ASCM body of knowledge", "https://www.ascm.org/"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Oracle", "https://www.youtube.com/@Oracle"],
      ],
      certs: [
        "Oracle Inventory Management Cloud: Implementation Professional",
        "Oracle Order Management Cloud: Implementation Professional",
        "Oracle Supply Planning Cloud: Implementation Professional",
        "ASCM Certified Supply Chain Professional (CSCP)",
      ],
      projects: [
        "Set up an item with full attributes and trace how each affects planning",
        "Configure a sourcing rule and watch planning change its recommendation",
        "Run a planning cycle on seeded demand and explain every suggestion",
        "Model a drop-ship flow end to end",
        "Reconcile a cycle count variance back to its transactions",
      ],
    },
    faqs: [
      ["Can we implement SCM without ERP?", "Technically yes, but costing and receipt accounting tie closely to Financials, so the integration work usually makes a combined approach simpler."],
      ["How much does master data matter?", "More than any other factor. Most disappointing planning implementations are master data problems with a planning module attached."],
      ["Do we need the planning modules?", "Not always. If demand is stable and the portfolio small, replenishment rules may be enough. We would say so rather than sell modules you will not use."],
      ["How do you handle our warehouse system?", "Integrated, generally. Replacing a working WMS is a separate decision, and usually not one to bundle into an ERP programme."],
    ],
  },

  "oracle-hcm": {
    technical:
      "Payroll is the component with no tolerance for approximation: it runs on a fixed date, for every employee, and an error is immediately visible and often legally significant. The implementation method reflects that with parallel runs continuing until every variance between legacy and new payroll is explained, not merely small. Elsewhere, the critical design work is enterprise structures and security — legal employers, business units, and the role-based access model that determines who can see whose records.",
    offer: [
      ["HCM implementation", "Core HR, Absence, Payroll, Talent and Compensation configured, migrated and tested."],
      ["Payroll implementation and parallel running", "Configuration, test cycles and parallel runs continued until results reconcile."],
      ["Talent module rollout", "Recruiting, Onboarding, Performance, Goals and Succession on an existing core HR footprint."],
      ["Security and role design", "A role model that gives managers and HR what they need without over-exposing employee data."],
    ],
    problems: [
      ["Employee data lives in several places", "A single system of record for workforce data, with integrations rather than duplicate entry."],
      ["Managers cannot self-serve", "Self-service only reduces HR load if it is usable. Role design and enablement are treated as part of delivery."],
      ["Payroll errors keep recurring", "Usually configuration or data rather than process. Parallel running surfaces them before they reach employees."],
      ["Local variations are undocumented", "Discovery captures the arrangements that live in people's heads before they become a cutover surprise."],
    ],
    useCases: [
      ["Core HR and payroll implementation", "A single workforce record with payroll parallel-run to reconciliation before cutover."],
      ["Recruiting rollout", "Oracle Recruiting Cloud with requisition, candidate and offer workflow."],
      ["Performance and goals", "Annual and continuous performance processes with manager and employee self-service."],
      ["Benefits integration", "Feeds to benefit providers and reconciliation of enrolment data."],
    ],
    stack: [
      ["Core", ["Global Human Resources", "Workforce Structures", "Absence Management", "Time and Labor"]],
      ["Payroll", ["Global Payroll", "Payroll Costing", "Payroll Interface"]],
      ["Talent", ["Recruiting", "Onboarding", "Performance Management", "Goal Management", "Succession"]],
      ["Compensation", ["Workforce Compensation", "Benefits", "Grade and Salary structures"]],
      ["Reporting & integration", ["OTBI", "BI Publisher", "HCM Data Loader", "HCM Extracts", "REST APIs"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["HR vocabulary: position, assignment, grade, FTE", "Oracle HCM navigation and the role of security roles", "Enterprise structures: legal employer, business unit, department", "Person versus worker versus assignment", "Run a standard workforce report"]],
        ["Intermediate", ["HCM Data Loader and bulk data operations", "Absence plans, accruals and entitlement rules", "Approval workflows and transaction routing", "Fast formulas and where they apply", "Payroll elements, balances and costing"]],
        ["Advanced", ["Global payroll across multiple legislations", "Security profiles and data access design at scale", "HCM Extracts for complex outbound interfaces", "Parallel payroll reconciliation methodology", "Quarterly update impact on payroll configuration"]],
      ],
      docs: [
        ["Oracle Cloud HCM documentation", "https://docs.oracle.com/en/cloud/saas/human-resources/index.html"],
        ["Oracle Fusion Cloud Applications documentation", "https://docs.oracle.com/en/cloud/saas/index.html"],
        ["Oracle University learning paths", "https://education.oracle.com/"],
        ["Oracle Cloud Readiness (release notes)", "https://www.oracle.com/webfolder/technetwork/tutorials/tutorial/readiness/offering.html"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Oracle", "https://www.youtube.com/@Oracle"],
      ],
      certs: [
        "Oracle Global Human Resources Cloud: Implementation Professional",
        "Oracle Payroll Cloud: Implementation Professional",
        "Oracle Recruiting Cloud: Implementation Professional",
        "Oracle Benefits Cloud: Implementation Professional",
      ],
      projects: [
        "Model enterprise structures for a two-country organisation",
        "Load workers with HCM Data Loader and validate the result",
        "Configure an absence plan with accrual and carry-over rules",
        "Build a payroll element and trace it through to costing",
        "Design a security profile so a manager sees only their team",
      ],
    },
    faqs: [
      ["How many parallel payroll runs do we need?", "As many as it takes for every variance to be explained, not a fixed number. Treating it as a count rather than a quality gate is how payroll problems reach employees."],
      ["Can we phase the modules?", "Yes, and usually you should. Core HR first, then payroll, then talent is a common sequence that keeps each phase's risk contained."],
      ["What about our existing time system?", "It can be integrated. Replacing it is a separate decision that does not need to be bundled into the HCM programme."],
      ["How is employee data protected?", "Through the security role model, which is designed deliberately rather than inherited from defaults. Who can see what is an explicit design output."],
    ],
  },

  "oracle-epm": {
    technical:
      "EPM implementations succeed or fail on data integration and dimensionality. Pulling actuals from ERP through Data Management on a schedule removes the manual load step where most delay and error originate. Dimension design — entity, account, scenario, version, period — determines what the model can answer and is expensive to change later, so it deserves disproportionate attention up front. Driver-based planning is the point: models that compute from volume and rate assumptions rather than storing last year's number plus a percentage.",
    offer: [
      ["Planning and budgeting implementation", "EPBCS with driver-based models for workforce, capital, projects and financials."],
      ["Close and consolidation", "FCCS for intercompany elimination, currency translation and group reporting."],
      ["Account reconciliation", "ARCS with automated matching and certification workflow."],
      ["Close acceleration", "Measuring the current cycle and removing the slowest steps iteratively."],
    ],
    problems: [
      ["Planning lives in linked spreadsheets", "Fragile, unauditable and dependent on a few people. A modelled system replaces it with something that survives staff change."],
      ["The close takes too long", "Usually manual reconciliation and late data. Automated actuals and task management address both."],
      ["Reforecasting is too slow to be useful", "If a reforecast takes three weeks, it is out of date on arrival. Driver-based models make scenarios fast."],
      ["Consolidation is a manual assembly", "Automated elimination and translation remove the month-end assembly exercise."],
    ],
    useCases: [
      ["Annual budget and reforecast", "A driver-based planning model with workforce and capital, and scenario comparison."],
      ["Group consolidation", "Multi-entity, multi-currency consolidation with intercompany elimination."],
      ["Reconciliation automation", "ARCS with auto-matching rules and certification tracking."],
      ["Management reporting pack", "Narrative reporting tied to the same data as the consolidation."],
    ],
    stack: [
      ["Planning", ["Planning and Budgeting (EPBCS)", "Workforce", "Capital", "Projects", "Financials modules"]],
      ["Close", ["Financial Consolidation and Close (FCCS)", "Account Reconciliation (ARCS)", "Task Manager"]],
      ["Reporting", ["Narrative Reporting", "Financial Reporting", "Smart View for Office"]],
      ["Profitability", ["Profitability and Cost Management (PCMCS)"]],
      ["Integration", ["Data Management", "EPM Automate", "REST APIs"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Budgeting and forecasting concepts", "Dimensions: entity, account, scenario, version, period", "Smart View basics in Excel", "Navigate an EPM planning form", "Run a data load and see where it lands"]],
        ["Intermediate", ["Business rules and calculation scripts", "Driver-based model design", "Data Management mappings from ERP", "Consolidation mechanics: elimination and translation", "Security and approval workflow in planning"]],
        ["Advanced", ["Multi-currency consolidation with complex ownership", "Performance tuning on large cubes", "EPM Automate for scheduled operations", "Groovy rules for dynamic behaviour", "Close calendar design and cycle reduction"]],
      ],
      docs: [
        ["Oracle Cloud EPM documentation", "https://docs.oracle.com/en/cloud/saas/epm-cloud/index.html"],
        ["Oracle EPM Planning documentation", "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/index.html"],
        ["Oracle Financial Consolidation and Close documentation", "https://docs.oracle.com/en/cloud/saas/financial-consolidation-cloud/index.html"],
        ["Oracle University learning paths", "https://education.oracle.com/"],
        ["Oracle Cloud Readiness (release notes)", "https://www.oracle.com/webfolder/technetwork/tutorials/tutorial/readiness/offering.html"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Oracle", "https://www.youtube.com/@Oracle"],
      ],
      certs: [
        "Oracle Planning Cloud: Implementation Professional",
        "Oracle Financial Consolidation and Close Cloud: Implementation Professional",
        "Oracle Account Reconciliation Cloud: Implementation Professional",
        "Oracle Enterprise Data Management Cloud: Implementation Professional",
      ],
      projects: [
        "Design a dimension structure for a three-entity group",
        "Build a driver-based workforce plan from headcount and rate",
        "Load actuals from a flat file through Data Management",
        "Write a business rule that allocates overhead across cost centres",
        "Build a close task list with owners, dependencies and due dates",
      ],
    },
    faqs: [
      ["Do we need EPM if we have Oracle ERP?", "They do different jobs. ERP records what happened; EPM plans what should happen and consolidates the result. Planning in the general ledger is possible and generally painful."],
      ["Can we keep using Excel?", "Yes, through Smart View. People keep the interface they know while the numbers live in a governed model rather than in the file."],
      ["How much can the close actually be shortened?", "Depends entirely on where the time currently goes, which is why we measure the cycle first. Automating the slowest step is worth more than a broad redesign."],
      ["What if our dimension design turns out wrong?", "Changing it later is expensive, which is why we spend disproportionate time on it early and validate against the questions you need answered."],
    ],
  },

  "oracle-cloud-infrastructure": {
    technical:
      "The landing zone is the decision that is hardest to revisit: compartment hierarchy, identity domain design, tagging and network topology all become load-bearing once workloads arrive. OCI's compartment model gives genuinely useful isolation boundaries for policy and cost, but only if the hierarchy reflects how you will actually govern. Network design should assume hybrid connectivity from the start, because retrofitting FastConnect and routing around an existing VCN layout is considerably harder than planning for it.",
    offer: [
      ["Landing zone design and build", "Compartments, identity, network, tagging and guardrails defined as code before workloads arrive."],
      ["Workload migration", "Assessment, wave planning and migration of existing workloads onto OCI."],
      ["Database on OCI", "Autonomous Database, Base Database and Exadata Cloud Service design and migration."],
      ["Resilience and cost governance", "Tested backup and DR, plus tagging, budgets and showback from day one."],
    ],
    problems: [
      ["Cloud spend is rising without explanation", "Usually no tagging discipline and no rightsizing review. Both are far cheaper to establish early than to retrofit."],
      ["Security posture is unclear", "A defined baseline with drift detection replaces the assumption that it was set up correctly once."],
      ["DR exists on paper only", "An untested plan is a document. We rehearse recovery and record the results."],
      ["Oracle workloads sit awkwardly elsewhere", "Oracle databases and applications often run better and more economically on OCI, though we will say when that is not the case."],
    ],
    useCases: [
      ["Greenfield landing zone", "A governed foundation with compartments, policy and network ready for the first workload."],
      ["Database migration to Autonomous", "Moving an on-premises Oracle database with a tested cutover and rollback."],
      ["Hybrid connectivity", "FastConnect and routing between on-premises data centres and OCI."],
      ["Cross-region disaster recovery", "A tested DR configuration meeting a defined recovery objective."],
    ],
    stack: [
      ["Compute & containers", ["OCI Compute", "OKE (Kubernetes)", "Container Instances", "Functions"]],
      ["Database", ["Autonomous Database", "Base Database Service", "Exadata Cloud Service", "MySQL HeatWave"]],
      ["Network", ["VCN", "FastConnect", "Load Balancer", "Network Firewall", "Site-to-Site VPN"]],
      ["Identity & security", ["Identity Domains", "IAM Policies", "Vault", "Cloud Guard", "Security Zones"]],
      ["Operations", ["OCI Monitoring", "Logging", "Resource Manager (Terraform)", "Budgets and Quotas"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["OCI regions, availability domains and fault domains", "Compartments and how policy inheritance works", "Launch a compute instance and reach it securely", "VCN basics: subnets, gateways, route tables", "Read an IAM policy statement"]],
        ["Intermediate", ["Identity domains and federation to an external IdP", "Terraform via Resource Manager", "Autonomous Database provisioning and scaling", "Load balancing and high availability patterns", "Monitoring, logging and alarms"]],
        ["Advanced", ["Landing zone architecture at enterprise scale", "FastConnect and hybrid routing design", "Cross-region DR with data replication", "Security Zones and Cloud Guard policy", "Cost governance: quotas, budgets, showback"]],
      ],
      docs: [
        ["Oracle Cloud Infrastructure documentation", "https://docs.oracle.com/en-us/iaas/Content/home.htm"],
        ["OCI Architecture Center", "https://docs.oracle.com/solutions/"],
        ["Oracle Autonomous Database documentation", "https://docs.oracle.com/en/cloud/paas/autonomous-database/index.html"],
        ["OCI Terraform provider documentation", "https://registry.terraform.io/providers/oracle/oci/latest/docs"],
        ["Oracle University learning paths", "https://education.oracle.com/"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Oracle", "https://www.youtube.com/@Oracle"],
      ],
      certs: [
        "Oracle Cloud Infrastructure Foundations Associate",
        "Oracle Cloud Infrastructure Architect Associate",
        "Oracle Cloud Infrastructure Architect Professional",
        "Oracle Autonomous Database Cloud Professional",
      ],
      projects: [
        "Build a compartment hierarchy and write least-privilege policies for it",
        "Define a VCN with public and private subnets entirely in Terraform",
        "Provision an Autonomous Database and connect privately to it",
        "Set up budgets and tag-based cost reporting per team",
        "Rehearse a cross-region failover and record the timings",
      ],
    },
    faqs: [
      ["Why OCI rather than AWS or Azure?", "Mostly where Oracle databases and applications are central: licensing, Exadata availability and proximity to Fusion applications can make a real difference. For a general-purpose workload with no Oracle estate, the case is weaker and we will say so."],
      ["Can we run multi-cloud?", "Yes, and many organisations do, with the Oracle estate on OCI and other workloads elsewhere. Interconnect between OCI and Azure exists specifically for this."],
      ["How do we control cost?", "Tagging, budgets and quotas from the start, with a monthly rightsizing review. Retrofitting cost discipline after a year of untagged resources is much harder."],
      ["Is the landing zone really necessary first?", "Yes. Compartment and network structure become difficult to change once workloads depend on them. It is the cheapest thing to get right early."],
    ],
  },

  // ================================================= Enterprise Transformation
  "finance-transformation": {
    technical:
      "The measurable object is the close calendar and the control framework attached to it. Baselining means instrumenting the current cycle: when each task starts and finishes, how many journals are manual, how many reconciliations are outstanding at each day of close. Standardisation has to precede automation because automating a process that differs by entity encodes those differences permanently. The chart of accounts is the structural decision underneath all of it, since a chart that cannot serve both statutory and management reporting guarantees a permanent mapping exercise.",
    offer: [
      ["Current-state baseline", "Cycle times, manual touchpoints and effort distribution, measured rather than estimated."],
      ["Target operating model", "How finance is organised, what centralises, and the service levels between functions."],
      ["Process redesign", "Record-to-report, order-to-cash and procure-to-pay redesigned and documented."],
      ["Control framework", "Controls mapped to the redesigned process, with evidence requirements defined."],
    ],
    problems: [
      ["The close takes longer every year", "Complexity accretes without anyone removing steps. Baselining shows where the time actually goes."],
      ["Finance spends its time collecting, not analysing", "Automating collection is what frees capacity for the analysis the business wants."],
      ["Each entity does it differently", "Standardisation first, then automation, or the variation becomes permanent."],
      ["A new system did not change anything", "Because the process was unchanged. Technology without process redesign reproduces the old outcome more expensively."],
    ],
    useCases: [
      ["Close acceleration", "Instrumenting the close calendar and removing the critical-path steps iteratively."],
      ["Shared services design", "Defining which activities centralise and the service levels that govern them."],
      ["Chart of accounts redesign", "A structure serving statutory and management reporting without manual mapping."],
      ["Control framework refresh", "Rebuilding controls around a redesigned process rather than inheriting the old set."],
    ],
    stack: [
      ["Core systems", ["Oracle Cloud ERP", "Oracle EPM", "SAP", "NetSuite"]],
      ["Close & reconciliation", ["Oracle ARCS", "BlackLine", "Task management"]],
      ["Process", ["Process mining", "Value stream mapping", "RACI and control matrices"]],
      ["Reporting", ["Oracle Analytics Cloud", "Power BI", "Narrative Reporting"]],
      ["Automation", ["Workflow orchestration", "RPA where no API exists"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["The financial close cycle, step by step", "Record-to-report, order-to-cash, procure-to-pay", "What an internal control is and what evidences it", "Reading a trial balance and a reconciliation"]],
        ["Intermediate", ["Process mapping and cycle-time measurement", "Chart of accounts design principles", "Shared services models and service level design", "Control frameworks: COSO, SOX requirements"]],
        ["Advanced", ["Operating model design for finance at scale", "Process mining on ERP event logs", "Multi-entity, multi-currency consolidation design", "Benefit realisation and tracking to the ledger"]],
      ],
      docs: [
        ["COSO Internal Control Framework", "https://www.coso.org/guidance-on-ic"],
        ["IFRS Foundation standards", "https://www.ifrs.org/issued-standards/list-of-standards/"],
        ["Oracle Cloud Financials documentation", "https://docs.oracle.com/en/cloud/saas/financials/index.html"],
        ["Oracle Cloud EPM documentation", "https://docs.oracle.com/en/cloud/saas/epm-cloud/index.html"],
        ["AICPA resources", "https://www.aicpa-cima.com/"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["IFRS Foundation", "https://www.youtube.com/@IFRSFoundation"],
      ],
      certs: [
        "Certified Public Accountant (CPA)",
        "Chartered Global Management Accountant (CGMA)",
        "Certified Internal Auditor (CIA)",
        "Oracle Financials Cloud: General Ledger Implementation Professional",
      ],
      projects: [
        "Map your close calendar and find the critical path",
        "Count manual journals in one period and categorise why each exists",
        "Design a chart of accounts serving both statutory and management views",
        "Build a control matrix for order-to-cash with evidence requirements",
        "Measure one process before and after removing a single step",
      ],
    },
    faqs: [
      ["Is this a technology project or a process project?", "Both, but process leads. New software on an unchanged process reproduces the same results at higher cost, which is the most common way these programmes disappoint."],
      ["Do we have to implement a new ERP?", "Often not. Meaningful close and control improvements are frequently available within the system you already run."],
      ["How do you measure success?", "Against the baseline taken at the start: cycle times, manual touchpoints, control exceptions. Without that baseline, improvement claims are unfalsifiable."],
      ["What about the team?", "Roles change when manual work goes, and that needs planning rather than discovering. Capability transition is part of the engagement."],
    ],
  },

  "procurement-sourcing": {
    technical:
      "Spend analysis depends on a usable taxonomy, and most organisations do not have one: supplier names vary, categories are inconsistent, and a significant share of spend never touches a purchase order. Classification is therefore the first real deliverable. On the process side, compliance is a design problem rather than a policy problem — if raising a compliant requisition takes longer than putting it on a card, the policy loses regardless of what it says, so measured cycle time on the compliant path is the metric that matters.",
    offer: [
      ["Spend analysis", "Classified spend across the estate, including off-contract and non-PO invoices."],
      ["Category strategy and sourcing", "Prioritised categories with structured sourcing events and evaluation."],
      ["Source-to-pay implementation", "Process design and system configuration from requisition through to payment."],
      ["Supplier management", "Onboarding, qualification, risk screening and performance review."],
    ],
    problems: [
      ["We do not know what we spend with whom", "Classification across systems makes consolidated spend visible, usually for the first time."],
      ["Maverick buying is widespread", "Because the compliant route is slower. We measure both paths and fix the gap."],
      ["Contracts auto-renew unnoticed", "A contract repository with renewal alerting turns a surprise into a decision."],
      ["Negotiated savings never appear", "Tracking from signature through to the ledger is what distinguishes a claim from a result."],
    ],
    useCases: [
      ["Spend visibility programme", "Consolidated classified spend as the basis for category prioritisation."],
      ["Category sourcing event", "A structured RFx with weighted evaluation and documented award rationale."],
      ["Source-to-pay rollout", "Requisitioning, approval, receipting and invoice matching configured end to end."],
      ["Supplier risk screening", "Onboarding with financial, compliance and concentration risk checks."],
    ],
    stack: [
      ["Source-to-pay", ["Oracle Procurement Cloud", "Coupa", "SAP Ariba", "Jaggaer"]],
      ["Contracts", ["Oracle Procurement Contracts", "Icertis", "DocuSign CLM"]],
      ["Analytics", ["Spend classification", "Oracle Analytics Cloud", "Power BI"]],
      ["Supplier risk", ["Supplier qualification management", "Third-party risk screening"]],
      ["Integration", ["ERP integration", "Punchout catalogues", "cXML"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Procure-to-pay process, step by step", "Direct versus indirect spend", "What a three-way match is and why it exists", "Purchase order, contract and catalogue basics"]],
        ["Intermediate", ["Spend classification and taxonomy design", "RFx design and weighted evaluation", "Contract lifecycle and clause libraries", "Supplier qualification and risk screening"]],
        ["Advanced", ["Category strategy and should-cost modelling", "Total cost of ownership analysis", "Supplier relationship management at scale", "Savings methodology and ledger-level tracking"]],
      ],
      docs: [
        ["Oracle Cloud Procurement documentation", "https://docs.oracle.com/en/cloud/saas/procurement/index.html"],
        ["CIPS knowledge resources", "https://www.cips.org/intelligence-hub"],
        ["ISM (Institute for Supply Management)", "https://www.ismworld.org/"],
        ["Oracle University learning paths", "https://education.oracle.com/"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Oracle", "https://www.youtube.com/@Oracle"],
      ],
      certs: [
        "CIPS Level 4 Diploma in Procurement and Supply",
        "ISM Certified Professional in Supply Management (CPSM)",
        "Oracle Procurement Cloud: Implementation Professional",
      ],
      projects: [
        "Classify one year of invoice data into a category taxonomy",
        "Identify spend that never touched a purchase order and explain why",
        "Design an RFx with weighted criteria and score two mock bids",
        "Time the compliant requisition path against a corporate card",
        "Trace one negotiated saving from contract to the general ledger",
      ],
    },
    faqs: [
      ["Where do we start?", "Spend analysis. Without it, category prioritisation is guesswork and savings targets are arbitrary."],
      ["Do we need a procurement platform?", "At sufficient transaction volume it helps considerably. Below that, better process and a well-configured ERP procurement module often do more per pound spent."],
      ["How do you stop people buying around the process?", "By making the compliant route genuinely faster. Enforcement alone reliably loses to convenience."],
      ["Are savings guaranteed?", "No, and we would be wary of anyone who says otherwise. What we can commit to is a method, a baseline, and transparent tracking to the ledger."],
    ],
  },

  "supply-chain-operations": {
    technical:
      "Inventory policy should be derived, not inherited. Safety stock follows from demand variability, lead time variability and a target service level, which means the portfolio has to be segmented first — a single service level across fast and slow movers simultaneously over-stocks and under-stocks. S&OP is the process that makes the numbers actionable: a monthly cycle with named decision owners, where the output is a committed plan rather than a forecast nobody has agreed to execute against.",
    offer: [
      ["Planning process design", "Demand and supply planning with an S&OP cycle, owners and decision rights."],
      ["Inventory policy", "Segmentation and calculated safety stock against defined service targets."],
      ["Network and fulfilment design", "Where stock is held, how it is allocated, and how orders are promised."],
      ["Supplier collaboration", "Shared forecasts, confirmations and performance measurement."],
    ],
    problems: [
      ["High stock and stockouts at once", "The signature of an undifferentiated inventory policy. Segmentation addresses both ends."],
      ["The forecast is never right", "Forecasts are always wrong; the question is whether the process is designed to absorb that. Safety stock and review cadence are how."],
      ["Planning and execution are disconnected", "A plan nobody can execute is a forecast. We wire planning output into purchasing and production."],
      ["Expediting is routine", "Constant expediting indicates lead times and buffers that do not reflect reality."],
    ],
    useCases: [
      ["S&OP implementation", "A monthly planning cycle with defined inputs, owners and recorded decisions."],
      ["Inventory optimisation", "Segmentation and recalculated safety stock across the portfolio."],
      ["Fulfilment redesign", "Allocation rules and order promising aligned to actual availability."],
      ["Supplier forecast sharing", "Giving suppliers visibility so they are not guessing at your demand."],
    ],
    stack: [
      ["Planning", ["Oracle Supply Planning", "Oracle Demand Management", "Kinaxis", "o9", "Blue Yonder"]],
      ["Execution", ["Oracle Order Management", "Oracle Inventory", "WMS platforms"]],
      ["Analytics", ["Oracle Analytics Cloud", "Power BI", "Python forecasting models"]],
      ["Collaboration", ["Supplier Portal", "EDI", "Forecast sharing"]],
      ["Methods", ["ABC/XYZ segmentation", "Safety stock modelling", "S&OP cadence design"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Lead time, safety stock, reorder point, MOQ", "Service level and fill rate definitions", "Bullwhip effect and why it happens", "Read a demand history and spot seasonality"]],
        ["Intermediate", ["ABC/XYZ segmentation", "Safety stock formulas and their assumptions", "S&OP cycle design and participants", "Forecast accuracy measures: MAPE, bias, WMAPE"]],
        ["Advanced", ["Multi-echelon inventory optimisation", "Constrained and capacity-aware planning", "Network design and cost-to-serve", "Integrated business planning across functions"]],
      ],
      docs: [
        ["ASCM (APICS) resources", "https://www.ascm.org/"],
        ["Oracle Cloud SCM documentation", "https://docs.oracle.com/en/cloud/saas/supply-chain-management/index.html"],
        ["Forecasting: Principles and Practice (free textbook)", "https://otexts.com/fpp3/"],
        ["MIT Center for Transportation & Logistics", "https://ctl.mit.edu/"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["MIT OpenCourseWare", "https://www.youtube.com/@mitocw"],
      ],
      certs: [
        "ASCM Certified Supply Chain Professional (CSCP)",
        "ASCM Certified in Planning and Inventory Management (CPIM)",
        "Oracle Supply Planning Cloud: Implementation Professional",
      ],
      projects: [
        "Segment a product portfolio by volume and variability",
        "Calculate safety stock from a real demand history and compare to current",
        "Measure forecast accuracy and separate bias from error",
        "Design an S&OP agenda with inputs, owners and decisions",
        "Model the cost of a one-week lead time reduction",
      ],
    },
    faqs: [
      ["Do we need a planning system?", "Not necessarily first. Many organisations get more from fixing segmentation, safety stock and the planning cadence inside their existing ERP before buying a planning platform."],
      ["How much inventory could we remove?", "Unknown until the current policy is analysed, and any number quoted beforehand is marketing. The method is to segment, recalculate, and compare."],
      ["Will better forecasting fix this?", "Partly. A better forecast only helps if the planning process can act on it, which is why we work on both rather than the model alone."],
      ["Can you work with our existing planners?", "Yes, and the outcome is better when we do. They hold knowledge about exceptions and constraints that no system captures."],
    ],
  },

  "process-automation": {
    technical:
      "Automation has a maintenance liability proportional to how tightly it couples to interfaces that change. API-based integration is durable; UI automation against a vendor application is not, because a layout change breaks it silently. The honest assessment therefore weighs annual time saved against build cost plus expected maintenance, and some candidates fail that test. Orchestration engines that hold durable state — Temporal, Camunda — are appropriate where a process spans days and multiple systems, rather than chaining scripts and hoping nothing restarts mid-flight.",
    offer: [
      ["Automation assessment", "Process inventory with a quantified case per candidate, including the ones we recommend against."],
      ["Process simplification", "Removing steps before automating them, which is frequently the larger saving."],
      ["Automation build", "Workflow orchestration, integration and exception handling in production."],
      ["Operating model", "Ownership, monitoring and a maintenance plan, so automations do not silently rot."],
    ],
    problems: [
      ["People re-key data between systems", "The clearest automation case there is, and usually solvable with integration rather than robots."],
      ["Approvals sit in inboxes", "Workflow with routing, delegation and escalation removes the email bottleneck."],
      ["Previous automations broke and were abandoned", "Usually UI automation with no monitoring or owner. We design for change and name an owner."],
      ["Nobody can say what the process actually is", "Mapping comes first. Automating an undocumented process just makes it faster and more opaque."],
    ],
    useCases: [
      ["Invoice processing", "Document extraction, matching and exception routing into the finance system."],
      ["Employee onboarding", "Account creation, access provisioning and equipment requests triggered from the HR record."],
      ["Approval workflows", "Multi-step approvals with thresholds, delegation and a complete audit trail."],
      ["Report generation and distribution", "Scheduled assembly and delivery, replacing a recurring manual task."],
    ],
    stack: [
      ["Orchestration", ["Temporal", "Camunda", "Oracle Integration Cloud", "Power Automate"]],
      ["RPA", ["UiPath", "Automation Anywhere", "Power Automate Desktop"]],
      ["Document", ["Azure Document Intelligence", "AWS Textract", "Anthropic Claude"]],
      ["Integration", ["REST APIs", "Webhooks", "Message queues"]],
      ["Monitoring", ["Process dashboards", "Exception queues", "Alerting"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Map a process with swimlanes and handoffs", "Identify the steps that add nothing", "Basic API concepts: what can be automated without RPA", "Build a simple approval flow"]],
        ["Intermediate", ["BPMN notation and workflow modelling", "Durable workflow engines and why state matters", "Exception handling and compensating actions", "Business case construction for an automation"]],
        ["Advanced", ["Process mining from system event logs", "Long-running workflows spanning days and systems", "Automation governance and a centre of excellence", "Measuring realised benefit rather than projected"]],
      ],
      docs: [
        ["Camunda documentation", "https://docs.camunda.io/"],
        ["Temporal documentation", "https://docs.temporal.io/"],
        ["BPMN 2.0 specification (OMG)", "https://www.omg.org/spec/BPMN/2.0/"],
        ["Microsoft Power Automate documentation", "https://learn.microsoft.com/en-us/power-automate/"],
        ["Oracle Integration Cloud documentation", "https://docs.oracle.com/en/cloud/paas/application-integration/index.html"],
      ],
      channels: [
        ["Camunda", "https://www.youtube.com/@Camunda"],
        ["Temporal", "https://www.youtube.com/@temporalio"],
        ["Microsoft Developer", "https://www.youtube.com/@MicrosoftDeveloper"],
      ],
      certs: [
        "Camunda Certified Developer",
        "UiPath Certified RPA Associate",
        "Microsoft Certified: Power Automate RPA Developer Associate",
      ],
      projects: [
        "Map a real process and mark every step that adds no value",
        "Automate one handoff using an API rather than UI automation",
        "Build a workflow with an exception queue and a named owner",
        "Write the business case including maintenance cost, honestly",
        "Add monitoring that alerts when an automation stops running",
      ],
    },
    faqs: [
      ["Is RPA still relevant?", "For systems with no API and no prospect of one, yes. It remains the most brittle option, so we treat it as a last resort rather than a default."],
      ["What should we automate first?", "High volume, rule-based, stable inputs. And before automating, check whether the step can simply be deleted — that is often the better answer."],
      ["How do we stop automations breaking?", "Monitoring, a named owner, and a preference for API integration over UI automation. Unmonitored automation is a future incident."],
      ["Will this reduce headcount?", "That is your decision, not ours. Most clients redeploy capacity rather than cut it, but the honest framing is that we quantify time saved and you decide what to do with it."],
    ],
  },

  "operating-model-design": {
    technical:
      "The useful artefacts are a capability map, a decision-rights matrix, and an explicit sourcing position per capability. Team topology matters because the interfaces between teams become the interfaces in the system — organisations tend to ship their communication structure. Where delivery is chronically slow, the cause is usually ambiguous decision rights or a handoff between teams with misaligned incentives, both of which are structural rather than effort problems.",
    offer: [
      ["Capability mapping", "What the organisation must be able to do, assessed independently of the current structure."],
      ["Team and structure design", "How teams are grouped and what the interfaces between them are."],
      ["Decision rights framework", "Who decides what, documented, so escalation stops being the default."],
      ["Transition planning", "Sequencing and communication, because moving to a new model is itself a change programme."],
    ],
    problems: [
      ["Everything escalates", "Ambiguous decision rights. Making them explicit is usually the single highest-value change."],
      ["Delivery is slow despite enough people", "Handoffs and queues between teams, not individual effort. Structure is the lever."],
      ["We cannot tell what to keep in-house", "An explicit sourcing position per capability replaces case-by-case improvisation."],
      ["The last reorganisation changed nothing", "Because it moved boxes without changing decision rights or interfaces."],
    ],
    useCases: [
      ["Technology operating model", "Restructuring delivery around products and platforms rather than projects."],
      ["Post-implementation model", "Defining how a function runs after a major system change."],
      ["Shared services design", "What centralises, what stays local, and the service levels between them."],
      ["Sourcing strategy", "A deliberate in-house versus partnered split per capability."],
    ],
    stack: [
      ["Methods", ["Capability mapping", "Team Topologies", "Value stream mapping", "RACI / decision rights"]],
      ["Governance", ["Operating cadence design", "Portfolio governance", "Service level agreements"]],
      ["Assessment", ["Capability maturity assessment", "Flow and lead-time analysis"]],
      ["Change", ["Stakeholder mapping", "Communication planning", "Role transition design"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["What an operating model actually contains", "Capability versus process versus function", "Reading an organisation chart critically", "Conway's law and its practical consequences"]],
        ["Intermediate", ["Team Topologies: the four team types and three interaction modes", "Value stream mapping and queue analysis", "Decision rights frameworks", "Service level design between internal teams"]],
        ["Advanced", ["Operating model design for multi-business-unit organisations", "Sourcing strategy and capability retention", "Measuring flow efficiency across a portfolio", "Sequencing a structural transition without stalling delivery"]],
      ],
      docs: [
        ["Team Topologies", "https://teamtopologies.com/"],
        ["Conway's Law — Martin Fowler", "https://martinfowler.com/bliki/ConwaysLaw.html"],
        ["DORA research programme", "https://dora.dev/"],
        ["Prosci change management resources", "https://www.prosci.com/resources"],
      ],
      channels: [
        ["Thoughtworks", "https://www.youtube.com/@Thoughtworks"],
        ["GOTO Conferences", "https://www.youtube.com/@GOTO-"],
      ],
      certs: [
        "Prosci Change Management Certification",
        "TOGAF Enterprise Architecture Certification",
        "Certified Scaled Agile (SAFe) Program Consultant",
      ],
      projects: [
        "Map your capabilities and mark which are genuinely differentiating",
        "Write a decision-rights matrix for one recurring decision type",
        "Value-stream map one delivery and measure wait time versus work time",
        "Classify your teams using Team Topologies and name the interaction modes",
        "Draft a sourcing position for each capability and defend it",
      ],
    },
    faqs: [
      ["Is this just a reorganisation?", "No, and reorganisations that only move boxes are exactly what this is meant to avoid. The substance is decision rights, interfaces and sourcing."],
      ["How long does it take to see an effect?", "Decision-rights clarity can change things within weeks. Structural change takes longer and should be sequenced so delivery continues throughout."],
      ["Do you recommend a specific framework?", "No. Frameworks are useful vocabulary and poor substitutes for designing around your actual work. We borrow from several and commit to none."],
      ["What if leadership disagrees on the target?", "Then that is the work. Surfacing and resolving the disagreement is more valuable than producing a document that papers over it."],
    ],
  },

  // ============================================================ Managed Services
  "application-support": {
    technical:
      "Support quality is determined largely at transition, not during operation. Taking on a system without shadowing, runbooks and access to the people who built it produces ticket-shuffling rather than resolution. Service levels tiered by business impact matter because a single blanket SLA either over-serves low-impact issues or under-serves critical ones. Root-cause analysis on recurring incidents is what makes ticket volume trend downward; without it, support becomes a permanent tax that grows with the estate.",
    offer: [
      ["Support transition", "Structured handover with shadowing and documented runbooks before we take responsibility."],
      ["Tiered support", "First through third line against service levels set by business impact."],
      ["Minor enhancements", "Small changes delivered within the agreement rather than raised as separate projects."],
      ["Problem management", "Root-cause analysis on recurring incidents, with permanent fixes rather than repeated workarounds."],
    ],
    problems: [
      ["The same issues recur", "Tickets closed without root-cause analysis guarantee repetition. Problem management is what breaks the cycle."],
      ["Support has no context", "Handover without knowledge transfer produces escalation on everything. Transition is where that is prevented."],
      ["Small changes take months", "Because every change is a project. An enhancement allowance inside the agreement removes that friction."],
      ["Nobody knows if support is working", "Honest reporting on volumes, response times and misses, rather than a green dashboard."],
    ],
    useCases: [
      ["Post-implementation support", "Taking on a system after go-live, including hypercare and steady-state transition."],
      ["Legacy application support", "Maintaining systems whose original team has moved on."],
      ["Oracle Cloud application support", "Functional and technical support including quarterly update readiness."],
      ["Integration support", "Monitoring and resolving failures across interfaces between systems."],
    ],
    stack: [
      ["Service management", ["Jira Service Management", "ServiceNow", "Zendesk", "Freshservice"]],
      ["Monitoring", ["Datadog", "Grafana", "OCI Monitoring", "Application Insights"]],
      ["Knowledge", ["Runbooks", "Known-error database", "Architecture decision records"]],
      ["Release", ["CI/CD pipelines", "Regression test packs", "Change management"]],
      ["Frameworks", ["ITIL-aligned incident and problem management"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Incident versus problem versus change", "Priority and severity, and why they differ", "Writing a useful ticket and a useful resolution note", "Reading logs to find a first cause"]],
        ["Intermediate", ["Service level design by business impact", "Root-cause analysis techniques", "Runbook authoring that someone else can follow", "Escalation paths and on-call handover"]],
        ["Advanced", ["Problem management at portfolio level", "Reducing ticket volume structurally", "Supporting SaaS with vendor release cadences", "Service reporting that is honest about misses"]],
      ],
      docs: [
        ["ITIL 4 overview (Axelos)", "https://www.axelos.com/certifications/itil-service-management"],
        ["Google SRE Book (free)", "https://sre.google/books/"],
        ["Atlassian incident management handbook", "https://www.atlassian.com/incident-management/handbook"],
        ["ServiceNow documentation", "https://docs.servicenow.com/"],
      ],
      channels: [
        ["Atlassian", "https://www.youtube.com/@Atlassian"],
        ["Google Cloud Tech", "https://www.youtube.com/@googlecloudtech"],
      ],
      certs: [
        "ITIL 4 Foundation",
        "ITIL 4 Managing Professional",
        "Atlassian Certified in Jira Service Management Administration",
      ],
      projects: [
        "Write a runbook someone unfamiliar can follow without asking you",
        "Do a root-cause analysis on a recurring ticket and fix the cause",
        "Design service levels tiered by business impact",
        "Build a service report that shows the misses, not just the hits",
        "Reduce one ticket category to zero and document how",
      ],
    },
    faqs: [
      ["Can you support a system you did not build?", "Yes, provided there is a proper transition. We will not take on responsibility without one, because support without context helps nobody."],
      ["What hours do you cover?", "Agreed per engagement against business impact. Not every system justifies 24/7, and paying for it where it is not needed is waste."],
      ["How do you handle enhancements?", "Small changes within an agreed allowance; larger pieces scoped separately so they do not quietly consume support capacity."],
      ["What if ticket volume is high at the start?", "Expected, and the point of problem management is that it should fall. We report the trend, which is the honest measure of whether support is working."],
    ],
  },

  "cloud-infrastructure-operations": {
    technical:
      "Operational maturity shows up in three measurable places: patch currency against a defined baseline, backup coverage with verified restores, and cost per unit of work. Each requires automation to sustain, because manual patching and manual cost review both degrade the moment attention moves elsewhere. Disaster recovery deserves particular scepticism: a plan that has never been executed is an assumption, and the gap between stated and actual recovery time is usually discovered at the worst moment.",
    offer: [
      ["Operational baseline", "Defined standards for patch currency, backup coverage, resilience and security, with reporting against them."],
      ["Automated operations", "Patching, scaling and routine remediation automated so attention goes to exceptions."],
      ["Resilience assurance", "Backup verification and rehearsed disaster recovery with recorded results."],
      ["FinOps", "Tagging, rightsizing, commitment planning and monthly review with named actions."],
    ],
    problems: [
      ["Cloud spend keeps rising", "Usually untagged resources and no rightsizing cadence. Both are fixable with discipline rather than tooling."],
      ["Patching falls behind", "Manual patching does not survive competing priorities. Automation and a measured baseline do."],
      ["DR has never been tested", "An untested plan is a document. Rehearsal is the only thing that tells you the real recovery time."],
      ["Security drift goes unnoticed", "Configuration moves away from the baseline over time. Drift detection catches it."],
    ],
    useCases: [
      ["Managed cloud operations", "Day-to-day running of an AWS, Azure or OCI estate against an agreed baseline."],
      ["DR implementation and testing", "Configuring and rehearsing recovery to a defined objective."],
      ["Cost optimisation programme", "Tagging, rightsizing and commitment strategy with tracked savings."],
      ["Security baseline remediation", "Bringing an estate to a benchmark standard and keeping it there."],
    ],
    stack: [
      ["Platforms", ["AWS", "Microsoft Azure", "Oracle Cloud Infrastructure", "Google Cloud"]],
      ["Automation", ["Terraform", "Ansible", "AWS Systems Manager", "OCI Resource Manager"]],
      ["Monitoring", ["Datadog", "Prometheus", "Grafana", "CloudWatch", "OCI Monitoring"]],
      ["Security", ["CIS Benchmarks", "AWS Security Hub", "Microsoft Defender for Cloud", "OCI Cloud Guard"]],
      ["Cost", ["AWS Cost Explorer", "Azure Cost Management", "OCI Budgets", "FinOps practice"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Cloud shared responsibility model", "Compute, storage and network primitives", "Tagging and why it matters for cost", "Read a cloud bill and attribute a line item"]],
        ["Intermediate", ["Infrastructure as code for operational change", "Backup strategy and restore testing", "Autoscaling policies and capacity headroom", "Security benchmarks and drift detection"]],
        ["Advanced", ["Multi-region DR architecture and data replication", "FinOps: commitment planning and unit economics", "Automated remediation and self-healing", "Operating a regulated estate with audit evidence"]],
      ],
      docs: [
        ["AWS Well-Architected Framework", "https://aws.amazon.com/architecture/well-architected/"],
        ["Microsoft Azure Well-Architected Framework", "https://learn.microsoft.com/en-us/azure/well-architected/"],
        ["Oracle Cloud Infrastructure documentation", "https://docs.oracle.com/en-us/iaas/Content/home.htm"],
        ["CIS Benchmarks", "https://www.cisecurity.org/cis-benchmarks"],
        ["FinOps Foundation", "https://www.finops.org/introduction/what-is-finops/"],
      ],
      channels: [
        ["AWS Events", "https://www.youtube.com/@AWSEventsChannel"],
        ["Microsoft Azure", "https://www.youtube.com/@MicrosoftAzure"],
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
      ],
      certs: [
        "AWS Certified SysOps Administrator – Associate",
        "Microsoft Certified: Azure Administrator Associate",
        "Oracle Cloud Infrastructure Architect Associate",
        "FinOps Certified Practitioner",
      ],
      projects: [
        "Tag every resource and produce a cost report by team",
        "Automate patching and measure currency against a baseline",
        "Perform a real restore from backup and time it",
        "Run a DR failover in a test environment and record the gaps",
        "Rightsize three workloads and quantify the saving",
      ],
    },
    faqs: [
      ["Do you replace our internal team?", "Rarely, and we would not propose it as the default. More often we take routine operations so internal people work on things specific to your business."],
      ["Which clouds do you operate?", "AWS, Azure, OCI and Google Cloud. Oracle estates on OCI are a particular strength given the application-side work."],
      ["How often should DR be tested?", "At least annually, and after any significant architecture change. More often if the recovery objective is aggressive."],
      ["Can you reduce our cloud bill?", "Usually there is something, most often in untagged idle resources and oversized instances. We will not quote a percentage before seeing the estate."],
    ],
  },

  "monitoring-sre": {
    technical:
      "Service level objectives should be expressed from the user's perspective, because component uptime and service usability are different things — every instance can be healthy while the service returns errors. Error budgets turn reliability into a quantity that can be traded against release velocity, which is what makes the conversation concrete rather than aspirational. The operational discipline that matters most is alert hygiene: every alert should require human action and map to a runbook, because an alert that does not is training people to ignore the ones that do.",
    offer: [
      ["SLO definition", "Objectives based on user-facing behaviour, with error budgets and an agreed policy for spending them."],
      ["Alert remediation", "Removing alerts that require no action and attaching runbooks to the ones that remain."],
      ["Observability implementation", "Metrics, structured logs and distributed tracing across services."],
      ["Incident practice", "On-call rota, incident command roles and blameless postmortems with tracked actions."],
    ],
    problems: [
      ["Users report outages before monitoring does", "Monitoring watches components rather than user journeys. SLOs fix the perspective."],
      ["On-call is burning people out", "Almost always alert noise. Removing non-actionable alerts is the first intervention."],
      ["Incidents take too long to diagnose", "Without tracing, attribution across services is guesswork. Instrumentation shortens diagnosis."],
      ["The same incident keeps happening", "Postmortem actions that are never completed. Tracking them to closure is the difference."],
    ],
    useCases: [
      ["SLO programme", "Defining objectives and error budgets for critical services and reporting against them."],
      ["Alert rationalisation", "Auditing an existing alert set and removing what does not require action."],
      ["Observability rollout", "Consistent tracing and metrics across an existing estate, introduced incrementally."],
      ["Incident response setup", "On-call, escalation and postmortem practice for a team taking on production ownership."],
    ],
    stack: [
      ["Metrics", ["Prometheus", "Datadog", "CloudWatch", "OCI Monitoring"]],
      ["Logs", ["Loki", "Elasticsearch", "Splunk", "OpenSearch"]],
      ["Tracing", ["OpenTelemetry", "Jaeger", "Datadog APM", "Tempo"]],
      ["Alerting & on-call", ["PagerDuty", "Opsgenie", "Alertmanager"]],
      ["Dashboards", ["Grafana", "Datadog", "Kibana"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["The difference between monitoring and observability", "Metrics, logs and traces, and what each is for", "Read a dashboard and say what is wrong", "Why uptime percentage alone is a weak measure"]],
        ["Intermediate", ["Defining SLIs and SLOs from user journeys", "Error budgets and burn-rate alerting", "Instrumenting a service with OpenTelemetry", "Writing a runbook tied to an alert"]],
        ["Advanced", ["Incident command and coordination at scale", "Blameless postmortem facilitation", "Capacity and load modelling", "Chaos experiments and failure injection"]],
      ],
      docs: [
        ["Google SRE Book (free)", "https://sre.google/books/"],
        ["Google SRE Workbook (free)", "https://sre.google/workbook/table-of-contents/"],
        ["OpenTelemetry documentation", "https://opentelemetry.io/docs/"],
        ["Prometheus documentation", "https://prometheus.io/docs/introduction/overview/"],
        ["Grafana documentation", "https://grafana.com/docs/"],
      ],
      channels: [
        ["Google Cloud Tech", "https://www.youtube.com/@googlecloudtech"],
        ["Grafana", "https://www.youtube.com/@Grafana"],
        ["CNCF (Cloud Native Computing Foundation)", "https://www.youtube.com/@cncf"],
      ],
      certs: [
        "Prometheus Certified Associate (PCA)",
        "Google Cloud Professional Cloud DevOps Engineer",
        "Datadog Fundamentals certifications",
      ],
      projects: [
        "Define an SLI and SLO for one real user journey",
        "Audit your alerts and delete every one that needs no action",
        "Instrument two services with tracing and follow a request across them",
        "Write a burn-rate alert on an error budget",
        "Run a postmortem on a real incident and track the actions to closure",
      ],
    },
    faqs: [
      ["What SLO should we target?", "Whatever the business actually needs, which is rarely as high as people first say. Each additional nine costs disproportionately, so the target should be a deliberate trade-off."],
      ["Do we need to adopt all of SRE?", "No. SLOs, alert hygiene and blameless postmortems deliver most of the value and can be adopted without restructuring anything."],
      ["Can you provide on-call cover?", "Yes, as part of a managed service. It works best combined with application support so whoever is paged can actually fix the problem."],
      ["How do we stop alert fatigue returning?", "A standing rule that every alert must be actionable and have a runbook, plus a periodic audit. Without the audit it creeps back."],
    ],
  },

  "continuous-improvement": {
    technical:
      "The signal sources are usually already present and unexamined: support ticket categories, usage analytics showing where people abandon a flow, and the manual workarounds that have grown around gaps. Prioritisation works best with the client's owners in the room rather than as a backlog handed over, because trade-offs are business decisions. Measuring before and after on the specific metric a change was meant to move is what distinguishes improvement from activity.",
    offer: [
      ["Improvement backlog", "A prioritised backlog built from support data, usage analytics and user feedback."],
      ["Regular delivery cadence", "A predictable release rhythm so improvements are expected rather than negotiated."],
      ["Benefit measurement", "Before-and-after measurement on what each change was meant to improve."],
      ["Roadmap visibility", "A shared view of what is coming, so stakeholders can plan around it."],
    ],
    problems: [
      ["The system stopped changing after go-live", "No funded capacity. A standing allocation is what keeps a system improving rather than ageing."],
      ["Users built workarounds", "Workarounds are a map of unmet requirements. Mining them is cheap and high-yield."],
      ["Change requests queue indefinitely", "No cadence and no prioritisation forum. Both are process problems rather than capacity problems."],
      ["We cannot tell if changes helped", "Because nothing was measured before. Baselines per change fix that."],
    ],
    useCases: [
      ["Post-go-live improvement", "A standing capacity to act on what real usage reveals after launch."],
      ["Usage-driven backlog", "Analytics and support data converted into a prioritised list."],
      ["Quarterly improvement cycle", "A repeating cycle of prioritise, deliver, measure."],
      ["Technical debt reduction", "A funded allocation for the work that keeps delivery speed from degrading."],
    ],
    stack: [
      ["Analytics", ["Product analytics", "Session analysis", "Oracle Analytics Cloud", "Power BI"]],
      ["Support data", ["Jira Service Management", "ServiceNow", "Ticket categorisation"]],
      ["Delivery", ["Jira", "Azure DevOps", "CI/CD pipelines"]],
      ["Measurement", ["Before-and-after baselines", "Cycle time tracking", "Adoption metrics"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Read support tickets as requirements evidence", "Basic product analytics: funnels and drop-off", "Writing a change as a problem rather than a solution", "Prioritisation basics and the cost of delay"]],
        ["Intermediate", ["Categorising support data to find themes", "Running a prioritisation session with stakeholders", "Defining a measurable success criterion per change", "Release cadence and batch size effects"]],
        ["Advanced", ["Benefit realisation tracking across a portfolio", "Technical debt quantification and argument", "Experimentation and A/B testing where volume allows", "Managing a long-running improvement programme"]],
      ],
      docs: [
        ["DORA research programme", "https://dora.dev/"],
        ["Atlassian agile resources", "https://www.atlassian.com/agile"],
        ["Lean Enterprise Institute", "https://www.lean.org/"],
        ["Google HEART framework (research)", "https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/"],
      ],
      channels: [
        ["Atlassian", "https://www.youtube.com/@Atlassian"],
        ["Thoughtworks", "https://www.youtube.com/@Thoughtworks"],
      ],
      certs: [
        "Certified Scrum Product Owner (CSPO)",
        "Lean Six Sigma Green Belt",
        "ITIL 4 Foundation",
      ],
      projects: [
        "Categorise three months of tickets and find the top three themes",
        "Find where users abandon one flow and fix the step",
        "Define a measurable success criterion before building a change",
        "Measure cycle time before and after reducing batch size",
        "Publish a roadmap and keep it current for a quarter",
      ],
    },
    faqs: [
      ["How much capacity should we allocate?", "Enough to be predictable rather than a figure we would quote blind. The important thing is that it is standing capacity rather than negotiated per request."],
      ["Who decides priorities?", "You do. We facilitate the session, bring the data and make trade-offs explicit, but the ranking is a business decision."],
      ["Is this the same as support?", "No. Support keeps the system working; this makes it better. They are often delivered together but they are different budgets and different work."],
      ["What if there is nothing to improve?", "There always is, but if the backlog genuinely thins out, the honest answer is to reduce the allocation rather than invent work."],
    ],
  },

  "specialized-talent": {
    technical:
      "Assessment is the part most staffing fails at: keyword matching on a CV predicts very little about whether someone can work effectively in your codebase. We assess through technical discussion of real decisions and trade-offs the candidate has made. Integration matters equally — people working to your standards, in your tooling, inside your ceremonies, rather than as a parallel team whose output has to be merged later, which reproduces exactly the integration problems you were trying to avoid.",
    offer: [
      ["Capability-scoped placement", "Roles defined by the specific capability needed and for how long, rather than a generic job title."],
      ["Technical assessment", "Candidates evaluated against the actual work through technical discussion, not keyword screening."],
      ["Embedded delivery", "Engineers working inside your process, tooling and standards."],
      ["Knowledge transfer", "Pairing and documentation planned from the start so capability stays when the engagement ends."],
    ],
    problems: [
      ["Hiring takes too long for the deadline", "Permanent recruitment has a long lead time. Embedded specialists cover the gap while hiring continues."],
      ["We need a skill we will not need permanently", "A migration or implementation may need expertise for months, not forever. Hiring permanently for it is the wrong instrument."],
      ["Contractors left and took the knowledge", "Knowledge transfer treated as optional. We plan it from day one and make it a deliverable."],
      ["Previous contractors did not fit the team", "Usually assessment on paper rather than on the work, plus working in parallel instead of inside the team."],
    ],
    useCases: [
      ["Oracle implementation specialists", "Functional and technical consultants for a defined implementation phase."],
      ["Engineering capacity for a programme", "Senior engineers embedded in your teams for a delivery window."],
      ["Data capability", "Data engineers or scientists for a platform build or model development."],
      ["Architecture support", "A solution architect holding the design across a multi-team programme."],
    ],
    stack: [
      ["Engineering", ["TypeScript / Node.js", "Python", "Java", "Go", "React", "Kubernetes"]],
      ["Oracle", ["Cloud ERP", "SCM", "HCM", "EPM", "OCI", "Integration Cloud"]],
      ["Data & AI", ["SQL", "dbt", "Spark", "Python ML stack", "LLM application engineering"]],
      ["Cloud & platform", ["AWS", "Azure", "OCI", "Terraform", "CI/CD"]],
      ["Architecture", ["Solution architecture", "Integration architecture", "Security architecture"]],
    ],
    learn: {
      roadmap: [
        ["Beginner", ["Pick one stack and go deep before going broad", "Build something real and deploy it publicly", "Learn to read other people's code", "Version control and code review etiquette"]],
        ["Intermediate", ["Production experience: on-call, incidents, debugging live systems", "Writing for other engineers: design docs, ADRs", "Testing discipline and refactoring safely", "Estimating and communicating uncertainty"]],
        ["Advanced", ["Technical leadership without authority", "Making and defending architecture trade-offs", "Mentoring and raising the level around you", "Domain depth in a vertical such as Oracle or data platforms"]],
      ],
      docs: [
        ["Oracle University learning paths", "https://education.oracle.com/"],
        ["AWS Skill Builder", "https://skillbuilder.aws/"],
        ["Microsoft Learn", "https://learn.microsoft.com/en-us/training/"],
        ["Google Cloud Skills Boost", "https://www.cloudskillsboost.google/"],
        ["The Linux Foundation training", "https://training.linuxfoundation.org/"],
      ],
      channels: [
        ["Oracle Learning", "https://www.youtube.com/@OracleLearning"],
        ["Microsoft Developer", "https://www.youtube.com/@MicrosoftDeveloper"],
        ["GOTO Conferences", "https://www.youtube.com/@GOTO-"],
      ],
      certs: [
        "Oracle Cloud Infrastructure Architect Associate",
        "AWS Certified Solutions Architect – Associate",
        "Certified Kubernetes Administrator (CKA)",
        "Microsoft Certified: Azure Solutions Architect Expert",
      ],
      projects: [
        "Ship something to production and operate it for a month",
        "Write an architecture decision record and have it reviewed",
        "Debug a live incident and write the postmortem",
        "Mentor someone through their first production change",
        "Go deep on one vertical until you can hold the whole design",
      ],
    },
    faqs: [
      ["Is this staff augmentation?", "In shape, yes, but we scope by capability and build knowledge transfer in. The difference matters when the engagement ends."],
      ["How quickly can someone start?", "Depends on how specific the capability is. Common engineering profiles move faster than niche Oracle module expertise."],
      ["Do they work for us or for you?", "They work inside your team, to your process and standards. We handle employment, performance and continuity."],
      ["What if the fit is wrong?", "We replace, and we would rather find out early. Assessment against real work exists to make that rare."],
      ["Can this convert to permanent?", "That is a conversation we are open to rather than one we obstruct. It is usually a good outcome for everyone."],
    ],
  },
};
