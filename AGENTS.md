# Public Vault Agent Rules

この repository は Supabase-first の公開 Vault Reference Implementation です。個人 Vault ではありません。Executable domain/runtime policy の主実装言語は TypeScript です。

## Bootstrap

通常は次だけを読む。

1. `core/machine/main/repository.json`
2. `core/machine/indexes/responsibilities.json`
3. task owner の `*/machine/contracts` と必要な `*/machine/core`
4. Supabase/schema boundary に触れる場合だけ `docs/ARCHITECTURE.md` と `supabase/README.md`
5. Skill が material な場合だけ `.agents/SKILLS_INDEX.md` から必要な Skill

SQL変更では既存 migration と semantic RPC contract を確認する。

全文走査、全Skill preload、追加review、追加gateを既定にしない。

## TypeScript runtime boundary

v3 と同じ responsibility-first / Functional Core + Effectful Adapter 方式を使う。

```text
<responsibility>/machine/contracts
  -> provider-free public contract

<responsibility>/machine/core
  -> pure TypeScript decision / validation / plan

<responsibility>/machine/ports
  -> semantic effect boundary

<responsibility>/machine/adapters
  -> provider / network / DB / filesystem effect

<responsibility>/machine/runtime
  -> composition / orchestration / read-back
```

`machine/core` では原則として次を直接扱わない。

- Supabase/provider SDK
- database connection
- network / `fetch`
- filesystem / process execution
- `process.env`
- wall clock / random
- deployment-specific state

必要な値は caller / runtime / adapter が明示入力として渡す。

Cross-responsibility caller は public contract / Port のみに依存し、foreign internalsへ到達しない。

## Documents responsibility

最初の executable Capability は `documents`。

- contract: `documents/machine/contracts/document.ts`
- pure policy: `documents/machine/core/document-policy.ts`
- Port: `documents/machine/ports/document-store.ts`
- Supabase adapter: `documents/machine/adapters/supabase-rpc-document-store.ts`
- composition/read-back: `documents/machine/runtime/document-service.ts`

Document mutationはcoreがeffect planを作り、adapterが実行し、runtimeがsame-subject read-backを検証する。

## Skill boundary

Public Skillは再利用可能なtask contract。Skillの存在や`effects` metadataはmutation権限を付与しない。

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

Skillはtaskへmaterialなものだけ使う。unknownを推測で埋めず、完了後に追加workflowやreview stackを自動生成しない。

## Canonical boundary

- mutable Vault data の唯一の canonical storage は Supabase PostgreSQL。
- executable domain policy は TypeScript core が所有する。
- Git Markdown / JSON は architecture / agent contract であり、ユーザーデータの canonical storage にしない。
- Supabase unavailable 時に GitHub へ data write fallback しない。
- document identity は `documents.id`。`path` は locator であり identity ではない。

## Supabase boundary

- Supabase Auth と RLS を必須とする。
-通常 client / Agent は semantic RPC (`get_document`, `put_document`, `delete_document`) を adapter 経由で使用する。
- service-role key を client、Prompt、repository に置かない。
- project URL / publishable key は deployment environment から注入する。
- schema change は新しい migration で行う。適用済み migration を書き換えない。
- provider row shape / error / RPC parameter名を core/public contract へ漏らさない。

## Public repository safety

禁止:

- 実在人物の個人情報・金融情報・顧客情報の保存
- token / password / API key / private key の保存
- Supabase service-role key の保存
- private/shared Vault からの自動同期
- synthetic example を実データのように見せること
- GitHub と Supabase の dual canonical

## Growth stopper

新しい universal ExecutionRunner、Control Plane、Work Context、Moving-Main stack、recovery stack、mandatory review stackを追加しない。

## Verification

TypeScript runtime変更では最低限:

```bash
npm run typecheck
npm run test:ts
```

architecture / repository boundaryを含む変更では:

```bash
python -m unittest tests/test_architecture_check.py
python tooling/architecture_check.py
```

状態変更は必要な範囲でsame-subject read-backする。acceptanceを満たしたら停止する。
