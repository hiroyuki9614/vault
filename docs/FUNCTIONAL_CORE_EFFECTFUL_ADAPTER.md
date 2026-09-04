---
public_artifact_id: 284b6d70-4bca-4bc2-a9e5-54115c7ae203
document_type: design
status: public_reference
---

# Functional Core / Effectful Adapter

## Purpose

判断ロジックと外部I/Oを分け、テスト容易性・再利用性・failure isolationを高めます。

基本形:

```text
explicit input + config
        ↓
pure decision / validation / transformation
        ↓
planned effect / domain result
        ↓
adapter
        ↓
external I/O
        ↓
read-back when needed
```

## Functional core

Pure coreは、入力から判断または変換結果を返します。

原則として直接扱わないもの:

- network
- database connection
- filesystem
- process execution
- environment variable lookup
- wall clock
- random source
- provider SDK
- deployment固有state

必要な値はcallerまたはadapterで取得し、coreへ明示入力として渡します。

### Example

```ts
type PublishDecision =
  | { kind: "publish"; normalizedPath: string }
  | { kind: "reject"; reason: string };

export function decidePublication(input: {
  path: string;
  containsSecret: boolean;
}): PublishDecision {
  if (input.containsSecret) {
    return { kind: "reject", reason: "secret_detected" };
  }

  const normalizedPath = input.path.trim();
  if (!normalizedPath) {
    return { kind: "reject", reason: "empty_path" };
  }

  return { kind: "publish", normalizedPath };
}
```

この関数はGitHub APIやSupabaseを知りません。

## Effectful adapter

Adapterは外部effectを所有します。

例:

- HTTP request
- Supabase/PostgreSQL access
- GitHub mutation
- filesystem write
- privileged host operation
- clock/random provider

Adapter側で扱う代表的なconcern:

```text
timeout
retry
idempotency
provider error mapping
optimistic concurrency
same-subject read-back
```

## Port boundary

Coreが外部情報を必要とする場合、provider実装ではなく意味的なPortへ依存させます。

```ts
interface DocumentReader {
  getById(id: string): Promise<DocumentSnapshot | null>;
}
```

次のような依存は避けます。

```ts
function decideSomething(client: SupabaseClient) { ... }
```

provider/client型がdomain判断へ漏れると、storage変更がdomain変更へ増幅しやすくなります。

## Configuration boundary

すべてをconfig化する必要はありません。

Coreへ明示入力する候補:

- runtimeで変わる値
- deployment/provider固有値
- clock/randomから得た値
- callerが選択するpolicy value

Core内部に残してよい候補:

- stable domain invariant
- protocol上固定された意味
- 変更すると別仕様になる定数

「hardcodeを避けるため」という理由だけでdomain invariantをenvironment variableへ追い出さないようにします。

## Read-back

mutationが成功したというtransport responseだけで完了扱いしない方がよい操作があります。

```text
plan
 -> mutate
 -> read same identity / same subject
 -> verify expected state
```

特に次ではread-backが有効です。

- optimistic concurrencyを使う更新
- remote repository mutation
- schema/data migration
- privileged host operation
- retryで二重実行が問題になる操作

## Error boundary

Coreはprovider固有errorをdomain errorへ変換された形で受け取るか、adapter実行前のpure validationだけを担当します。

```text
provider 429
provider timeout
provider-specific exception
        ↓ adapter
rate_limited / unavailable / retryable
        ↓ domain
meaningful outcome
```

provider error objectをそのままdomain contractへ返さないようにします。

## Testing strategy

Pure core:

- unit test中心
- network mock不要
- table-driven testと相性が良い

Adapter:

- integration test中心
- provider contract / timeout / retry / read-backを確認

End-to-end:

- representative happy pathと重要failure pathだけを確認

## When not to split

単純な1回限りのI/O wrapperまで無理にcore/adapterへ分割する必要はありません。

分離価値が高い兆候:

- meaningful decisionとI/Oが同じ関数に絡む
- testで大量のmockが必要
- provider変更でdomain logicまで変更される
- retryやtimeout処理がbusiness ruleへ混ざる
- clock/random/environmentで結果が不安定になる

## Minimal rule

```text
meaningful decisionをpureにできるか
 -> external effectを境界へ押し出す
 -> semantic Portで接続する
 -> effect後は必要な場合だけread-backする
```
