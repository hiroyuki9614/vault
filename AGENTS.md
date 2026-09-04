# Public Vault Agent Rules

This repository is a Supabase-first public Vault Reference Implementation. It is not a personal Vault.

Executable runtime policy is TypeScript and follows the same responsibility-first / Functional Core + Effectful Adapter boundary used by Personal Vault v3.

## Bootstrap

Read only what the task needs:

1. `core/machine/main/repository.json`
2. `core/machine/indexes/responsibilities.json`
3. task-owner public contract, normally `<capability>/public.ts`
4. `docs/ARCHITECTURE.md` when architecture/data boundary is material
5. `docs/ENTERPRISE_READINESS.md` when production/enterprise readiness is material
6. `docs/MEASUREMENT.md` when observability/Agent/Skill measurement is material
7. `.agents/SKILLS_INDEX.md` only when a listed Skill is materially useful

Do not preload all Skills or repository history.

## TypeScript runtime boundary

For executable capability work:

```text
public.ts
  -> machine/contracts
  -> machine/core
  -> machine/ports
  -> machine/adapters
  -> machine/runtime
```

Rules:

- `machine/core` owns pure validation/decision/transformation/verification.
- Core must not directly use Supabase, network, filesystem, process execution, env lookup, clock/random, or deployment state.
- `machine/ports` expose semantic effects and semantic errors.
- Provider SDK types, provider row types and provider error objects must not become public contracts.
- `machine/adapters` own provider-specific RPC/HTTP/table mapping and response validation.
- `machine/runtime` composes effects; do not move business policy back into runtime.
- Cross-responsibility callers use public contracts only.

## Documents completion contract

Document identity is `id`; `path` is a mutable locator.

Create/update completion:

```text
plan
 -> put effect
 -> validate mutation snapshot
 -> getById(same document id)
 -> verify exact expected state/version
 -> complete
```

Delete completion:

```text
delete effect
 -> returned id equals requested id
 -> getById(same document id)
 -> absent
 -> complete
```

Do not downgrade same-ID verification to path-only verification.

## Measurement boundary

Measurement is optional observability and must not become a hard prerequisite for Documents, Skills, or subject work.

```text
subject operation
  +-> subject result
  +-> optional measurement result
```

Rules:

- record terminal Agent/Skill/task snapshots through `measurement/public.ts`.
- caller supplies timestamps; core derives duration and does not read a clock.
- exact same-run replay may be idempotent; divergent same-ID replay fails as `measurement_conflict`.
- raw prompt text, user/model input-output bodies, employee identity and company-specific KPI schema do not belong in the public Measurement contract.
- `parentRunId` may describe lineage; Measurement does not launch or orchestrate subagents.
- measurement failure returns `not_recorded`; do not automatically convert it into subject failure.

## Error boundary

Supabase/provider errors are Adapter concerns.

Normal caller-visible store failures use semantic errors. Do not expose raw provider error objects/messages as the capability contract.

Retry policy belongs to the caller/composition layer. Do not put sleep/backoff/network retry in the pure core.

## Canonical boundary

- mutable Vault data -> Supabase PostgreSQL only
- executable domain policy -> TypeScript `*/machine/core`
- public API -> `<capability>/public.ts`
- schema/RLS/RPC -> versioned Git migrations
- architecture/Agent contract -> Git Markdown/JSON
- credentials -> deployment secret store only

Supabase outage must not cause a GitHub/local write fallback or second canonical.

## Supabase boundary

- Supabase Auth + RLS are mandatory.
- Normal runtime uses semantic RPCs.
- Service-role key is excluded from normal client/Agent contracts.
- Applied migrations are immutable; schema changes use a new migration.
- Optimistic concurrency is required for document update/delete.
- Same-document-ID read-back is required after document mutation.

## Build and dependency boundary

- Node.js 24 major line.
- npm 11 major line.
- Use committed `package-lock.json`.
- CI and normal clean verification use `npm ci`, not `npm install`.
- Direct development dependencies are exact versions.
- Dependency changes must pass typecheck, Vitest and architecture checks.
- Dependabot proposals do not bypass normal verification.

## Public repository safety

Never commit:

- personal/customer/employer data
- token/password/API key/private key
- Supabase service-role key
- production database credentials
- private/shared Vault state

Synthetic fixtures must not look like leaked real data.

See `SECURITY.md` for vulnerability reporting.

## Skill boundary

Public Skills are reusable task contracts. Their existence or `effects` metadata does not grant mutation authority.

### Project lifecycle

- `project-initialization`
- `requirements-interview`
- `change-impact-analysis`
- `technical-design-document`
- `deployment-diagnosis`

### Development flow

- `requirements-guard`
- `test-driven-development`
- `qa-quality-assurance`
- `secure-coding-guard`
- `git-safe-operations`

### Architecture boundary

- `dependency-boundary`
- `functional-decomposition`
- `configuration-boundary`

Use only material Skills. Do not create extra workflow/review stacks after acceptance is satisfied.

## Verification

Before completion, run the applicable checks. Repository-wide baseline:

```bash
npm ci
npm run check
```

CI is authoritative for the clean environment.

## Growth stoppers

Do not add by default:

- universal ExecutionRunner
- universal Work Context
- Moving-Main/reconciliation stack
- generic recovery broker
- mandatory review-of-review stack
- repository-wide provider registry without a concrete Capability need

Stop when the requested acceptance criteria are satisfied.
