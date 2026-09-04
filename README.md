# Vault

Supabase を canonical data store にし、TypeScript の Functional Core / Effectful Adapter で構成する公開用 Vault Reference Implementation です。

この repository 自体には個人データ・業務データを保存しません。GitHub は TypeScript runtime source、設計 contract、SQL migration、Agent Skill、検証コードの配布面です。mutable data の canonical storage は Supabase PostgreSQL です。

## Runtime architecture

Library / direct composition:

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

Apache production runtime:

```text
HTTPS client
    |
    v
Apache HTTP Server :443
 TLS / body limit / proxy timeout
    |
    v
127.0.0.1:3100
Node.js 24 HTTP adapter
    |
    v
DocumentService
    |
    v
Supabase REST/RPC
 caller Bearer JWT + publishable/anon key
    |
    v
Supabase Auth + RLS + PostgreSQL
```

Apache を public listener とし、Node は既定で loopback のみに bind します。通常runtimeは Supabase service-role key を使いません。`/v1/*` の Bearer token を Apache → Node → Supabase Auth/RLS 境界へ伝播します。

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

server/
  config.ts                    # explicit runtime config parser
  http-app.ts                  # bounded HTTP adapter
  supabase-http-rpc-client.ts  # bearer-scoped Supabase transport
  main.ts                      # process lifecycle / graceful shutdown
```

### Functional rules

- `documents/machine/core` は pure function を基本とし、Supabase / env / filesystem / network を直接参照しません。
- provider 固有の row shape / error / RPC parameter は adapter が吸収します。
- core は immutable input から validation / decision / effect plan を返します。
- mutation は optimistic version check を使い、成功応答だけでは完了にしません。
- create/update/delete は stable document ID を使って same-subject read-back します。
- create は caller-generated UUID を必須にし、同一 create の再送で重複 row を作りません。
- update も同一 `expectedVersion`・同一最終状態の再送を同じ commit 結果として扱います。
- document write RPC は mutation/replay reconciliation 前に owner/editor を明示検証し、viewer/non-member は `permission_denied` で拒否します。
- Apache/HTTP/環境変数/process lifecycle は effectful deployment boundary として pure core から分離します。
- Supabase unavailable 時に GitHub Markdown へ write fallback しません。

## Enterprise engineering baseline

Repository-level baseline として次を強制します。

- strict TypeScript
- provider-free public API
- semantic provider error mapping
- optimistic concurrency
- same-document-ID read-back
- idempotent create / exact update replay
- explicit writer authorization before replay reconciliation
- versioned SQL migrations
- executable PostgreSQL migration + RLS/RPC acceptance with synthetic identities
- exact direct development dependencies
- committed npm lockfile + `npm ci`
- production TypeScript emit + built-entrypoint smoke
- loopback-only Node bind by default for Apache deployments
- bounded HTTP body / header / request / upstream / shutdown timeouts
- Bearer-scoped Supabase RPC; no normal-runtime service-role credential
- graceful SIGTERM/SIGINT shutdown
- Apache reverse-proxy reference configuration
- `apachectl configtest` and live Apache → Node CI smoke
- hardened systemd reference unit
- bounded CI execution
- GitHub Actions commit SHA pinning
- CodeQL for JavaScript/TypeScript and Python
- OSV-Scannerによる committed `package-lock.json` の脆弱性検査
- known vulnerability を検出した dependency scan の fail-closed
- Dependabot for npm / GitHub Actions
- CODEOWNERS for security-critical boundaries
- Security reporting policy
- architecture regression checks

Production導入前チェックは [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md)、Apache配置は [`docs/APACHE_DEPLOYMENT.md`](docs/APACHE_DEPLOYMENT.md)、Repository管理設定は [`docs/REPOSITORY_GOVERNANCE.md`](docs/REPOSITORY_GOVERNANCE.md)、security automation は [`docs/SECURITY_AUTOMATION.md`](docs/SECURITY_AUTOMATION.md) を参照してください。

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
  first commit      -> A/version N+1
  exact replay      -> same A/version N+1
  divergent replay  -> version_conflict
```

retry timer / backoff は core の責務ではなく caller が所有します。

### Write authorization

RLS に加えて `put_document` / `delete_document` は semantic vault role を先に検証します。

```text
owner/editor -> write/reconcile
viewer       -> permission_denied
non-member   -> permission_denied
anon         -> RPC execute不可
```

これにより、viewer が現在stateを読めることを利用して exact-replay 判定から write 成功相当の結果を得る経路を防ぎます。

## Apache HTTP surface

health endpoint は無認証です。

```text
GET /health/live
GET /health/ready
```

Document API は Bearer token 必須です。

```text
POST /v1/documents/get-by-path
POST /v1/documents/get-by-id
POST /v1/documents/put
POST /v1/documents/delete
```

これは generic Supabase proxy ではありません。公開するのは named Document Capability のみです。

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

HTTP adapter も provider message を返さず、上記semantic failureと `read_back_mismatch` 等の境界codeへ変換します。`unavailable` は HTTP 503 となり、実際の retry/reconciliation policy は caller が所有します。

## Canonical boundaries

- mutable Vault data: Supabase PostgreSQL
- schema / RLS / RPC: Git migration history
- executable domain policy: TypeScript `*/machine/core`
- public capability API: TypeScript `<capability>/public.ts`
- provider-free detailed contract: TypeScript `*/machine/contracts` / `*/machine/ports`
- HTTP/Apache/systemd: deployment/effect boundary
- architecture / Agent contract: Git Markdown / JSON
- credentials: deployment secret store

## Executable database contract

`.github/workflows/database-contract.yml` では、GitHub-hosted Ubuntu 24.04 の PostgreSQL に対して、synthetic fixtureのみを使い次を実行します。

```text
synthetic auth bootstrap
  -> all supabase/migrations/*.sql with ON_ERROR_STOP
  -> document RLS/RPC acceptance
```

検証対象は owner/editor/viewer/authenticated outsider/anon、create/update replay、idempotency/path/version conflict、owner-only membership、delete read-back です。

これはchecked-in SQLの実行証拠であり、本番Supabase projectのAuth設定・backup・monitoring・quota等を代替しません。

## Public design contracts

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime / canonical / data boundary
- [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md) — enterprise engineering baseline / deployment checklist / non-claims
- [`docs/APACHE_DEPLOYMENT.md`](docs/APACHE_DEPLOYMENT.md) — Apache + systemd production topology
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

### Skill lifecycle / observability

- [`skill-creation`](.agents/skills/skill-creation/SKILL.md)
- [`skill-measurement`](.agents/skills/skill-measurement/SKILL.md)

## Quick start

Node.js 24 / npm 11 を使用します。

```bash
npm ci
npm run check
npm run build
```

Apache upstreamとして起動する場合:

```bash
cp .env.example /etc/vault/vault.env
# 実値はsecret/configuration管理経由で設定する
npm start
```

本番ではshellで直接常駐させず、[`deploy/systemd/vault.service.example`](deploy/systemd/vault.service.example) を基準にsystemd管理し、[`deploy/apache/vault.conf.example`](deploy/apache/vault.conf.example) をApacheへ配置します。詳細は [`docs/APACHE_DEPLOYMENT.md`](docs/APACHE_DEPLOYMENT.md) を参照してください。

Supabase 側は:

1. environment ごとに Supabase project を分離
2. Supabase CLI で対象 project を link
3. `supabase/migrations/` を順番に適用
4. application 側で `SUPABASE_URL` と publishable/anon key を注入
5. Supabase Auth で認証
6. Apache/HTTP利用時は呼出側の Bearer access token を `/v1/*` へ付与

## Validation

```bash
npm run check
```

TypeScript/runtime:

```bash
npm run typecheck
npm run test:ts
npm run build
```

Architecture boundary:

```bash
python -m unittest tests/test_architecture_check.py
python tooling/architecture_check.py
```

GitHub Actions ではさらに built runtime smoke、Apache `configtest` + live proxy smoke、`database-contract`、`codeql`、`dependency-vulnerability-scan` を実行します。

## Repository scope

含むもの:

- TypeScript Functional Core / Port / Adapter reference runtime
- loopback Node.js HTTP runtime for Apache
- Apache reverse-proxy + systemd deployment references
- Supabase schema / RLS / semantic RPC migrations
- stable provider-free document API
- executable PostgreSQL migration/RLS/RPC acceptance
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
- DNS / certificate issuance / host firewall management
- VPS / scheduler / notification runtime
- generic Control Plane / Work Context / recovery machinery

## External reuse licensing

Engineering 上の企業利用 baseline とは別に、第三者が商用再利用できる明示的な LICENSE は repository owner が意図的に選ぶ必要があります。法的・事業上の判断なので、この自動化では license を勝手に追加しません。
