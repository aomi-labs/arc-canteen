/** Copy and links for the Tameion builder resource. Keep product claims scoped to verified behavior. */
export const site = {
  name: "Build with Aomi at Tameion",
  domain: "arc-canteen.aomi.dev",
  description:
    "A builder guide to onchain execution with Aomi on Arc. Start with a transaction, then build for the five Tameion requests for builders.",
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
  },
  nav: [
    { label: "Requests", href: "/#build" },
    { label: "Quickstart", href: "/quickstart" },
    { label: "Recipes", href: "/recipes" },
    { label: "Build", href: "/build" },
  ],
  event: {
    label: "For Tameion builders",
    dates: "Sep 27 – Oct 10, 2026",
    note: "Hosted by Canteen · invite-only · $40k in prizes · building on Arc",
  },
  home: {
    headlineLines: ["Your agent decides.", "Aomi makes the action executable."],
    intro:
      "A financial agent can decide. Aomi turns that decision into a transaction you can simulate, check, and hand to a signer. Start with one action you can inspect.",
    startLabel: "Start with one transaction",
    buildLabel: "See where Aomi fits",
    figuresEyebrow: "What Aomi supports on Arc",
    figures: [
      { value: "2 networks", label: "Arc mainnet (5042) and testnet (5042002), supported today" },
      { value: "6 tools", label: "StableFX, from quote to settlement status" },
      { value: "0 keys held", label: "Non-custodial. Your signer keeps authority." },
    ],
    visual: {
      header: "One proposed action",
      eyebrow: "The execution path",
      instructionLabel: "Agent intent",
      instruction: "“Pay the approved vendor on Arc.”",
      instructionNote: "A decision is not yet a transaction.",
      harnessLabel: "Aomi",
      harness: "Build the exact action. Simulate it. Check what you configured.",
      harnessSteps: ["your rule", "the signer", "the receipt"],
      outputLabel: "Then you",
      output: "Allow or refuse it. The wallet signs. Arc settles. Keep the explorer URL.",
      caption: "A mechanism illustration. No transaction has been sent here.",
    },
    problemEyebrow: "The problem",
    problemTitle: "A valid payment can still pay the wrong person.",
    problemBody:
      "A ledger can balance while a vendor address is wrong, an invoice is duplicated or a retry pays twice. Builders need checks tied to the intended action, and evidence of what actually happened onchain.",
    problemSource: "From Canteen’s Agents and Ledgers research",
    problemPoints: [
      { label: "01", title: "Wrong recipient", detail: "Compare the proposed address with an approved payee before signing." },
      { label: "02", title: "Wrong action", detail: "Check the exact call, amount and result against the business rule." },
      { label: "03", title: "Unclear outcome", detail: "Treat the receipt as evidence. A returned hash is not settlement." },
    ],
    jobEyebrow: "Where Aomi fits",
    jobTitle: "One action. Your rule. Their signature. A receipt.",
    jobBody:
      "Circle and Arc already give you the wallet, the USDC, and settlement. You write the business rule. Aomi turns the agent’s decision into a transaction you can simulate, check, and hand to the signer.",
    jobSteps: [
      { label: "01", title: "The agent proposes", detail: "One payment, one reserve move, or one refusal. A decision is not a transaction." },
      { label: "02", title: "Aomi constructs it", detail: "The exact call, chain, recipient, and amount, then a simulation of that payload." },
      { label: "03", title: "Your rule decides", detail: "Invoice, vendor, milestone, budget, or risk. A prompt cannot talk past a check you wrote in code." },
      { label: "04", title: "The wallet signs", detail: "The signer keeps the keys. Aomi does not give the agent authority to sign." },
      { label: "05", title: "Arc settles", detail: "Commit Service follows the action to a confirmed result. A hash is not settlement." },
      { label: "06", title: "You keep the receipt", detail: "Chain, status, sender, recipient, and value, checked on an explorer you do not control." },
    ],
    jobOwns: [
      { title: "Circle and Arc", detail: "Wallets, USDC and EURC, payment rails, and settlement." },
      { title: "You", detail: "Who may be paid, how much, and whether this action already happened." },
      { title: "Aomi", detail: "Construction, simulation, the policy check, and the path to a signer." },
    ],
    ideasEyebrow: "Five requests for builders",
    ideasTitle: "Pick one money problem. Finish the flow.",
    ideasBody:
      "Tameion’s five requests are prompts, not tracks. A project has to run on Arc, with USDC actually moving, for a business that is using it. Your own company counts. A synthetic dataset does not.",
    recipeEyebrow: "Recipes",
    recipeTitle: "A first action, then a real application.",
    recipeBody:
      "One guided payment flow you can try in the Portal. Two more directions for teams with their own product or integration access.",
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
    passphrase: "DIRECTx42490",
    deadline: "October 10, 11:59 PM ET",
    network:
      "Aomi supports Arc mainnet, chain ID 5042, and Arc Testnet, chain ID 5042002. Tameion’s ARC CLI starts on a Canteen-hosted testnet, so this walkthrough uses 5042002. Test USDC counts. Real USDC on mainnet counts more.",
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
    start: [
      {
        title: "Register",
        body: "Register on Luma if you have not already. Enter the passphrase DIRECTx42490 for priority access. The GitHub and Discord handles you enter are how submissions are matched.",
        href: "https://luma.com/ivroypr5",
        hrefLabel: "Register on Luma",
      },
      {
        title: "Join the Discords",
        body: "Say hello in the Canteen Discord. Join the Arc builder Discord and mention Canteen and Tameion in onboarding. If that invite fails, ping @kdrohan in the Canteen Discord.",
        href: "https://discord.gg/bDaEfsSqc8",
        hrefLabel: "Canteen Discord",
        secondHref: "https://discord.com/invite/buildonarc",
        secondLabel: "Arc builder Discord",
      },
      {
        title: "Install the ARC CLI",
        body: "This is Tameion’s own start. It includes RPC access to a Canteen-hosted Arc testnet, plus Arc repos and docs as agent context.",
        href: "https://github.com/the-canteen-dev/ARC-cli",
        hrefLabel: "ARC CLI repo",
        code: "uv tool install git+https://github.com/the-canteen-dev/ARC-cli",
      },
      {
        title: "Install the Circle CLI",
        body: "Circle’s CLI covers agent wallets, x402-compatible payments, and crosschain USDC. It needs Node.js v20.18.2 or newer.",
        href: "https://developers.circle.com/agent-stack/circle-cli",
        hrefLabel: "Circle CLI docs",
        code: "npm install -g @circle-fin/cli",
      },
      {
        title: "Read Agents and Ledgers",
        body: "A ledger can balance while the vendor, the invoice, or a retry is wrong. Read it before the agent posts a payment.",
        href: "https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html",
        hrefLabel: "Agents and Ledgers",
      },
    ],
  },
  quickstart: {
    eyebrow: "One reviewed payment",
    headline: "Make one payment. Inspect every boundary.",
    intro:
      "Ask Aomi to prepare one transfer, stop before signing, refuse it once, then approve a fresh one and check the receipt. This walkthrough uses Arc Testnet, chain ID 5042002. Aomi also supports Arc mainnet, chain ID 5042. Test USDC counts. Real USDC on mainnet counts more. This is a guided workflow, not a recorded live run.",
    status: "Not a recorded live run",
    beforeTitle: "Before you begin",
    importantTitle: "The important distinction",
    distinctions: [
      { term: "Constructed", definition: "the action is prepared." },
      { term: "Simulated", definition: "the exact payload was rehearsed against a particular state." },
      { term: "Authorized", definition: "the active wallet policy permitted signing." },
      { term: "Confirmed", definition: "the chain accepted the transaction. Verify the receipt independently." },
    ],
    prerequisites: [
      "An EVM wallet you control, set to Arc Testnet, chain ID 5042002. The backend alias arc is mainnet (5042). Testnet is arc-testnet.",
      "Test USDC for the transfer and for gas. Type the amount in USDC, which is 6 decimal places. Arc’s native balance uses 18-decimal atomic units.",
      "A second test address, or your own address for a small self-transfer.",
    ],
    steps: [
      {
        number: "01",
        title: "Open the Portal",
        body: "Open chat.aomi.dev. Select Arc Testnet and read the chain ID before you continue. It must be 5042002. If the picker only says Arc, that is mainnet. If Arc Testnet is not listed, stop and ask in Discord instead of continuing on another network.",
        kind: "interface",
      },
      {
        number: "02",
        title: "Connect a test wallet",
        body: "Connect a wallet you control. Fund it with test USDC. A read-only question should work before any signing request.",
        kind: "setup",
      },
      {
        number: "03",
        title: "Check the balance",
        body: "Ask Aomi to read your USDC balance on Arc Testnet. Confirm the account and the chain match your wallet.",
        kind: "prompt",
        code: "What is my USDC balance on Arc Testnet?",
      },
      {
        number: "04",
        title: "Describe one transfer",
        body: "Enter a real test recipient. Ask Aomi to prepare and simulate a small transfer, then stop for review. Do not use a placeholder address.",
        kind: "prompt-builder",
      },
      {
        number: "05",
        title: "Inspect the simulation",
        body: "Compare chain, recipient, amount, gas and any warnings. A passing simulation is evidence about one payload against one view of state, not proof that the payee is correct.",
        kind: "review",
      },
      {
        number: "06",
        title: "Exercise the boundary",
        body: "Reject the request once to see the manual approval path. Prepare a fresh request, inspect it again, and approve only when the details match your intent.",
        kind: "decision",
      },
      {
        number: "07",
        title: "Confirm settlement",
        body: "Aomi’s Commit Service follows the action from authorization through a confirmed result. A wallet signature or a transaction hash alone is not settlement.",
        kind: "outcome",
      },
      {
        number: "08",
        title: "Verify independently",
        body: "Open the transaction on ArcScan and check the chain, status, sender, recipient and value. Keep that URL as the receipt for your demo.",
        kind: "receipt",
      },
    ],
    caveatTitle: "What this demonstrates, and what it doesn’t",
    caveatBody:
      "This walkthrough exercises manual wallet approval for one testnet action. Your own invoice matching, vendor verification, spending policy and retry rules must be implemented and tested separately. Do not call a transaction safe merely because simulation passed.",
    nextTitle: "Now turn the payment into a project.",
    nextBody:
      "Attach an invoice, vendor record, spending rule or service request. Make a valid action pass and an invalid one stop before signing.",
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
      intro:
        "Start with a user-approved transfer through the Portal. Add your own invoice, vendor or service check before the payment is proposed. The final receipt proves execution, not whether the invoice was legitimate.",
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
        "This worked guide covers a manual USDC transfer. An automated HTTP 402 purchase needs a separate x402 payer integration and authorization model. Circle publishes an Arc x402 sample; this page does not claim that the Portal transfer is that integration.",
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
          { label: "Requests", href: "/#build" },
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
