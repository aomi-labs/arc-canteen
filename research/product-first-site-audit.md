# Product-first site audit

Audit date: 2026-10-06  
Source revision: [`d424517`](https://github.com/aomi-labs/arc-canteen/commit/d4245172a2640c24fadc00a356595273c85750a3)  
Deployed surface: [arc-canteen.vercel.app](https://arc-canteen.vercel.app/)

## Decision

The current site is a careful Arc/Tameion field guide, not yet the home of two builder products. It should stop asking builders to assemble a five-tool mental model and instead begin with two runnable outcomes:

1. **Aomi x Circle Execution Kit** — for a builder who already has an agent and needs a paid, simulated, unsigned Arc transaction artifact that their Circle wallet can review, sign, execute, and verify.
2. **Arc Agent-in-a-Box** — for a builder who already has an application/API and needs a lightweight embedded agent backed by Aomi's stateful Agent API, with the application or Circle wallet retaining signing authority.

The site should be rebuilt around choosing, cloning, running, and verifying one of those paths. General Aomi reference material, Tameion requests, and ecosystem boundaries remain useful, but as supporting material rather than the primary journey.

## What the current journey actually does

### It opens with ecosystem explanation, not a product choice

The home page headline is “Aomi in the middle. Arc at the end.” Its first actionable section is “Five tools. One place each,” followed by Canteen, Circle Agent Stack, Arc, Aomi Host, and Aomi Execution. A new builder must understand five ownership boundaries before seeing an Aomi product.

The deployed home page exposes 56 links and five copy buttons, but no clone/fork link for this repository, install command for a kit, runnable example, hosted product demo, transaction artifact viewer, or verified receipt. The two hero actions are “See the stack” and “Run one payment”; neither selects one of the two owned products.

### The most prominent runnable path proves the seams are disconnected

The [quickstart](https://arc-canteen.vercel.app/quickstart) is explicitly marked “Not a recorded live run.” It asks the builder to provision both a Canteen bench and a Circle agent wallet, but the actual Aomi walkthrough uses a separately connected wallet in the Portal. Its own copy says the Circle agent wallet cannot be passed to `aomi tx sign` and must use `circle wallet transfer` separately.

That is useful boundary documentation, but it does not demonstrate technological synergy. It proves a manual Aomi Portal flow beside a separate Circle transfer rather than a single product path in which Aomi creates the artifact and Circle authorizes its execution.

### The Build page is a second copy of the general documentation

The [Build page](https://arc-canteen.vercel.app/build) contains 27,826 visible characters spanning CLI, Agent Skills, MCP, Rust SDK, Build platform, widget, TypeScript SDK/REST, Telegram, permissions, guards, and general customer examples. In source, `content/build.ts` is 494 lines and the renderer is another 267 lines.

This breadth makes the page a documentation mirror. It does not tell an Arc builder which repository path to clone for either product, what configuration is required, what success looks like, or which evidence proves the end-to-end integration worked. The public Aomi docs should remain the canonical reference and be linked at the point of need.

### Recipes are prose directions, not executable product assets

The [Recipes page](https://arc-canteen.vercel.app/recipes) offers one guided Portal payment and labels the other two entries “Integration direction” and “Build direction.” The repository README similarly states that the payment is not an Arc x402 purchase, StableFX remains a direction, and a live run must still be completed before the walkthrough is called verified.

The caveats are honest, but they reveal the product gap: builders receive conceptual paths and commands copied from other tools, not a tested Aomi/Circle integration they can start from.

## What is absent from the repository

At the audited revision, the repository contains only a static Next.js site: route components, styling, two large content files, and simple copy/prompt components. Its only runtime dependencies are Next, React, and React DOM.

There is no:

- Execution Kit package, CLI, SDK adapter, or example application;
- Agent-in-a-Box package, React integration, headless client, or example API tool;
- call to `/v1/task/build` or the stateful Agent API;
- Circle Gateway x402 payer flow or Circle Agent Wallet execution adapter;
- environment template describing Aomi and Circle inputs;
- fixture showing an immutable transaction artifact;
- automated integration test or deterministic local smoke;
- recorded end-to-end run, ArcScan receipt, or frozen testnet proof;
- product-specific architecture diagram or contract showing which system owns planning, payment, approval, signing, and settlement;
- product readiness indicator separating shipped/live components from testnet or planned components.

`components/portal-embed.tsx` exists but is unused by the public routes. `components/prompt-builder.tsx` only constructs a natural-language transfer prompt; it does not run an Aomi or Circle integration.

## Required product assets before the site can become product-first

### Aomi x Circle Execution Kit

The repository needs one cloneable golden path that visibly performs this sequence:

1. Accept an Arc intent from an existing agent or application.
2. Purchase/build the exact unsigned plan through Aomi's Task API and Circle Gateway x402.
3. Display the frozen artifact, simulation evidence, constraints, price, expiry, and transaction bytes before signing.
4. Hand the same reviewed bytes to a Circle Agent Wallet integration for authorization and execution.
5. Verify the final Arc receipt independently and preserve it as demo evidence.

The asset must distinguish the Circle payment used to buy Aomi's planning service from the later transaction proposed by that service. Until the Task API has a deployed supported endpoint and the wallet handoff has been exercised, the site must label the path as testnet/development rather than “ready to use.”

Minimum repository evidence: runnable example, environment template, typed artifact schema or generated client, mock/offline fixture, integration smoke, expected console/UI output, and one recorded verified testnet run.

### Arc Agent-in-a-Box

The repository needs one lightweight application integration rather than another plugin-authoring manual. The golden path should let a builder provide an existing product API/tool surface and a product-specific mandate, then embed the hosted Aomi agent in their application.

It should demonstrate:

1. A small headless TypeScript client or React integration using the stateful Agent API.
2. Session reuse, progress/events, and typed pending actions.
3. One product-specific API tool and system prompt, not a generic chat demo.
4. An explicit review/sign boundary owned by the application or Circle wallet.
5. A successful action and a deliberately refused action, with the result returned to the same session.

Minimum repository evidence: example app, reusable integration module, sample tool/API contract, local configuration, mock mode, end-to-end smoke, and a short recorded run. Telegram/Discord can remain later surfaces; the first path should prove “add an Arc agent to my existing web app.”

## Required site journey

The information architecture should follow product selection rather than documentation taxonomy:

1. **Hero:** name both products and ask “Do you already have an agent?”
2. **Choose a path:**
   - Yes → Aomi x Circle Execution Kit.
   - No, I have an app/API → Arc Agent-in-a-Box.
3. **Each product page:** outcome, 3–5 step architecture, exact custody/signing boundary, live readiness, “Run locally,” “Open example,” and “Inspect proof.”
4. **Proof before claims:** show the artifact/session output, rejection boundary, and Arc receipt from the golden path.
5. **Then explain:** link to canonical Aomi, Circle, Arc, and Canteen references only where the runnable flow needs them.
6. **Hackathon support:** map Tameion requests and judging criteria to the two products after builders can run them; keep registration and submission as a secondary event section.

The current “Stack,” “Requests,” “Quickstart,” “Recipes,” and “Build” navigation can be replaced by “Execution Kit,” “Agent-in-a-Box,” “Examples,” “Proof,” and “Reference.” The existing ecosystem matrix and security caveats should survive as concise boundary/reference sections, not lead the experience.

## Keep, compress, replace

| Current material | Treatment | Reason |
| --- | --- | --- |
| Custody, simulation, policy, and receipt caveats | Keep near both golden paths | These are the strongest and most accurate parts of the current site. |
| Canteen/Circle/Arc ownership matrix | Compress into one reference section | Useful after product selection; costly as the first mental model. |
| Tameion requests and judging | Keep as downstream use-case mapping | Helps project selection but does not make Aomi runnable. |
| General CLI/Skills/MCP/SDK/Build/Telegram manual | Replace with links to canonical docs | It is broad, drift-prone, and duplicates `aomi.dev/docs`. |
| Portal payment walkthrough | Replace as the primary quickstart | It does not join Aomi planning to Circle wallet execution. |
| StableFX and guarded-execution prose recipes | Reframe as examples only after runnable kits exist | “Direction” pages cannot carry the product promise. |
| Product examples (Somm, Kuroko, trader, World Markets) | Keep selectively as credibility | They should not substitute for Arc/Circle source code and proof. |

## Acceptance boundary for the future site update

The site becomes product-first only when a new Arc builder can choose one product, clone one owned example, configure documented test credentials, run the golden path, observe the intended refusal/review boundary, and inspect a concrete artifact or chain receipt without reconstructing the flow from general Aomi documentation.
