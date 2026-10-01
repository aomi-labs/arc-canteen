/**
 * Full developer reference for the Build page, drawn from the Aomi developer
 * handbook (TRUST404 Demo Day edition). Evergreen content only: event-specific
 * items (Demo Day schedule, venue, Drift Hunter, roadmap previews) are out.
 * Version-sensitive claims carry their own caveats inline.
 */
export const build = {
  eyebrow: "Developer reference",
  headline: "Build on Aomi.",
  intro:
    "One sentence to remember: your agent decides, the policy checks, the user signs. If you can say which of those three your code is responsible for, you are an Aomi developer.",
  pluginNote:
    "The thing you write is a plugin: a small Rust crate that wraps your external APIs as tools the agent can call, with a system prompt that shapes how it uses them. The thing you ship is an App: the deployed plugin, loaded onto the runtime next to the default agent, with no restart. Users pick an App in the portal, the CLI and the Build platform.",
  benefits: [
    {
      title: "Non-custodial, always",
      summary: "Users keep their keys. The agent can propose an action. It cannot sign one.",
      body: "Your users keep their own keys. The runtime never holds one. Every wallet has a kernel-enforced signing mode (denied, manual, client_auto, auto) that changes only through a wallet-signed permit. The agent can compose and simulate any transaction, but can only ever propose it.",
    },
    {
      title: "Simulate before sign",
      summary: "The action is rehearsed on a fork of live state before anyone is asked to approve.",
      body: "Every transaction is rehearsed on a fork of live chain state before anyone is asked to approve. The agent shows the real outcome before it commits. A failed simulation never reaches the wallet.",
    },
    {
      title: "Policy in code, not in the prompt",
      summary: "Chains, contracts, recipients and amounts are limited in code. The agent cannot talk its way past a guard.",
      body: "Guards restrict chains, contracts, function selectors, approval spenders, and the recipient fields that can redirect funds. Per-call USD caps. A rule the agent cannot argue with.",
    },
    {
      title: "One integration, many venues",
      summary: "Arc sits next to Ethereum, Base, Solana and the other networks Aomi already runs. You build against one interface.",
      body: "Ethereum, Arc, Base, Arbitrum, OP Mainnet, Polygon, Linea, Monad, Robinhood Chain, MegaETH and Solana. Integrations include Across, CoW Protocol, dYdX, GMX, Morpho, Yearn and Circle StableFX. You build against one interface.",
    },
    {
      title: "Hosted runtime, no infra",
      summary: "You write the tools and the prompt. Aomi runs the loop. Account abstraction is not available on Arc.",
      body: "You write tools and a prompt. Aomi runs the model loop, persistent threads, App loading, Solana bundles, and asynchronous tasks that can outlive the conversation. Account abstraction (EIP-7702 and 4337) is available only on chains where Aomi supports it. It is not available on Arc.",
    },
    {
      title: "Every surface from one deployment",
      summary: "The same App can run in the Portal, a widget, the CLI, Skills, MCP, the API and Telegram.",
      body: "The portal at chat.aomi.dev, the widget in your frontend, the CLI, Skills and MCP for coding agents, the REST API, and a hosted Telegram bot. Some Apps set a flat tool price and settle that charge in USDC through x402. That billing path is separate from a wallet transfer you review in the Portal.",
    },
  ],
  doors: [
    { door: "Portal", who: "Anyone. Try an App with a wallet.", href: "/quickstart", section: "Quickstart" },
    { door: "Client CLI", who: "Developers and scripts. Chat, stage, simulate, sign from a terminal.", href: "#cli", section: "CLI" },
    { door: "Agent Skills", who: "Claude Code, Cursor, Codex, Gemini CLI. The agent drives the CLI on your machine.", href: "#skills", section: "Skills" },
    { door: "MCP", who: "The same coding agents, connected to Aomi's server instead.", href: "#mcp", section: "MCP" },
    { door: "Rust SDK and Build platform", who: "App builders. Write tools, deploy, activate.", href: "#rust-sdk", section: "Rust SDK" },
    { door: "Widget, Client SDK, REST API, Telegram", who: "Product teams. Put an App in front of users.", href: "#widget", section: "Widget" },
  ],
  cli: {
    title: "The client CLI",
    intro:
      "The aomi command ships inside the @aomi-labs/client npm package. It talks to a running Aomi backend (https://chat.aomi.dev by default), keeps a session across runs, stages transactions, simulates them, and signs locally. Humans and coding agents use the same commands. This is the client CLI, not the builder toolchain; that is aomi-build.",
    installTitle: "Install and verify",
    installCode: [
      "npm install -g @aomi-labs/client",
      "aomi --version",
      "aomi account login  # browser device auth, binds sessions to your account",
      'aomi --prompt "what is the price of ETH?"',
    ].join("\n"),
    installNote:
      "Run once without installing with npx @aomi-labs/client --help. Run aomi with no arguments for the interactive REPL, with slash commands like /app, /model and /key.",
    loopTitle: "The transaction loop",
    loopCode: [
      'aomi chat "Send 1 test USDC on Arc Testnet to 0xRecipient" --new-session --public-key 0xYourAddress --chain 5042002',
      "aomi tx list",
      "aomi tx simulate action-1",
      "aomi tx sign action-1 --eoa --private-key <key-you-hold>",
    ].join("\n"),
    loopNote:
      "The chat has to print an Action before simulate or sign. Use that id. The client docs use action-1. On Arc, 5042002 is testnet and 5042 is mainnet, and the sign command needs --eoa. A local private key is a different signer from a Circle agent wallet. Circle does not take an Aomi export. Its agent wallet sends with circle wallet transfer or circle wallet execute.",
    walletsTitle: "Wallets and keys",
    walletsCode: [
      "aomi wallet set 0xYourPrivateKey  # EVM, saved with file mode 0600 under ~/.aomi",
      "aomi wallet set --solana 5Kd3N...base58... --cluster devnet",
      "aomi wallet current",
      "aomi account login --wallet  # SIWE with the configured EVM key, no browser",
    ].join("\n"),
    walletsNote:
      "The key never leaves your machine because signing is local. To avoid persisting it, pass --private-key per command or set PRIVATE_KEY in the environment. A key stored here is a different signer from a Circle agent wallet. Circle agent wallets are not local keys, and aomi tx sign cannot use one. Leave the key that arc-canteen login prints in your terminal.",
    moreTitle: "Everything else",
    more: [
      { command: "aomi session list | new | resume <id> | log | status | close", what: "Local sessions. Reuse one to continue a conversation." },
      { command: "aomi model list | set <rig> | current", what: "Pick the model for the session." },
      { command: "aomi app list | current", what: "List Apps and their required secrets. Switch with --app <name> or AOMI_APP." },
      { command: "aomi chain list | set <id> | current", what: "Includes Arc mainnet 5042 and Arc Testnet 5042002, plus Ethereum, Base, Arbitrum, Optimism, Polygon, Linea, Monad, Robinhood Chain, MegaETH and their testnets. The alias arc is mainnet. This guide uses 5042002. The list printed by your installed aomi chain list is the one that applies." },
      { command: "aomi secret add NAME=value, list, clear", what: "Per-session secrets an App needs, sent as opaque handles. Combine with --new-session for a clean context." },
      { command: "aomi account whoami | links | link | logout", what: "Account and linked wallets." },
    ],
    envNote:
      "Flags all have an environment variable twin: AOMI_BACKEND_URL, AOMI_API_KEY, AOMI_APP, AOMI_MODEL, AOMI_CHAIN_ID, AOMI_PUBLIC_KEY, AOMI_STATE_DIR (default ~/.aomi), and AOMI_AA_MODE (4337 or 7702). Do not set AOMI_AA_MODE for Arc. Account abstraction is not available there.",
  },
  skills: {
    title: "Agent Skills",
    intro:
      "An Aomi Skill is a markdown file that teaches an AI coding assistant how to use Aomi. Nothing to compile. The agent reads the skill, learns the command surface and the operating procedure, and drives the aomi CLI on your machine. Skills follow the Agent Skills spec, so they work in Claude Code, Cursor, Codex CLI, Gemini CLI and any runtime that supports it.",
    table: [
      { skill: "aomi-transact", teaches: "Drive the CLI to read chain state and turn plain English into simulated, wallet-signed transactions." },
      { skill: "aomi-build", teaches: "Turn an OpenAPI spec, SDK or REST endpoint into an Aomi App crate." },
    ],
    installCode: [
      "npx skills add aomi-labs/skills  # both skills at once",
      "npm install -g @aomi-labs/client@latest  # aomi-transact needs the CLI and Node 18+",
      "aomi account login",
    ].join("\n"),
    installNote:
      "Then ask in plain English. The agent picks the skill from what you ask: transaction prompts route to aomi-transact, scaffolding prompts to aomi-build. For a swap it runs a fresh thread, aomi tx list, aomi tx simulate, then aomi tx sign only for the request you asked for.",
    safetyTitle: "The safety model, in the skill's own manifest",
    safety: [
      "Shell allowlist. Only aomi and npx @aomi-labs/client@latest may execute.",
      "Network allowlist. Outbound traffic is restricted to Aomi's API.",
      "File scope. Reads and writes limited to ~/.aomi/. Writes to agent identity files are denied.",
      "No blind signing. Multi-step flows go through aomi tx simulate before aomi tx sign, and the agent signs only a pending tx-N that aomi tx list has shown and you asked for.",
      "Opaque credentials. The skill never invents, derives or echoes a credential.",
    ],
    drainNote:
      "Drain vector guards run underneath: Aomi blocks calldata fields that can redirect funds when they do not match the signer, such as recipient on Uniswap, onBehalfOf on Aave, mintRecipient on CCTP and _to on OP Stack bridges. A batch that fails on one of these is the guard doing its job, and the skill surfaces the block to you instead of reformulating the prompt to get past it.",
  },
  mcp: {
    title: "MCP, the other door for coding agents",
    intro:
      "Skills run on your machine with your key. MCP connects the same agents to Aomi's server, where actions are staged and approved on a wallet surface. Aomi exposes two Model Context Protocol resources over Streamable HTTP, with OAuth.",
    resources: [
      { resource: "Agent MCP", use: "Start and resume conversations, watch progress, hand actions to a human.", prod: "https://chat.aomi.dev/v1/agent/mcp", staging: "https://chat-staging.aomi.dev/v1/agent/mcp" },
      { resource: "Pipeline MCP", use: "Discover Apps and tools, inspect schemas, call admitted operations directly.", prod: "https://chat.aomi.dev/v1/pipeline/mcp", staging: "https://chat-staging.aomi.dev/v1/pipeline/mcp" },
    ],
    connectTitle: "Connect Agent MCP",
    connectCode: [
      "# Claude Code",
      "claude mcp add --transport http aomi-agent https://chat.aomi.dev/v1/agent/mcp",
      "# then run /mcp, select aomi-agent, and authenticate in the browser",
      "",
      "# Codex",
      "codex mcp add aomi-agent --url https://chat.aomi.dev/v1/agent/mcp",
      "codex mcp login aomi-agent",
      "",
      "// Cursor, in the MCP servers config",
      '{ "mcpServers": { "aomi-agent": { "url": "https://chat.aomi.dev/v1/agent/mcp" } } }',
    ].join("\n"),
    connectNote:
      "After authorization, ask your client: Ask Aomi for my USDC balance on Base, then explain the result.",
    agentToolsTitle: "Agent MCP tools",
    agentTools: [
      { tool: "aomi_chat", what: "Start or continue an Agent turn." },
      { tool: "aomi_check", what: "Read new messages and activity using an opaque progress cursor." },
      { tool: "aomi_interrupt", what: "Stop the active turn in a session." },
      { tool: "aomi_list_sessions", what: "Find recent conversations owned by the authenticated account." },
    ],
    superviseTitle: "Supervising a turn",
    superviseBody:
      "Call aomi_chat, keep the cursor it returns, poll aomi_check while the status is processing, and when a response includes a pending action send the user to the portal or an authenticated CLI to approve it. Do not report transaction success until a later check returns the confirmed result.",
    pipelineTitle: "Pipeline MCP",
    pipelineCode: [
      "codex mcp add aomi-pipeline --url https://chat.aomi.dev/v1/pipeline/mcp",
      "codex mcp login aomi-pipeline",
    ].join("\n"),
    pipelineBody:
      "Broad to narrow: read Agent context if needed, list Apps and namespaces, list the tools in a namespace and inspect their schemas, then call one tool with validated arguments. Current tools: aomi_get_agent_context, aomi_list_apps, aomi_list_namespaces, aomi_list_tools, aomi_call_tool. The client's tool list response is the final authority.",
    authTitle: "Authentication",
    authBody:
      "The first unauthenticated request returns an OAuth challenge; your client uses PKCE and requests a token for the exact resource. Agent and Pipeline grants are separate, and signing authority is separate again: OAuth identifies the account, a linked wallet makes an address available, and every action still follows the wallet's review and signing policy. Private keys, seed phrases and reusable signatures never pass through MCP. Authorize only clients you trust.",
    symptomsTitle: "Symptom check",
    symptoms: [
      { symptom: "401 Unauthorized", check: "Complete OAuth for this exact MCP resource." },
      { symptom: "403 Forbidden", check: "Do not reuse an Agent token for Pipeline or the reverse." },
      { symptom: "Action stays pending", check: "Complete the review in the portal or CLI, then call aomi_check again." },
    ],
  },
  rust: {
    title: "Build an App with the Rust SDK",
    intro:
      "An App is a small Rust crate: aomi.toml, Cargo.toml and src/lib.rs, with Cargo.lock committed. You need a current Rust toolchain and git. The platform still has to build and activate it before it is live.",
    steps: [
      {
        title: "Install the toolchain",
        body: "Install the aomi-sdk crate from crates.io. The cli feature builds aomi-build. Add dev-runtime to also get aomi-run. There is no separate aomi-build package on crates.io or npm.",
        code: [
          "cargo install aomi-sdk --locked --features cli,dev-runtime",
          "aomi-build deploy --help  # there is no --version flag",
        ].join("\n"),
      },
      {
        title: "Create the folder",
        body: "The folder name is your slug. Use kebab case.",
        code: "mkdir hello-aomi && cd hello-aomi && mkdir src",
      },
      {
        title: "aomi.toml, who your App is and where it ships",
        code: [
          "[app]",
          'name         = "hello-aomi"',
          'display_name = "Hello Aomi"',
          'platform     = "community"',
          'git          = "https://github.com/you/hello-aomi"',
          "public       = true",
        ].join("\n"),
      },
      {
        title: "Cargo.toml, pin the SDK exactly",
        body: "The platform requires a specific aomi-sdk version and it moves often. Never copy a number from a doc. Run aomi-build sdk check for the live requirement, or aomi-build sdk fix to set it. Pin with a leading =, never ^.",
        code: [
          "[package]",
          'name = "hello-aomi"',
          'version = "0.1.0"',
          'edition = "2024"',
          "",
          "[lib]",
          'crate-type = ["cdylib"]',
          "",
          "[dependencies]",
          'aomi-sdk   = "=X.Y.Z"  # the version aomi-build sdk check reports',
          'schemars   = "1"',
          'serde      = { version = "1", features = ["derive"] }',
          'serde_json = "1"',
        ].join("\n"),
      },
      {
        title: "src/lib.rs, one tool and the macro that registers it",
        body: "The DESCRIPTION is what the model reads to decide when to call your tool, so write it as a trigger. namespaces = [] means the App asks for no host powers like wallet signing; declare namespaces when it needs them.",
        code: [
          "use aomi_sdk::schemars::JsonSchema;",
          "use aomi_sdk::*;",
          "use serde::Deserialize;",
          'use serde_json::{Value, json};',
          "",
          "#[derive(Clone, Default)]",
          "pub struct HelloApp;",
          "",
          "#[derive(Debug, Deserialize, JsonSchema)]",
          "pub struct GreetArgs {",
          "    /// The name of the person to greet.",
          "    pub name: String,",
          "}",
          "",
          "pub struct Greet;",
          "",
          "impl DynAomiTool for Greet {",
          "    type App = HelloApp;",
          "    type Args = GreetArgs;",
          '    const NAME: &\'static str = "greet";',
          "    const DESCRIPTION: &'static str =",
          '        "Use when the user wants a friendly greeting. Takes a name and returns a hello message.";',
          "",
          "    fn run(_app: &HelloApp, args: GreetArgs, _ctx: DynToolCallCtx) -> Result<Value, String> {",
          '        Ok(json!({ "message": format!("Hello, {}! Welcome to Aomi.", args.name) }))',
          "    }",
          "}",
          "",
          "const PREAMBLE: &str =",
          '    "When the user asks to be greeted, call the greet tool with their name.";',
          "",
          "dyn_aomi_app!(",
          "    app = HelloApp,",
          '    name = "hello-aomi",',
          '    version = "0.1.0",',
          "    preamble = PREAMBLE,",
          "    tools = [Greet,],",
          "    namespaces = []",
          ");",
        ].join("\n"),
      },
      {
        title: "Build, and try it locally",
        body: "aomi-run loads the compiled plugin and opens a REPL against a real model, so you can see which tools it picks before you ship. It needs a provider key, ANTHROPIC_API_KEY by default, or --provider openai or openrouter. Host namespaces are stubbed in the dev runtime; the real backend is not present.",
        code: [
          "cargo build --release",
          "aomi-run target/release/libhello_aomi.dylib  # .so on Linux, .dll on Windows",
          "aomi-run target/release/libhello_aomi.dylib --provider openai --model gpt-5 --env-file .env.local",
        ].join("\n"),
      },
      {
        title: "Commit and push",
        body: "Deploy works from a pushed commit. Local changes you did not push do not exist as far as the deploy is concerned.",
        code: [
          "printf '/target\\n/.aomi\\n' > .gitignore",
          'git init && git add aomi.toml Cargo.toml Cargo.lock src .gitignore && git commit -m "init hello-aomi"',
          "git push",
        ].join("\n"),
      },
      {
        title: "Connect the repo, once",
        body: "Installs the Aomi Build GitHub App on your repo and saves your activation token. GitHub sends you to a callback page that can look like a 404; the number at the end of its URL, /installations/<number>, is the installation id the CLI asks for.",
        code: "aomi-build connect --platform community --repo you/hello-aomi",
      },
      {
        title: "Deploy",
        body: "One command runs the whole lifecycle: sdk check, preflight, deploy run, wait for ready, activate, then verify loaded. It opens a PR on the platform repo, waits for the platform build, activates, and verifies the runtime loaded it. You are done when you see active=true artifact_ready=true loaded=true. Add --dry-run first to see the plan without deploying.",
        code: [
          "export AOMI_BACKEND_URL=https://api.aomi.dev",
          "export AOMI_APP_ACTIVATION_TOKEN=<your-token>",
          "aomi-build deploy --repo you/hello-aomi --target-tag prod",
          "aomi-build deploy status  # add --json for machines",
        ].join("\n"),
      },
      {
        title: "Ship an update",
        body: "Open chat.aomi.dev, find your App, and talk to it.",
        code: [
          "cargo test",
          'git add -A && git commit -m "Update" && git push',
          "aomi-build deploy --repo you/hello-aomi --target-tag prod",
        ].join("\n"),
      },
    ],
    gotchasTitle: "Three things that bite",
    gotchas: [
      "Tokens. An app token is scoped to one App. Activation onto prod is a platform-level action and needs a platform token. If you see app token is not authorized for platform-level actions, that is why. Ask the Aomi team in Discord.",
      "The SDK bump. When the platform raises the required aomi-sdk version, every release built against the old one stops loading and your App disappears from the picker with no error. The tell in aomi-build deploy status is artifact_ready=false and not loaded. Fix: aomi-build sdk fix, rebuild, commit, redeploy.",
      "Secrets. If your plugin calls an outside API, declare the key in code with Secret::new(\"NAME\", \"description\", required) and list it in the macro. Users supply the value through the Build platform's Environment tab or aomi secret add. Never put a literal token in aomi.toml.",
    ],
    designNote:
      "Design a focused tool surface: three to eight tools is a useful target. Keep read-only tools separate from tools that stage or submit actions.",
  },
  platform: {
    title: "The Build platform",
    intro:
      "build.aomi.dev is the hosted control plane for Aomi Apps. Everything aomi-build does has a web interface, and both drive the same backend, so a project connected from the terminal shows up in the browser and the other way round.",
    words: [
      { word: "Project", meaning: "A GitHub repository connected to Build." },
      { word: "App", meaning: "A deployable unit inside a project. One repo can ship several." },
      { word: "Deployment", meaning: "A published build of an App that can go live." },
      { word: "Environment", meaning: "The API keys and secrets configured for an App. Not billing." },
    ],
    steps: [
      { title: "Sign in with GitHub", body: "Use the account that owns the repositories you want to connect. The whole console is scoped to that identity." },
      { title: "Build from an idea, or from a template", body: "Build takes a plain English description (shortcuts: Arb bot, OpenAPI agent, Plan from idea; templates: Arbitrage Bot, OpenAPI Agent, Trading Agent), generates the plan and the files, compiles, smoke tests, then ships to Projects. Review the generated work and its test results before deploying. Or New app: install the Aomi Build GitHub App on your personal account, then Start from the template (forks aomi-labs/playground-example) or Import from GitHub." },
      { title: "Deploy and activate", body: "The wizard deploys the commit, waits for the platform build, and activates the release. If the App declares required secrets, activation is blocked until you set them. The last step opens your live App in chat.aomi.dev." },
      { title: "Operate", body: "Every project has five tabs: Home (status, environment, usage, monetization), Deployments (promote or deactivate per row), Providers, Environment, Chat. Redeploy from Linked Repository runs deploy, CI and activate against the repo's current head." },
    ],
    keysTitle: "Keys, the right way",
    keysBody:
      "Account, Providers stores your OpenAI, Anthropic and OpenRouter keys; they fund inference and can be assigned per project. Your App's own API credentials go in the project's Environment tab. Both are write-only: after you paste a value, only its prefix is ever shown again.",
    sdkUpgradeTitle: "SDK upgrades from the browser",
    sdkUpgradeBody:
      "When the platform bumps the required aomi-sdk, Build shows the version and offers a one-click upgrade: it opens a pull request on your repository (branch aomi/sdk-<version>) that rewrites the pin, waits for you to merge, then redeploys. The CLI equivalent is aomi-build sdk fix.",
    orgNote:
      "Organization-owned repositories are not yet supported on the web platform. Fork into your personal account, deploy from there, then transfer the repository back. The deployment stays live.",
  },
  widget: {
    title: "The widget, an App inside your React app",
    intro:
      "AomiWidget adds Aomi chat, threads, wallet connection and transaction approval to a React 18 or 19 application. Your app chooses the App (by numeric Application ID) and the wallet provider: a browser wallet, Para or Privy. Aomi resolves the App's tools and execution settings from the ID. The widget runs on your origin with an origin-bound session; there is no allowlist to register. Hosted integrations must use HTTPS; HTTP works only on localhost.",
    installTitle: "Install",
    installCode: "npm install @aomi-labs/widget-lib",
    envTitle: "Public configuration",
    envBody:
      "Safe to expose to the browser. Never put an App key, provider secret, paymaster or gas policy credential, treasury configuration, or private key in frontend code.",
    envCode: [
      "# Next.js (.env.local); Vite uses VITE_ instead of NEXT_PUBLIC_",
      "NEXT_PUBLIC_AOMI_API_URL=https://chat.aomi.dev",
      "NEXT_PUBLIC_AOMI_APPLICATION_ID=123",
      "# only if you use that provider",
      "NEXT_PUBLIC_PARA_API_KEY=your_public_para_api_key",
      "NEXT_PUBLIC_PRIVY_APP_ID=your_public_privy_app_id",
    ].join("\n"),
    mountTitle: "Mount it",
    mountBody:
      "Browser wallet mode authenticates an existing EVM or Solana wallet. For Para or Privy, also import @aomi-labs/widget-lib/providers/para or /providers/privy and pass auth={{ kind: \"embedded_wallet\", provider: \"para\", environment: \"PROD\" }}.",
    mountCode: [
      '"use client";',
      "",
      'import { AomiWidget } from "@aomi-labs/widget-lib";',
      'import "@aomi-labs/widget-lib/styles.css";',
      "",
      "export default function AssistantPage() {",
      "  return (",
      "    <AomiWidget",
      "      applicationId={process.env.NEXT_PUBLIC_AOMI_APPLICATION_ID!}",
      "      apiUrl={process.env.NEXT_PUBLIC_AOMI_API_URL!}",
      '      auth={{ kind: "browser_wallet" }}',
      '      height="calc(100dvh - 32px)"',
      "    />",
      "  );",
      "}",
    ].join("\n"),
    ownership:
      "Who owns what: your application owns the Application ID, the provider choice and the presentation. The widget owns sign-in, wallet connection, threads, chat, transaction review and signing requests. The user's wallet owns the signature. Switching providers changes how users sign in; it does not change which App handles the conversation.",
  },
  sdkApi: {
    title: "Client SDK and REST API",
    intro:
      "Two versioned HTTP resources cover the whole surface. /v1/agent owns conversation state: stateful turns, progress events, actions and sessions. /v1/pipeline is stateless: catalog discovery and the build, simulate, commit lifecycle. The TypeScript client wraps both.",
    tsTitle: "TypeScript",
    tsCode: [
      "npm install @aomi-labs/client",
      'export AOMI_BASE_URL="https://chat.aomi.dev"',
      "",
      "// example.ts, run with: npx tsx example.ts",
      'import { Aomi, type MessageEvent } from "@aomi-labs/client";',
      "",
      "const aomi = new Aomi({ baseUrl: process.env.AOMI_BASE_URL! });",
      "const sessionId = crypto.randomUUID();",
      'await aomi.agent.run("Remember that my demo color is cobalt.", { sessionId });',
      'const result = await aomi.agent.run("Reply with only my demo color.", { sessionId });',
      "console.log([...result.messages].reverse().find(m => m.sender === \"agent\")?.content);",
    ].join("\n"),
    tsNote:
      "Reusing sessionId continues the same conversation. No API key is needed to start: the SDK opens in guest mode and creates an anonymous session on the first request. Guest mode is for evaluation; use the OAuth device flow for account-owned sessions and protected actions. The Aomi facade gives you aomi.agent, aomi.pipeline, aomi.auth and aomi.raw (the wire-close AomiClient).",
    originMainNote:
      "The unified Aomi class is documented from origin/main. The latest published @aomi-labs/client on npm may not export it yet; verify the exported types before pinning, or use the prerelease provisioned for your environment.",
    httpTitle: "Raw HTTP",
    httpCode: [
      '-H "Authorization: Bearer $AOMI_ACCESS_TOKEN"',
      '-H "Idempotency-Key: <unique-per-mutation>"  # required on every mutation',
    ].join("\n"),
    httpNote:
      "Tokens are bound to an exact resource: an Agent token cannot call Pipeline, and REST tokens cannot call MCP. Send and receive JSON. Capture X-Request-Id from failed responses and respect Retry-After. The contract is served at /openapi.json, but pin types from the released TypeScript client rather than fetching it at startup. Interactive playgrounds for every endpoint: aomi.dev/docs/api-reference.",
  },
  telegram: {
    title: "Telegram bots on Aomi",
    intro:
      "A deployed App can become a Telegram bot without you running a server. Aomi hosts the bot. One bot can front one App or your whole catalog. Telegram is live today; Discord, Slack and iOS are coming. You need an App that is active and loaded (aomi-build deploy status confirms it) and a Telegram account. That is all.",
    steps: [
      { title: "Create the bot in Telegram", body: "Open @BotFather, send /newbot, give it a name and a username ending in bot. Copy the token it returns (it looks like 123456789:AAE...) and keep it private. If it ever leaks, /revoke and get a new one." },
      { title: "Register it on Aomi", body: "Go to build.aomi.dev/integrations, sign in with the GitHub account your Apps are deployed under, and in the Telegram section register a bot: an optional label, the token, the Apps it should serve, the primary App it opens with, and a thread mode (single, one running conversation per user, is simplest). Aomi verifies the token, stores it encrypted, and turns on the webhook. Nothing to deploy. Your App must be active to appear in the list." },
      { title: "Talk to it", body: "Open t.me/<your_bot_username>, send /start, and type. The bot is your App: it answers questions, reads live data, and walks a user through a transaction with simulate before sign. Add it to a group and people talk to it by mentioning it." },
    ],
    commandsTitle: "Commands your users get for free",
    commands: [
      { command: "/start", what: "Welcome menu and quick action buttons: Wallet, App, Model, Transactions, Threads, Network, Settings." },
      { command: "/wallet", what: "Connect or manage a wallet." },
      { command: "/model, /network, /settings, /sessions", what: "Model, chain, preferences, conversation threads." },
      { command: "/app", what: "Switch between the Apps attached to this bot." },
      { command: "/apikey", what: "Set an app key. Only needed for a private App; a public App needs no key." },
    ],
    examplesNote:
      "Bots you can look at. World Markets is an in-development Telegram asset manager for World Markets on MegaETH: it reads account and market state from the exchange contract, checks an investment mandate, and previews a trade without presenting it as executed, failing closed when it cannot prove the resulting portfolio state.",
  },
  security: {
    title: "Permissions and guards",
    intro:
      "Aomi treats a model's output as a proposal, never as authority. Composition is open. Signing is gated. A prompt, an App or a skill can request an action. None of them can grant themselves permission to sign, and the wallet's policy stays authoritative across chat, scheduled work and embedded surfaces.",
    actors: [
      { actor: "You", controls: "Wallet connections, signing policy, approvals, revocation", cannot: "Change policy without proving control of an authorized wallet" },
      { actor: "Model", controls: "The proposed intent and tool calls", cannot: "Set its own signing mode or produce a signature" },
      { actor: "App and skills", controls: "The tools available to the model and their constraints", cannot: "Override the wallet's policy" },
      { actor: "Aomi runtime", controls: "Policy evaluation and routing to the permitted signing path", cannot: "Use a self-custody key that stays in your wallet" },
      { actor: "Wallet or provider", controls: "The cryptographic signature", cannot: "Expand the transaction beyond what it is asked to sign" },
    ],
    controlsTitle: "Three independent controls",
    controls: [
      "Signing policy. What kind of approval one linked wallet requires: approve each request, permit an authorized automatic path, or block signing. Modes are denied, manual, client_auto, auto, changed only through a wallet-signed permit. A policy belongs to one wallet; linking another does not copy it.",
      "Signing capability. A policy that permits an automatic path still needs the wallet session or provider authorization to exist for that exact wallet. If not, Aomi stops rather than substituting another signer. Delegated auto signing exists only for embedded wallets (Privy, Para) under a revocable grant; self-custody wallets sign every request on the user's own device.",
      "Transaction constraints. Permission to sign does not make every transaction acceptable. Simulation, guards on chains, contracts, function selectors and approval spenders, per-call USD caps, and protocol checks on beneficiary and spender fields all run first.",
    ],
    simLimits:
      "Simulation passing is evidence about one payload against one view of chain state. It does not prove state will hold, that a contract is economically safe, or that the action is authorized. That is why the other controls exist. Read the permission model and transaction safety before you build an execution workflow.",
  },
  examples: {
    title: "Projects on Aomi",
    intro:
      "Each project keeps its own rules and uses Aomi for the loop, the simulation, or the signature. Use them as references, then build your own.",
    cases: [
      {
        name: "Somm Finance",
        body: "Actively managed DeFi strategies. Agentic Somm wraps Somm's five existing endpoints as typed tools, gives the agent its investment mandate in the system prompt, and renders the recommendation as a product-native card. Somm keeps its strategy, data and risk model. The same App serves the product frontend and Telegram. Aomi does not host a Discord bot.",
      },
      {
        name: "Kuroko",
        body: "An AI hybrid trading platform for prediction markets. Live Polymarket context in every message, market scoring, paper, testnet and live flows, stop-loss and take-profit guards. Uses the widget as its interface and @aomi-labs/client for trade intents. Unverified markets stay in simulation mode.",
      },
      {
        name: "aomi-trader",
        body: "A Hyperliquid trader that watches BTC-PERP, reads position and equity, and produces a LONG, SHORT, CLOSE or PASS decision each cycle. One session with @aomi-labs/client; the product owns risk threshold, size and cooldown. Proof that an Aomi product does not have to look like chat.",
      },
      {
        name: "World Markets",
        body: "In development. A Telegram asset manager on MegaETH that separates a product-specific mandate from the general pipeline: the App owns World Markets context and policy checks, Aomi supplies the loop, the channel, simulation and signing.",
      },
    ],
    // TODO: confirm these named production teams with eng before showing publicly.
    teams: ["Somm Finance", "Para", "Khalani", "Swig", "Molinar"],
    stats: "Aomi runs a simulate-first, non-custodial execution path on Arc mainnet (5042) and testnet (5042002), with a Commit Service that confirms settlement rather than trusting a transaction hash.",
  },
  help: {
    title: "If you get stuck",
    intro:
      "Reach out in Discord. Include your project, the chain you are on, the action you want to execute, and a repo or minimal reproduction if you are reporting a problem. Never include secrets.",
    links: [
      { label: "Discord (help, activation tokens)", href: "https://discord.gg/uk5ZAMuepJ" },
      { label: "Client CLI reference", href: "https://aomi.dev/docs/reference/client-cli" },
      { label: "Agent Skills", href: "https://aomi.dev/docs/guides/skills" },
      { label: "MCP", href: "https://aomi.dev/docs/guides/mcp" },
      { label: "Widget installation", href: "https://aomi.dev/docs/guides/widget/installation" },
      { label: "API reference", href: "https://aomi.dev/docs/api-reference/overview" },
      { label: "Permission model", href: "https://aomi.dev/docs/security/permission-model" },
      { label: "GitHub", href: "https://github.com/aomi-labs" },
    ],
  },
} as const;
