# Vault

Supabase を canonical data store にし、TypeScript の Functional Core / Effectful Adapter で構成する公開用 Vault Reference Implementation です。

この repository 自体には個人データ・業務データを保存しません。GitHub は TypeScript runtime source、設計contract、SQL migration、Agent Skill、architecture check の配布面です。mutable data の canonical storage は Supabase PostgreSQL です。

## Runtime architecture

```text
Client / AI Agent
      |
      v
documents/public.ts
      |
      v
pure TypeScript core
  validate / decide / plan
      |
      v
semantic DocumentStore port
      |
      v
Supabase RPC adapter
      |
      v
Supabase Auth + RLS + PostgreSQL
      |
      v
canonical Vault data
```

```text
core/machine/
  main/repository.json
  indexes/responsibilities.json

documents/
  public.ts    # provider-free public API
  machine/
    contracts/
    core/      # pure TypeScript policy
    ports/     # semantic effect / error boundary
    adapters/  # Supabase RPC mapping
    runtime/   # composition + same-ID read-back
```

### Functional rules

- `documents/machine/core` は pure function を基本とし、Supabase / env / filesystem / network を直接参照しません。
- provider 固有の row shape / error / RPC parameter は adapter が吸収します。
- core は immutable input から validation / decision / effect plan を返します。
- mutation は optimistic version check を使い、成功応答だけでは完了にしません。
- create/update/delete は stable document ID を使って same-subject read-back します。
- createはcaller-generated UUIDを必須にし、同一createの再送で重複rowを作りません。
- updateも同一`expectedVersion`・同一最終状態の再送を同じcommit結果として扱います。
- Supabase unavailable 時に GitHub Markdown へ write fallback しません。

## Enterprise engineering baseline

Repository-level baselineとして次を強制します。

- strict TypeScript
- provider-free public API
- semantic provider error mapping
- optimistic concurrency
- same-document-ID read-back
- idempotent create / exact update replay
- versioned SQL migrations
- exact direct development dependencies
- committed npm lockfile + `npm ci`
- bounded CI execution
- GitHub Actions commit SHA pinning
- CodeQL for JavaScript/TypeScript and Python
- locked dependency audit with `npm audit --audit-level=high`
- Dependabot for npm / GitHub Actions
- CODEOWNERS for security-critical boundaries
- Security reporting policy
- architecture regression checks

詳細とProduction導入前チェックは [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md) を参照してください。Repository管理設定は [`docs/REPOSITORY_GOVERNANCE.md`](docs/REPOSITORY_GOVERNANCE.md)、security automationは [`docs/SECURITY_AUTOMATION.md`](docs/SECURITY_AUTOMATION.md) を参照してください。

これはSOC 2 / ISO 27001等の認証、SLA、managed backupを意味しません。Production organization側の責務も同文書で分離しています。

## Documents Capability

- [`documents/public.ts`](documents/public.ts) — provider-free stable entry surface
- [`documents/machine/contracts/document.ts`](documents/machine/contracts/document.ts) — command / snapshot / validation contract
- [`documents/machine/core/document-policy.ts`](documents/machine/core/document-policy.ts) — validation / effect plan / mutation-read-back predicate
- [`documents/machine/ports/document-store.ts`](documents/machine/ports/document-store.ts) — semantic persistence + failure Port
- [`documents/machine/adapters/supabase-rpc-document-store.ts`](documents/machine/adapters/supabase-rpc-document-store.ts) — semantic RPC adapter
- [`documents/machine/runtime/document-service.ts`](documents/machine/runtime/document-service.ts) — effect composition と same-ID completion enforcement

Supabase adapterは現在:

```text
get_document
get_document_by_id
put_document
delete_document
```

を使用します。`path` はmutable locator、`id` はstable identityです。

### Retry-safe create

Create commandは呼出側でUUIDを生成します。

```ts
{
  kind: 'create',
  id: '<stable-document-uuid>',
  vaultId: '<vault-uuid>',
  path: 'notes/example.md'
}
```

通信結果が不明な場合に同じ`id`と同じ内容で再送すると、既にcommit済みならversion `1`の同じdocumentを返します。同じIDで内容が異なる場合は`idempotency_conflict`、同じpathを別IDで取得しようとした場合は`path_conflict`でfail closedします。

## Stable failure contract

Supabase/provider error objectを上位へそのまま返しません。Port境界で次のsemantic codeへ変換します。

```text
not_found
version_conflict
idempotency_conflict
path_conflict
permission_denied
unauthenticated
invalid_request
unavailable
invalid_response
unknown
```

`unavailable`はtransport/infrastructure上retry可能な分類です。実際のretry/reconciliation policyはcallerが所有し、core自身はsleep/retryを行いません。

## Canonical boundaries

- mutable Vault data: Supabase PostgreSQL
- schema / RLS / RPC: Git migration history
- executable domain policy: TypeScript `*/machine/core`
- public capability API: TypeScript `<capability>/public.ts`
- provider-free detailed contract: TypeScript `*/machine/contracts` / `*/machine/ports`
- architecture / Agent contract: Git Markdown / JSON
- credentials: deployment secret store

## Public design contracts

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime / canonical / data boundary
- [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md) — enterprise engineering baseline / deployment checklist / non-claims
- [`docs/REPOSITORY_GOVERNANCE.md`](docs/REPOSITORY_GOVERNANCE.md) — GitHub source/admin governance boundary
- [`docs/SECURITY_AUTOMATION.md`](docs/SECURITY_AUTOMATION.md) — source-controlled security checks / GitHub graph enhancement boundary
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting / deployment security boundary
- [`docs/RESPONSIBILITY_BOUNDARIES.md`](docs/RESPONSIBILITY_BOUNDARIES.md) — Responsibility / Capability / Port / dependency boundary
- [`docs/FUNCTIONAL_CORE_EFFECTFUL_ADAPTER.md`](docs/FUNCTIONAL_CORE_EFFECTFUL_ADAPTER.md) — pure decision logic と external I/O の分離
- [`docs/SKILL_DISTILLATION.md`](docs/SKILL_DISTILLATION.md) — Agent Skill distillation contract

## Public Agent Skills

入口は [`.agents/SKILLS_INDEX.md`](.agents/SKILLS_INDEX.md) です。必要な Skill だけを読みます。

### Project lifecycle

- [`project-initialization`](.agents/skills/project-initialization/SKILL.md)
- [`requirements-interview`](.agents/skills/requirements-interview/SKILL.md)
- [`change-impact-analysis`](.agents/skills/change-impact-analysis/SKILL.md)
- [`technical-design-document`](.agents/skills/technical-design-document/SKILL.md)
- [`deployment-diagnosis`](.agents/skills/deployment-diagnosis/SKILL.md)

### Development flow

- [`requirements-guard`](.agents/skills/requirements-guard/SKILL.md)
- [`test-driven-development`](.agents/skills/test-driven-development/SKILL.md)
- [`qa-quality-assurance`](.agents/skills/qa-quality-assurance/SKILL.md)
- [`secure-coding-guard`](.agents/skills/secure-coding-guard/SKILL.md)
- [`git-safe-operations`](.agents/skills/git-safe-operations/SKILL.md)

### Architecture boundary

- [`dependency-boundary`](.agents/skills/dependency-boundary/SKILL.md)
- [`functional-decomposition`](.agents/skills/functional-decomposition/SKILL.md)
- [`configuration-boundary`](.agents/skills/configuration-boundary/SKILL.md)

## Quick start

Node.js 24 / npm 11を使用します。

```bash
npm ci
npm run check:ts
```

Supabase側は:

1. environmentごとにSupabase projectを分離
2. Supabase CLIで対象projectをlink
3. `supabase/migrations/`を順番に適用
4. application側で`SUPABASE_URL`とpublishable/anon keyを注入
5. Supabase Authで認証
6. TypeScript runtimeからSupabase RPC adapterをcomposition

## Validation

```bash
npm run check
```

TypeScriptのみ:

```bash
npm run typecheck
npm run test:ts
```

Architecture boundaryのみ:

```bash
python -m unittest tests/test_architecture_check.py
python tooling/architecture_check.py
```

## Repository scope

含むもの:

- TypeScript Functional Core / Port / Adapter reference runtime
- Supabase schema / RLS / semantic RPC migrations
- stable provider-free document API
- enterprise resilience/security baseline checks
- public architecture contracts
- reusable public Agent Skills

含まないもの:

- 個人 Vault の実データ
- shared/private Vault の mirror
- credential / secret
- GitHub data fallback
- managed backup / monitoring / SLA
- compliance certification
- VPS / scheduler / notification runtime
- generic Control Plane / Work Context / recovery machinery

## External reuse licensing

Engineering上の企業利用baselineとは別に、第三者が商用再利用できる明示的なLICENSEはrepository ownerが意図的に選ぶ必要があります。法的・事業上の判断なので、この自動化ではlicenseを勝手に追加しません。
