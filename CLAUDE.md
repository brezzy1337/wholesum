# Wholesum — Orchestration Guide

Wholesum is a **modular-monolith MVP** on `create-t3-turbo`: a type-safe tRPC API, Drizzle schema,
Better Auth, and a shared UI kit feeding a Next.js web app and an Expo mobile app — deployed to AWS
via **SST v3 + OpenNext** (Lambda + CloudFront/S3, SQS worker, RDS Postgres). The tRPC routers *are*
the product modules. See the Architecture / Development notes for the full plan; this file teaches
the main session how to **delegate work across domains**.

> Source-of-truth deviations to remember: auth is **Better Auth** (not Cognito); the API deploys on
> **Lambda via OpenNext** (not App Runner); the async plan engine + affiliate-webhook processor run
> in a **worker** off SQS. These are intentional and override any contradicting note.

---

## Domains (non-overlapping globs)

Each domain owns a disjoint slice of the tree. A sub-agent is dispatched against **exactly one**
domain and must not edit files outside its glob.

| Domain | Glob | Package | Owns | Depends on |
|---|---|---|---|---|
| **db** | `packages/db/**` | `@acme/db` | Drizzle schema — users, plans, **conversion-dedup** table; client | — |
| **auth** | `packages/auth/**` | `@acme/auth` | Better Auth config, in-app on own Postgres | db |
| **validators** | `packages/validators/**` | `@acme/validators` | shared zod schemas | — |
| **api** | `packages/api/**` | `@acme/api` | tRPC v11 routers = modules (`profiles · plan · stores · orders` + affiliate webhook) | db, auth, validators |
| **ui** | `packages/ui/**` | `@acme/ui` | shadcn/ui + shared Sprout/Spruce Tailwind v4 / NativeWind v5 tokens | — |
| **web** | `apps/nextjs/**` | `@acme/nextjs` | Next.js 15 / React 19 / App Router | api, auth, ui, validators |
| **mobile** | `apps/expo/**` | `@acme/expo` | Expo SDK 54 / RN 0.81 / Expo Router | api, auth, ui, validators |
| **tooling** | `tooling/**` | eslint·prettier·tailwind·typescript·github | cross-cutting config (low-churn — change deliberately) | — |

### Anticipatory domains (not yet on disk)

These directories **do not exist yet** — they are created by the first `/code-todo` that builds
them. Route work to them by these globs when that time comes; do not pre-create empty dirs.

| Domain | Glob (placeholder) | Owns | Depends on |
|---|---|---|---|
| **worker** | `packages/worker/**` | SQS Lambda: Bedrock/Claude plan engine + **exactly-once** affiliate-webhook processor (dedup table keyed by event id) | api, db |
| **infra** | `infra/**` (`sst.config.ts`) | SST v3 + OpenNext: Lambda, CloudFront/S3, SQS, RDS — IaC for the whole env | wraps all |
| **integration** | `packages/integrations-instacart/**` | Instacart IDP client: `get_nearby_retailers`, products link, affiliate webhook | db |

---

## Dependency chain (drives routing order)

```
validators ─┐
db ──► auth ─┼─► api ──► { web, mobile, worker }
ui ─────────┘
infra deploys everything
```

- A domain may only be implemented **after** the domains it depends on are in place.
- `db` is the root: schema changes ripple to `auth`, `api`, then the apps and worker.
- `ui` and `validators` are leaves with no internal deps — safe to build early or in parallel.

---

## Routing rules

**Conservative-sequential by default.** When a change spans a dependency edge, do the upstream
domain first, let it settle (types compile), then the downstream one. Don't parallelize across a
`──►` edge.

**Parallelize only across independent leaf domains.** Safe concurrent pairs: `ui` + `db`,
`validators` + `ui`, `tooling` + any single feature domain. Never run two agents whose globs could
touch the same file, and never run `api` concurrently with `db` when the change alters schema.

**One domain per sub-agent.** If a task naturally splits across domains, split it into one brief per
domain and sequence them by the chain above — do not hand a single agent two globs.

**Background vs foreground.** Run long, non-blocking checks (full `pnpm build`, `typecheck` across
the graph) in the background while you draft the next brief. Keep anything whose output you need to
make the next decision in the foreground.

### Four-part invocation protocol

Every sub-agent dispatch states, explicitly:

1. **Domain + glob** — the single area it owns and may edit (e.g. "`api` → `packages/api/**` only").
2. **Goal + acceptance** — what to build and how we'll know it's done (the tRPC procedure exists,
   `pnpm -F @acme/api typecheck` passes).
3. **Context** — upstream contracts it must honor (the Drizzle types from `db`, the zod schema from
   `validators`), and what it must NOT touch.
4. **Verification** — the exact command(s) to run before reporting back (see below).

---

## Verification commands (this repo)

There is **no `test` task** in the template yet — verification today is types + lint + build. Scope
each to the package under change with `-F`:

```bash
pnpm -F @acme/<pkg> typecheck      # tsc for one package
pnpm -F @acme/<pkg> lint           # eslint for one package
pnpm typecheck                     # whole graph (background-friendly)
pnpm build                         # full turbo build
pnpm db:push                       # push Drizzle schema (db domain; interactive)
pnpm auth:generate                 # regenerate Better Auth schema after auth changes
```

When a domain adds a real test runner, add its `test` task to `turbo.json` and update this block.

---

## Guardrails

- **Stay in your glob.** A sub-agent editing outside its domain is a routing error — stop and re-split.
- **Respect the chain.** No downstream change lands before its upstream types compile.
- **No commits from sub-agents.** Implementers edit and verify; the central thread (and the human)
  decide what gets committed. `/ship` owns PRs and merges.
- **`tooling/**` is load-bearing.** Lint/TS/Tailwind config changes affect every package — treat as
  a deliberate, reviewed change, never a drive-by.
- **Schema is a contract.** Any `packages/db` change that alters columns must be paired with the
  `auth`/`api` updates that consume them, sequenced after `db`.

---

## Dependency safety

The supply chain is part of the threat model (we already dodged one: the npm `create-t3-turbo`
initializer is a **third-party** package — we scaffolded from the official `t3-oss/create-t3-turbo`
GitHub template via `degit` instead).

- **Lockfile is committed.** `pnpm-lock.yaml` is the source of truth — never delete it to "fix"
  resolution; regenerate intentionally and review the diff.
- **Build scripts are allowlisted.** `pnpm-workspace.yaml › onlyBuiltDependencies` lists the *only*
  packages permitted to run install/build scripts (`@tailwindcss/oxide`, `esbuild`). Adding to that
  list is a security decision — route it through `dependency-auditor`.
- **Release-age cooldown (policy).** Do not adopt a brand-new release the day it ships. Prefer
  versions aged ≥ a few days (catches yanked/compromised publishes). *Not yet enforced in config* —
  add `minimumReleaseAge` to pnpm settings (`.npmrc` / `pnpm-workspace.yaml`) to make it mechanical.
- **New or upgraded deps go through `dependency-auditor` first** — a GO/NO-GO gate before install.
- **Pin deliberately.** The repo uses pnpm **catalogs** for shared versions; bump a catalog entry
  once, in review, rather than scattering version ranges.

---

## Specialist agents (`.claude/agents/`)

| Agent | Role | Access |
|---|---|---|
| **reviewer** | Read-only review of the working diff (correctness, boundaries, contracts) | read-only |
| **dependency-auditor** | GO/NO-GO gate for any new or upgraded dependency | read-only + registry lookups |
| **test-runner** | Runs `lint` / `typecheck` / `build` (and tests when present) and reports | pnpm-scoped Bash, read-only edits |

All three are **least-privilege** — none may edit code. Implementers (which *do* edit) are dispatched
ad hoc per domain by the workflows below, not defined as persistent agents.

---

## Workflows

The implement → review → ship chain is wired through the devkit:

- **`/claude-t3-devkit:code-todo`** — implement a feature/change via domain-routed sub-agents
  (following the domains + chain above), then post the diff to Slack for human review, then hand the
  approved branch to `/ship`.
- **`/claude-t3-devkit:ship`** — open a PR, run the multi-lens review panel, notify Slack, with
  approval gates before opening and before merging.

Start a change with `/claude-t3-devkit:code-todo`; let it route. Don't hand-edit across domains when
a routed implementer is the right tool.

---

## Feature implementation (/code-todo)

`/code-todo` is the implement-and-review front end to shipping. It reuses this file's **Domains**
table (to route a change to the right agent) and **invocation protocol** (to brief each agent), and
it ends by handing an approved branch to `/ship`. It does **not** open PRs, push, or merge — that's
`/ship`'s job.

The central thread owns the chain (sub-agents cannot spawn sub-agents):

1. **Read** the change request.
2. **Route** to domain(s) per the Domains table — one `implementer` per non-overlapping domain in
   parallel; dependent domains (per the chain `db → auth → api → {web, mobile, worker}`) in
   sequence, each step's output handed to the next. When unsure, sequential.
3. **Implement** via `implementer` sub-agent(s) with the full four-part brief. Route any new or
   bumped dependency through `dependency-auditor` first; stop on a NO-GO.
4. **Gate.** Commit to a `feat/<slug>` branch, then post the diff summary to **`#proj-wholesum`**
   via `slack-notifier` and wait for human approval **in the terminal**. Slack gives visibility
   into the diff; approval comes back in the session — the run does **not** poll Slack.
5. **Hand off.** On approval, invoke `/claude-t3-devkit:ship` on the branch.

**Verification gate** (per slice; there is no `test` task yet — types + lint + build):

```bash
pnpm -F @acme/<pkg> typecheck
pnpm -F @acme/<pkg> lint
pnpm build            # cross-cutting changes (db, validators, tooling)
```

**Boundaries that keep the two halves clean:**
- The gate is not optional. Do not open a PR, push, or hand off before approval.
- Implementers edit only their domain's globs. A slice that needs to cross a boundary is a routing
  decision for the central thread, not a widening the implementer does on its own.
- Only the central thread commits; implementers edit and verify.
- For a single-domain change, dispatch one implementer — don't over-spawn.

**State** lives on the branch (the work + commit message) and the Slack thread, not the session, so
an interrupted run resumes from the branch.
