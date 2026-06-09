---
description: Implement a feature/change via domain-routed sub-agents, review the diff on Slack, then hand the approved branch to /ship
argument-hint: [feature or change to implement]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(git switch:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*), Bash(git merge-base:*), Read, Grep, Glob
---

# Code-todo

Context (gathered for you):
- Branch: !`git branch --show-current`
- Status: !`git status --short`

Implement the change described in $ARGUMENTS. You (the central thread) own the chain — sub-agents
cannot spawn sub-agents — so you route the work, brief each agent fully, manage all git state, and
do the handoff yourself.

1. **Read the request.** Treat $ARGUMENTS (and any linked issue or `@file`) as the change to make.
   If the scope is unclear, ask me before routing — an implementer starts with a fresh context and
   can't ask follow-ups.

2. **Determine the domain(s).** Match the change against the **Domains** table in CLAUDE.md (the
   subagent-orchestration baseline). For wholesum that's: `db` (`packages/db/**`), `auth`
   (`packages/auth/**`), `validators` (`packages/validators/**`), `api` (`packages/api/**`), `ui`
   (`packages/ui/**`), `web` (`apps/nextjs/**`), `mobile` (`apps/expo/**`), `tooling` (`tooling/**`),
   plus the anticipatory `worker` (`packages/worker/**`), `infra` (`infra/**`), and `integration`
   (`packages/integrations-instacart/**`). One domain → one implementer. Multiple non-overlapping
   domains → implementers in parallel. **Respect the dependency chain** (`db → auth → api →
   {web, mobile, worker}`; `validators`/`ui` feed downstream; `infra` deploys all): dependent
   domains run as a **sequential chain you drive**, handing each step's output to the next. When
   unsure, go sequential. If a change touches an anticipatory domain, you are creating that
   directory for the first time — say so.

3. **Prepare the branch.** Create or switch to a feature branch named `feat/<slug>` (e.g.
   `feat/plan-router`). Implementers edit on it; only you commit.

4. **Dispatch implementer(s).** For each slice, invoke the `implementer` sub-agent with the
   baseline's four-part brief — **context · instructions · exact file references · success
   criteria** — and name the domain's globs plus the verification commands:
   - `pnpm -F @acme/<pkg> typecheck`
   - `pnpm -F @acme/<pkg> lint`
   - whole-graph `pnpm typecheck` / `pnpm build` for cross-cutting changes (`db`, `validators`,
     `tooling`). There is **no `test` task yet** — types + lint + build is the gate.

   If a slice needs a new or bumped dependency, route it through the `dependency-auditor` sub-agent
   first and **stop on a NO-GO** (it enforces wholesum's supply-chain policy: provenance,
   release-age cooldown, the `onlyBuiltDependencies` allowlist, catalog pinning). Stop on red: if
   implementation or the verification gate fails and can't be fixed, halt and report.

5. **Commit, then review on Slack — GATE.** Once the slices are in and the gate is green, commit
   the work to the branch. Run `git diff` against the base, summarize what changed (by area), and
   delegate to `slack-notifier` to post the summary + branch name to **`#proj-wholesum`** for
   review. Then STOP and wait for my explicit "yes" here in the terminal. Slack is where I *read*
   the diff; I approve back in this session — do **not** poll Slack for a reply or reaction. Keep
   the post short (summary + branch + "approve in terminal"); never paste the full diff or secrets.
   If I request changes, re-brief the implementer, update the branch, and re-post.

6. **Hand off to /ship.** Only after I approve: run `/claude-t3-devkit:ship` on this branch. `/ship`
   owns PR creation, the multi-lens review panel, the merge gate, and PR notifications — do **NOT**
   open a PR, push, or merge here (those tools are intentionally absent from this command). If
   `/ship` isn't available, stop and tell me the branch is ready to open a PR by hand.

Never work around the review gate, a red step, or a dependency NO-GO to move faster. If something
blocks, stop and tell me with the reason.
