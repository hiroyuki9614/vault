# Vault

Supabase を canonical data store にし、TypeScript の Functional Core / Effectful Adapter で構成する公開用 Vault Reference Implementation です。

この repository 自体には個人データ・業務データを保存しません。GitHub は TypeScript runtime source、設計 contract、SQL migration、Agent Skill、検証コードの配布面です。mutable data の canonical storage は Supabase PostgreSQL です。

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
- create は caller-generated UUID を必須にし、同一 create の再送で重複 row を作りません。
- update も同一 `expectedVersion`・同一最終状態の再送を同じ commit 結果として扱います。
- Supabase unavailable 時に GitHub Markdown へ write fallback しません。

## Enterprise engineering baseline

Repository-level baseline として次を強制します。

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
- OSV-Scannerによる committed `package-lock.json` の脆弱性検査
- known vulnerability を検出した dependency scan の fail-closed
- Dependabot for npm / GitHub Actions
- CODEOWNERS for security-critical boundaries
- Security reporting policy
- architecture regression checks

Production導入前チェックは [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md)、Repository管理設定は [`docs/REPOSITORY_GOVERNANCE.md`](docs/REPOSITORY_GOVERNANCE.md)、security automation は [`docs/SECURITY_AUTOMATION.md`](docs/SECURITY_AUTOMATION.md) を参照してください。

これは SOC 2 / ISO 27001 等の認証、SLA、managed backup を意味しません。Production organization 側の責務は別途明示しています。

## Documents Capability

- [`documents/public.ts`](documents/public.ts) — provider-free stable entry surface
- [`documents/machine/contracts/document.ts`](documents/machine/contracts/document.ts) — command / snapshot / validation contract
- [`documents/machine/core/document-policy.ts`](documents/machine/core/document-policy.ts) — validation / effect plan / mutation-read-back predicate
- [`documents/machine/ports/document-store.ts`](documents/machine/ports/document-store.ts) — semantic persistence + failure Port
- [`documents/machine/adapters/supabase-rpc-document-store.ts`](documents/machine/adapters/supabase-rpc-document-store.ts) — semantic RPC adapter
- [`documents/machine/runtime/document-service.ts`](documents/machine/runtime/document-service.ts) — effect composition と same-ID completion enforcement

Supabase adapter は現在:

```text
get_document
get_document_by_id
put_document
delete_document
```

を使用します。`path` は mutable locator、`id` は stable identity です。

### Retry-safe create

Create command は呼出側で UUID を生成します。

```ts
{
  kind: 'create',
  id: '<stable-document-uuid>',
  vaultId: '<vault-uuid>',
  path: 'notes/example.md'
}
```

通信結果が不明な場合に同じ `id` と同じ内容で再送すると、既に commit 済みなら version `1` の同じ document を返します。同じ ID で内容が異なる場合は `idempotency_conflict`、同じ path を別 ID で取得しようとした場合は `path_conflict` で fail closed します。

### Retry-safe update

```text
update(id=A, expected=N, state=Y)
  first commit     -> A/version N+1
  exact replay     -> same A/version N+1
  divergent replay -> version_conflict
```

retry timer / backoff は core の責務ではなく caller が所有します。

## Stable failure contract

Supabase/provider error object を上位へそのまま返しません。Port 境界で次の semantic code へ変換します。

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

`unavailable` は transport/infrastructure 上 retry 可能な分類です。実際の retry/reconciliation policy は caller が所有し、core 自身は sleep/retry を行いません。

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

Node.js 24 / npm 11 を使用します。

```bash
npm ci
npm run check:ts
```

Supabase 側は:

1. environment ごとに Supabase project を分離
2. Supabase CLI で対象 project を link
3. `supabase/migrations/` を順番に適用
4. application 側で `SUPABASE_URL` と publishable/anon key を注入
5. Supabase Auth で認証
6. TypeScript runtime から Supabase RPC adapter を composition

## Validation

```bash
npm run check
```

TypeScript のみ:

```bash
npm run typecheck
npm run test:ts
```

Architecture boundary のみ:

```bash
python -m unittest tests/test_architecture_check.py
python tooling/architecture_check.py
```

GitHub Actions ではさらに `codeql` と `dependency-vulnerability-scan` を実行します。

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

Engineering 上の企業利用 baseline とは別に、第三者が商用再利用できる明示的な LICENSE は repository owner が意図的に選ぶ必要があります。法的・事業上の判断なので、この自動化では license を勝手に追加しません。
