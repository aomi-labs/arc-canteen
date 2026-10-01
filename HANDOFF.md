# Arc-Canteen Handoff — pick up from here

> For Cursor (or any coding agent) continuing work on this site.
> Read this file, `README.md`, `content/site.ts`, and `content/build.ts` before changing anything.

## 1. What this is

A standalone Next.js (App Router) static builder-resource site for the **Tameion hackathon on Arc**, built for Aomi Labs ecosystem work (owner: Gordian). Intended production domain: **`arc-canteen.aomi.dev`** (DNS/Vercel not connected yet).

Its job: an Arc builder lands, understands what is worth building for the five Tameion RFBs, and gets one Portal-based Arc Testnet flow plus a full Aomi developer reference — so this site is the devs' source of truth, not just a landing page.

## 2. Run it

```bash
cd /Users/gordianetim/Downloads/aomi-labs/arc-canteen
pnpm install --frozen-lockfile
npm run dev -- --port 3006        # preview at http://127.0.0.1:3006/
npm run typecheck && npm run build # must pass before any commit
```

- Package manager: **pnpm 10.32.1** (`packageManager` field is pinned; `pnpm-lock.yaml` exists).
- Node v24.8.0, npm 11.6.0 on this machine. Next.js **16.1.0**, React 19.2.7, Tailwind **4.1.18**, TypeScript 5.9.3 — all pinned to versions present in the local pnpm store (the registry once resolved a bogus `@swc/helpers@0.5.23`; do not float these versions without testing install).
- A dev server is usually already running on port **3006**. If CSS looks stale after edits, restart it (Turbopack HMR has served stale stylesheets before — this bit us once on the primary CTA fill).
- Git: local repo initialized on `main`, **nothing committed yet** (`git status` shows all files untracked). Do not push anywhere without Gordian's say-so; no remote is configured.

## 3. Routes (all static, all must stay 200)

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Hero, problem, execution model, Why Aomi, 5 RFBs, recipes, examples |
| `/quickstart` | `app/quickstart/page.tsx` | 8-step Arc Testnet Portal walkthrough + prompt builder |
| `/recipes` | `app/recipes/page.tsx` | Recipe index (3 items) |
| `/recipes/agentic-payment` | `app/recipes/[slug]/page.tsx` | Worked USDC payment guide |
| `/recipes/stablefx` | (same) | StableFX integration direction (credential-gated) |
| `/recipes/safe-execution` | (same) | Guarded-execution build direction |
| `/build` | `app/build/page.tsx` | Full developer reference (CLI, Skills, MCP, Rust SDK, platform, widget, SDK/API, Telegram, security, examples) |

`generateStaticParams` covers the three recipe slugs. Do not add routes without updating nav/footer if they should be reachable.

## 4. Content sources (edit copy here, not in JSX)

- **`content/site.ts`** — nav, event info, home copy, the 5 RFBs, quickstart steps, the 3 recipes, footer. Exported `Recipe` type lives here.
- **`content/build.ts`** — everything on `/build`: intro, plugin-vs-App note, 6 benefits, six-doors table, CLI, Skills, MCP, Rust SDK (10 steps incl. full `lib.rs`), Build platform, widget, TS SDK/REST, Telegram, security tables, examples, help links.
- Page components in `app/` render from these objects with minimal inline strings (only UI chrome like "Go first", "Take it further").

## 5. Design system (Aomi brand, do not regress this)

- **Theme:** Aomi brand from `aomi-labs/design`, not the old orange paper theme. Cool white `#ffffff`, ink `#09090b`, sky accent `#5288c2` for links, focus, and status rules. Pink `#df5d90` is one decorative mark (the event dot), not a fill. The execution chapter and the footer are ink, not blue.
- **Type:** display `PT Serif` 700; body `Geist`; code `Geist Mono`; the wordmark `aomi` is `Source Serif 4` 600. Eyebrows are quiet sans small-caps in zinc, not a colored shout.
- **Buttons are pills** (`border-radius: 999px`): `.button-primary` and `.header-action` are ink with white type; `.button-outline` is an ink border; `.button-light` is white on the ink footer. No lift/translate on hover anywhere.
- **Rules:** flat fills only — no gradients, glows, glass/blur, shadows, or peach washes. No arrow glyphs (`→ ↗ ↓ ✓ ←`; separators are `·`). Cards are square panels with a 1px ink border. Code samples are ink blocks with square corners.
- **Layout language:** hero = centered headline + CTAs + one bordered product panel; sections separate by space, not rules. No underlines on links, no vertical bars beside copy, no hairline under every row. Links are sky. Why Aomi and the project examples are row lists. The five RFBs are stacked cards with a 1px ink border. `/build` opens with the six doors as a linked reference table.
- All styling lives in **`app/globals.css`** (custom classes; Tailwind is installed but barely used — follow the existing class convention, don't introduce utility-class layouts that fight it).
- New classes added for reference content: `.ref-table` / `.ref-row` / `.ref-left` (mono) / `.ref-right`, responsive stacking under 700px. `.recipe-collection` grid rule must stay (recipes index depends on it).

## 6. Interactive pieces (don't break behavior)

- `components/prompt-builder.tsx` (client component): recipient + amount inputs, EVM address + 6-decimal validation, copy-to-clipboard only when valid. Used on `/quickstart`.
- `components/recipe-card.tsx`: whole-card link, no arrows.
- `components/site-shell.tsx`: `SiteHeader` (sticky, desktop + mobile nav from `site.nav`), `SiteFooter`, `ExternalLink` (always `target=_blank rel=noopener`).

## 7. Hard boundaries (product claims — do not soften these)

- The quickstart is labeled **"End-to-end Portal verification pending"** — nobody with a funded test wallet has run the Portal flow end to end yet. Do not present it as verified.
- StableFX requires a Circle TEST/live API credential at call time; there is no key-free mode. Source lives on the `aomi-sdk` **`publish`** branch (app v0.2.1, SDK 5.1.1), NOT on `main`.
- Arc: mainnet chain ID `5042`, testnet `5042002`; backend alias `arc` = mainnet. Arc AA simulation explicitly unsupported. Mainnet Task purchases disabled in committed config.
- Simulation ≠ safety; a tx hash ≠ settlement. These caveats are load-bearing copy — keep them.
- Never claim: AA-on-Arc, Task API GA, StableFX-without-a-key, BlockRun as a new integration (it's already the preferred inference provider), `stewardfx` repo as a shipped product (illustrative only), `liqsteward` as signing/broadcasting.
- Dated stats ("As of July 2026: 1,734 accounts…") keep their date. SDK version numbers move — never hardcode a version; always say "run `aomi-build sdk check`".
- TRUST404 event specifics (Demo Day schedule, venue, Drift Hunter, Hoodit roadmap) were deliberately excluded as non-evergreen. Don't re-add them.

## 8. Source material this was built from

- `ARC-CANTEEN-BUILD-BRIEF.md` (repo root's parent dir `/Users/gordianetim/Downloads/aomi-labs/`) — ground-truth brief: team quotes, Tameion facts, capability boundaries.
- `AOMI-ORG-SYNC-2026-09-28.md` — org-wide code audit backing the capability claims.
- Aomi developer handbook (TRUST404 Demo Day edition, PDF pasted in chat) — source of all `/build` content; sections 01–13 + examples + help links migrated, event items dropped.
- Official Tameion site: registration `https://luma.com/ivroypr5`, submission `https://forms.gle/BBWrdfuircrKiG2i6`, five RFB framings.
- Visual reference: base44.com + /base-code (layout/typography/row patterns only — no copied assets, no copied copy).
- Aomi mark `public/aomi-mark.svg` copied from the Aomi Labs landing asset.

## 9. Verification status (last full pass: all green)

- `npm run typecheck` + `npm run build`: pass (9 static routes).
- Playwright (Chrome, from the `aomi` repo's install): all routes 200 at 320/390/768/1440, zero horizontal overflow, zero page errors; prompt-builder validation + clipboard verified; computed-style checks confirmed PT Serif headlines, 999px pill buttons, ink primary fill (current Aomi brand).
- Screenshots live in `/var/folders/11/1qftqlp528g_22ntjb5jzx2w0000gn/T/opencode/` (e.g. `final-*.png`, `build-desktop.png`).

## 10. Still open (do these before calling it done/shipped)

1. **Live Portal run**: funded test wallet → run the 8-step quickstart for real → confirm simulation, signing, Commit Service status, ArcScan receipt → flip the "verification pending" label.
2. **StableFX credential**: confirm Circle TEST key availability before calling that recipe runnable.
3. **Office-hours link**: wire only when Canteen publishes it.
4. **Deploy**: create `aomi-labs/arc-canteen` repo, Vercel project, point `arc-canteen.aomi.dev`; first commit is still unmade.
5. Re-verify install from scratch if versions are floated (`pnpm install --frozen-lockfile` must stay green).
