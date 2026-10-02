/** Copy and links for the Tameion builder resource. Keep product claims scoped to verified behavior. */
export const site = {
  name: "Build with Aomi at Tameion",
  domain: "arc-canteen.aomi.dev",
  description:
    "Two honest Arc payment lanes: Aomi Execution with a builder-held EOA, or an Aomi-hosted tool calling a developer API with a tested Circle settlement adapter.",
  links: {
    aomi: "https://aomi.dev/",
    portal: "https://chat.aomi.dev/",
    buildPlatform: "https://build.aomi.dev/",
    docs: "https://aomi.dev/docs/",
    transactionPipeline: "https://aomi.dev/docs/concepts/transaction-pipeline",
    permissionModel: "https://aomi.dev/docs/security/permission-model",
    transactionSafety: "https://aomi.dev/docs/security/transaction-safety",
    appQuickstart: "https://aomi.dev/docs/build/first-app",
    mcpGuide: "https://aomi.dev/docs/guides/mcp",
    skillsGuide: "https://aomi.dev/docs/guides/skills",
    github: "https://github.com/aomi-labs",
    discord: "https://discord.gg/uk5ZAMuepJ",
    canteenDiscord: "https://discord.gg/bDaEfsSqc8",
    arcDiscord: "https://discord.com/invite/buildonarc",
    arcCli: "https://github.com/the-canteen-dev/ARC-cli",
    arcCliDocs: "https://arc-node.thecanteenapp.com",
    circleCliDocs: "https://developers.circle.com/agent-stack/circle-cli",
    arcFintech: "https://github.com/circlefin/arc-fintech",
    arcEscrow: "https://github.com/circlefin/arc-escrow",
    arcExplorer: "https://testnet.arcscan.app/",
    arcMainnetExplorer: "https://explorer.arc.io",
    circleFaucet: "https://faucet.circle.com/",
    circleAgentStack: "https://developers.circle.com/agent-stack",
    circleX402: "https://github.com/circlefin/arc-x402-circle-wallets",
    stablefxSource: "https://github.com/aomi-labs/aomi-sdk/tree/publish/apps/stablefx",
    stablefxAccess: "https://www.circle.com/join-stablefx",
    tameion: "https://tameion.thecanteenapp.com/",
    tameionRegister: "https://luma.com/ivroypr5",
    tameionSubmit: "https://forms.gle/BBWrdfuircrKiG2i6",
    canteenResearch:
      "https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html",
    arcCanteen: "https://arc-canteen.dev/",
    arcAgentic: "https://docs.arc.network/build/agentic-economy",
    aomiSigning: "https://aomi.dev/docs/reference/client-cli/transactions-and-signing",
    circleSkills: "https://agents.circle.com/skills/setup.md",
  },
  nav: [
    { label: "Paths", href: "/#paths" },
    { label: "Reference", href: "/build" },
    { label: "Quickstart", href: "/quickstart" },
    { label: "Recipes", href: "/recipes" },
    { label: "Tameion", href: "/#tameion" },
  ],
  event: {
    label: "For Tameion builders",
    dates: "Sep 27 – Oct 10, 2026",
    note: "Hosted by Canteen · invite-only · $40k in prizes · building on Arc",
  },
  home: {
    headlineLines: ["Choose your starting point.", "Ship one Arc payment."],
    intro:
      "There are two supported lanes, not one five-command pipeline. Use Aomi Host to put an agent in front of an API you own. Use Aomi Execution when your agent already exists. Circle’s agent wallet and a builder-held EOA are different signers. This guide does not pretend they are interchangeable.",
    startLabel: "Choose a path",
    buildLabel: "Read the reference",
    ideasEyebrow: "Five requests for builders",
    ideasTitle: "Pick one money problem. Finish the flow.",
    ideasBody:
      "Tameion’s five requests are prompts, not tracks. A project has to run on Arc, with USDC actually moving, for a business that is using it. Your own company counts. A synthetic dataset does not.",
    recipeEyebrow: "Recipes",
    recipeTitle: "A first action, then a real application.",
    recipeBody:
      "One Aomi Execution walkthrough with a builder-held EOA. Two more directions for teams with their own product or integration access.",
    closeTitle: "Start small enough to verify.",
    closeBody:
      "One reviewed action, one deliberate refusal, and one confirmed result tell a stronger story than a dashboard full of untested promises.",
  },
  rfbs: [
    {
      number: "01",
      name: "Intelligent Business Treasury",
      question: "How does a business keep cash available while deciding what to allocate or reserve?",
      aomi: "You decide which cash to reserve. Aomi constructs and simulates that one movement. Start from circlefin/arc-fintech, including USYC. A USDC and EURC trade is the StableFX path, and it needs a Circle credential.",
      primitive: "Treasury · USYC · reserve move",
      firstBuild: "Forecast one cash need, then move one idle balance only when that rule says so.",
      sampleLabel: "circlefin/arc-fintech",
      sampleHref: "https://github.com/circlefin/arc-fintech",
      recipeLabel: "StableFX path",
      recipe: "/recipes/stablefx",
    },
    {
      number: "02",
      name: "AP/AR Automation Agent",
      question: "Can an agent read invoices and pay the right vendor only once?",
      aomi: "You verify the invoice, the payee, and that this invoice was not already paid. Aomi constructs the USDC transfer and stops for review.",
      primitive: "USDC payment · recipient check · receipt",
      firstBuild: "Reject a duplicate invoice or a changed vendor address.",
      recipeLabel: "Worked payment",
      recipe: "/recipes/agentic-payment",
    },
    {
      number: "03",
      name: "Contractor & Vendor Network Manager",
      question: "How should verified work turn into an authorized milestone payment?",
      aomi: "You own reputation, discovery, and the milestone check. Aomi covers the reviewed transfer after that check. Start from circlefin/arc-escrow.",
      primitive: "Escrow · milestone · reviewed payment",
      firstBuild: "Release one payment after a verified milestone.",
      sampleLabel: "circlefin/arc-escrow",
      sampleHref: "https://github.com/circlefin/arc-escrow",
      recipeLabel: "Reviewed payment",
      recipe: "/recipes/agentic-payment",
    },
    {
      number: "04",
      name: "Autonomous Business Operator",
      question: "Which obligations can an agent pay without losing sight of the company’s cash?",
      aomi: "You set the budget rule. Start from circlefin/arc-x402-circle-wallets when the agent pays an x402 service from its own Circle wallet. A transfer you review in the Aomi Portal is a different payment. Aomi runs the bounded execution after your rule.",
      primitive: "Budget · x402 or reviewed payment",
      firstBuild: "Run one workflow from money in, to one allowed payment, to a log.",
      sampleLabel: "circlefin/arc-x402-circle-wallets",
      sampleHref: "https://github.com/circlefin/arc-x402-circle-wallets",
      recipeLabel: "Reviewed payment",
      recipe: "/recipes/agentic-payment",
    },
    {
      number: "05",
      name: "Compliance Intelligence Agent",
      question: "How can changing counterparty risk affect a payment before it is sent?",
      aomi: "You write the screening rule that allows, refuses, or escalates. Aomi prepares the action and stops it when that rule refuses. Simulation is not a compliance decision.",
      primitive: "Policy input · guarded action · evidence",
      firstBuild: "Block one previously approved recipient after its risk status changes.",
      recipeLabel: "Guarded execution",
      recipe: "/recipes/safe-execution",
    },
  ],
  tameion: {
    network:
      "Aomi supports Arc mainnet, chain ID 5042, and Arc Testnet, chain ID 5042002. This walkthrough uses 5042002. Test USDC counts. Real USDC on mainnet counts more.",
    submit:
      "Submit by October 10, 11:59 PM ET. You need a public GitHub repo and a recorded demo under 3 minutes. A live URL is encouraged. You can submit more than once. There is no demo day. Judges review the form, the repo, and the video.",
    traction:
      "They will ask how many businesses you have onboarded, how much value the agent moved, and what problem you are solving. Your own company counts. A synthetic dataset does not.",
    prizes:
      "$32.5k is ranked: $10k for first, $7.5k for second, and $5k for each of three third-place teams. $7.5k is split across 10–12 standout teams, about $650–$750 each.",
    judging: [
      { weight: "30%", label: "Agentic sophistication", detail: "How much the agent decides, and whether it can explain why." },
      { weight: "30%", label: "Traction", detail: "Real use during the event. Test USDC counts. Mainnet USDC counts more." },
      { weight: "20%", label: "Circle tool usage", detail: "Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, contracts, USDC and EURC." },
      { weight: "20%", label: "Innovation", detail: "A new approach beats a polished repeat of a sample." },
    ],
  },
  quickstart: {
    eyebrow: "Aomi Execution · EOA lane",
    headline: "Queue one Action. Simulate it. Sign once.",
    intro:
      "This is the supported Aomi Execution lane on Arc Testnet: Canteen provisions a local EOA and RPC, Aomi queues and simulates an Action, and the key you hold signs with --eoa. Circle’s agent wallet is a different lane and is not used here. This is not a recorded live run.",
    status: "EOA lane · not a recorded live run",
    beforeTitle: "Install the two local tools",
    setup: [
      {
        title: "Canteen bench",
        body: "Login provisions the Arc Testnet wallet and RPC. The private key is printed only in your terminal. Do not paste it into this site or the Portal.",
        code: "uv tool install arc-canteen\narc-canteen login\narc-canteen wallet\narc-canteen rpc-url",
      },
      {
        title: "Aomi client",
        body: "The client talks to Aomi, stores session state locally, and signs locally. Account login does not give Aomi your private key.",
        code: "npm install -g @aomi-labs/client\naomi --version\naomi account login",
      },
    ],
    importantTitle: "The important distinction",
    distinctions: [
      { term: "Constructed", definition: "the action is prepared." },
      { term: "Simulated", definition: "the exact payload was rehearsed against a particular state." },
      { term: "Authorized", definition: "the active wallet policy permitted signing." },
      { term: "Confirmed", definition: "the chain accepted the transaction. Verify the receipt independently." },
    ],
    prerequisites: [
      "The public address and private key from your Canteen wallet. Keep the key local. The backend alias arc is mainnet (5042); this guide uses testnet chain ID 5042002.",
      "Test USDC for the transfer and for gas. Type the amount in USDC, which is 6 decimal places. Arc’s native balance uses 18-decimal atomic units.",
      "A second test address, or your own address for a small self-transfer.",
    ],
    steps: [
      {
        number: "01",
        title: "Choose the signer",
        body: "This lane uses the Canteen EOA. Set its private key in your local environment without committing it or pasting it into a website. Do not use a Circle agent-wallet address here.",
        kind: "setup",
      },
      {
        number: "02",
        title: "Queue one Action",
        body: "Use the Canteen wallet’s public address and a real test recipient. The agent must return an Action awaiting response before any tx command can work.",
        kind: "command",
        code: "aomi chat \"Send 0.01 test USDC on Arc Testnet to 0xRecipient\" --new-session --public-key 0xYourAddress --chain 5042002",
      },
      {
        number: "03",
        title: "Read the Action id",
        body: "List pending Actions. The docs use action-1 as an example; use the id your own session prints.",
        kind: "command",
        code: "aomi tx list",
      },
      {
        number: "04",
        title: "Simulate that Action",
        body: "Rehearse the exact pending Action before signing. Replace action-1 if your session printed a different id.",
        kind: "command",
        code: "aomi tx simulate action-1",
      },
      {
        number: "05",
        title: "Inspect the simulation",
        body: "Compare chain, sender, recipient, amount, gas and warnings against your application record. A passing simulation does not prove that the invoice or payee is legitimate.",
        kind: "review",
      },
      {
        number: "06",
        title: "Exercise the boundary",
        body: "Refuse the first attempt by not signing it. Change the recipient, queue a new Action, and show that your application policy rejects it before signing.",
        kind: "decision",
      },
      {
        number: "07",
        title: "Sign the approved Action",
        body: "Set PRIVATE_KEY in your terminal, sign the approved id with --eoa, then remove the variable. Account abstraction is not available on Arc.",
        kind: "command",
        code: "aomi tx sign action-1 --eoa\nunset PRIVATE_KEY",
      },
      {
        number: "08",
        title: "Confirm and verify",
        body: "Wait for the confirmed result, then open the transaction on ArcScan. Check chain, status, sender, recipient, and value. Keep the URL with the invoice id.",
        kind: "receipt",
      },
    ],
    caveatTitle: "What this demonstrates, and what it doesn’t",
    caveatBody:
      "This walkthrough exercises Aomi Execution with a builder-held EOA. It does not exercise a Circle agent wallet. Your own invoice matching, vendor verification, spending policy and retry journal must still run before signing.",
    nextTitle: "Now inspect the tested policy boundary.",
    nextBody:
      "The reference implementation shows an approved recipient, duplicate-invoice rejection, Circle adapter arguments, and retry protection.",
  },
  recipes: [
    {
      slug: "agentic-payment",
      number: "01",
      label: "Guided workflow",
      title: "Agentic USDC payment",
      teaser: "From a payment request to a reviewed Arc Testnet transfer and a checkable receipt.",
      rfbs: "AP/AR · Vendor network · Business operator",
      eyebrow: "Recipe 01 · worked guide",
      headline: "Pay the right party. Then prove it happened.",
      fit: "Supported lane: Aomi Execution, then a builder-held EOA with --eoa. This recipe does not use a Circle agent wallet.",
      intro:
        "Start with a user-approved Aomi Action signed by the builder-held EOA. Add your own invoice, vendor or service check before the payment is proposed. The final receipt proves execution, not whether the invoice was legitimate.",
      requirements: [
        "An Arc Testnet wallet with test USDC and enough USDC for gas.",
        "A recipient address verified against a source outside the agent prompt.",
        "A document or service request with a stable identifier you control.",
      ],
      steps: [
        {
          title: "Define the payment decision",
          body: "Represent one invoice or service purchase with an ID, expected amount and known recipient. Store this outside the agent conversation.",
        },
        {
          title: "Validate before asking to pay",
          body: "Your application checks the invoice or service request, the approved payee and whether this ID has already been paid. A prompt saying ‘avoid duplicates’ is not enforcement.",
        },
        {
          title: "Prepare the action in Aomi",
          body: "Follow the Arc Testnet quickstart to ask Aomi to prepare and simulate a small transfer. Use the verified recipient and amount from your application.",
        },
        {
          title: "Review and authorize",
          body: "Compare the exact recipient and value to your payment record. Exercise one rejected request, then approve a fresh valid request in the configured manual wallet flow.",
        },
        {
          title: "Record the outcome",
          body: "Only mark the invoice or service request paid after a confirmed result. Keep its ID, transaction hash and explorer URL together. A timed-out response calls for reconciliation, not a blind second payment.",
        },
      ],
      verification:
        "Show one allowed payment and one refused payment. Confirm the allowed transaction independently in ArcScan, then demonstrate that the same invoice ID will not be submitted twice by your application.",
      boundary:
        "This worked guide covers a manually reviewed Aomi Action signed by a builder-held EOA. An automated HTTP 402 purchase needs a separate x402 payer integration and authorization model. Circle publishes an Arc x402 sample; this page does not claim that the EOA transfer is that integration.",
    },
    {
      slug: "stablefx",
      number: "02",
      label: "Integration direction",
      title: "StableFX on Arc",
      teaser: "Use Aomi’s six StableFX tools to understand the RFQ, signing and funding path.",
      rfbs: "Intelligent Business Treasury",
      eyebrow: "Recipe 02 · integration direction",
      headline: "An FX trade is more than a swap button.",
      fit: "Integration direction: an Aomi App with a Circle StableFX credential. The Canteen bench wallet does not unlock these tools.",
      intro:
        "The StableFX App lives on the aomi-sdk publish branch, not main. It is scoped to Arc and calls Circle’s authenticated quote, trade and funding APIs for a USDC and EURC trade. There is no key-free mode. The six tools are stablefx_quote, stablefx_accept_quote, stablefx_create_trade, stablefx_prepare_funding, stablefx_fund_trade and stablefx_trade_status.",
      requirements: [
        "Access to Circle StableFX and the matching test or live API credential.",
        "The selected Arc network, its supported source token and a compatible wallet.",
        "Test USDC and suitable permissions for a testnet run.",
      ],
      steps: [
        {
          title: "Check availability",
          body: "Confirm StableFX App access on your Aomi environment and your Circle account. Do not substitute App visibility for Circle RFQ eligibility.",
        },
        {
          title: "Quote and accept",
          body: "Discover the App’s live tool schemas. Use stablefx_quote for an indicative quote and stablefx_accept_quote for a fresh tradable quote.",
        },
        {
          title: "Review wallet signing",
          body: "The App validates the Arc network, token and Permit2 domain and spender before it routes Circle’s typed signing request. The signer controls authorization.",
        },
        {
          title: "Trade, fund, and check status",
          body: "stablefx_create_trade, stablefx_prepare_funding and stablefx_fund_trade are separate from stablefx_trade_status. Report the quote, the funding and the settlement as separate states.",
        },
      ],
      verification:
        "Use a Circle-authorized test environment to capture a full quote-to-settlement lifecycle. Do not show an illustrative UI as a completed institutional FX trade.",
      boundary:
        "A credential is required at tool-call time. The public stewardfx site describes an illustrative flow with access pending; it is not proof of a completed StableFX transaction.",
    },
    {
      slug: "safe-execution",
      number: "03",
      label: "Build direction",
      title: "Guarded execution",
      teaser: "Put a business rule between an agent’s proposal and the wallet’s authority.",
      rfbs: "Compliance",
      eyebrow: "Recipe 03 · build direction",
      headline: "Let the agent propose. Make the rule decide.",
      fit: "Shared boundary: your application rule approves a typed PaymentIntent before either the Aomi EOA lane or Circle adapter can settle it.",
      intro:
        "Aomi can construct and simulate the action; your application owns the business rule. Start with one address or amount check that has an unambiguous allowed and refused outcome. Teams sometimes call this gate a Fuzzer. That name is a project direction, not a shipped Aomi product.",
      requirements: [
        "A written rule with a known data source, such as an approved payee list.",
        "A dedicated test wallet and one small Arc Testnet action.",
        "A clear result to show when the rule blocks an action.",
      ],
      steps: [
        {
          title: "Write the rule in code",
          body: "For example, allow one vendor address and refuse all other recipients. Compare against trusted application data, not text returned by the model.",
        },
        {
          title: "Prepare a valid and invalid action",
          body: "Change only the recipient between the two proposed transfers. Keep the amount, chain and input context the same.",
        },
        {
          title: "Check the exact payload",
          body: "Validate the intended recipient, contract and amount around the simulated transaction. Reject the invalid action before it reaches signing.",
        },
        {
          title: "Confirm one and explain the other",
          body: "Authorize the valid testnet action and follow it to a receipt. Show the precise rule that blocked the other action.",
        },
      ],
      verification:
        "A reviewer can reproduce both outcomes and inspect the rule. If no custom policy has been implemented, show the native simulation and manual-signing boundary without claiming vendor allowlisting is built in.",
      boundary:
        "Simulation can show whether a payload executes against a pinned state. It cannot independently establish whether a vendor is real, an invoice is legitimate or a route is economically optimal.",
    },
  ],
  footer: {
    title: "Have one action in mind?",
    body: "Bring the project, the target chain and the transaction you want to test. Start with a small proof and make the checks visible.",
    attribution: "An Aomi resource for builders at Tameion. Tameion is hosted by Canteen.",
    columns: [
      {
        title: "Start",
        links: [
          { label: "Quickstart", href: "/quickstart" },
          { label: "Recipes", href: "/recipes" },
          { label: "Requests", href: "/#requests" },
          { label: "Reference", href: "/build" },
        ],
      },
      {
        title: "Aomi",
        links: [
          { label: "Portal", href: "https://chat.aomi.dev/" },
          { label: "Aomi Build", href: "https://build.aomi.dev/" },
          { label: "Docs", href: "https://aomi.dev/docs/" },
          { label: "GitHub", href: "https://github.com/aomi-labs" },
          { label: "Discord", href: "https://discord.gg/uk5ZAMuepJ" },
        ],
      },
      {
        title: "Arc and Circle",
        links: [
          { label: "Circle Agent Stack", href: "https://developers.circle.com/agent-stack" },
          { label: "Canteen bento", href: "https://arc-canteen.dev/" },
          { label: "ArcScan testnet", href: "https://testnet.arcscan.app/" },
          { label: "Circle faucet", href: "https://faucet.circle.com/" },
          { label: "Transaction pipeline", href: "https://aomi.dev/docs/concepts/transaction-pipeline" },
        ],
      },
      {
        title: "Tameion",
        links: [
          { label: "Register", href: "https://luma.com/ivroypr5" },
          { label: "Submit a project", href: "https://forms.gle/BBWrdfuircrKiG2i6" },
          { label: "Tameion", href: "https://tameion.thecanteenapp.com/" },
          { label: "Agents and Ledgers", href: "https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html" },
        ],
      },
    ],
  },
} as const;

export type Recipe = (typeof site.recipes)[number];
