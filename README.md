# Vault

Supabase を正本にする、公開用 Vault Reference Implementation です。

この repository 自体には個人データ・業務データを保存しません。GitHub は設計、SQL migration、Agent contract、template、architecture check の配布面です。実データの canonical storage は Supabase PostgreSQL です。

## Architecture

```text
Client / AI Agent
      |
      v
 semantic operation
      |
      v
Supabase Auth + RLS
      |
      v
public.get_document / put_document / delete_document
      |
      v
public.documents  <- canonical data
```

原則:

- Supabase は必須依存です。利用不能時に GitHub Markdown を第二正本として書き始めません。
- GitHub repository に実ユーザーの document body、credential、token、個人情報を保存しません。
- document identity は UUID で固定し、path rename で identity を変えません。
- write は optimistic version check を行い、成功後に同じ document identity を read-back します。
- Agent / client の通常 read/write は semantic RPC を使用します。table schema を public contract にしません。
- migration / policy / architecture を増やす前に、既存境界で解決できるか確認します。

## Public design contracts

このReference Implementationで再利用できる設計契約:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Supabase-first Vault全体のcanonical / data boundary
- [`docs/RESPONSIBILITY_BOUNDARIES.md`](docs/RESPONSIBILITY_BOUNDARIES.md) — Responsibility / Capability / Port / dependency boundary
- [`docs/FUNCTIONAL_CORE_EFFECTFUL_ADAPTER.md`](docs/FUNCTIONAL_CORE_EFFECTFUL_ADAPTER.md) — pure decision logicと外部I/Oの分離
- [`docs/SKILL_DISTILLATION.md`](docs/SKILL_DISTILLATION.md) — Agent Skillをtype / trait /固有semanticへ蒸留するcontract

## Public Agent Skills

AI開発で再利用できるSkillです。入口は [`.agents/SKILLS_INDEX.md`](.agents/SKILLS_INDEX.md) です。

### Development flow

- [`requirements-guard`](.agents/skills/requirements-guard/SKILL.md) — current requirement / canonical / implementation / testsの整合
- [`test-driven-development`](.agents/skills/test-driven-development/SKILL.md) — valid Red → minimal Green → Refactor → fresh verification
- [`qa-quality-assurance`](.agents/skills/qa-quality-assurance/SKILL.md) — user/business riskからtest conditionと優先度を設計
- [`secure-coding-guard`](.agents/skills/secure-coding-guard/SKILL.md) — tool-based checksとsemantic security reviewを組み合わせる
- [`git-safe-operations`](.agents/skills/git-safe-operations/SKILL.md) — unrelated changesを保持してtargeted write/read-backする

### Architecture boundary

- [`dependency-boundary`](.agents/skills/dependency-boundary/SKILL.md) — semantic ownership、public/private境界、dependency directionを分類
- [`functional-decomposition`](.agents/skills/functional-decomposition/SKILL.md) — meaningful decisionとexternal effectを分離すべきか判定
- [`configuration-boundary`](.agents/skills/configuration-boundary/SKILL.md) — domain/config/provider/secret/derived valueのownershipを8分類

Skillは必要なtaskでだけ読み、Skill利用自体を目的にしません。

## Quick start

1. Supabase project を作成します。
2. Supabase CLI で project を link します。
3. `supabase/migrations/` を適用します。
4. client には `SUPABASE_URL` と publishable/anon key を設定します。
5. user を Supabase Auth で認証し、最初の `vaults` row を作成します。
6. document 操作は `get_document`, `put_document`, `delete_document` RPC を使用します。

詳細は `docs/ARCHITECTURE.md` と `supabase/README.md` を参照してください。

## Repository scope

含むもの:

- Supabase schema / RLS / RPC migrations
- public architecture contract
- reusable public Agent Skills
- AI Agent rules
- synthetic templates / examples
- architecture regression check

含まないもの:

- 個人 Vault の実データ
- shared/private Vault の mirror
- credential / secret
- VPS / scheduler / notification runtime
- generic Control Plane / Work Context / recovery machinery

## Validation

```bash
python -m unittest tests/test_architecture_check.py
python tooling/architecture_check.py
```
