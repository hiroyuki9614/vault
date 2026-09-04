# Vault

Supabase を canonical data store にし、TypeScript の Functional Core / Effectful Adapter で構成する公開用 Vault Reference Implementation です。

この repository 自体には個人データ・業務データを保存しません。GitHub は TypeScript runtime source、設計contract、SQL migration、Agent Skill、architecture check の配布面です。mutable data の canonical storage は Supabase PostgreSQL です。

## Runtime architecture

Public Vault の実装本体は TypeScript です。

```text
Client / AI Agent
      |
      v
Document public contract
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

v3 と同じ responsibility-first の分割を使います。

```text
core/machine/
  main/repository.json
  indexes/responsibilities.json

documents/machine/
  contracts/   # provider-free public contract
  core/        # pure TypeScript policy
  ports/       # semantic effect boundary
  adapters/    # Supabase RPC mapping
  runtime/     # composition + read-back
```

### Functional rules

- `documents/machine/core` は pure function を基本とし、Supabase / env / filesystem / network を直接参照しません。
- provider 固有の row shape / error / RPC parameter は adapter が吸収します。
- core は immutable input から validation / decision / effect plan を返します。
- mutation は optimistic version check を使い、adapter 実行後に same-subject read-back を行います。
- Supabase unavailable 時に GitHub Markdown へ write fallback しません。

## Documents capability

現在の最初の executable Capability は `documents` です。

- [`documents/machine/contracts/document.ts`](documents/machine/contracts/document.ts) — provider-free command / snapshot contract
- [`documents/machine/core/document-policy.ts`](documents/machine/core/document-policy.ts) — create/update/delete plan と read-back判定
- [`documents/machine/ports/document-store.ts`](documents/machine/ports/document-store.ts) — semantic persistence Port
- [`documents/machine/adapters/supabase-rpc-document-store.ts`](documents/machine/adapters/supabase-rpc-document-store.ts) — `get_document / put_document / delete_document` RPC adapter
- [`documents/machine/runtime/document-service.ts`](documents/machine/runtime/document-service.ts) — effect composition と read-back enforcement

Supabase の physical table shape は public TypeScript contract にしません。

## Canonical boundaries

- mutable Vault data: Supabase PostgreSQL
- schema / RLS / RPC: Git migration history
- executable domain policy: TypeScript `*/machine/core`
- public capability contract: TypeScript `*/machine/contracts`
- architecture / Agent contract: Git Markdown / JSON
- credentials: deployment secret store

Document identity は UUID で固定し、`path` rename で identity を変えません。

## Public design contracts

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime / canonical / data boundary
- [`docs/RESPONSIBILITY_BOUNDARIES.md`](docs/RESPONSIBILITY_BOUNDARIES.md) — Responsibility / Capability / Port / dependency boundary
- [`docs/FUNCTIONAL_CORE_EFFECTFUL_ADAPTER.md`](docs/FUNCTIONAL_CORE_EFFECTFUL_ADAPTER.md) — pure decision logic と external I/O の分離
- [`docs/SKILL_DISTILLATION.md`](docs/SKILL_DISTILLATION.md) — Agent Skill を type / trait / 固有semanticへ蒸留するcontract

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

```bash
npm install
npm run check:ts
```

Supabase側は:

1. Supabase project を作成
2. Supabase CLI で project を link
3. `supabase/migrations/` を適用
4. application側で `SUPABASE_URL` と publishable/anon key を注入
5. Supabase Auth で認証
6. TypeScript runtime から Supabase RPC adapter を composition

## Validation

全体:

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
- public architecture contracts
- reusable public Agent Skills
- architecture regression checks

含まないもの:

- 個人 Vault の実データ
- shared/private Vault の mirror
- credential / secret
- GitHub data fallback
- VPS / scheduler / notification runtime
- generic Control Plane / Work Context / recovery machinery
