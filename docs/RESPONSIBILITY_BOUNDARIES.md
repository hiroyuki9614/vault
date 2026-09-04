---
public_artifact_id: 405dfc01-1e7a-4b52-ae42-5849996eb6ac
document_type: design
status: public_reference
---

# Responsibility Boundaries

## Purpose

機能を増やす前に、まず「誰が何を所有するか」を固定します。

この文書は特定のフレームワークやディレクトリ構成を強制するものではありません。目的は、変更理由・状態・外部effect・failure domainが異なる責務を不用意に密結合させないことです。

## Responsibility-first model

```text
responsibility
  -> boundary
  -> owner
  -> public contract
  -> implementation
```

ディレクトリやclassを先に作ってから責務を割り当てるのではなく、責務から物理構造を導出します。

## Capability boundary

1つのCapabilityは、少なくとも次を区別できるようにします。

```text
responsibility
public contract
pure decision logic
required ports
external effects
```

必要な場合の代表的な構成:

```text
capabilities/<name>/
  public/
  core/
  ports/
  adapters/
```

これは例であり、空directoryや将来用moduleを先に作る必要はありません。

## Public / private rule

外部callerはCapabilityのpublic contractだけを使用します。

```text
Caller -> Capability A public contract       OK
A      -> Capability B public/port contract OK
A      -> Capability B internal/core        NG
A      -> Capability B adapter              NG
```

特に次をforeign public contractへ漏らさないようにします。

- DB tableのphysical shape
- provider SDK object
- filesystem path
- deployment固有ID
- foreign Capabilityのinternal type

## Dependency direction

依存は実際に必要なものだけを明示します。

原則:

- foreign internal accessをしない
- optional helperをhard dependencyにしない
- dependency cycleを作らない
- instrumentationやmeasurementをsubjectの生存条件にしない
- caller側でcompositionできるものを中央Orchestratorへ集約しない

```text
composition root
   +--> Capability A
   +--> Capability B
   +--> optional Measurement
```

## Constructor boundary

Constructor / factoryは構造的不変条件だけを確認します。

確認してよいもの:

- required portが供給されている
- config shapeが有効
- domain invariantを満たす

確認しないもの:

- 外部サービスが今healthyか
- DBやHTTPが応答するか
- remote filesystemの現在状態
- deploymentのcurrent revision

live I/Oは明示operationまたはhealth checkが所有します。

## Storage ownership

DBを利用する場合も、tableをarchitecture ownerにしません。

```text
Domain caller
  -> semantic operation
  -> Capability-owned Port
  -> persistence adapter
  -> physical storage
```

異なるCapabilityが同じphysical table/RPCへ直接依存し始めた場合は、責務境界を再確認します。

## Change test

変更時は次を確認します。

1. この変更理由を所有するCapabilityはどこか。
2. foreign internalへ直接到達していないか。
3. 新しいhard dependencyは本当に必須か。
4. 同じ意味変更で複数ownerを手動同期する必要がないか。
5. failureが別責務へ不必要に伝播しないか。

## Anti-patterns

```text
god capability
global service locator
foreign internal import
shared mutable state without owner
DB table as cross-domain API
provider type in domain contract
optional observability as hard dependency
central orchestrator that knows every domain detail
```

## Minimal rule

迷った場合は、新しい層を増やす前に次の順で考えます。

```text
existing ownerで表現できるか
 -> public contractを小さくできるか
 -> dependencyをcaller側compositionへ戻せるか
 -> merge / replace / deleteできるか
 -> それでも不足する場合だけ新しいboundary
```
